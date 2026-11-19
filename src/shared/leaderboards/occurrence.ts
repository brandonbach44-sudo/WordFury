// src/shared/leaderboards/occurrence.ts
//
// Which puzzle date (daily boards) or which Monday (weekly board) the board
// occurrence open right now belongs to. Cached briefly per board.

import { GameCenter } from '../../../modules/game-center';
import { puzzleDateForOccurrence } from './dates';

const CACHE_MS = 60000;
const cache = new Map<string, { at: number; dateISO: string | null }>();

/** The date of the occurrence open now, or null if it can't be read. */
export async function currentOccurrenceDate(boardId: string): Promise<string | null> {
  const hit = cache.get(boardId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.dateISO;
  if (!GameCenter) return null;
  try {
    const occ = await GameCenter.loadOccurrence(boardId);
    const now = Date.now();
    const open =
      occ.startDate > 0 && now >= occ.startDate && now < occ.startDate + occ.durationSeconds * 1000;
    const dateISO = open ? puzzleDateForOccurrence(occ.startDate) : null;
    cache.set(boardId, { at: now, dateISO });
    return dateISO;
  } catch {
    return null;
  }
}
