// src/wordsearch/PlayScreen.tsx

import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/shared/ThemeContext';
import { HapticManager } from '../shared/HapticManager';
import { COLORS } from '../../src/shared/theme';
import { useSemanticColors } from '../shared/semanticColors';
import { WORD_SEARCH_THEMES, type WordSearchThemeId } from '../../src/wordsearch/data/themes';
import type { PlacedWord, WordSearchPuzzle } from '../../src/wordsearch/utils/generator';
import { DIFFICULTY_CONFIG } from '../../src/wordsearch/utils/difficultyConfig';
import { checkWordSearchAchievements, WS_ACHIEVEMENTS, type WSAchievement } from '../../src/wordsearch/utils/wsAchievements';
import {
  saveWordSearchDailyResult,
  updateWordSearchStats,
  loadWordSearchStats,
  loadWordSearchDailyProgress,
  saveWordSearchDailyProgress,
  clearWordSearchDailyProgress,
  saveWordSearchDailyLock,
  saveWordSearchPracticeProgress,
  clearWordSearchPracticeProgress,
  type WordSearchStats,
  type WordSearchDailyProgress,
  type WordSearchDailyLock,
  saveWSDailyHistoryEntry,
 WordSearchPracticeProgress } from '../../src/wordsearch/utils/wsStorage';
import { useCountdownToMidnight, getTodayDateString } from '../../src/wordsearch/utils/storage';
import { maybeRequestReview } from '../../src/shared/reviewPrompt';
import { syncDailyReminder, maybeFlagReminderOptIn } from '../../src/shared/dailyReminders';
import { AchievementPopup } from '../../src/shared/AchievementPopup';
import WordSearchResultOverlay, { type WordSearchResultData } from '../../src/wordsearch/components/WordSearchResultOverlay';


const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Result data shape ─────────────────────────────────────────────────────────
type ResultData = WordSearchResultData;

interface PlayScreenProps {
  themeId: WordSearchThemeId;
  difficulty: string;
  puzzleData: WordSearchPuzzle;
  isDaily?: boolean;
  timeLimit?: number; // seconds — for daily countdown mode
  initialProgress?: WordSearchDailyProgress | null; // daily-only: resume from a previous session
  initialPracticeProgress?: WordSearchPracticeProgress | null; // practice-only: resume mid-game
  lockedResult?: WordSearchDailyLock | null; // daily-only: today's attempt is already finished — show results, don't replay
}

interface Cell { row: number; col: number }

interface GameState {
  score: number;
  foundWords: PlacedWord[];
  elapsedSeconds: number;
  /** Cells permanently highlighted (found words) */
  foundCells: Cell[];
  /** Cells currently being dragged over */
  currentSelection: Cell[];
}

// All 8 valid word-search directions
const DIRECTIONS = [
  { dr: 0,  dc: 1  }, // RIGHT
  { dr: 0,  dc: -1 }, // LEFT
  { dr: 1,  dc: 0  }, // DOWN
  { dr: -1, dc: 0  }, // UP
  { dr: 1,  dc: 1  }, // DOWNRIGHT
  { dr: 1,  dc: -1 }, // DOWNLEFT
  { dr: -1, dc: 1  }, // UPRIGHT
  { dr: -1, dc: -1 }, // UPLEFT
];

/**
 * Given a start and end cell, snap the drag to the nearest of the 8 valid
 * directions and return every cell along that line. Never returns empty —
 * falls back to [start] if the drag is zero length.
 */
function buildSelectionLine(
  start: Cell,
  end: Cell,
  numRows: number,
  numCols: number,
): Cell[] {
  const dr = end.row - start.row;
  const dc = end.col - start.col;

  if (dr === 0 && dc === 0) return [start];

  // Find the direction whose unit vector best matches the drag vector.
  // Cosine similarity: largest dot product with the normalised drag = best match.
  const dragMag = Math.sqrt(dr * dr + dc * dc);
  let bestDir = DIRECTIONS[0];
  let bestCos = -Infinity;
  for (const d of DIRECTIONS) {
    const dirMag = Math.sqrt(d.dr * d.dr + d.dc * d.dc); // 1 for cardinal, √2 for diagonal
    const cos = (dr * d.dr + dc * d.dc) / (dragMag * dirMag);
    if (cos > bestCos) {
      bestCos = cos;
      bestDir = d;
    }
  }

  // Project the drag vector onto the chosen direction to get number of steps.
  // lenSq = 1 for cardinal, 2 for diagonal — this correctly scales the projection.
  const lenSq = bestDir.dr * bestDir.dr + bestDir.dc * bestDir.dc;
  const steps = Math.max(0, Math.round((dr * bestDir.dr + dc * bestDir.dc) / lenSq));

  const cells: Cell[] = [];
  for (let i = 0; i <= steps; i++) {
    const r = start.row + bestDir.dr * i;
    const c = start.col + bestDir.dc * i;
    // Clamp to grid bounds
    if (r >= 0 && r < numRows && c >= 0 && c < numCols) {
      cells.push({ row: r, col: c });
    }
  }
  return cells.length > 0 ? cells : [start];
}

