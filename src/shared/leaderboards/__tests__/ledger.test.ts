import { GAME_IDS } from '../boards';
import { weekdayIndex, weekIdFor } from '../dates';
import { placementBonus } from '../furyPoints';
import {
  boardCloseMs,
  bonusCreditMonday,
  gamesFinishedToday,
  gamesMaskFor,
  isBonusLate,
  packWeeklyContext,
  prune,
  unpackWeeklyContext,
  weekBreakdown,
  withFinish,
  type Ledger,
} from '../ledger';
import { buildRecapText } from '../recap';

// 2026-11-16 is a Monday.
const MON = '2026-11-16';

function settle(ledger: Ledger, date: string, game: (typeof GAME_IDS)[number], place: number, players: number): Ledger {
  const { bonus, tier } = placementBonus(place, players);
  return {
    ...ledger,
    [date]: { ...ledger[date], [game]: { ...ledger[date]![game]!, bonus, tier, place } },
  };
}

describe('finishing points in the ledger', () => {
  it('records 50 or 20 and lets a real attempt upgrade a throwaway, never the reverse', () => {
    let l: Ledger = {};
    l = withFinish(l, 'hexhive', MON, false);
    expect(l[MON]!.hexhive).toEqual({ finish: 20, bonus: null });
    l = withFinish(l, 'hexhive', MON, true);
    expect(l[MON]!.hexhive!.finish).toBe(50);
    l = withFinish(l, 'hexhive', MON, false);
    expect(l[MON]!.hexhive!.finish).toBe(50);
  });

  it('prunes entries older than 35 days', () => {
    const l: Ledger = { '2026-10-01': {}, '2026-10-20': {}, [MON]: {} };
    expect(Object.keys(prune(l, MON)).sort()).toEqual(['2026-10-20', MON]);
  });
});

describe('crediting', () => {
  it('credits a date’s bonus to the week containing the next day', () => {
    expect(bonusCreditMonday('2026-11-22')).toBe('2026-11-23'); // Sunday's bonus lands next week
    expect(bonusCreditMonday('2026-11-21')).toBe(MON); // Saturday's stays
    expect(bonusCreditMonday('2026-11-15')).toBe(MON); // previous Sunday comes in
  });

  it('drops a bonus collected after its week ended', () => {
    expect(isBonusLate('2026-11-20', '2026-11-21')).toBe(false);
    expect(isBonusLate('2026-11-21', '2026-11-22')).toBe(false);
    expect(isBonusLate('2026-11-21', '2026-11-23')).toBe(true);
    expect(isBonusLate('2026-11-22', '2026-11-23')).toBe(false);
  });

  it('closes a daily board at 08:00 UTC the next day', () => {
    expect(new Date(boardCloseMs('2026-11-16')).toISOString()).toBe('2026-11-17T08:00:00.000Z');
  });

  it('adds finishing points for Monday to Sunday and bonuses for the previous Sunday to Saturday', () => {
    let l: Ledger = {};
    // Previous Sunday: finish belongs to last week, bonus to this week.
    l = withFinish(l, 'furdle', '2026-11-15', true);
    l = settle(l, '2026-11-15', 'furdle', 1, 312); // +50
    // This Monday: real attempt, top 10%.
    l = withFinish(l, 'hangman', MON, true);
    l = settle(l, MON, 'hangman', 20, 312); // +25
    // This Sunday: finish counts now, bonus belongs to next week.
    l = withFinish(l, 'anagrams', '2026-11-22', false);
    l = settle(l, '2026-11-22', 'anagrams', 1, 312);

    const week = weekBreakdown(l, MON);
    expect(week.finishTotal).toBe(50 + 20);
    expect(week.bonusTotal).toBe(50 + 25);
    expect(week.total).toBe(145);
    expect(week.podiums).toBe(1);
    expect(week.dailiesDone).toEqual([1, 0, 0, 0, 0, 0, 1]);
  });

  it('ignores dropped and unsettled bonuses', () => {
    let l: Ledger = withFinish({}, 'furdle', MON, true);
    l = { ...l, [MON]: { furdle: { finish: 50, bonus: 45, dropped: true } } };
    expect(weekBreakdown(l, MON).total).toBe(50);
    l = { ...l, [MON]: { furdle: { finish: 50, bonus: null } } };
    expect(weekBreakdown(l, MON).total).toBe(50);
  });

  it('reproduces the plan’s worked examples', () => {
    const full = (place: number, players: number, real = true): number => {
      let l: Ledger = {};
      for (let d = -1; d < 7; d++) {
        const date = new Date(Date.UTC(2026, 10, 16 + d)).toISOString().slice(0, 10);
        for (const g of GAME_IDS) {
          l = withFinish(l, g, date, real);
          l = settle(l, date, g, place, players);
        }
      }
      return weekBreakdown(l, MON).total;
    };
    expect(full(150, 312)).toBe(3080); // top 50% everywhere: (50 + 5) x 56
    expect(full(30, 312)).toBe(4200); // top 10% everywhere: (50 + 25) x 56
    expect(full(1, 312)).toBe(5600); // the maximum
    expect(full(300, 312, false)).toBe(1120); // all throwaways
  });
});

