// src/anagrams/utils/anagramsAchievements.ts
// Anagrams achievement definitions + unlock logic. Shape matches
// src/wordladder/utils/ladderAchievements.ts so the shared AchievementPopup
// component can render these directly.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnagramsStats } from './anagramsStorage';
import { ANAGRAMS_TIER_ORDER, ANAGRAMS_TIERS } from './anagramsTiers';
import type { TierName } from '../../shared/tileTiers';

const ACHIEVEMENTS_KEY = 'anagrams_achievements_v1';

export type AnagramsAchievementCategory = 'completion' | 'skill' | 'speed' | 'streak' | 'daily' | 'lifetime';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  requirement: number;
  category: AnagramsAchievementCategory;
}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: string;
}

// Cosmetic tiers only — excludes the always-free Default/Classic tiers,
// which don't have an unlock achievement since there's nothing to earn.
const EARNABLE_CUBE_TIERS = ANAGRAMS_TIER_ORDER.filter((t) => t !== 'default' && t !== 'classic');

/**
 * One achievement per unlockable cube tier — id, name, and (crucially)
 * `requirement` are all derived directly from anagramsTiers.ts, so an
 * achievement unlocks at the *exact* same Daily lifetime score as the cube
 * itself. No hand-copied thresholds to drift out of sync.
 */
const CUBE_TIER_ACHIEVEMENTS: Achievement[] = EARNABLE_CUBE_TIERS.map((tierName) => {
  const tier = ANAGRAMS_TIERS[tierName]!;
  return {
    id: `ag_cube_${tierName}`,
    name: `${tier.displayName} Cube`,
    description: `Unlock the ${tier.displayName} cube, ${tier.baseThreshold.toLocaleString()} Daily Anagrams lifetime score`,
    requirement: tier.baseThreshold,
    category: 'lifetime' as const,
  };
});

