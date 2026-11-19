// src/shared/leaderboards/dates.ts
//
// Calendar-date math for the leaderboards. Puzzle dates are the player's
// local "YYYY-MM-DD" (every daily is seeded from the local date). Board
// occurrences are moments in UTC. Everything here works on whole calendar
// dates, so it never depends on the device's time zone except where it
// deliberately asks for the local date.

const DAY_MS = 86400000;

/** Local "YYYY-MM-DD" for a Date (default now). */
export function localDateISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** UTC calendar date "YYYY-MM-DD" of an epoch-ms moment. */
export function utcDateISO(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map((p) => parseInt(p, 10));
  return [y, m, d];
}

/** Whole days since 1970-01-01 for a calendar date. */
export function dayNumber(iso: string): number {
  const [y, m, d] = parts(iso);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function isoFromDayNumber(n: number): string {
  return utcDateISO(n * DAY_MS);
}

export function addDaysISO(iso: string, days: number): string {
  return isoFromDayNumber(dayNumber(iso) + days);
}

/** a - b in whole days. */
export function diffDaysISO(a: string, b: string): number {
  return dayNumber(a) - dayNumber(b);
}

/** A local Date at midnight on the given calendar date. */
export function localDateFromISO(iso: string): Date {
  const [y, m, d] = parts(iso);
  return new Date(y, m - 1, d);
}

/** Game Center `context` for a daily: the puzzle date as YYYYMMDD. */
export function dateContext(iso: string): number {
  const [y, m, d] = parts(iso);
  return y * 10000 + m * 100 + d;
}

export function isoFromDateContext(ctx: number): string | null {
  if (!Number.isFinite(ctx) || ctx < 19700101 || ctx > 99991231) return null;
  const y = Math.floor(ctx / 10000);
  const m = Math.floor((ctx % 10000) / 100);
  const d = ctx % 100;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 0 = Monday ... 6 = Sunday. 1970-01-01 was a Thursday. */
export function weekdayIndex(iso: string): number {
  return (((dayNumber(iso) + 3) % 7) + 7) % 7;
}

/** The Monday of the Monday-to-Sunday week containing `iso`. */
export function weekMondayISO(iso: string): string {
  return addDaysISO(iso, -weekdayIndex(iso));
}

/**
 * ISO year * 100 + ISO week number of the week containing `iso`,
 * for example 202647. The ISO week belongs to the year of its Thursday.
 */
export function weekIdFor(iso: string): number {
  const thursday = addDaysISO(weekMondayISO(iso), 3);
  const [ty] = parts(thursday);
  const jan1 = `${ty}-01-01`;
  const dayOfYear = diffDaysISO(thursday, jan1) + 1;
  const week = Math.floor((dayOfYear - 1) / 7) + 1;
  return ty * 100 + week;
}

/**
 * The puzzle date a daily board occurrence belongs to. Daily boards open at
 * 08:00 UTC, and the occurrence opening at 08:00 UTC on date D is the board
 * for puzzle date D.
 */
export function puzzleDateForOccurrence(startMs: number): string {
  return utcDateISO(startMs);
}
