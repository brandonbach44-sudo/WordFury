// src/wordgrid/utils/dailyChallenge.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { startedAtFromTimeLeft } from '../../shared/dailyClock';
import { generateGrid } from './gridGenerator';

// Length of a Word Grid round in seconds, Daily and Quick Play alike.
export const WORDGRID_DAILY_SECONDS = 60;

// ─── Date Helpers ─────────────────────────────────────────────────────────────

export function dateToSeed(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return year * 10000 + month * 100 + day;
}

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
  return date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

// ─── Countdown Hook ───────────────────────────────────────────────────────────

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

// ─── Seeded Daily Grid ────────────────────────────────────────────────────────

// Mulberry32 PRNG — same algorithm used by Furdle's daily word selection.
// Consecutive integer seeds produce statistically independent sequences,
// unlike the old LCG (1103515245 multiplier) which caused 2-day repeat cycles
// when seeded with consecutive yyyymmdd integers.
function mulberry32(seed: number): () => number {
  return function (): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates the same 4×4 grid for everyone on a given date by temporarily
 * replacing Math.random with a deterministic seeded version.
 */
export function generateDailyGrid(date: Date = new Date()): string[][] {
  const seed = dateToSeed(date);
  const orig = Math.random;
  Math.random = mulberry32(seed);
  try {
    return generateGrid(4);
  } finally {
    Math.random = orig;
  }
}

// ─── Stats Interface & Storage ────────────────────────────────────────────────

export interface DailyWordGridStats {
  lastPlayedDate: string;
  lastScore: number;
  lastWordsCount: number;
  streak: number;
  bestStreak: number;
  gamesPlayed: number;
  totalDailyScore: number;
  bestDailyScore: number;
}

const STORAGE_KEY = 'wordgrid_daily_challenge_stats';

const defaultStats: DailyWordGridStats = {
  lastPlayedDate: '',
  lastScore: 0,
  lastWordsCount: 0,
  streak: 0,
  bestStreak: 0,
  gamesPlayed: 0,
  totalDailyScore: 0,
  bestDailyScore: 0,
};

export async function loadDailyWordGridStats(): Promise<DailyWordGridStats> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    return data ? { ...defaultStats, ...JSON.parse(data) } : { ...defaultStats };
  } catch {
    return { ...defaultStats };
  }
}

export async function saveDailyWordGridResult(
  score: number,
  wordsCount: number,
): Promise<DailyWordGridStats> {
  const stats = await loadDailyWordGridStats();
  const today = getTodayDateString();
  const yesterday = getYesterdayDateString();

  // Already played today — don't overwrite
  if (stats.lastPlayedDate === today) return stats;

  const playedYesterday = stats.lastPlayedDate === yesterday;
  const streak = playedYesterday ? stats.streak + 1 : 1;
  const bestStreak = Math.max(streak, stats.bestStreak);

  const newStats: DailyWordGridStats = {
    lastPlayedDate: today,
    lastScore: score,
    lastWordsCount: wordsCount,
    streak,
    bestStreak,
    gamesPlayed: stats.gamesPlayed + 1,
    totalDailyScore: stats.totalDailyScore + score,
    bestDailyScore: Math.max(stats.bestDailyScore, score),
  };

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newStats));
  return newStats;
}

// ─── Daily In-Progress Autosave (resume after closing the app mid-game) ────
// Lets a Daily attempt survive the app being backgrounded, force-quit, or
// swiped away mid-game — reopening the same day resumes the exact found
// words/score/time remaining instead of losing progress or a free redo.

const PROGRESS_KEY = 'wordgrid_daily_progress';

export interface WordGridDailyProgress {
  dateISO: string; // YYYY-MM-DD — progress from a different day is stale/ignored
  foundWords: { word: string; points: number }[];
  score: number;
  // Epoch ms the round started. The daily clock keeps running while the app
  // is closed, so time left is always derived from this (src/shared/dailyClock).
  startedAt: number;
}

/**
 * Today's in-progress Daily, or null. A round whose time ran out while the
 * player was away is still returned (its time left is 0), so the screen can
 * end it with the words found before they left instead of discarding them.
 */
export async function loadWordGridDailyProgress(): Promise<WordGridDailyProgress | null> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.dateISO !== getTodayDateString()) return null;
    if (typeof parsed.startedAt === 'number') return parsed;
    // Saved by an older build that stored time left. An attempt already at
    // zero there is not resumable, same as before; anything else carries over.
    if (typeof parsed.timeLeft !== 'number' || parsed.timeLeft <= 0) return null;
    return {
      dateISO: parsed.dateISO,
      foundWords: parsed.foundWords ?? [],
      score: parsed.score ?? 0,
      startedAt: startedAtFromTimeLeft(parsed.timeLeft, WORDGRID_DAILY_SECONDS),
    };
  } catch {
    return null;
  }
}

