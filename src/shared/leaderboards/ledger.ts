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
import { addDaysISO, dayNumber, diffDaysISO, localDateISO, weekdayIndex, weekIdFor, weekMondayISO } from './dates';
import { loadLocalStanding } from './entries';
import { finishPoints, placementBonus, type BonusTier } from './furyPoints';
import { isSignedIn } from './gameCenter';
import { hexMasterTargetFor } from './hexTarget';
import { currentOccurrenceDate } from './occurrence';
import { appendRecap, type RecapItem } from './recap';

export const LEDGER_KEY = 'fury_week_ledger_v2';
export const REBUILT_KEY = 'fury_ledger_rebuilt_v1';
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
//   weekId * 2^34 + podiums * 2^28 + dayIndex * 2^8 + gamesMask
// dayIndex is the poster's local weekday (0 Monday to 6 Sunday) and gamesMask
// has one bit per game in GAME_IDS order, set when that game's daily was
// finished that day. The weekly board shows today's games from it.
const POW_8 = 2 ** 8;
const POW_28 = 2 ** 28;
const POW_34 = 2 ** 34;

export type WeeklyContext = { weekId: number; podiums: number; dayIndex: number; gamesMask: number };

export function packWeeklyContext(weekId: number, podiums: number, dayIndex: number, gamesMask: number): number {
  const p = Math.max(0, Math.min(63, Math.round(podiums)));
  const d = Math.max(0, Math.min(6, Math.round(dayIndex)));
  const m = Math.max(0, Math.min(255, Math.round(gamesMask)));
  return weekId * POW_34 + p * POW_28 + d * POW_8 + m;
}

export function unpackWeeklyContext(ctx: number): WeeklyContext {
  const weekId = Math.floor(ctx / POW_34);
  const rest = ctx - weekId * POW_34;
  const podiums = Math.floor(rest / POW_28);
  const low = rest - podiums * POW_28;
  const dayIndex = Math.floor(low / POW_8) % 8;
  const gamesMask = low % POW_8;
  return { weekId, podiums, dayIndex, gamesMask };
}

/** One bit per game in GAME_IDS order, set when that day's daily was finished. Pure, for testing. */
export function gamesMaskFor(ledger: Ledger, dateISO: string): number {
  const day = ledger[dateISO] ?? {};
  let mask = 0;
  GAME_IDS.forEach((g, i) => {
    if ((day[g]?.finish ?? 0) > 0) mask |= 1 << i;
  });
  return mask;
}

/**
 * The games an entry's context shows as finished today, for a board showing
 * the week starting `shownMondayISO`. Empty unless that week is the viewer's
 * current week, the entry was packed for it, and on the viewer's weekday.
 * Pure, for testing.
 */
export function gamesFinishedToday(ctx: number, shownMondayISO: string, todayISO: string): Set<GameId> {
  const out = new Set<GameId>();
  if (shownMondayISO !== weekMondayISO(todayISO)) return out;
  const c = unpackWeeklyContext(ctx);
  if (c.weekId !== weekIdFor(shownMondayISO) || c.dayIndex !== weekdayIndex(todayISO)) return out;
  GAME_IDS.forEach((g, i) => {
    if (c.gamesMask & (1 << i)) out.add(g);
  });
  return out;
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
  const context = packWeeklyContext(weekIdFor(monday), week.podiums, weekdayIndex(today), gamesMaskFor(ledger, today));
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