export const ANAGRAMS_ACHIEVEMENTS: Achievement[] = [
  // ── Completion (volume) ────────────────────────────────────────────
  { id: 'ag_first_win', name: 'Unscrambled', description: 'Solve all 5 words in a run', requirement: 1, category: 'completion' },
  { id: 'ag_games_10', name: 'Word Wrangler', description: 'Complete 10 Anagrams runs', requirement: 10, category: 'completion' },
  { id: 'ag_games_50', name: 'Anagram Regular', description: 'Complete 50 Anagrams runs', requirement: 50, category: 'completion' },
  { id: 'ag_games_100', name: 'Century Club', description: 'Complete 100 Anagrams runs', requirement: 100, category: 'completion' },
  { id: 'ag_words_100', name: 'Century of Words', description: 'Solve 100 total words', requirement: 100, category: 'completion' },
  { id: 'ag_words_500', name: 'Bookworm', description: 'Solve 500 total words', requirement: 500, category: 'completion' },

  // ── Skill ───────────────────────────────────────────────────────────
  { id: 'ag_perfect_1', name: 'Perfect Run', description: 'Solve all 5 words with zero hints', requirement: 1, category: 'skill' },
  { id: 'ag_perfect_10', name: 'Sharp Mind', description: 'Complete 10 Perfect Runs', requirement: 10, category: 'skill' },
  { id: 'ag_perfect_25', name: 'Grandmaster', description: 'Complete 25 Perfect Runs', requirement: 25, category: 'skill' },
  { id: 'ag_no_skip_25', name: 'No Word Left Behind', description: 'Solve 25 words in a row without skipping', requirement: 25, category: 'skill' },
  { id: 'ag_no_skip_100', name: 'Untouchable', description: 'Solve 100 words in a row without skipping', requirement: 100, category: 'skill' },

  // ── Single-run score milestones ────────────────────────────────────
  { id: 'ag_score_2500', name: 'Nice Start', description: 'Score 2,500+ points in a single run', requirement: 2500, category: 'skill' },
  { id: 'ag_score_5000', name: 'On Fire', description: 'Score 5,000+ points in a single run', requirement: 5000, category: 'skill' },
  { id: 'ag_score_7000', name: 'High Scorer', description: 'Score 7,000+ points in a single run', requirement: 7000, category: 'skill' },
  { id: 'ag_score_8500', name: 'Word Wizard', description: 'Score 8,500+ points in a single run', requirement: 8500, category: 'skill' },

  // ── Cube tier unlocks — one achievement per unlockable cube, generated
  // from anagramsTiers.ts so the threshold always matches the actual cube
  // unlock exactly (Copper through Rose Quartz, same order as the
  // Customize tab). See CUBE_TIER_ACHIEVEMENTS above.
  ...CUBE_TIER_ACHIEVEMENTS,

  // ── Playtime ────────────────────────────────────────────────────────
  { id: 'ag_playtime_1hr', name: 'Time Well Spent', description: 'Play Anagrams for a cumulative 1 hour', requirement: 3600, category: 'lifetime' },

  // ── Speed ───────────────────────────────────────────────────────────
  { id: 'ag_speedy_word_10', name: 'Quick Unscramble', description: 'Solve a word in under 10 seconds', requirement: 10, category: 'speed' },
  { id: 'ag_fast_perfect_90', name: 'Speed Solver', description: 'Complete a Perfect Run in under 90 seconds total', requirement: 90, category: 'speed' },
  { id: 'ag_fast_perfect_60', name: 'Speed Demon', description: 'Complete a Perfect Run in under 60 seconds total', requirement: 60, category: 'speed' },

  // ── Streak (daily) ──────────────────────────────────────────────────
  { id: 'ag_streak_3', name: 'On a Roll', description: 'Reach a 3-day Daily Anagrams streak', requirement: 3, category: 'streak' },
  { id: 'ag_streak_7', name: 'Week Streak', description: 'Reach a 7-day Daily Anagrams streak', requirement: 7, category: 'streak' },
  { id: 'ag_streak_14', name: 'Spicy Streak', description: 'Reach a 14-day Daily Anagrams streak', requirement: 14, category: 'streak' },
  { id: 'ag_streak_30', name: 'Monthly Solver', description: 'Reach a 30-day Daily Anagrams streak', requirement: 30, category: 'streak' },

  // ── Daily (participation) ──────────────────────────────────────────
  { id: 'ag_daily_10', name: 'Daily Devotee', description: 'Complete 10 Daily Anagrams', requirement: 10, category: 'daily' },
  { id: 'ag_daily_30', name: 'Daily Marathoner', description: 'Complete 30 Daily Anagrams', requirement: 30, category: 'daily' },
  { id: 'ag_daily_100', name: 'Daily Legend', description: 'Complete 100 Daily Anagrams', requirement: 100, category: 'daily' },

  // ── Daily wins (lifetime) — separate from participation and from the
  // day-to-day streak, this rewards total career wins even if a streak
  // gets broken along the way, to keep long-time players coming back.
  { id: 'ag_daily_wins_10', name: 'Daily Winner', description: 'Win 10 Daily Anagrams (lifetime)', requirement: 10, category: 'daily' },
  { id: 'ag_daily_wins_50', name: 'Daily Champion', description: 'Win 50 Daily Anagrams (lifetime)', requirement: 50, category: 'daily' },
  { id: 'ag_daily_wins_150', name: 'Daily Master', description: 'Win 150 Daily Anagrams (lifetime)', requirement: 150, category: 'daily' },
  { id: 'ag_daily_wins_365', name: 'Year of Words', description: 'Win 365 Daily Anagrams (lifetime)', requirement: 365, category: 'daily' },
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
      const def = ANAGRAMS_ACHIEVEMENTS.find((a) => a.id === u.id);
      return def ? { ...def, unlockedAt: u.unlockedAt } : null;
    })
    .filter((a): a is Achievement & { unlockedAt: string } => a !== null);
}

