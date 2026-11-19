import {
  addDaysISO,
  dateContext,
  isoFromDateContext,
  puzzleDateForOccurrence,
  weekdayIndex,
  weekIdFor,
  weekMondayISO,
} from '../dates';
import { assignPlaces } from '../entries';
import { timeZoneVerdict } from '../submit';

describe('dates', () => {
  it('finds weekdays and Mondays', () => {
    expect(weekdayIndex('2026-11-16')).toBe(0); // Monday
    expect(weekdayIndex('2026-11-22')).toBe(6); // Sunday
    expect(weekMondayISO('2026-11-22')).toBe('2026-11-16');
    expect(weekMondayISO('2026-11-16')).toBe('2026-11-16');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('computes ISO week ids', () => {
    expect(weekIdFor('2026-11-18')).toBe(202647);
    expect(weekIdFor('2026-01-01')).toBe(202601); // Thursday, week 1
    expect(weekIdFor('2027-01-01')).toBe(202653); // Friday, still 2026's last week
    expect(weekIdFor('2021-01-03')).toBe(202053);
  });

  it('round-trips the daily context', () => {
    expect(dateContext('2026-11-18')).toBe(20261118);
    expect(isoFromDateContext(20261118)).toBe('2026-11-18');
    expect(isoFromDateContext(12)).toBeNull();
  });

  it('maps an 08:00 UTC occurrence to its puzzle date', () => {
    expect(puzzleDateForOccurrence(Date.UTC(2026, 10, 18, 8, 0, 0))).toBe('2026-11-18');
  });
});

describe('time-zone guard', () => {
  it('submits a score for the open board’s date', () => {
    expect(timeZoneVerdict('2026-11-18', '2026-11-18')).toBe('submit');
  });
  it('queues a score played before its board opened', () => {
    expect(timeZoneVerdict('2026-11-19', '2026-11-18')).toBe('wait');
  });
  it('drops a score whose board closed', () => {
    expect(timeZoneVerdict('2026-11-17', '2026-11-18')).toBe('drop');
  });
  it('drops a score more than a day ahead', () => {
    expect(timeZoneVerdict('2026-11-20', '2026-11-18')).toBe('drop');
  });
});

describe('shared places', () => {
  const e = (rank: number, value: number) => ({
    rank,
    value,
    context: 0,
    displayName: `p${rank}`,
    playerId: `id${rank}`,
    isLocal: false,
  });

  it('gives equal values the same place: 1 plus the number strictly higher', () => {
    const rows = assignPlaces([e(1, 900), e(2, 800), e(3, 800), e(4, 800), e(5, 700)]);
    expect(rows.map((r) => r.place)).toEqual([1, 2, 2, 2, 5]);
  });

  it('carries a tie in from above the loaded range', () => {
    const rows = assignPlaces([e(26, 500), e(27, 400)], 500, 20);
    expect(rows.map((r) => r.place)).toEqual([20, 27]);
  });
});
