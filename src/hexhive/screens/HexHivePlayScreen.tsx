// src/hexhive/screens/HexHivePlayScreen.tsx
// Core gameplay screen — used by both the daily puzzle and Quick Play mode.
// Owns the current guess, found-word set, scoring, achievement checks, and
// persistence for whichever mode it's given.
//
// Quick Play gets a 60-second timer (a fast-burst mode with no streak);
// Daily stays untimed and persistent, matching the reference game. Both the
// Quick Play "Time's Up!" summary and the Daily "Full Clear!" celebration are
// centered modal overlays on top of the (locked or still-playable) board,
// mirroring Wordle's WordleResultOverlay layout: brand → title/subtitle → a
// boxed highlight (rank, standing in for Wordle's "Solution" box) → stat-pill
// sections → button row → share button → dismiss button.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, Share, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lightbulb, Share2, X } from 'lucide-react-native';
import { useTheme } from '../../shared/ThemeContext';
import { HapticManager } from '../../shared/HapticManager';
import { recordRejectedWord } from '../../shared/wordReports';
import { AchievementPopup } from '../../shared/AchievementPopup';
import { WordReportPrompt } from '../../shared/WordReportPrompt';
import { maybeRequestReview } from '../../shared/reviewPrompt';
import { syncDailyReminder, maybeFlagReminderOptIn } from '../../shared/dailyReminders';
import HexGrid, { type Feedback } from '../components/HexGrid';
import WordList from '../components/WordList';
import RankProgressBar from '../components/RankProgressBar';
import type { HexHivePuzzle } from '../data/puzzles';
import { getPuzzleSolution, shuffleLetters, getTodayDateString, formatDisplayDate } from '../utils/generator';
import { checkGuess } from '../utils/validator';
import { getRankProgress, scoreWordForPuzzle, getEffectiveMaxScore, RANKS } from '../utils/scoring';
import {
  bumpStreakForToday,
  bumpFullClearStreakForToday,
  loadHexHiveStats,
  saveHexHiveStats,
  saveDailyProgress,
  saveDailyHistoryEntry,
  saveQuickPlayProgress,
  clearQuickPlayProgress,
  type HexHiveStats,
} from '../utils/storage';
import {
  checkWordAchievements,
  checkProgressAchievements,
  checkPracticeRoundAchievements,
  type Achievement,
} from '../utils/achievements';

const ACCENT = '#D4A017'; // Hex Hive's own accent — warm honey gold, distinct from other games
const QUICK_PLAY_SECONDS = 60;

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface HexHivePlayScreenProps {
  puzzle: HexHivePuzzle;
  mode: 'daily' | 'practice';
  initialFoundWords?: string[];
  initialTimeLeft?: number; // practice-only: restore timer from a previous session
  onGoHome: () => void;
  onPlayAgain?: () => void; // practice-only
}

const StatPill = ({
  label,
  value,
  textColor,
  borderColor,
  backgroundColor,
}: {
  label: string;
  value: string;
  textColor: string;
  borderColor: string;
  backgroundColor: string;
}) => (
  <View style={[styles.statPill, { borderColor, backgroundColor }]}>
    <Text style={[styles.statPillLabel, { color: textColor }]}>{label}</Text>
    <Text style={[styles.statPillValue, { color: textColor }]}>{value}</Text>
  </View>
);

const PrimaryButton = ({
  label,
  onPress,
  borderColor,
  textColor,
  backgroundColor,
}: {
  label: string;
  onPress?: () => void;
  borderColor: string;
  textColor: string;
  backgroundColor: string;
}) => (
  <Pressable
    style={({ pressed }) => [styles.primaryButton, { borderColor, backgroundColor, opacity: pressed ? 0.75 : 1 }]}
    onPress={onPress}
  >
    <Text style={[styles.primaryButtonText, { color: textColor }]}>{label}</Text>
  </Pressable>
);

