// src/wordladder/screens/LadderPlayScreen.tsx
// Core Word Ladder gameplay engine, shared by both Daily and Practice routes.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lightbulb, FlagOff } from 'lucide-react-native';

import { useTheme } from '../../shared/ThemeContext';
import { useSemanticColors } from '../../shared/semanticColors';
import { recordRejectedWord } from '../../shared/wordReports';
import { HapticManager } from '../../shared/HapticManager';
import { AchievementPopup } from '../../shared/AchievementPopup';
import { ConfirmModal } from '../../shared/ConfirmModal';
import { maybeRequestReview } from '../../shared/reviewPrompt';
import { syncDailyReminder, maybeFlagReminderOptIn } from '../../shared/dailyReminders';

import type { LadderDifficulty, LadderPuzzle } from '../utils/generator';
import { getHintPath } from '../utils/generator';
import { getGolfTerm } from '../utils/golfTerms';
import { isOneLetterOff, isValidWord } from '../utils/wordGraph';
import {
  clearDailyProgress,
  computeNextStreak,
  DailyLockState,
  DailyProgressState,
  formatDisplayDate,
  getTodayDateString,
  loadDailyLock,
  loadLadderStats,
  saveDailyLock,
  saveDailyProgress,
  saveLadderStats,
  saveQuickPlayProgress,
  clearQuickPlayProgress,
  type QuickPlayProgressState,
  useCountdownToMidnight,
  saveLadderDailyHistoryEntry,
} from '../utils/ladderStorage';
import {
  Achievement,
  checkLadderAchievements,
  LadderGameResult,
} from '../utils/ladderAchievements';
import LadderResultOverlay from '../components/LadderResultOverlay';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_HINTS = 3;
const KEYBOARD_ROWS: string[][] = [
  'QWERTYUIOP'.split(''),
  'ASDFGHJKL'.split(''),
  [...'ZXCVBNM'.split(''), 'BACK'],
];
const KEYBOARD_HORIZONTAL_PADDING = 6;
const KEY_GAP = 6;

type Props = {
  puzzle: LadderPuzzle;
  mode: 'daily' | 'practice';
  difficulty: LadderDifficulty;
  lockedResult?: DailyLockState | null; // daily-only: already played today
  initialProgress?: DailyProgressState | null; // daily-only: resume from a previous session
  initialPracticeProgress?: QuickPlayProgressState | null; // practice-only: resume from a previous session
  onGoHome: () => void;
  onPlayAgain?: () => void; // practice-only
};

type GameStatus = 'playing' | 'won' | 'gave_up';

function buildTiles(word: string, length: number): string[] {
  const padded = word.toUpperCase().padEnd(length, ' ');
  return padded.slice(0, length).split('');
}

function diffIndex(a: string, b: string): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return i;
  }
  return -1;
}

