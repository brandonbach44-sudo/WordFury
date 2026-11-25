// src/shared/leaderboards/migration112.ts
//
// One-time cleanup for 1.1.2. On 1.1.1, Game Center's placeholder local entry
// (rank 0, score 0) was read as a real one, which:
//   - wrote a `mine: false` "already played" record for every board, blocking
//     every submission, and
//   - credited finishing points and a placement bonus for games never played,
//     and queued morning recap items for those phantom bonuses.
// Every `mine: false` record came from the placeholder, so all are removed.
// Phantom ledger cells can't be told apart from real ones and 1.1.2 may
// arrive after the first weekly board opens, so the whole ledger is removed;
// the fixed rebuild reconstructs the week from real Game Center entries. The
// recap queue goes too, so no phantom "top 10" recap shows.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEDGER_KEY, REBUILT_KEY } from './ledger';
import { RECAP_PENDING_KEY } from './recap';
import { SUBMITTED_KEY, type SubmittedMap } from './submit';

export const FIX_112_KEY = 'leaderboard_fix_112_v1';

/** Drops every record written by the placeholder entry. Pure, for testing. */
export function cleanSubmitted(map: SubmittedMap): SubmittedMap {
  const out: SubmittedMap = {};
  for (const [boardId, record] of Object.entries(map)) {
    if (record && record.mine !== false) out[boardId] = record;
  }
  return out;
}

async function cleanSubmittedStore(): Promise<void> {
  const raw = await AsyncStorage.getItem(SUBMITTED_KEY);
  if (!raw) return;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    await AsyncStorage.removeItem(SUBMITTED_KEY);
    return;
  }
  await AsyncStorage.setItem(SUBMITTED_KEY, JSON.stringify(cleanSubmitted(parsed as SubmittedMap)));
}

/**
 * Runs the cleanup once per install. Called at launch, before Game Center
 * sign-in starts the first sync. Never throws.
 */
export async function runFix112Migration(): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(FIX_112_KEY)) === '1') return;
    await cleanSubmittedStore();
    await AsyncStorage.multiRemove([LEDGER_KEY, REBUILT_KEY, RECAP_PENDING_KEY]);
    await AsyncStorage.setItem(FIX_112_KEY, '1');
  } catch (e) {
    // Not marked done: tries again on the next launch.
    console.warn('leaderboards: 1.1.2 cleanup failed', e);
  }
}
