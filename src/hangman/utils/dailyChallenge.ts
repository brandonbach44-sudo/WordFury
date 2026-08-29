import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

// Convert date to numeric seed for deterministic word selection
export function dateToSeed(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return year * 10000 + month * 100 + day;
}

// Select daily word index (same for everyone that day)
export function getDailyWordIndex(wordList: any[], date: Date = new Date()): number {
  const seed = dateToSeed(date);
  return seed % wordList.length;
}

// Mulberry32 PRNG — same algorithm used across all Word Fury daily modes.
function mulberry32(seed: number): () => number {
  return function (): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A category being independently random each day still produces real streaks
// — over a year of true-independent draws across 15 categories, a 9-day span
// where two categories cover 6-7 of the days is normal, not a bug. But it
// reads to a daily player as "it's always dinosaurs" (TestFlight feedback,
// Aug 2026), so the fix isn't a better PRNG, it's a no-repeat window: exclude
// whichever categories ran in the last CATEGORY_REPEAT_AVOID_DAYS days from
// today's pool.
//
// The avoid-set has to be built from each day's *actual* (already-filtered)
// category, not its raw unfiltered pick — using the raw pick for the lookback
// was tried first and let repeats slip through anyway (verified by
// simulation), because a day's real assignment can itself have been shifted
// away from its raw pick by the same rule. So today's category is computed by
// walking forward from a fixed epoch, carrying the actual rolling history —
// still a pure function of the date, still no persisted state, just more of
// the computation. Cheap even after years of daily use: a few thousand
// iterations of one filter + one PRNG call is microseconds, and it only runs
// once per Daily start, not per render.
const CATEGORY_REPEAT_AVOID_DAYS = 6;
const CATEGORY_EPOCH = new Date(2026, 0, 1);

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function rawCategoryForSeed(seed: number, categoryNames: string[]): string {
  const rand = mulberry32(seed);
  return categoryNames[Math.floor(rand() * categoryNames.length)];
}

/**
 * Deterministic per-day category pick, excluding whatever actually ran in the
 * preceding CATEGORY_REPEAT_AVOID_DAYS days. Falls back to the raw,
 * unfiltered pick for any date before CATEGORY_EPOCH (shouldn't happen in
 * practice — it predates the app).
 */
export function pickDailyCategory(date: Date, categoryNames: string[]): string {
  const days = Math.round(
    (startOfDay(date).getTime() - startOfDay(CATEGORY_EPOCH).getTime()) / 86400000,
  );
  if (days < 0) {
    return rawCategoryForSeed(dateToSeed(date), categoryNames);
  }

  const recent: string[] = [];
  let picked = '';
  for (let i = 0; i <= days; i++) {
    const d = new Date(CATEGORY_EPOCH);
    d.setDate(d.getDate() + i);
    const seed = dateToSeed(d);
    const avoidSet = new Set(recent.slice(-CATEGORY_REPEAT_AVOID_DAYS));
    const pool = categoryNames.filter((c) => !avoidSet.has(c));
    const candidates = pool.length > 0 ? pool : categoryNames;
    const rand = mulberry32(seed);
    picked = candidates[Math.floor(rand() * candidates.length)];
    recent.push(picked);
  }
  return picked;
}

/** Word pick for a given category, deterministic per day + category. */
export function pickDailyWordFromCategory(date: Date, words: string[]): string {
  // Offset the seed so the word draw isn't correlated with the category
  // draw's internal state for the same date.
  const seed = dateToSeed(date) + 1;
  const rand = mulberry32(seed);
  return words[Math.floor(rand() * words.length)];
}

// Today's date: "YYYY-MM-DD", in the device's local timezone — not UTC, so
// the daily reset lines up with the player's actual midnight.
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function getTodayDateString(): string {
  return toLocalDateString(new Date());
}
// Yesterday's date: "YYYY-MM-DD"
export function getYesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalDateString(d);
}
// Display date (e.g. "Tuesday, December 17")
export function formatDisplayDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });
}

// Countdown to next midnight
export function useCountdownToMidnight(): string {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const calculate = () => {
      const now = new Date();
      const next = new Date(now);
      next.setDate(now.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      const diff = next.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };
    calculate();
    const id = setInterval(calculate, 1000);
    return () => clearInterval(id);
  }, []);
  return timeLeft;
}

// Streak/stat logic
export interface DailyChallengeStats {
  lastPlayedDate: string;
  lastDailyResult: 'won' | 'lost' | '';
  lastDailyWord: string;
  lastIncorrectCount: number;
  streak: number;
  bestStreak: number;
  gamesPlayed: number;
  dailyWins: number;
}

const STORAGE_KEY = 'hangman_daily_challenge_stats';
const defaultStats: DailyChallengeStats = {
  lastPlayedDate: '',
  lastDailyResult: '',
  lastDailyWord: '',
  lastIncorrectCount: 0,
  streak: 0,
  bestStreak: 0,
  gamesPlayed: 0,
  dailyWins: 0,
};

