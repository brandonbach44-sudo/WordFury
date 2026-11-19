// src/shared/leaderboards/ledger.ts
//
// The weekly Fury ledger. The device keeps a cache of, per date and game,
// the finishing points and the placement bonus (null until that day's
// board has closed and the bonus has been collected).
//
// Crediting rules:
//   - Finishing points count right away, toward the week of the puzzle date.
//   - The bonus for puzzle date D is known once D's board closes (08:00 UTC
//     on D+1) and counts toward the week containing D+1. So a week is
//     finishing points for Monday to Sunday plus bonuses for the previous
//     Sunday through Saturday.
//   - A bonus collected after its week has ended is dropped.
//
// Every device rebuilds the same ledger from the same Game Center entries,
// so a reinstall or a second device reports the same weekly total.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameCenter } from '../../../modules/game-center';
import { BOARDS, GAME_IDS, WEEKLY_BOARD_ID, type GameId } from './boards';
import { addDaysISO, dayNumber, diffDaysISO, localDateISO, weekIdFor, weekMondayISO } from './dates';
import { loadLocalStanding } from './entries';
import { finishPoints, placementBonus, type BonusTier } from './furyPoints';
import { isSignedIn } from './gameCenter';
import { hexMasterTargetFor } from './hexTarget';
import { currentOccurrenceDate } from './occurrence';
import { appendRecap, type RecapItem } from './recap';

const LEDGER_KEY = 'fury_week_ledger_v2';
const REBUILT_KEY = 'fury_ledger_rebuilt_v1';
const PRUNE_DAYS = 35;
// Daily boards close at 08:00 UTC on the day after their puzzle date.
const CLOSE_HOUR_UTC = 8;
// Game Center can reach this many occurrences back.
const MAX_OCCURRENCES_BACK = 7;

export type LedgerCell = {
  finish: number; // 50 real, 20 throwaway
  bonus: number | null; // null: not settled yet
  tier?: BonusTier;
  place?: number;
  dropped?: boolean; // collected after its week ended: shown, not counted
};
export type Ledger = Record<string, Partial<Record<GameId, LedgerCell>>>;

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Records finishing points; a later real attempt upgrades a throwaway. */
export function withFinish(ledger: Ledger, gameId: GameId, dateISO: string, real: boolean): Ledger {
  const day = { ...(ledger[dateISO] ?? {}) };
  const prev = day[gameId];
  day[gameId] = {
    ...(prev ?? { bonus: null }),
    finish: Math.max(prev?.finish ?? 0, finishPoints(real)),
  };
  return { ...ledger, [dateISO]: day };
}

export function prune(ledger: Ledger, todayISO: string, keepDays: number = PRUNE_DAYS): Ledger {
  const out: Ledger = {};
  for (const [date, day] of Object.entries(ledger)) {
    if (diffDaysISO(todayISO, date) <= keepDays) out[date] = day;
  }
  return out;
}

/** The Monday of the week a date's placement bonus is credited to. */
export function bonusCreditMonday(dateISO: string): string {
  return weekMondayISO(addDaysISO(dateISO, 1));
}

/** True if a bonus collected on `collectedOnISO` is too late for its week. */
export function isBonusLate(dateISO: string, collectedOnISO: string): boolean {
  return weekMondayISO(collectedOnISO) > bonusCreditMonday(dateISO);
}

/** Epoch ms at which a puzzle date's daily board closes. */
export function boardCloseMs(dateISO: string): number {
  return (dayNumber(dateISO) + 1) * 86400000 + CLOSE_HOUR_UTC * 3600000;
}

export type WeekBreakdown = {
  mondayISO: string;
  total: number;
  finishTotal: number;
  bonusTotal: number;
  podiums: number;
  /** Games finished on each day, Monday first. */
  dailiesDone: number[];
  days: {
    dateISO: string;
    games: Partial<Record<GameId, { finish: number; bonus: number | null; tier?: BonusTier; dropped?: boolean }>>;
  }[];
};

export function weekBreakdown(ledger: Ledger, mondayISO: string): WeekBreakdown {
  let finishTotal = 0;
  let bonusTotal = 0;
  let podiums = 0;
  const dailiesDone: number[] = [];
  const days: WeekBreakdown['days'] = [];

  for (let d = 0; d < 7; d++) {
    const date = addDaysISO(mondayISO, d);
    const day = ledger[date] ?? {};
    let done = 0;
    const games: WeekBreakdown['days'][number]['games'] = {};
    for (const g of GAME_IDS) {
      const cell = day[g];
      if (!cell) continue;
      if (cell.finish > 0) done += 1;
      finishTotal += cell.finish;
      games[g] = { finish: cell.finish, bonus: cell.bonus, tier: cell.tier, dropped: cell.dropped };
    }
    dailiesDone.push(done);
    days.push({ dateISO: date, games });
  }

  // Bonuses credited to this week: puzzle dates from the previous Sunday
  // through Saturday.
  for (let d = -1; d < 6; d++) {
    const date = addDaysISO(mondayISO, d);
    const day = ledger[date] ?? {};
    for (const g of GAME_IDS) {
      const cell = day[g];
      if (!cell || cell.bonus === null || cell.dropped) continue;
      bonusTotal += cell.bonus;
      if (cell.tier?.kind === 'podium') podiums += 1;
    }
  }

  return {
    mondayISO,
    total: finishTotal + bonusTotal,
    finishTotal,
    bonusTotal,
    podiums,
    dailiesDone,
    days,
  };
}

