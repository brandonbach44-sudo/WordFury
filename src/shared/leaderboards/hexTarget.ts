// src/shared/leaderboards/hexTarget.ts
//
// That date's Hex Hive Master score, recomputed from the date's puzzle. The
// weekly rebuild needs it to tell a real Hex Hive attempt from a throwaway.
// Kept apart from boards.ts so the encoders stay free of the word lists.

import { getDailyPuzzle, getPuzzleSolution } from '../../hexhive/utils/generator';
import { getEffectiveMaxScore } from '../../hexhive/utils/scoring';
import { localDateFromISO } from './dates';

const cache = new Map<string, number>();

export function hexMasterTargetFor(dateISO: string): number {
  const hit = cache.get(dateISO);
  if (hit !== undefined) return hit;
  let target = 0;
  try {
    const puzzle = getDailyPuzzle(localDateFromISO(dateISO));
    target = getEffectiveMaxScore(getPuzzleSolution(puzzle).maxScore);
  } catch {
    target = 0;
  }
  cache.set(dateISO, target);
  return target;
}