/** Get cells for a placed word */
function getWordCells(word: PlacedWord): Cell[] {
  const vectors: Record<string, { dr: number; dc: number }> = {
    RIGHT: { dr: 0, dc: 1 },
    LEFT: { dr: 0, dc: -1 },
    DOWN: { dr: 1, dc: 0 },
    UP: { dr: -1, dc: 0 },
    DOWNRIGHT: { dr: 1, dc: 1 },
    DOWNLEFT: { dr: 1, dc: -1 },
    UPRIGHT: { dr: -1, dc: 1 },
    UPLEFT: { dr: -1, dc: -1 },
  };
  const { dr, dc } = vectors[word.direction];
  const cells: Cell[] = [];
  for (let i = 0; i < word.length; i++) {
    cells.push({ row: word.row + dr * i, col: word.col + dc * i });
  }
  return cells;
}

/** Check if two cell arrays match (same cells in any order — forward or backward) */
function selectionMatchesWord(selection: Cell[], wordCells: Cell[]): boolean {
  if (selection.length !== wordCells.length) return false;
  const fwd = selection.every((c, i) => c.row === wordCells[i].row && c.col === wordCells[i].col);
  const rev = selection.every(
    (c, i) =>
      c.row === wordCells[wordCells.length - 1 - i].row &&
      c.col === wordCells[wordCells.length - 1 - i].col
  );
  return fwd || rev;
}

/**
 * Check if a selection spells out a target word by its LETTERS (forward or
 * backward), independent of where that word was actually placed.
 *
 * Word lists sometimes contain a short word (like "PHO") that also turns up
 * by coincidence somewhere else in the grid, made up of other words' letters
 * and filler. selectionMatchesWord alone only accepts the one spot the
 * generator placed the word at, so tracing that coincidental second "PHO"
 * read as "not a match" even though it's really spelled out on the board —
 * confusing and, from the player's side, just wrong. Word search games
 * conventionally accept any straight line that spells the word, so this
 * checks the letters actually under the selection against the word text.
 */
function selectionSpellsWord(selection: Cell[], grid: string[][], word: string): boolean {
  if (selection.length !== word.length) return false;
  const letters = selection.map(c => grid[c.row]?.[c.col] ?? '').join('');
  return letters === word || letters === [...word].reverse().join('');
}

// Padding inside the grid container — must stay in sync with styles.gridContainer
const GRID_PADDING = 8;