// Packed weekly context (fits in 53 bits, so JS numbers carry it exactly):
//   weekId * 2^34 + podiums * 2^28 + sum over d of dailiesDone[d] << (4 * d)
const POW_28 = 2 ** 28;
const POW_34 = 2 ** 34;

export function packWeeklyContext(weekId: number, podiums: number, dailiesDone: number[]): number {
  let days = 0;
  for (let d = 0; d < 7; d++) {
    const n = Math.max(0, Math.min(15, Math.round(dailiesDone[d] ?? 0)));
    days += n * 2 ** (4 * d);
  }
  const p = Math.max(0, Math.min(63, Math.round(podiums)));
  return weekId * POW_34 + p * POW_28 + days;
}

export function unpackWeeklyContext(ctx: number): { weekId: number; podiums: number; dailiesDone: number[] } {
  const weekId = Math.floor(ctx / POW_34);
  const rest = ctx - weekId * POW_34;
  const podiums = Math.floor(rest / POW_28);
  let days = rest - podiums * POW_28;
  const dailiesDone: number[] = [];
  for (let d = 0; d < 7; d++) {
    dailiesDone.push(days % 16);
    days = Math.floor(days / 16);
  }
  return { weekId, podiums, dailiesDone };
}

// ── Storage ───────────────────────────────────────────────────────────────────

export async function loadLedger(): Promise<{ ledger: Ledger; existed: boolean }> {
  try {
    const raw = await AsyncStorage.getItem(LEDGER_KEY);
    if (!raw) return { ledger: {}, existed: false };
    const parsed = JSON.parse(raw);
    return { ledger: parsed && typeof parsed === 'object' ? parsed : {}, existed: true };
  } catch {
    return { ledger: {}, existed: false };
  }
}

async function saveLedger(ledger: Ledger): Promise<void> {
  try {
    await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(prune(ledger, localDateISO())));
  } catch (e) {
    console.warn('leaderboards: failed to save the Fury ledger', e);
  }
}

// Ledger writes run one at a time so a finish and a settlement can't
// overwrite each other.
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

// ── Writes ────────────────────────────────────────────────────────────────────

/** Finishing points for a completed daily. Works signed out too. */
export function recordFinish(gameId: GameId, dateISO: string, real: boolean): Promise<void> {
  return serialize(async () => {
    const { ledger } = await loadLedger();
    await saveLedger(withFinish(ledger, gameId, dateISO, real));
  });
}

async function standingFor(gameId: GameId, dateISO: string) {
  const boardId = BOARDS[gameId].boardId;
  const occDate = await currentOccurrenceDate(boardId);
  if (!occDate) return null;
  const back = diffDaysISO(occDate, dateISO);
  if (back < 0 || back > MAX_OCCURRENCES_BACK) return { back, standing: null };
  const standing = await loadLocalStanding(boardId, back);
  // Guard against an occurrence that isn't the one we meant to read.
  if (standing.occurrenceDateISO && standing.occurrenceDateISO !== dateISO) return null;
  return { back, standing };
}

/**
 * Collects placement bonuses for every closed day not yet settled. Run when
 * the app comes to the foreground, when Your Fury opens and when a results
 * screen opens. Newly settled bonuses feed the morning recap.
 */
export function settleBonuses(): Promise<RecapItem[]> {
  return serialize(async () => {
    const { ledger } = await loadLedger();
    const today = localDateISO();
    const now = Date.now();
    const settled: RecapItem[] = [];
    let changed = false;

    for (const date of Object.keys(ledger).sort()) {
      const day = ledger[date];
      for (const g of GAME_IDS) {
        const cell = day[g];
        if (!cell || cell.bonus !== null) continue;
        if (now < boardCloseMs(date)) continue;

        // Too old to read back, or never going to be read (signed out):
        // settle at no bonus so it stops showing as pending.
        if (diffDaysISO(today, date) > MAX_OCCURRENCES_BACK + 1) {
          day[g] = { ...cell, bonus: 0, tier: { kind: 'none' }, dropped: isBonusLate(date, today) };
          changed = true;
          continue;
        }
        if (!isSignedIn()) continue;

        try {
          const res = await standingFor(g, date);
          if (!res) continue;
          if (res.back < 1) continue; // still open
          const local = res.standing?.local ?? null;
          const { bonus, tier } = local
            ? placementBonus(local.place, res.standing!.totalPlayerCount, res.standing!.entriesLoaded)
            : { bonus: 0, tier: { kind: 'none' } as BonusTier };
          const dropped = isBonusLate(date, today);
          day[g] = { ...cell, bonus, tier, place: local?.place, dropped };
          changed = true;
          if (!dropped) settled.push({ dateISO: date, gameId: g, bonus, tier, place: local?.place ?? null });
        } catch {
          // Network or Game Center trouble: try again next time.
        }
      }
    }

    if (changed) await saveLedger(ledger);
    if (settled.length > 0) await appendRecap(settled);
    return settled;
  });
}