const LadderPlayScreen: React.FC<Props> = ({
  puzzle,
  mode,
  difficulty,
  lockedResult,
  initialProgress,
  initialPracticeProgress,
  onGoHome,
  onPlayAgain,
}) => {
  const { background } = useTheme();
  // The rejected-step outline is the only colour-only signal in Word Ladder,
  // so it goes through the shared palette.
  const semantic = useSemanticColors();
  const wordLength = puzzle.wordLength;
  const countdown = useCountdownToMidnight();

  const alreadyLocked = mode === 'daily' && !!lockedResult;
  const resumedElapsed = initialProgress?.elapsedSeconds ?? initialPracticeProgress?.elapsedSeconds ?? 0;

  const [chain, setChain] = useState<string[]>(
    initialProgress?.chain ?? initialPracticeProgress?.chain ?? [puzzle.start]
  );
  const [currentCells, setCurrentCells] = useState<string[]>(Array(wordLength).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [hintsUsed, setHintsUsed] = useState(initialProgress?.hintsUsed ?? initialPracticeProgress?.hintsUsed ?? 0);
  const [status, setStatus] = useState<GameStatus>(alreadyLocked ? (lockedResult!.result === 'won' ? 'won' : 'gave_up') : 'playing');
  const [elapsed, setElapsed] = useState(resumedElapsed);
  const [showResult, setShowResult] = useState(alreadyLocked);
  const [finalStreaks, setFinalStreaks] = useState<{ current: number | null; best: number | null }>({
    current: null,
    best: null,
  });

  const [pendingAchievements, setPendingAchievements] = useState<Achievement[]>([]);
  const [currentPopupAchievement, setCurrentPopupAchievement] = useState<Achievement | null>(null);

  // Offset the start time backward by however much play time already
  // happened in a previous session, so the timer keeps counting up
  // seamlessly instead of resetting to 0 on resume.
  const startTimeRef = useRef(Date.now() - resumedElapsed * 1000);
  const scrollRef = useRef<ScrollView>(null);
  const savedRef = useRef(false);

  // Timer
  useEffect(() => {
    if (status !== 'playing' || alreadyLocked) return;
    const interval = setInterval(() => {
      setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [status, alreadyLocked]);

  // Reviewing an already-completed daily: finishGame() never runs (nothing
  // new to save), so pull the current streak from storage just for display.
  useEffect(() => {
    if (!alreadyLocked) return;
    loadLadderStats().then((stats) => {
      setFinalStreaks({ current: stats.daily.currentStreak, best: stats.daily.bestStreak });
    });
  }, [alreadyLocked]);

  // Autosave Daily progress on every move so the attempt survives the app
  // being backgrounded, force-quit, or swiped away mid-game. Resumed via
  // `initialProgress` the next time this screen mounts for the same day.
  useEffect(() => {
    if (mode !== 'daily' || alreadyLocked || status !== 'playing') return;
    const elapsedNow = Math.round((Date.now() - startTimeRef.current) / 1000);
    saveDailyProgress({
      dateISO: getTodayDateString(),
      chain,
      hintsUsed,
      elapsedSeconds: elapsedNow,
    });
  }, [mode, alreadyLocked, status, chain, hintsUsed]);

  // Autosave Quick Play progress so the attempt survives mid-game app close.
  useEffect(() => {
    if (mode !== 'practice' || status !== 'playing') return;
    const elapsedNow = Math.round((Date.now() - startTimeRef.current) / 1000);
    saveQuickPlayProgress({
      puzzle: {
        start: puzzle.start,
        end: puzzle.end,
        solution: puzzle.solutionPath,
        par: puzzle.par,
        wordLength: puzzle.wordLength,
        difficulty: difficulty as string,
      },
      chain,
      hintsUsed,
      elapsedSeconds: elapsedNow,
    });
  }, [mode, status, puzzle, difficulty, chain, hintsUsed]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [chain.length]);

  useEffect(() => {
    if (pendingAchievements.length > 0 && !currentPopupAchievement) {
      setCurrentPopupAchievement(pendingAchievements[0]);
      setPendingAchievements((prev) => prev.slice(1));
    }
  }, [pendingAchievements, currentPopupAchievement]);

  const tileSize = useMemo(() => {
    const gap = 6;
    const horizontalPadding = 40;
    const raw = Math.floor((SCREEN_WIDTH - horizontalPadding - gap * (wordLength - 1)) / wordLength);
    return Math.max(32, Math.min(52, raw));
  }, [wordLength]);

  async function finishGame(finalStatus: 'won' | 'gave_up', finalChain: string[], finalHints: number) {
    if (savedRef.current) return;
    savedRef.current = true;

    setStatus(finalStatus);
    const finalElapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
    setElapsed(finalElapsed);

    const steps = finalChain.length - 1;
    const won = finalStatus === 'won';

    const stats = await loadLadderStats();
    const modeStats = mode === 'daily' ? stats.daily : stats.practice;

    modeStats.gamesPlayed += 1;
    if (won) modeStats.gamesWon += 1;
    else modeStats.gamesGivenUp += 1;
    modeStats.totalSteps += steps;
    modeStats.totalParSteps += puzzle.par;
    modeStats.totalTimeSeconds += finalElapsed;
    modeStats.hintsUsed += finalHints;

    if (won) {
      if (modeStats.fastestTimeSeconds == null || finalElapsed < modeStats.fastestTimeSeconds) {
        modeStats.fastestTimeSeconds = finalElapsed;
      }
      const overPar = steps - puzzle.par;
      if (modeStats.bestStepsOverPar == null || overPar < modeStats.bestStepsOverPar) {
        modeStats.bestStepsOverPar = overPar;
      }
      if (steps === puzzle.par) modeStats.perfectSolves += 1;
      if (finalHints === 0) modeStats.hintFreeWins += 1;
      if (difficulty === 'easy') modeStats.easyWins += 1;
      if (difficulty === 'medium') modeStats.mediumWins += 1;
      if (difficulty === 'hard') modeStats.hardWins += 1;
    }

    let streakCurrent: number | null = null;
    let streakBest: number | null = null;

    if (mode === 'daily') {
      const prevLock = await loadDailyLock();
      const newStreak = computeNextStreak(won, prevLock, modeStats.currentStreak);
      modeStats.currentStreak = newStreak;
      modeStats.bestStreak = Math.max(modeStats.bestStreak, newStreak);
      streakCurrent = modeStats.currentStreak;
      streakBest = modeStats.bestStreak;

      await saveDailyLock({
        dateISO: getTodayDateString(),
        result: won ? 'won' : 'gave_up',
        steps,
        par: puzzle.par,
        timeSeconds: finalElapsed,
        hintsUsed: finalHints,
        start: puzzle.start,
        end: puzzle.end,
        chain: finalChain,
      });
      await saveLadderDailyHistoryEntry({
        dateISO: getTodayDateString(),
        result: won ? 'won' : 'lost',
        detail: won
          ? `${steps} step${steps !== 1 ? 's' : ''} (par ${puzzle.par})${steps === puzzle.par ? ' ★' : ''}`
          : 'Gave Up',
      });
      await clearDailyProgress();

      if (won) maybeRequestReview(newStreak);
      if (won) maybeFlagReminderOptIn(newStreak);
      syncDailyReminder();
    } else {
      // Practice game finished — clear saved progress so the next game starts fresh.
      await clearQuickPlayProgress();
    }

    await saveLadderStats(stats);

    const result: LadderGameResult = {
      mode,
      difficulty,
      won,
      steps,
      par: puzzle.par,
      timeSeconds: finalElapsed,
      hintsUsed: finalHints,
    };
    const newlyUnlocked = await checkLadderAchievements(result, stats);
    if (newlyUnlocked.length > 0) setPendingAchievements((prev) => [...prev, ...newlyUnlocked]);

    setFinalStreaks({ current: streakCurrent, best: streakBest });
    setShowResult(true);
  }

  const handleKeyPress = (key: string) => {
    if (status !== 'playing') return;
    setError(null);
    const firstEmpty = currentCells.indexOf('');
    // Row already full — no letter lands, so no tick.
    if (firstEmpty === -1) return;
    HapticManager.wordLadder.keyPress();
    const next = [...currentCells];
    next[firstEmpty] = key;
    setCurrentCells(next);
  };

  const handleBackspace = () => {
    if (status !== 'playing') return;
    setError(null);
    const next = [...currentCells];
    let deleted = false;
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i] !== '') {
        next[i] = '';
        deleted = true;
        break;
      }
    }
    // Nothing to delete — no tick.
    if (deleted) HapticManager.wordLadder.keyPress();
    setCurrentCells(next);
  };

  const handleSubmit = () => {
    if (status !== 'playing') return;
    if (currentCells.some((c) => c === '')) {
      HapticManager.wordLadder.stepRejected();
      setError('Fill in all letters');
      return;
    }
    const guess = currentCells.join('').toLowerCase();
    const last = chain[chain.length - 1];

    if (guess === last) {
      HapticManager.wordLadder.stepRejected();
      setError('That’s the same word');
      return;
    }
    if (chain.includes(guess)) {
      HapticManager.wordLadder.stepRejected();
      setError('Already used that word');
      return;
    }
    if (!isOneLetterOff(last, guess)) {
      HapticManager.wordLadder.stepRejected();
      setError('Change exactly one letter');
      return;
    }
    if (!isValidWord(guess)) {
      HapticManager.wordLadder.stepRejected();
      setError('Not a real word');
      // The player already proved they know the one-letter rule to get here, so
      // a rejection at this point is a decent signal the word list is missing
      // something rather than that they were guessing.
      recordRejectedWord('wordladder', guess);
      return;
    }

    const newChain = [...chain, guess];
    setChain(newChain);
    setCurrentCells(Array(wordLength).fill(''));
    setError(null);

    if (guess === puzzle.end) {
      // Target reached — the one success() in this game.
      HapticManager.wordLadder.reachedTarget();
      finishGame('won', newChain, hintsUsed);
    } else {
      // Each accepted rung is a small proof of progress.
      HapticManager.wordLadder.stepAccepted();
    }
  };

  const handleHint = () => {
    if (mode === 'daily' || status !== 'playing' || hintsUsed >= MAX_HINTS) return;
    const last = chain[chain.length - 1];
    // Exclude words already in the chain so the hint never points back at a
    // word that would fail the "already used" check on submit.
    const path = getHintPath(last, puzzle.end, chain);
    if (!path || path.length < 2) {
      setError('No hint available from here — try Give Up');
      return;
    }
    const nextWord = path[1];
    const idx = diffIndex(last, nextWord);
    if (idx === -1) return;

    const next = [...currentCells];
    next[idx] = nextWord[idx].toUpperCase();
    setCurrentCells(next);
    setHintsUsed((h) => h + 1);
    setError(null);
  };

  const [showGiveUpConfirm, setShowGiveUpConfirm] = useState(false);

  const handleGiveUp = () => {
    if (status !== 'playing') return;
    setShowGiveUpConfirm(true);
  };

  const confirmGiveUp = () => {
    setShowGiveUpConfirm(false);
    finishGame('gave_up', chain, hintsUsed);
  };

  // Daily is a single continuous attempt, but leaving mid-attempt no longer
  // Chain is autosaved on every move — leaving just freezes progress in place.

  const isWin = status === 'won';
  const displayChain =
    alreadyLocked && lockedResult
      ? lockedResult.chain && lockedResult.chain.length > 0
        ? lockedResult.chain
        : [lockedResult.start]
      : chain;
  const displayEnd = alreadyLocked && lockedResult ? lockedResult.end : puzzle.end;
  const displaySteps = alreadyLocked && lockedResult ? lockedResult.steps : chain.length - 1;

  // Unlike Furdle/Anagrams, the start and end words are shown to the player
  // from the very first screen — they're the puzzle prompt, not a secret —
  // and any valid path between them counts, so showing the actual climbed
  // chain isn't a spoiler the way a solution word would be. Safe to reveal
  // for both Daily and Practice.
  const shareHints = alreadyLocked && lockedResult ? lockedResult.hintsUsed : hintsUsed;
  const shareTimeSeconds = alreadyLocked && lockedResult ? lockedResult.timeSeconds : elapsed;

  const shareText = useMemo(() => {
    const header = mode === 'daily' ? `WORD LADDER DAILY — ${formatDisplayDate()}` : 'WORD LADDER';
    const climbLine = displayChain.map((w) => w.toUpperCase()).join(' → ');
    const minutes = Math.floor(shareTimeSeconds / 60);
    const seconds = shareTimeSeconds % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    const stepWord = displaySteps === 1 ? 'step' : 'steps';

    const resultLine = isWin
      ? `${displaySteps} ${stepWord} (par ${puzzle.par}) · ${getGolfTerm(displaySteps, puzzle.par)}`
      : `Gave up at ${displaySteps} ${stepWord} (par ${puzzle.par})`;

    const statsLine = `${timeStr}${shareHints > 0 ? ` · ${shareHints} hint${shareHints === 1 ? '' : 's'}` : ''}`;

    const lines: string[] = [header, climbLine, '', resultLine, statsLine];
    if (mode === 'daily' && finalStreaks.current && finalStreaks.current > 1) {
      lines.push(`${finalStreaks.current} day streak`);
    }
    lines.push('', 'wordfury.app');

    return lines.join('\n');
  }, [mode, displayChain, displaySteps, puzzle.par, isWin, shareTimeSeconds, shareHints, finalStreaks]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background.backgroundColor }]}>
      <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />

      {/* Achievement Popup */}
      <AchievementPopup
        achievement={currentPopupAchievement}
        onDismiss={() => setCurrentPopupAchievement(null)}
        backgroundColor={background.cardColor}
        textColor={background.textColor}
      />

      <ConfirmModal
        visible={showGiveUpConfirm}
        title="Give Up?"
        message="This will end the game and reveal the answer. Are you sure?"
        cancelText="Keep Playing"
        confirmText="Give Up"
        onCancel={() => setShowGiveUpConfirm(false)}
        onConfirm={confirmGiveUp}
        backgroundColor={background.cardColor}
        textColor={background.textColor}
        secondaryText={background.secondaryText}
        borderColor={background.borderColor}
      />

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onGoHome}>
          <Text style={[styles.backText, { color: background.secondaryText }]}>← Games</Text>
        </Pressable>
        <Text style={[styles.title, { color: background.textColor }]}>
          {mode === 'daily' ? 'Daily Ladder' : 'Word Ladder'}
        </Text>
        <View style={styles.timerBox}>
          <Text style={[styles.timerText, { color: background.secondaryText }]}>
            {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.ladderScroll}
        contentContainerStyle={styles.ladderContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Confirmed rungs */}
        {displayChain.map((word, i) => {
          const prevWord = i > 0 ? displayChain[i - 1] : null;
          const changed = prevWord ? diffIndex(prevWord, word) : -1;
          const isStart = i === 0;
          return (
            <View key={`${word}-${i}`} style={styles.rowWrap}>
              {isStart && <Text style={[styles.rowLabel, { color: background.secondaryText }]}>START</Text>}
              <View style={styles.tileRow}>
                {buildTiles(word, wordLength).map((letter, ci) => (
                  <View
                    key={ci}
                    style={[
                      styles.tile,
                      {
                        width: tileSize,
                        height: tileSize,
                        backgroundColor: background.cardColor,
                        borderColor: ci === changed ? '#4ecca3' : background.borderColor,
                        borderWidth: ci === changed ? 2.5 : 1.5,
                      },
                    ]}
                  >
                    <Text style={[styles.tileText, { color: background.textColor, fontSize: tileSize * 0.42 }]}>
                      {letter.trim()}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        {/* Active input row */}
        {status === 'playing' && !alreadyLocked && (
          <View style={styles.rowWrap}>
            <View style={styles.tileRow}>
              {currentCells.map((letter, ci) => (
                <View
                  key={ci}
                  style={[
                    styles.tile,
                    {
                      width: tileSize,
                      height: tileSize,
                      backgroundColor: background.cardColor,
                      borderColor: error ? semantic.wrong : background.borderColor,
                      borderWidth: 1.5,
                    },
                  ]}
                >
                  <Text style={[styles.tileText, { color: background.textColor, fontSize: tileSize * 0.42 }]}>
                    {letter}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Target rung */}
        <View style={styles.rowWrap}>
          <Text style={[styles.rowLabel, { color: background.secondaryText }]}>TARGET</Text>
          <View style={styles.tileRow}>
            {buildTiles(displayEnd, wordLength).map((letter, ci) => (
              <View
                key={ci}
                style={[
                  styles.tile,
                  styles.targetTile,
                  {
                    width: tileSize,
                    height: tileSize,
                    borderColor: '#d4a017',
                    backgroundColor: isWin ? '#4ecca322' : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.tileText, { color: background.textColor, fontSize: tileSize * 0.42 }]}>
                  {letter.trim()}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Error message */}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Controls — Daily has no hints, only Quick Play does. Hint itself */}
      {/* floats separately in the bottom-right corner (matches Anagrams). */}
      {status === 'playing' && !alreadyLocked && (
        <View style={styles.controlsRow}>
          <Pressable style={[styles.controlButton, { borderColor: background.borderColor }]} onPress={handleGiveUp}>
            <FlagOff size={16} color={background.textColor} />
            <Text style={[styles.controlButtonText, { color: background.textColor }]}>Give Up</Text>
          </Pressable>
        </View>
      )}

      {mode !== 'daily' && status === 'playing' && !alreadyLocked && (
        <Pressable
          style={[
            styles.hintFab,
            { backgroundColor: background.cardColor, borderColor: background.borderColor },
            hintsUsed >= MAX_HINTS && styles.controlButtonDisabled,
          ]}
          onPress={handleHint}
          disabled={hintsUsed >= MAX_HINTS}
        >
          <Lightbulb size={22} color={background.textColor} />
        </Pressable>
      )}

      {/* Keyboard — same sizing/spacing model as Wordle: keys stretch to fill */}
      {/* the row width, BACK weighted wider than letter keys, ENTER as its */}
      {/* own pill button below the keyboard. */}
      {status === 'playing' && !alreadyLocked && (
        <View style={styles.bottomControls}>
          <View style={styles.keyboard}>
            {KEYBOARD_ROWS.map((row, ri) => {
              const weights = row.map((k) => (k === 'BACK' ? 1.6 : 1));
              const totalWeight = weights.reduce((a, b) => a + b, 0);
              const availableWidth =
                SCREEN_WIDTH - KEYBOARD_HORIZONTAL_PADDING * 2 - KEY_GAP * (row.length - 1);
              const unit = availableWidth / totalWeight;

              return (
                <View key={ri} style={styles.keyboardRow}>
                  {row.map((k, idx) => {
                    const keyWidth = unit * weights[idx];
                    const isBack = k === 'BACK';
                    return (
                      <Pressable
                        key={k}
                        style={({ pressed }) => [
                          styles.key,
                          {
                            width: keyWidth,
                            marginHorizontal: KEY_GAP / 2,
                            backgroundColor: background.cardColor,
                            borderColor: background.borderColor,
                            transform: [{ scale: pressed ? 0.9 : 1 }],
                          },
                        ]}
                        onPress={isBack ? handleBackspace : () => handleKeyPress(k)}
                      >
                        <Text
                          style={[
                            styles.keyText,
                            { color: background.textColor },
                            isBack && styles.keyBackText,
                          ]}
                        >
                          {isBack ? '⌫' : k}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </View>

          <Pressable
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.enterButton,
              { borderColor: background.borderColor, backgroundColor: background.cardColor, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Text style={[styles.enterText, { color: background.textColor }]}>ENTER</Text>
          </Pressable>
        </View>
      )}

      <LadderResultOverlay
        visible={showResult}
        mode={mode}
        status={alreadyLocked && lockedResult ? (lockedResult.result === 'won' ? 'won' : 'gave_up') : status === 'won' ? 'won' : 'gave_up'}
        startWord={puzzle.start}
        endWord={puzzle.end}
        steps={alreadyLocked && lockedResult ? lockedResult.steps : chain.length - 1}
        par={puzzle.par}
        timeSeconds={alreadyLocked && lockedResult ? lockedResult.timeSeconds : elapsed}
        hintsUsed={alreadyLocked && lockedResult ? lockedResult.hintsUsed : hintsUsed}
        currentStreak={finalStreaks.current}
        bestStreak={finalStreaks.best}
        nextDailySecondsRemaining={mode === 'daily' ? parseCountdownSeconds(countdown) : null}
        shareText={shareText}
        onClose={() => {
          // Just dismiss the overlay — the ladder chain built above stays
          // visible instead of bouncing the player back to the menu.
          setShowResult(false);
        }}
        onPlayAgain={() => {
          setShowResult(false);
          onPlayAgain?.();
        }}
        onGoHome={onGoHome}
        achievement={currentPopupAchievement}
        onDismissAchievement={() => setCurrentPopupAchievement(null)}
      />
    </SafeAreaView>
  );
};

function parseCountdownSeconds(countdown: string): number | null {
  const match = countdown.match(/(\d+)h (\d+)m (\d+)s/);
  if (!match) return null;
  const [, h, m, s] = match;
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s);
}

export default LadderPlayScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
  },
  backButton: { padding: 8 },
  backText: { fontSize: 15, fontWeight: '500' },
  title: { fontSize: 18, fontWeight: 'bold' },
  timerBox: { width: 60, alignItems: 'flex-end', paddingRight: 4 },
  timerText: { fontSize: 15, fontWeight: '600' },

  ladderScroll: { flex: 1 },
  ladderContent: { paddingHorizontal: 20, paddingTop: 6, alignItems: 'center' },
  rowWrap: { alignItems: 'center', marginBottom: 8 },
  rowLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  tileRow: { flexDirection: 'row', gap: 6 },
  tile: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetTile: { borderStyle: 'dashed', borderWidth: 2 },
  tileText: { fontWeight: '900' },

  errorText: {
    textAlign: 'center',
    color: '#e94560',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },

  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 12,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  controlButtonDisabled: { opacity: 0.4 },
  controlButtonText: { fontSize: 13, fontWeight: '700' },
  // Hint floats on its own in the bottom-right corner, matching Anagrams'
  // floating hint button exactly — same size/position/border.
  hintFab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottomControls: {
    paddingHorizontal: KEYBOARD_HORIZONTAL_PADDING,
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 6,
  },
  keyboard: { alignSelf: 'stretch' },
  keyboardRow: { flexDirection: 'row', justifyContent: 'center', marginVertical: 3 },
  key: {
    height: 52,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  keyBackText: { fontSize: 18 },
  enterButton: {
    marginTop: 8,
    alignSelf: 'center',
    borderWidth: 2,
    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 999,
  },
  enterText: { fontSize: 14, fontWeight: '900', letterSpacing: 2 },
});
