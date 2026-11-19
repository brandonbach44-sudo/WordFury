// src/shared/dailyClock.ts
//
// Running clock for the timed dailies (Word Grid, Wordsmith, Word Search).
//
// Pausing a countdown when the app is left would let a player screenshot the
// board, leave, and hunt for words with unlimited time. So on the daily path
// the round stores the moment it started and time left is always worked out
// from the wall clock. Quick Play keeps its pausing countdown.

export const DAILY_CLOCK_NOTE = 'The clock keeps running if you leave the app.';

/**
 * Whole seconds left in a round that started at `startedAt` (epoch ms).
 * A clock moved back to before the start counts as an ended round, so it
 * can't be used to buy time.
 */
export function secondsLeft(
  startedAt: number,
  limitSeconds: number,
  now: number = Date.now(),
): number {
  if (!Number.isFinite(startedAt) || now < startedAt) return 0;
  const elapsed = Math.floor((now - startedAt) / 1000);
  return Math.max(0, Math.min(limitSeconds, limitSeconds - elapsed));
}

/**
 * The start time that gives `timeLeft` seconds remaining right now. Used to
 * carry over progress saved by an older build, which stored time left
 * instead of a start time.
 */
export function startedAtFromTimeLeft(
  timeLeft: number,
  limitSeconds: number,
  now: number = Date.now(),
): number {
  const left = Math.max(0, Math.min(limitSeconds, timeLeft));
  return now - (limitSeconds - left) * 1000;
}