const PlayScreen: React.FC<PlayScreenProps> = ({
  themeId,
  difficulty,
  puzzleData,
  isDaily = false,
  timeLimit,
  initialProgress,
  initialPracticeProgress,
  lockedResult,
}) => {
  const themeName = WORD_SEARCH_THEMES.find(t => t.id === themeId)?.name ?? themeId;
  const { background } = useTheme();
  // Found cells have to use the same source as the results-screen answer key.
  // If the grid painted found words green during play while the answer key
  // painted them orange in Color Blind Mode, the same word would change colour
  // between finding it and reviewing it.
  const semantic = useSemanticColors();
  const countdown = useCountdownToMidnight();

  // Today's Daily was already completed — this is a "View Results" re-open,
  // not a fresh attempt. Same pattern as Anagrams' alreadyLocked/lockedResult.
  const alreadyLocked = isDaily && !!lockedResult;

  // Results overlay state — pre-populated from the lock so it opens straight
  // to results instead of a blank puzzle the player could accidentally replay.
  const [resultData, setResultData] = useState<ResultData | null>(
    alreadyLocked && lockedResult
      ? {
          score: lockedResult.score,
          foundWords: lockedResult.foundWordTexts.length,
          totalWords: lockedResult.totalWords,
          allFound: lockedResult.allFound,
          timeString: lockedResult.timeString,
          multiplier: lockedResult.multiplier,
          timeBonus: lockedResult.timeBonus,
          foundWordsUnknown: lockedResult.foundWordsUnknown ?? false,
          newAchievements: [], // already shown the day it was earned — don't replay the toast
        }
      : null
  );
  const [lifetimeStats, setLifetimeStats] = useState<WordSearchStats | null>(null);
  const [pendingAchievements, setPendingAchievements] = useState<WSAchievement[]>([]);
  const [currentPopup, setCurrentPopup] = useState<WSAchievement | null>(null);

  useEffect(() => {
    if (pendingAchievements.length > 0 && !currentPopup) {
      setCurrentPopup(pendingAchievements[0]);
      setPendingAchievements(prev => prev.slice(1));
    }
  }, [pendingAchievements, currentPopup]);

  // Resume from a previous session: the puzzle grid is deterministic per
  // day (same seed), so we can match saved word strings back against
  // puzzleData.words to reconstruct full PlacedWord + highlighted cells.
  const initialGameState: GameState = (() => {
    if (alreadyLocked && lockedResult) {
      const restoredWords = puzzleData.words.filter(w => lockedResult.foundWordTexts.includes(w.word));
      const restoredCells = restoredWords.flatMap(getWordCells);
      return {
        score: lockedResult.score,
        foundWords: restoredWords,
        elapsedSeconds: lockedResult.elapsedSeconds,
        foundCells: restoredCells,
        currentSelection: [],
      };
    }
    if (!isDaily && initialPracticeProgress) {
      const restoredWords = puzzleData.words.filter(w => initialPracticeProgress.foundWordTexts.includes(w.word));
      const restoredCells = restoredWords.flatMap(getWordCells);
      return {
        score: initialPracticeProgress.score,
        foundWords: restoredWords,
        elapsedSeconds: initialPracticeProgress.elapsedSeconds,
        foundCells: restoredCells,
        currentSelection: [],
      };
    }
    if (!initialProgress) {
      return { score: 0, foundWords: [], elapsedSeconds: 0, foundCells: [], currentSelection: [] };
    }
    const restoredWords = puzzleData.words.filter(w => initialProgress.foundWordTexts.includes(w.word));
    const restoredCells = restoredWords.flatMap(getWordCells);
    return {
      score: initialProgress.score,
      foundWords: restoredWords,
      elapsedSeconds: initialProgress.elapsedSeconds,
      foundCells: restoredCells,
      currentSelection: [],
    };
  })();

  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [gameFinished, setGameFinished] = useState(alreadyLocked);

  // Combo system
  const lastWordFoundAt = useRef<number>(0);
  const comboCount = useRef<number>(0);
  const [comboDisplay, setComboDisplay] = useState<{ multiplier: number; count: number } | null>(null);
  const comboClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hints (Easy only)
  const diffConfig = DIFFICULTY_CONFIG[difficulty as keyof typeof DIFFICULTY_CONFIG];
  const [hintsRemaining, setHintsRemaining] = useState(diffConfig?.hints ?? 0);
  const [hintCell, setHintCell] = useState<Cell | null>(null);
  const hintClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintAnim = useRef(new Animated.Value(1)).current;

  // Grid layout measured values
  const gridRef = useRef<View>(null);
  const gridLayout = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const cellWidth = useRef(0);
  const cellHeight = useRef(0);
  const numCols = puzzleData.grid[0]?.length ?? 1;
  const numRows = puzzleData.grid.length;

  // Drag state (refs, not state — don't need re-render mid-drag)
  const dragStart = useRef<Cell | null>(null);
  const lastValidCell = useRef<Cell | null>(null);
  const gameFinishedRef = useRef(false);

  // Timer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeLimitRef = useRef(timeLimit);
  const triggerFinishRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (gameFinished) return;
    timerRef.current = setInterval(() => {
      setGameState(prev => {
        const next = prev.elapsedSeconds + 1;
        // Auto-finish when countdown expires
        if (timeLimitRef.current && next >= timeLimitRef.current) {
          setTimeout(() => triggerFinishRef.current?.(), 0);
        } else if (timeLimitRef.current && timeLimitRef.current - next === 10) {
          // Single warning at exactly 10s left — not a repeating countdown buzz.
          HapticManager.wordSearch.timeRunningOut();
        }
        return { ...prev, elapsedSeconds: next };
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameFinished]);

  const measureGrid = () => {
    // measureInWindow gives coordinates relative to the window, which matches
    // the pageX/pageY values from touch events — more reliable than measure().
    gridRef.current?.measureInWindow((x, y, width, height) => {
      gridLayout.current = { x, y, width, height };
      // Cell size accounts for the container padding on both sides
      cellWidth.current = (width - GRID_PADDING * 2) / numCols;
      cellHeight.current = (height - GRID_PADDING * 2) / numRows;
    });
  };

  const getCellFromPoint = (pageX: number, pageY: number): Cell | null => {
    const layout = gridLayout.current;
    if (!layout || cellWidth.current === 0) return null;

    // Subtract container origin AND inner padding before dividing by cell size
    const col = Math.floor((pageX - layout.x - GRID_PADDING) / cellWidth.current);
    const row = Math.floor((pageY - layout.y - GRID_PADDING) / cellHeight.current);

    if (row >= 0 && row < numRows && col >= 0 && col < numCols) {
      return { row, col };
    }
    return null;
  };

  // Keep refs in sync for use inside PanResponder closures
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { gameFinishedRef.current = gameFinished; }, [gameFinished]);

  // Autosave Daily progress on every change so the attempt survives the app
  // being backgrounded, force-quit, or swiped away mid-game.
  useEffect(() => {
    if (!isDaily || gameFinished) return;
    saveWordSearchDailyProgress({
      dateISO: getTodayDateString(),
      foundWordTexts: gameState.foundWords.map(w => w.word),
      score: gameState.score,
      elapsedSeconds: gameState.elapsedSeconds,
    });
  }, [isDaily, gameFinished, gameState.foundWords, gameState.score, gameState.elapsedSeconds]);

  // Autosave practice progress on every change so the attempt survives the app
  // being backgrounded or force-quit mid-game.
  useEffect(() => {
    if (isDaily || gameFinished) return;
    saveWordSearchPracticeProgress({
      theme: themeId,
      difficulty,
      foundWordTexts: gameState.foundWords.map(w => w.word),
      score: gameState.score,
      elapsedSeconds: gameState.elapsedSeconds,
      gridLetters: puzzleData.grid,
      wordPlacements: puzzleData.words.map(w => ({
        word: w.word,
        startRow: w.row,
        startCol: w.col,
        direction: w.direction,
      })),
    });
  }, [isDaily, gameFinished, themeId, difficulty, puzzleData, gameState.foundWords, gameState.score, gameState.elapsedSeconds]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !gameFinishedRef.current,
      onMoveShouldSetPanResponder: () => !gameFinishedRef.current,
      // Once the finger is down on the grid, this drag owns the gesture until
      // it lifts. Word search selection is a long free-form pan across the
      // whole screen, so it is the single most stealable gesture in the app:
      // the root Stack's full-screen back gesture used to grab it right after
      // onPanResponderGrant, which lit the first cell and then terminated the
      // drag -- the selection appeared and instantly vanished, and the game
      // could not be played at all. Refusing termination keeps any future
      // parent recognizer from doing the same thing.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: evt => {
        // Re-measure every touch so the grid position is always fresh
        // (handles scrolling, keyboard appearing, orientation changes, etc.)
        gridRef.current?.measureInWindow((x, y, width, height) => {
          gridLayout.current = { x, y, width, height };
          cellWidth.current = (width - GRID_PADDING * 2) / numCols;
          cellHeight.current = (height - GRID_PADDING * 2) / numRows;
        });
        const cell = getCellFromPoint(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
        if (!cell) return;
        dragStart.current = cell;
        lastValidCell.current = cell;
        HapticManager.wordSearch.cellCrossed();
        setGameState(prev => ({ ...prev, currentSelection: [cell] }));
      },

      onPanResponderMove: evt => {
        if (!dragStart.current) return;
        const cell = getCellFromPoint(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
        if (!cell) return;
        // Tick only when the selection enters a NEW cell. onPanResponderMove
        // fires every gesture frame, so without this a slow drag inside one
        // cell would buzz continuously.
        const prevCell = lastValidCell.current;
        if (!prevCell || prevCell.row !== cell.row || prevCell.col !== cell.col) {
          HapticManager.wordSearch.cellCrossed();
        }
        lastValidCell.current = cell;
        const line = buildSelectionLine(dragStart.current, cell, numRows, numCols);
        setGameState(prev => ({ ...prev, currentSelection: line }));
      },

      onPanResponderRelease: evt => {
        if (!dragStart.current) return;
        // Use last valid cell as fallback when finger lifts outside the grid
        const cell = getCellFromPoint(evt.nativeEvent.pageX, evt.nativeEvent.pageY)
          ?? lastValidCell.current;
        const line = cell
          ? buildSelectionLine(dragStart.current, cell, numRows, numCols)
          : [dragStart.current];
        lastValidCell.current = null;
        dragStart.current = null;

        const state = gameStateRef.current;
        let wordFound = false;

        for (const placedWord of puzzleData.words) {
          if (state.foundWords.some(fw => fw.word === placedWord.word)) continue;
          const wordCells = getWordCells(placedWord);
          // Highlight whichever cells actually spell the word: the generator's
          // placement when the selection matches it exactly, or the player's
          // own selection when it's a coincidental match elsewhere in the grid —
          // never highlight cells the player didn't actually select.
          const matchedCells = selectionMatchesWord(line, wordCells)
            ? wordCells
            : selectionSpellsWord(line, puzzleData.grid, placedWord.word)
            ? line
            : null;
          if (matchedCells) {
            const dc = DIFFICULTY_CONFIG[difficulty as keyof typeof DIFFICULTY_CONFIG];
            const diffMult = dc?.multiplier ?? 1;

            // Combo: word found within 5s of previous = streak
            const now = Date.now();
            const gap = lastWordFoundAt.current > 0
              ? (now - lastWordFoundAt.current) / 1000
              : 999;
            if (gap <= 5 && lastWordFoundAt.current > 0) {
              comboCount.current = Math.min(comboCount.current + 1, 4);
            } else {
              comboCount.current = 1;
            }
            lastWordFoundAt.current = now;

            const combo = comboCount.current;
            const comboMult = combo >= 4 ? 3 : combo >= 3 ? 2 : combo >= 2 ? 1.5 : 1;
            const scoreGain = Math.round(placedWord.word.length * 10 * diffMult * comboMult);

            // Show combo badge if multiplier is active
            if (combo >= 2) {
              if (comboClearTimer.current) clearTimeout(comboClearTimer.current);
              setComboDisplay({ multiplier: comboMult, count: combo });
              comboClearTimer.current = setTimeout(() => setComboDisplay(null), 1500);
            }

            const newFoundWords = [...state.foundWords, placedWord];
            const newFoundCells = [...state.foundCells, ...matchedCells];
            wordFound = true;

            setGameState(prev => ({
              ...prev,
              foundWords: newFoundWords,
              score: prev.score + scoreGain,
              foundCells: newFoundCells,
              currentSelection: [],
            }));

            if (newFoundWords.length === puzzleData.words.length) {
              // Puzzle cleared — the one success() in this game. Delayed so it
              // doesn't collide with the wordFound pulse just above.
              setTimeout(() => HapticManager.wordSearch.allWordsFound(), 250);
              setTimeout(() => triggerFinish(), 500);
            } else {
              HapticManager.wordSearch.wordFound();
            }
            break;
          }
        }

        if (!wordFound) {
          setGameState(prev => ({ ...prev, currentSelection: [] }));
        }
      },

      onPanResponderTerminate: () => {
        dragStart.current = null;
        setGameState(prev => ({ ...prev, currentSelection: [] }));
      },
    })
  ).current;

  const triggerFinish = async () => {
    if (gameFinished) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const state = gameStateRef.current;
    const diffConfig = DIFFICULTY_CONFIG[difficulty as keyof typeof DIFFICULTY_CONFIG];
    const multiplier = diffConfig?.multiplier ?? 1;
    const allWordsFound = state.foundWords.length === puzzleData.words.length;
    // Time bonus rewards finishing the WHOLE puzzle quickly — it must never
    // apply to an incomplete run, otherwise quitting early (fewer elapsed
    // seconds) would inflate the bonus instead of penalizing the early exit.
    const timeBonus = allWordsFound
      ? Math.max(0, Math.floor((300 / Math.max(state.elapsedSeconds, 1)) * multiplier))
      : 0;
    const finalScore = state.score + timeBonus;

    let dailyStreak = 0;
    let newlyUnlockedIds: string[] = [];

    try {
      // Load prev best before updating
      const { loadWordSearchStats } = await import('../../src/wordsearch/utils/wsStorage');
      const prevStats = await loadWordSearchStats();
      const prevBestScore = prevStats.bestScore;

      if (!isDaily) {
        clearWordSearchPracticeProgress().catch(() => {});
      }

      if (isDaily) {
        const dailyStats = await saveWordSearchDailyResult(
          allWordsFound ? 'won' : 'lost',
          finalScore
        );
        dailyStreak = dailyStats.streak;
        await clearWordSearchDailyProgress();
        if (allWordsFound) maybeRequestReview(dailyStreak);
        if (allWordsFound) maybeFlagReminderOptIn(dailyStreak);
        syncDailyReminder();

        const mins = Math.floor(state.elapsedSeconds / 60);
        const secs = state.elapsedSeconds % 60;
        await saveWordSearchDailyLock({
          dateISO: getTodayDateString(),
          score: finalScore,
          foundWordTexts: state.foundWords.map(w => w.word),
          totalWords: puzzleData.words.length,
          allFound: allWordsFound,
          timeString: `${mins}:${secs < 10 ? '0' : ''}${secs}`,
          elapsedSeconds: state.elapsedSeconds,
          multiplier,
          timeBonus,
        });
        await saveWSDailyHistoryEntry({
          dateISO: getTodayDateString(),
          result: allWordsFound ? 'won' : 'played',
          detail: `${state.foundWords.length}/${puzzleData.words.length} words${allWordsFound ? ' ★' : ''}`,
        });
      }

      const updatedStats = await updateWordSearchStats({
        won: allWordsFound,
        score: finalScore,
        elapsedSeconds: state.elapsedSeconds,
        difficulty,
        wordsFound: state.foundWords.length,
        isDaily,
      });

      const newAchievements = await checkWordSearchAchievements({
        stats: updatedStats,
        prevBestScore,
        currentGameScore: finalScore,
        currentGameSeconds: state.elapsedSeconds,
        currentGameDifficulty: difficulty,
        currentGameWon: allWordsFound,
        dailyStreak,
      });

      newlyUnlockedIds = newAchievements.map(a => a.id);
    } catch (error) {
      console.error('Failed to update stats:', error);
    }

    setGameFinished(true);

    const mins = Math.floor(state.elapsedSeconds / 60);
    const secs = state.elapsedSeconds % 60;
    const timeString = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    const newAchievements = newlyUnlockedIds
      .map(id => WS_ACHIEVEMENTS.find(a => a.id === id))
      .filter(Boolean) as WSAchievement[];

    loadWordSearchStats().then(setLifetimeStats);
    if (newAchievements.length > 0) setPendingAchievements(newAchievements);

    setResultData({
      score: finalScore,
      foundWords: state.foundWords.length,
      totalWords: puzzleData.words.length,
      allFound: allWordsFound,
      timeString,
      multiplier,
      timeBonus,
      newAchievements,
    });
  };

  // Register triggerFinish in ref so the timer interval can call it
  useEffect(() => {
    triggerFinishRef.current = triggerFinish;
  });


  const handleHint = (word: typeof puzzleData.words[0]) => {
    if (hintsRemaining <= 0) return;
    if (gameState.foundWords.some(fw => fw.word === word.word)) return;
    // Highlight the word's starting cell
    const startCell = { row: word.row, col: word.col };
    setHintCell(startCell);
    setHintsRemaining(h => h - 1);
    // Flash animation
    hintAnim.setValue(1);
    Animated.sequence([
      Animated.timing(hintAnim, { toValue: 0.2, duration: 300, useNativeDriver: true }),
      Animated.timing(hintAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(hintAnim, { toValue: 0.2, duration: 300, useNativeDriver: true }),
      Animated.timing(hintAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
    if (hintClearTimer.current) clearTimeout(hintClearTimer.current);
    hintClearTimer.current = setTimeout(() => setHintCell(null), 2000);
  };

  const handleBack = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    router.back();
  };

  // Progress is autosaved continuously — leaving mid-game just freezes it
  // exactly where you left off. No confirmation needed; just go.

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // All games are timed — always show countdown
  const remainingSeconds = timeLimit != null
    ? Math.max(0, timeLimit - gameState.elapsedSeconds)
    : null;
  const isLowTime = remainingSeconds !== null && remainingSeconds <= 30;
  const timerDisplay = remainingSeconds !== null
    ? formatTime(remainingSeconds)
    : formatTime(gameState.elapsedSeconds);

  // "Next Daily in" countdown, converted from the "HH:MM:SS" display string
  // to raw seconds for WordSearchResultOverlay (same shape every other
  // game's result overlay expects).
  const dailyCountdownSeconds = (() => {
    const parts = countdown.split(':').map(Number);
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  })();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background.backgroundColor }]}>
      <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.6} hitSlop={10}>
          <Text style={[styles.backText, { color: background.secondaryText }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: background.textColor }]}>Word Search</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {/* Theme label */}
      <View style={[styles.themeBar, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
        <Text style={[styles.infoLabel, { color: background.secondaryText }]}>
          {isDaily ? 'Daily Challenge' : 'Theme'}
        </Text>
        <Text style={[styles.themeName, { color: COLORS.accent }]}>{themeName}</Text>
      </View>

      {/* Info bar */}
      <View style={[styles.infoBar, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
        <View style={styles.infoItem}>
          <Text style={[styles.infoLabel, { color: background.secondaryText }]}>Score</Text>
          <Text style={[styles.infoValue, { color: COLORS.accent }]}>{gameState.score}</Text>
        </View>
        <View style={[styles.infoDivider, { backgroundColor: background.borderColor }]} />
        <View style={styles.infoItem}>
          <Text style={[styles.infoLabel, { color: background.secondaryText }]}>Time Left</Text>
          <Text style={[styles.infoValue, { color: isLowTime ? '#ef4444' : background.textColor }]}>
            {timerDisplay}
          </Text>
        </View>
        <View style={[styles.infoDivider, { backgroundColor: background.borderColor }]} />
        <View style={styles.infoItem}>
          <Text style={[styles.infoLabel, { color: background.secondaryText }]}>Found</Text>
          <Text style={[styles.infoValue, { color: background.textColor }]}>{gameState.foundWords.length}/{puzzleData.words.length}</Text>
        </View>
      </View>

      {/* Grid wrapper — position:relative for combo badge overlay */}
      <View style={styles.gridWrapper}>
        {/* Combo badge */}
        {comboDisplay && (
          <View style={styles.comboBadge} pointerEvents="none">
            <Text style={styles.comboBadgeText}>
              {comboDisplay.multiplier}× COMBO!
            </Text>
          </View>
        )}

        {/* Grid — PanResponder captures touches here */}
        <View
          ref={gridRef}
          style={[styles.gridContainer, { backgroundColor: background.cardColor }]}
          onLayout={measureGrid}
          {...panResponder.panHandlers}
        >
          {puzzleData.grid.map((row: string[], rIdx: number) => (
            <View key={rIdx} style={styles.gridRow}>
              {row.map((letter: string, cIdx: number) => {
                const isFound = gameState.foundCells.some(c => c.row === rIdx && c.col === cIdx);
                const isSelected = gameState.currentSelection.some(
                  c => c.row === rIdx && c.col === cIdx
                );
                const isHint = hintCell?.row === rIdx && hintCell?.col === cIdx;

                let cellBg = background.cardColor;
                let textColor = background.textColor;
                if (isFound) {
                  cellBg = semantic.correct;
                  textColor = semantic.correctText;
                } else if (isHint) {
                  // Amber stands alone here rather than being told apart from
                  // green or red, so it survives colour vision deficiency as a
                  // luminance signal and is left as-is.
                  cellBg = '#facc15';
                  textColor = '#000';
                } else if (isSelected) {
                  // Same hue as found, lower alpha: the in-progress vs found
                  // distinction is luminance, not colour, so it holds up too.
                  cellBg = semantic.correct + '55';
                  textColor = background.textColor;
                }

                const cellView = (
                  <View
                    key={`${rIdx}-${cIdx}`}
                    style={[
                      styles.gridCell,
                      {
                        backgroundColor: cellBg,
                        borderColor: isSelected ? semantic.correct : isHint ? '#f59e0b' : background.borderColor,
                      },
                    ]}
                  >
                    {isHint ? (
                      <Animated.Text style={[styles.cellText, { color: textColor, opacity: hintAnim }]}>
                        {letter}
                      </Animated.Text>
                    ) : (
                      <Text style={[styles.cellText, { color: textColor }]}>{letter}</Text>
                    )}
                  </View>
                );

                return cellView;
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Word list + finish button — scrollable below the grid */}
      <ScrollView
        style={styles.bottomScroll}
        contentContainerStyle={styles.bottomScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hints remaining indicator (Easy only) */}
        {difficulty === 'easy' && hintsRemaining > 0 && (
          <Text style={[styles.hintsLabel, { color: background.secondaryText }]}>
            {hintsRemaining} hint{hintsRemaining !== 1 ? 's' : ''} — tap a word to reveal its start
          </Text>
        )}

        <View style={styles.wordGrid}>
          {puzzleData.words.map((word, idx) => {
            const found = gameState.foundWords.some(fw => fw.word === word.word);
            const canHint = difficulty === 'easy' && !found && hintsRemaining > 0;

            const inner = (
              <Text
                style={[
                  styles.wordText,
                  {
                    color: found ? semantic.correct : background.textColor,
                    textDecorationLine: found ? 'line-through' : 'none',
                    opacity: found ? 0.6 : 1,
                  },
                ]}
              >
                {word.word}
              </Text>
            );

            return canHint ? (
              <TouchableOpacity key={idx} style={styles.wordRow} onPress={() => handleHint(word)}>
                {inner}
              </TouchableOpacity>
            ) : (
              <View key={idx} style={styles.wordRow}>
                {inner}
              </View>
            );
          })}
        </View>

      </ScrollView>

      {/* ── Achievement popup ── */}
      <AchievementPopup
        achievement={currentPopup}
        onDismiss={() => setCurrentPopup(null)}
        backgroundColor={background.cardColor}
        textColor={background.textColor}
      />


      {/* ── Results overlay (replaces separate results route) ── */}
      {resultData && (
        <WordSearchResultOverlay
          visible
          mode={isDaily ? 'daily' : 'practice'}
          themeName={themeName}
          difficulty={difficulty}
          resultData={resultData}
          lifetimeStats={lifetimeStats}
          nextDailySecondsRemaining={dailyCountdownSeconds}
          onClose={() => setResultData(null)}
          onPlayAgain={() => router.replace({ pathname: '/wordsearch/game', params: { themeId, difficulty } })}
          onGoHome={() => {
            // router.replace() mounts a brand-new /wordsearch screen and
            // unmounts this one as a separate step, so the finished grid
            // underneath the Modal flashes through in that gap. dismissTo
            // instead pops back to the hub screen already on the stack —
            // one transition, nothing left to flash.
            router.dismissTo('/wordsearch');
          }}
          achievement={currentPopup}
          onDismissAchievement={() => setCurrentPopup(null)}
          puzzleGrid={puzzleData.grid}
          puzzleWords={puzzleData.words}
          foundWordTexts={gameState.foundWords.map(w => w.word)}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  backButton: { padding: 8 },
  backText: { fontSize: 16, fontWeight: '500' },
  title: { fontSize: 22, fontWeight: 'bold' },
  headerPlaceholder: { width: 60 },
  themeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
    gap: 6,
  },
  themeName: { fontSize: 14, fontWeight: '700' },
  infoBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  infoItem: { flex: 1, alignItems: 'center' },
  infoLabel: { fontSize: 12, marginBottom: 4 },
  infoValue: { fontSize: 16, fontWeight: 'bold' },
  infoDivider: { width: 1, marginHorizontal: 8 },
  gridContainer: {
    padding: 8,
    borderRadius: 12,
    alignSelf: 'stretch',
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  gridCell: {
    flex: 1,
    aspectRatio: 1,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 1,
    borderRadius: 3,
  },
  cellText: {
    fontSize: 13,
    fontWeight: '700',
  },
  bottomScroll: {
    flex: 1,
  },
  bottomScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  gridWrapper: {
    position: 'relative',
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 0,
  },
  comboBadge: {
    position: 'absolute',
    top: -14,
    alignSelf: 'center',
    zIndex: 10,
    backgroundColor: '#f59e0b',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  comboBadgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  hintsLabel: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 6,
    fontStyle: 'italic',
  },
  wordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0,
  },
  wordRow: {
    width: '33.33%',
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  wordText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default PlayScreen;
