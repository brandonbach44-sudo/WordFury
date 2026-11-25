// src/shared/leaderboards/migration112.ts
//
// One-time cleanup for 1.1.2. On 1.1.1, Game Center's placeholder local entry
// (rank 0, score 0) was read as a real one, which:
//   - wrote a `mine: false` "already played" record for every board, blocking
//     every submission, and
//   - credited finishing points and a placement bonus for games never played.
// Every `mine: false` record came from the placeholder, so all are removed.
// Phantom ledger cells can't be told apart from real ones, so every date
// before the weekly board's first week (Monday Nov 30, 2026) is removed; no
// earlier week is ever posted, so nothing scored is lost.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEDGER_KEY, REBUILT_KEY, type Ledger } from './ledger';
import { SUBMITTED_KEY, type SubmittedMap } from './submit';

export const FIX_112_KEY = 'leaderboard_fix_112_v1';
const FIRST_WEEK_MONDAY = '2026-11-30';

/** Drops every record written by the placeholder entry. Pure, for testing. */
export function cleanSubmitted(map: SubmittedMap): SubmittedMap {
  const out: SubmittedMap = {};
  for (const [boardId, record] of Object.entries(map)) {
    if (record && record.mine !== false) out[boardId] = record;
  }
  return out;
}

/** Drops every date before Nov 30, 2026. Pure, for testing. */
export function cleanLedger(ledger: Ledger): Ledger {
  const out: Ledger = {};
  for (const [date, day] of Object.entries(ledger)) {
    if (date >= FIRST_WEEK_MONDAY) out[date] = day;
  }
  return out;
}

async function rewrite<T extends object>(key: string, clean: (v: T) => T): Promise<void> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') return;
  await AsyncStorage.setItem(key, JSON.stringify(clean(parsed as T)));
}

/**
 * Runs the cleanup once per install. Called at launch, before Game Center
 * sign-in starts the first sync. Never throws.
 */
export async function runFix112Migration(): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(FIX_112_KEY)) === '1') return;
    await rewrite<SubmittedMap>(SUBMITTED_KEY, cleanSubmitted);
    await rewrite<Ledger>(LEDGER_KEY, cleanLedger);
    await AsyncStorage.removeItem(REBUILT_KEY);
    await AsyncStorage.setItem(FIX_112_KEY, '1');
  } catch (e) {
    // Not marked done: tries again on the next launch.
    console.warn('leaderboards: 1.1.2 cleanup failed', e);
  }
}
