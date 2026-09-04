import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AchievementIcon } from '../../src/shared/AchievementIcon';
import {
  Alert,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  FlatList,
  Animated,
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { usePreventRemove } from '@react-navigation/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Flame, RotateCw, Share2, Trophy, X } from 'lucide-react-native';

// Components
import { GameTile } from '../../src/wordbuilder/components/GameTile';
import { CustomizeScreen } from '../../src/wordbuilder/components/CustomizeScreen';
import { AchievementPopup } from '../../src/shared/AchievementPopup';
import { WordReportPrompt } from '../../src/shared/WordReportPrompt';
import { FallingLetters } from '../../src/shared/FallingLetters';
import DailyCalendar, { type CalendarHistory } from '../../src/shared/DailyCalendar';

// Shared Managers
import { HapticManager } from '../../src/shared/HapticManager';
import { recordRejectedWord } from '../../src/shared/wordReports';

// Theme
import { useTheme } from '../../src/shared/ThemeContext';
import { COLORS } from '../../src/shared/theme';
import { maybeRequestReview } from '../../src/shared/reviewPrompt';
import { syncDailyReminder, maybeFlagReminderOptIn } from '../../src/shared/dailyReminders';

// Utils
import { generateLetters } from '../../src/wordbuilder/utils/letterGenerator';
import { generateDailyLetters, getTodayDateString } from '../../src/wordbuilder/utils/dailyLetters';
import { calculateWordScoreWithBonus } from '../../src/wordbuilder/utils/scoring';
import { findAllPossibleWords, getPossibleWordsStats, PossibleWord } from '../../src/wordbuilder/utils/wordFinder';
import { 
  PlayerStats,
  PlayerTiles,
  DailyChallenge,
  loadStats, 
  loadTiles,
  loadDailyChallenge,
  updateStatsAfterGame,
  saveDailyResult,
  getAverageScore,
  getWordsPerGame,
  getFavoriteMode,
  getFavoriteLetterCount,
  getDailyAverageScore,
  getDailyAverageWords,
  hasPlayedTodayDaily,
  getTodayDailyResult,
  DEBUG_UNLOCK_ALL,
  unlockAllTilesForTesting,
  loadDailyBuilderProgress,
  saveDailyBuilderProgress,
  clearDailyBuilderProgress,
  type WordBuilderDailyProgress,
  loadWordsmithDailyHistory,
  saveWordsmithDailyHistoryEntry,
  loadCachedDailyLetters,
  saveCachedDailyLetters,
} from '../../src/wordbuilder/utils/storage';
import { TierName } from '../../src/wordbuilder/utils/tiers';
import {
  Achievement,
  ACHIEVEMENTS,
  checkAchievements,
  getUnlockedAchievements,
  GameResult,
  PlayerProgress,
} from '../../src/wordbuilder/utils/achievements';

// Data
import { VALID_WORDS } from '../../src/shared/words';

const { width } = Dimensions.get('window');

type SegmentKey = 'play' | 'customize' | 'stats';
type GameMode = 'menu' | 'daily' | 'blitz' | 'standard';
type GameOverPage = 'results' | 'words';

// Simple stats card component
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
}) => (
  <View style={[
    styles.statsCard, 
    wide && styles.statsCardWide,
    { backgroundColor: cardColor, borderColor }
  ]}>
    <Text style={[styles.statsValue, { color: textColor }]}>{value}</Text>
    <Text style={[styles.statsLabel, { color: secondaryText }]}>{label}</Text>
  </View>
);

// Stat Pill for daily challenge (like Wordle style)
const DailyStatPill = ({ 
  label, 
  value, 
  icon: Icon,
  iconColor,
  highlight = false,
  secondaryText,
}: { 
  label: string; 
  value: number;
  icon: React.ComponentType<{ size: number; color: string }>;
  iconColor: string;
  highlight?: boolean;
  secondaryText: string;
}) => (
  <View style={[
    styles.dailyStatPill,
    highlight && styles.dailyStatPillHighlight,
  ]}>
    <Text style={[styles.dailyStatPillLabel, { color: secondaryText }]}>{label}</Text>
    <View style={styles.dailyStatPillValueRow}>
      <Icon size={18} color={iconColor} />
      <Text style={styles.dailyStatPillValue}>{value}</Text>
    </View>
  </View>
);

// Hook for countdown timer to next daily challenge
const useCountdownToMidnight = () => {
  const [timeLeft, setTimeLeft] = useState('');
  
  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      const diff = tomorrow.getTime() - now.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      return `${hours}h ${minutes}m ${seconds}s`;
    };
    
    setTimeLeft(calculateTimeLeft());
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  return timeLeft;
};

function getWordBuilderProgress(
  id: string,
  stats: PlayerStats | null,
  daily: DailyChallenge | null
): number {
  if (!stats && !daily) return 0;
  const clamp = (v: number, t: number) => Math.min(v / t, 1);
  const gp   = stats?.gamesPlayed        ?? 0;
  const ts   = stats?.totalScore         ?? 0;
  const tw   = stats?.totalWordsFound    ?? 0;
  const hs   = stats?.highScore          ?? 0;
  const bz   = stats?.blitzGamesPlayed   ?? 0;
  const bbs  = stats?.bestBlitzScore     ?? 0;
  const sg   = stats?.standardGamesPlayed ?? 0;
  const bss  = stats?.bestStandardScore  ?? 0;
  const dgp  = daily?.dailyGamesPlayed   ?? 0;
  const bds  = daily?.bestDailyScore     ?? 0;
  const streak = Math.max(daily?.dailyStreak ?? 0, daily?.bestDailyStreak ?? 0);

  switch (id) {
    // Score milestones (single-game best)
    case 'score_2000':  return clamp(hs, 2000);
    case 'score_4000':  return clamp(hs, 4000);
    case 'score_6000':  return clamp(hs, 6000);
    case 'score_10000': return clamp(hs, 10000);
    case 'score_15000': return clamp(hs, 15000);
    case 'score_20000': return clamp(hs, 20000);
    // Daily streak
    case 'streak_1':   return clamp(streak, 1);
    case 'streak_2':   return clamp(streak, 2);
    case 'streak_5':   return clamp(streak, 5);
    case 'streak_10':  return clamp(streak, 10);
    case 'streak_15':  return clamp(streak, 15);
    case 'streak_20':  return clamp(streak, 20);
    case 'streak_30':  return clamp(streak, 30);
    case 'streak_40':  return clamp(streak, 40);
    case 'streak_50':  return clamp(streak, 50);
    case 'streak_75':  return clamp(streak, 75);
    case 'streak_100': return clamp(streak, 100);
    case 'streak_125': return clamp(streak, 125);
    case 'streak_150': return clamp(streak, 150);
    case 'streak_175': return clamp(streak, 175);
    case 'streak_200': return clamp(streak, 200);
    case 'streak_250': return clamp(streak, 250);
    case 'streak_300': return clamp(streak, 300);
    case 'streak_365': return clamp(streak, 365);
    case 'streak_500': return clamp(streak, 500);
    case 'streak_730': return clamp(streak, 730);
    // Words found (cumulative)
    case 'words_10':   return clamp(tw, 10);
    case 'words_100':  return clamp(tw, 100);
    case 'words_500':  return clamp(tw, 500);
    case 'words_1000': return clamp(tw, 1000);
    case 'words_5000': return clamp(tw, 5000);
    // Games played
    case 'games_1':    return clamp(gp, 1);
    case 'games_10':   return clamp(gp, 10);
    case 'games_50':   return clamp(gp, 50);
    case 'games_100':  return clamp(gp, 100);
    case 'games_250':  return clamp(gp, 250);
    case 'games_500':  return clamp(gp, 500);
    // Lifetime score
    case 'lifetime_5000':      return clamp(ts, 5000);
    case 'lifetime_25000':     return clamp(ts, 25000);
    case 'lifetime_100000':    return clamp(ts, 100000);
    case 'lifetime_250000':    return clamp(ts, 250000);
    case 'lifetime_500000':    return clamp(ts, 500000);
    case 'lifetime_1000000':   return clamp(ts, 1000000);
    case 'lifetime_2500000':   return clamp(ts, 2500000);
    case 'lifetime_5000000':   return clamp(ts, 5000000);
    case 'lifetime_10000000':  return clamp(ts, 10000000);
    case 'lifetime_25000000':  return clamp(ts, 25000000);
    case 'lifetime_30000000':  return clamp(ts, 30000000);
    // Daily challenges
    case 'daily_10':  return clamp(dgp, 10);
    case 'daily_30':  return clamp(dgp, 30);
    case 'daily_100': return clamp(dgp, 100);
    case 'daily_250': return clamp(dgp, 250);
    case 'daily_500': return clamp(dgp, 500);
    // Daily score bests
    case 'daily_score_3000': return clamp(bds, 3000);
    case 'daily_score_5000': return clamp(bds, 5000);
    case 'daily_score_8000': return clamp(bds, 8000);
    // Blitz games
    case 'blitz_25':  return clamp(bz, 25);
    case 'blitz_50':  return clamp(bz, 50);
    case 'blitz_100': return clamp(bz, 100);
    case 'blitz_200': return clamp(bz, 200);
    // Blitz score bests
    case 'blitz_score_1000': return clamp(bbs, 1000);
    case 'blitz_score_2000': return clamp(bbs, 2000);
    case 'blitz_score_3000': return clamp(bbs, 3000);
    // Standard games
    case 'standard_10': return clamp(sg, 10);
    case 'standard_25': return clamp(sg, 25);
    case 'standard_50': return clamp(sg, 50);
    // Standard score bests
    case 'standard_score_3000': return clamp(bss, 3000);
    case 'standard_score_5000': return clamp(bss, 5000);
    case 'standard_score_8000': return clamp(bss, 8000);
    default: return 0; // binary/single-event achievements — no bar
  }
}

