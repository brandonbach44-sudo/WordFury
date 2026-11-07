// src/hexhive/utils/achievements.ts
// Hex Hive achievement definitions + unlock logic.
// Shape matches src/wordladder/utils/ladderAchievements.ts so the shared
// AchievementPopup component can render these directly.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HexHiveStats } from './storage';

const ACHIEVEMENTS_KEY = 'hexhive_achievements_v1';

export type HexHiveAchievementCategory = 'milestone' | 'volume' | 'streak' | 'skill' | 'daily' | 'practice';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  requirement: number;
  category: HexHiveAchievementCategory;
}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: string;
}

export const HEXHIVE_ACHIEVEMENTS: Achievement[] = [
  // ── Milestone ───────────────────────────────────────────────────────
  { id: 'hh_first_word', name: 'First Word', description: 'Find your first word in Hex Hive', requirement: 1, category: 'milestone' },
  { id: 'hh_first_pangram', name: 'First Pangram', description: 'Find a word using all 7 letters', requirement: 1, category: 'milestone' },
  { id: 'hh_first_full_clear', name: 'First Win', description: 'Solve a daily puzzle (reach Genius rank)', requirement: 1, category: 'milestone' },

  // ── Volume (lifetime, daily + Quick Play combined) ───────────────────
  { id: 'hh_words_50', name: 'Wordsmith', description: 'Find 50 total words', requirement: 50, category: 'volume' },
  { id: 'hh_words_250', name: 'Lexicon', description: 'Find 250 total words', requirement: 250, category: 'volume' },
  { id: 'hh_words_1000', name: 'Encyclopedic', description: 'Find 1,000 total words', requirement: 1000, category: 'volume' },
  { id: 'hh_words_2500', name: 'Bookworm', description: 'Find 2,500 total words', requirement: 2500, category: 'volume' },
  { id: 'hh_words_5000', name: 'Wordsmith Legend', description: 'Find 5,000 total words', requirement: 5000, category: 'volume' },
  { id: 'hh_pangrams_10', name: 'Pangram Hunter', description: 'Find 10 total pangrams', requirement: 10, category: 'volume' },
  { id: 'hh_pangrams_25', name: 'Pangram Master', description: 'Find 25 total pangrams', requirement: 25, category: 'volume' },
  { id: 'hh_pangrams_50', name: 'Pangram Legend', description: 'Find 50 total pangrams', requirement: 50, category: 'volume' },

  // ── Skill ───────────────────────────────────────────────────────────
  { id: 'hh_reach_amazing', name: 'Amazing', description: 'Reach Amazing rank in a daily puzzle', requirement: 1, category: 'skill' },
  { id: 'hh_reach_genius', name: 'Genius', description: 'Reach Genius rank in a daily puzzle', requirement: 1, category: 'skill' },
  { id: 'hh_reach_master', name: 'Master', description: 'Reach Master rank in a daily puzzle', requirement: 1, category: 'skill' },
  { id: 'hh_long_word_9', name: 'Long Haul', description: 'Find a word with 9 or more letters', requirement: 9, category: 'skill' },
  { id: 'hh_long_word_11', name: 'Marathon Word', description: 'Find a word with 11 or more letters', requirement: 11, category: 'skill' },
  { id: 'hh_long_word_13', name: 'Linguist', description: 'Find a word with 13 or more letters', requirement: 13, category: 'skill' },

  // ── Streak ──────────────────────────────────────────────────────────
  { id: 'hh_streak_3', name: 'On a Roll', description: 'Reach a 3-day streak', requirement: 3, category: 'streak' },
  { id: 'hh_streak_7', name: 'Week Streak', description: 'Reach a 7-day streak', requirement: 7, category: 'streak' },
  { id: 'hh_streak_30', name: 'Monthly Regular', description: 'Reach a 30-day streak', requirement: 30, category: 'streak' },
  { id: 'hh_streak_100', name: 'Devoted', description: 'Reach a 100-day streak', requirement: 100, category: 'streak' },
  { id: 'hh_fullclear_streak_3', name: 'Clean Sweep', description: 'Solve the daily puzzle 3 days in a row', requirement: 3, category: 'streak' },
  { id: 'hh_fullclear_streak_7', name: 'Perfectionist', description: 'Solve the daily puzzle 7 days in a row', requirement: 7, category: 'streak' },

  // ── Daily ───────────────────────────────────────────────────────────
  { id: 'hh_days_10', name: 'Regular Player', description: 'Play 10 daily puzzles', requirement: 10, category: 'daily' },
  { id: 'hh_days_50', name: 'Dedicated', description: 'Play 50 daily puzzles', requirement: 50, category: 'daily' },
  { id: 'hh_days_100', name: 'Centurion', description: 'Play 100 daily puzzles', requirement: 100, category: 'daily' },
  { id: 'hh_fullclears_10', name: 'Completionist', description: 'Solve 10 daily puzzles', requirement: 10, category: 'daily' },
  { id: 'hh_fullclears_25', name: 'Puzzle Perfectionist', description: 'Solve 25 daily puzzles', requirement: 25, category: 'daily' },

  // ── Quick Play ────────────────────────────────────────────────────────
  { id: 'hh_qp_first_round', name: 'Quick Starter', description: 'Play your first Quick Play round', requirement: 1, category: 'practice' },
  { id: 'hh_qp_rounds_10', name: 'Speed Runner', description: 'Play 10 Quick Play rounds', requirement: 10, category: 'practice' },
  { id: 'hh_qp_rounds_50', name: 'Blitz Regular', description: 'Play 50 Quick Play rounds', requirement: 50, category: 'practice' },
  { id: 'hh_qp_score_50', name: 'Quick 50', description: 'Score 50+ points in a single Quick Play round', requirement: 50, category: 'practice' },
  // Keeps its original id and name so existing unlocks carry over; the bar was
  // lowered to 75 because 100 in a 60 second round was out of reach.
  { id: 'hh_qp_score_100', name: 'Quick 100', description: 'Score 75+ points in a single Quick Play round', requirement: 75, category: 'practice' },
  { id: 'hh_qp_words_10', name: 'Rapid Fire', description: 'Find 10+ words in a single Quick Play round', requirement: 10, category: 'practice' },
  { id: 'hh_qp_words_20', name: 'Lightning Round', description: 'Find 20+ words in a single Quick Play round', requirement: 20, category: 'practice' },
  { id: 'hh_qp_pangram', name: 'Speed Pangram', description: 'Find a pangram in Quick Play before time runs out', requirement: 1, category: 'practice' },
];

