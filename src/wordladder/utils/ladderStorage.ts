// src/wordladder/utils/ladderStorage.ts
// AsyncStorage-backed persistence for Word Ladder — mirrors the pattern used
// by wordle/wordsearch (prefs, mode stats, daily lock + streak).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import type { LadderDifficulty } from './generator';

const STATS_KEY = 'wordladder_stats_v1';
const DAILY_LOCK_KEY = 'wordladder_daily_lock_v1';
const DAILY_PROGRESS_KEY = 'wordladder_daily_progress_v1';
const DAILY_PUZZLE_KEY = 'wordladder_daily_puzzle_v1';
const PREFS_KEY = 'wordladder_prefs_v1';

// ── Prefs ────────────────────────────────────────────────────────────────
export type LadderPrefs = {
  lastDifficulty: LadderDifficulty;
};

const DEFAULT_PREFS: LadderPrefs = {
  lastDifficulty: 'medium',
};

export async function loadLadderPrefs(): Promise<LadderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveLadderPrefs(prefs: LadderPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.warn('saveLadderPrefs error', e);
  }
}

// ── Stats ────────────────────────────────────────────────────────────────
export type LadderModeStats = {
  gamesPlayed: number;
  gamesWon: number;
  gamesGivenUp: number;
  currentStreak: number; // daily-only
  bestStreak: number; // daily-only
  totalSteps: number;
  totalParSteps: number; // sum of par for won games, for "avg over par" calc
  bestStepsOverPar: number | null; // smallest (steps - par) ever achieved, 0 = perfect
  totalTimeSeconds: number;
  fastestTimeSeconds: number | null;
  hintsUsed: number;
  perfectSolves: number; // steps === par
  hintFreeWins: number;
  easyWins: number;
  mediumWins: number;
  hardWins: number;
};

export type LadderStats = {
  practice: LadderModeStats;
  daily: LadderModeStats;
};

function emptyModeStats(): LadderModeStats {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    gamesGivenUp: 0,
    currentStreak: 0,
    bestStreak: 0,
    totalSteps: 0,
    totalParSteps: 0,
    bestStepsOverPar: null,
    totalTimeSeconds: 0,
    fastestTimeSeconds: null,
    hintsUsed: 0,
    perfectSolves: 0,
    hintFreeWins: 0,
    easyWins: 0,
    mediumWins: 0,
    hardWins: 0,
  };
}

export function emptyLadderStats(): LadderStats {
  return { practice: emptyModeStats(), daily: emptyModeStats() };
}

export async function loadLadderStats(): Promise<LadderStats> {
  try {
    const raw = await AsyncStorage.getItem(STATS_KEY);
    if (!raw) return emptyLadderStats();
    const parsed = JSON.parse(raw);
    return {
      practice: { ...emptyModeStats(), ...parsed.practice },
      daily: { ...emptyModeStats(), ...parsed.daily },
    };
  } catch (e) {
    console.warn('loadLadderStats error', e);
    return emptyLadderStats();
  }
}

export async function saveLadderStats(stats: LadderStats): Promise<void> {
  try {
    await AsyncStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    console.warn('saveLadderStats error', e);
  }
}

// ── Daily lock (one attempt per calendar day) ───────────────────────────
export type DailyLockState = {
  dateISO: string; // YYYY-MM-DD
  result: 'won' | 'gave_up';
  steps: number;
  par: number;
  timeSeconds: number;
  hintsUsed: number;
  start: string;
  end: string;
  // Persisted so the completed ladder chain can be viewed again later
  // (e.g. reopening the results screen from the menu) without an active session.
  chain?: string[];
};

export async function loadDailyLock(): Promise<DailyLockState | null> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_LOCK_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('loadDailyLock error', e);
    return null;
  }
}

export async function saveDailyLock(lock: DailyLockState): Promise<void> {
  try {
    await AsyncStorage.setItem(DAILY_LOCK_KEY, JSON.stringify(lock));
  } catch (e) {
    console.warn('saveDailyLock error', e);
  }
}

// ── Daily puzzle cache (pin today's puzzle the first time it's generated) ──
// generateDailyLadder() is a pure function of the date, but it also reads
// whatever word list is on-device *right now* — so if the dictionary changes
// between two opens on the same calendar day (a new build installing mid-day
// with an edited word file, which now happens routinely as tester-reported
// words get added), the "same" date seed can pick a different start/end pair
// out of the shifted pool. A tester reported exactly this: a different start
// word for the same Daily than she'd seen earlier that day. Caching the
// puzzle the first time it's generated each day, and reusing that cached copy
// for the rest of the day regardless of what the dictionary does later, is
// what actually makes "today's puzzle" a fixed thing rather than a
// recomputation that happens to usually agree with itself.
export type CachedDailyPuzzle = {
  dateISO: string; // YYYY-MM-DD — a cache from a different day is stale/ignored
  start: string;
  end: string;
  par: number;
  wordLength: number;
  solutionPath: string[];
};

export async function loadCachedDailyPuzzle(): Promise<CachedDailyPuzzle | null> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_PUZZLE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.dateISO !== getTodayDateString()) return null;
    return parsed;
  } catch (e) {
    console.warn('loadCachedDailyPuzzle error', e);
    return null;
  }
}

