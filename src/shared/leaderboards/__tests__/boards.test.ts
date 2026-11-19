import { BOARDS, formatClock, GAME_IDS, MAX_SECONDS } from '../boards';

describe('board ids', () => {
  it('has eight distinct daily boards with the planned ids', () => {
    const ids = GAME_IDS.map((g) => BOARDS[g].boardId);
    expect(new Set(ids).size).toBe(8);
    expect(ids).toEqual([
      'wf.daily.furdle',
      'wf.daily.wordsmith',
      'wf.daily.hangman',
      'wf.daily.wordgrid',
      'wf.daily.wordsearch',
      'wf.daily.wordladder',
      'wf.daily.hexhive',
      'wf.daily.anagrams',
    ]);
  });
});

describe('Furdle', () => {
  const b = BOARDS.furdle;
  it('encodes per the plan', () => {
    expect(b.encode({ won: true, guesses: 1, seconds: 0 })).toBe(6 * 100000 + 99999);
    expect(b.encode({ won: true, guesses: 3, seconds: 72 })).toBe(4 * 100000 + (99999 - 72));
    expect(b.encode({ won: false, guesses: 6, seconds: 300 })).toBe(99999 - 300);
  });
  it('orders wins by fewer guesses, then faster, and every win above every loss', () => {
    const fast2 = b.encode({ won: true, guesses: 2, seconds: 30 });
    const slow2 = b.encode({ won: true, guesses: 2, seconds: 400 });
    const fast3 = b.encode({ won: true, guesses: 3, seconds: 5 });
    const worstWin = b.encode({ won: true, guesses: 6, seconds: MAX_SECONDS });
    const bestLoss = b.encode({ won: false, guesses: 6, seconds: 0 });
    expect(fast2).toBeGreaterThan(slow2);
    expect(slow2).toBeGreaterThan(fast3);
    expect(worstWin).toBeGreaterThan(bestLoss);
  });
  it('round-trips and formats', () => {
    const v = b.encode({ won: true, guesses: 3, seconds: 72 });
    expect(b.decode(v)).toEqual({ won: true, guesses: 3, seconds: 72 });
    expect(b.formatForDisplay(v)).toBe('3 guesses · 1:12');
    expect(b.formatForDisplay(b.encode({ won: true, guesses: 1, seconds: 9 }))).toBe('1 guess · 0:09');
  });
  it('treats a missing time as slowest and clamps fields', () => {
    expect(b.decode(b.encode({ won: true, guesses: 2, seconds: null })).seconds).toBe(MAX_SECONDS);
    expect(b.decode(b.encode({ won: true, guesses: 0, seconds: -5 }))).toEqual({ won: true, guesses: 1, seconds: 0 });
    expect(b.decode(b.encode({ won: true, guesses: 9, seconds: 1e9 }))).toEqual({ won: true, guesses: 6, seconds: MAX_SECONDS });
  });
  it('counts any finish as a real attempt, and a loss gets no rank mark', () => {
    const loss = b.encode({ won: false, guesses: 6, seconds: 100 });
    expect(b.isRealAttempt(loss)).toBe(true);
    expect(b.isLoss(loss)).toBe(true);
  });
});

describe('Hangman', () => {
  const b = BOARDS.hangman;
  it('encodes per the plan', () => {
    expect(b.encode({ won: true, misses: 0, seconds: 10 })).toBe(7 * 100000 + 99989);
    expect(b.encode({ won: true, misses: 5, seconds: 10 })).toBe(2 * 100000 + 99989);
    expect(b.encode({ won: false, misses: 6, seconds: 10 })).toBe(99989);
  });
  it('round-trips and formats', () => {
    const v = b.encode({ won: true, misses: 1, seconds: 65 });
    expect(b.decode(v)).toEqual({ won: true, misses: 1, seconds: 65 });
    expect(b.formatForDisplay(v)).toBe('1 miss · 1:05');
  });
});

