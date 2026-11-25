// src/shared/leaderboards/boards.ts
//
// The nine Game Center boards, and per game how a daily result becomes the
// single 64-bit integer Game Center ranks (higher is better), how to read it
// back, how to show it, and whether it was a real attempt.
//
// When a game ranks by several criteria they are packed into one integer so
// a single sort gives the right order. Every field is clamped to its legal
// range first. Seconds are capped at 99,999.

import { REAL_ATTEMPT } from './furyPoints';

export type GameId =
  | 'furdle'
  | 'wordsmith'
  | 'hangman'
  | 'wordgrid'
  | 'wordsearch'
  | 'wordladder'
  | 'hexhive'
  | 'anagrams';

export const GAME_IDS: readonly GameId[] = [
  'furdle',
  'wordsmith',
  'hangman',
  'wordgrid',
  'wordsearch',
  'wordladder',
  'hexhive',
  'anagrams',
];

// 1.1.2 moved to a new weekly board: 1.1.1 posts inflated totals (phantom
// finishes and bonuses) to the original 'wf.weekly.fury', and Game Center
// keeps each player's best for the week, so those can't be undone there.
export const WEEKLY_BOARD_ID = 'wf.weekly.fury2';

export const MAX_SECONDS = 99999;

export function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(x)));
}

/** What each game hands to submitDaily. */
export interface DailyResults {
  furdle: { won: boolean; guesses: number; seconds: number | null };
  hangman: { won: boolean; misses: number; seconds: number };
  wordladder: { gaveUp: boolean; stepsOverPar: number; hints: number; seconds: number };
  wordsearch: { foundCount: number; score: number };
  // masterTarget is that day's Master score (getEffectiveMaxScore). It is
  // not encoded; it only decides real attempt versus throwaway.
  hexhive: { reachedMaster: boolean; wordsAtMaster: number; score: number; masterTarget: number };
  wordgrid: { score: number };
  wordsmith: { score: number };
  anagrams: { score: number };
}

/** What a board value decodes back into. */
export interface DecodedResults {
  furdle: { won: boolean; guesses: number; seconds: number };
  hangman: { won: boolean; misses: number; seconds: number };
  wordladder: { gaveUp: boolean; stepsOverPar: number; hints: number; seconds: number };
  wordsearch: { foundCount: number; score: number };
  hexhive: { reachedMaster: boolean; wordsAtMaster: number | null; score: number };
  wordgrid: { score: number };
  wordsmith: { score: number };
  anagrams: { score: number };
}

export type RealAttemptContext = {
  /** That date's Hex Hive Master score. Needed only for Hex Hive. */
  hexMasterTarget?: number;
};

export interface BoardDef<G extends GameId> {
  gameId: G;
  boardId: string;
  title: string;
  encode(result: DailyResults[G]): number;
  decode(value: number): DecodedResults[G];
  /** The result in the game's own terms, for example "3 guesses · 1:12". */
  formatForDisplay(value: number): string;
  isRealAttempt(value: number, ctx?: RealAttemptContext): boolean;
  /** A lost or given-up daily gets no rank mark on the results screen. */
  isLoss(value: number): boolean;
}

