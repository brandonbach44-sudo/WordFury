import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameCenterEntry } from '../../../../modules/game-center';
import { dateContext } from '../dates';
import { realLocal } from '../entries';
import { LEDGER_KEY, REBUILT_KEY } from '../ledger';
import { cleanSubmitted, FIX_112_KEY, runFix112Migration } from '../migration112';
import { RECAP_PENDING_KEY } from '../recap';
import { firstResultBlocks, SUBMITTED_KEY } from '../submit';

const entry = (over: Partial<GameCenterEntry> = {}): GameCenterEntry => ({
  rank: 1,
  value: 1350,
  context: dateContext('2026-11-25'),
  displayName: 'Me',
  playerId: 'p1',
  isLocal: true,
  ...over,
});

// What GameKit returns when the player has no score in the occurrence.
const placeholder = entry({ rank: 0, value: 0, context: 0 });

describe('realLocal', () => {
  it('ignores the rank 0 placeholder', () => {
    expect(realLocal({ local: placeholder })).toBeNull();
  });

  it('returns a rank 1 entry', () => {
    const e = entry();
    expect(realLocal({ local: e })).toBe(e);
  });

  it('returns null with no entry', () => {
    expect(realLocal({})).toBeNull();
    expect(realLocal({ local: undefined })).toBeNull();
  });
});

describe('first-result guard', () => {
  it('submits over the placeholder entry', () => {
    expect(firstResultBlocks({ local: placeholder }, '2026-11-25')).toBe(false);
  });

  it('blocks on a real entry for the same date', () => {
    expect(firstResultBlocks({ local: entry({ rank: 4 }) }, '2026-11-25')).toBe(true);
  });

  it('submits when the real entry is for a different date', () => {
    expect(firstResultBlocks({ local: entry({ context: dateContext('2026-11-24') }) }, '2026-11-25')).toBe(false);
  });

  it('submits with no entry', () => {
    expect(firstResultBlocks({}, '2026-11-25')).toBe(false);
  });
});

describe('1.1.2 migration', () => {
  const submitted = {
    'wf.daily.furdle': { date: '2026-11-25', mine: false },
    'wf.daily.hexhive': { date: '2026-11-25', mine: true },
    'wf.daily.hangman': { date: '2026-11-24', mine: false },
  };
  const kept = { 'wf.daily.hexhive': { date: '2026-11-25', mine: true } };
  const cell = { finish: 50, bonus: 25 };
  const ledger = { '2026-11-22': { furdle: cell }, '2026-11-30': { furdle: cell } };
  const recap = [{ dateISO: '2026-11-24', gameId: 'furdle', bonus: 25, tier: { kind: 'top10' }, place: 1 }];

  it('removes only mine: false records', () => {
    expect(cleanSubmitted(submitted)).toEqual(kept);
  });

  describe('in storage', () => {
    beforeEach(async () => {
      await AsyncStorage.clear();
    });

    it('cleans the records, clears the ledger, rebuild mark and recap queue, and runs once', async () => {
      await AsyncStorage.setItem(SUBMITTED_KEY, JSON.stringify(submitted));
      await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
      await AsyncStorage.setItem(REBUILT_KEY, '2026-11-25');
      await AsyncStorage.setItem(RECAP_PENDING_KEY, JSON.stringify(recap));

      await runFix112Migration();

      expect(JSON.parse((await AsyncStorage.getItem(SUBMITTED_KEY))!)).toEqual(kept);
      expect(await AsyncStorage.getItem(LEDGER_KEY)).toBeNull();
      expect(await AsyncStorage.getItem(REBUILT_KEY)).toBeNull();
      expect(await AsyncStorage.getItem(RECAP_PENDING_KEY)).toBeNull();
      expect(await AsyncStorage.getItem(FIX_112_KEY)).toBe('1');

      // A second launch leaves everything written since alone.
      const later = { 'wf.daily.furdle': { date: '2026-12-01', mine: false } };
      await AsyncStorage.setItem(SUBMITTED_KEY, JSON.stringify(later));
      await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
      await AsyncStorage.setItem(REBUILT_KEY, '2026-12-01');
      await AsyncStorage.setItem(RECAP_PENDING_KEY, JSON.stringify(recap));
      await runFix112Migration();
      expect(JSON.parse((await AsyncStorage.getItem(SUBMITTED_KEY))!)).toEqual(later);
      expect(JSON.parse((await AsyncStorage.getItem(LEDGER_KEY))!)).toEqual(ledger);
      expect(await AsyncStorage.getItem(REBUILT_KEY)).toBe('2026-12-01');
      expect(JSON.parse((await AsyncStorage.getItem(RECAP_PENDING_KEY))!)).toEqual(recap);
    });

    it('copes with empty storage', async () => {
      await runFix112Migration();
      expect(await AsyncStorage.getItem(SUBMITTED_KEY)).toBeNull();
      expect(await AsyncStorage.getItem(LEDGER_KEY)).toBeNull();
      expect(await AsyncStorage.getItem(FIX_112_KEY)).toBe('1');
    });
  });
});
