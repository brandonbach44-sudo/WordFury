// src/shared/leaderboards/occurrence.ts
//
// Which puzzle date (daily boards) or which Monday (weekly board) the board
// occurrence open right now belongs to. Cached briefly per board.

import { GameCenter } from '../../../modules/game-center';
import { puzzleDateForOccurrence } from './dates';

const CACHE_MS = 60000;

/**
 * Where a board stands right now:
 *   - open: an occurrence is open, for this puzzle date or Monday
 *   - notOpen: Game Center answered and the board's first occurrence starts
 *     later (the weekly board before its first week)
 *   - unknown: Game Center couldn't be read, or no occurrence is open
 */
export type OccurrenceStatus = { kind: 'open'; dateISO: string } | { kind: 'notOpen' } | { kind: 'unknown' };

const cache = new Map<string, { at: number; status: OccurrenceStatus }>();

export async function occurrenceStatus(boardId: string): Promise<OccurrenceStatus> {
  const hit = cache.get(boardId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.status;
  if (!GameCenter) return { kind: 'unknown' };
  try {
    const occ = await GameCenter.loadOccurrence(boardId);
    const now = Date.now();
    let status: OccurrenceStatus;
    if (occ.startDate > 0 && now < occ.startDate) {
      status = { kind: 'notOpen' };
    } else if (occ.startDate > 0 && now < occ.startDate + occ.durationSeconds * 1000) {
      status = { kind: 'open', dateISO: puzzleDateForOccurrence(occ.startDate) };
    } else {
      status = { kind: 'unknown' };
    }
    cache.set(boardId, { at: now, status });
    return status;
  } catch {
    return { kind: 'unknown' };
  }
}

/**
 * The date of the occurrence open now, or null if none is open (not open
 * yet, or it can't be read). Submissions treat both as nothing to post.
 */
export async function currentOccurrenceDate(boardId: string): Promise<string | null> {
  const status = await occurrenceStatus(boardId);
  return status.kind === 'open' ? status.dateISO : null;
}
