// src/shared/leaderboards/submit.ts
//
// Every daily score goes through here: encode, then the pending queue, then
// for each queued score the time-zone guard and the first-result guard
// before it reaches Game Center.
//
// Time-zone guard. A daily board occurrence opens at 08:00 UTC and is the
// board for the puzzle date it opens on. A score for:
//   - the current occurrence's date is submitted (after the first-result check)
//   - the next date (played before its board opened) waits in the queue
//   - an earlier date (its board already closed) is dropped
//   - more than one day ahead (device clock is wrong) is dropped, never sent
//
// First-result guard. "Already played" locks live in AsyncStorage, so a
// reinstall clears them. Before the first submission for a board and date
// this device has no record of, the player's existing entry is loaded; if
// there is a real one for that date (rank 1 or more, context matching the
// puzzle date), that board and date are blocked for the day. Hex Hive may
// keep submitting higher scores, but only when this device made the first
// submission.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameCenter, type GameCenterEntriesResult } from '../../../modules/game-center';
import { boardFor, type DailyResults, type GameId } from './boards';
import { invalidateBoardCache } from './boardCache';
import { dateContext, diffDaysISO, localDateISO } from './dates';
import { realLocal } from './entries';
import { enableGameCenter, getGameCenterState, isSignedIn } from './gameCenter';
import { recordFinish, submitWeeklyTotal } from './ledger';
import { currentOccurrenceDate } from './occurrence';

export const SUBMITTED_KEY = 'leaderboard_submitted_v1';
const PENDING_KEY = 'leaderboard_pending_v1';

export type PendingScore = {
  boardId: string;
  value: number;
  context: number;
  puzzleDateISO: string;
};

export type SubmittedRecord = { date: string; mine: boolean };
export type SubmittedMap = Record<string, SubmittedRecord>;

export type DailySubmissionState = 'none' | 'pending' | 'submitted' | 'blocked';

// ── Storage ───────────────────────────────────────────────────────────────────

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`leaderboards: failed to save ${key}`, e);
  }
}

async function loadPending(): Promise<PendingScore[]> {
  const list = await readJSON<PendingScore[]>(PENDING_KEY, []);
  return Array.isArray(list) ? list : [];
}

async function loadSubmitted(): Promise<SubmittedMap> {
  const map = await readJSON<SubmittedMap>(SUBMITTED_KEY, {});
  return map && typeof map === 'object' ? map : {};
}

/** Adds a score to the queue, keeping only the best per board and date. */
function mergePending(list: PendingScore[], item: PendingScore): PendingScore[] {
  const existing = list.find((p) => p.boardId === item.boardId && p.puzzleDateISO === item.puzzleDateISO);
  if (!existing) return [...list, item];
  if (existing.value >= item.value) return list;
  return list.map((p) => (p === existing ? item : p));
}

// ── Time-zone guard ───────────────────────────────────────────────────────────

export type GuardVerdict = 'submit' | 'wait' | 'drop';

/**
 * Compares a score's puzzle date with the date of the board occurrence that
 * is open now. Pure, for testing.
 */
export function timeZoneVerdict(scoreDateISO: string, occurrenceDateISO: string): GuardVerdict {
  const diff = diffDaysISO(scoreDateISO, occurrenceDateISO);
  if (diff === 0) return 'submit';
  if (diff === 1) return 'wait'; // played before its board opened
  return 'drop'; // board already closed, or the device clock is wrong
}

// ── First-result guard ────────────────────────────────────────────────────────

/**
 * Whether an existing entry blocks the first submission for a puzzle date:
 * only a real local entry (rank 1 or more) whose context is that date. Game
 * Center's placeholder entry, or a real one from another date, never blocks.
 * Pure, for testing.
 */
export function firstResultBlocks(res: Pick<GameCenterEntriesResult, 'local'>, puzzleDateISO: string): boolean {
  const entry = realLocal(res);
  return entry !== null && entry.context === dateContext(puzzleDateISO);
}

// ── Queue processing ──────────────────────────────────────────────────────────

// Submissions run one at a time so two quick Hex Hive submits can't both pass
// the first-result check before either is recorded.
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

type ItemOutcome = 'submitted' | 'blocked' | 'wait' | 'drop' | 'retry';

async function processItem(item: PendingScore, submitted: SubmittedMap): Promise<ItemOutcome> {
  if (!GameCenter || !isSignedIn()) return 'retry';

  const occDate = await currentOccurrenceDate(item.boardId);
  if (occDate === null) return 'retry';
  const verdict = timeZoneVerdict(item.puzzleDateISO, occDate);
  if (verdict === 'wait') return 'wait';
  if (verdict === 'drop') return 'drop';

  const record = submitted[item.boardId];
  const sameDay = record?.date === item.puzzleDateISO;
  const isHexHive = boardFor('hexhive').boardId === item.boardId;

  if (sameDay && !record.mine) return 'blocked';
  if (sameDay && record.mine && !isHexHive) return 'submitted'; // already posted

  if (!sameDay) {
    // First submission for this board and date from this device: if the
    // player already has an entry, it came from another install or device,
    // and that first result is final.
    try {
      const res = await GameCenter.loadEntries(item.boardId, 'global', 1, 1, 0);
      if (firstResultBlocks(res, item.puzzleDateISO)) {
        submitted[item.boardId] = { date: item.puzzleDateISO, mine: false };
        return 'blocked';
      }
    } catch {
      return 'retry';
    }
  }

  try {
    await GameCenter.submitScore(item.boardId, item.value, item.context);
    submitted[item.boardId] = { date: item.puzzleDateISO, mine: true };
    invalidateBoardCache(item.boardId);
    return 'submitted';
  } catch {
    return 'retry';
  }
}