async function unlock(id: string, existing: UnlockedAchievement[]): Promise<Achievement | null> {
  if (existing.some((u) => u.id === id)) return null;
  const def = ANAGRAMS_ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return null;
  existing.push({ id, unlockedAt: new Date().toISOString() });
  return def;
}

export interface AnagramsGameResult {
  mode: 'practice' | 'daily';
  won: boolean; // all 5 solved, no skips
  perfectBonusApplied: boolean; // all 5 solved, zero hints
  wordsSolved: number;
  totalScore: number;
  timeSeconds: number;
  fastestRoundSeconds: number | null;
  consecutiveSolvedNoSkip: number; // running streak of solves without a skip, across all history
}

/**
 * Checks a single completed run + the just-updated stats snapshot against
 * every achievement, unlocking any newly-earned ones. Returns the list of
 * achievements unlocked by this call (for popup display).
 */
export async function checkAnagramsAchievements(
  result: AnagramsGameResult,
  stats: AnagramsStats
): Promise<Achievement[]> {
  const existing = await loadUnlockedIds();
  const newlyUnlocked: Achievement[] = [];
  const combinedWords = stats.practice.wordsSolved + stats.daily.wordsSolved;
  const combinedPerfect = stats.practice.perfectRuns + stats.daily.perfectRuns;
  const combinedGames = stats.practice.gamesPlayed + stats.daily.gamesPlayed;
  const combinedPlaytimeSeconds = stats.practice.totalTimeSeconds + stats.daily.totalTimeSeconds;

  const tryUnlock = async (id: string) => {
    const a = await unlock(id, existing);
    if (a) newlyUnlocked.push(a);
  };

  if (result.won) await tryUnlock('ag_first_win');
  if (combinedGames >= 10) await tryUnlock('ag_games_10');
  if (combinedGames >= 50) await tryUnlock('ag_games_50');
  if (combinedGames >= 100) await tryUnlock('ag_games_100');
  if (combinedWords >= 100) await tryUnlock('ag_words_100');
  if (combinedWords >= 500) await tryUnlock('ag_words_500');

  if (result.perfectBonusApplied) {
    await tryUnlock('ag_perfect_1');
    if (combinedPerfect >= 10) await tryUnlock('ag_perfect_10');
    if (combinedPerfect >= 25) await tryUnlock('ag_perfect_25');
    if (result.timeSeconds < 90) await tryUnlock('ag_fast_perfect_90');
    if (result.timeSeconds < 60) await tryUnlock('ag_fast_perfect_60');
  }

  if (result.totalScore >= 2500) await tryUnlock('ag_score_2500');
  if (result.totalScore >= 5000) await tryUnlock('ag_score_5000');
  if (result.totalScore >= 7000) await tryUnlock('ag_score_7000');
  if (result.totalScore >= 8500) await tryUnlock('ag_score_8500');

  // Cube tier unlocks are Daily-only lifetime score, matching the actual
  // cube system exactly (see anagramsTiers.ts / anagramsStorage.ts).
  for (const tierName of EARNABLE_CUBE_TIERS) {
    const tier = ANAGRAMS_TIERS[tierName];
    if (tier && stats.daily.totalScore >= tier.baseThreshold) {
      await tryUnlock(`ag_cube_${tierName}`);
    }
  }

  if (combinedPlaytimeSeconds >= 3600) await tryUnlock('ag_playtime_1hr');

  if (result.consecutiveSolvedNoSkip >= 25) await tryUnlock('ag_no_skip_25');
  if (result.consecutiveSolvedNoSkip >= 100) await tryUnlock('ag_no_skip_100');
  if (result.fastestRoundSeconds != null && result.fastestRoundSeconds < 10) {
    await tryUnlock('ag_speedy_word_10');
  }

  if (result.mode === 'daily') {
    if (stats.daily.currentStreak >= 3) await tryUnlock('ag_streak_3');
    if (stats.daily.currentStreak >= 7) await tryUnlock('ag_streak_7');
    if (stats.daily.currentStreak >= 14) await tryUnlock('ag_streak_14');
    if (stats.daily.currentStreak >= 30) await tryUnlock('ag_streak_30');
    if (stats.daily.gamesPlayed >= 10) await tryUnlock('ag_daily_10');
    if (stats.daily.gamesPlayed >= 30) await tryUnlock('ag_daily_30');
    if (stats.daily.gamesPlayed >= 100) await tryUnlock('ag_daily_100');
    if (stats.daily.gamesWon >= 10) await tryUnlock('ag_daily_wins_10');
    if (stats.daily.gamesWon >= 50) await tryUnlock('ag_daily_wins_50');
    if (stats.daily.gamesWon >= 150) await tryUnlock('ag_daily_wins_150');
    if (stats.daily.gamesWon >= 365) await tryUnlock('ag_daily_wins_365');
  }

  if (newlyUnlocked.length > 0) {
    await saveUnlockedIds(existing);
  }
  return newlyUnlocked;
}