describe('Word Ladder', () => {
  const b = BOARDS.wordladder;
  it('orders finished above gave up, then steps over par, then hints, then time', () => {
    const par = b.encode({ gaveUp: false, stepsOverPar: 0, hints: 0, seconds: 500 });
    const plus1 = b.encode({ gaveUp: false, stepsOverPar: 1, hints: 0, seconds: 1 });
    const parHint = b.encode({ gaveUp: false, stepsOverPar: 0, hints: 1, seconds: 1 });
    const gaveUp = b.encode({ gaveUp: true, stepsOverPar: 0, hints: 0, seconds: 0 });
    const farOver = b.encode({ gaveUp: false, stepsOverPar: 999, hints: 3, seconds: MAX_SECONDS });
    expect(par).toBeGreaterThan(parHint);
    expect(parHint).toBeGreaterThan(plus1);
    expect(farOver).toBeGreaterThan(gaveUp);
  });
  it('encodes per the plan and round-trips', () => {
    expect(b.encode({ gaveUp: false, stepsOverPar: 2, hints: 1, seconds: 123 })).toBe(48 * 1000000 + 2 * 100000 + 99999 - 123);
    const v = b.encode({ gaveUp: false, stepsOverPar: 0, hints: 0, seconds: 123 });
    expect(b.decode(v)).toEqual({ gaveUp: false, stepsOverPar: 0, hints: 0, seconds: 123 });
    expect(b.formatForDisplay(v)).toBe('Par · 2:03');
  });
  it('treats giving up as a throwaway with no rank mark', () => {
    const v = b.encode({ gaveUp: true, stepsOverPar: 0, hints: 0, seconds: 50 });
    expect(b.isRealAttempt(v)).toBe(false);
    expect(b.isLoss(v)).toBe(true);
    expect(b.formatForDisplay(v)).toBe('Gave up');
  });
});

describe('Word Search', () => {
  const b = BOARDS.wordsearch;
  it('ranks found count ahead of score', () => {
    expect(b.encode({ foundCount: 10, score: 100 })).toBeGreaterThan(b.encode({ foundCount: 9, score: 999999 }));
  });
  it('round-trips, formats and applies the 5-word threshold', () => {
    const v = b.encode({ foundCount: 10, score: 1840 });
    expect(b.decode(v)).toEqual({ foundCount: 10, score: 1840 });
    expect(b.formatForDisplay(v)).toBe('10/10 · 1,840');
    expect(b.isRealAttempt(b.encode({ foundCount: 5, score: 0 }))).toBe(true);
    expect(b.isRealAttempt(b.encode({ foundCount: 4, score: 9999 }))).toBe(false);
  });
});

describe('Hex Hive', () => {
  const b = BOARDS.hexhive;
  const master = (words: number, score: number) =>
    b.encode({ reachedMaster: true, wordsAtMaster: words, score, masterTarget: 60 });
  const notYet = (score: number) => b.encode({ reachedMaster: false, wordsAtMaster: 0, score, masterTarget: 60 });

  it('ranks Master above not, then fewer words, then score', () => {
    expect(master(20, 60)).toBeGreaterThan(notYet(999999));
    expect(master(12, 61)).toBeGreaterThan(master(13, 90));
    expect(master(12, 70)).toBeGreaterThan(master(12, 61));
  });
  it('encodes per the plan and round-trips', () => {
    expect(master(14, 63)).toBe(1000000000000 + (999 - 14) * 1000000 + 63);
    expect(b.decode(master(14, 63))).toEqual({ reachedMaster: true, wordsAtMaster: 14, score: 63 });
    expect(b.decode(notYet(40))).toEqual({ reachedMaster: false, wordsAtMaster: null, score: 40 });
    expect(b.formatForDisplay(master(14, 63))).toBe('Master · 14 words');
    expect(b.formatForDisplay(notYet(40))).toBe('40 pts');
  });
  it('uses the Sharp rank (25% of Master, same rounding as the ladder) as the real-attempt line', () => {
    expect(b.isRealAttempt(notYet(15), { hexMasterTarget: 60 })).toBe(true);
    expect(b.isRealAttempt(notYet(14), { hexMasterTarget: 60 })).toBe(false);
    // 25% of 58 is 14.5, which the ladder rounds to 15.
    expect(b.isRealAttempt(notYet(14), { hexMasterTarget: 58 })).toBe(false);
    expect(b.isRealAttempt(notYet(15), { hexMasterTarget: 58 })).toBe(true);
    expect(b.isRealAttempt(master(30, 60))).toBe(true);
    expect(b.isRealAttempt(notYet(50))).toBe(false); // target unknown
  });
});

describe('score boards', () => {
  it('submit the raw score and apply the thresholds', () => {
    expect(BOARDS.wordgrid.encode({ score: 2350 })).toBe(2350);
    expect(BOARDS.wordgrid.formatForDisplay(2350)).toBe('2,350');
    expect(BOARDS.wordgrid.isRealAttempt(250)).toBe(true);
    expect(BOARDS.wordgrid.isRealAttempt(249)).toBe(false);
    expect(BOARDS.wordsmith.isRealAttempt(1000)).toBe(true);
    expect(BOARDS.wordsmith.isRealAttempt(999)).toBe(false);
    expect(BOARDS.anagrams.isRealAttempt(500)).toBe(true);
    expect(BOARDS.anagrams.isRealAttempt(499)).toBe(false);
    expect(BOARDS.anagrams.encode({ score: -40 })).toBe(0);
  });
});

describe('formatClock', () => {
  it('formats minutes and hours', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(72)).toBe('1:12');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});
