// src/shared/leaderboards/entries.ts
//
// Reading boards for display, the rank mark and the placement bonus.
//
// Ties share a place: the displayed place is 1 plus the number of entries
// with a strictly higher value. Game Center's own rank may split ties, so
// places are worked out from the values here.

import { GameCenter, type GameCenterEntriesResult, type GameCenterEntry } from '../../../modules/game-center';
import { puzzleDateForOccurrence } from './dates';

export type BoardRow = GameCenterEntry & {
  /** Shared place: equal values show the same place. */
  place: number;
};

export type LoadedBoard = {
  rows: BoardRow[];
  local: BoardRow | null;
  totalPlayerCount: number | null;
  /** Puzzle date (daily) or Monday (weekly) the loaded occurrence belongs to. */
  occurrenceDateISO: string | null;
};

/**
 * The local player's real entry from a loadEntries result, or null. Game
 * Center returns a placeholder local entry (rank 0, score 0) when the player
 * has no score in that occurrence; a real entry always has rank 1 or more.
 * Every read of a loadEntries result's local entry goes through here.
 */
export function realLocal(res: Pick<GameCenterEntriesResult, 'local'>): GameCenterEntry | null {
  const local = res.local;
  return local && local.rank >= 1 ? local : null;
}

/**
 * Shared places for a run of entries sorted best first and starting at
 * Game Center rank `firstRank`. `placeBefore` is the place of the entry just
 * above the run and `valueBefore` its value, when the run doesn't start at 1.
 */
export function assignPlaces(
  entries: GameCenterEntry[],
  valueBefore: number | null = null,
  placeBefore: number | null = null,
): BoardRow[] {
  const sorted = [...entries].sort((a, b) => a.rank - b.rank);
  const rows: BoardRow[] = [];
  let prevValue = valueBefore;
  let prevPlace = placeBefore;
  for (const e of sorted) {
    const place = prevValue !== null && prevPlace !== null && e.value === prevValue ? prevPlace : e.rank;
    rows.push({ ...e, place });
    prevValue = e.value;
    prevPlace = place;
  }
  return rows;
}

/**
 * The shared place of one entry: walks up from its rank through any run of
 * equal values until a strictly better entry (or the top) is found.
 */
async function placeOf(
  boardId: string,
  scope: 'global' | 'friends',
  occurrencesBack: number,
  entry: GameCenterEntry,
): Promise<number> {
  if (!GameCenter || entry.rank <= 1) return Math.max(1, entry.rank);
  let place = entry.rank;
  let windowEnd = entry.rank - 1;
  // Each pass looks at up to 100 entries above; three passes covers a tie
  // of 300 identical results, more than any real board will have.
  for (let pass = 0; pass < 3 && windowEnd >= 1; pass++) {
    const start = Math.max(1, windowEnd - 99);
    const res = await GameCenter.loadEntries(boardId, scope, start, windowEnd - start + 1, occurrencesBack);
    const above = [...res.entries].sort((a, b) => b.rank - a.rank); // nearest first
    let brokeOut = false;
    for (const e of above) {
      if (e.rank >= place) continue;
      if (e.value === entry.value) {
        place = e.rank;
      } else {
        brokeOut = true;
        break;
      }
    }
    if (brokeOut || start === 1) break;
    windowEnd = start - 1;
  }
  return place;
}

/**
 * Loads one occurrence of a board: the first `count` rows, the local
 * player's row and the player count, all with shared places.
 */
export async function loadBoard(
  boardId: string,
  opts: { scope?: 'global' | 'friends'; occurrencesBack?: number; count?: number } = {},
): Promise<LoadedBoard> {
  const scope = opts.scope ?? 'global';
  const back = opts.occurrencesBack ?? 0;
  const count = opts.count ?? 25;
  if (!GameCenter) return { rows: [], local: null, totalPlayerCount: null, occurrenceDateISO: null };

  const res = await GameCenter.loadEntries(boardId, scope, 1, count, back);
  const rows = assignPlaces(res.entries);

  let local: BoardRow | null = null;
  const mine = realLocal(res);
  if (mine) {
    const inList = rows.find((r) => r.playerId === mine.playerId);
    local = inList ? { ...inList, isLocal: true } : { ...mine, place: await placeOf(boardId, scope, back, mine) };
  }

  return {
    rows: rows.map((r) => (local && r.playerId === local.playerId ? { ...r, isLocal: true } : r)),
    local,
    totalPlayerCount: res.totalPlayerCount > 0 ? res.totalPlayerCount : null,
    occurrenceDateISO: res.occurrenceStart > 0 ? puzzleDateForOccurrence(res.occurrenceStart) : null,
  };
}

/**
 * Just the local player's entry, shared place and the player count for one
 * occurrence. Used for the rank mark, the placement bonus and the rebuild.
 */
export async function loadLocalStanding(
  boardId: string,
  occurrencesBack: number,
): Promise<{
  local: BoardRow | null;
  totalPlayerCount: number | null;
  entriesLoaded: number;
  occurrenceDateISO: string | null;
}> {
  if (!GameCenter) return { local: null, totalPlayerCount: null, entriesLoaded: 0, occurrenceDateISO: null };
  // Twenty rows: enough to tell whether the podium minimum was met when
  // Game Center can't report a player count.
  const res = await GameCenter.loadEntries(boardId, 'global', 1, 20, occurrencesBack);
  const rows = assignPlaces(res.entries);
  let local: BoardRow | null = null;
  const mine = realLocal(res);
  if (mine) {
    const inList = rows.find((r) => r.playerId === mine.playerId);
    local = inList ?? { ...mine, place: await placeOf(boardId, 'global', occurrencesBack, mine) };
  }
  return {
    local,
    totalPlayerCount: res.totalPlayerCount > 0 ? res.totalPlayerCount : null,
    entriesLoaded: res.entries.length,
    occurrenceDateISO: res.occurrenceStart > 0 ? puzzleDateForOccurrence(res.occurrenceStart) : null,
  };
}