/** Single Quick Play round score thresholds. */
const QP_SCORE_THRESHOLDS: [number, string][] = [
  [50, 'hh_qp_score_50'],
  [75, 'hh_qp_score_100'],
];

async function loadUnlockedIds(): Promise<UnlockedAchievement[]> {
  try {
    const raw = await AsyncStorage.getItem(ACHIEVEMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.unlocked) ? parsed.unlocked : [];
  } catch {
    return [];
  }
}

async function saveUnlockedIds(unlocked: UnlockedAchievement[]): Promise<void> {
  try {
    await AsyncStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify({ unlocked }));
  } catch (e) {
    console.warn('saveUnlockedIds error', e);
  }
}

export async function getUnlockedAchievements(): Promise<(Achievement & { unlockedAt: string })[]> {
  const unlocked = await loadUnlockedIds();
  return unlocked
    .map((u) => {
      const def = HEXHIVE_ACHIEVEMENTS.find((a) => a.id === u.id);
      return def ? { ...def, unlockedAt: u.unlockedAt } : null;
    })
    .filter((a): a is Achievement & { unlockedAt: string } => a !== null);
}

async function unlock(id: string, existing: UnlockedAchievement[]): Promise<Achievement | null> {
  if (existing.some((u) => u.id === id)) return null;
  const def = HEXHIVE_ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return null;
  existing.push({ id, unlockedAt: new Date().toISOString() });
  return def;
}

export interface WordFoundEvent {
  word: string;
  isPangram: boolean;
}

/**
 * Checks a just-found word plus the just-updated stats snapshot against
 * every achievement, unlocking any newly-earned ones. Returns the list of
 * achievements unlocked by this call (for popup display).
 *
 * `stats` is expected to already reflect this word (mode-specific counters
 * bumped by the caller before invoking), so thresholds here can just read
 * off the stats object directly regardless of which mode was played.
 */
