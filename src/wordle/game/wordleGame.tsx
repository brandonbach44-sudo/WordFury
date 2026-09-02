import { useRouter } from "expo-router";
import { AchievementIcon } from '../../shared/AchievementIcon';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
  ImageBackground,
} from "react-native";
import { Flame, Share2, Trophy } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type {
  DailyLockState,
  WordleDailyProgress,
  WordlePrefs,
} from "../storage/wordleStorage";
import {
  clearDailyProgress,
  loadDailyLock,
  loadDailyProgress,
  loadWordleStats,
  loadWordlePrefs,
  saveDailyLock,
  saveDailyProgress,
  saveWordleStats,
  saveWordlePrefs,
  loadPracticeProgress,
  savePracticeProgress,
  clearPracticeProgress,
  saveWordleDailyHistoryEntry,
} from "../storage/wordleStorage";

import { useTheme } from "../../shared/ThemeContext";
import { getSemanticColors } from "../../shared/semanticColors";
import { recordRejectedWord } from "../../shared/wordReports";
import { HapticManager } from "../../shared/HapticManager";

import WordleResultOverlay from "../components/wordleResultoverlay";
import { WordleKey } from "../components/WordleKey";
import { AchievementPopup } from "../../shared/AchievementPopup";
import { FallingLetters } from "../../shared/FallingLetters";
import DailyCalendar, { type CalendarHistory } from "../../shared/DailyCalendar";
import { maybeRequestReview } from "../../shared/reviewPrompt";
import { syncDailyReminder, maybeFlagReminderOptIn } from "../../shared/dailyReminders";
import { KEY_SKIN_ORDER, KEY_SKINS, isKeySkinUnlocked, type KeySkinName } from "../utils/keySkins";
import { LinearGradient } from "expo-linear-gradient";
// AchievementPopup is the shared component in src/shared — uses compatible shape (category, name, description)
import { SOLUTIONS, VALID_GUESSES } from "../data/wordle_words";
import { PROFANITY_BLOCKLIST } from "../../shared/profanityBlocklist";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Gem preview images for the skin picker (same assets as Word Builder)
const GEM_PREVIEW_IMAGES: Partial<Record<string, any>> = {
  ruby:        require('../../../assets/tiles/ruby_v1.png'),
  emerald:     require('../../../assets/tiles/emerald_v1.png'),
  diamond:     require('../../../assets/tiles/diamond_v1.png'),
  legendary:   require('../../../assets/tiles/legendary_v1.png'),
  iridescence: require('../../../assets/tiles/iridescence_v1.png'),
  rose_quartz: require('../../../assets/tiles/rose_quartz_v1.png'),
};

const DEFAULT_STYLES: Record<number, { background: string; border: string; text: string }> = {
  1: { background: '#5B8FB9', border: '#4A7A9E', text: '#ffffff' }, // Soft Blue
  2: { background: '#7D9D9C', border: '#6B8A89', text: '#ffffff' }, // Sage Green
  3: { background: '#9B7EBD', border: '#8569A6', text: '#ffffff' }, // Soft Purple
  4: { background: '#D4A574', border: '#C19460', text: '#ffffff' }, // Warm Tan
  5: { background: '#E8A0A0', border: '#D68F8F', text: '#ffffff' }, // Dusty Rose
  6: { background: '#6AACB8', border: '#5899A5', text: '#ffffff' }, // Soft Teal
  7: { background: '#ffffff', border: '#d1d5db', text: '#111827' },       // White
};

const ROWS = 6;
const COLS = 5;

const HORIZONTAL_PADDING = 16;

// Keyboard tuning — horizontal padding matches Word Ladder's keyboard
// exactly (6, not the wider 16 used by the tile grid above) so every game's
// on-screen keyboard is the same size; Furdle's used to run narrower.
const KEYBOARD_HORIZONTAL_PADDING = 6;
const KEY_GAP = 6;
const KEY_MIN_HEIGHT = 54;
const KEY_ROW_MARGIN_V = 3;

// Tiles tuning (responsive to width + height)
const TILE_GAP = 6;
const TILE_MAX = 64;
const TILE_MIN = 48;

// Estimate space needed for non-grid UI + keyboard/enter.
const EST_TOP_UI = 230;
const EST_BOTTOM_UI = 240;
const AVAILABLE_FOR_GRID = Math.max(0, SCREEN_HEIGHT - EST_TOP_UI - EST_BOTTOM_UI);

const TILE_SIZE_BY_WIDTH = Math.floor(
  (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - TILE_GAP * (COLS - 1)) / COLS
);

const TILE_SIZE_BY_HEIGHT_RAW = Math.floor(
  (AVAILABLE_FOR_GRID - TILE_GAP * (ROWS - 1)) / ROWS
);
const TILE_SIZE_BY_HEIGHT =
  TILE_SIZE_BY_HEIGHT_RAW > 0 ? TILE_SIZE_BY_HEIGHT_RAW : TILE_MAX;

const TILE_SIZE = Math.max(
  TILE_MIN,
  Math.min(TILE_MAX, TILE_SIZE_BY_WIDTH, TILE_SIZE_BY_HEIGHT)
);

const TILE_RADIUS = Math.max(8, Math.floor(TILE_SIZE * 0.18));

type Screen = "menu" | "game";
type MenuTab = "play" | "stats" | "customize";
type GameMode = "daily" | "practice";

type LetterState = "empty" | "correct" | "present" | "absent";

type EvaluatedLetter = {
  letter: string;
  state: LetterState;
};

type GuessDistribution = {
  [guessCount: number]: number; // 1–6
};

export type ModeStats = {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  bestStreak: number;
  totalTimeSeconds: number;
  fastestTimeSeconds: number | null;
  totalGuesses: number;
  totalLettersTyped: number;
  bestGuessCount: number | null;
  guessDistribution: GuessDistribution; // wins only
};

type WordleStats = {
  daily: ModeStats;
  practice: ModeStats;
  dailyHistory: Record<string, "won" | "lost">;
};



type OverlayOrigin = "game_end" | "menu_view";

type Achievement = {
  id: string;
  /** Drives the icon — see src/shared/AchievementIcon.tsx. */
  category: string;
  name: string;
  description: string;
  unlocked: boolean;
  progress?: number; // 0–1, only for countable achievements
};

const KEYBOARD_ROWS: string[][] = [
  "QWERTYUIOP".split(""),
  "ASDFGHJKL".split(""),
  [..."ZXCVBNM".split(""), "BACK"],
];

// ✅ Normalize dictionaries once so validation is case-insensitive and fast.
const SOLUTIONS_LC: string[] = SOLUTIONS.map((w) => String(w).trim().toLowerCase()).filter((w) => !PROFANITY_BLOCKLIST.has(w));
const VALID_GUESSES_SET: Set<string> = new Set(
  VALID_GUESSES.map((w) => String(w).trim().toLowerCase()).filter(Boolean)
);

// In case SOLUTIONS words should also always be valid guesses:
for (const w of SOLUTIONS_LC) VALID_GUESSES_SET.add(w);

// ✅ Daily word order: a fixed, seeded shuffle of SOLUTIONS indices, kept
// separate from the raw array order. Relying on "day number % array length"
// directly against SOLUTIONS_LC means the *order words were typed into the
// file* controls which word shows on which day — if that order ever clumps
// same-letter words together (e.g. alphabetical, or just bad luck from a
// manual reshuffle), users can get long runs of "only W words" etc. A
// seeded Fisher-Yates permutation is deterministic (same seed -> same
// mapping every run) but decoupled from array order, so edits to SOLUTIONS
// (adding/removing words) can't reintroduce clustering.
function mulberry32(seed: number) {
  return function (): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildDailyOrder(length: number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  const rand = mulberry32(0xc0ffee);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

const DAILY_ORDER: number[] = buildDailyOrder(SOLUTIONS_LC.length);

function createEmptyModeStats(): ModeStats {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    currentStreak: 0,
    bestStreak: 0,
    totalTimeSeconds: 0,
    fastestTimeSeconds: null,
    totalGuesses: 0,
    totalLettersTyped: 0,
    bestGuessCount: null,
    guessDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
  };
}

function createDefaultStats(): WordleStats {
  return {
    daily: createEmptyModeStats(),
    practice: createEmptyModeStats(),
    dailyHistory: {},
  };
}

function evaluateGuess(guess: string, solution: string): EvaluatedLetter[] {
  const result: EvaluatedLetter[] = [];
  const solutionChars = solution.split("");
  const guessChars = guess.split("");

  const solutionCounts: Record<string, number> = {};
  for (const ch of solutionChars) {
    solutionCounts[ch] = (solutionCounts[ch] ?? 0) + 1;
  }

  // Greens
  for (let i = 0; i < COLS; i++) {
    const g = guessChars[i];
    const s = solutionChars[i];
    if (g === s) {
      result.push({ letter: g, state: "correct" });
      solutionCounts[g] -= 1;
    } else {
      result.push({ letter: g, state: "empty" });
    }
  }

  // Yellows / grays (respect counts)
  for (let i = 0; i < COLS; i++) {
    if (result[i].state !== "empty") continue;
    const g = result[i].letter;
    if (solutionCounts[g] && solutionCounts[g] > 0) {
      result[i] = { letter: g, state: "present" };
      solutionCounts[g] -= 1;
    } else {
      result[i] = { letter: g, state: "absent" };
    }
  }

  return result;
}

function getDailyIndex(date = new Date()): number {
  // Use LOCAL date components (not UTC) so the daily word rolls over at the
  // player's own midnight rather than UTC midnight. With UTC, US players saw
  // the next day's word starting around 8pm local time, so the same word
  // appeared across two consecutive local calendar days. Date.UTC() is still
  // used purely as a timezone-free way to turn Y/M/D into a day number.
  // This matches every other game, which all seed from local Y/M/D.
  const msPerDay = 24 * 60 * 60 * 1000;
  const dayNumber = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / msPerDay
  );
  return Math.abs(dayNumber) % SOLUTIONS_LC.length;
}

function getDailySolution(): string {
  return SOLUTIONS_LC[DAILY_ORDER[getDailyIndex()]];
}

function getRandomPracticeSolution(): string {
  const idx = Math.floor(Math.random() * SOLUTIONS_LC.length);
  return SOLUTIONS_LC[idx];
}

function getTodayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getSecondsUntilNextMidnight(): number {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const diffMs = end.getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / 1000));
}

function formatSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

function formatTotalTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getWinRate(stats: ModeStats): number {
  if (stats.gamesPlayed <= 0) return 0;
  return Math.round((stats.gamesWon / stats.gamesPlayed) * 100);
}

function getAverageTimeSeconds(stats: ModeStats): number | null {
  if (stats.gamesWon <= 0) return null;
  if (stats.totalTimeSeconds <= 0) return null;
  return stats.totalTimeSeconds / stats.gamesWon;
}

function getAverageGuesses(stats: ModeStats): number | null {
  if (stats.gamesWon <= 0) return null;
  if (stats.totalGuesses <= 0) return null;
  return stats.totalGuesses / stats.gamesWon;
}

function mergeLoadedStats(loaded: any | null): WordleStats {
  const base = createDefaultStats();
  if (!loaded || typeof loaded !== "object") return base;

  const daily = loaded.daily ?? {};
  const practice = loaded.practice ?? {};

  const coerceMode = (x: any): ModeStats => ({
    gamesPlayed: Number(x.gamesPlayed ?? 0),
    gamesWon: Number(x.gamesWon ?? 0),
    currentStreak: Number(x.currentStreak ?? 0),
    bestStreak: Number(x.bestStreak ?? 0),
    totalTimeSeconds: Number(x.totalTimeSeconds ?? 0),
    fastestTimeSeconds:
      x.fastestTimeSeconds == null ? null : Number(x.fastestTimeSeconds),
    totalGuesses: Number(x.totalGuesses ?? 0),
    totalLettersTyped: Number(x.totalLettersTyped ?? 0),
    bestGuessCount: x.bestGuessCount == null ? null : Number(x.bestGuessCount),
    guessDistribution: {
      1: Number(x.guessDistribution?.[1] ?? 0),
      2: Number(x.guessDistribution?.[2] ?? 0),
      3: Number(x.guessDistribution?.[3] ?? 0),
      4: Number(x.guessDistribution?.[4] ?? 0),
      5: Number(x.guessDistribution?.[5] ?? 0),
      6: Number(x.guessDistribution?.[6] ?? 0),
    },
  });

  return {
    daily: coerceMode(daily),
    practice: coerceMode(practice),
    dailyHistory: typeof loaded.dailyHistory === "object" && loaded.dailyHistory !== null ? loaded.dailyHistory : {},
  };
}

function pickBetterState(prev: LetterState, next: LetterState): LetterState {
  const rank: Record<LetterState, number> = {
    empty: 0,
    absent: 1,
    present: 2,
    correct: 3,
  };
  return rank[next] > rank[prev] ? next : prev;
}

const StatsCard = ({
  label,
  value,
  wide = false,
  textColor,
  secondaryText,
  cardColor,
  borderColor,
}: {
  label: string;
  value: string;
  wide?: boolean;
  textColor: string;
  secondaryText: string;
  cardColor: string;
  borderColor: string;
}) => {
  return (
    <View
      style={[
        styles.statsCard,
        wide && styles.statsCardWide,
        { backgroundColor: cardColor, borderColor },
      ]}
    >
      <Text style={[styles.statsValue, { color: textColor }]}>{value}</Text>
      <Text style={[styles.statsLabel, { color: secondaryText }]}>{label}</Text>
    </View>
  );
};