export async function saveWordGridDailyProgress(progress: WordGridDailyProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (e) {
    console.warn('saveWordGridDailyProgress error', e);
  }
}

export async function clearWordGridDailyProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PROGRESS_KEY);
  } catch (e) {
    console.warn('clearWordGridDailyProgress error', e);
  }
}

// ── Quick Play in-progress autosave ──
const QUICKPLAY_PROGRESS_KEY = 'wordgrid_quickplay_progress';

export interface WordGridQuickPlayProgress {
  grid: string[][];
  foundWords: { word: string; points: number }[];
  score: number;
  timeLeft: number;
}

export async function loadWordGridQuickPlayProgress(): Promise<WordGridQuickPlayProgress | null> {
  try {
    const raw = await AsyncStorage.getItem(QUICKPLAY_PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.grid) || parsed.timeLeft <= 0) return null;
    return parsed;
  } catch (e) {
    console.warn('loadWordGridQuickPlayProgress error', e);
    return null;
  }
}

export async function saveWordGridQuickPlayProgress(progress: WordGridQuickPlayProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(QUICKPLAY_PROGRESS_KEY, JSON.stringify(progress));
  } catch (e) {
    console.warn('saveWordGridQuickPlayProgress error', e);
  }
}

export async function clearWordGridQuickPlayProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUICKPLAY_PROGRESS_KEY);
  } catch (e) {
    console.warn('clearWordGridQuickPlayProgress error', e);
  }
}

// ─── Share Emoji Blocks ───────────────────────────────────────────────────────

/**
 * 5 blocks, each one a milestone rung climbed, each its own color instead of
 * a flat green bar — turns the share into a little heat-map of how far the
 * score got: ⬜ unclaimed, then 🟨 50 · 🟧 100 · 🟩 150 · 🟦 200 · 🌟 250+.
 * e.g. score=130 → 🟨🟧⬜⬜⬜
 */
export function buildScoreBlocks(score: number): string {
  const tierEmoji = ['🟨', '🟧', '🟩', '🟦', '🌟'];
  const thresholds = [50, 100, 150, 200, 250];
  return thresholds
    .map((t, i) => (score >= t ? tierEmoji[i] : '⬜'))
    .join('');
}

/**
 * Shared Daily share text builder — used both right after finishing the
 * Daily and when reopening an already-completed Daily from the menu, so all
 * paths produce the exact same format instead of three near-duplicate
 * inline strings drifting apart. Never reveals which words were found,
 * since the Daily grid is the same for everyone that day and listing
 * specific found words would spoil valid answers for friends who haven't
 * played yet — only the score/word-count/streak are shown.
 */
export function buildWordGridDailyShareText(params: {
  score: number;
  wordsCount: number;
  streak: number;
  dateStr?: string;
}): string {
  const { score, wordsCount, streak, dateStr = formatDisplayDate() } = params;
  const blocks = buildScoreBlocks(score);
  const lines: string[] = [
    `WORD GRID DAILY — ${dateStr}`,
    blocks,
    '',
    `Score: ${score} pts · ${wordsCount} word${wordsCount === 1 ? '' : 's'}`,
  ];
  if (streak > 1) lines.push(`${streak} day streak`);
  lines.push('', 'wordfury.app');
  return lines.join('\n');
}

// ── Daily History (per-day record for the calendar) ──────────────────────────
// Mirrors the shape every other game stores so the shared DailyCalendar can
// render it directly. Word Grid has no win/lose state — you always finish with
// some score — so results are recorded as 'played'.
const WORDGRID_DAILY_HISTORY_KEY = 'wordgrid_daily_history_v1';

export type WordGridDailyHistoryEntry = {
  dateISO: string;
  result: 'won' | 'lost' | 'played';
  detail: string; // e.g. "1,240 pts · 12 words"
};
export type WordGridDailyHistory = Record<string, WordGridDailyHistoryEntry>;

export async function loadWordGridDailyHistory(): Promise<WordGridDailyHistory> {
  try {
    const raw = await AsyncStorage.getItem(WORDGRID_DAILY_HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    console.warn('loadWordGridDailyHistory error', e);
    return {};
  }
}

export async function saveWordGridDailyHistoryEntry(
  entry: WordGridDailyHistoryEntry,
): Promise<WordGridDailyHistory> {
  try {
    const history = await loadWordGridDailyHistory();
    // One attempt per day, first result wins - mirrors the same rule
    // saveDailyWordGridResult enforces for the stats. Without this, any later
    // round that ran while gameMode was still 'daily' could overwrite a real
    // score with a worse (or zero) one in the calendar.
    if (history[entry.dateISO]) return history;
    const updated: WordGridDailyHistory = { ...history, [entry.dateISO]: entry };
    await AsyncStorage.setItem(WORDGRID_DAILY_HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn('saveWordGridDailyHistoryEntry error', e);
    return {};
  }
}