/**
 * Tries every queued score. Run when the app comes to the foreground, when a
 * results screen opens and when a game menu opens.
 */
export function flushPending(): Promise<void> {
  return serialize(async () => {
    const pending = await loadPending();
    if (pending.length === 0) return;
    const submitted = await loadSubmitted();
    const keep: PendingScore[] = [];
    const today = localDateISO();
    for (const item of pending) {
      // Anything from two or more days ago has a closed board for certain,
      // even if Game Center couldn't be asked (signed out, offline).
      if (diffDaysISO(today, item.puzzleDateISO) >= 2) continue;
      const outcome = await processItem(item, submitted);
      if (outcome === 'wait' || outcome === 'retry') keep.push(item);
    }
    await writeJSON(SUBMITTED_KEY, submitted);
    await writeJSON(PENDING_KEY, keep);
  });
}

/**
 * Called by each game at the exact point it saves its daily result. Records
 * the finishing points, opts the player in to Game Center (never on a first
 * launch: only once a daily is done), queues the score and tries to send it.
 */
// Submissions still running. A results screen opens the moment a daily ends,
// usually before its score is queued, so the rank mark waits for these.
const inFlight = new Set<Promise<void>>();

/** Resolves once every submitDaily started so far has finished. */
export async function awaitSubmissions(): Promise<void> {
  while (inFlight.size > 0) {
    await Promise.all([...inFlight]);
  }
}

export function submitDaily<G extends GameId>(
  gameId: G,
  result: DailyResults[G],
  puzzleDateISO: string = localDateISO(),
): Promise<void> {
  const run = submitDailyNow(gameId, result, puzzleDateISO);
  inFlight.add(run);
  run.finally(() => inFlight.delete(run));
  return run;
}

async function submitDailyNow<G extends GameId>(
  gameId: G,
  result: DailyResults[G],
  puzzleDateISO: string,
): Promise<void> {
  try {
    const board = boardFor(gameId);
    const value = board.encode(result as DailyResults[GameId]);
    const hexMasterTarget = gameId === 'hexhive' ? (result as DailyResults['hexhive']).masterTarget : undefined;
    const real = board.isRealAttempt(value, { hexMasterTarget });

    // Finishing points count whether or not the score reaches a board.
    await recordFinish(gameId, puzzleDateISO, real);

    if (getGameCenterState().status === 'unavailable') return;
    await enableGameCenter();

    await serialize(async () => {
      const pending = await loadPending();
      await writeJSON(
        PENDING_KEY,
        mergePending(pending, {
          boardId: board.boardId,
          value,
          context: dateContext(puzzleDateISO),
          puzzleDateISO,
        }),
      );
    });
    await flushPending();
    submitWeeklyTotal().catch(() => {});
  } catch (e) {
    console.warn('submitDaily failed', e);
  }
}

/** The queued (not yet posted) value for a game and date, if any. */
export async function pendingValueFor(gameId: GameId, puzzleDateISO: string): Promise<number | null> {
  const boardId = boardFor(gameId).boardId;
  const item = (await loadPending()).find((p) => p.boardId === boardId && p.puzzleDateISO === puzzleDateISO);
  return item ? item.value : null;
}

/** Where today's (or a given date's) score for a game stands. */
export async function dailySubmissionState(gameId: GameId, puzzleDateISO: string): Promise<DailySubmissionState> {
  const boardId = boardFor(gameId).boardId;
  const pending = await loadPending();
  if (pending.some((p) => p.boardId === boardId && p.puzzleDateISO === puzzleDateISO)) return 'pending';
  const record = (await loadSubmitted())[boardId];
  if (record?.date === puzzleDateISO) return record.mine ? 'submitted' : 'blocked';
  return 'none';
}

// ── Hex Hive throttle ─────────────────────────────────────────────────────────
// Hex Hive submits while the player is still going: whenever the score rises,
// at most once every 10 seconds, once more on leaving the screen, and right
// away on reaching Master.

const HEX_THROTTLE_MS = 10000;

export function createHexHiveSubmitter(puzzleDateISO: string) {
  let latest: DailyResults['hexhive'] | null = null;
  let lastSentScore = -1;
  let lastSentAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const send = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!latest || latest.score <= lastSentScore) return;
    lastSentScore = latest.score;
    lastSentAt = Date.now();
    submitDaily('hexhive', latest, puzzleDateISO);
  };

  return {
    /** The score rose. Master sends immediately; otherwise throttled. */
    update(result: DailyResults['hexhive']) {
      latest = result;
      if (result.reachedMaster) {
        send();
        return;
      }
      const wait = HEX_THROTTLE_MS - (Date.now() - lastSentAt);
      if (wait <= 0) {
        send();
      } else if (!timer) {
        timer = setTimeout(send, wait);
      }
    },
    /** Leaving the screen: send whatever hasn't gone yet. */
    flush() {
      send();
    },
  };
}