export function formatClock(seconds: number): string {
  const s = clamp(seconds, 0, MAX_SECONDS);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

// ── Score-only boards ─────────────────────────────────────────────────────────
// Raw score on purpose: Apple's Games app also shows these boards, and a raw
// score reads normally there.

function scoreBoard<G extends 'wordgrid' | 'wordsmith' | 'anagrams'>(
  gameId: G,
  boardId: string,
  title: string,
  realMin: number,
): BoardDef<G> {
  return {
    gameId,
    boardId,
    title,
    encode: (r) => clamp(r.score, 0, Number.MAX_SAFE_INTEGER),
    decode: (v) => ({ score: Math.max(0, Math.round(v)) }) as DecodedResults[G],
    formatForDisplay: (v) => fmt(Math.max(0, v)),
    isRealAttempt: (v) => v >= realMin,
    isLoss: () => false,
  };
}

// ── Furdle ────────────────────────────────────────────────────────────────────
// win before loss, fewer guesses, faster.
// value = primary * 100000 + (99999 - seconds), primary = won ? 7 - guesses : 0

const furdle: BoardDef<'furdle'> = {
  gameId: 'furdle',
  boardId: 'wf.daily.furdle',
  title: 'Furdle',
  encode: (r) => {
    const primary = r.won ? 7 - clamp(r.guesses, 1, 6) : 0;
    const seconds = clamp(r.seconds ?? MAX_SECONDS, 0, MAX_SECONDS);
    return primary * 100000 + (MAX_SECONDS - seconds);
  },
  decode: (v) => {
    const primary = clamp(Math.floor(v / 100000), 0, 6);
    const seconds = MAX_SECONDS - clamp(v % 100000, 0, MAX_SECONDS);
    return { won: primary > 0, guesses: primary > 0 ? 7 - primary : 6, seconds };
  },
  formatForDisplay: (v) => {
    const d = furdle.decode(v);
    return d.won ? `${plural(d.guesses, 'guess', 'guesses')} · ${formatClock(d.seconds)}` : 'Not solved';
  },
  isRealAttempt: () => true, // any finish, win or loss
  isLoss: (v) => !furdle.decode(v).won,
};

// ── Hangman ───────────────────────────────────────────────────────────────────
// win before loss, fewer misses, faster.
// value = primary * 100000 + (99999 - seconds), primary = won ? 7 - misses : 0

const hangman: BoardDef<'hangman'> = {
  gameId: 'hangman',
  boardId: 'wf.daily.hangman',
  title: 'Hangman',
  encode: (r) => {
    const primary = r.won ? 7 - clamp(r.misses, 0, 5) : 0;
    const seconds = clamp(r.seconds, 0, MAX_SECONDS);
    return primary * 100000 + (MAX_SECONDS - seconds);
  },
  decode: (v) => {
    const primary = clamp(Math.floor(v / 100000), 0, 7);
    const seconds = MAX_SECONDS - clamp(v % 100000, 0, MAX_SECONDS);
    return { won: primary > 0, misses: primary > 0 ? 7 - primary : 6, seconds };
  },
  formatForDisplay: (v) => {
    const d = hangman.decode(v);
    return d.won ? `${plural(d.misses, 'miss', 'misses')} · ${formatClock(d.seconds)}` : 'Not solved';
  },
  isRealAttempt: () => true, // any finish, win or loss
  isLoss: (v) => !hangman.decode(v).won,
};

// ── Word Ladder ───────────────────────────────────────────────────────────────
// finished before gave up, fewer steps over par, fewer hints, faster.
// value = primary * 1000000 + (3 - hints) * 100000 + (99999 - seconds),
// primary = gaveUp ? 0 : clamp(50 - stepsOverPar, 1, 50)

const wordladder: BoardDef<'wordladder'> = {
  gameId: 'wordladder',
  boardId: 'wf.daily.wordladder',
  title: 'Word Ladder',
  encode: (r) => {
    const primary = r.gaveUp ? 0 : clamp(50 - clamp(r.stepsOverPar, 0, 1000), 1, 50);
    const hints = clamp(r.hints, 0, 3);
    const seconds = clamp(r.seconds, 0, MAX_SECONDS);
    return primary * 1000000 + (3 - hints) * 100000 + (MAX_SECONDS - seconds);
  },
  decode: (v) => {
    const primary = clamp(Math.floor(v / 1000000), 0, 50);
    const rest = v % 1000000;
    const hints = 3 - clamp(Math.floor(rest / 100000), 0, 3);
    const seconds = MAX_SECONDS - clamp(rest % 100000, 0, MAX_SECONDS);
    return { gaveUp: primary === 0, stepsOverPar: primary === 0 ? 0 : 50 - primary, hints, seconds };
  },
  formatForDisplay: (v) => {
    const d = wordladder.decode(v);
    if (d.gaveUp) return 'Gave up';
    const par = d.stepsOverPar === 0 ? 'Par' : `+${d.stepsOverPar}`;
    const hints = d.hints > 0 ? ` · ${plural(d.hints, 'hint', 'hints')}` : '';
    return `${par}${hints} · ${formatClock(d.seconds)}`;
  },
  isRealAttempt: (v) => !wordladder.decode(v).gaveUp,
  isLoss: (v) => wordladder.decode(v).gaveUp,
};

// ── Word Search ───────────────────────────────────────────────────────────────
// more words found, then higher score. Found count leads because combos could
// otherwise let a fast partial run outscore a slower complete one.
// value = foundCount * 1000000 + clamp(score, 0, 999999)

const WORDSEARCH_TOTAL = 10;

const wordsearch: BoardDef<'wordsearch'> = {
  gameId: 'wordsearch',
  boardId: 'wf.daily.wordsearch',
  title: 'Word Search',
  encode: (r) => clamp(r.foundCount, 0, 99) * 1000000 + clamp(r.score, 0, 999999),
  decode: (v) => ({ foundCount: clamp(Math.floor(v / 1000000), 0, 99), score: clamp(v % 1000000, 0, 999999) }),
  formatForDisplay: (v) => {
    const d = wordsearch.decode(v);
    return `${d.foundCount}/${WORDSEARCH_TOTAL} · ${fmt(d.score)}`;
  },
  isRealAttempt: (v) => wordsearch.decode(v).foundCount >= REAL_ATTEMPT.wordsearchMinFound,
  isLoss: () => false,
};

// ── Hex Hive ──────────────────────────────────────────────────────────────────
// reached Master before not, fewer words to Master, higher score.
// Master:      1000000000000 + (999 - wordsAtMaster) * 1000000 + clamp(score, 0, 999999)
// Not Master:  clamp(score, 0, 999999)

const HEX_MASTER_BASE = 1000000000000;

const hexhive: BoardDef<'hexhive'> = {
  gameId: 'hexhive',
  boardId: 'wf.daily.hexhive',
  title: 'Hex Hive',
  encode: (r) => {
    const score = clamp(r.score, 0, 999999);
    if (!r.reachedMaster) return score;
    return HEX_MASTER_BASE + (999 - clamp(r.wordsAtMaster, 1, 999)) * 1000000 + score;
  },
  decode: (v) => {
    if (v < HEX_MASTER_BASE) {
      return { reachedMaster: false, wordsAtMaster: null, score: clamp(v, 0, 999999) };
    }
    const rest = v - HEX_MASTER_BASE;
    return {
      reachedMaster: true,
      wordsAtMaster: 999 - clamp(Math.floor(rest / 1000000), 0, 998),
      score: clamp(rest % 1000000, 0, 999999),
    };
  },
  formatForDisplay: (v) => {
    const d = hexhive.decode(v);
    return d.reachedMaster && d.wordsAtMaster !== null
      ? `Master · ${plural(d.wordsAtMaster, 'word', 'words')}`
      : `${fmt(d.score)} pts`;
  },
  isRealAttempt: (v, ctx) => {
    const d = hexhive.decode(v);
    if (d.reachedMaster) return true;
    const target = ctx?.hexMasterTarget;
    if (!target || target <= 0) return false;
    // Same rounding as the rank ladder (getRankProgress), so "Sharp" here
    // means exactly what the game shows as Sharp.
    return d.score >= Math.round(REAL_ATTEMPT.hexhiveMinMasterFraction * target);
  },
  isLoss: () => false,
};

export const BOARDS: { [G in GameId]: BoardDef<G> } = {
  furdle,
  wordsmith: scoreBoard('wordsmith', 'wf.daily.wordsmith', 'Wordsmith', REAL_ATTEMPT.wordsmithMinScore),
  hangman,
  wordgrid: scoreBoard('wordgrid', 'wf.daily.wordgrid', 'Word Grid', REAL_ATTEMPT.wordgridMinScore),
  wordsearch,
  wordladder,
  hexhive,
  anagrams: scoreBoard('anagrams', 'wf.daily.anagrams', 'Anagrams', REAL_ATTEMPT.anagramsMinScore),
};

export function boardFor(gameId: GameId): BoardDef<GameId> {
  return BOARDS[gameId] as unknown as BoardDef<GameId>;
}

export function isGameId(x: unknown): x is GameId {
  return typeof x === 'string' && (GAME_IDS as readonly string[]).includes(x);
}

/** The game a board id belongs to, or null for the weekly board. */
export function gameForBoard(boardId: string): GameId | null {
  for (const g of GAME_IDS) if (BOARDS[g].boardId === boardId) return g;
  return null;
}