const GuessDistChart = ({
  distribution,
  totalWins,
  textColor,
  secondaryText,
  cardColor,
  borderColor,
}: {
  distribution: Record<number, number>;
  totalWins: number;
  textColor: string;
  secondaryText: string;
  cardColor: string;
  borderColor: string;
}) => {
  const maxCount = Math.max(1, ...Object.values(distribution));
  return (
    <View style={[styles.distCard, { backgroundColor: cardColor, borderColor }]}>
      <Text style={[styles.distTitle, { color: textColor }]}>Guess Distribution</Text>
      {[1, 2, 3, 4, 5, 6].map((n) => {
        const count = distribution[n] ?? 0;
        const pct = totalWins > 0 ? Math.max(0.04, count / maxCount) : 0.04;
        return (
          <View key={n} style={styles.distRow}>
            <Text style={[styles.distLabel, { color: secondaryText }]}>{n}</Text>
            <View style={styles.distBarWrap}>
              <View style={[styles.distBar, { flex: pct, backgroundColor: "#22c55e" }]}>
                <Text style={styles.distCount}>{count}</Text>
              </View>
              <View style={{ flex: 1 - pct }} />
            </View>
          </View>
        );
      })}
    </View>
  );
};

const AchievementCard = ({
  achievement,
  textColor,
  secondaryText,
  cardColor,
  borderColor,
}: {
  achievement: Achievement;
  textColor: string;
  secondaryText: string;
  cardColor: string;
  borderColor: string;
}) => {
  const opacity = achievement.unlocked ? 1 : 0.5;
  const showProgress =
    !achievement.unlocked &&
    achievement.progress !== undefined &&
    achievement.progress > 0;

  return (
    <View
      style={[
        styles.achievementCard,
        { backgroundColor: cardColor, borderColor, opacity },
      ]}
    >
      <View style={styles.achievementEmoji}>
        <AchievementIcon category={achievement.category} size={26} color={textColor} />
      </View>
      <Text style={[styles.achievementName, { color: textColor }]}>
        {achievement.name}
      </Text>
      <Text style={[styles.achievementDesc, { color: secondaryText }]}>
        {achievement.description}
      </Text>
      {showProgress && (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round(achievement.progress! * 100)}%` },
            ]}
          />
        </View>
      )}
    </View>
  );
};

export default function WordleGame() {
  const router = useRouter();
  const { background, colorBlindMode } = useTheme();

  const BG = background.backgroundColor ?? "#f9f5ec";
  const TEXT = background.textColor ?? "#111827";
  const SUBTEXT = background.secondaryText ?? "#6b7280";
  const CARD = background.cardColor ?? "#ffffff";
  const BORDER = background.borderColor ?? "#e5e7eb";
  const IS_DARK = background.isDark ?? false;


  // Values now come from src/shared/semanticColors.ts, which was seeded from
  // exactly these numbers -- so Furdle looks identical, it just no longer owns
  // its own copy of the mapping. Four files each carried one before, and wiring
  // the other six games would have made ten.
  const semantic = getSemanticColors(colorBlindMode);
  const COLOR_CORRECT        = semantic.correct;
  const COLOR_CORRECT_BORDER = semantic.correctBorder;
  const COLOR_PRESENT        = semantic.present;
  const COLOR_PRESENT_BORDER = semantic.presentBorder;
  const COLOR_PRESENT_TEXT   = semantic.presentText;
  // Won/lost indicator used outside the tile grid (e.g. the main menu's
  // 7-day calendar strip) — same orange/blue colorblind-safe pairing as the
  // tiles above, instead of leaving the "lost" side hardcoded red.
  const COLOR_LOST           = semantic.wrong;
  const COLOR_LOST_BORDER    = semantic.wrongBorder;

  const [screen, setScreen] = useState<Screen>("menu");
  const [menuTab, setMenuTab] = useState<MenuTab>("play");
  // Mirrors `screen` for the async hydration effect below, which fires once
  // on mount but can resolve well after the user has already tapped into a
  // game (its `[]` deps mean it can't just read `screen` directly — that
  // closure is frozen at the initial "menu" value forever). Without this,
  // a slow AsyncStorage read landing after the player already started Quick
  // Play would silently overwrite their in-progress board with whatever the
  // Daily's completed state was — including popping the Daily's results
  // overlay open mid-Quick-Play if that overwrite raced with the game
  // finishing.
  const screenRef = useRef<Screen>("menu");
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  const [gameMode, setGameMode] = useState<GameMode>("daily");
  const [solution, setSolution] = useState<string>(() => getDailySolution());
  const [guesses, setGuesses] = useState<string[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluatedLetter[][]>([]);
  const [currentGuess, setCurrentGuess] = useState<string>("");
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");
  const [startTime, setStartTime] = useState<number>(() => Date.now());

  const [message, setMessage] = useState<string | null>(null);

  // Result overlay state (can be opened either from game end or from Play menu "View Result")
  const [showResult, setShowResult] = useState(false);
  const [overlayOrigin, setOverlayOrigin] = useState<OverlayOrigin>("game_end");
  const [overlayMode, setOverlayMode] = useState<GameMode>("daily");
  const [overlayStatus, setOverlayStatus] = useState<"won" | "lost">("lost");
  const [overlaySolutionWord, setOverlaySolutionWord] = useState<string>(() =>
    getDailySolution()
  );
  const [overlayGuessesCount, setOverlayGuessesCount] = useState<number>(0);
  const [overlayTimeSeconds, setOverlayTimeSeconds] = useState<number | null>(null);
  const [overlayShareText, setOverlayShareText] = useState<string>("");
  const [overlayEvaluationRows, setOverlayEvaluationRows] = useState<LetterState[][]>([]);

  const [stats, setStats] = useState<WordleStats>(() => createDefaultStats());
  const [hydrated, setHydrated] = useState(false);
  const [prefs, setPrefs] = useState<WordlePrefs>({ hardMode: false, colorBlindMode: false, keyShape: 'square', keyStyle: 'filled', keySkin: 'default', keyDefaultVariant: 1 });

  const [selectedSkinForPopup, setSelectedSkinForPopup] = useState<string | null>(null);
  const [popupVariant, setPopupVariant] = useState<number>(1);

  const [dailyLock, setDailyLock] = useState<DailyLockState | null>(null);
  const [dailyInProgressToday, setDailyInProgressToday] = useState(false);
  const [nextDailySeconds, setNextDailySeconds] = useState<number | null>(null);
  const [todayISO, setTodayISO] = useState<string>(() => getTodayISODate());
  // Set true when an in-progress Daily attempt was restored on hydration —
  // tells startGame("daily") to enter the already-loaded game instead of
  // wiping it via resetGameState.
  const resumedDailyRef = useRef(false);
  const resumedPracticeRef = useRef(false);

  // Achievement popup state
  const [pendingAchievements, setPendingAchievements] = useState<Achievement[]>([]);
  const [currentPopupAchievement, setCurrentPopupAchievement] = useState<Achievement | null>(null);
  // Track IDs already unlocked at session start so we don't re-fire old ones
  const sessionStartUnlockedRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setTodayISO(getTodayISODate());
    }, 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const flipAnims = useRef(
    Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => new Animated.Value(0))
    )
  ).current;

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const winBounceAnim = useRef(new Animated.Value(0)).current;

  const resetFlipAnimations = useCallback(() => {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        flipAnims[r][c].setValue(0);
      }
    }
  }, [flipAnims]);

  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 1,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 1,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 70,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeAnim]);

  const triggerWinBounce = useCallback(() => {
    winBounceAnim.setValue(0);
    Animated.sequence([
      Animated.timing(winBounceAnim, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(winBounceAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [winBounceAnim]);

  const showMessageFn = useCallback(
    (text: string) => {
      setMessage(text);
      triggerShake();
    },
    [triggerShake]
  );

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 1500);
    return () => clearTimeout(id);
  }, [message]);

  const revealRow = useCallback(
    (rowIndex: number) => {
      const rowAnims = flipAnims[rowIndex];
      const animations = rowAnims.map((anim) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        })
      );
      Animated.stagger(80, animations).start();
    },
    [flipAnims]
  );

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const [loadedStats, loadedLock, loadedPrefs] = await Promise.all([
          loadWordleStats(),
          loadDailyLock(),
          loadWordlePrefs(),
        ]);
        if (isMounted) setPrefs(loadedPrefs);

        if (!isMounted) return;

        setStats(mergeLoadedStats(loadedStats));

        let lockedToday = false;
        if (
          loadedLock &&
          typeof loadedLock === "object" &&
          typeof loadedLock.dateISO === "string" &&
          (loadedLock.result === "won" || loadedLock.result === "lost")
        ) {
          setDailyLock({
            dateISO: loadedLock.dateISO,
            result: loadedLock.result,
            guessesCount:
              typeof loadedLock.guessesCount === "number"
                ? loadedLock.guessesCount
                : undefined,
            timeSeconds:
              loadedLock.timeSeconds == null
                ? undefined
                : Number(loadedLock.timeSeconds),
            shareText:
              typeof loadedLock.shareText === "string"
                ? loadedLock.shareText
                : undefined,
          });
          lockedToday = loadedLock.dateISO === getTodayISODate();

          // Daily is already completed for today — reflect that in game
          // state immediately, otherwise `status` stays at its default
          // "playing" and the "Leave Daily Challenge?" prompt (which only
          // guards an in-progress attempt) fires on every remount even
          // though there's nothing left to leave.
          //
          // Guarded on screenRef still being "menu": this hydration read is
          // async and can resolve after the player has already tapped into
          // a game (Quick Play or otherwise). Without this check, a slow
          // resolution would silently overwrite their in-progress board
          // with the Daily's old completed state from earlier — including
          // yanking them into a stale results screen mid-Quick-Play.
          if (lockedToday && screenRef.current === "menu") {
            setGameMode("daily");
            setStatus(loadedLock.result);
            setSolution(getDailySolution());
            if (Array.isArray(loadedLock.guesses)) {
              setGuesses(loadedLock.guesses);
              // Immediately show colored back face for all restored rows —
              // no flip animation needed for already-completed guesses.
              loadedLock.guesses.forEach((_: string, rowIndex: number) => {
                for (let c = 0; c < COLS; c++) {
                  flipAnims[rowIndex][c].setValue(1);
                }
              });
            }
            if (Array.isArray(loadedLock.evaluations)) {
              setEvaluations(loadedLock.evaluations as EvaluatedLetter[][]);
            }
          }
        } else {
          setDailyLock(null);
        }

        // Resume an in-progress Daily attempt (app closed/backgrounded mid-game)
        // unless today's Daily is already completed. Same screenRef guard as
        // above — don't clobber a game the player has already started.
        if (!lockedToday && screenRef.current === "menu") {
          const savedProgress = await loadDailyProgress();
          if (isMounted && screenRef.current === "menu" && savedProgress && savedProgress.dateISO === getTodayISODate()) {
            setGameMode("daily");
            setSolution(getDailySolution());
            setGuesses(savedProgress.guesses);
            setEvaluations(savedProgress.evaluations as EvaluatedLetter[][]);
            setCurrentGuess(savedProgress.currentGuess);
            setStartTime(Date.now() - savedProgress.elapsedSeconds * 1000);
            // Immediately show colored back face for all restored rows —
            // no flip animation needed for already-submitted guesses.
            savedProgress.guesses.forEach((_: string, rowIndex: number) => {
              for (let c = 0; c < COLS; c++) {
                flipAnims[rowIndex][c].setValue(1);
              }
            });
            resumedDailyRef.current = true;
            if (isMounted) setDailyInProgressToday(true);
          }
        }

        // Resume an in-progress Quick Play (Practice) attempt.
        // Only restore if we haven't already placed the player into the daily.
        if (!resumedDailyRef.current && screenRef.current === "menu") {
          const savedPractice = await loadPracticeProgress();
          if (isMounted && savedPractice) {
            setGameMode("practice");
            setSolution(savedPractice.solution);
            setGuesses(savedPractice.guesses);
            setEvaluations(savedPractice.evaluations as EvaluatedLetter[][]);
            setCurrentGuess(savedPractice.currentGuess);
            setStartTime(Date.now() - savedPractice.elapsedSeconds * 1000);
            savedPractice.guesses.forEach((_: string, rowIndex: number) => {
              for (let c = 0; c < COLS; c++) {
                flipAnims[rowIndex][c].setValue(1);
              }
            });
            resumedPracticeRef.current = true;
          }
        }

        setHydrated(true);
      } catch (e) {
        console.warn("Failed to hydrate Wordle storage", e);
        setHydrated(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);


  // Show popups one at a time
  useEffect(() => {
    if (pendingAchievements.length > 0 && !currentPopupAchievement) {
      setCurrentPopupAchievement(pendingAchievements[0]);
      setPendingAchievements((prev) => prev.slice(1));
    }
  }, [pendingAchievements, currentPopupAchievement]);

  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      try {
        await saveWordleStats(stats);
      } catch (e) {
        console.warn("Failed to save Wordle stats", e);
      }
    })();
  }, [hydrated, stats]);

  const isDailyCompletedToday = dailyLock != null && dailyLock.dateISO === todayISO;

  useEffect(() => {
    if (!isDailyCompletedToday) {
      setNextDailySeconds(null);
      return;
    }

    setNextDailySeconds(getSecondsUntilNextMidnight());
    const id = setInterval(() => {
      setNextDailySeconds(getSecondsUntilNextMidnight());
    }, 1000);

    return () => clearInterval(id);
  }, [isDailyCompletedToday]);

  const backToGames = useCallback(() => router.back(), [router]);

  const closeResult = useCallback(() => {
    setShowResult(false);
    setOverlayOrigin("game_end");
  }, []);

  const goToMenu = useCallback((tab: MenuTab = "play") => {
    setMenuTab(tab);
    setScreen("menu");
  }, []);

  const MENU_TABS: MenuTab[] = ["play", "customize", "stats"];

  // Tab slide animation
  const tabAnim = useRef(new Animated.Value(0)).current;
  const currentTabIdxRef = useRef(0);
  const dragBase = useRef(0);

  useEffect(() => {
    currentTabIdxRef.current = MENU_TABS.indexOf(menuTab);
  }, [menuTab]);

  const handleTabPress = (key: MenuTab) => {
    const newIdx = MENU_TABS.indexOf(key);
    setMenuTab(key);
    Animated.spring(tabAnim, {
      toValue: newIdx,
      useNativeDriver: true,
      tension: 70,
      friction: 12,
    }).start();
  };

  const menuPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.2,
      onPanResponderGrant: () => {
        tabAnim.stopAnimation();
        dragBase.current = currentTabIdxRef.current;
      },
      onPanResponderMove: (_, gs) => {
        const raw = dragBase.current - gs.dx / SCREEN_WIDTH;
        tabAnim.setValue(Math.max(0, Math.min(MENU_TABS.length - 1, raw)));
      },
      onPanResponderRelease: (_, gs) => {
        const base = dragBase.current;
        // Linear navigation. The tab strip is a single left-to-right track and
        // its left end is the way out of the game, so a right-swipe while
        // already on the first tab pops back instead of dead-ending. This is
        // what the root Stack's full-screen back gesture used to do from
        // anywhere on screen -- which is exactly why it had to go: it swallowed
        // these horizontal pans, so tabs became unreachable by swipe and a
        // right-swipe deep in Stats jumped straight out of the game.
        if (gs.dx > 25 || gs.vx > 0.3) {
          if (base <= 0) {
            Animated.spring(tabAnim, {
              toValue: 0,
              useNativeDriver: true,
              tension: 70,
              friction: 12,
            }).start();
            router.back();
            return;
          }
        }
        let newIdx = Math.round(base);
        if (gs.dx < -25 || gs.vx < -0.3) newIdx = Math.min(Math.floor(base) + 1, MENU_TABS.length - 1);
        else if (gs.dx > 25 || gs.vx > 0.3) newIdx = Math.max(Math.ceil(base) - 1, 0);
        currentTabIdxRef.current = newIdx;
        setMenuTab(MENU_TABS[newIdx]);
        Animated.spring(tabAnim, {
          toValue: newIdx,
          useNativeDriver: true,
          tension: 70,
          friction: 12,
        }).start();
      },
    })
  ).current;

  const resetGameState = useCallback(
    (targetMode: GameMode) => {
      setGameMode(targetMode);

      setGuesses([]);
      setEvaluations([]);
      setCurrentGuess("");
      setStatus("playing");
      setMessage(null);
      setStartTime(Date.now());
      resetFlipAnimations();

      if (targetMode === "daily") {
        setSolution(getDailySolution());
      } else {
        // New practice game — clear any previously-saved practice progress
        // so the autosave starts fresh for the new puzzle.
        clearPracticeProgress().catch(() => {});
        setSolution(getRandomPracticeSolution());
      }
    },
    [resetFlipAnimations]
  );

  const startGame = useCallback(
    (targetMode: GameMode) => {
      // Daily is selected from the Play menu; if already completed today, we don't enter the game.
      if (targetMode === "daily" && isDailyCompletedToday) {
        showMessageFn("Daily Challenge complete — tap View Result.");
        return;
      }
      // Resuming an in-progress Daily attempt (restored on hydration) —
      // enter as-is instead of wiping guesses via resetGameState.
      if (targetMode === "daily" && resumedDailyRef.current) {
        setScreen("game");
        return;
      }
      // Resuming an in-progress Quick Play attempt (restored on hydration) —
      // enter as-is instead of wiping guesses via resetGameState.
      if (targetMode === "practice" && resumedPracticeRef.current) {
        resumedPracticeRef.current = false;
        setScreen("game");
        return;
      }
      resetGameState(targetMode);
      setScreen("game");
    },
    [isDailyCompletedToday, resetGameState, showMessageFn]
  );

  // Autosave Daily progress on every change so the attempt survives the app
  // being backgrounded, force-quit, or swiped away mid-game.
  useEffect(() => {
    if (!hydrated || gameMode !== "daily" || status !== "playing") return;
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    saveDailyProgress({
      dateISO: todayISO,
      guesses,
      evaluations,
      currentGuess,
      elapsedSeconds,
    });
  }, [hydrated, gameMode, status, guesses, evaluations, currentGuess, startTime, todayISO]);

  // Autosave Quick Play (Practice) progress — same logic but for practice mode.
  useEffect(() => {
    if (!hydrated || gameMode !== "practice" || status !== "playing") return;
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    savePracticeProgress({
      solution,
      guesses,
      evaluations,
      currentGuess,
      elapsedSeconds,
    });
  }, [hydrated, gameMode, status, solution, guesses, evaluations, currentGuess, startTime]);

  const openDailyResultFromMenu = useCallback(() => {
    if (!isDailyCompletedToday) return;

    // Switch to the game screen underneath so closing the overlay lands the
    // player on their completed board instead of bouncing back to the menu.
    setGameMode("daily");
    setScreen("game");

    setOverlayOrigin("menu_view");
    setOverlayMode("daily");
    setOverlayStatus(dailyLock?.result ?? "lost");
    setOverlaySolutionWord(getDailySolution());
    setOverlayGuessesCount(dailyLock?.guessesCount ?? 0);
    setOverlayTimeSeconds(
      typeof dailyLock?.timeSeconds === "number" ? dailyLock.timeSeconds : null
    );
    setOverlayShareText(dailyLock?.shareText ?? "");
    setShowResult(true);
  }, [dailyLock, isDailyCompletedToday]);

  const handleKeyPress = useCallback(
    (key: string) => {
      if (screen !== "game") return;
      if (status !== "playing") return;

      if (gameMode === "daily" && isDailyCompletedToday) {
        showMessageFn("Daily Challenge complete — return to the Play menu.");
        return;
      }

      if (key === "BACK") {
        setCurrentGuess((prev) => {
          // Nothing to delete — no tick.
          if (prev.length === 0) return prev;
          HapticManager.furdle.backspace();
          return prev.slice(0, -1);
        });
        return;
      }

      if (key.length === 1 && /[A-Z]/i.test(key)) {
        setCurrentGuess((prev) => {
          // Row already full — no letter is added, so no tick either.
          // Phantom feedback for a no-op action feels broken.
          if (prev.length >= COLS) return prev;
          HapticManager.furdle.keyPress();
          setStats((s) => { const k = gameMode === "daily" ? "daily" : "practice"; return { ...s, [k]: { ...s[k], totalLettersTyped: s[k].totalLettersTyped + 1 } }; });
          return (prev + key.toLowerCase()).slice(0, COLS);
        });
      }
    },
    [gameMode, isDailyCompletedToday, screen, showMessageFn, status]
  );

  const togglePref = useCallback(async (key: keyof WordlePrefs) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    await saveWordlePrefs(updated);
  }, [prefs]);

  const endGame = useCallback(
    async (
      result: "won" | "lost",
      guessesUsed: number,
      elapsedSeconds: number | null,
      // Passed explicitly (rather than read from the `guesses`/`evaluations`
      // closures) because endGame is invoked from a setTimeout scheduled
      // right after the final guess is submitted — by the time it fires,
      // a stale closure would still see the board from *before* that guess,
      // producing an empty/incomplete saved board. Defaults keep the other
      // call site (leaving mid-game) working off current state.
      finalGuesses: string[] = guesses,
      finalEvaluations: EvaluatedLetter[][] = evaluations
    ) => {
      if (status !== "playing") return;

      setStatus(result);

      if (result === "won") triggerWinBounce();

      // Update overlay payload first (so it can be opened later even if we jump back to menu)
      setOverlayOrigin("game_end");
      setOverlayMode(gameMode);
      setOverlayStatus(result);
      setOverlaySolutionWord(solution);
      setOverlayGuessesCount(guessesUsed);
      setOverlayTimeSeconds(elapsedSeconds);

      // Build share text (own format/branding, not copying Wordle's exact layout).
      // Keeps the classic emoji-grid centerpiece but wraps it with a proper
      // header, time, and streak — same creative treatment as the other
      // games' shares. Daily never reveals the solution word (so friends
      // who haven't played yet aren't spoiled); Practice does, since that
      // puzzle isn't a shared daily challenge.
      const emojiRows = finalEvaluations.map((row) =>
        row.map((cell) =>
          cell.state === "correct" ? "🟩" : cell.state === "present" ? "🟨" : "⬜"
        ).join("")
      );
      const resultStr = result === "won" ? `${guessesUsed}/6` : "X/6";
      const header = gameMode === "daily"
        ? `🟩 FURDLE DAILY #${getDailyIndex()}`
        : "🟩 FURDLE";

      // Mirrors the streak math in the stats updater below, computed here
      // (read-only, off current state) purely so the share text can include
      // it without waiting on the async state update.
      let shareStreakLine = "";
      if (gameMode === "daily") {
        const prevDailyStats = stats.daily;
        const yesterdayForShare = new Date();
        yesterdayForShare.setDate(yesterdayForShare.getDate() - 1);
        const yesterdayISOForShare = `${yesterdayForShare.getFullYear()}-${String(yesterdayForShare.getMonth() + 1).padStart(2, "0")}-${String(yesterdayForShare.getDate()).padStart(2, "0")}`;
        const playedYesterdayForShare = dailyLock?.dateISO === yesterdayISOForShare;
        const shareCurrentStreak =
          result === "won"
            ? (prevDailyStats.currentStreak === 0 || playedYesterdayForShare ? prevDailyStats.currentStreak + 1 : 1)
            : 0;
        if (shareCurrentStreak > 1) shareStreakLine = `${shareCurrentStreak} day streak`;
      }

      const statsLine = `${resultStr}${elapsedSeconds != null ? ` · ${formatSeconds(elapsedSeconds)}` : ""}`;
      const wordLine = gameMode !== "daily" ? `Word: ${solution.toUpperCase()}` : "";

      // Built imperatively (not array + filter-out-empties) so the
      // deliberate blank-line spacers survive — filtering on `!== ""`
      // was stripping out every blank line, not just the empty optional
      // ones, which crammed the whole share into one dense block.
      const shareLines: string[] = [header, emojiRows.join("\n"), "", statsLine];
      if (wordLine) shareLines.push(wordLine);
      if (shareStreakLine) shareLines.push(shareStreakLine);
      shareLines.push("", "wordfury.app");
      const shareText = shareLines.join("\n");
      setOverlayShareText(shareText);
      setOverlayEvaluationRows(finalEvaluations.map(row => row.map(cell => cell.state)));

      setStats((prev) => {
        const key = gameMode === "daily" ? "daily" : "practice";
        const prevMode = prev[key];

        const gamesPlayed = prevMode.gamesPlayed + 1;
        const gamesWon = result === "won" ? prevMode.gamesWon + 1 : prevMode.gamesWon;

        // For streak to continue, the last daily must have been played yesterday
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayISO = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
        const playedYesterday = dailyLock?.dateISO === yesterdayISO;

        const currentStreak =
          gameMode === "daily"
            ? result === "won"
              ? (prevMode.currentStreak === 0 || playedYesterday ? prevMode.currentStreak + 1 : 1)
              : 0
            : prevMode.currentStreak;

        const bestStreak =
          gameMode === "daily"
            ? Math.max(prevMode.bestStreak, currentStreak)
            : prevMode.bestStreak;

        const totalTimeSeconds =
          elapsedSeconds != null
            ? prevMode.totalTimeSeconds + elapsedSeconds
            : prevMode.totalTimeSeconds;

        const fastestTimeSeconds =
          elapsedSeconds != null && result === "won"
            ? prevMode.fastestTimeSeconds == null
              ? elapsedSeconds
              : Math.min(prevMode.fastestTimeSeconds, elapsedSeconds)
            : prevMode.fastestTimeSeconds;

        const totalGuesses =
          result === "won" ? prevMode.totalGuesses + guessesUsed : prevMode.totalGuesses;

        const bestGuessCount = result === "won"
          ? prevMode.bestGuessCount == null ? guessesUsed : Math.min(prevMode.bestGuessCount, guessesUsed)
          : prevMode.bestGuessCount;

        const guessDistribution = { ...prevMode.guessDistribution };
        if (result === "won" && guessesUsed >= 1 && guessesUsed <= 6) {
          guessDistribution[guessesUsed] = (guessDistribution[guessesUsed] ?? 0) + 1;
        }

        const updatedHistory = key === "daily" ? { ...prev.dailyHistory, [todayISO]: result } : prev.dailyHistory;

        if (gameMode === "daily" && result === "won") {
          maybeRequestReview(currentStreak);
          maybeFlagReminderOptIn(currentStreak);
        }
        if (gameMode === "daily") {
          syncDailyReminder();
        }

        return {
          ...prev,
          dailyHistory: updatedHistory,
          [key]: {
            ...prevMode,
            gamesPlayed,
            gamesWon,
            currentStreak,
            bestStreak,
            totalTimeSeconds,
            fastestTimeSeconds,
            totalGuesses,
            bestGuessCount,
            guessDistribution,
          },
        };
      });

      if (gameMode === "daily") {
        const lock: DailyLockState = {
          dateISO: todayISO,
          result,
          guessesCount: guessesUsed,
          timeSeconds: elapsedSeconds,
          shareText,
          guesses: finalGuesses,
          evaluations: finalEvaluations,
        };
        setDailyLock(lock);
        resumedDailyRef.current = false;
        try {
          await saveDailyLock(lock);
          await clearDailyProgress();
          await saveWordleDailyHistoryEntry({
            dateISO: lock.dateISO,
            result: lock.result,
            detail: lock.result === 'won'
              ? `${lock.guessesCount}/6 guesses ★`
              : 'X/6',
          });
        } catch (e) {
          console.warn("Failed to save daily lock", e);
        }
      } else {
        // Practice game finished — clear saved progress so the next Quick Play starts fresh.
        resumedPracticeRef.current = false;
        try {
          await clearPracticeProgress();
        } catch (e) {
          console.warn("Failed to clear practice progress", e);
        }
      }

      setShowResult(true);
    },
    [gameMode, solution, status, todayISO, triggerWinBounce, guesses, evaluations]
  );

  const submitGuess = useCallback(() => {
    if (screen !== "game") return;
    if (status !== "playing") return;

    if (gameMode === "daily" && isDailyCompletedToday) {
      showMessageFn("Daily Challenge complete — return to the Play menu.");
      return;
    }

    if (currentGuess.length < COLS) {
      HapticManager.furdle.invalidGuess();
      showMessageFn("Not enough letters");
      return;
    }

    const guessLower = currentGuess.toLowerCase();

    // ✅ Case-insensitive membership (fixes sally/SALLY mismatches)
    if (!VALID_GUESSES_SET.has(guessLower)) {
      HapticManager.furdle.invalidGuess();
      showMessageFn("Not in word list");
      // Noted for a possible dictionary report. Fire-and-forget, and implausible
      // strings are filtered out inside — the player's feedback is unchanged and
      // nothing waits on storage.
      recordRejectedWord('furdle', currentGuess);
      return;
    }

    // Hard mode validation
    if (prefs.hardMode && evaluations.length > 0) {
      for (const prevRow of evaluations) {
        for (let c = 0; c < COLS; c++) {
          if (prevRow[c].state === "correct" && guessLower[c] !== prevRow[c].letter) {
            HapticManager.furdle.invalidGuess();
            showMessageFn(`Position ${c + 1} must be ${prevRow[c].letter.toUpperCase()}`);
            return;
          }
        }
        for (let c = 0; c < COLS; c++) {
          if (prevRow[c].state === "present" && !guessLower.includes(prevRow[c].letter)) {
            HapticManager.furdle.invalidGuess();
            showMessageFn(`Must use ${prevRow[c].letter.toUpperCase()}`);
            return;
          }
        }
      }
    }

    const rowIndex = guesses.length;
    const evalRow = evaluateGuess(guessLower, solution.toLowerCase());

    setGuesses((prev) => [...prev, guessLower]);
    setEvaluations((prev) => [...prev, evalRow]);
    setCurrentGuess("");

    HapticManager.furdle.rowCommitted();
    revealRow(rowIndex);

    const didWin = evalRow.every((e) => e.state === "correct");
    const didLose = rowIndex === ROWS - 1 && !didWin;
    // Land the outcome pulse as the last tile finishes flipping (stagger 80ms
    // x 5 tiles + 260ms flip ≈ 580ms). Firing it immediately would both feel
    // early and be swallowed by the shared throttle, since rowCommitted just
    // fired in this same tick.
    if (didWin || didLose) {
      const outcome = didWin ? HapticManager.furdle.win : HapticManager.furdle.loss;
      setTimeout(outcome, 600);
    }

    if (didWin || didLose) {
      const elapsedSeconds =
        startTime != null ? Math.floor((Date.now() - startTime) / 1000) : null;

      // Compute the final board directly instead of relying on `guesses`/
      // `evaluations` state — this callback fires after a delay, and by
      // then a stale closure would still be missing the guess just made.
      const finalGuesses = [...guesses, guessLower];
      const finalEvaluations = [...evaluations, evalRow];

      const delayMs = 350 + COLS * 80;
      setTimeout(() => {
        endGame(didWin ? "won" : "lost", rowIndex + 1, elapsedSeconds, finalGuesses, finalEvaluations);
      }, delayMs);
    }
  }, [
    currentGuess,
    endGame,
    evaluations,
    gameMode,
    guesses.length,
    isDailyCompletedToday,
    prefs.hardMode,
    revealRow,
    screen,
    showMessageFn,
    solution,
    startTime,
    status,
  ]);

  const keyStates = useMemo(() => {
    const map: Record<string, LetterState> = {};
    for (const row of evaluations) {
      for (const cell of row) {
        const k = cell.letter.toUpperCase();
        map[k] = pickBetterState(map[k] ?? "empty", cell.state);
      }
    }
    return map;
  }, [evaluations]);

  // Daily used to force a loss the moment you backed out mid-game ("one
  // attempt per day, no dodging a bad run"). Changed per product decision:
  // Daily now autosaves in-progress guesses (see the effect above, and
  // hydration logic near the top of this component) and simply resumes
  // exactly where you left off — same day only, resets with tomorrow's
  // word. Leaving mid-game is no longer a punishable action, so there's
  // nothing to confirm; back just goes back.
  const handleGameBackPress = useCallback(() => {
    goToMenu("play");
  }, [goToMenu]);

  const gridShakeX = shakeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 10],
  });

  const statusScale = winBounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  const renderTile = (rowIndex: number, colIndex: number) => {
    const guess = guesses[rowIndex];
    const letter =
      guess?.[colIndex] ??
      (rowIndex === guesses.length ? currentGuess[colIndex] ?? "" : "");

    const hasEvaluation =
      !!(evaluations[rowIndex] && evaluations[rowIndex][colIndex]);

    const evaluatedState: LetterState = hasEvaluation
      ? evaluations[rowIndex][colIndex].state
      : "empty";

    const anim = flipAnims[rowIndex][colIndex];

    const frontRotateX = anim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: ["0deg", "90deg", "90deg"],
    });

    const backRotateX = anim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: ["-90deg", "-90deg", "0deg"],
    });

    const frontBg = letter ? CARD : "transparent";
    const frontBorder = BORDER;
    const frontText = TEXT;

    let backBg = CARD;
    let backBorder = BORDER;
    let backText = TEXT;

    if (hasEvaluation) {
      if (evaluatedState === "correct") {
        backBg = COLOR_CORRECT;
        backBorder = COLOR_CORRECT_BORDER;
        backText = "#f9fafb";
      } else if (evaluatedState === "present") {
        backBg = COLOR_PRESENT;
        backBorder = COLOR_PRESENT_BORDER;
        backText = COLOR_PRESENT_TEXT;
      } else if (evaluatedState === "absent") {
        backBg = "#9ca3af";
        backBorder = "#6b7280";
        backText = "#111827";
      }
    }

    return (
      <View
        key={`${rowIndex}-${colIndex}`}
        style={[
          styles.tileContainer,
          {
            width: TILE_SIZE,
            height: TILE_SIZE,
            marginHorizontal: TILE_GAP / 2,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.tileFace,
            {
              borderRadius: TILE_RADIUS,
              backgroundColor: frontBg,
              borderColor: frontBorder,
              transform: [{ perspective: 900 }, { rotateX: frontRotateX }],
            },
          ]}
        >
          <Text style={[styles.tileText, { color: frontText }]}>
            {letter ? letter.toUpperCase() : ""}
          </Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.tileFace,
            {
              borderRadius: TILE_RADIUS,
              backgroundColor: backBg,
              borderColor: backBorder,
              transform: [{ perspective: 900 }, { rotateX: backRotateX }],
            },
          ]}
        >
          <Text style={[styles.tileText, { color: backText }]}>
            {letter ? letter.toUpperCase() : ""}
          </Text>
        </Animated.View>
      </View>
    );
  };

  const renderKeyboardRow = (row: string[], rowIndex: number) => {
    const weights = row.map((k) => (k === "BACK" ? 1.6 : 1));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const availableWidth =
      SCREEN_WIDTH - KEYBOARD_HORIZONTAL_PADDING * 2 - KEY_GAP * (row.length - 1);

    const unit = availableWidth / totalWeight;

    // Default key bg — matches current page background
    const emptyBg = BG;
    const emptyBorder = IS_DARK ? "#4b5563" : "#d1d5db";
    const emptyText = IS_DARK ? "#f9fafb" : TEXT;

    return (
      <View key={`kb-row-${rowIndex}`} style={styles.keyRow}>
        {row.map((k, idx) => {
          const state = (keyStates[k.toUpperCase()] ?? "empty") as "empty" | "correct" | "present" | "absent";
          const width = unit * weights[idx];

          return (
            <WordleKey
              key={`${k}-${rowIndex}`}
              letter={k}
              keyState={state}
              skin={(prefs.keySkin as KeySkinName) ?? "default"}
              keyShape={prefs.keyShape ?? "square"}
              keyStyle={prefs.keyStyle ?? "filled"}
              width={width}
              marginHorizontal={KEY_GAP / 2}
              onPress={() => handleKeyPress(k)}
              defaultBg={emptyBg}
              defaultBorder={emptyBorder}
              defaultText={emptyText}
              correctBg={COLOR_CORRECT}
              correctBorder={COLOR_CORRECT_BORDER}
              presentBg={COLOR_PRESENT}
              presentBorder={COLOR_PRESENT_BORDER}
              presentText={COLOR_PRESENT_TEXT}
              absentBg="#9ca3af"
              absentBorder="#6b7280"
              defaultVariant={prefs.keyDefaultVariant ?? 1}
            />
          );
        })}
      </View>
    );
  };

  // ======= STATS + ACHIEVEMENTS (Menu -> Stats tab) =======
  const winRateDaily = useMemo(() => getWinRate(stats.daily), [stats.daily]);
  const winRatePractice = useMemo(
    () => getWinRate(stats.practice),
    [stats.practice]
  );

  const avgTimeDaily = useMemo(
    () => getAverageTimeSeconds(stats.daily),
    [stats.daily]
  );
  const avgTimePractice = useMemo(
    () => getAverageTimeSeconds(stats.practice),
    [stats.practice]
  );

  const avgGuessesDaily = useMemo(
    () => getAverageGuesses(stats.daily),
    [stats.daily]
  );
  const avgGuessesPractice = useMemo(
    () => getAverageGuesses(stats.practice),
    [stats.practice]
  );

  const lifetimeGames = stats.daily.gamesPlayed + stats.practice.gamesPlayed;
  const lifetimeWins = stats.daily.gamesWon + stats.practice.gamesWon;
  const lifetimeWinRate =
    lifetimeGames > 0 ? Math.round((lifetimeWins / lifetimeGames) * 100) : 0;
  const lifetimeTime = stats.daily.totalTimeSeconds + stats.practice.totalTimeSeconds;
  const lifetimeGuesses = stats.daily.totalGuesses + stats.practice.totalGuesses;
  const lifetimePerfect =
    (stats.daily.guessDistribution?.[1] ?? 0) +
    (stats.practice.guessDistribution?.[1] ?? 0);

  const achievements: Achievement[] = useMemo(() => {
    const dailyWins = stats.daily.gamesWon;
    const practiceWins = stats.practice.gamesWon;
    const totalWins = dailyWins + practiceWins;

    const bestStreak = stats.daily.bestStreak;
    const perfectWins = lifetimePerfect;

    const fastestAny =
      stats.daily.fastestTimeSeconds == null
        ? stats.practice.fastestTimeSeconds
        : stats.practice.fastestTimeSeconds == null
        ? stats.daily.fastestTimeSeconds
        : Math.min(stats.daily.fastestTimeSeconds, stats.practice.fastestTimeSeconds);

    const twoGuessWins =
      (stats.daily.guessDistribution?.[2] ?? 0) +
      (stats.practice.guessDistribution?.[2] ?? 0);

    return [
      // First wins
      { id: "first_win", category: "getting_started", name: "First Win", description: "Win your first game", unlocked: totalWins >= 1 },
      { id: "daily_win", category: "daily", name: "Daily Solver", description: "Win a Daily Challenge", unlocked: dailyWins >= 1 },
      { id: "practice_win", category: "practice", name: "Practice Pays", description: "Win a Quick Play game", unlocked: practiceWins >= 1 },
      // Guess skill
      { id: "perfect", category: "skill", name: "One & Done", description: "Solve in 1 guess", unlocked: perfectWins >= 1 },
      { id: "lucky_guess", category: "skill", name: "Lucky Guess", description: "Win in 2 guesses", unlocked: twoGuessWins >= 1 },
      { id: "two_try_5", category: "skill", name: "Two Tries", description: "Win in 2 guesses 5 times", unlocked: twoGuessWins >= 5, progress: Math.min(twoGuessWins / 5, 1) },
      { id: "clutch", category: "skill", name: "Clutch", description: "Win on the 6th guess", unlocked: ((stats.daily.guessDistribution?.[6] ?? 0) + (stats.practice.guessDistribution?.[6] ?? 0)) >= 1 },
      { id: "comeback", category: "skill", name: "Comeback", description: "Win after reaching guess 5", unlocked: ((stats.daily.guessDistribution?.[5] ?? 0) + (stats.practice.guessDistribution?.[5] ?? 0)) >= 1 },
      // Streaks
      { id: "streak_3", category: "streak", name: "On a Roll", description: "Reach a 3-day streak", unlocked: bestStreak >= 3, progress: Math.min(bestStreak / 3, 1) },
      { id: "streak_7", category: "streak", name: "Hot Streak", description: "Reach a 7-day streak", unlocked: bestStreak >= 7, progress: Math.min(bestStreak / 7, 1) },
      { id: "streak_14", category: "streak", name: "Spicy", description: "Reach a 14-day streak", unlocked: bestStreak >= 14, progress: Math.min(bestStreak / 14, 1) },
      { id: "streak_30", category: "streak", name: "Champion", description: "Reach a 30-day streak", unlocked: bestStreak >= 30, progress: Math.min(bestStreak / 30, 1) },
      // Speed
      { id: "speed_60", category: "speed", name: "Quick Thinker", description: "Win in under 60 seconds", unlocked: fastestAny != null && fastestAny <= 60 },
      { id: "speed_30", category: "speed", name: "Lightning", description: "Win in under 30 seconds", unlocked: fastestAny != null && fastestAny <= 30 },
      { id: "speed_20", category: "speed", name: "Speed Demon", description: "Win in under 20 seconds", unlocked: fastestAny != null && fastestAny <= 20 },
      // Consistency
      { id: "sharpshooter", category: "skill", name: "Sharpshooter", description: "80%+ win rate after 20+ dailies", unlocked: stats.daily.gamesPlayed >= 20 && winRateDaily >= 80 },
      { id: "hat_trick", category: "skill", name: "Hat Trick", description: "Win 3 practice games in a row", unlocked: practiceWins >= 3 },
      // Volume
      { id: "marathon", category: "games_played", name: "Marathon", description: "Complete 50 daily challenges", unlocked: stats.daily.gamesPlayed >= 50, progress: Math.min(stats.daily.gamesPlayed / 50, 1) },
      { id: "play_25", category: "games_played", name: "Word Worker", description: "Play 25 games", unlocked: lifetimeGames >= 25, progress: Math.min(lifetimeGames / 25, 1) },
      { id: "play_100", category: "games_played", name: "Century Club", description: "Play 100 games", unlocked: lifetimeGames >= 100, progress: Math.min(lifetimeGames / 100, 1) },
      { id: "wins_25", category: "winning", name: "Winner", description: "Win 25 games", unlocked: totalWins >= 25, progress: Math.min(totalWins / 25, 1) },
      { id: "wins_50", category: "winning", name: "Elite", description: "Win 50 games", unlocked: totalWins >= 50, progress: Math.min(totalWins / 50, 1) },
      { id: "perfectionist", category: "skill", name: "Perfectionist", description: "Win 10 games in 3 guesses or fewer", unlocked: ((stats.daily.guessDistribution?.[1]??0)+(stats.daily.guessDistribution?.[2]??0)+(stats.daily.guessDistribution?.[3]??0)+(stats.practice.guessDistribution?.[1]??0)+(stats.practice.guessDistribution?.[2]??0)+(stats.practice.guessDistribution?.[3]??0)) >= 10, progress: Math.min(((stats.daily.guessDistribution?.[1]??0)+(stats.daily.guessDistribution?.[2]??0)+(stats.daily.guessDistribution?.[3]??0)+(stats.practice.guessDistribution?.[1]??0)+(stats.practice.guessDistribution?.[2]??0)+(stats.practice.guessDistribution?.[3]??0)) / 10, 1) },
      { id: "comeback_king", category: "skill", name: "Comeback King", description: "Win on guess 4, 5, or 6 — five times", unlocked: ((stats.daily.guessDistribution?.[4]??0)+(stats.daily.guessDistribution?.[5]??0)+(stats.daily.guessDistribution?.[6]??0)+(stats.practice.guessDistribution?.[4]??0)+(stats.practice.guessDistribution?.[5]??0)+(stats.practice.guessDistribution?.[6]??0)) >= 5, progress: Math.min(((stats.daily.guessDistribution?.[4]??0)+(stats.daily.guessDistribution?.[5]??0)+(stats.daily.guessDistribution?.[6]??0)+(stats.practice.guessDistribution?.[4]??0)+(stats.practice.guessDistribution?.[5]??0)+(stats.practice.guessDistribution?.[6]??0)) / 5, 1) },
      { id: "early_bird", category: "special", name: "Early Bird", description: "Complete a daily challenge", unlocked: stats.daily.gamesPlayed >= 1 },
      // Key skin unlocks
      { id: "skin_bronze", category: "special", name: "Bronze Keys", description: "Reach a 3-day streak to unlock Bronze keys", unlocked: bestStreak >= 3, progress: Math.min(bestStreak / 3, 1) },
      { id: "skin_silver", category: "special", name: "Silver Keys", description: "Reach a 7-day streak to unlock Silver keys", unlocked: bestStreak >= 7, progress: Math.min(bestStreak / 7, 1) },
      { id: "skin_gold", category: "special", name: "Gold Keys", description: "Reach a 14-day streak to unlock Gold keys", unlocked: bestStreak >= 14, progress: Math.min(bestStreak / 14, 1) },
      { id: "skin_platinum", category: "special", name: "Platinum Keys", description: "Reach a 21-day streak to unlock Platinum keys", unlocked: bestStreak >= 21, progress: Math.min(bestStreak / 21, 1) },
      { id: "skin_ruby", category: "special", name: "Ruby Keys", description: "Reach a 30-day streak to unlock Ruby keys", unlocked: bestStreak >= 30, progress: Math.min(bestStreak / 30, 1) },
      { id: "skin_emerald", category: "special", name: "Emerald Keys", description: "Reach a 50-day streak to unlock Emerald keys", unlocked: bestStreak >= 50, progress: Math.min(bestStreak / 50, 1) },
      { id: "skin_diamond", category: "special", name: "Diamond Keys", description: "Reach a 75-day streak to unlock Diamond keys", unlocked: bestStreak >= 75, progress: Math.min(bestStreak / 75, 1) },
      { id: "skin_legendary", category: "special", name: "Legendary Keys", description: "Reach a 100-day streak to unlock Legendary keys", unlocked: bestStreak >= 100, progress: Math.min(bestStreak / 100, 1) },
      { id: "skin_iridescence", category: "special", name: "Iridescence Keys", description: "Reach a 150-day streak to unlock Iridescence keys", unlocked: bestStreak >= 150, progress: Math.min(bestStreak / 150, 1) },
      { id: "skin_rose_quartz", category: "special", name: "Rose Quartz Keys", description: "Reach a 300-day streak to unlock Rose Quartz keys", unlocked: bestStreak >= 300, progress: Math.min(bestStreak / 300, 1) },
    ];
  }, [lifetimeGames, lifetimePerfect, stats.daily, stats.practice, winRateDaily]);

  // Capture baseline unlocked IDs once hydrated so we don't fire old achievements.
  // Must come after the `achievements` useMemo above — these depend on it, and
  // referencing a const before its declaration in the same scope is a real
  // temporal-dead-zone bug, not just a lint nitpick (it silently broke the
  // dependency array comparison, so unlock popups never fired after the first
  // load). See feedback memory / git history for context if this moves again.
  useEffect(() => {
    if (hydrated && sessionStartUnlockedRef.current === null) {
      sessionStartUnlockedRef.current = new Set(
        achievements.filter((a) => a.unlocked).map((a) => a.id)
      );
    }
  }, [hydrated, achievements]);

  // Detect newly unlocked achievements and queue popups
  useEffect(() => {
    if (!hydrated || sessionStartUnlockedRef.current === null) return;
    const newlyUnlocked = achievements.filter(
      (a) => a.unlocked && !sessionStartUnlockedRef.current!.has(a.id)
    );
    if (newlyUnlocked.length > 0) {
      newlyUnlocked.forEach((a) => sessionStartUnlockedRef.current!.add(a.id));
      setPendingAchievements((prev) => [...prev, ...newlyUnlocked]);
    }
  }, [achievements, hydrated]);

  // ======= PLAY MENU helpers =======
  const dailySummaryText = useMemo(() => {
    if (!isDailyCompletedToday || !dailyLock) return null;
    const resultText = dailyLock.result === "won" ? "Won" : "Lost";
    const guessesText =
      typeof dailyLock.guessesCount === "number" && dailyLock.guessesCount > 0
        ? `${dailyLock.guessesCount} guess${dailyLock.guessesCount === 1 ? "" : "es"}`
        : null;
    const timeText =
      typeof dailyLock.timeSeconds === "number"
        ? formatSeconds(dailyLock.timeSeconds)
        : null;

    if (guessesText && timeText) return `${resultText} • ${guessesText} • ${timeText}`;
    if (guessesText) return `${resultText} • ${guessesText}`;
    return resultText;
  }, [dailyLock, isDailyCompletedToday]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: BG }]}>
      <AchievementPopup
        achievement={currentPopupAchievement as any}
        onDismiss={() => setCurrentPopupAchievement(null)}
        backgroundColor={CARD}
        textColor={TEXT}
      />
      <View style={[styles.container, { backgroundColor: BG }]}>
        {/* MENU (Play / Stats) */}
        {screen === "menu" ? (
          <>
            <FallingLetters />
            {/* Header (matches other games) */}
            <View style={styles.appHeader}>
              <Pressable style={styles.backToGamesButton} onPress={backToGames} hitSlop={8}>
                <Text style={[styles.backToGamesText, { color: SUBTEXT }]} numberOfLines={1}>← Games</Text>
              </Pressable>

              <Text style={[styles.appTitle, { color: TEXT }]}>Furdle</Text>

              {/* Spacer keeps title centered */}
              <View style={styles.headerSpacer} />
            </View>

            {/* Segment pill slider */}
            <View style={styles.segmentWrapper}>
              <View style={[styles.segmentSwitcher, { backgroundColor: CARD }]}>
                {([
                  { key: "play" as const, label: "Play" },
                  { key: "customize" as const, label: "Customize" },
                  { key: "stats" as const, label: "Stats" },
                ] as const).map(({ key, label }) => {
                  const isActive = key === menuTab;
                  return (
                    <Pressable
                      key={key}
                      style={[styles.segmentButton, isActive && { backgroundColor: BG }]}
                      onPress={() => handleTabPress(key)}
                    >
                      <Text
                        style={[
                          styles.segmentButtonText,
                          { color: SUBTEXT },
                          isActive && { color: TEXT, fontWeight: "600" },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Content — animated horizontal tab strip */}
            <View style={styles.tabStripWrapper} {...menuPanResponder.panHandlers}>
            <Animated.View
              style={[
                styles.tabStrip,
                { transform: [{ translateX: tabAnim.interpolate({
                  inputRange: [0, 1, 2],
                  outputRange: [0, -SCREEN_WIDTH, -SCREEN_WIDTH * 2],
                }) }] }
              ]}
            >
            <ScrollView
                style={[styles.menuScroll, { width: SCREEN_WIDTH }]}
                contentContainerStyle={styles.menuScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Daily Challenge Card — Word Builder style */}
                <View style={[
                  styles.wbDailyCard,
                  { backgroundColor: CARD, borderColor: isDailyCompletedToday ? "#4ecca3" : BORDER },
                ]}>
                  <Text style={[styles.wbDailyTitle, { color: TEXT }]}>Daily Challenge</Text>
                  <Text style={[styles.wbDailySubtitle, { color: SUBTEXT }]}>
                    {(() => { const d = new Date(); return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); })()}
                  </Text>

                  {/* Completed result info */}
                  {isDailyCompletedToday && dailyLock && (
                    <View style={styles.wbDailyCompletedInfo}>
                      <Text style={styles.wbDailyCompletedScore}>
                        {dailyLock.result === "won" ? `${dailyLock.guessesCount}/6` : "X/6"}
                      </Text>
                      <Text style={[styles.wbDailyCompletedLabel, { color: SUBTEXT }]}>
                        {dailyLock.result === "won" ? "Solved" : "Better luck tomorrow"}
                        {dailyLock.timeSeconds != null ? ` • ${formatSeconds(dailyLock.timeSeconds)}` : ""}
                      </Text>
                    </View>
                  )}

                  {/* Streak pills */}
                  <View style={styles.wbStatPillRow}>
                    <View style={[styles.wbStatPill, styles.wbStatPillHighlight]}>
                      <Text style={[styles.wbStatPillLabel, { color: SUBTEXT }]}>Current streak</Text>
                      <View style={styles.wbStatPillValueRow}>
                        <Flame size={18} color="#e85d04" />
                        <Text style={[styles.wbStatPillValue, { color: TEXT }]}>{stats.daily.currentStreak}</Text>
                      </View>
                    </View>
                    <View style={[styles.wbStatPill, { backgroundColor: "#f3e7d7" }]}>
                      <Text style={[styles.wbStatPillLabel, { color: SUBTEXT }]}>Best streak</Text>
                      <View style={styles.wbStatPillValueRow}>
                        <Trophy size={18} color="#d4a017" />
                        <Text style={[styles.wbStatPillValue, { color: TEXT }]}>{stats.daily.bestStreak}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Play button */}
                  {!isDailyCompletedToday && (
                    <Pressable
                      onPress={() => startGame("daily")}
                      style={({ pressed }) => [
                        styles.wbDailyButton,
                        { borderColor: BORDER, backgroundColor: BG, opacity: pressed ? 0.75 : 1 },
                      ]}
                    >
                      <Text style={[styles.wbDailyButtonText, { color: TEXT }]}>
                        {dailyInProgressToday ? "Continue Today's Challenge" : "Play Today's Challenge"}
                      </Text>
                    </Pressable>
                  )}

                  {/* View Results + Share row */}
                  {isDailyCompletedToday && (
                    <View style={styles.wbDailyActionRow}>
                      <Pressable
                        onPress={openDailyResultFromMenu}
                        style={({ pressed }) => [
                          styles.wbDailyActionButton,
                          { borderColor: BORDER, backgroundColor: BG, borderWidth: 1.5, opacity: pressed ? 0.75 : 1 },
                        ]}
                      >
                        <Text style={[styles.wbDailyActionText, { color: TEXT }]}>View Results</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          // Fallback only matters for a daily lock saved before
                          // shareText existed — rebuilds the same creative
                          // format (emoji grid if we have it, stats, streak).
                          const fallbackGrid = Array.isArray((dailyLock as any)?.evaluations)
                            ? ((dailyLock as any).evaluations as EvaluatedLetter[][])
                                .map((row) => row.map((cell) =>
                                  cell.state === "correct" ? "🟩" : cell.state === "present" ? "🟨" : "⬜"
                                ).join(""))
                                .join("\n")
                            : "";
                          const fallbackResultStr = dailyLock?.result === "won" ? `${dailyLock.guessesCount}/6` : "X/6";
                          const fallbackStatsLine = `${fallbackResultStr}${dailyLock?.timeSeconds != null ? ` · ${formatSeconds(dailyLock.timeSeconds)}` : ""}`;
                          const fallbackStreakLine = stats.daily.currentStreak > 1 ? `${stats.daily.currentStreak} day streak` : "";
                          // Built imperatively so the blank-line spacers
                          // survive — see the same fix in endGame() above.
                          const fallbackLines: string[] = [`🟩 FURDLE DAILY #${getDailyIndex()}`];
                          if (fallbackGrid) fallbackLines.push(fallbackGrid);
                          fallbackLines.push("", fallbackStatsLine);
                          if (fallbackStreakLine) fallbackLines.push(fallbackStreakLine);
                          fallbackLines.push("", "wordfury.app");
                          const text = dailyLock?.shareText ?? fallbackLines.join("\n");
                          Share.share({ message: text });
                        }}
                        style={({ pressed }) => [
                          styles.wbDailyShareIconButton,
                          { borderColor: BORDER, backgroundColor: BG, borderWidth: 1.5, opacity: pressed ? 0.75 : 1 },
                        ]}
                      >
                        <Share2 size={18} color={TEXT} />
                      </Pressable>
                    </View>
                  )}

                  {/* Countdown */}
                  {isDailyCompletedToday && nextDailySeconds != null && (
                    <View style={[styles.wbDailyCountdown, { borderTopColor: BORDER }]}>
                      <Text style={[styles.wbDailyCountdownLabel, { color: SUBTEXT }]}>Next challenge in</Text>
                      <Text style={[styles.wbDailyCountdownTime, { color: TEXT }]}>{formatCountdown(nextDailySeconds)}</Text>
                    </View>
                  )}
                </View>

                {/* Play */}
                <Pressable
                  onPress={() => startGame("practice")}
                  style={({ pressed }) => [
                    styles.modeCard,
                    { backgroundColor: CARD, borderColor: BORDER, opacity: pressed ? 0.75 : 1, marginTop: 18 },
                  ]}
                >
                  <Text style={[styles.modeCardTitle, { color: TEXT }]}>Quick Play</Text>
                  <Text style={[styles.modeCardSubtitle, { color: SUBTEXT }]}>
                    A fresh 5-letter word whenever you want.
                  </Text>
                </Pressable>

                {/* Settings toggles */}
                <Text style={[styles.sectionTitle,{color:TEXT,marginTop:24}]}>Settings</Text>
                <View style={[styles.toggleCard,{backgroundColor:CARD,borderColor:BORDER}]}>
                  <Pressable onPress={()=>togglePref("hardMode")} style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Text style={[styles.toggleLabel,{color:TEXT}]}>Hard Mode</Text>
                      <Text style={[styles.toggleSub,{color:SUBTEXT}]}>Revealed letters must be used in future guesses</Text>
                      <Text style={[styles.toggleSub,{color:SUBTEXT}]}>(Only applies to Quick Play)</Text>
                    </View>
                    <View style={[styles.toggleTrack,{backgroundColor:prefs.hardMode?COLOR_CORRECT:BORDER}]}>
                      <View style={[styles.toggleThumb,{left:prefs.hardMode?18:2}]}/>
                    </View>
                  </Pressable>
                </View>

                {/* How to Play */}
                <Text style={[styles.sectionTitle, { color: TEXT, marginTop: 24 }]}>How to Play</Text>
                <View style={[styles.rulesCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                  {[
                    'Guess the hidden 5-letter word in 6 tries',
                    'Green = correct letter in the correct spot',
                    'Yellow = correct letter in the wrong spot',
                    'Gray = letter not in the word',
                    'A new word is available every day',
                  ].map((rule, i) => (
                    <View key={i} style={styles.ruleItem}>
                      <Text style={[styles.ruleNumber, { color: COLOR_CORRECT }]}>{i + 1}</Text>
                      <Text style={[styles.ruleText, { color: SUBTEXT }]}>{rule}</Text>
                    </View>
                  ))}
                </View>

                <View style={{ height: 40 }} />
              </ScrollView>

              {/* ── CUSTOMIZE TAB ── */}
              <ScrollView
                style={[styles.statsContainer, { width: SCREEN_WIDTH }]}
                contentContainerStyle={styles.statsContent}
                showsVerticalScrollIndicator={false}
              >
                {/* ── BIG LIVE PREVIEW KEY ── */}
                {(() => {
                  const activeSkin = (prefs.keySkin ?? 'default') as KeySkinName;
                  const skinCfg = KEY_SKINS[activeSkin];
                  const isGem = skinCfg.isGem && (GEM_PREVIEW_IMAGES as any)[activeSkin];
                  const isMetal = !skinCfg.isGem && skinCfg.gradient !== null;
                  const isOutline = false;
                  const isRounded = (prefs.keyShape ?? 'square') === 'rounded';
                  const br = isRounded ? 28 : 8;
                  const variantStyle = DEFAULT_STYLES[prefs.keyDefaultVariant ?? 1] ?? DEFAULT_STYLES[1];

                  let bg = BG;
                  let border = BORDER;
                  let letterColor = TEXT;

                  if (activeSkin === 'classic') {
                    bg = variantStyle.background; border = variantStyle.border; letterColor = variantStyle.text;
                  } else if (isMetal && skinCfg.gradient) {
                    border = skinCfg.border; letterColor = skinCfg.letterColor;
                  } else if (isGem) {
                    border = 'transparent'; letterColor = skinCfg.letterColor;
                  }

                  if (isOutline) { bg = '#ffffff'; }

                  return (
                    <View style={[styles.bigPreviewContainer, { borderBottomColor: BORDER }]}>
                      <View style={[styles.bigPreviewKey, { borderRadius: br, borderColor: border, borderWidth: isOutline ? 2 : 1.5, overflow: 'hidden' }]}>
                        {isMetal && !isOutline && skinCfg.gradient ? (
                          <LinearGradient
                            colors={skinCfg.gradient as unknown as [string, string, ...string[]]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                          />
                        ) : isGem && !isOutline ? (
                          <ImageBackground
                            source={(GEM_PREVIEW_IMAGES as any)[activeSkin]}
                            style={StyleSheet.absoluteFill}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={[StyleSheet.absoluteFill, { backgroundColor: bg }]} />
                        )}
                        <Text style={[styles.bigPreviewLetter, { color: letterColor }]}>A</Text>
                      </View>
                      <Text style={[styles.bigPreviewLabel, { color: SUBTEXT }]}>
                        {skinCfg.displayName}{activeSkin === 'classic' ? ` · Style ${prefs.keyDefaultVariant ?? 1}` : ''} · {isRounded ? 'Pill' : 'Square'} · {isOutline ? 'Outline' : 'Filled'}
                      </Text>
                    </View>
                  );
                })()}

                {/* ── KEY SHAPE toggle ── */}
                <View style={[styles.toggleCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                  <View style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Text style={[styles.toggleLabel, { color: TEXT }]}>Key Shape</Text>
                      <Text style={[styles.toggleSub, { color: SUBTEXT }]}>
                        {(prefs.keyShape ?? 'square') === 'rounded' ? 'Rounded pill shape' : 'Standard square shape'}
                      </Text>
                    </View>
                    <Switch
                      value={(prefs.keyShape ?? 'square') === 'rounded'}
                      onValueChange={(val) => {
                        const updated = { ...prefs, keyShape: val ? 'rounded' : 'square' } as typeof prefs;
                        setPrefs(updated);
                        saveWordlePrefs(updated);
                      }}
                      trackColor={{ false: '#d1d5db', true: COLOR_CORRECT }}
                      thumbColor="#ffffff"
                    />
                  </View>
                </View>

                {/* ── KEY SKIN ── */}

                {/* Streak header — exact WB pattern */}
                <View style={[styles.skinScoreContainer, { borderBottomColor: BORDER }]}>
                  <Text style={[styles.skinScoreLabel, { color: SUBTEXT }]}>Best Daily Streak</Text>
                  <Text style={styles.skinScoreValue}>{stats.daily.bestStreak} days</Text>
                </View>
                <Text style={[styles.skinSectionTitle, { color: SUBTEXT }]}>
                  Unlock key skins by reaching daily streak milestones
                </Text>

                {/* Vertical tier list */}
                <View style={styles.skinList}>
                  {KEY_SKIN_ORDER.map((skinName) => {
                    const skinCfg = KEY_SKINS[skinName];
                    const unlocked = isKeySkinUnlocked(skinName, stats.daily.bestStreak);
                    const active = (prefs.keySkin ?? 'default') === skinName;
                    const isGem = skinCfg.isGem;
                    const isMetal = !isGem && skinCfg.gradient !== null;
                    const keyBorderRadius = (prefs.keyShape ?? 'square') === 'rounded' ? 14 : 4;

                    return (
                      <Pressable
                        key={skinName}
                        onPress={() => {
                          if (!unlocked) return;
                          if (skinName === 'classic') {
                            setPopupVariant(prefs.keyDefaultVariant ?? 1);
                            setSelectedSkinForPopup('classic');
                            return;
                          }
                          const updated = { ...prefs, keySkin: skinName };
                          setPrefs(updated);
                          saveWordlePrefs(updated);
                        }}
                        style={[
                          styles.skinRow,
                          {
                            backgroundColor: CARD,
                            borderColor: active ? COLOR_CORRECT : BORDER,
                            borderWidth: active ? 2 : 1,
                            },
                        ]}
                      >
                        {/* Preview key — left (60px like WB tile) */}
                        <View style={[
                          styles.skinPreviewKey,
                          {
                            borderRadius: keyBorderRadius,
                            borderColor: isMetal ? skinCfg.border : isGem ? 'transparent' : skinName === 'classic' ? (DEFAULT_STYLES[prefs.keyDefaultVariant ?? 1] ?? DEFAULT_STYLES[1]).border : BORDER,
                            overflow: 'hidden',
                            opacity: unlocked ? 1 : 0.5,
                          },
                        ]}>
                          {isMetal && skinCfg.gradient ? (
                            <LinearGradient
                              colors={skinCfg.gradient as unknown as [string, string, ...string[]]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={StyleSheet.absoluteFill}
                            />
                          ) : isGem && (GEM_PREVIEW_IMAGES as any)[skinName] ? (
                            <ImageBackground
                              source={(GEM_PREVIEW_IMAGES as any)[skinName]}
                              style={StyleSheet.absoluteFill}
                              resizeMode="cover"
                            />
                          ) : skinName === 'classic' ? (
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: (DEFAULT_STYLES[prefs.keyDefaultVariant ?? 1] ?? DEFAULT_STYLES[1]).background }]} />
                          ) : (
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: BG }]} />
                          )}
                          <Text style={[styles.skinPreviewLetter, { color: isMetal ? skinCfg.letterColor : isGem ? skinCfg.letterColor : skinName === 'classic' ? (DEFAULT_STYLES[prefs.keyDefaultVariant ?? 1] ?? DEFAULT_STYLES[1]).text : TEXT }]}>A</Text>
                        </View>

                        {/* Middle — name + unlocked status + equipped pill (WB pattern) */}
                        <View style={styles.skinRowInfo}>
                          <Text style={[styles.skinRowName, { color: unlocked ? TEXT : SUBTEXT }]}>{skinCfg.displayName}</Text>
                          <Text style={[styles.skinRowStatus, { color: unlocked ? COLOR_CORRECT : SUBTEXT }]}>
                            {unlocked ? 'Unlocked' : 'Locked'}
                          </Text>
                          {active && (
                            <View style={[styles.skinEquippedBadge, { backgroundColor: COLOR_CORRECT }]}>
                              <Text style={styles.skinEquippedText}>Equipped</Text>
                            </View>
                          )}
                        </View>

                        {/* Right — streak req for locked tiers */}
                        {!unlocked && (
                          <View style={styles.skinLockBadge}>
                            <Text style={[styles.skinLockText, { color: SUBTEXT }]}>{skinCfg.streakRequired} days</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                <View style={{ height: 40 }} />
              </ScrollView>

            <ScrollView
                style={[styles.statsContainer, { width: SCREEN_WIDTH }]}
                contentContainerStyle={styles.statsContent}
                showsVerticalScrollIndicator={false}
              >
                {/* ── DAILY CHALLENGE (primary) ── */}
                <Text style={[styles.sectionTitle, { color: TEXT }]}>Daily Challenge</Text>

                {/* Streak highlight row */}
                <View style={styles.streakRow}>
                  <View style={[styles.streakBox, { backgroundColor: CARD, borderColor: BORDER }]}>
                    <Text style={[styles.streakNum, { color: TEXT }]}>{stats.daily.currentStreak}</Text>
                    <Text style={[styles.streakLbl, { color: SUBTEXT }]}>Current Streak</Text>
                  </View>
                  <View style={[styles.streakBox, { backgroundColor: CARD, borderColor: BORDER }]}>
                    <Text style={[styles.streakNum, { color: TEXT }]}>{stats.daily.bestStreak}</Text>
                    <Text style={[styles.streakLbl, { color: SUBTEXT }]}>Best Streak</Text>
                  </View>
                  <View style={[styles.streakBox, { backgroundColor: CARD, borderColor: BORDER }]}>
                    <Text style={[styles.streakNum, { color: "#22c55e" }]}>{winRateDaily}%</Text>
                    <Text style={[styles.streakLbl, { color: SUBTEXT }]}>Win Rate</Text>
                  </View>
                </View>

                {/* Played / Won / Lost row */}
                <View style={styles.statsGrid}>
                  <StatsCard label="Games Played" value={`${stats.daily.gamesPlayed}`} textColor={TEXT} secondaryText={SUBTEXT} cardColor={CARD} borderColor={BORDER} />
                  <StatsCard label="Won" value={`${stats.daily.gamesWon}`} textColor={TEXT} secondaryText={SUBTEXT} cardColor={CARD} borderColor={BORDER} />
                  <StatsCard label="Lost" value={`${stats.daily.gamesPlayed - stats.daily.gamesWon}`} textColor={TEXT} secondaryText={SUBTEXT} cardColor={CARD} borderColor={BORDER} />
                  <StatsCard label="Avg Guesses" value={avgGuessesDaily != null ? avgGuessesDaily.toFixed(1) : "--"} textColor={TEXT} secondaryText={SUBTEXT} cardColor={CARD} borderColor={BORDER} />
                  <StatsCard label="Avg Time" value={avgTimeDaily != null ? formatSeconds(avgTimeDaily) : "--"} textColor={TEXT} secondaryText={SUBTEXT} cardColor={CARD} borderColor={BORDER} />
                  <StatsCard label="Fastest" value={stats.daily.fastestTimeSeconds != null ? formatSeconds(stats.daily.fastestTimeSeconds) : "--"} textColor={TEXT} secondaryText={SUBTEXT} cardColor={CARD} borderColor={BORDER} />
                  <StatsCard label="Best Solve" value={stats.daily.bestGuessCount != null ? `${stats.daily.bestGuessCount} guess${stats.daily.bestGuessCount===1?"":"es"}` : "--"} textColor={TEXT} secondaryText={SUBTEXT} cardColor={CARD} borderColor={BORDER} />
                  <StatsCard label="Letters Typed" value={`${(stats.daily.totalLettersTyped+stats.practice.totalLettersTyped).toLocaleString()}`} textColor={TEXT} secondaryText={SUBTEXT} cardColor={CARD} borderColor={BORDER} />
                </View>

                {/* Monthly history calendar */}
                <Text style={[styles.sectionTitle, { color: TEXT, marginBottom: 8 }]}>Daily History</Text>
                <DailyCalendar
                  history={Object.fromEntries(Object.entries(stats.dailyHistory ?? {}).map(([iso, r]) => [iso, { result: r as 'won' | 'lost' }]))}
                  accentColor={COLOR_CORRECT}
                  textColor={TEXT}
                  secondaryTextColor={SUBTEXT}
                  cardColor={CARD}
                  borderColor={BORDER}
                />

                {/* Guess distribution chart */}
                <GuessDistChart
                  distribution={stats.daily.guessDistribution}
                  totalWins={stats.daily.gamesWon}
                  textColor={TEXT}
                  secondaryText={SUBTEXT}
                  cardColor={CARD}
                  borderColor={BORDER}
                />

                {/* ── QUICK PLAY (secondary) ── */}
                <Text style={[styles.sectionTitle, { color: TEXT, marginTop: 28 }]}>Quick Play</Text>
                <View style={styles.statsGrid}>
                  <StatsCard label="Games Played" value={`${stats.practice.gamesPlayed}`} textColor={TEXT} secondaryText={SUBTEXT} cardColor={CARD} borderColor={BORDER} />
                  <StatsCard label="Won" value={`${stats.practice.gamesWon} (${winRatePractice}%)`} textColor={TEXT} secondaryText={SUBTEXT} cardColor={CARD} borderColor={BORDER} />
                  <StatsCard label="Lost" value={`${stats.practice.gamesPlayed - stats.practice.gamesWon}`} textColor={TEXT} secondaryText={SUBTEXT} cardColor={CARD} borderColor={BORDER} />
                  <StatsCard label="Avg Guesses" value={avgGuessesPractice != null ? avgGuessesPractice.toFixed(1) : "--"} textColor={TEXT} secondaryText={SUBTEXT} cardColor={CARD} borderColor={BORDER} />
                  <StatsCard label="Avg Time" value={avgTimePractice != null ? formatSeconds(avgTimePractice) : "--"} textColor={TEXT} secondaryText={SUBTEXT} cardColor={CARD} borderColor={BORDER} />
                  <StatsCard label="Fastest" value={stats.practice.fastestTimeSeconds != null ? formatSeconds(stats.practice.fastestTimeSeconds) : "--"} textColor={TEXT} secondaryText={SUBTEXT} cardColor={CARD} borderColor={BORDER} />
                </View>

                {/* ── ACHIEVEMENTS ── */}
                <Text style={[styles.sectionTitle, { color: TEXT, marginTop: 28 }]}>
                  Achievements ({achievements.filter(a => a.unlocked).length}/{achievements.length})
                </Text>

                {/* Unlocked */}
                {achievements.filter(a => a.unlocked).length > 0 && (
                  <View style={styles.achievementsGrid}>
                    {achievements.filter(a => a.unlocked).map((a) => (
                      <AchievementCard key={a.id} achievement={a} textColor={TEXT} secondaryText={SUBTEXT} cardColor={CARD} borderColor={BORDER} />
                    ))}
                  </View>
                )}

                {/* Divider */}
                {achievements.filter(a => a.unlocked).length > 0 && achievements.filter(a => !a.unlocked).length > 0 && (
                  <View style={styles.lockedDivider}>
                    <View style={[styles.dividerLine, { backgroundColor: BORDER }]} />
                    <Text style={[styles.dividerText, { color: SUBTEXT }]}>Locked</Text>
                    <View style={[styles.dividerLine, { backgroundColor: BORDER }]} />
                  </View>
                )}

                {/* Locked */}
                {achievements.filter(a => !a.unlocked).length > 0 && (
                  <View style={styles.achievementsGrid}>
                    {achievements.filter(a => !a.unlocked).map((a) => (
                      <AchievementCard key={a.id} achievement={a} textColor={TEXT} secondaryText={SUBTEXT} cardColor={CARD} borderColor={BORDER} />
                    ))}
                  </View>
                )}

                <View style={{ height: 40 }} />
              </ScrollView>

            </Animated.View>
            </View>
          </>
        ) : (
          // GAME SCREEN
          <>
            <View style={styles.gameTopArea}>
              <View style={styles.gameHeader}>
                <Pressable onPress={handleGameBackPress} hitSlop={8}>
                  <Text style={[styles.gameBackText, { color: SUBTEXT }]}>← Back</Text>
                </Pressable>
                <Text style={[styles.modeTitle, { color: SUBTEXT }]}>
                  {gameMode === "daily" ? "Daily Challenge" : "Quick Play"}
                </Text>
                <View style={styles.gameHeaderSpacer} />
              </View>

              <View style={styles.messageBar}>
                {message ? (
                  <View style={[styles.messagePill, { borderColor: BORDER, backgroundColor: CARD }]}>
                    <Text style={[styles.messageText, { color: TEXT }]}>{message}</Text>
                  </View>
                ) : (
                  <View style={{ height: 30 }} />
                )}
              </View>

              <Animated.View style={[styles.grid, { transform: [{ translateX: gridShakeX }] }]}>
                {Array.from({ length: ROWS }).map((_, rowIndex) => (
                  <View key={`row-${rowIndex}`} style={styles.row}>
                    {Array.from({ length: COLS }).map((__, colIndex) => renderTile(rowIndex, colIndex))}
                  </View>
                ))}
              </Animated.View>

              <View style={styles.statusArea}>
                {status !== "playing" ? (
                  <Animated.Text style={[styles.statusText, { color: SUBTEXT, transform: [{ scale: statusScale }] }]}>
                    {status === "won"
                      ? `You solved it in ${guesses.length} guess${guesses.length === 1 ? "" : "es"}.`
                      : "Out of guesses."}
                  </Animated.Text>
                ) : (
                  <View style={{ height: 20 }} />
                )}
              </View>
            </View>

            <View style={styles.bottomControls}>
              <View style={styles.keyboard}>
                {KEYBOARD_ROWS.map((row, rowIndex) => renderKeyboardRow(row, rowIndex))}
              </View>

              <Pressable
                onPress={submitGuess}
                style={({ pressed }) => [
                  styles.enterButton,
                  { borderColor: BORDER, backgroundColor: CARD, opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <Text style={[styles.enterText, { color: TEXT }]}>ENTER</Text>
              </Pressable>
            </View>
          </>
        )}

        <WordleResultOverlay
          visible={showResult}
          mode={overlayMode}
          status={overlayStatus}
          solutionWord={overlaySolutionWord}
          guessesCount={overlayGuessesCount}
          timeSeconds={overlayTimeSeconds}
          currentStreak={overlayMode === "daily" ? stats.daily.currentStreak : null}
          bestStreak={overlayMode === "daily" ? stats.daily.bestStreak : null}
          winPercentage={overlayMode === "daily" ? winRateDaily : winRatePractice}
          gamesPlayed={overlayMode === "daily" ? stats.daily.gamesPlayed : stats.practice.gamesPlayed}
          bestGuessCount={overlayMode === "daily" ? stats.daily.bestGuessCount : stats.practice.bestGuessCount}
          guessDistribution={overlayMode === "daily" ? stats.daily.guessDistribution : stats.practice.guessDistribution}
          averageTimeSeconds={overlayMode === "daily" ? (avgTimeDaily ?? null) : (avgTimePractice ?? null)}
          averageGuesses={overlayMode === "daily" ? (avgGuessesDaily ?? null) : (avgGuessesPractice ?? null)}
          onClose={() => {
            // Closing just dismisses the overlay so the player can look at
            // their completed puzzle instead of being bounced to the menu.
            closeResult();
          }}
          onPlayAgain={() => {
            if (overlayMode === "practice") {
              resetGameState("practice");
              closeResult();
              setScreen("game");
            }
          }}
          onGoHome={() => {
            closeResult();
            goToMenu("play");
          }}
          onGoPractice={() => {
            closeResult();
            startGame("practice");
          }}
          nextDailySecondsRemaining={overlayMode === "daily" && isDailyCompletedToday ? nextDailySeconds : null}
          shareText={overlayShareText}
          evaluationRows={overlayEvaluationRows}
          achievement={currentPopupAchievement as any}
          onDismissAchievement={() => setCurrentPopupAchievement(null)}
        />
      </View>

      {/* ── DEFAULT VARIANT SELECTOR POPUP (mirrors Word Builder exactly) ── */}
      {selectedSkinForPopup === 'classic' && (
        <View style={styles.overlayContainer}>
          <Pressable style={styles.overlayBackdrop} onPress={() => setSelectedSkinForPopup(null)} />
          <View style={[styles.variantSelector, { backgroundColor: CARD }]}>
            {/* Header */}
            <View style={styles.variantHeader}>
              <Text style={[styles.variantTitle, { color: TEXT }]}>Classic</Text>
              <Pressable style={[styles.closeButton, { backgroundColor: IS_DARK ? '#374151' : '#f5f0f0' }]} onPress={() => setSelectedSkinForPopup(null)}>
                <Text style={[styles.closeButtonText, { color: SUBTEXT }]}>✕</Text>
              </Pressable>
            </View>

            {/* Content row: large preview left */}
            <View style={[styles.variantContent, { borderBottomColor: BORDER }]}>
              <View style={styles.previewSection}>
                <View style={[
                  styles.variantPreviewKey,
                  {
                    backgroundColor: (DEFAULT_STYLES[popupVariant] ?? DEFAULT_STYLES[1]).background,
                    borderColor: (DEFAULT_STYLES[popupVariant] ?? DEFAULT_STYLES[1]).border,
                    borderRadius: (prefs.keyShape ?? 'square') === 'rounded' ? 22 : 6,
                  },
                ]}>
                  <Text style={[styles.variantPreviewLetter, { color: (DEFAULT_STYLES[popupVariant] ?? DEFAULT_STYLES[1]).text }]}>A</Text>
                </View>
              </View>
            </View>

            {/* Select label */}
            <Text style={[styles.selectLabel, { color: SUBTEXT }]}>Select Style</Text>

            {/* 6 variant cards */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.variantList}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((v) => {
                const vs = DEFAULT_STYLES[v];
                const isSelected = popupVariant === v;
                const isEquipped = (prefs.keyDefaultVariant ?? 1) === v && prefs.keySkin === 'classic';
                return (
                  <Pressable
                    key={v}
                    style={[
                      styles.variantCard,
                      { backgroundColor: IS_DARK ? '#1f2937' : '#f5f0f0' },
                      isSelected && styles.variantCardSelected,
                      isEquipped && { backgroundColor: COLOR_CORRECT + '22' },
                    ]}
                    onPress={() => setPopupVariant(v)}
                  >
                    <View style={[
                      styles.variantCardKey,
                      {
                        backgroundColor: vs.background,
                        borderColor: vs.border,
                        borderRadius: (prefs.keyShape ?? 'square') === 'rounded' ? 14 : 4,
                      },
                    ]}>
                      <Text style={[styles.variantCardLetter, { color: vs.text }]}>A</Text>
                    </View>
                    <Text style={[styles.variantLabel, { color: isSelected ? TEXT : SUBTEXT }]}>Style {v}</Text>
                    {isEquipped && (
                      <View style={[styles.equippedCheckmark, { backgroundColor: COLOR_CORRECT }]}>
                        <Text style={styles.checkmark}>✓</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Equip button */}
            {(() => {
              const alreadyEquipped = prefs.keySkin === 'classic' && (prefs.keyDefaultVariant ?? 1) === popupVariant;
              return (
                <Pressable
                  style={[styles.equipButton, { backgroundColor: COLOR_CORRECT }, alreadyEquipped && styles.equipButtonDisabled]}
                  disabled={alreadyEquipped}
                  onPress={() => {
                    const updated = { ...prefs, keySkin: 'classic', keyDefaultVariant: popupVariant };
                    setPrefs(updated);
                    saveWordlePrefs(updated);
                    setSelectedSkinForPopup(null);
                  }}
                >
                  <Text style={styles.equipButtonText}>{alreadyEquipped ? 'Currently Equipped' : 'Equip'}</Text>
                </Pressable>
              );
            })()}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  container: {
    flex: 1,
    paddingTop: 8,
    paddingBottom: 10,
  },

  // Header
  appHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  backToGamesButton: {
    flex: 1,
    alignItems: "flex-start",
    padding: 8,
  },
  backToGamesText: {
    fontSize: 16,
    fontWeight: "500",
  },
  appTitle: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
  },
  headerSpacer: {
    flex: 1,
  },

  // Segment Switcher (Pill Slider)
  segmentWrapper: {
    alignItems: "center",
    paddingHorizontal: 20,
  },
  segmentSwitcher: {
    flexDirection: "row",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 999,
    padding: 4,
  },
  segmentButton: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  segmentButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },

  // Tab strip (horizontal swipe pager)
  tabStripWrapper: {
    flex: 1,
    overflow: "hidden",
    alignItems: "flex-start",
  },
  // flex:1 is required here — without it this row has no definite height for
  // its ScrollView children to stretch into, so content gets clipped by the
  // overflow:hidden wrapper before it reaches the true screen bottom.
  tabStrip: {
    flex: 1,
    width: SCREEN_WIDTH * 3,
    flexDirection: "row",
    alignSelf: "flex-start",
  },

  // Menu scroll
  menuScroll: {
    flex: 1,
    alignSelf: 'stretch',
  },
  menuScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 20,
  },

  // Sections
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
  },

  // ── Word Builder-style daily card ──
  wbDailyCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
  },
  wbDailyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
    textAlign: "center",
  },
  wbDailySubtitle: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
  },
  wbDailyCompletedInfo: {
    alignItems: "center",
    paddingVertical: 8,
  },
  wbDailyCompletedScore: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#4ecca3",
  },
  wbDailyCompletedLabel: {
    fontSize: 14,
    marginTop: 4,
  },
  wbStatPillRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginBottom: 16,
  },
  wbStatPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#f3e7d7",
    minWidth: 100,
    alignItems: "center",
  },
  wbStatPillHighlight: {
    backgroundColor: "rgba(78, 204, 163, 0.15)",
  },
  wbStatPillLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  wbStatPillValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  wbStatPillValue: {
    fontSize: 18,
    fontWeight: "600",
  },
  wbDailyButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 2,
  },
  wbDailyButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  wbDailyActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  wbDailyActionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  wbDailyActionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  wbDailyShareIconButton: {
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  wbDailyCountdown: {
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
  },
  wbDailyCountdownLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  wbDailyCountdownTime: {
    fontSize: 20,
    fontWeight: "600",
  },

  // Mode cards (Play menu)
  modeCard: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 20,
    width: "100%",
    alignItems: "center",
  },
  modeCardTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
  },
  modeCardSubtitle: {
    fontSize: 14,
    fontWeight: "400",
    marginBottom: 0,
  },
  modeCardMeta: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },

  primaryCta: {
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  primaryCtaText: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
  },

  // Stats layout
  statsContainer: {
    flex: 1,
  },
  statsContent: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 20,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 16,
  },
  statsCard: {
    width: "48%",
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    marginBottom: 10,
  },
  statsCardWide: {
    width: "100%",
  },
  statsValue: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
    textAlign: "center",
  },
  statsLabel: {
    fontSize: 12,
    textAlign: "center",
  },

  streakRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  streakBox: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
  },
  streakNum: {
    fontSize: 28,
    fontWeight: "900",
  },
  streakLbl: {
    fontSize: 11,
    textAlign: "center",
  },

  // 7-day calendar
  calendarCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    marginTop: 12,
    marginBottom: 4,
  },
  calendarTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  calendarRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  calendarCell: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  calendarDayLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  calendarTile: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDateNum: {
    fontSize: 14,
    fontWeight: "700",
  },

  // Guess distribution chart
  distCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    marginTop: 12,
  },
  distTitle: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  distLabel: {
    fontSize: 13,
    fontWeight: "700",
    width: 18,
    marginRight: 8,
  },
  distBarWrap: {
    flex: 1,
    flexDirection: "row",
    height: 22,
    borderRadius: 4,
    overflow: "hidden",
  },
  distBar: {
    borderRadius: 4,
    justifyContent: "center",
    paddingLeft: 6,
    minWidth: 28,
  },
  distCount: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
  },

  // Achievements
  achievementsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 2,
  },
  lockedDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 15, fontSize: 14, fontWeight: '500' },
  achievementCard: {
    width: "48%",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    marginBottom: 10,
  },
  achievementEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  achievementName: {
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 2,
  },
  achievementDesc: {
    fontSize: 11,
    textAlign: "center",
  },
  progressTrack: {
    marginTop: 8,
    width: "100%",
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.1)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: "#22c55e",
  },

  // Game screen
  gameHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  gameBackText: {
    fontSize: 15,
    fontWeight: "600",
  },
  gameHeaderSpacer: {
    width: 60,
  },
  gameTopArea: {
    flex: 1,
    paddingHorizontal: HORIZONTAL_PADDING,
    alignItems: "center",
  },

  modeTitle: {
    marginTop: 4,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
  },

  messageBar: {
    marginTop: 10,
    marginBottom: 6,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
  },
  messagePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  messageText: { fontSize: 13, fontWeight: "600" },

  grid: {
    alignSelf: "center",
    marginTop: 8,
    flexShrink: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    marginVertical: TILE_GAP / 2,
  },

  tileContainer: {
    position: "relative",
  },
  tileFace: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backfaceVisibility: "hidden",
  },
  tileText: {
    fontSize: Math.max(24, Math.floor(TILE_SIZE * 0.52)),
    fontWeight: "900",
  },

  statusArea: {
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },

  bottomControls: {
    paddingHorizontal: KEYBOARD_HORIZONTAL_PADDING,
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 6,
    flexShrink: 0,
  },

  keyboard: {
    alignSelf: "center",
    marginTop: 0,
  },
  keyRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginVertical: KEY_ROW_MARGIN_V,
  },
  key: {
    minHeight: KEY_MIN_HEIGHT,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    paddingHorizontal: 8,
  },
  keyText: {
    fontSize: 16,
    fontWeight: "900",
  },

  enterButton: {
    marginTop: 8,
    alignSelf: "center",
    borderWidth: 2,
    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 999,
  },
  enterText: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
  },

  // Settings toggles
  toggleCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 12,
    overflow: "hidden",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  toggleSub: {
    fontSize: 12,
    marginTop: 2,
  },
  toggleTrack: {
    width: 40,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
  },
  toggleThumb: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    top: 2,
  },

  // Customize tab
  bigPreviewContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 16,
    borderBottomWidth: 1,
  },
  bigPreviewKey: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  bigPreviewLetter: {
    fontSize: 34,
    fontWeight: '900',
  },
  bigPreviewLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  customizePreviewKey: {
    width: 40,
    height: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  customizePreviewLetter: {
    fontSize: 16,
    fontWeight: '900',
  },
  customizePillRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  customizePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: "center",
  },
  customizePillText: {
    fontSize: 14,
    fontWeight: "700",
  },
  skinScoreContainer: {
    alignItems: "center",
    paddingVertical: 15,
    borderBottomWidth: 1,
    marginHorizontal: 0,
    marginBottom: 10,
  },
  skinScoreLabel: {
    fontSize: 14,
  },
  skinScoreValue: {
    color: "#4ecca3",
    fontSize: 28,
    fontWeight: "bold",
  },
  skinSectionTitle: {
    fontSize: 14,
    marginBottom: 15,
    textAlign: "center",
  },
  skinList: {
    gap: 10,
  },
  skinRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 2,
    padding: 15,
    marginBottom: 12,
    gap: 15,
  },
  skinRowInfo: {
    flex: 1,
  },
  skinRowName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  skinRowStatus: {
    fontSize: 13,
    marginTop: 2,
  },
  skinLockBadge: {
    alignItems: 'flex-end',
  },
  skinLockText: {
    fontSize: 12,
    fontWeight: "600",
  },
  skinEquippedBadge: {
    backgroundColor: '#4ecca3',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  skinEquippedText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: "bold",
  },
  skinGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  skinCard: {
    width: "30%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
    marginBottom: 4,
  },
  skinPreviewKey: {
    width: 60,
    height: 60,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  skinPreviewLetter: {
    fontSize: 22,
    fontWeight: "900",
  },
  skinName: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 2,
  },
  skinLock: {
    fontSize: 10,
    textAlign: "center",
  },
  skinActive: {
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },

  rulesCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12,
  },
  ruleItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  ruleNumber: {
    fontSize: 15,
    fontWeight: "900",
    width: 20,
    textAlign: "center",
  },
  ruleText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },


  // ── Default variant selector popup (mirrors Word Builder) ──
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    justifyContent: 'flex-end',
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  variantSelector: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  variantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  variantTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  variantContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
  },
  previewSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 20,
  },
  variantPreviewKey: {
    width: 80,
    height: 80,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  variantPreviewLetter: {
    fontSize: 32,
    fontWeight: '800',
  },
  selectLabel: {
    fontSize: 14,
    marginBottom: 12,
  },
  variantList: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 5,
  },
  variantCard: {
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    position: 'relative',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  variantCardSelected: {
    borderColor: '#2c2416',
  },
  variantCardKey: {
    width: 50,
    height: 50,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  variantCardLetter: {
    fontSize: 18,
    fontWeight: '800',
  },
  variantLabel: {
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
  equippedCheckmark: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  equipButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 15,
  },
  equipButtonDisabled: {
    backgroundColor: '#ccc',
  },
  equipButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