export default function WordBuilder() {
  // Theme
  const { background } = useTheme();
  
  // Countdown timer for next daily challenge
  const insets = useSafeAreaInsets();
  const countdownToNextDaily = useCountdownToMidnight();
  
  // Segment State
  const [segment, setSegment] = useState<SegmentKey>('play');
  const SEGMENT_KEYS: SegmentKey[] = ['play', 'customize', 'stats'];

  // Tab slide animation
  const tabAnim = useRef(new Animated.Value(0)).current;
  // Measured directly instead of trusting flex propagation through the
  // Animated.View row below. This is belt-and-suspenders after flex:1 alone
  // did not reliably give the row (and its ScrollView pages) the full
  // height, which was letting content sit un-scrollable-into below a fixed line.
  const [tabAreaHeight, setTabAreaHeight] = useState(0);
  const currentTabIdxRef = useRef(0);
  const dragBase = useRef(0);

  // Keep currentTabIdxRef in sync with segment state
  useEffect(() => {
    currentTabIdxRef.current = SEGMENT_KEYS.indexOf(segment);
  }, [segment]);

  const handleSegmentPress = (key: SegmentKey) => {
    const newIdx = SEGMENT_KEYS.indexOf(key);
    setSegment(key);
    Animated.spring(tabAnim, {
      toValue: newIdx,
      useNativeDriver: true,
      tension: 70,
      friction: 12,
    }).start();
  };

  const panLockedRef = React.useRef(false);
  const setPanLocked = (v: boolean) => { panLockedRef.current = v; };

  const menuPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        !panLockedRef.current && Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.2,
      onPanResponderGrant: () => {
        tabAnim.stopAnimation();
        dragBase.current = currentTabIdxRef.current;
      },
      onPanResponderMove: (_, gs) => {
        const raw = dragBase.current - gs.dx / width;
        tabAnim.setValue(Math.max(0, Math.min(SEGMENT_KEYS.length - 1, raw)));
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
        if (gs.dx < -25 || gs.vx < -0.3) newIdx = Math.min(Math.floor(base) + 1, SEGMENT_KEYS.length - 1);
        else if (gs.dx > 25 || gs.vx > 0.3) newIdx = Math.max(Math.ceil(base) - 1, 0);
        currentTabIdxRef.current = newIdx;
        setSegment(SEGMENT_KEYS[newIdx]);
        Animated.spring(tabAnim, {
          toValue: newIdx,
          useNativeDriver: true,
          tension: 70,
          friction: 12,
        }).start();
      },
    })
  ).current;

  // Mode Selection State (for two-step selection)
  const [modeSelection, setModeSelection] = useState<'none' | 'blitz' | 'standard'>('none');
  
  // Game State
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  const [letterCount, setLetterCount] = useState(6);
  const [letters, setLetters] = useState<string[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [currentWord, setCurrentWord] = useState('');
  const [score, setScore] = useState(0);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [message, setMessage] = useState('Tap letters to build words!');
  const [timeLeft, setTimeLeft] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gameOverPage, setGameOverPage] = useState<GameOverPage>('results');
  // Height of the pinned bottom footer (buttons + share + page dots), measured
  // via onLayout so the scrollable pages above can pad themselves out by
  // exactly that much and never render content underneath it.
  const [resultsFooterHeight, setResultsFooterHeight] = useState(0);
  const [possibleWords, setPossibleWords] = useState<PossibleWord[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameOverScrollRef = useRef<ScrollView>(null);
  // Set true when an in-progress Daily attempt was restored on app launch —
  // tells startDailyChallenge to enter the already-loaded game instead of
  // wiping it with fresh letters/score/foundWords.
  const resumedDailyRef = useRef(false);

  // Player Data State
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [dailyHistory, setDailyHistory] = useState<CalendarHistory>({});
  const [playerTiles, setPlayerTiles] = useState<PlayerTiles | null>(null);
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallenge | null>(null);
  const [dailyPlayed, setDailyPlayed] = useState(false);
  const [dailyResult, setDailyResult] = useState<{ score: number; words: string[] } | null>(null);
  const [showDailyResultModal, setShowDailyResultModal] = useState(false);
  const [equippedTier, setEquippedTier] = useState<TierName>('default');
  const [equippedVariant, setEquippedVariant] = useState<number>(1);

  // Achievement State
  const [unlockedAchievements, setUnlockedAchievements] = useState<(Achievement & { unlockedAt: string })[]>([]);
  const [pendingAchievements, setPendingAchievements] = useState<Achievement[]>([]);
  const [currentPopupAchievement, setCurrentPopupAchievement] = useState<Achievement | null>(null);

  // Swipe Tooltip State
  const [showSwipeTooltip, setShowSwipeTooltip] = useState(false);
  const SWIPE_TOOLTIP_KEY = 'wordbuilder_swipe_tooltip_shown';

  // Initialize managers and load all player data on mount
  useEffect(() => {
    const initializeApp = async () => {
      // Initialize haptic manager
      await HapticManager.init();
      
      if (DEBUG_UNLOCK_ALL) {
        await unlockAllTilesForTesting();
      }
      
      const [stats, tiles, daily, achievements, hist] = await Promise.all([
        loadStats(),
        loadTiles(),
        loadDailyChallenge(),
        getUnlockedAchievements(),
        loadWordsmithDailyHistory().catch(() => ({})),
      ]);
      
      setPlayerStats(stats);
      setPlayerTiles(tiles);
      setDailyChallenge(daily);
      setEquippedTier(tiles.equippedTier);
      setEquippedVariant(tiles.equippedVariant);
      setUnlockedAchievements(achievements);
      setDailyHistory((hist as CalendarHistory) ?? {});
      
      const todayResult = await getTodayDailyResult();
      setDailyPlayed(todayResult.played);
      if (todayResult.played) {
        setDailyResult({ score: todayResult.score, words: todayResult.words });
      } else {
        // Resume an in-progress Daily attempt (app closed/backgrounded mid-game).
        // Stay on the menu screen — startDailyChallenge() picks this up when tapped.
        const savedProgress = await loadDailyBuilderProgress();
        if (savedProgress) {
          setLetters(savedProgress.letters);
          setFoundWords(savedProgress.foundWords);
          setScore(savedProgress.score);
          setTimeLeft(savedProgress.timeLeft);
          setLetterCount(6);
          resumedDailyRef.current = true;
        }
      }
    };
    initializeApp();
  }, []);

  // Check if we should show swipe tooltip when game ends
  useEffect(() => {
    const checkSwipeTooltip = async () => {
      if (gameOver) {
        const hasSeenTooltip = await AsyncStorage.getItem(SWIPE_TOOLTIP_KEY);
        if (!hasSeenTooltip) {
          setShowSwipeTooltip(true);
        }
      }
    };
    checkSwipeTooltip();
  }, [gameOver]);

  const dismissSwipeTooltip = async () => {
    setShowSwipeTooltip(false);
    await AsyncStorage.setItem(SWIPE_TOOLTIP_KEY, 'true');
  };

  // Show achievement popups one at a time
  useEffect(() => {
    if (pendingAchievements.length > 0 && !currentPopupAchievement) {
      setCurrentPopupAchievement(pendingAchievements[0]);
      setPendingAchievements(prev => prev.slice(1));
    }
  }, [pendingAchievements, currentPopupAchievement]);

  const handleAchievementDismiss = () => {
    setCurrentPopupAchievement(null);
  };

  const refreshPlayerData = async () => {
    const [stats, tiles, daily, achievements] = await Promise.all([
      loadStats(),
      loadTiles(),
      loadDailyChallenge(),
      getUnlockedAchievements(),
    ]);
    setPlayerStats(stats);
    setPlayerTiles(tiles);
    setDailyChallenge(daily);
    setEquippedTier(tiles.equippedTier);
    setEquippedVariant(tiles.equippedVariant);
    setUnlockedAchievements(achievements);
    
    const todayResult = await getTodayDailyResult();
    setDailyPlayed(todayResult.played);
    if (todayResult.played) {
      setDailyResult({ score: todayResult.score, words: todayResult.words });
    }
  };

  const getTileSize = () => {
    if (letterCount <= 6) return Math.floor((width - 90) / 3);  // 3 per row
    return Math.floor((width - 70) / 4);  // 4 per row
  };

  // Returns letter indices split into rows for explicit row layout
  const getLetterRows = (): number[][] => {
    if (letterCount <= 6) {
      // 3 + 3
      return [
        Array.from({ length: 3 }, (_, i) => i),
        Array.from({ length: letters.length - 3 }, (_, i) => i + 3),
      ];
    } else if (letterCount === 7) {
      // 4 + 3
      return [
        Array.from({ length: 4 }, (_, i) => i),
        Array.from({ length: 3 }, (_, i) => i + 4),
      ];
    } else {
      // 4 + 4
      return [
        Array.from({ length: 4 }, (_, i) => i),
        Array.from({ length: 4 }, (_, i) => i + 4),
      ];
    }
  };

  // Timer effect
  useEffect(() => {
    if (timeLeft > 0 && !gameOver) {
      timerRef.current = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      
      // Timer warning at 10 seconds
      if (timeLeft === 10) {
        HapticManager.timerWarning();
      }
    } else if (timeLeft === 0 && gameMode !== 'menu' && !gameOver) {
      setGameOver(true);
      setGameOverPage('results');
      setMessage('Time\'s up!');
      
      // Game over feedback
      HapticManager.gameOver();

      // Calculate all possible words
      const allPossible = findAllPossibleWords(letters, foundWords);
      setPossibleWords(allPossible);
      
      const saveGameResults = async () => {
        let updatedStats = playerStats;
        let updatedDaily = dailyChallenge;
        
        if (gameMode === 'daily') {
          // Save daily challenge result
          updatedDaily = await saveDailyResult(score, foundWords);
          setDailyChallenge(updatedDaily);
          setDailyPlayed(true);
          setDailyResult({ score, words: foundWords });
          resumedDailyRef.current = false;
          await clearDailyBuilderProgress();
          await saveWordsmithDailyHistoryEntry({
            dateISO: getTodayDateString(),
            result: 'played',
            detail: `${score} pts · ${foundWords.length} word${foundWords.length !== 1 ? 's' : ''}`,
          });
          loadWordsmithDailyHistory().catch(() => ({})).then(h => setDailyHistory((h as CalendarHistory) ?? {}));
          // No win/lose state here either (score race, not solve/fail) — the
          // streak from showing up is the "good moment" signal.
          maybeRequestReview(updatedDaily?.dailyStreak ?? 0);
          maybeFlagReminderOptIn(updatedDaily?.dailyStreak ?? 0);
          syncDailyReminder();
        } else if (foundWords.length > 0 || score > 0) {
          // Save practice game result
          updatedStats = await updateStatsAfterGame(score, foundWords, gameMode, letterCount);
          setPlayerStats(updatedStats);
        }
        
        // Check achievements
        const gameResult: GameResult = {
          score,
          words: foundWords,
          mode: gameMode as 'blitz' | 'standard' | 'daily',
          letterCount,
        };
        
        const progress: PlayerProgress = {
          totalGamesPlayed: (updatedStats?.gamesPlayed || playerStats?.gamesPlayed || 0),
          totalScore: (updatedStats?.totalScore || playerStats?.totalScore || 0),
          totalWordsFound: (updatedStats?.totalWordsFound || playerStats?.totalWordsFound || 0) + (gameMode === 'daily' ? foundWords.length : 0),
          highScore: updatedStats?.highScore || playerStats?.highScore || 0,
          blitzGamesPlayed: updatedStats?.blitzGamesPlayed || playerStats?.blitzGamesPlayed || 0,
          standardGamesPlayed: updatedStats?.standardGamesPlayed || playerStats?.standardGamesPlayed || 0,
          bestBlitzScore: updatedStats?.bestBlitzScore || playerStats?.bestBlitzScore || 0,
          bestStandardScore: updatedStats?.bestStandardScore || playerStats?.bestStandardScore || 0,
          dailyGamesPlayed: updatedDaily?.dailyGamesPlayed || dailyChallenge?.dailyGamesPlayed || 0,
          dailyStreak: updatedDaily?.dailyStreak || dailyChallenge?.dailyStreak || 0,
          bestDailyStreak: updatedDaily?.bestDailyStreak || dailyChallenge?.bestDailyStreak || 0,
          dailyTotalScore: updatedDaily?.dailyTotalScore || dailyChallenge?.dailyTotalScore || 0,
        };
        
        const newAchievements = await checkAchievements(gameResult, progress);
        if (newAchievements.length > 0) {
          setPendingAchievements(prev => [...prev, ...newAchievements]);
          // Achievement feedback
          HapticManager.achievement();
        }
        
        await refreshPlayerData();
      };
      saveGameResults();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeLeft, gameMode, gameOver, score, foundWords, letterCount, letters]);

  // Autosave Daily progress on every change so the attempt survives the app
  // being backgrounded, force-quit, or swiped away mid-game.
  useEffect(() => {
    if (gameMode !== 'daily' || gameOver) return;
    saveDailyBuilderProgress({
      dateISO: getTodayDateString(),
      letters,
      foundWords,
      score,
      timeLeft,
    });
  }, [gameMode, gameOver, letters, foundWords, score, timeLeft]);

  const startDailyChallenge = async () => {
    const alreadyPlayed = await hasPlayedTodayDaily();
    if (alreadyPlayed) return;

    // Resuming an in-progress attempt restored on launch — letters/score/
    // foundWords/timeLeft are already populated, just enter the game.
    if (resumedDailyRef.current) {
      setGameMode('daily');
      setSelectedIndices([]);
      setCurrentWord('');
      setMessage('Tap letters to build words!');
      setGameOver(false);
      setGameOverPage('results');
      setPossibleWords([]);
      return;
    }

    // Pin today's letters the first time they're generated (see
    // loadCachedDailyLetters/saveCachedDailyLetters) rather than recomputing
    // them fresh on every start — generateDailyLetters() reads the live
    // dictionary, so recomputing could hand out different letters than an
    // earlier start today if the dictionary changed in between.
    const cached = await loadCachedDailyLetters();
    let dailyLetters: string[];
    if (cached) {
      dailyLetters = cached.letters;
    } else {
      dailyLetters = generateDailyLetters();
      await saveCachedDailyLetters({ dateISO: getTodayDateString(), letters: dailyLetters });
    }

    setGameMode('daily');
    setLetterCount(6);
    setLetters(dailyLetters);
    setSelectedIndices([]);
    setCurrentWord('');
    setScore(0);
    setFoundWords([]);
    setMessage('Tap letters to build words!');
    setGameOver(false);
    setGameOverPage('results');
    setPossibleWords([]);
    setTimeLeft(60);
  };

  const startPracticeGame = (mode: 'blitz' | 'standard', numLetters: number) => {
    setGameMode(mode);
    setLetterCount(numLetters);
    setLetters(generateLetters(numLetters));
    setSelectedIndices([]);
    setCurrentWord('');
    setScore(0);
    setFoundWords([]);
    setMessage('Tap letters to build words!');
    setGameOver(false);
    setGameOverPage('results');
    setPossibleWords([]);
    setTimeLeft(mode === 'blitz' ? 30 : 60);
  };

  const handleRefresh = useCallback(() => {
    if (gameMode === 'daily') return;
    setLetters(generateLetters(letterCount));
    setSelectedIndices([]);
    setCurrentWord('');
    setScore(0);
    setFoundWords([]);
    setMessage('Tap letters to build words!');
    setGameOver(false);
    setGameOverPage('results');
    setPossibleWords([]);
    setTimeLeft(gameMode === 'blitz' ? 30 : 60);
  }, [letterCount, gameMode]);

  const handleLetterPress = useCallback((index: number) => {
    if (gameOver) return;
    
    // Haptic & sound feedback on tile tap
    HapticManager.tap();

    if (selectedIndices.includes(index)) {
      const newSelected = selectedIndices.filter((i: number) => i !== index);
      setSelectedIndices(newSelected);
      setCurrentWord(newSelected.map((i: number) => letters[i]).join(''));
    } else {
      const newSelected = [...selectedIndices, index];
      setSelectedIndices(newSelected);
      setCurrentWord(newSelected.map((i: number) => letters[i]).join(''));
    }
  }, [gameOver, selectedIndices, letters]);

  const handleSubmit = useCallback(() => {
    if (gameOver) return;
    const word = currentWord.toLowerCase();
    if (word.length < 3) {
      setMessage('Words must be at least 3 letters!');
      HapticManager.error();
      return;
    }
    if (foundWords.includes(word)) {
      setMessage('Already found that word!');
      HapticManager.error();
      return;
    }
    if (VALID_WORDS.has(word)) {
      const { score: points, bonusApplied } = calculateWordScoreWithBonus(word, letterCount);
      setScore(score + points);
      setFoundWords([...foundWords, word]);
      
      if (bonusApplied) {
        setMessage(`+${points} points — 2x ALL LETTERS BONUS!`);
        HapticManager.bonus();
      } else {
        setMessage(`+${points} points!`);
        HapticManager.validWord();
      }
      setSelectedIndices([]);
      setCurrentWord('');
      // Auto-clear score message after 2 seconds
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
      messageTimerRef.current = setTimeout(() => {
        setMessage('');
      }, 2000);
    } else {
      setMessage('Not a valid word!');
      HapticManager.invalidWord();
      // Noted for a possible dictionary report — the tiles were valid, only the
      // word wasn't recognised.
      recordRejectedWord('wordsmith', currentWord);
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
      messageTimerRef.current = setTimeout(() => {
        setMessage('');
      }, 2000);
    }
  }, [gameOver, currentWord, foundWords, score, letterCount]);

  const handleClear = useCallback(() => {
    if (gameOver) return;
    setSelectedIndices([]);
    setCurrentWord('');
    setMessage('Tap letters to build words!');
  }, [gameOver]);

  const backToMenu = () => {
    setGameMode('menu');
    setGameOver(false);
    setGameOverPage('results');
    setPossibleWords([]);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  // Daily only allows one attempt per day — leaving mid-game (while it's
  // still running, not yet timed out) needs to actually lock in today's
  // result as-is, otherwise you could dodge a bad run by backing out and
  // trying again later.
  const lockInDailyResultOnLeave = async () => {
    try {
      const updatedDaily = await saveDailyResult(score, foundWords);
      setDailyChallenge(updatedDaily);
      setDailyPlayed(true);
      setDailyResult({ score, words: foundWords });
      resumedDailyRef.current = false;
      await clearDailyBuilderProgress();
      await refreshPlayerData();
    } catch (e) {
      console.warn('Failed to lock in daily result on leave', e);
    }
  };

  const handleGameplayBackPress = () => {
    if (gameMode === 'daily' && !gameOver) {
      Alert.alert(
        'Leave Daily Challenge?',
        "You've only got one Daily attempt per day — leaving now will end your run and lock in today's score.",
        [
          { text: 'Keep Playing', style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: async () => {
              await lockInDailyResultOnLeave();
              backToMenu();
            },
          },
        ]
      );
      return;
    }
    backToMenu();
  };

  // Same protection as above, but for leaving the Word Builder screen
  // entirely (iOS swipe-back gesture, Android hardware back button) rather
  // than the in-app "← Back" button — a gesture/hardware-back would
  // otherwise skip handleGameplayBackPress altogether and escape with no
  // result recorded.
  const navigation = useNavigation();
  usePreventRemove(gameMode === 'daily' && !gameOver, ({ data }) => {
    Alert.alert(
      'Leave Daily Challenge?',
      "You've only got one Daily attempt per day — leaving now will end your run and lock in today's score.",
      [
        { text: 'Keep Playing', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await lockInDailyResultOnLeave();
            navigation.dispatch(data.action);
          },
        },
      ]
    );
  });

  const backToAppMenu = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    router.back();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = () => {
    const today = new Date();
    return today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  // Single share-text builder for both Daily and Practice (Blitz/Standard),
  // replacing what used to be two near-duplicate strings (shareDaily and
  // shareDailyFromMenu) that had already drifted slightly out of sync.
  // Daily never lists the actual found words — the day's letter set is the
  // same for everyone, so specific found words would give away valid
  // answers to friends who haven't played yet. Practice reveals its best
  // word since there's no shared puzzle to spoil.
  const buildWordsmithShareText = (params: {
    isDaily: boolean;
    scoreValue: number;
    wordsFound: number;
    totalPossible?: number;
    percentFound?: number;
    streak?: number;
    bestWord?: string;
    modeLabel?: string;
  }) => {
    const { isDaily, scoreValue, wordsFound, totalPossible, percentFound, streak, bestWord, modeLabel } = params;
    const lines: string[] = [isDaily ? `WORDSMITH DAILY — ${formatDate()}` : 'WORDSMITH'];
    if (!isDaily && modeLabel) lines.push(modeLabel);
    lines.push(`Score: ${scoreValue.toLocaleString()} pts`);
    lines.push(
      totalPossible != null && percentFound != null
        ? `${wordsFound}/${totalPossible} words · ${percentFound}%`
        : `${wordsFound} word${wordsFound === 1 ? '' : 's'}`
    );
    if (!isDaily && bestWord) lines.push(`Best word: ${bestWord.toUpperCase()}`);
    if (isDaily && streak && streak > 1) lines.push(`${streak} day streak`);
    lines.push('', 'wordfury.app');
    return lines.join('\n');
  };

  const shareDailyFromMenu = async () => {
    if (!dailyResult) return;
    const message = buildWordsmithShareText({
      isDaily: true,
      scoreValue: dailyResult.score,
      wordsFound: dailyResult.words.length,
      streak: dailyChallenge?.dailyStreak ?? 0,
    });
    try { await Share.share({ message }); } catch (e) {}
  };

  const shareResult = async (opts: {
    isDaily: boolean;
    totalFound: number;
    totalPossible: number;
    percentFound: number;
    modeLabel?: string;
  }) => {
    const bestWord = !opts.isDaily && foundWords.length > 0
      ? foundWords.reduce((longest, w) => (w.length > longest.length ? w : longest), foundWords[0])
      : undefined;
    const message = buildWordsmithShareText({
      isDaily: opts.isDaily,
      scoreValue: score,
      wordsFound: opts.totalFound,
      totalPossible: opts.totalPossible,
      percentFound: opts.percentFound,
      streak: dailyChallenge?.dailyStreak ?? 0,
      bestWord,
      modeLabel: opts.modeLabel,
    });
    try {
      await Share.share({ message });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  // Dynamic styles based on theme
  const dynamicStyles = {
    container: { backgroundColor: background.backgroundColor },
    text: { color: background.textColor },
    textSecondary: { color: background.secondaryText },
    card: { backgroundColor: background.cardColor, borderColor: background.borderColor },
    button: { backgroundColor: background.backgroundColor, borderColor: background.borderColor },
  };

  // ==================== GAME OVER SCREEN ====================
  if (gameOver) {
    const isDaily = gameMode === 'daily';
    const stats = getPossibleWordsStats(possibleWords);
    
    const handleScroll = (event: any) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const page = Math.round(offsetX / width);
      setGameOverPage(page === 0 ? 'results' : 'words');
    };
    
    return (
      <SafeAreaView style={[styles.gameOverContainer, dynamicStyles.container]}>
        <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />
        
        {/* Achievement Popup */}
        <AchievementPopup
          achievement={currentPopupAchievement}
          onDismiss={handleAchievementDismiss}
          backgroundColor={background.cardColor}
          textColor={background.textColor}
        />

        {/* Page header — Wordsmith has no persistent board to look back at,
            so X just acts like Main Menu. */}
        <View style={[styles.resultsPageHeader, { borderColor: background.borderColor }]}>
          <View style={styles.resultsHeaderSpacer} />
          <Text style={[styles.brand, { color: background.secondaryText }]}>WORDSMITH</Text>
          <Pressable
            style={({ pressed }) => [styles.resultsCloseIconButton, { opacity: pressed ? 0.6 : 1 }]}
            onPress={backToMenu}
            hitSlop={10}
          >
            <X size={22} color={background.secondaryText} />
          </Pressable>
        </View>

        {/* Horizontal Swipe Carousel */}
        <ScrollView
          ref={gameOverScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          style={styles.carousel}
        >
          {/* ===== PAGE 1: RESULTS ===== */}
          <View style={[styles.carouselPage, { width }]}>
            <ScrollView
              contentContainerStyle={[styles.resultsPageContent, { paddingBottom: resultsFooterHeight + 24 }]}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.resultsCard}>

                {/* Title + subtitle */}
                <Text style={[styles.gameOverTitle, { color: background.textColor }]}>
                  {isDaily ? 'Daily Complete!' : 'Time\'s Up!'}
                </Text>
                <Text style={[styles.gameOverSubtitle, { color: background.secondaryText }]}>
                  {isDaily
                    ? `You scored ${score} pts with ${stats.totalFound} words.`
                    : `You found ${stats.totalFound} of ${stats.totalPossible} possible words.`}
                </Text>

                {/* Score box */}
                <View style={[styles.scoreBox, { borderColor: background.borderColor }]}>
                  <Text style={[styles.scoreLabel, { color: background.secondaryText }]}>Score</Text>
                  <Text style={[styles.scoreValue, { color: background.textColor }]}>{score}</Text>
                  <Text style={[styles.scoreSubLabel, { color: background.secondaryText }]}>points</Text>
                </View>

                {/* This game */}
                <View style={[styles.resultsDivider, { backgroundColor: background.borderColor, opacity: 0.35 }]} />
                <Text style={[styles.resultsSectionTitle, { color: background.textColor }]}>This game</Text>
                <View style={styles.statsRow}>
                  <View style={[styles.statPill, { borderColor: background.borderColor, backgroundColor: background.backgroundColor }]}>
                    <Text style={[styles.statPillLabel, { color: background.textColor }]}>Found</Text>
                    <Text style={[styles.statPillValue, { color: background.textColor }]}>{stats.totalFound}</Text>
                  </View>
                  <View style={[styles.statPill, { borderColor: background.borderColor, backgroundColor: background.backgroundColor }]}>
                    <Text style={[styles.statPillLabel, { color: background.textColor }]}>Possible</Text>
                    <Text style={[styles.statPillValue, { color: background.textColor }]}>{stats.totalPossible}</Text>
                  </View>
                </View>
                <View style={styles.statsRow}>
                  <View style={[styles.statPill, { borderColor: background.borderColor, backgroundColor: background.backgroundColor }]}>
                    <Text style={[styles.statPillLabel, { color: background.textColor }]}>Completion</Text>
                    <Text style={[styles.statPillValue, { color: COLORS.accent }]}>{stats.percentFound}%</Text>
                  </View>
                </View>

                {/* Daily streak */}
                {isDaily && dailyChallenge && (
                  <>
                    <View style={[styles.resultsDivider, { backgroundColor: background.borderColor, opacity: 0.35 }]} />
                    <Text style={[styles.resultsSectionTitle, { color: background.textColor }]}>Stats</Text>
                    <View style={styles.statsRow}>
                      <View style={[styles.statPill, { borderColor: background.borderColor, backgroundColor: background.backgroundColor }]}>
                        <Text style={[styles.statPillLabel, { color: background.textColor }]}>Streak</Text>
                        <Text style={[styles.statPillValue, { color: background.textColor }]}>{dailyChallenge.dailyStreak}</Text>
                      </View>
                      <View style={[styles.statPill, { borderColor: background.borderColor, backgroundColor: background.backgroundColor }]}>
                        <Text style={[styles.statPillLabel, { color: background.textColor }]}>Best</Text>
                        <Text style={[styles.statPillValue, { color: background.textColor }]}>{dailyChallenge.bestDailyStreak}</Text>
                      </View>
                    </View>
                  </>
                )}

                <WordReportPrompt />

              </View>
            </ScrollView>
          </View>

          {/* ===== PAGE 2: ALL WORDS ===== */}
          <View style={[styles.carouselPage, { width }]}>
            <Text style={[styles.wordsPageTitle, dynamicStyles.text]}>
              All Possible Words
            </Text>
            <Text style={[styles.wordsPageSubtitle, dynamicStyles.textSecondary]}>
              You found {stats.totalFound} of {stats.totalPossible} words
            </Text>
            
            <FlatList
              data={possibleWords}
              keyExtractor={(item) => item.word}
              style={styles.wordsList}
              contentContainerStyle={[styles.wordsListContent, { paddingBottom: resultsFooterHeight + 24 }]}
              numColumns={2}
              renderItem={({ item }) => (
                <View style={[
                  styles.wordItem, 
                  { backgroundColor: background.cardColor, borderColor: background.borderColor }
                ]}>
                  <Text style={[
                    styles.wordText,
                    { color: background.textColor },
                    item.found && styles.wordTextFound
                  ]}>
                    {item.word}
                  </Text>
                  <Text style={[styles.wordScore, { color: background.secondaryText }]}>
                    {item.score} pts
                  </Text>
                </View>
              )}
            />
          </View>
        </ScrollView>

        {/* Buttons + share + page dots — pinned to the bottom of the screen
            via position:absolute (height measured through onLayout below) so
            they never shift when the swipe carousel's two pages differ in
            content height. The scrollable pages above pad themselves out by
            resultsFooterHeight so their content never renders underneath. */}
        <View
          style={[styles.resultsFooter, { backgroundColor: background.backgroundColor }]}
          onLayout={(e) => setResultsFooterHeight(e.nativeEvent.layout.height)}
        >
        <View style={styles.resultsButtonRow}>
          {!isDaily && (
            <Pressable
              style={({ pressed }) => [styles.primaryButton, { borderColor: background.borderColor, backgroundColor: background.backgroundColor, opacity: pressed ? 0.75 : 1 }]}
              onPress={() => startPracticeGame(gameMode as 'blitz' | 'standard', letterCount)}
            >
              <Text style={[styles.primaryButtonText, { color: background.textColor }]}>Play Again</Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              isDaily && styles.primaryButtonFullWidth,
              { borderColor: background.borderColor, backgroundColor: background.backgroundColor, opacity: pressed ? 0.75 : 1 },
            ]}
            onPress={backToMenu}
          >
            <Text style={[styles.primaryButtonText, { color: background.textColor }]}>Main Menu</Text>
          </Pressable>
        </View>

        {/* Share — now available for Blitz/Standard too, not just Daily, so
            every game mode has the same "flex your result" option. */}
        <Pressable
          style={({ pressed }) => [styles.shareButton, { opacity: pressed ? 0.75 : 1 }]}
          onPress={() => shareResult({
            isDaily,
            totalFound: stats.totalFound,
            totalPossible: stats.totalPossible,
            percentFound: stats.percentFound,
            modeLabel: !isDaily ? (gameMode === 'blitz' ? 'Blitz · 30s' : 'Standard · 60s') : undefined,
          })}
        >
          <View style={styles.shareButtonInner}>
            <Share2 size={18} color="#fff" />
            <Text style={styles.shareButtonText}>Share Result</Text>
          </View>
        </Pressable>

        {/* Page Indicator Dots + Swipe Hint */}
        <View style={styles.pageIndicatorContainer}>
          <View style={styles.pageIndicatorLabels}>
            <Text style={[
              styles.pageIndicatorLabel,
              { color: gameOverPage === 'results' ? background.textColor : background.secondaryText }
            ]}>
              Results
            </Text>
            <Text style={[
              styles.pageIndicatorLabel,
              { color: gameOverPage === 'words' ? background.textColor : background.secondaryText }
            ]}>
              All Words
            </Text>
          </View>
          <View style={styles.pageIndicator}>
            <View style={[styles.pageDot, gameOverPage === 'results' && styles.pageDotActive]} />
            <View style={[styles.pageDot, gameOverPage === 'words' && styles.pageDotActive]} />
          </View>
          {/* Always rendered (never conditionally mounted) so this line's
              height is part of the footer's layout on both pages — the
              footer is absolutely positioned and sized by its own content,
              so unmounting this text on the "words" page used to shrink the
              footer and yank the Main Menu/Share buttons above it downward
              on every swipe. Toggling opacity instead keeps the height
              constant and the buttons still. */}
          <Text
            style={[styles.swipeHintText, { color: background.secondaryText, opacity: gameOverPage === 'results' ? 1 : 0 }]}
          >
            Swipe for all words →
          </Text>
        </View>
        </View>

        {/* First-Time Swipe Tooltip */}
        {showSwipeTooltip && (
          <TouchableOpacity 
            style={styles.tooltipOverlay} 
            activeOpacity={1} 
            onPress={dismissSwipeTooltip}
          >
            <View style={[styles.tooltip, { backgroundColor: background.cardColor }]}>
              <Text style={[styles.tooltipText, { color: background.textColor }]}>
                Swipe left to see all possible words!
              </Text>
              <Text style={[styles.tooltipDismiss, { color: background.secondaryText }]}>
                Tap anywhere to dismiss
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    );
  }

  // ==================== GAMEPLAY SCREEN ====================
  if (gameMode !== 'menu') {
    const tileSize = getTileSize();
    const isDaily = gameMode === 'daily';

    const letterRows = getLetterRows();

    return (
      <SafeAreaView style={[styles.gameplayContainer, dynamicStyles.container]}>
        <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />

        <View style={styles.header}>
          <TouchableOpacity onPress={handleGameplayBackPress}>
            <Text style={[styles.backButton, dynamicStyles.textSecondary]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.timer, dynamicStyles.text, timeLeft <= 10 && styles.timerWarning]}>
            {formatTime(timeLeft)}
          </Text>
          <Text style={styles.scoreText}>{score} pts</Text>
        </View>

        {/* Top spacer pushes interactive content toward bottom for thumb reach */}
        <View style={{ flex: 1 }} />

        <Text style={[styles.message, dynamicStyles.textSecondary]}>{message}</Text>

        <View style={styles.wordDisplay}>
          <Text style={currentWord ? [styles.currentWord, dynamicStyles.text] : [styles.currentWordPlaceholder, dynamicStyles.textSecondary]}>
            {currentWord || '_ _ _'}
          </Text>
        </View>

        {/* Letter grid rendered as explicit rows */}
        <View style={styles.letterGrid}>
          {letterRows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.letterRow}>
              {row.map((index) => (
                <GameTile
                  key={index}
                  letter={letters[index]}
                  index={index}
                  isSelected={selectedIndices.includes(index)}
                  selectionOrder={selectedIndices.includes(index) ? selectedIndices.indexOf(index) + 1 : null}
                  onPress={handleLetterPress}
                  tileSize={tileSize}
                  tierName={equippedTier}
                  variant={equippedVariant}
                  appBg={background.backgroundColor}
                />
              ))}
            </View>
          ))}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
            <Text style={styles.buttonText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.buttonText}>Submit</Text>
          </TouchableOpacity>
        </View>

        {/* Matches the "Shuffle" button standard used across every game with
            this mechanism (Anagrams): an icon + "Shuffle" label, not a wide
            text-only "Refresh Letters" button. */}
        {!isDaily && (
          <TouchableOpacity
            style={[styles.refreshButton, dynamicStyles.button]}
            onPress={handleRefresh}
          >
            <RotateCw size={16} color={dynamicStyles.textSecondary.color} />
            <Text style={[styles.refreshButtonText, dynamicStyles.textSecondary]}>Shuffle</Text>
          </TouchableOpacity>
        )}

        <View style={styles.foundWordsSection}>
          <Text style={[styles.foundWordsTitle, dynamicStyles.textSecondary]}>Found: {foundWords.length}</Text>
          <View style={styles.foundWordsWrap}>
            {foundWords.map((word: string, index: number) => (
              <View key={index} style={styles.foundWordBadgeSmall}>
                <Text style={styles.foundWordTextSmall}>{word.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ==================== MAIN MENU WITH SEGMENTS ====================
  return (
    <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />
      <FallingLetters />

      {/* Achievement Popup */}
      <AchievementPopup
        achievement={currentPopupAchievement}
        onDismiss={handleAchievementDismiss}
        backgroundColor={background.cardColor}
        textColor={background.textColor}
      />
      
      {/* Header */}
      <View style={styles.appHeader}>
        <TouchableOpacity style={styles.backToGamesButton} onPress={backToAppMenu}>
          <Text style={[styles.backToGamesText, dynamicStyles.textSecondary]}>← Games</Text>
        </TouchableOpacity>
        <Text style={[styles.appTitle, dynamicStyles.text]}>Wordsmith</Text>
        <View style={{ flex: 1 }} />
      </View>
      
      {/* Segment Switcher */}
      <View style={[styles.segmentSwitcher, { backgroundColor: background.cardColor }]}>
        {(['play', 'customize', 'stats'] as SegmentKey[]).map((key) => {
          const isActive = key === segment;
          const label = key === 'play' ? 'Play' : key === 'customize' ? 'Customize' : 'Stats';

          return (
            <Pressable
              key={key}
              style={[
                styles.segmentButton,
                isActive && { backgroundColor: background.backgroundColor },
              ]}
              onPress={() => handleSegmentPress(key)}
            >
              <Text
                style={[
                  styles.segmentButtonText,
                  { color: background.secondaryText },
                  isActive && { color: background.textColor, fontWeight: '600' },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ===== TAB STRIP (horizontal swipe pager) ===== */}
      <View
        style={styles.tabStripWrapper}
        {...menuPanResponder.panHandlers}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - tabAreaHeight) > 1) setTabAreaHeight(h);
        }}
      >
      <Animated.View
        style={[
          styles.tabStrip,
          tabAreaHeight ? { height: tabAreaHeight } : null,
          { transform: [{ translateX: tabAnim.interpolate({
            inputRange: [0, 1, 2],
            outputRange: [0, -width, -width * 2],
          }) }] }
        ]}
      >

      {/* ===== PLAY TAB ===== */}
      <ScrollView
        style={{ width, flex: 1 }}
        contentContainerStyle={styles.playContainer}
        showsVerticalScrollIndicator={false}
      >
          {/* Daily Challenge Card */}
          <View style={[
            styles.dailyCard,
            dynamicStyles.card,
            { borderWidth: 2 },
            dailyPlayed && { borderColor: COLORS.accent }
          ]}>
            <Text style={[styles.dailyTitle, dynamicStyles.text]}>Daily Challenge</Text>
            <Text style={[styles.dailySubtitle, dynamicStyles.textSecondary]}>
              {formatDate()}
            </Text>
            
            {/* Score display (only when completed) */}
            {dailyPlayed && dailyResult && (
              <View style={styles.dailyCompletedInfo}>
                <Text style={styles.dailyCompletedScore}>{dailyResult.score}</Text>
                <Text style={[styles.dailyCompletedLabel, dynamicStyles.textSecondary]}>
                  Today's Score • {dailyResult.words.length} words
                </Text>
              </View>
            )}

            {/* Streak Stats */}
            <View style={styles.dailyStatPillRow}>
              <DailyStatPill
                label="Current streak"
                value={dailyChallenge?.dailyStreak || 0}
                icon={Flame}
                iconColor="#e85d04"
                highlight={true}
                secondaryText={background.secondaryText}
              />
              <DailyStatPill
                label="Best streak"
                value={dailyChallenge?.bestDailyStreak || 0}
                icon={Trophy}
                iconColor="#d4a017"
                secondaryText={background.secondaryText}
              />
            </View>

            {/* Play Button (only when not completed) */}
            {!dailyPlayed && (
              <TouchableOpacity 
                style={[styles.dailyButton, dynamicStyles.button, { borderWidth: 2 }]}
                onPress={startDailyChallenge}
              >
                <Text style={[styles.dailyButtonText, dynamicStyles.text]}>Play Today's Challenge</Text>
              </TouchableOpacity>
            )}

            {/* View Results + Share (when completed) */}
            {dailyPlayed && (
              <View style={styles.dailyActionRow}>
                <TouchableOpacity
                  style={[styles.dailyActionButton, dynamicStyles.button, { borderWidth: 1.5 }]}
                  onPress={() => setShowDailyResultModal(true)}
                >
                  <Text style={[styles.dailyActionText, dynamicStyles.text]}>View Results</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.dailyShareIconButton, { borderColor: background.borderColor, backgroundColor: background.backgroundColor, borderWidth: 1.5 }]}
                  onPress={shareDailyFromMenu}
                >
                  <Share2 size={18} color={background.textColor} />
                </TouchableOpacity>
              </View>
            )}

            {/* Countdown Timer (only when completed) */}
            {dailyPlayed && (
              <View style={styles.dailyCountdownContainer}>
                <Text style={[styles.dailyCountdownLabel, dynamicStyles.textSecondary]}>
                  Next challenge in
                </Text>
                <Text style={[styles.dailyCountdownTime, dynamicStyles.text]}>
                  {countdownToNextDaily}
                </Text>
              </View>
            )}
          </View>

          {/* Mode Selection */}
          {modeSelection === 'none' ? (
            // Step 1: Choose Mode
            <>
              <TouchableOpacity
                style={[styles.modeCard, dynamicStyles.card, { borderWidth: 2 }]}
                onPress={() => setModeSelection('blitz')}
                activeOpacity={0.7}
              >
                <Text style={[styles.modeCardTitle, dynamicStyles.text]}>Blitz Mode</Text>
                <Text style={[styles.modeCardSubtitle, dynamicStyles.textSecondary]}>30 seconds</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeCard, dynamicStyles.card, { borderWidth: 2 }]}
                onPress={() => setModeSelection('standard')}
                activeOpacity={0.7}
              >
                <Text style={[styles.modeCardTitle, dynamicStyles.text]}>Standard Mode</Text>
                <Text style={[styles.modeCardSubtitle, dynamicStyles.textSecondary]}>60 seconds</Text>
              </TouchableOpacity>
            </>
          ) : (
            // Step 2: Choose Letter Count
            <View style={[styles.letterSelectCard, dynamicStyles.card, { borderWidth: 2 }]}>
              <Text style={[styles.letterSelectTitle, dynamicStyles.text]}>
                {modeSelection === 'blitz' ? 'Blitz Mode' : 'Standard Mode'}
              </Text>
              <Text style={[styles.letterSelectSubtitle, dynamicStyles.textSecondary]}>
                How many letters?
              </Text>
              
              <View style={styles.letterCountRow}>
                {[6, 7, 8].map((count) => (
                  <TouchableOpacity
                    key={count}
                    style={[styles.letterCountButton, dynamicStyles.button, { borderWidth: 2 }]}
                    onPress={() => {
                      startPracticeGame(modeSelection, count);
                      setModeSelection('none');
                    }}
                  >
                    <Text style={[styles.letterCountText, dynamicStyles.text]}>{count}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <TouchableOpacity
                style={styles.backToModesButton}
                onPress={() => setModeSelection('none')}
              >
                <Text style={[styles.backToModesText, dynamicStyles.textSecondary]}>← Back</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* How to Play */}
          <Text style={[styles.sectionLabel, dynamicStyles.text, { marginTop: 24 }]}>How to Play</Text>
          <View style={[styles.rulesCard, dynamicStyles.card, { borderWidth: 1.5 }]}>
            {[
              'You are given a set of letters — form as many words as you can',
              'Words must be 3+ letters and use only the provided letters',
              'Each letter can only be used as many times as it appears',
              'Longer words score more points',
              'Race the clock — Blitz is 30s, Standard is 60s',
            ].map((rule, i) => (
              <View key={i} style={styles.ruleItem}>
                <Text style={[styles.ruleNumber, { color: COLORS.accent }]}>{i + 1}</Text>
                <Text style={[styles.ruleText, dynamicStyles.textSecondary]}>{rule}</Text>
              </View>
            ))}
          </View>
          
          <View style={{ height: 40 }} />
        </ScrollView>

      {/* ===== CUSTOMIZE TAB ===== */}
      <View style={[styles.customizeContainer, { width }]}>
        <CustomizeScreen
          onBack={() => handleSegmentPress('play')}
          embedded
          onTileChange={refreshPlayerData}
          onPopupChange={setPanLocked}
          appBg={background.backgroundColor}
        />
      </View>

      {/* ===== STATS TAB ===== */}
      <ScrollView
        style={{ width, flex: 1 }}
        contentContainerStyle={styles.statsContainer}
        showsVerticalScrollIndicator={false}
      >
          
          {/* Daily Challenge Stats Section */}
          {dailyChallenge && dailyChallenge.dailyGamesPlayed > 0 && (
            <>
              <Text style={[styles.statsTitle, dynamicStyles.text]}>Daily Challenge Stats</Text>
              <View style={styles.statsGrid}>
                <StatsCard 
                  label="Dailies Played" 
                  value={dailyChallenge.dailyGamesPlayed.toString()} 
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard 
                  label="Current Streak" 
                  value={`${dailyChallenge.dailyStreak} ${dailyChallenge.dailyStreak === 1 ? 'day' : 'days'}`}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard 
                  label="Best Streak" 
                  value={`${dailyChallenge.bestDailyStreak} ${dailyChallenge.bestDailyStreak === 1 ? 'day' : 'days'}`}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard 
                  label="Best Score" 
                  value={dailyChallenge.bestDailyScore.toString()} 
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard 
                  label="Avg Score" 
                  value={getDailyAverageScore(dailyChallenge).toString()} 
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard 
                  label="Best Words" 
                  value={dailyChallenge.bestDailyWords.toString()} 
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard 
                  label="Avg Words" 
                  value={getDailyAverageWords(dailyChallenge).toString()} 
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard 
                  label="Total Score" 
                  value={dailyChallenge.dailyTotalScore.toLocaleString()} 
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
              </View>
            </>
          )}
          
          {/* Daily History Calendar */}
          {Object.keys(dailyHistory).length > 0 && (
            <>
              <Text style={[styles.statsTitle, dynamicStyles.text, { marginTop: 25 }]}>Daily History</Text>
              <DailyCalendar
                history={dailyHistory}
                accentColor={COLORS.accent}
                textColor={background.textColor}
                secondaryTextColor={background.secondaryText}
                cardColor={background.cardColor}
                borderColor={background.borderColor}
              />
            </>
          )}

          {/* Standard & Blitz Stats Section */}
          <Text style={[styles.statsTitle, dynamicStyles.text, dailyChallenge && dailyChallenge.dailyGamesPlayed > 0 && { marginTop: 25 }]}>
            Standard & Blitz Stats
          </Text>
          
          {playerStats ? (
            <View style={styles.statsGrid}>
              <StatsCard 
                label="Games Played" 
                value={playerStats.gamesPlayed.toString()} 
                textColor={background.textColor}
                secondaryText={background.secondaryText}
                cardColor={background.cardColor}
                borderColor={background.borderColor}
              />
              <StatsCard 
                label="Total Score" 
                value={playerStats.totalScore.toLocaleString()} 
                textColor={background.textColor}
                secondaryText={background.secondaryText}
                cardColor={background.cardColor}
                borderColor={background.borderColor}
              />
              <StatsCard 
                label="High Score" 
                value={playerStats.highScore.toString()} 
                textColor={background.textColor}
                secondaryText={background.secondaryText}
                cardColor={background.cardColor}
                borderColor={background.borderColor}
              />
              <StatsCard 
                label="Avg Score" 
                value={getAverageScore(playerStats).toString()} 
                textColor={background.textColor}
                secondaryText={background.secondaryText}
                cardColor={background.cardColor}
                borderColor={background.borderColor}
              />
              <StatsCard 
                label="Words Found" 
                value={playerStats.totalWordsFound.toString()} 
                textColor={background.textColor}
                secondaryText={background.secondaryText}
                cardColor={background.cardColor}
                borderColor={background.borderColor}
              />
              <StatsCard 
                label="Words/Game" 
                value={getWordsPerGame(playerStats).toString()} 
                textColor={background.textColor}
                secondaryText={background.secondaryText}
                cardColor={background.cardColor}
                borderColor={background.borderColor}
              />
              <StatsCard 
                label="Longest Word" 
                value={playerStats.longestWord.toUpperCase() || '-'} 
                wide
                textColor={background.textColor}
                secondaryText={background.secondaryText}
                cardColor={background.cardColor}
                borderColor={background.borderColor}
              />
              <StatsCard 
                label="Favorite Mode" 
                value={getFavoriteMode(playerStats)} 
                textColor={background.textColor}
                secondaryText={background.secondaryText}
                cardColor={background.cardColor}
                borderColor={background.borderColor}
              />
              <StatsCard 
                label="Favorite Letters" 
                value={getFavoriteLetterCount(playerStats)} 
                textColor={background.textColor}
                secondaryText={background.secondaryText}
                cardColor={background.cardColor}
                borderColor={background.borderColor}
              />
            </View>
          ) : (
            <Text style={[styles.loadingText, dynamicStyles.textSecondary]}>Loading stats...</Text>
          )}
          
          {/* Achievements Section — unlocked first, then locked */}
          <Text style={[styles.statsTitle, dynamicStyles.text, { marginTop: 25 }]}>
            Achievements ({unlockedAchievements.length}/{ACHIEVEMENTS.length})
          </Text>

          {/* Unlocked */}
          {unlockedAchievements.length > 0 && (
            <View style={styles.achievementsGrid}>
              {ACHIEVEMENTS.filter(a => unlockedAchievements.some(u => u.id === a.id)).map((achievement) => (
                <View
                  key={achievement.id}
                  style={[styles.achievementCard, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}
                >
                  <View style={styles.achievementEmoji}>
                    <AchievementIcon category={achievement.category} size={26} color={background.textColor} />
                  </View>
                  <Text style={[styles.achievementName, { color: background.textColor }]}>{achievement.name}</Text>
                  <Text style={[styles.achievementDesc, { color: background.secondaryText }]}>{achievement.description}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Divider */}
          {unlockedAchievements.length > 0 && unlockedAchievements.length < ACHIEVEMENTS.length && (
            <View style={styles.lockedDivider}>
              <View style={[styles.dividerLine, { backgroundColor: background.borderColor }]} />
              <Text style={[styles.dividerText, { color: background.secondaryText }]}>Locked</Text>
              <View style={[styles.dividerLine, { backgroundColor: background.borderColor }]} />
            </View>
          )}

          {/* Locked */}
          {ACHIEVEMENTS.filter(a => !unlockedAchievements.some(u => u.id === a.id)).length > 0 && (
            <View style={styles.achievementsGrid}>
              {ACHIEVEMENTS.filter(a => !unlockedAchievements.some(u => u.id === a.id)).map((achievement) => {
                const progress = getWordBuilderProgress(achievement.id, playerStats, dailyChallenge);
                return (
                  <View
                    key={achievement.id}
                    style={[styles.achievementCard, styles.achievementCardLocked, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}
                  >
                    <View style={[styles.achievementEmoji, styles.achievementEmojiLocked]}>
                      <AchievementIcon category={achievement.category} size={26} color={background.textColor} />
                    </View>
                    <Text style={[styles.achievementName, styles.achievementTextLocked, { color: background.textColor }]}>{achievement.name}</Text>
                    <Text style={[styles.achievementDesc, styles.achievementTextLocked, { color: background.secondaryText }]}>{achievement.description}</Text>
                    {progress > 0 && (
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
          
          <View style={{ height: 40 }} />
        </ScrollView>

      </Animated.View>
      </View>

      {/* Daily results — native Modal + transparent card so this reads as a
          full results SCREEN (cream page background, white stat pills), exactly
          like Anagrams / Word Ladder / Furdle. Previously a solid white card on
          a cream page, which looked like a floating white box. */}
      <Modal
        visible={showDailyResultModal && !!dailyResult}
        transparent={false}
        animationType="none"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowDailyResultModal(false)}
      >
        {dailyResult && (
        <View style={[styles.modalOverlay, { backgroundColor: background.backgroundColor }]}>
          <View style={[styles.modalPageHeader, { paddingTop: insets.top + 10 }]}>
            <View style={styles.modalHeaderSpacer} />
            <Text style={[styles.modalBrand, { color: background.secondaryText }]}>WORDSMITH</Text>
            <Pressable
              style={({ pressed }) => [styles.modalCloseIcon, { opacity: pressed ? 0.6 : 1 }]}
              onPress={() => setShowDailyResultModal(false)}
              hitSlop={16}
            >
              <X size={22} color={background.secondaryText} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.modalScrollContent, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
          >
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: background.textColor }]}>
              {dailyResult.score >= 2000 ? 'Outstanding!' :
               dailyResult.score >= 1000 ? 'Great Job!' :
               dailyResult.score >= 500  ? 'Nice!' :
               dailyResult.score >= 200  ? 'Good Game!' : 'Keep Practicing!'}
            </Text>
            <Text style={[styles.modalSubtitle, { color: background.secondaryText }]}>
              You scored {dailyResult.score} pts and found {dailyResult.words.length} words.
            </Text>

            <View style={[styles.modalScoreBox, { borderColor: background.borderColor }]}>
              <Text style={[styles.modalScoreBoxLabel, { color: background.secondaryText }]}>Score</Text>
              <Text style={[styles.modalScoreBoxValue, { color: background.textColor }]}>{dailyResult.score}</Text>
              <Text style={[styles.modalScoreBoxWords, { color: background.secondaryText }]}>{dailyResult.words.length} words found</Text>
            </View>

            <View style={[styles.modalDividerLine, { backgroundColor: background.borderColor }]} />
            <Text style={[styles.modalSectionTitle, { color: background.textColor }]}>STATS</Text>
            <View style={styles.modalStatsRow}>
              <View style={[styles.modalStatPill, { borderColor: background.borderColor, backgroundColor: background.cardColor }]}>
                <Text style={[styles.modalStatPillLabel, { color: background.textColor }]}>Streak</Text>
                <Text style={[styles.modalStatPillValue, { color: background.textColor }]}>{dailyChallenge?.dailyStreak ?? 0}</Text>
              </View>
              <View style={[styles.modalStatPill, { borderColor: background.borderColor, backgroundColor: background.cardColor }]}>
                <Text style={[styles.modalStatPillLabel, { color: background.textColor }]}>Best</Text>
                <Text style={[styles.modalStatPillValue, { color: background.textColor }]}>{dailyChallenge?.bestDailyStreak ?? 0}</Text>
              </View>
            </View>

            <View style={[styles.modalDividerLine, { backgroundColor: background.borderColor }]} />
            <Text style={[styles.modalCountdownLabel, { color: background.secondaryText }]}>Next Daily in</Text>
            <Text style={[styles.modalCountdownValue, { color: background.textColor }]}>{countdownToNextDaily}</Text>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalPillButton, styles.modalPillButtonFullWidth, { borderColor: background.borderColor, backgroundColor: background.cardColor }]}
                onPress={() => { setShowDailyResultModal(false); backToAppMenu(); }}
              >
                <Text style={[styles.modalPillButtonText, { color: background.textColor }]}>Main Menu</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.modalGreenShareBtn} onPress={shareDailyFromMenu}>
              <View style={styles.modalShareBtnInner}>
                <Share2 size={18} color="#fff" />
                <Text style={styles.modalShareBtnText}>Share Result</Text>
              </View>
            </TouchableOpacity>
          </View>
          </ScrollView>
        </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 5,
  },
  backToGamesButton: {
    flex: 1,
    alignItems: 'flex-start',
    padding: 8,
  },
  backToGamesText: {
    fontSize: 14,
    fontWeight: '500',
  },
  appTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  
  // Segment Switcher
  segmentSwitcher: {
    flexDirection: 'row',
    alignSelf: 'center',
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
    fontWeight: '500',
  },
  
  // Tab Strip
  tabStripWrapper: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'flex-start',
  },
  // flex:1 is required here. Without it, this row has no definite height for
  // its ScrollView children to stretch into, so content gets clipped by the
  // overflow:hidden wrapper before it reaches the true screen bottom.
  tabStrip: {
    flex: 1,
    width: width * 3,
    flexDirection: 'row',
    alignSelf: 'flex-start',
  },

  // Play Segment
  playContainer: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 40,
  },
  dailyCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  dailyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  dailySubtitle: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  dailyButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  dailyButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  dailyCompletedInfo: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  dailyCompletedScore: {
    fontSize: 48,
    fontWeight: 'bold',
    color: COLORS.accent,
  },
  dailyCompletedLabel: {
    fontSize: 14,
    marginTop: 4,
  },
  // Daily Stat Pills (streak display)
  dailyStatPillRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
  },
  dailyStatPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f3e7d7',
    minWidth: 100,
    alignItems: 'center',
  },
  dailyStatPillHighlight: {
    backgroundColor: 'rgba(78, 204, 163, 0.15)',
  },
  dailyStatPillLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  dailyStatPillValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dailyStatPillValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2c2416',
  },
  // Daily action row (View Results + Share)
  dailyActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  dailyActionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  dailyActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dailyShareIconButton: {
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Daily result modal
  // Inside a native Modal, so this fills the screen on its own.
  modalOverlay: { flex: 1 },
  modalPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  modalHeaderSpacer: { width: 22 },
  modalCloseIcon: { width: 22, alignItems: 'flex-end' },
  modalScrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  // Transparent — the page background shows through, matching the other games'
  // result screens. A solid cardColor here is what made it look like a box.
  modalCard: { width: '100%', maxWidth: 420, borderRadius: 18, padding: 8 },
  modalBrand: { textAlign: 'center', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  modalTitle: { textAlign: 'center', fontSize: 24, fontWeight: '900', marginBottom: 8, marginTop: 20 },
  modalSubtitle: { textAlign: 'center', fontSize: 14, fontWeight: '600', marginBottom: 12 },
  modalScoreBox: { borderWidth: 2, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', marginBottom: 4 },
  modalScoreBoxLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  modalScoreBoxValue: { fontSize: 40, fontWeight: '900', letterSpacing: 2 },
  modalScoreBoxWords: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  modalDividerLine: { height: 1, marginVertical: 12, opacity: 0.35 },
  modalSectionTitle: { fontSize: 14, fontWeight: '900', marginBottom: 8, textAlign: 'center', letterSpacing: 1 },
  modalStatsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 },
  modalStatPill: { borderWidth: 2, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, minWidth: 120, alignItems: 'center' },
  modalStatPillLabel: { fontSize: 11, fontWeight: '800', opacity: 0.8, marginBottom: 2 },
  modalStatPillValue: { fontSize: 14, fontWeight: '900' },
  modalCountdownLabel: { textAlign: 'center', fontSize: 12, fontWeight: '800', marginBottom: 4, letterSpacing: 1 },
  modalCountdownValue: { textAlign: 'center', fontSize: 18, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  modalButtonRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 24 },
  modalPillButton: { borderWidth: 2, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, minWidth: 120, alignItems: 'center' },
  modalPillButtonFullWidth: { width: '100%', paddingVertical: 12, minWidth: undefined },
  modalPillButtonText: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  modalGreenShareBtn: { marginTop: 18, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', backgroundColor: '#22c55e' },
  modalShareBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalShareBtnText: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  modalSecondaryButton: { marginTop: 10, borderWidth: 2, borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  modalSecondaryButtonText: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  // Countdown Timer
  dailyCountdownContainer: {
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  dailyCountdownLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  dailyCountdownTime: {
    fontSize: 20,
    fontWeight: '600',
  },
  // Mode Selection Cards
  modeCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  rulesCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  ruleNumber: {
    fontSize: 15,
    fontWeight: '800',
    width: 22,
    marginTop: 1,
  },
  ruleText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
    modeCardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  modeCardSubtitle: {
    fontSize: 14,
  },
  
  // Letter Count Selection
  letterSelectCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    alignItems: 'center',
  },
  letterSelectTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  letterSelectSubtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  letterCountRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  letterCountButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minWidth: 80,
    alignItems: 'center',
  },
  letterCountText: {
    fontSize: 18,
    fontWeight: '600',
  },
  backToModesButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  backToModesText: {
    fontSize: 14,
  },
  
  // Customize Segment
  customizeContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  
  // Stats Segment
  statsContainer: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 40,
  },
  statsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  statsCard: {
    width: '48%',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  statsCardWide: {
    width: '100%',
  },
  statsValue: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statsLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  
  // Achievements
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  achievementCard: {
    width: '48%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  achievementEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  achievementEmojiLocked: {
    opacity: 0.5,
  },
  achievementName: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 2,
  },
  achievementDesc: {
    fontSize: 11,
    textAlign: 'center',
  },
  progressTrack: {
    marginTop: 8,
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#22c55e',
  },

  // Gameplay
  gameplayContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  backButton: {
    fontSize: 16,
    fontWeight: '500',
  },
  timer: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  timerWarning: {
    color: COLORS.danger,
  },
  scoreText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.accent,
  },
  message: {
    fontSize: 16,
    marginBottom: 15,
    height: 20,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  wordDisplay: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginBottom: 12,
    minWidth: 240,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentWord: {
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 6,
  },
  currentWordPlaceholder: {
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 6,
    opacity: 0.3,
  },
  letterGrid: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    marginTop: 6,
  },
  letterRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 14,
  },
  clearButton: {
    backgroundColor: COLORS.danger,
    paddingHorizontal: 44,
    paddingVertical: 16,
    borderRadius: 30,
    minWidth: 120,
    alignItems: 'center',
  },
  submitButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 44,
    paddingVertical: 16,
    borderRadius: 30,
    minWidth: 120,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 999,
    marginBottom: 12,
    borderWidth: 1.5,
    minWidth: 130,
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  // Found words — fixed height so nothing shifts when words are added
  foundWordsSection: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 8,
    height: 180,
    overflow: 'hidden',
  },
  foundWordsTitle: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  foundWordsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  foundWordBadgeSmall: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(78,204,163,0.15)',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  foundWordTextSmall: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.accent,
  },

  // Game Over Screen
  gameOverContainer: {
    flex: 1,
  },
  resultsPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  resultsHeaderSpacer: {
    width: 22,
  },
  resultsCloseIconButton: {
    width: 22,
    alignItems: 'flex-end',
  },
  carousel: {
    flex: 1,
  },
  resultsFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  carouselPage: {
    flex: 1,
    paddingTop: 20,
  },
  resultsPageContent: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  pageIndicatorContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingBottom: 20,
  },
  pageIndicatorLabels: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    marginBottom: 8,
  },
  pageIndicatorLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  pageIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  pageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  pageDotActive: {
    backgroundColor: COLORS.accent,
  },
  swipeHintText: {
    fontSize: 13,
    marginTop: 10,
    fontStyle: 'italic',
  },
  // Results card (Wordle-style)
  resultsCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    padding: 8,
  },
  brand: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 6,
  },
  gameOverTitle: {
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 4,
  },
  gameOverSubtitle: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  scoreBox: {
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  scoreValue: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 2,
  },
  scoreSubLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  resultsDivider: {
    height: 1,
    marginVertical: 12,
  },
  resultsSectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  statPill: {
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 120,
    alignItems: 'center',
  },
  statPillLabel: {
    fontSize: 11,
    fontWeight: '800',
    opacity: 0.8,
    marginBottom: 2,
  },
  statPillValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  resultsButtonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 26,
    gap: 10,
    marginTop: 24,
  },
  primaryButton: {
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 120,
    alignItems: 'center',
  },
  primaryButtonFullWidth: {
    width: '100%',
    paddingVertical: 12,
    minWidth: undefined,
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  shareButton: {
    marginTop: 18,
    marginHorizontal: 26,
    backgroundColor: '#22c55e',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  shareButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
  },
  wordsPageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  wordsPageSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 15,
  },
  wordsList: {
    flex: 1,
    paddingHorizontal: 15,
  },
  wordsListContent: {
    paddingBottom: 20,
  },
  wordItem: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: 4,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  wordText: {
    fontSize: 16,
    fontWeight: '600',
  },
  wordTextFound: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  wordScore: {
    fontSize: 12,
  },
  tooltipOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltip: {
    marginHorizontal: 40,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  tooltipText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
  },
  tooltipDismiss: {
    fontSize: 14,
  },

  achievementCardLocked: { opacity: 0.5 },
  achievementTextLocked: { opacity: 0.7 },
  lockedDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 15, fontSize: 14, fontWeight: '500' },
});