export async function checkWordAchievements(
  event: WordFoundEvent,
  stats: HexHiveStats
): Promise<Achievement[]> {
  const existing = await loadUnlockedIds();
  const newlyUnlocked: Achievement[] = [];

  const tryUnlock = async (id: string) => {
    const a = await unlock(id, existing);
    if (a) newlyUnlocked.push(a);
  };

  if (stats.totalWordsFound >= 1) await tryUnlock('hh_first_word');
  if (stats.totalWordsFound >= 50) await tryUnlock('hh_words_50');
  if (stats.totalWordsFound >= 250) await tryUnlock('hh_words_250');
  if (stats.totalWordsFound >= 1000) await tryUnlock('hh_words_1000');
  if (stats.totalWordsFound >= 2500) await tryUnlock('hh_words_2500');
  if (stats.totalWordsFound >= 5000) await tryUnlock('hh_words_5000');

  if (event.isPangram) {
    if (stats.totalPangramsFound >= 1) await tryUnlock('hh_first_pangram');
    if (stats.totalPangramsFound >= 10) await tryUnlock('hh_pangrams_10');
    if (stats.totalPangramsFound >= 25) await tryUnlock('hh_pangrams_25');
    if (stats.totalPangramsFound >= 50) await tryUnlock('hh_pangrams_50');
    if (stats.practicePangramsFound >= 1) await tryUnlock('hh_qp_pangram');
  }

  if (event.word.length >= 9) await tryUnlock('hh_long_word_9');
  if (event.word.length >= 11) await tryUnlock('hh_long_word_11');
  if (event.word.length >= 13) await tryUnlock('hh_long_word_13');

  for (const [threshold, id] of QP_SCORE_THRESHOLDS) {
    if (stats.practiceBestScore >= threshold) await tryUnlock(id);
  }
  if (stats.practiceBestWordCount >= 10) await tryUnlock('hh_qp_words_10');
  if (stats.practiceBestWordCount >= 20) await tryUnlock('hh_qp_words_20');

  if (newlyUnlocked.length > 0) {
    await saveUnlockedIds(existing);
  }
  return newlyUnlocked;
}

/** Checks rank-, streak-, and daily/Quick-Play-count-based achievements. */
export async function checkProgressAchievements(
  stats: HexHiveStats,
  rankIndex: number,
  rankName: string,
  fullyCleared: boolean
): Promise<Achievement[]> {
  const existing = await loadUnlockedIds();
  const newlyUnlocked: Achievement[] = [];

  const tryUnlock = async (id: string) => {
    const a = await unlock(id, existing);
    if (a) newlyUnlocked.push(a);
  };

  if (rankName === 'Amazing' || rankIndex >= 7) await tryUnlock('hh_reach_amazing');
  if (rankName === 'Genius' || rankIndex >= 8) await tryUnlock('hh_reach_genius');
  if (rankName === 'Master' || rankIndex >= 9) await tryUnlock('hh_reach_master');
  if (fullyCleared) await tryUnlock('hh_first_full_clear');

  if (stats.currentStreak >= 3) await tryUnlock('hh_streak_3');
  if (stats.currentStreak >= 7) await tryUnlock('hh_streak_7');
  if (stats.currentStreak >= 30) await tryUnlock('hh_streak_30');
  if (stats.currentStreak >= 100) await tryUnlock('hh_streak_100');

  if (stats.currentFullClearStreak >= 3) await tryUnlock('hh_fullclear_streak_3');
  if (stats.currentFullClearStreak >= 7) await tryUnlock('hh_fullclear_streak_7');

  if (stats.daysPlayed >= 10) await tryUnlock('hh_days_10');
  if (stats.daysPlayed >= 50) await tryUnlock('hh_days_50');
  if (stats.daysPlayed >= 100) await tryUnlock('hh_days_100');

  if (stats.fullClears >= 10) await tryUnlock('hh_fullclears_10');
  if (stats.fullClears >= 25) await tryUnlock('hh_fullclears_25');

  if (newlyUnlocked.length > 0) {
    await saveUnlockedIds(existing);
  }
  return newlyUnlocked;
}

/**
 * Grants any Quick Play score achievement the saved best round already earns.
 * Quick 100 was lowered to 75, so a player whose best round beat 75 before the
 * change gets it here, once: unlock skips anything already unlocked, so later
 * calls return nothing and show no card.
 */
export async function recheckQuickPlayScoreAchievements(stats: HexHiveStats): Promise<Achievement[]> {
  const existing = await loadUnlockedIds();
  const newlyUnlocked: Achievement[] = [];
  for (const [threshold, id] of QP_SCORE_THRESHOLDS) {
    if (stats.practiceBestScore < threshold) continue;
    const a = await unlock(id, existing);
    if (a) newlyUnlocked.push(a);
  }
  if (newlyUnlocked.length > 0) {
    await saveUnlockedIds(existing);
  }
  return newlyUnlocked;
}

/** Checks Quick-Play-round-count achievements. Call once per round played (on time-up). */
export async function checkPracticeRoundAchievements(stats: HexHiveStats): Promise<Achievement[]> {
  const existing = await loadUnlockedIds();
  const newlyUnlocked: Achievement[] = [];

  const tryUnlock = async (id: string) => {
    const a = await unlock(id, existing);
    if (a) newlyUnlocked.push(a);
  };

  if (stats.practicePuzzlesPlayed >= 1) await tryUnlock('hh_qp_first_round');
  if (stats.practicePuzzlesPlayed >= 10) await tryUnlock('hh_qp_rounds_10');
  if (stats.practicePuzzlesPlayed >= 50) await tryUnlock('hh_qp_rounds_50');

  if (newlyUnlocked.length > 0) {
    await saveUnlockedIds(existing);
  }
  return newlyUnlocked;
}
