// src/shared/leaderboards/useLeaderboard.ts
//
// Hook for leaderboard UI: loads one occurrence of a board and reports
// signed out, loading, empty, error or ready. Loaded boards are cached for
// 60 seconds (see boardCache.ts).

import { useCallback, useEffect, useState } from 'react';
import { boardCacheKey, getCachedBoard, setCachedBoard } from './boardCache';
import { addDaysISO, diffDaysISO, localDateISO, weekMondayISO } from './dates';
import { loadBoard, type LoadedBoard } from './entries';
import { useGameCenterState } from './gameCenter';
import { occurrenceStatus } from './occurrence';

export type LeaderboardStatus =
  | 'unavailable' // no Game Center on this device or build
  | 'signedOut' // includes restricted accounts and players who haven't opted in yet
  | 'loading'
  | 'notOpen' // the board for this date hasn't opened yet
  | 'empty'
  | 'error'
  | 'ready';

export type LeaderboardView = {
  status: LeaderboardStatus;
  board: LoadedBoard | null;
  reload: () => void;
};

/**
 * Which occurrence holds a given puzzle date or week: 0 is the one open now,
 * 1 the one before, and so on. Negative means it hasn't opened yet.
 * 'notOpen' when the board's first occurrence hasn't started, null when
 * Game Center couldn't be read.
 */
export async function occurrencesBackFor(boardId: string, dateISO: string): Promise<number | 'notOpen' | null> {
  const status = await occurrenceStatus(boardId);
  if (status.kind === 'notOpen') return 'notOpen';
  if (status.kind !== 'open') return null;
  return diffDaysISO(status.dateISO, dateISO);
}

/**
 * The status a failed board load shows. Asking for an occurrence before the
 * board's first one (Last Week in the weekly board's first week, Yesterday
 * on a daily board's first day) rejects with E_NO_OCCURRENCE from the native
 * walk back: nothing was posted then, so it shows as empty. Anything else is
 * a real error. Pure, for testing.
 */
export function statusForLoadError(e: unknown): 'empty' | 'error' {
  const code = e && typeof e === 'object' && 'code' in e ? (e as { code?: unknown }).code : undefined;
  return code === 'E_NO_OCCURRENCE' ? 'empty' : 'error';
}

/**
 * Loads `boardId` for the occurrence `daysBack` before the one holding the
 * player's local today (daily boards), or `weeksBack` weeks before the one
 * holding this local week (the weekly board).
 */
export function useLeaderboard(
  boardId: string,
  opts: {
    scope?: 'global' | 'friends';
    daysBack?: number;
    /** Weekly board: 0 is this local week, 1 last week. */
    weeksBack?: number;
    count?: number;
    enabled?: boolean;
  } = {},
): LeaderboardView {
  const gc = useGameCenterState();
  const scope = opts.scope ?? 'global';
  const count = opts.count ?? 25;
  const enabled = opts.enabled ?? true;
  const daysBack = opts.daysBack ?? 0;
  const weeksBack = opts.weeksBack;
  const [status, setStatus] = useState<LeaderboardStatus>('loading');
  const [board, setBoard] = useState<LoadedBoard | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    if (gc.status === 'unavailable') {
      setStatus('unavailable');
      return;
    }
    if (gc.status !== 'signedIn') {
      setStatus(gc.status === 'loading' ? 'loading' : 'signedOut');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let back: number | 'notOpen';
        if (weeksBack !== undefined) {
          const monday = addDaysISO(weekMondayISO(localDateISO()), -7 * weeksBack);
          const days = await occurrencesBackFor(boardId, monday);
          if (days === null) throw new Error('no occurrence');
          back = days === 'notOpen' ? days : Math.floor(days / 7);
        } else {
          const fromToday = await occurrencesBackFor(boardId, localDateISO());
          if (fromToday === null) throw new Error('no occurrence');
          back = fromToday === 'notOpen' ? fromToday : fromToday + daysBack;
        }
        if (back === 'notOpen' || back < 0) {
          if (!cancelled) {
            setBoard(null);
            setStatus('notOpen');
          }
          return;
        }
        const key = boardCacheKey(boardId, scope, back, count);
        const cached = nonce === 0 ? getCachedBoard(key) : null;
        if (!cached && !cancelled) {
          setStatus('loading');
          setBoard(null);
        }
        const data = cached ?? (await loadBoard(boardId, { scope, occurrencesBack: back, count }));
        if (!cached) setCachedBoard(key, data);
        if (cancelled) return;
        setBoard(data);
        setStatus(data.rows.length === 0 && !data.local ? 'empty' : 'ready');
      } catch (e) {
        if (cancelled) return;
        setBoard(null);
        setStatus(statusForLoadError(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, scope, count, daysBack, weeksBack, enabled, gc.status, nonce]);

  return { status, board, reload };
}
