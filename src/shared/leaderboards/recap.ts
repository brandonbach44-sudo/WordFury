// src/shared/leaderboards/recap.ts
//
// Morning recap: the first time the app opens after new placement bonuses
// settle, one short dismissible line, at most once a day. Signed-out players
// never settle bonuses, so they never see one.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { BOARDS, type GameId } from './boards';
import { addDaysISO, localDateISO } from './dates';
import { tierLabel, type BonusTier } from './furyPoints';

const PENDING_KEY = 'fury_recap_pending_v1';
const LAST_SHOWN_KEY = 'fury_recap_last_shown_v1';

export type RecapItem = {
  dateISO: string;
  gameId: GameId;
  bonus: number;
  tier: BonusTier;
  place: number | null;
};

async function readItems(): Promise<RecapItem[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendRecap(items: RecapItem[]): Promise<void> {
  try {
    const existing = await readItems();
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify([...existing, ...items].slice(-64)));
  } catch {
    // A missed recap is harmless.
  }
}

/**
 * The recap line, for example "Yesterday: Furdle 2nd · Hangman top 10% ·
 * +120 Fury". Pure, for testing.
 */
export function buildRecapText(items: RecapItem[], todayISO: string): string | null {
  const counted = items.filter((i) => i.bonus > 0);
  if (counted.length === 0) return null;
  const total = counted.reduce((sum, i) => sum + i.bonus, 0);
  const allYesterday = counted.every((i) => i.dateISO === addDaysISO(todayISO, -1));
  // Best placements first, at most three named.
  const named = [...counted]
    .sort((a, b) => b.bonus - a.bonus)
    .slice(0, 3)
    .map((i) => {
      const label = tierLabel(i.tier);
      return label ? `${BOARDS[i.gameId].title} ${label}` : null;
    })
    .filter((s): s is string => !!s);
  const lead = allYesterday ? 'Yesterday' : 'Latest';
  return [`${lead}: ${named.join(' · ')}`, `+${total.toLocaleString('en-US')} Fury`]
    .filter((s) => s.length > 0)
    .join(' · ');
}

/**
 * Today's recap line if there is one to show and none has been shown today.
 * Taking it marks it shown and clears the queue.
 */
export async function takeRecap(): Promise<string | null> {
  try {
    const today = localDateISO();
    if ((await AsyncStorage.getItem(LAST_SHOWN_KEY)) === today) return null;
    const items = await readItems();
    if (items.length === 0) return null;
    await AsyncStorage.removeItem(PENDING_KEY);
    const text = buildRecapText(items, today);
    if (!text) return null;
    await AsyncStorage.setItem(LAST_SHOWN_KEY, today);
    return text;
  } catch {
    return null;
  }
}
