// src/wordgrid/screens/GameScreen.tsx
import { router } from 'expo-router';
import { AchievementIcon } from '../../shared/AchievementIcon';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../shared/ThemeContext';
import { ResultsScreen } from '../../shared/ResultsScreen';
import { COLORS } from '../../shared/theme';
import { maybeRequestReview } from '../../shared/reviewPrompt';
import { syncDailyReminder, maybeFlagReminderOptIn } from '../../shared/dailyReminders';
import { AchievementPopup } from '../../shared/AchievementPopup';
import { WordReportPrompt } from '../../shared/WordReportPrompt';
import { FallingLetters } from '../../shared/FallingLetters';
import GridWithGesture from '../components/GridWithGesture';
import { FeedbackOverlay } from './FeedbackOverlay';
import { DailyChallengeCard } from '../components/DailyChallengeCard';
import DailyCalendar, { type CalendarHistory } from '../../shared/DailyCalendar';
import { HapticManager } from '../../shared/HapticManager';
import { recordRejectedWord } from '../../shared/wordReports';
import { generateGrid } from '../utils/gridGenerator';
import {
  buildWordGridDailyShareText,
  clearWordGridDailyProgress,
  generateDailyGrid,
  getTodayDateString,
  loadDailyWordGridStats,
  loadWordGridDailyProgress,
  saveDailyWordGridResult,
  loadWordGridDailyHistory,
  saveWordGridDailyHistoryEntry,
  saveWordGridDailyProgress,
  loadWordGridQuickPlayProgress,
  saveWordGridQuickPlayProgress,
  clearWordGridQuickPlayProgress,
  type DailyWordGridStats,
  type WordGridDailyProgress,
  useCountdownToMidnight,
} from '../utils/dailyChallenge';
import { validatePath, type Position } from '../utils/pathFinder';
import { calculateWordScore, LONGEST_WORD_BONUS } from '../utils/scoring';
import {
  loadWordGridStats,
  updateStatsAfterGame,
  type WordGridStats,
} from '../utils/storage';
import {
  checkAchievements,
  getUnlockedAchievements,
  ACHIEVEMENTS,
  type Achievement,
} from '../utils/achievements';

const { width } = Dimensions.get('window');

type Screen = 'menu' | 'game' | 'results';
type GameMode = 'quick' | 'daily';
type MenuTab = 'play' | 'stats';

const ROUND_DURATION = 60;

type Feedback = { points: number; success: boolean; alreadyFound?: boolean; key: number };

// ─── Stats Card (matches WordBuilder) ────────────────────────────────────────