/**
 * Rebuilds this week's ledger from Game Center: every daily the player has
 * an entry for counts as played, decoded to real attempt or throwaway, with
 * the bonus read from closed occurrences. Runs when the ledger is missing
 * (a fresh install) and otherwise at most once a day when Your Fury opens.
 */
export function rebuildLedger(opts: { force?: boolean; onlyIfMissing?: boolean } = {}): Promise<boolean> {
  return serialize(async () => {
    if (!isSignedIn() || !GameCenter) return false;
    const today = localDateISO();
    const { ledger, existed } = await loadLedger();
    if (opts.onlyIfMissing && existed) return false;
    if (!opts.force && existed) {
      try {
        if ((await AsyncStorage.getItem(REBUILT_KEY)) === today) return false;
      } catch {
        // fall through and rebuild
      }
    }

    const monday = weekMondayISO(today);
    const dates: string[] = [];
    // The previous Sunday too: its bonus is credited to this week.
    for (let d = -1; diffDaysISO(today, addDaysISO(monday, d)) >= 0; d++) {
      dates.push(addDaysISO(monday, d));
    }

    for (const g of GAME_IDS) {
      const board = BOARDS[g];
      for (const date of dates) {
        try {
          const res = await standingFor(g, date);
          const local = res?.standing?.local;
          if (!res || !local) continue;
          const real = board.isRealAttempt(local.value, {
            hexMasterTarget: g === 'hexhive' ? hexMasterTargetFor(date) : undefined,
          });
          const day = { ...(ledger[date] ?? {}) };
          const prev = day[g];
          let cell: LedgerCell = {
            ...(prev ?? { bonus: null }),
            finish: Math.max(prev?.finish ?? 0, finishPoints(real)),
          };
          if (res.back >= 1 && cell.bonus === null) {
            const { bonus, tier } = placementBonus(local.place, res.standing!.totalPlayerCount, res.standing!.entriesLoaded);
            cell = { ...cell, bonus, tier, place: local.place, dropped: isBonusLate(date, today) };
          }
          day[g] = cell;
          ledger[date] = day;
        } catch {
          // Skip this one; the next rebuild picks it up.
        }
      }
    }

    await saveLedger(ledger);
    try {
      await AsyncStorage.setItem(REBUILT_KEY, today);
    } catch {
      // not fatal
    }
    return true;
  });
}

/**
 * Submits this week's total to the weekly board. Within a week the total
 * only goes up and Game Center keeps the highest, so a missed submission is
 * covered by the next one.
 */
export async function submitWeeklyTotal(): Promise<void> {
  if (!isSignedIn() || !GameCenter) return;
  const today = localDateISO();
  const monday = weekMondayISO(today);
  // Same time-zone rule as the dailies: only post to the occurrence that
  // belongs to this local week.
  const occMonday = await currentOccurrenceDate(WEEKLY_BOARD_ID);
  if (occMonday !== monday) return;
  const { ledger } = await loadLedger();
  const week = weekBreakdown(ledger, monday);
  if (week.total <= 0) return;
  const context = packWeeklyContext(weekIdFor(monday), week.podiums, week.dailiesDone);
  try {
    await GameCenter.submitScore(WEEKLY_BOARD_ID, week.total, context);
  } catch {
    // The next ledger change submits again.
  }
}

/** This week's (or another week's) breakdown from the cached ledger. */
export async function loadWeek(mondayISO: string = weekMondayISO(localDateISO())): Promise<WeekBreakdown> {
  const { ledger } = await loadLedger();
  return weekBreakdown(ledger, mondayISO);
}

/**
 * Everything Fury needs brought up to date: settle bonuses, rebuild if due,
 * then post the weekly total. Errors are swallowed; it all retries later.
 */
export async function refreshFury(opts: { rebuild?: 'daily' | 'ifMissing' } = {}): Promise<void> {
  try {
    if (opts.rebuild) await rebuildLedger({ onlyIfMissing: opts.rebuild === 'ifMissing' });
    await settleBonuses();
    await submitWeeklyTotal();
  } catch {
    // retried on the next foreground
  }
}