export default function HexHivePlayScreen({ puzzle, mode, initialFoundWords, initialTimeLeft, onGoHome, onPlayAgain }: HexHivePlayScreenProps) {
  const { background } = useTheme();
  const insets = useSafeAreaInsets();
  const solution = useMemo(() => getPuzzleSolution(puzzle), [puzzle]);
  // The rank ladder (and the win condition) is computed against this
  // rescaled target, not solution.maxScore directly — see getEffectiveMaxScore.
  const targetScore = useMemo(() => getEffectiveMaxScore(solution.maxScore), [solution]);

  const [foundWords, setFoundWords] = useState<string[]>(initialFoundWords ?? []);
  const foundSet = useMemo(() => new Set(foundWords), [foundWords]);
  const [outerLetters, setOuterLetters] = useState<string[]>(() =>
    shuffleLetters(puzzle.letters.filter((l) => l !== puzzle.center))
  );
  const [currentGuess, setCurrentGuess] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [achievementQueue, setAchievementQueue] = useState<Achievement[]>([]);
  const statsRef = useRef<HexHiveStats | null>(null);

  // Quick Play only: 60-second countdown, no timer at all for Daily.
  const [timeLeft, setTimeLeft] = useState(initialTimeLeft ?? QUICK_PLAY_SECONDS);
  const [gameOver, setGameOver] = useState(false);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [finalStats, setFinalStats] = useState<HexHiveStats | null>(null);

  // Daily only: one-time "Solved!" celebration the moment the player's score
  // crosses the win threshold (see scoring.ts) — reaching it truly ends the
  // round for today, so this can only fire once per day.
  const [showWinCelebration, setShowWinCelebration] = useState(false);

  // Daily only: true once the player has won today, either just now or from
  // a previous session earlier today (derived from persisted foundWords).
  // While true, no further guesses are accepted — matching Wordle's
  // solve-it-once-and-you're-done daily lock, rather than letting players
  // keep grinding past the win.
  const [dailyWon, setDailyWon] = useState<boolean>(() => {
    if (mode !== 'daily' || !initialFoundWords || initialFoundWords.length === 0) return false;
    const sol = getPuzzleSolution(puzzle);
    const initialScore = initialFoundWords.reduce(
      (sum, w) => sum + scoreWordForPuzzle(w, sol.pangrams.includes(w)),
      0
    );
    return getRankProgress(initialScore, getEffectiveMaxScore(sol.maxScore)).isMaxRank;
  });

  useEffect(() => {
    loadHexHiveStats().then((s) => {
      statsRef.current = s;
    });
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  // Autosave Quick Play progress whenever words are found so the attempt
  // survives app backgrounding. timeLeft is best-effort (saved on word-found,
  // not every second — close enough for a resume).
  useEffect(() => {
    if (mode !== 'practice' || gameOver) return;
    saveQuickPlayProgress({
      puzzleCenter: puzzle.center,
      puzzleLetters: puzzle.letters,
      foundWords,
      timeLeft,
    });
  }, [mode, gameOver, puzzle, foundWords, timeLeft]);

  const score = useMemo(
    () => foundWords.reduce((sum, w) => sum + scoreWordForPuzzle(w, solution.pangrams.includes(w)), 0),
    [foundWords, solution]
  );
  const rank = getRankProgress(score, targetScore);

  const queueAchievements = (newOnes: Achievement[]) => {
    if (newOnes.length > 0) setAchievementQueue((q) => [...q, ...newOnes]);
  };

  const handleTimeUp = async () => {
    setGameOver(true);
    setResultsVisible(true);
    // Clear saved progress — the game is over.
    await clearQuickPlayProgress();
    let stats = statsRef.current ?? (await loadHexHiveStats());
    stats = { ...stats, practicePuzzlesPlayed: stats.practicePuzzlesPlayed + 1 };
    statsRef.current = stats;
    setFinalStats(stats);
    await saveHexHiveStats(stats);

    const roundAch = await checkPracticeRoundAchievements(stats);
    queueAchievements(roundAch);
  };

  useEffect(() => {
    if (mode !== 'practice') return;
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval);
          handleTimeUp();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const flashFeedback = (fb: Feedback) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback(fb);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 1200);
  };

  const handleSubmit = async () => {
    if (gameOver) return;
    if (mode === 'daily' && dailyWon) return;
    const result = checkGuess(currentGuess, puzzle, foundSet);

    if (result.status !== 'valid') {
      // Deliberately silent. Probing words that aren't in the list is normal
      // play here — the median puzzle has ~105 findable words and players try
      // far more than that. Buzzing every miss would punish the core loop.
      // (HapticManager.hexHive.invalidWord/duplicateWord are intentional no-ops.)
      flashFeedback(
        result.status === 'already_found'
          ? 'already_found'
          : result.status === 'too_short'
          ? 'too_short'
          : result.status === 'not_a_word' || result.status === 'invalid_letters' || result.status === 'missing_center'
          ? 'invalid'
          : null
      );
      // Only a true dictionary miss is worth reporting. 'too_short',
      // 'invalid_letters' and 'missing_center' are the player breaking Hex
      // Hive's own rules, not the word list being wrong, and 'already_found'
      // means the word IS in the list.
      if (result.status === 'not_a_word') {
        recordRejectedWord('hexhive', currentGuess);
      }
      setCurrentGuess('');
      return;
    }

    const word = currentGuess.trim().toLowerCase();
    const newFound = [...foundWords, word];
    setFoundWords(newFound);
    setCurrentGuess('');
    flashFeedback(result.isPangram ? 'pangram' : 'valid');
    // A pangram is rare and the best moment in the game — the one success()
    // Hex Hive gets. Everything else is a light tick.
    if (result.isPangram) {
      HapticManager.hexHive.pangram();
    } else {
      HapticManager.hexHive.wordFound();
    }

    // Compute the up-to-date score/rank including this word — `score`/`rank`
    // from render still reflect the pre-submit state since setFoundWords
    // hasn't re-rendered yet.
    const newScore = score + scoreWordForPuzzle(word, result.isPangram);
    const newRank = getRankProgress(newScore, targetScore);
    // Climbing a rank is real progress — mark it, but only when it changes.
    // Delayed so it reads as a separate beat from the word pulse just fired.
    if (newRank.index > rank.index) {
      setTimeout(() => HapticManager.hexHive.rankUp(), 220);
    }
    // Since input is blocked the instant dailyWon flips true, reaching this
    // line with mode === 'daily' means the player hasn't won yet — so a
    // crossing here is always the first (and only) time it happens today.
    // Winning = reaching Master, the top of the (rescaled) rank ladder.
    const justWon = mode === 'daily' && newRank.isMaxRank;

    if (mode === 'daily') {
      await saveDailyProgress({ dateISO: getTodayDateString(), foundWords: newFound });
    }

    // Update stats — daily and Quick Play each get their own lifetime
    // counters, plus a combined lifetime total used for the volume ladder.
    let stats = statsRef.current ?? (await loadHexHiveStats());
    stats = { ...stats };

    if (mode === 'daily') {
      stats = bumpStreakForToday(stats);
      stats.dailyWordsFound += 1;
      if (result.isPangram) stats.dailyPangramsFound += 1;
    } else {
      stats.practiceWordsFound += 1;
      if (result.isPangram) stats.practicePangramsFound += 1;
    }

    stats.totalWordsFound += 1;
    if (result.isPangram) stats.totalPangramsFound += 1;
    if (word.length > stats.longestWordFound.length) stats.longestWordFound = word;

    if (mode === 'daily') {
      stats.bestDailyScore = Math.max(stats.bestDailyScore, newScore);
      stats.bestDailyRankIndex = Math.max(stats.bestDailyRankIndex, newRank.index);
      stats.bestDailyWordCount = Math.max(stats.bestDailyWordCount, newFound.length);
      if (justWon) {
        stats = bumpFullClearStreakForToday(stats);
        stats.fullClears += 1;
      }
    } else {
      stats.practiceBestScore = Math.max(stats.practiceBestScore, newScore);
      stats.practiceBestWordCount = Math.max(stats.practiceBestWordCount, newFound.length);
    }
    statsRef.current = stats;
    await saveHexHiveStats(stats);

    if (mode === 'daily') {
      await saveDailyHistoryEntry({
        dateISO: getTodayDateString(),
        score: newScore,
        maxScore: targetScore,
        wordsFound: newFound.length,
        totalWords: solution.words.length,
        rankIndex: newRank.index,
        rankName: newRank.name,
        fullyCleared: justWon,
      });

      if (justWon) {
        setDailyWon(true);
        setShowWinCelebration(true);
        maybeRequestReview(stats.currentStreak ?? 0);
        maybeFlagReminderOptIn(stats.currentStreak ?? 0);
      }
      syncDailyReminder();
    }

    const wordAch = await checkWordAchievements({ word, isPangram: result.isPangram }, stats);
    const progressAch = await checkProgressAchievements(stats, newRank.index, newRank.name, justWon);
    queueAchievements([...wordAch, ...progressAch]);
  };

  const handleLetterPress = (letter: string) => {
    if (gameOver) return;
    setCurrentGuess((g) => {
      if (g.length >= 20) return g; // buffer full — no letter, no tick
      HapticManager.hexHive.hexTap();
      return g + letter;
    });
  };
  const handleDelete = () =>
    setCurrentGuess((g) => {
      if (g.length === 0) return g; // nothing to delete — no tick
      HapticManager.hexHive.hexTap();
      return g.slice(0, -1);
    });
  // ── Quick Play hints ──────────────────────────────────────────────────────
  // Practice only. The Daily is the same hive for everybody, so a hint there
  // would quietly change what a rank means; Quick Play has no streak and no
  // shared result, which turns a hint from a difficulty valve into a way to
  // learn what this puzzle type even wants from you.
  //
  // What it reveals is deliberately the cheapest useful help: the opening two
  // letters and the length of a word you haven't found. That tells you where to
  // look without handing over the answer, and it's the same shape of help a
  // Spelling Bee two-letter list gives.
  const MAX_HINTS = 3;
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintText, setHintText] = useState<string | null>(null);

  // Quick Play's Play Again swaps the puzzle prop rather than remounting the
  // screen, so without this the next round would start with the previous
  // round's hints already spent and its hint text still on screen.
  useEffect(() => {
    setHintsUsed(0);
    setHintText(null);
  }, [puzzle]);

  const handleHint = () => {
    if (mode !== 'practice' || hintsUsed >= MAX_HINTS) return;
    // `solution` is already memoized above — getPuzzleSolution is cached, but
    // shadowing the memo with a second call is how the two drift apart later.
    const unfound = solution.words.filter((w) => !foundSet.has(w));
    if (unfound.length === 0) {
      setHintText('Nothing left to find — you have them all.');
      return;
    }
    // Shortest first, so the hint points at something actually reachable
    // rather than the obscure nine-letter word nobody was going to get.
    const shortest = unfound.reduce((a, b) => (b.length < a.length ? b : a), unfound[0]);
    const opening = shortest.slice(0, 2).toUpperCase();
    setHintText(`Try a ${shortest.length}-letter word starting with ${opening}`);
    setHintsUsed((h) => h + 1);
    HapticManager.hexHive.hexTap();
  };

  const handleShuffle = () => {
    HapticManager.hexHive.hexTap();
    setOuterLetters((prev) => shuffleLetters(prev));
  };

  // Rank ladder as a pip bar — same "climb visualized as blocks" idea as
  // the other games' shares, using the hive's own rank tiers instead of an
  // arbitrary score threshold.
  const buildRankBar = (rankIndex: number) => {
    const filled = rankIndex + 1;
    return '🔶'.repeat(filled) + '⬜'.repeat(Math.max(0, RANKS.length - filled));
  };

  const handleShareResult = async () => {
    const pangramCount = foundWords.filter((w) => solution.pangrams.includes(w)).length;
    const lines = [
      'HEX HIVE',
      buildRankBar(rank.index),
      `Rank: ${rank.name}`,
      `${score} pts · ${foundWords.length} word${foundWords.length === 1 ? '' : 's'}${pangramCount > 0 ? ` · ${pangramCount} pangram${pangramCount === 1 ? '' : 's'}` : ''}`,
      '',
      'wordfury.app',
    ];
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {}
  };

  const handleShareWin = async () => {
    // Spoiler-safe: same reasoning as every other Daily share — the day's
    // hive is shared by everyone, so the actual found words stay out of
    // it. Rank/score/pangram COUNT don't give away which words they were.
    const pangramCount = foundWords.filter((w) => solution.pangrams.includes(w)).length;
    const streak = statsRef.current?.currentStreak ?? 0;
    const lines = [
      `HEX HIVE DAILY — ${formatDisplayDate()}`,
      buildRankBar(rank.index),
      `Rank: ${rank.name} — Solved`,
      `${score} pts · ${foundWords.length} word${foundWords.length === 1 ? '' : 's'}${pangramCount > 0 ? ` · ${pangramCount} pangram${pangramCount === 1 ? '' : 's'}` : ''}`,
    ];
    if (streak > 1) lines.push(`${streak} day streak`);
    lines.push('', 'wordfury.app');
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {}
  };

  const sortedFound = useMemo(() => [...foundWords].sort(), [foundWords]);

  const timerColor = timeLeft > 20 ? background.textColor : timeLeft > 10 ? '#f59e0b' : '#e94560';

  const BG = background.backgroundColor;
  const TEXT = background.textColor;
  const SUBTEXT = background.secondaryText;
  const CARD = background.cardColor;
  const BORDER = background.borderColor;

  const pangramsFound = foundWords.filter((w) => solution.pangrams.includes(w)).length;
  const showViewResultsPill = mode === 'practice' && gameOver && !resultsVisible;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: BG }]}>
      <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />

      <AchievementPopup
        achievement={achievementQueue[0] ?? null}
        onDismiss={() => setAchievementQueue((q) => q.slice(1))}
        backgroundColor={CARD}
        textColor={TEXT}
      />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onGoHome}>
          <Text style={[styles.backText, { color: SUBTEXT }]}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.titleWrap} pointerEvents="box-none">
          {mode === 'practice' && !gameOver ? (
            <Text style={[styles.title, { color: timerColor }]}>{formatTime(timeLeft)}</Text>
          ) : showViewResultsPill ? (
            <TouchableOpacity onPress={() => setResultsVisible(true)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.title, { color: ACCENT }]}>View Results</Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.title, { color: TEXT }]}>{mode === 'daily' ? 'Daily Hex Hive' : 'Hex Hive'}</Text>
          )}
        </View>
      </View>

      <View style={styles.rankBarWrap}>
        <RankProgressBar
          rankIndex={rank.index}
          score={score}
          accentColor={ACCENT}
          textColor={TEXT}
          borderColor={BORDER}
        />
      </View>

      {mode === 'daily' && dailyWon ? (
        <View style={[styles.boardCard, styles.solvedCard, { borderColor: BORDER, backgroundColor: CARD }]}>
          <Text style={[styles.title2, { color: TEXT, marginTop: 0 }]}>Solved!</Text>
          <Text style={[styles.subtitle, { color: SUBTEXT }]}>
            You reached {rank.name} rank today. Come back tomorrow for a new hive.
          </Text>
        </View>
      ) : (
        <View style={styles.boardCard}>
          <HexGrid
            outerLetters={outerLetters}
            center={puzzle.center}
            currentGuess={currentGuess}
            feedback={feedback}
            onLetterPress={handleLetterPress}
            onDelete={handleDelete}
            onShuffle={handleShuffle}
            onSubmit={handleSubmit}
            accentColor={ACCENT}
            textColor={TEXT}
            secondaryTextColor={SUBTEXT}
            tileColor={ACCENT + '17'}
            cardColor={CARD}
            borderColor={BORDER}
          />
        </View>
      )}

      {/* Practice-only hint control. Absent entirely in the Daily rather than
          shown disabled — a greyed-out button invites people to wonder what
          they're missing. */}
      {mode === 'practice' && !dailyWon && (
        <View style={styles.hintRow}>
          <Pressable
            onPress={handleHint}
            disabled={hintsUsed >= MAX_HINTS}
            style={({ pressed }) => [
              styles.hintButton,
              { borderColor: BORDER, backgroundColor: CARD, opacity: hintsUsed >= MAX_HINTS ? 0.45 : pressed ? 0.8 : 1 },
            ]}
          >
            <Lightbulb size={14} color={ACCENT} />
            <Text style={[styles.hintButtonText, { color: TEXT }]}>
              Hint {MAX_HINTS - hintsUsed > 0 ? `(${MAX_HINTS - hintsUsed})` : ''}
            </Text>
          </Pressable>
          {hintText ? (
            <Text style={[styles.hintText, { color: SUBTEXT }]} numberOfLines={2}>
              {hintText}
            </Text>
          ) : null}
        </View>
      )}

      <ScrollView
        style={styles.wordListWrap}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => Keyboard.dismiss()}
      >
        <WordList
          foundWords={sortedFound}
          pangrams={new Set(solution.pangrams)}
          textColor={TEXT}
          secondaryTextColor={SUBTEXT}
          accentColor={ACCENT}
          borderColor={BORDER}
        />
      </ScrollView>

      {mode === 'practice' && gameOver && (
        <Modal
          visible={resultsVisible}
          transparent={false}
          animationType="none"
          statusBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={() => setResultsVisible(false)}
        >
        <View style={[styles.overlay, { backgroundColor: BG }]}>
          <View style={[styles.pageHeader, { borderColor: BORDER, paddingTop: insets.top + 10 }]}>
            <View style={styles.headerSpacer} />
            <Text style={[styles.brand, { color: SUBTEXT }]}>HEX HIVE</Text>
            <Pressable
              style={({ pressed }) => [styles.closeIconButton, { opacity: pressed ? 0.6 : 1 }]}
              onPress={() => setResultsVisible(false)}
              hitSlop={16}
            >
              <X size={22} color={SUBTEXT} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={[styles.title2, { color: TEXT }]}>Time&apos;s Up!</Text>
            <Text style={[styles.subtitle, { color: SUBTEXT }]}>
              You found {foundWords.length} word{foundWords.length === 1 ? '' : 's'} this round.
            </Text>

            <View style={[styles.rankBox, { borderColor: BORDER }]}>
              <Text style={[styles.rankBoxLabel, { color: SUBTEXT }]}>RANK</Text>
              <Text style={[styles.rankBoxValue, { color: ACCENT }]}>{rank.name}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: BORDER }]} />
            <Text style={[styles.sectionTitle, { color: TEXT }]}>This Round</Text>
            <View style={styles.statsRow}>
              <StatPill label="Score" value={`${score}`} textColor={TEXT} borderColor={BORDER} backgroundColor={CARD} />
              <StatPill label="Words" value={`${foundWords.length}`} textColor={TEXT} borderColor={BORDER} backgroundColor={CARD} />
              <StatPill label="Pangrams" value={`${pangramsFound}`} textColor={TEXT} borderColor={BORDER} backgroundColor={CARD} />
            </View>

            {finalStats && (
              <>
                <View style={[styles.divider, { backgroundColor: BORDER }]} />
                <Text style={[styles.sectionTitle, { color: TEXT }]}>Stats</Text>
                <View style={styles.statsRow}>
                  <StatPill
                    label="Best Score"
                    value={`${finalStats.practiceBestScore}`}
                    textColor={TEXT}
                    borderColor={BORDER}
                    backgroundColor={CARD}
                  />
                  <StatPill
                    label="Rounds Played"
                    value={`${finalStats.practicePuzzlesPlayed}`}
                    textColor={TEXT}
                    borderColor={BORDER}
                    backgroundColor={CARD}
                  />
                </View>
              </>
            )}

            <View style={styles.buttonRow}>
              <PrimaryButton label="Play Again" onPress={onPlayAgain} borderColor={BORDER} textColor={TEXT} backgroundColor={CARD} />
              <PrimaryButton label="Main Menu" onPress={onGoHome} borderColor={BORDER} textColor={TEXT} backgroundColor={CARD} />
            </View>

            <Pressable
              style={({ pressed }) => [styles.shareButton, { opacity: pressed ? 0.75 : 1 }]}
              onPress={handleShareResult}
            >
              <View style={styles.shareButtonInner}>
                <Share2 size={18} color="#fff" />
                <Text style={styles.shareButtonText}>Share Result</Text>
              </View>
            </Pressable>

            <WordReportPrompt />
          </View>
          </ScrollView>
          <AchievementPopup
            achievement={achievementQueue[0] ?? null}
            onDismiss={() => setAchievementQueue((q) => q.slice(1))}
            backgroundColor={CARD}
            textColor={TEXT}
          />
        </View>
        </Modal>
      )}

      <Modal
        visible={mode === 'daily' && showWinCelebration}
        transparent={false}
        animationType="slide"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowWinCelebration(false)}
      >
        <View style={[styles.overlay, { backgroundColor: BG }]}>
          <View style={[styles.pageHeader, { borderColor: BORDER, paddingTop: insets.top + 10 }]}>
            <View style={styles.headerSpacer} />
            <Text style={[styles.brand, { color: SUBTEXT }]}>HEX HIVE</Text>
            <Pressable
              style={({ pressed }) => [styles.closeIconButton, { opacity: pressed ? 0.6 : 1 }]}
              onPress={() => setShowWinCelebration(false)}
              hitSlop={16}
            >
              <X size={22} color={SUBTEXT} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={[styles.title2, { color: TEXT }]}>Solved!</Text>
            <Text style={[styles.subtitle, { color: SUBTEXT }]}>
              You reached {rank.name} rank — today&apos;s hive is complete.
            </Text>

            <View style={[styles.rankBox, { borderColor: BORDER }]}>
              <Text style={[styles.rankBoxLabel, { color: SUBTEXT }]}>RANK</Text>
              <Text style={[styles.rankBoxValue, { color: ACCENT }]}>{rank.name}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: BORDER }]} />
            <Text style={[styles.sectionTitle, { color: TEXT }]}>Today</Text>
            <View style={styles.statsRow}>
              <StatPill label="Score" value={`${score}`} textColor={TEXT} borderColor={BORDER} backgroundColor={CARD} />
              <StatPill label="Words" value={`${foundWords.length}`} textColor={TEXT} borderColor={BORDER} backgroundColor={CARD} />
              <StatPill label="Pangrams" value={`${pangramsFound}`} textColor={TEXT} borderColor={BORDER} backgroundColor={CARD} />
            </View>

            <View style={styles.buttonRow}>
              <PrimaryButton label="Main Menu" onPress={onGoHome} borderColor={BORDER} textColor={TEXT} backgroundColor={CARD} />
            </View>

            <Pressable
              style={({ pressed }) => [styles.shareButton, { opacity: pressed ? 0.75 : 1 }]}
              onPress={handleShareWin}
            >
              <View style={styles.shareButtonInner}>
                <Share2 size={18} color="#fff" />
                <Text style={styles.shareButtonText}>Share Result</Text>
              </View>
            </Pressable>

            <WordReportPrompt />
          </View>
          </ScrollView>
          <AchievementPopup
            achievement={achievementQueue[0] ?? null}
            onDismiss={() => setAchievementQueue((q) => q.slice(1))}
            backgroundColor={CARD}
            textColor={TEXT}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
    position: 'relative',
  },
  backButton: { padding: 8, marginLeft: -8, zIndex: 1 },
  backText: { fontSize: 16, fontWeight: '500' },
  titleWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: 'bold' },
  rankBarWrap: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 },
  boardCard: {
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  solvedCard: {
    borderWidth: 1.5,
    borderRadius: 18,
    paddingVertical: 28,
    alignItems: 'center',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  hintButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  hintButtonText: { fontSize: 12, fontWeight: '800' },
  hintText: { fontSize: 11.5, flex: 1, fontWeight: '600' },
  wordListWrap: { flex: 1, marginTop: 14 },

  // Result overlay — mirrors Wordle's full-page WordleResultOverlay layout/colors.
  // Rendered inside a native Modal, so this just needs to fill it.
  overlay: {
    flex: 1,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerSpacer: { width: 22 },
  closeIconButton: { width: 22, alignItems: 'flex-end' },
  scrollContent: { alignItems: 'center', padding: 18 },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    padding: 8,
  },
  brand: { textAlign: 'center', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title2: { textAlign: 'center', fontSize: 22, fontWeight: '900', marginBottom: 4, marginTop: 12 },
  subtitle: { textAlign: 'center', fontSize: 14, fontWeight: '600', marginBottom: 12 },
  rankBox: { borderWidth: 2, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' },
  rankBoxLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  rankBoxValue: { fontSize: 26, fontWeight: '900', letterSpacing: 1 },
  divider: { height: 1, marginVertical: 12, opacity: 0.35 },
  sectionTitle: { fontSize: 14, fontWeight: '900', marginBottom: 8, textAlign: 'center', letterSpacing: 1 },
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 },
  statPill: { borderWidth: 2, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, minWidth: 100, alignItems: 'center' },
  statPillLabel: { fontSize: 11, fontWeight: '800', opacity: 0.8, marginBottom: 2 },
  statPillValue: { fontSize: 14, fontWeight: '900' },
  buttonRow: { flexDirection: 'row', justifyContent: 'center', width: '100%', gap: 10, marginTop: 24 },
  primaryButton: { borderWidth: 2, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, minWidth: 120, alignItems: 'center' },
  primaryButtonText: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  shareButton: {
    marginTop: 18,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#22c55e',
  },
  shareButtonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareButtonText: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  secondaryButton: { marginTop: 10, borderWidth: 2, borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  secondaryButtonText: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
});