/**
 * Live progress (0–1) toward a still-locked achievement, computed from the
 * current stats snapshot — powers the green progress bar on the stats
 * screen (same idea as Wordle's inline `progress` field). Returns undefined
 * for achievements that are all-or-nothing (single-attempt / time-based),
 * where a partial bar wouldn't mean anything.
 */
export function getAchievementProgress(achievement: Achievement, stats: AnagramsStats): number | undefined {
  const combinedGames = stats.practice.gamesPlayed + stats.daily.gamesPlayed;
  const combinedWords = stats.practice.wordsSolved + stats.daily.wordsSolved;
  const combinedPerfect = stats.practice.perfectRuns + stats.daily.perfectRuns;
  const combinedPlaytimeSeconds = stats.practice.totalTimeSeconds + stats.daily.totalTimeSeconds;
  const bestScoreEver = Math.max(stats.practice.bestScore ?? 0, stats.daily.bestScore ?? 0);

  const clamp = (value: number) => Math.max(0, Math.min(1, value / achievement.requirement));

  // Cube tier unlocks progress against Daily-only lifetime score — the
  // same value that actually unlocks the cube.
  if (achievement.id.startsWith('ag_cube_')) {
    return clamp(stats.daily.totalScore);
  }

  switch (achievement.id) {
    case 'ag_games_10':
    case 'ag_games_50':
    case 'ag_games_100':
      return clamp(combinedGames);
    case 'ag_words_100':
    case 'ag_words_500':
      return clamp(combinedWords);
    case 'ag_perfect_10':
    case 'ag_perfect_25':
      return clamp(combinedPerfect);
    case 'ag_no_skip_25':
    case 'ag_no_skip_100':
      return clamp(stats.globalNoSkipStreak);
    case 'ag_score_2500':
    case 'ag_score_5000':
    case 'ag_score_7000':
    case 'ag_score_8500':
      return clamp(bestScoreEver);
    case 'ag_playtime_1hr':
      return clamp(combinedPlaytimeSeconds);
    case 'ag_streak_3':
    case 'ag_streak_7':
    case 'ag_streak_14':
    case 'ag_streak_30':
      return clamp(stats.daily.bestStreak);
    case 'ag_daily_10':
    case 'ag_daily_30':
    case 'ag_daily_100':
      return clamp(stats.daily.gamesPlayed);
    case 'ag_daily_wins_10':
    case 'ag_daily_wins_50':
    case 'ag_daily_wins_150':
    case 'ag_daily_wins_365':
      return clamp(stats.daily.gamesWon);
    default:
      // First win, Perfect Run, and the time-based speed achievements are
      // all-or-nothing — no meaningful partial progress to show.
      return undefined;
  }
}