export async function loadDailyStats(): Promise<DailyChallengeStats> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    return data ? { ...defaultStats, ...JSON.parse(data) } : { ...defaultStats };
  } catch {
    return { ...defaultStats };
  }
}
export async function saveDailyStats(s: DailyChallengeStats) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
export async function saveDailyResult(result: 'won' | 'lost', word: string, incorrectCount: number = 0) {
  const stats = await loadDailyStats();
  const today = getTodayDateString();
  const yesterday = getYesterdayDateString();
  if (stats.lastPlayedDate === today) return stats;

  let streak = (stats.lastPlayedDate === yesterday && stats.lastDailyResult !== '') ? (result === 'won' ? stats.streak + 1 : 0) : (result === 'won' ? 1 : 0);
  let bestStreak = Math.max(streak, stats.bestStreak);

  const newStats: DailyChallengeStats = {
    lastPlayedDate: today,
    lastDailyResult: result,
    lastDailyWord: word,
    lastIncorrectCount: incorrectCount,
    streak,
    bestStreak,
    gamesPlayed: stats.gamesPlayed + 1,
    dailyWins: (stats.dailyWins || 0) + (result === 'won' ? 1 : 0),
  };
  await saveDailyStats(newStats);
  return newStats;
}

export async function hasPlayedTodayDaily(): Promise<boolean> {
  const stats = await loadDailyStats();
  return stats.lastPlayedDate === getTodayDateString();
}

// ── Daily in-progress autosave (resume after closing the app mid-game) ──
// Lets a Daily attempt survive the app being backgrounded, force-quit, or
// swiped away mid-game — reopening the same day resumes the exact guessed
// letters instead of losing progress or a free redo.

const PROGRESS_KEY = 'hangman_daily_progress';

export interface HangmanDailyProgress {
  dateISO: string; // YYYY-MM-DD — progress from a different day is stale/ignored
  word: string;
  category: string;
  guessedLetters: string[];
  incorrectGuesses: string[];
  correctGuesses: string[];
}

export async function loadDailyProgress(): Promise<HangmanDailyProgress | null> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.dateISO !== getTodayDateString()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveDailyProgress(progress: HangmanDailyProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (e) {
    console.warn('saveDailyProgress error', e);
  }
}

export async function clearDailyProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PROGRESS_KEY);
  } catch (e) {
    console.warn('clearDailyProgress error', e);
  }
}

// ── Practice in-progress autosave ──
const PRACTICE_PROGRESS_KEY = 'hangman_practice_progress';

export interface HangmanPracticeProgress {
  word: string;
  category: string;
  guessedLetters: string[];
  incorrectGuesses: string[];
  correctGuesses: string[];
}

export async function loadPracticeProgress(): Promise<HangmanPracticeProgress | null> {
  try {
    const raw = await AsyncStorage.getItem(PRACTICE_PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.word !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function savePracticeProgress(progress: HangmanPracticeProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(PRACTICE_PROGRESS_KEY, JSON.stringify(progress));
  } catch (e) {
    console.warn('savePracticeProgress error', e);
  }
}

export async function clearPracticeProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PRACTICE_PROGRESS_KEY);
  } catch (e) {
    console.warn('clearPracticeProgress error', e);
  }
}

// ─── Share Text ───────────────────────────────────────────────────────────
// Single builder shared by GameStatus (Practice), DailyChallengePopup, and
// DailyChallengeCard — those three used to each hand-roll a slightly
// different version of the same string (missing emoji here, missing
// Category there), which drifts out of sync every time one gets edited.
// Daily never reveals the word (the Daily word is the same for everyone
// that day, so it's a real spoiler); pass `word` only for Practice shares,
// where there's no shared puzzle to spoil.
export function buildHangmanShareText(params: {
  isDaily: boolean;
  won: boolean;
  incorrectCount: number;
  maxAttempts: number;
  category?: string;
  word?: string;
  streak?: number;
}): string {
  const { isDaily, won, incorrectCount, maxAttempts, category, word, streak } = params;

  const blocks: string[] = [];
  for (let i = 0; i < maxAttempts; i++) {
    if (i < incorrectCount) {
      blocks.push('❌');
    } else if (won && i === incorrectCount) {
      blocks.push('✅');
    } else {
      blocks.push('⬜');
    }
  }
  const blockRow = blocks.join('');

  const resultLine = won
    ? `✅ Won with ${incorrectCount}/${maxAttempts} wrong guess${incorrectCount === 1 ? '' : 'es'}!`
    : isDaily
      ? 'Lost — better luck tomorrow!'
      : 'Lost';

  const lines: string[] = [isDaily ? 'HANGMAN DAILY' : 'HANGMAN'];
  if (isDaily) lines.push(formatDisplayDate());
  if (category) lines.push(`Category: ${category}`);
  lines.push('', resultLine, blockRow);
  if (word) lines.push(`Word: ${word.toUpperCase()}`);
  if (isDaily && streak && streak > 1) lines.push(`${streak} day streak`);
  lines.push('', 'wordfury.app');

  return lines.join('\n');
}

// ── Daily History (per-day record for the calendar) ──────────────────────
const HANGMAN_DAILY_HISTORY_KEY = 'hangman_daily_history_v1';

export type HangmanDailyHistoryEntry = {
  dateISO: string;
  result: 'won' | 'lost';
  detail: string; // e.g. "Solved (2 mistakes)" or "Lost — TIGER"
};
export type HangmanDailyHistory = Record<string, HangmanDailyHistoryEntry>;

export async function loadHangmanDailyHistory(): Promise<HangmanDailyHistory> {
  try {
    const raw = await AsyncStorage.getItem(HANGMAN_DAILY_HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

export async function saveHangmanDailyHistoryEntry(entry: HangmanDailyHistoryEntry): Promise<void> {
  try {
    const history = await loadHangmanDailyHistory();
    await AsyncStorage.setItem(HANGMAN_DAILY_HISTORY_KEY, JSON.stringify({ ...history, [entry.dateISO]: entry }));
  } catch (e) { console.warn('saveHangmanDailyHistoryEntry error', e); }
}
