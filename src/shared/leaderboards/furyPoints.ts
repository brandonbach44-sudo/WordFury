// src/shared/leaderboards/furyPoints.ts
//
// Every number behind weekly Fury points lives here and nowhere else:
// finishing points, the real-attempt thresholds, the placement bonus tiers,
// the podium minimum and the fallback tiers.

/** Finishing points for a daily played for real. */
export const FINISH_REAL = 50;
/** Finishing points for a throwaway: finished, but without really trying. */
export const FINISH_THROWAWAY = 20;

/**
 * What counts as a real attempt, per game. Furdle and Hangman count any
 * finish; Word Ladder counts reaching the target word (giving up is 20).
 */
export const REAL_ATTEMPT = {
  wordsearchMinFound: 5, // of 10 words
  hexhiveMinMasterFraction: 0.25, // the "Sharp" rank
  wordgridMinScore: 250,
  wordsmithMinScore: 1000,
  anagramsMinScore: 500,
} as const;

/** 1st, 2nd and 3rd only pay out when at least this many played that day. */
export const PODIUM_MIN_PLAYERS = 20;
export const PODIUM_BONUS = [50, 45, 40] as const;

/**
 * "Top X%" covers places 1 through floor(X * players). A tier covering fewer
 * than one place doesn't exist that day. Best tier first.
 */
export const PERCENT_TIERS: readonly { pct: number; bonus: number }[] = [
  { pct: 0.01, bonus: 35 },
  { pct: 0.05, bonus: 30 },
  { pct: 0.1, bonus: 25 },
  { pct: 0.25, bonus: 15 },
  { pct: 0.5, bonus: 5 },
];

/**
 * Used only if Game Center can't report how many played. Places 1 to 3 still
 * get the podium bonus when at least 20 entries load.
 */
export const FALLBACK_TIERS: readonly { maxPlace: number; bonus: number }[] = [
  { maxPlace: 10, bonus: 25 },
  { maxPlace: 25, bonus: 15 },
  { maxPlace: 50, bonus: 5 },
];

export const MAX_POINTS_PER_GAME_DAY = 100;
export const MAX_WEEKLY_FURY = 5600;

export function finishPoints(realAttempt: boolean): number {
  return realAttempt ? FINISH_REAL : FINISH_THROWAWAY;
}

export type BonusTier =
  | { kind: 'podium'; place: 1 | 2 | 3 }
  | { kind: 'percent'; pct: number }
  | { kind: 'fallback'; maxPlace: number }
  | { kind: 'none' };

/**
 * The placement bonus for a final place on a closed daily board.
 *
 * `place` is the shared place (1 plus the number of strictly better entries).
 * `players` is the day's total player count, or null when Game Center can't
 * report it; `entriesLoaded` is then used for the podium minimum instead.
 */
export function placementBonus(
  place: number,
  players: number | null,
  entriesLoaded: number = 0,
): { bonus: number; tier: BonusTier } {
  if (!Number.isFinite(place) || place < 1) return { bonus: 0, tier: { kind: 'none' } };

  const podiumCount = players ?? entriesLoaded;
  if (place <= 3 && podiumCount >= PODIUM_MIN_PLAYERS) {
    return { bonus: PODIUM_BONUS[place - 1], tier: { kind: 'podium', place: place as 1 | 2 | 3 } };
  }

  if (players !== null && players > 0) {
    for (const tier of PERCENT_TIERS) {
      const covered = Math.floor(tier.pct * players);
      if (covered >= 1 && place <= covered) {
        return { bonus: tier.bonus, tier: { kind: 'percent', pct: tier.pct } };
      }
    }
    return { bonus: 0, tier: { kind: 'none' } };
  }

  for (const tier of FALLBACK_TIERS) {
    if (place <= tier.maxPlace) {
      return { bonus: tier.bonus, tier: { kind: 'fallback', maxPlace: tier.maxPlace } };
    }
  }
  return { bonus: 0, tier: { kind: 'none' } };
}

/** Short label for a tier, for the morning recap and the breakdown. */
export function tierLabel(tier: BonusTier): string | null {
  switch (tier.kind) {
    case 'podium':
      return tier.place === 1 ? '1st' : tier.place === 2 ? '2nd' : '3rd';
    case 'percent':
      return `top ${Math.round(tier.pct * 100)}%`;
    case 'fallback':
      return `top ${tier.maxPlace}`;
    default:
      return null;
  }
}
