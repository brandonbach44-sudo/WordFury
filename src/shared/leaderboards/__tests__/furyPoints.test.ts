import { finishPoints, placementBonus, tierLabel } from '../furyPoints';

const bonus = (place: number, players: number | null, loaded = 0) => placementBonus(place, players, loaded).bonus;

describe('finishing points', () => {
  it('is 50 for a real attempt and 20 for a throwaway', () => {
    expect(finishPoints(true)).toBe(50);
    expect(finishPoints(false)).toBe(20);
  });
});

describe('placement bonus', () => {
  it('pays the podium with at least 20 players', () => {
    expect(bonus(1, 312)).toBe(50);
    expect(bonus(2, 312)).toBe(45);
    expect(bonus(3, 20)).toBe(40);
  });

  it('skips the podium below 20 players but keeps percentage tiers', () => {
    // 8 players: top 25% is places 1 and 2, top 10% does not exist.
    expect(bonus(1, 8)).toBe(15);
    expect(bonus(2, 8)).toBe(15);
    expect(bonus(3, 8)).toBe(5); // top 50% is places 1 to 4
    expect(bonus(4, 8)).toBe(5);
    expect(bonus(5, 8)).toBe(0);
  });

  it('applies the percentage tiers with floor', () => {
    // 1000 players: 1% = 10, 5% = 50, 10% = 100, 25% = 250, 50% = 500.
    expect(bonus(4, 1000)).toBe(35);
    expect(bonus(10, 1000)).toBe(35);
    expect(bonus(11, 1000)).toBe(30);
    expect(bonus(50, 1000)).toBe(30);
    expect(bonus(100, 1000)).toBe(25);
    expect(bonus(250, 1000)).toBe(15);
    expect(bonus(500, 1000)).toBe(5);
    expect(bonus(501, 1000)).toBe(0);
  });

  it('gives tied players the same bonus because they share a place', () => {
    expect(bonus(2, 312)).toBe(bonus(2, 312));
  });

  it('falls back to place-based tiers without a player count', () => {
    expect(bonus(1, null, 20)).toBe(50);
    expect(bonus(1, null, 12)).toBe(25); // no podium under 20 entries
    expect(bonus(4, null, 25)).toBe(25);
    expect(bonus(10, null, 25)).toBe(25);
    expect(bonus(11, null, 25)).toBe(15);
    expect(bonus(26, null, 25)).toBe(5);
    expect(bonus(51, null, 25)).toBe(0);
  });

  it('never pays more than 50, so a game day tops out at 100', () => {
    for (const players of [1, 8, 20, 312, 100000]) {
      for (let place = 1; place <= Math.min(players, 50); place++) {
        expect(bonus(place, players) + finishPoints(true)).toBeLessThanOrEqual(100);
      }
    }
  });

  it('labels tiers for the recap', () => {
    expect(tierLabel(placementBonus(2, 312).tier)).toBe('2nd');
    expect(tierLabel(placementBonus(20, 312).tier)).toBe('top 10%');
    expect(tierLabel(placementBonus(300, 312).tier)).toBeNull();
  });
});
