// src/shared/leaderboards/standing.ts
//
// Where the local player stands on one game's daily board for one puzzle
// date. Always read fresh: the place is live and moves during the day, so a
// rank is never cached.

import { boardFor, type GameId } from './boards';
import { diffDaysISO } from './dates';
import { loadLocalStanding, type BoardRow } from './entries';
import { isSignedIn } from './gameCenter';
import { currentOccurrenceDate } from './occurrence';
import { awaitSubmissions, flushPending, pendingValueFor } from './submit';

export type DailyStanding =
  | { kind: 'signedOut' }
  | { kind: 'none' } // no score for that date on the board
  | { kind: 'pending'; value: number } // waiting for its board to open
  | { kind: 'posted'; row: BoardRow; totalPlayerCount: number | null };

export async function loadDailyStanding(gameId: GameId, dateISO: string): Promise<DailyStanding> {
  await awaitSubmissions();
  if (!isSignedIn()) return { kind: 'signedOut' };
  await flushPending();

  const pending = await pendingValueFor(gameId, dateISO);
  if (pending !== null) return { kind: 'pending', value: pending };

  const boardId = boardFor(gameId).boardId;
  const occDate = await currentOccurrenceDate(boardId);
  if (!occDate) return { kind: 'none' };
  const back = diffDaysISO(occDate, dateISO);
  if (back < 0 || back > 7) return { kind: 'none' };
  const standing = await loadLocalStanding(boardId, back);
  if (!standing.local) return { kind: 'none' };
  return { kind: 'posted', row: standing.local, totalPlayerCount: standing.totalPlayerCount };
}