const StatsCard = ({
  label,
  value,
  wide = false,
  textColor,
  secondaryText,
  cardColor,
  borderColor,
}: {
  label: string;
  value: string;
  wide?: boolean;
  textColor: string;
  secondaryText: string;
  cardColor: string;
  borderColor: string;
}) => (
  <View style={[
    styles.statsCard,
    wide && styles.statsCardWide,
    { backgroundColor: cardColor, borderColor },
  ]}>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.statsValue, { color: textColor }]}>{value}</Text>
    <Text style={[styles.statsLabel, { color: secondaryText }]}>{label}</Text>
  </View>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GameScreen() {
  const { background } = useTheme();
  const bg = background;
  const dailyCountdown = useCountdownToMidnight();
  // Manual insets (not SafeAreaView) for the results screen specifically —
  // SafeAreaView was found to report a 0 top inset inside the results
  // <Modal>, which jammed the header under the notch and clipped the brand
  // title. The plain "game" screen below isn't in a Modal, so its
  // SafeAreaView is unaffected and left as-is.

  // ── Screen / tab state ────────────────────────────────────────────────────
  const [screen, setScreen] = useState<Screen>('menu');
  const [menuTab, setMenuTab] = useState<MenuTab>('play');
  const [showWordList, setShowWordList] = useState(false);

  // Tab swipe animation (2 tabs: play, stats)
  const TABS: MenuTab[] = ['play', 'stats'];
  const tabAnim = useRef(new Animated.Value(0)).current;
  // Measured directly instead of trusting flex propagation through the
  // Animated.View row below. This is belt-and-suspenders after flex:1 alone
  // did not reliably give the row (and its ScrollView pages) the full
  // height, which was letting content sit un-scrollable-into below a fixed line.
  const [tabAreaHeight, setTabAreaHeight] = useState(0);
  const currentTabIdxRef = useRef(0);
  const dragBase = useRef(0);

  useEffect(() => {
    currentTabIdxRef.current = TABS.indexOf(menuTab);
  }, [menuTab]);

  const switchToTab = useCallback((tab: MenuTab) => {
    const newIdx = TABS.indexOf(tab);
    setMenuTab(tab);
    Animated.spring(tabAnim, {
      toValue: newIdx,
      useNativeDriver: true,
      tension: 70,
      friction: 12,
    }).start();
  }, []);

  const menuPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.2,
      onPanResponderGrant: () => {
        tabAnim.stopAnimation();
        dragBase.current = currentTabIdxRef.current;
      },
      onPanResponderMove: (_, gs) => {
        const raw = dragBase.current - gs.dx / width;
        tabAnim.setValue(Math.max(0, Math.min(TABS.length - 1, raw)));
      },
      onPanResponderRelease: (_, gs) => {
        const base = dragBase.current;
        // Linear navigation. The tab strip is a single left-to-right track and
        // its left end is the way out of the game, so a right-swipe while
        // already on the first tab pops back instead of dead-ending. This is
        // what the root Stack's full-screen back gesture used to do from
        // anywhere on screen -- which is exactly why it had to go: it swallowed
        // these horizontal pans, so tabs became unreachable by swipe and a
        // right-swipe deep in Stats jumped straight out of the game.
        if (gs.dx > 25 || gs.vx > 0.3) {
          if (base <= 0) {
            Animated.spring(tabAnim, {
              toValue: 0,
              useNativeDriver: true,
              tension: 70,
              friction: 12,
            }).start();
            router.back();
            return;
          }
        }
        let newIdx = Math.round(base);
        if (gs.dx < -25 || gs.vx < -0.3) newIdx = Math.min(Math.floor(base) + 1, TABS.length - 1);
        else if (gs.dx > 25 || gs.vx > 0.3) newIdx = Math.max(Math.ceil(base) - 1, 0);
        currentTabIdxRef.current = newIdx;
        setMenuTab(TABS[newIdx]);
        Animated.spring(tabAnim, {
          toValue: newIdx,
          useNativeDriver: true,
          tension: 70,
          friction: 12,
        }).start();
      },
    })
  ).current;

  // ── Stats & achievements ──────────────────────────────────────────────────
  const [stats, setStats] = useState<WordGridStats | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyWordGridStats | null>(null);
  const [dailyHistory, setDailyHistory] = useState<CalendarHistory>({});
  const [unlockedAchievements, setUnlockedAchievements] = useState<
    (Achievement & { unlockedAt: string })[]
  >([]);
  const [pendingAchievements, setPendingAchievements] = useState<Achievement[]>([]);
  const [currentAchievement, setCurrentAchievement] = useState<Achievement | null>(null);

  useEffect(() => {
    loadWordGridStats().then(setStats);
    loadDailyWordGridStats().then(setDailyStats);
    loadWordGridDailyHistory()
      .then((h) => setDailyHistory(h as CalendarHistory))
      .catch(() => {});
    getUnlockedAchievements().then(setUnlockedAchievements);
  }, []);

  useEffect(() => {
    if (!currentAchievement && pendingAchievements.length > 0) {
      const [next, ...rest] = pendingAchievements;
      setCurrentAchievement(next);
      setPendingAchievements(rest);
    }
  }, [currentAchievement, pendingAchievements]);

  // ── Game mode & daily ─────────────────────────────────────────────────────
  const [gameMode, setGameMode] = useState<GameMode>('quick');
  const [dailyShareText, setDailyShareText] = useState('');

  const dailyPlayedToday = dailyStats?.lastPlayedDate === getTodayDateString();

  // ── Game state ────────────────────────────────────────────────────────────
  const [grid, setGrid] = useState<string[][]>(() => generateGrid(4));
  const [score, setScore] = useState(0);
  const [foundWords, setFoundWords] = useState<{ word: string; points: number }[]>([]);
  const [foundWordSet, setFoundWordSet] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState(ROUND_DURATION);
  const [gameOver, setGameOver] = useState(false);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const feedbackKeyRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Set true when an in-progress Daily attempt was restored on app launch —
  // tells startDailyGame to enter the already-loaded game instead of
  // wiping it with a fresh grid/score/foundWords.
  const resumedDailyRef = useRef(false);
  // Set true when an in-progress Quick Play attempt was restored on app launch.
  const resumedQuickPlayRef = useRef(false);
  // True when an in-progress Daily save exists for today — shows "Continue" button.
  const [dailyInProgressToday, setDailyInProgressToday] = useState(false);

  // Resume an in-progress attempt (app closed/backgrounded mid-game). Daily and
  // Quick Play are decided in ONE effect, deliberately.
  //
  // These used to be two effects that both fired on mount, and the Quick Play
  // one guarded itself with `if (resumedDailyRef.current) return` — a ref that
  // the Daily effect only sets AFTER its own async storage read resolves. Which
  // read won was a race, so a restored Daily could end up wearing Quick Play's
  // grid (or vice versa): the player taps Daily, gets a round that isn't
  // today's puzzle, and its result lands in the wrong bucket.
  //
  // Gated on dailyStats having loaded, too — `dailyPlayedToday` is derived from
  // it and reads false while it is still null, which let a finished Daily
  // resume itself from stale progress.
  useEffect(() => {
    if (dailyStats === null) return;
    let cancelled = false;
    (async () => {
      const dailyProgress = dailyPlayedToday ? null : await loadWordGridDailyProgress();
      if (cancelled) return;

      if (dailyProgress) {
        setDailyInProgressToday(true);
        setGameMode('daily');
        setGrid(generateDailyGrid());
        setScore(dailyProgress.score);
        setFoundWords(dailyProgress.foundWords);
        setFoundWordSet(new Set(dailyProgress.foundWords.map((w) => w.word)));
        setTimeLeft(dailyProgress.timeLeft);
        resumedDailyRef.current = true;
        return;
      }

      const quickProgress = await loadWordGridQuickPlayProgress();
      if (cancelled || !quickProgress) return;
      setGameMode('quick');
      setGrid(quickProgress.grid);
      setScore(quickProgress.score);
      setFoundWords(quickProgress.foundWords);
      setFoundWordSet(new Set(quickProgress.foundWords.map((w) => w.word)));
      setTimeLeft(quickProgress.timeLeft);
      resumedQuickPlayRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
     
  }, [dailyStats, dailyPlayedToday]);

  // Autosave Daily progress on every change so the attempt survives the app
  // being backgrounded, force-quit, or swiped away mid-game.
  useEffect(() => {
    if (gameMode !== 'daily' || gameOver || screen !== 'game') return;
    saveWordGridDailyProgress({
      dateISO: getTodayDateString(),
      foundWords,
      score,
      timeLeft,
    });
  }, [gameMode, gameOver, screen, foundWords, score, timeLeft]);

  // Autosave Quick Play progress on every change.
  useEffect(() => {
    if (gameMode !== 'quick' || gameOver || screen !== 'game') return;
    saveWordGridQuickPlayProgress({ grid, foundWords, score, timeLeft });
  }, [gameMode, gameOver, screen, grid, foundWords, score, timeLeft]);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          setGameOver(true);
          HapticManager.wordGrid.roundOver();
          return 0;
        }
        // Single warning at exactly 10s left, not a repeating countdown buzz.
        if (prev - 1 === 10) HapticManager.wordGrid.timeRunningOut();
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handlePathComplete = useCallback(
    (path: Position[]) => {
      const { word, valid } = validatePath(grid, path);
      const key = ++feedbackKeyRef.current;

      if (valid && !foundWordSet.has(word)) {
        // NOTE: the "longest word" bonus is intentionally NOT applied here.
        // It can only be decided once the round ends (see the gameOver
        // effect below) — awarding it live to whichever word first reaches
        // a new max length made two same-length words (e.g. anagrams like
        // SLAVER/SALVER) score differently depending on which was found first.
        const isAllTile = path.length === 16;
        const points = calculateWordScore(word, { isAllTile });

        setScore((prev) => prev + points);
        setFoundWords((prev) => [{ word, points }, ...prev]);
        setFoundWordSet((prev) => new Set([...prev, word]));
        setFeedbacks((prev) => [...prev, { points, success: true, key }]);
        HapticManager.wordGrid.wordFound();
      } else {
        const alreadyFound = valid && foundWordSet.has(word);
        setFeedbacks((prev) => [...prev, { points: 0, success: false, alreadyFound, key }]);
        // Only when the path was a legal chain of adjacent tiles but the word
        // wasn't recognised. An already-found word is already in the list, and
        // rapid guessing is the intended play pattern here, so the plausibility
        // filter inside does the rest of the work.
        if (!valid && !alreadyFound) recordRejectedWord('wordgrid', word);
        // Soft selection tick rather than a warning: rapid guessing is the
        // intended play pattern under a 60-second clock, so a miss is not a
        // mistake worth punishing.
        HapticManager.wordGrid.invalidWord();
      }
    },
    [grid, foundWords, foundWordSet]
  );

  const removeFeedback = useCallback((key: number) => {
    setFeedbacks((prev) => prev.filter((f) => f.key !== key));
  }, []);

  // Save stats + check achievements when game ends, then go to results screen
  useEffect(() => {
    if (!gameOver) return;
    (async () => {
      // Award the longest-word bonus now that the round is over, to every
      // word tied for the longest length found (fixes live scoring giving
      // the bonus only to whichever same-length word was found first).
      let finalScore = score;
      let finalFoundWords = foundWords;
      if (foundWords.length > 0) {
        const maxLen = foundWords.reduce((max, w) => Math.max(max, w.word.length), 0);
        const winners = foundWords.filter((w) => w.word.length === maxLen);
        if (winners.length > 0) {
          finalFoundWords = foundWords.map((w) =>
            w.word.length === maxLen ? { ...w, points: w.points + LONGEST_WORD_BONUS } : w
          );
          finalScore = score + LONGEST_WORD_BONUS * winners.length;
          setFoundWords(finalFoundWords);
          setScore(finalScore);
        }
      }

      const newStats = await updateStatsAfterGame({ score: finalScore, words: finalFoundWords });
      setStats(newStats);

      const newly = await checkAchievements({
        score: finalScore,
        words: finalFoundWords,
        gamesPlayed: newStats.gamesPlayed,
        totalWordsFound: newStats.totalWordsFound,
        totalScore: newStats.totalScore,
      });

      if (newly.length > 0) {
        setPendingAchievements((prev) => [...prev, ...newly]);
        getUnlockedAchievements().then(setUnlockedAchievements);
      }

      if (gameMode === 'daily') {
        const newDailyStats = await saveDailyWordGridResult(finalScore, finalFoundWords.length);
        setDailyStats(newDailyStats);
        // Record the day for the Daily History calendar. Word Grid is a score
        // race with no win/lose state, so every completed day is 'played'.
        const updatedHistory = await saveWordGridDailyHistoryEntry({
          dateISO: getTodayDateString(),
          result: 'played',
          detail: `${finalScore.toLocaleString()} pts · ${finalFoundWords.length} words`,
        });
        setDailyHistory(updatedHistory as CalendarHistory);
        resumedDailyRef.current = false;
        await clearWordGridDailyProgress();
        const text = buildWordGridDailyShareText({
          score: finalScore,
          wordsCount: finalFoundWords.length,
          streak: newDailyStats.streak,
        });
        setDailyShareText(text);
        // No win/lose state in Word Grid (score race, not solve/fail), so
        // the streak itself — built just by showing up — is the "good
        // moment" signal here instead of a win flag.
        maybeRequestReview(newDailyStats.streak);
        maybeFlagReminderOptIn(newDailyStats.streak);
        syncDailyReminder();
        setScreen('results');
      } else {
        await clearWordGridQuickPlayProgress();
        setShowWordList(false);
        setScreen('results');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOver]);

  const startGame = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    // Resuming an in-progress Quick Play attempt restored on launch.
    if (resumedQuickPlayRef.current) {
      resumedQuickPlayRef.current = false;
      setGameMode('quick');
      setGameOver(false);
      setFeedbacks([]);
      setScreen('game');
      setTimeout(startTimer, 100);
      return;
    }

    // Fresh game — wipe any stale quickplay save.
    clearWordGridQuickPlayProgress().catch(() => {});
    setGameMode('quick');
    setGrid(generateGrid(4));
    setScore(0);
    setFoundWords([]);
    setFoundWordSet(new Set());
    setTimeLeft(ROUND_DURATION);
    setGameOver(false);
    setFeedbacks([]);
    setScreen('game');
    setTimeout(startTimer, 100);
  }, [startTimer]);

  const startDailyGame = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    // Resuming an in-progress attempt restored on launch — grid/score/
    // foundWords/timeLeft are already populated, just enter the game.
    if (resumedDailyRef.current) {
      setGameOver(false);
      setFeedbacks([]);
      setScreen('game');
      setTimeout(startTimer, 100);
      return;
    }

    setGameMode('daily');
    setGrid(generateDailyGrid());
    setScore(0);
    setFoundWords([]);
    setFoundWordSet(new Set());
    setTimeLeft(ROUND_DURATION);
    setGameOver(false);
    setFeedbacks([]);
    setScreen('game');
    setTimeout(startTimer, 100);
  }, [startTimer]);

  const handlePlayAgain = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    // Play Again is always a fresh Quick Play round on a random grid, so the
    // mode has to be set explicitly. Leaving gameMode as 'daily' meant the
    // round finished into the Daily bookkeeping path and could overwrite a
    // real Daily result with this throwaway one.
    setGameMode('quick');
    resumedQuickPlayRef.current = false;
    setGrid(generateGrid(4));
    setScore(0);
    setFoundWords([]);
    setFoundWordSet(new Set());
    setTimeLeft(ROUND_DURATION);
    setGameOver(false);
    setFeedbacks([]);
    setShowWordList(false);
    setScreen('game');
    setTimeout(startTimer, 100);
  }, [startTimer]);

  const handleBackToMenu = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setGameOver(false);
    setShowWordList(false);
    setScreen('menu');
    switchToTab('play');
  }, [switchToTab]);

  const handleShareResult = useCallback(async () => {
    try {
      let text: string;
      if (gameMode === 'daily') {
        // Spoiler-safe: same reasoning as Furdle/Anagrams — the Daily grid
        // is shared by everyone that day, so revealing which words were
        // found would give away valid answers to friends who haven't
        // played yet. Score/word-count/streak only.
        text = buildWordGridDailyShareText({
          score,
          wordsCount: foundWords.length,
          streak: dailyStats?.streak ?? 0,
        });
      } else {
        // Quick Play grids are randomly generated per game, so there's no
        // shared puzzle to spoil — safe to flex the actual best word found.
        const bestLenForShare = foundWords.length > 0
          ? foundWords.reduce((max, w) => Math.max(max, w.word.length), 0)
          : 0;
        const topWordForShare = foundWords.length > 0
          ? foundWords.reduce((best, w) => (w.points > best.points ? w : best), foundWords[0])
          : null;
        const lines = [
          'WORD GRID',
          `Score: ${score} pts · ${foundWords.length} word${foundWords.length !== 1 ? 's' : ''}`,
        ];
        if (topWordForShare) {
          lines.push(`Best word: ${topWordForShare.word.toUpperCase()} (${topWordForShare.points} pts, ${bestLenForShare} letters)`);
        }
        lines.push('', 'wordfury.app');
        text = lines.join('\n');
      }
      await Share.share({ message: text });
    } catch (e) {
      console.warn('Share failed', e);
    }
  }, [foundWords, score, gameMode, dailyStats]);

  // Daily is a single continuous attempt, but leaving mid-game (while the
  // round is still running, not yet timed out) no longer locks in today's
  // result as-is — score/foundWords/timeLeft are already autosaved above,
  // so leaving just freezes the attempt where it stands. Coming back today
  // resumes it via the restore effect above instead of forcing a finish
  // just because you tapped away.

  // Progress is autosaved continuously — leaving just freezes it in place.
  const handleGameplayBackPress = useCallback(() => {
    handleBackToMenu();
  }, [handleBackToMenu]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const timerColor =
    timeLeft > 30 ? bg.textColor : timeLeft > 10 ? '#f59e0b' : COLORS.danger;

  const { lockedAchievements } = useMemo(() => {
    const unlockedSet = new Set(unlockedAchievements.map((a) => a.id));
    const clamp = (v: number, t: number) => Math.min(v / t, 1);
    const gp = stats?.gamesPlayed ?? 0;
    const tw = stats?.totalWordsFound ?? 0;
    const ls = stats?.totalScore ?? 0;
    const progressMap: Record<string, number> = {
      games_10:          clamp(gp, 10),
      games_50:          clamp(gp, 50),
      games_100:         clamp(gp, 100),
      games_250:         clamp(gp, 250),
      games_500:         clamp(gp, 500),
      total_words_250:   clamp(tw, 250),
      total_words_1000:  clamp(tw, 1000),
      total_words_5000:  clamp(tw, 5000),
      lifetime_50000:    clamp(ls, 50000),
      lifetime_100000:   clamp(ls, 100000),
      lifetime_500000:   clamp(ls, 500000),
      lifetime_1000000:  clamp(ls, 1000000),
    };
    const lockedAchievements = ACHIEVEMENTS
      .filter((a) => !unlockedSet.has(a.id))
      .map((a) => ({ ...a, progress: progressMap[a.id] ?? 0 }));
    return { unlockedSet, lockedAchievements };
  }, [unlockedAchievements, stats]);

  // ─────────────────────────────────────────────────────────────────────────
  // RESULTS SCREEN — swipeable carousel like WordBuilder
  // ─────────────────────────────────────────────────────────────────────────
  if (screen === 'results') {
    const bestLen = foundWords.length > 0
      ? foundWords.reduce((max, w) => w.word.length > max ? w.word.length : max, 0)
      : 0;
    const topWordEntry = foundWords.length > 0
      ? foundWords.reduce((best, w) => (w.points > best.points ? w : best), foundWords[0])
      : null;
    const isDaily = gameMode === 'daily';
    const sortedWords = [...foundWords].sort((a, b) => b.points - a.points);

    // The found-word list used to live on a second swipe page of its own, which
    // is exactly the kind of per-game divergence the shared screen exists to
    // remove. It is a toggle here instead, collapsed by default, the same way
    // Word Search hides its answer key, so a 30-word round cannot push the
    // buttons off screen.
    const wordList = foundWords.length > 0 ? (
      <View style={{ marginTop: 22 }}>
        <Pressable
          onPress={() => setShowWordList((v) => !v)}
          style={({ pressed }) => [
            styles.wordListToggle,
            { borderColor: bg.borderColor, backgroundColor: bg.cardColor, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Text style={[styles.wordListToggleText, { color: bg.textColor }]}>
            {showWordList ? 'Hide words' : `Show all ${foundWords.length} words`}
          </Text>
        </Pressable>
        {showWordList && (
          <View style={{ marginTop: 10 }}>
            {sortedWords.map((item) => (
              <View key={item.word} style={styles.wordListRow}>
                <Text style={[styles.wordListWord, { color: bg.textColor }]}>{item.word}</Text>
                <Text style={[styles.wordListPoints, { color: bg.secondaryText }]}>{item.points} pts</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    ) : null;

    return (
      <ResultsScreen
        visible
        gameName="WORD GRID"
        onClose={handleBackToMenu}
        title="Time's Up!"
        subtitle={`${foundWords.length} word${foundWords.length !== 1 ? 's' : ''} \u00b7 ${score} points`}
        cells={[
          { label: 'WORDS', value: `${foundWords.length}` },
          { label: 'BEST', value: topWordEntry ? topWordEntry.word.toUpperCase() : '\u2014' },
          { label: 'SCORE', value: score.toLocaleString(), headline: true },
        ]}
        groups={[
          {
            caption: 'THIS GAME',
            rows: [
              { label: 'Words found', value: `${foundWords.length}` },
              {
                label: 'Best word',
                value: topWordEntry ? `${topWordEntry.word.toUpperCase()} (${topWordEntry.points})` : '\u2014',
                tone: 'good' as const,
              },
              { label: 'Longest word', value: bestLen > 0 ? `${bestLen} letters` : '\u2014' },
            ],
          },
          ...(stats
            ? [{
                caption: 'ALL TIME',
                rows: [
                  ...(isDaily && dailyStats
                    ? [
                        { label: 'Daily streak', value: `${dailyStats.streak ?? 0}` },
                        { label: 'Best streak', value: `${dailyStats.bestStreak ?? 0}` },
                      ]
                    : []),
                  { label: 'High score', value: stats.highScore.toLocaleString() },
                  { label: 'Games played', value: `${stats.gamesPlayed}` },
                  { label: 'Total words', value: stats.totalWordsFound.toLocaleString() },
                  { label: 'Best in one game', value: `${stats.bestWordsInGame}` },
                ],
              }]
            : []),
        ]}
        extra={
          <>
            {wordList}
            <WordReportPrompt />
          </>
        }
        countdown={isDaily ? { label: 'NEXT DAILY IN', value: dailyCountdown } : null}
        onMainMenu={handleBackToMenu}
        onPlayAgain={isDaily ? undefined : handlePlayAgain}
        onShare={handleShareResult}
        shareLabel="Share Result"
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GAME SCREEN — matches WordBuilder layout
  // ─────────────────────────────────────────────────────────────────────────
  if (screen === 'game') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg.backgroundColor }]}>
        <StatusBar barStyle={bg.statusBar === 'dark' ? 'dark-content' : 'light-content'} />

        <AchievementPopup
          achievement={currentAchievement}
          onDismiss={() => setCurrentAchievement(null)}
          backgroundColor={bg.cardColor}
          textColor={bg.textColor}
        />


        {/* Header: Back | Timer | Score */}
        <View style={styles.gameHeader}>
          <TouchableOpacity onPress={handleGameplayBackPress} activeOpacity={0.6} hitSlop={10}>
            <Text style={[styles.backText, { color: bg.secondaryText }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.timerText, { color: timerColor }, timeLeft <= 10 && styles.timerWarning]}>
            {formatTime(timeLeft)}
          </Text>
          <Text style={[styles.scoreText, { color: background.accentColor }]}>{score} pts</Text>
        </View>

        {/* Spacer pushes grid toward middle/bottom for thumb reach */}
        <View style={{ flex: 1 }} />

        {/* Grid */}
        <View style={styles.gridWrapper}>
          <GridWithGesture
            grid={grid}
            onPathComplete={handlePathComplete}
            disabled={gameOver}
          />
          {feedbacks.map((f) => (
            <FeedbackOverlay
              key={f.key}
              points={f.points}
              success={f.success}
              alreadyFound={f.alreadyFound}
              onComplete={() => removeFeedback(f.key)}
            />
          ))}
        </View>

        <View style={{ flex: 1 }} />

        {/* Found words — same badge style as WordBuilder */}
        <View style={styles.foundWordsSection}>
          <Text style={[styles.foundWordsTitle, { color: bg.secondaryText }]}>
            Found: {foundWords.length}
          </Text>
          <View style={styles.foundWordsWrap}>
            {foundWords.slice(0, 24).map((item, index) => (
              <View key={index} style={[styles.foundWordBadge, { borderColor: background.accentColor }]}>
                <Text style={[styles.foundWordText, { color: background.accentColor }]}>{item.word.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MENU SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg.backgroundColor }]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={bg.statusBar === 'dark' ? 'dark-content' : 'light-content'} />
      <FallingLetters />

      <AchievementPopup
        achievement={currentAchievement}
        onDismiss={() => setCurrentAchievement(null)}
        backgroundColor={bg.cardColor}
        textColor={bg.textColor}
      />

      {/* Header */}
      <View style={styles.appHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={[styles.backText, { color: bg.secondaryText }]}>← Games</Text>
        </TouchableOpacity>
        <Text style={[styles.appTitle, { color: bg.textColor }]}>Word Grid</Text>
        <View style={{ flex: 1 }} />
      </View>

      {/* Segment Switcher pill (matches WordBuilder) */}
      <View style={[styles.segmentSwitcher, { backgroundColor: bg.cardColor }]}>
        {TABS.map((tab) => {
          const isActive = tab === menuTab;
          return (
            <Pressable
              key={tab}
              style={[styles.segmentButton, isActive && { backgroundColor: bg.backgroundColor }]}
              onPress={() => switchToTab(tab)}
            >
              <Text style={[
                styles.segmentButtonText,
                { color: bg.secondaryText },
                isActive && { color: bg.textColor, fontWeight: '600' },
              ]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Swipeable tab strip */}
      <View
        style={styles.tabStripWrapper}
        {...menuPanResponder.panHandlers}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - tabAreaHeight) > 1) setTabAreaHeight(h);
        }}
      >
        <Animated.View style={[
          styles.tabStrip,
          tabAreaHeight ? { height: tabAreaHeight } : null,
          {
            transform: [{
              translateX: tabAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -width],
              }),
            }],
          },
        ]}>

          {/* ── PLAY TAB ── */}
          <ScrollView
            style={{ width, flex: 1 }}
            contentContainerStyle={styles.playContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Daily Challenge card */}
            <DailyChallengeCard
              played={dailyPlayedToday}
              inProgress={dailyInProgressToday}
              score={dailyStats?.lastScore ?? 0}
              wordsCount={dailyStats?.lastWordsCount ?? 0}
              streak={dailyStats?.streak ?? 0}
              bestStreak={dailyStats?.bestStreak ?? 0}
              shareText={dailyShareText || (dailyStats
                ? buildWordGridDailyShareText({
                    score: dailyStats.lastScore,
                    wordsCount: dailyStats.lastWordsCount,
                    streak: dailyStats.streak,
                  })
                : '')}
              onPlay={dailyPlayedToday
                ? () => {
                    if (!dailyShareText && dailyStats) {
                      setDailyShareText(buildWordGridDailyShareText({
                        score: dailyStats.lastScore,
                        wordsCount: dailyStats.lastWordsCount,
                        streak: dailyStats.streak,
                      }));
                    }
                    setScreen('results');
                  }
                : startDailyGame
              }
            />

            {/* Quick Play button */}
            <TouchableOpacity
              style={[styles.quickPlayButton, { backgroundColor: bg.cardColor, borderColor: bg.borderColor }]}
              onPress={startGame}
              activeOpacity={0.7}
            >
              <Text style={[styles.quickPlayTitle, { color: bg.textColor }]}>Quick Play</Text>
              <Text style={[styles.quickPlaySub, { color: bg.secondaryText }]}>1 minute · 4×4 letter grid</Text>
            </TouchableOpacity>

            {/* How to Play */}
            <View style={[styles.rulesCard, { backgroundColor: bg.cardColor, borderColor: bg.borderColor }]}>
              <Text style={[styles.rulesTitle, { color: bg.textColor }]}>How to Play</Text>
              {[
                'Swipe across adjacent letters to form a word',
                'Letters must connect — horizontally, vertically, or diagonally',
                'Each letter can only be used once per word',
                'Words must be 3 or more letters long',
                'Score big with long words and rare letters (Q, Z, J, X)',
              ].map((rule, i) => (
                <View key={i} style={styles.ruleItem}>
                  <Text style={[styles.ruleNumber, { color: background.accentColor }]}>{i + 1}</Text>
                  <Text style={[styles.ruleText, { color: bg.secondaryText }]}>{rule}</Text>
                </View>
              ))}
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>

          {/* ── STATS TAB ── */}
          <ScrollView
            style={{ width, flex: 1 }}
            contentContainerStyle={styles.statsContainer}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.statsTitle, { color: bg.textColor }]}>Daily Word Grid</Text>

            {dailyStats ? (
              <View style={styles.statsGrid}>
                <StatsCard label="Current Streak" value={(dailyStats.streak ?? 0).toString()} textColor={bg.textColor} secondaryText={bg.secondaryText} cardColor={bg.cardColor} borderColor={bg.borderColor} />
                <StatsCard label="Best Streak" value={(dailyStats.bestStreak ?? 0).toString()} textColor={bg.textColor} secondaryText={bg.secondaryText} cardColor={bg.cardColor} borderColor={bg.borderColor} />
                <StatsCard label="Games Played" value={(dailyStats.gamesPlayed ?? 0).toString()} textColor={bg.textColor} secondaryText={bg.secondaryText} cardColor={bg.cardColor} borderColor={bg.borderColor} />
                <StatsCard label="Last Score" value={(dailyStats.lastScore ?? 0).toString()} textColor={bg.textColor} secondaryText={bg.secondaryText} cardColor={bg.cardColor} borderColor={bg.borderColor} />
              </View>
            ) : (
              <Text style={[styles.loadingText, { color: bg.secondaryText }]}>Loading stats...</Text>
            )}

            <Text style={[styles.statsTitle, { color: bg.textColor, marginTop: 25 }]}>Quick Play</Text>

            {stats ? (
              <View style={styles.statsGrid}>
                <StatsCard
                  label="Games Played"
                  value={Math.max(0, stats.gamesPlayed - (dailyStats?.gamesPlayed ?? 0)).toString()}
                  textColor={bg.textColor} secondaryText={bg.secondaryText} cardColor={bg.cardColor} borderColor={bg.borderColor}
                />
                <StatsCard label="High Score" value={stats.highScore.toLocaleString()} textColor={bg.textColor} secondaryText={bg.secondaryText} cardColor={bg.cardColor} borderColor={bg.borderColor} />
                <StatsCard label="Total Words" value={stats.totalWordsFound.toLocaleString()} textColor={bg.textColor} secondaryText={bg.secondaryText} cardColor={bg.cardColor} borderColor={bg.borderColor} />
                <StatsCard label="Best Words/Game" value={stats.bestWordsInGame.toString()} textColor={bg.textColor} secondaryText={bg.secondaryText} cardColor={bg.cardColor} borderColor={bg.borderColor} />
                <StatsCard label="Lifetime Score" value={stats.totalScore.toLocaleString()} textColor={bg.textColor} secondaryText={bg.secondaryText} cardColor={bg.cardColor} borderColor={bg.borderColor} wide />
                {stats.longestWord ? (
                  <StatsCard label="Longest Word" value={stats.longestWord.toUpperCase()} textColor={bg.textColor} secondaryText={bg.secondaryText} cardColor={bg.cardColor} borderColor={bg.borderColor} wide />
                ) : null}
              </View>
            ) : (
              <Text style={[styles.loadingText, { color: bg.secondaryText }]}>Loading stats...</Text>
            )}

            {/* ── DAILY HISTORY CALENDAR ── matches the other seven games */}
            <Text style={[styles.statsTitle, { color: bg.textColor, marginTop: 25 }]}>Daily History</Text>
            <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
              <DailyCalendar
                history={dailyHistory}
                accentColor={background.accentColor}
                textColor={bg.textColor}
                secondaryTextColor={bg.secondaryText}
                cardColor={bg.cardColor}
                borderColor={bg.borderColor}
              />
            </View>

            {/* Achievements — same grid layout as WordBuilder */}
            <Text style={[styles.statsTitle, { color: bg.textColor, marginTop: 25 }]}>
              Achievements ({unlockedAchievements.length}/{ACHIEVEMENTS.length})
            </Text>

            {/* Unlocked */}
            {unlockedAchievements.length > 0 && (
              <View style={styles.achievementsGrid}>
                {ACHIEVEMENTS.filter(a => unlockedAchievements.some(u => u.id === a.id)).map((achievement) => (
                  <View
                    key={achievement.id}
                    style={[styles.achievementCard, { backgroundColor: bg.cardColor, borderColor: bg.borderColor }]}
                  >
                    <View style={styles.achievementEmoji}>
                      <AchievementIcon category={achievement.category} size={26} color={bg.textColor} />
                    </View>
                    <Text style={[styles.achievementName, { color: bg.textColor }]}>{achievement.name}</Text>
                    <Text style={[styles.achievementDesc, { color: bg.secondaryText }]}>{achievement.description}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Locked divider */}
            {unlockedAchievements.length > 0 && lockedAchievements.length > 0 && (
              <View style={styles.lockedDivider}>
                <View style={[styles.dividerLine, { backgroundColor: bg.borderColor }]} />
                <Text style={[styles.dividerText, { color: bg.secondaryText }]}>Locked</Text>
                <View style={[styles.dividerLine, { backgroundColor: bg.borderColor }]} />
              </View>
            )}

            {/* Locked */}
            {lockedAchievements.length > 0 && (
              <View style={styles.achievementsGrid}>
                {lockedAchievements.map((achievement) => (
                  <View
                    key={achievement.id}
                    style={[styles.achievementCard, styles.achievementCardLocked, { backgroundColor: bg.cardColor, borderColor: bg.borderColor }]}
                  >
                    <View style={[styles.achievementEmoji, { opacity: 0.5 }]}>
                      <AchievementIcon category={achievement.category} size={26} color={bg.textColor} />
                    </View>
                    <Text style={[styles.achievementName, { color: bg.textColor, opacity: 0.5 }]}>{achievement.name}</Text>
                    <Text style={[styles.achievementDesc, { color: bg.secondaryText, opacity: 0.5 }]}>{achievement.description}</Text>
                    {achievement.progress > 0 && (
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${Math.round(achievement.progress * 100)}%` }]} />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>

        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── Menu header ──
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 5,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  backBtn: { flex: 1, alignItems: 'flex-start' },
  backText: { fontSize: 16, fontWeight: '500' },

  // ── Segment switcher ──
  segmentSwitcher: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 999,
    padding: 4,
  },
  segmentButton: { paddingVertical: 8, paddingHorizontal: 24, borderRadius: 999 },
  segmentButtonText: { fontSize: 14, fontWeight: '500' },

  // ── Tab strip ──
  tabStripWrapper: { flex: 1, overflow: 'hidden', alignItems: 'flex-start' },
  // flex:1 is required here. Without it, this row has no definite height for
  // its ScrollView children to stretch into, so content gets clipped by the
  // overflow:hidden wrapper before it reaches the true screen bottom.
  tabStrip: { flex: 1, width: width * 2, flexDirection: 'row', alignSelf: 'flex-start' },

  // ── Play tab ──
  playContainer: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 40,
  },
  quickPlayButton: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 20,
    marginBottom: 12,
    alignItems: 'center',
  },
  quickPlayTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  quickPlaySub: {
    fontSize: 14,
  },

  rulesCard: { borderRadius: 14, borderWidth: 1.5, padding: 16 },
  rulesTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  ruleItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  ruleNumber: { fontSize: 18, fontWeight: 'bold', width: 28 },
  ruleText: { fontSize: 14, flex: 1, lineHeight: 20 },

  // ── Stats tab ──
  statsContainer: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 40,
  },
  statsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  statsCard: {
    width: '48%',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsCardWide: { width: '100%' },
  statsValue: { fontSize: 20, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  statsLabel: { fontSize: 12, textAlign: 'center' },
  loadingText: { fontSize: 16, textAlign: 'center', marginTop: 20 },

  // ── Achievements grid ──
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  achievementCard: {
    width: '48%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementCardLocked: { opacity: 0.5 },
  achievementEmoji: { fontSize: 32, marginBottom: 6 },
  achievementName: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  achievementDesc: { fontSize: 11, textAlign: 'center' },
  progressTrack: { marginTop: 8, width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.1)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: '#22c55e' },
  lockedDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 15, fontSize: 14, fontWeight: '500' },

  // ── Game screen ──
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 10,
    marginBottom: 10,
  },
  timerText: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  timerWarning: {
    color: COLORS.danger,
  },
  scoreText: {
    fontSize: 18,
    fontWeight: '600',
  },
  gridWrapper: {
    alignItems: 'center',
    position: 'relative',
  },
  foundWordsSection: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 8,
    height: 180,
    overflow: 'hidden',
  },
  foundWordsTitle: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  foundWordsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  foundWordBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(78,204,163,0.15)',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  foundWordText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.accent,
  },

  // ── Results screen ──
  wordListToggle: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  wordListToggleText: { fontSize: 14, fontWeight: '800' },
  wordListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 4,
  },
  wordListWord: { fontSize: 14, fontWeight: '700' },
  wordListPoints: { fontSize: 13, fontWeight: '600' },
  // Results page — Wordle/Hangman card style

  // Words page

  // Page indicator
});