describe('weekly context', () => {
  it('packs and unpacks exactly', () => {
    const ctx = packWeeklyContext(202647, 56, 3, 0b10110101);
    expect(Number.isSafeInteger(ctx)).toBe(true);
    expect(unpackWeeklyContext(ctx)).toEqual({ weekId: 202647, podiums: 56, dayIndex: 3, gamesMask: 0b10110101 });
  });

  it('matches the plan formula', () => {
    expect(packWeeklyContext(202647, 2, 4, 5)).toBe(202647 * 2 ** 34 + 2 * 2 ** 28 + 4 * 2 ** 8 + 5);
  });

  it('stays exact at the largest values', () => {
    const ctx = packWeeklyContext(209953, 63, 6, 255);
    expect(Number.isSafeInteger(ctx)).toBe(true);
    expect(unpackWeeklyContext(ctx)).toEqual({ weekId: 209953, podiums: 63, dayIndex: 6, gamesMask: 255 });
  });

  it('round-trips every games bit on its own', () => {
    for (let bit = 0; bit < 8; bit++) {
      expect(unpackWeeklyContext(packWeeklyContext(202649, 1, 2, 1 << bit)).gamesMask).toBe(1 << bit);
    }
  });

  it('round-trips every day index', () => {
    for (let d = 0; d <= 6; d++) {
      const c = unpackWeeklyContext(packWeeklyContext(202649, 0, d, 0b11));
      expect(c.dayIndex).toBe(d);
      expect(c.gamesMask).toBe(0b11);
    }
  });

  it('sets one bit per finished game, in GAME_IDS order', () => {
    const today = '2026-12-02';
    const ledger: Ledger = {
      [today]: {
        furdle: { finish: 50, bonus: null },
        hexhive: { finish: 20, bonus: null },
        anagrams: { finish: 0, bonus: null },
      },
      '2026-12-01': { wordsmith: { finish: 50, bonus: null } },
    };
    const mask = gamesMaskFor(ledger, today);
    expect(mask).toBe((1 << GAME_IDS.indexOf('furdle')) | (1 << GAME_IDS.indexOf('hexhive')));
    GAME_IDS.forEach((g, i) => {
      expect(gamesMaskFor({ [today]: { [g]: { finish: 50, bonus: null } } }, today)).toBe(1 << i);
    });
    expect(gamesMaskFor({}, today)).toBe(0);
  });
});

describe('game squares on the weekly board', () => {
  // Wednesday Dec 2, 2026; its week starts Monday Nov 30.
  const today = '2026-12-02';
  const monday = '2026-11-30';
  const week = weekIdFor(monday);
  const mask = (1 << GAME_IDS.indexOf('furdle')) | (1 << GAME_IDS.indexOf('wordsmith'));

  it('fills the games finished today', () => {
    const ctx = packWeeklyContext(week, 0, weekdayIndex(today), mask);
    expect([...gamesFinishedToday(ctx, monday, today)].sort()).toEqual(['furdle', 'wordsmith']);
  });

  it('shows outlines when the entry was packed on another day', () => {
    const ctx = packWeeklyContext(week, 0, weekdayIndex(today) - 1, mask);
    expect(gamesFinishedToday(ctx, monday, today).size).toBe(0);
  });

  it('shows outlines when the entry was packed for another week', () => {
    const ctx = packWeeklyContext(weekIdFor('2026-11-23'), 0, weekdayIndex(today), mask);
    expect(gamesFinishedToday(ctx, monday, today).size).toBe(0);
  });

  it('shows outlines on the Last week view', () => {
    const lastMonday = '2026-11-23';
    const ctx = packWeeklyContext(weekIdFor(lastMonday), 0, weekdayIndex(today), mask);
    expect(gamesFinishedToday(ctx, lastMonday, today).size).toBe(0);
  });
});

describe('morning recap text', () => {
  it('names the best placements and the total', () => {
    const today = '2026-11-18';
    const text = buildRecapText(
      [
        { dateISO: '2026-11-17', gameId: 'furdle', bonus: 45, tier: placementBonus(2, 300).tier, place: 2 },
        { dateISO: '2026-11-17', gameId: 'hangman', bonus: 25, tier: placementBonus(25, 300).tier, place: 25 },
        { dateISO: '2026-11-17', gameId: 'wordgrid', bonus: 0, tier: { kind: 'none' }, place: 250 },
      ],
      today,
    );
    expect(text).toBe('Yesterday: Furdle 2nd · Hangman top 10% · +70 Fury');
    expect(buildRecapText([], today)).toBeNull();
  });
});