export async function saveCachedDailyPuzzle(puzzle: CachedDailyPuzzle): Promise<void> {
  try {
    await AsyncStorage.setItem(DAILY_PUZZLE_KEY, JSON.stringify(puzzle));
  } catch (e) {
    console.warn('saveCachedDailyPuzzle error', e);
  }
}

// ── Daily in-progress autosave (resume after closing the app) ──────────
// Lets a Daily attempt survive the app being backgrounded, force-quit, or
// swiped away mid-game — reopening the same day picks up exactly where you
// left off instead of losing progress or getting a free do-over.
export type DailyProgressState = {
  dateISO: string; // YYYY-MM-DD — progress from a different day is ignored/stale
  chain: string[];
  hintsUsed: number;
  elapsedSeconds: number; // accumulated play time across sessions
};

export async function loadDailyProgress(): Promise<DailyProgressState | null> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.dateISO !== getTodayDateString()) return null;
    return parsed;
  } catch (e) {
    console.warn('loadDailyProgress error', e);
    return null;
  }
}

export async function saveDailyProgress(progress: DailyProgressState): Promise<void> {
  try {
    await AsyncStorage.setItem(DAILY_PROGRESS_KEY, JSON.stringify(progress));
  } catch (e) {
    console.warn('saveDailyProgress error', e);
  }
}

export async function clearDailyProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DAILY_PROGRESS_KEY);
  } catch (e) {
    console.warn('clearDailyProgress error', e);
  }
}

// ── Quick Play in-progress autosave ──
const QUICKPLAY_PROGRESS_KEY = 'wordladder_quickplay_progress_v1';

export type QuickPlayProgressState = {
  puzzle: { start: string; end: string; solution: string[]; par: number; wordLength: number; difficulty: string };
  chain: string[];
  hintsUsed: number;
  elapsedSeconds: number;
};

export async function loadQuickPlayProgress(): Promise<QuickPlayProgressState | null> {
  try {
    const raw = await AsyncStorage.getItem(QUICKPLAY_PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.puzzle || !Array.isArray(parsed.chain)) return null;
    return parsed;
  } catch (e) {
    console.warn('loadQuickPlayProgress error', e);
    return null;
  }
}

export async function saveQuickPlayProgress(progress: QuickPlayProgressState): Promise<void> {
  try {
    await AsyncStorage.setItem(QUICKPLAY_PROGRESS_KEY, JSON.stringify(progress));
  } catch (e) {
    console.warn('saveQuickPlayProgress error', e);
  }
}

export async function clearQuickPlayProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUICKPLAY_PROGRESS_KEY);
  } catch (e) {
    console.warn('clearQuickPlayProgress error', e);
  }
}

// ── Date helpers ─────────────────────────────────────────────────────────
// Local-timezone "YYYY-MM-DD" — not UTC, so the daily reset lines up with
// the player's actual midnight rather than Greenwich's.
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getTodayDateString(): string {
  return toLocalDateString(new Date());
}

export function getYesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalDateString(d);
}

export function formatDisplayDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export async function hasPlayedTodayDaily(): Promise<boolean> {
  const lock = await loadDailyLock();
  return !!lock && lock.dateISO === getTodayDateString();
}

// Countdown-to-midnight hook, same UX as the other games' daily cards.
export function useCountdownToMidnight(): string {
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const diffMs = midnight.getTime() - now.getTime();
      const h = Math.floor(diffMs / (1000 * 60 * 60));
      const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diffMs % (1000 * 60)) / 1000);
      setCountdown(`${h}h ${m}m ${s}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return countdown;
}

// ── Streak update helper ────────────────────────────────────────────────
// Call after a daily result is recorded to bump/reset the streak based on
// whether yesterday's daily was also won.
export function computeNextStreak(
  won: boolean,
  previousLock: DailyLockState | null,
  currentStreak: number
): number {
  if (!won) return 0;
  const yesterday = getYesterdayDateString();
  const continuesStreak = previousLock?.dateISO === yesterday && previousLock.result === 'won';
  return continuesStreak ? currentStreak + 1 : 1;
}

// ── Daily History (per-day record for the calendar) ──────────────────────
const DAILY_HISTORY_KEY = 'wordladder_daily_history_v1';

export type LadderDailyHistoryEntry = {
  dateISO: string;
  result: 'won' | 'lost';
  detail: string; // e.g. "3 steps (par 3) ★" or "Gave Up"
};
export type LadderDailyHistory = Record<string, LadderDailyHistoryEntry>;

export async function loadLadderDailyHistory(): Promise<LadderDailyHistory> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

export async function saveLadderDailyHistoryEntry(entry: LadderDailyHistoryEntry): Promise<void> {
  try {
    const history = await loadLadderDailyHistory();
    await AsyncStorage.setItem(DAILY_HISTORY_KEY, JSON.stringify({ ...history, [entry.dateISO]: entry }));
  } catch (e) { console.warn('saveLadderDailyHistoryEntry error', e); }
}
