import { router } from 'expo-router';
import { AchievementIcon } from '../shared/AchievementIcon';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../shared/ThemeContext';
import { COLORS } from '../shared/theme';
import { maybeRequestReview } from '../shared/reviewPrompt';
import { syncDailyReminder, maybeFlagReminderOptIn } from '../shared/dailyReminders';

import { AchievementPopup } from '../shared/AchievementPopup';
import { FallingLetters } from '../shared/FallingLetters';
import DailyCalendar, { type CalendarHistory } from '../shared/DailyCalendar';
import { DailyChallengeCard } from './Components/DailyChallengeCard';
import { DailyChallengePopup } from './Components/DailyChallengePopup';
import { GameStatus } from './Components/GameStatus';
import { HangmanFigure } from './Components/HangmanFigure';
import { Keyboard } from './Components/Keyboard';
import { WordDisplay } from './Components/WordDisplay';

import {
  DailyChallengeStats,
  getTodayDateString,
  loadDailyStats,
  saveDailyResult,
  pickDailyCategory,
  pickDailyWordFromCategory,
  loadDailyProgress,
  saveDailyProgress,
  clearDailyProgress,
  type HangmanDailyProgress,
  loadPracticeProgress,
  savePracticeProgress,
  clearPracticeProgress,
  type HangmanPracticeProgress,
  saveHangmanDailyHistoryEntry,
  loadHangmanDailyHistory,
} from './utils/dailyChallenge';

import { useHangman } from './Hooks/useHangman';

import { PHRASE_CATEGORIES, WORD_CATEGORIES } from './data/words';
import { PROFANITY_BLOCKLIST } from '../shared/profanityBlocklist';
import {
  Achievement,
  checkAchievements,
  getLockedAchievements,
  getTotalAchievementCount,
  getUnlockedAchievementsWithDetails,
  unlockAllAchievementsForDev,
} from './utils/achievements';
import {
  getAverageIncorrectGuesses,
  getBestCategory,
  getFavoriteCategory,
  getGuessAccuracy,
  getUniqueWordsCount,
  getWinRate,
  HangmanStats,
  loadHangmanStats,
  updateStatsAfterGame,
  DEBUG_UNLOCK_ALL_HANGMAN,
} from './utils/storage';

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  dbgOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FF00FF',
    paddingVertical: 4,
    paddingHorizontal: 6,
    zIndex: 999,
    elevation: 999,
  },
  dbgText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10 },
  backButton: { flex: 1, alignItems: 'flex-start', padding: 8 },
  backButtonText: { fontSize: 16, fontWeight: '500' },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  headerPlaceholder: { flex: 1 },
  segmentSwitcher: { flexDirection: 'row', alignSelf: 'center', marginTop: 12, marginBottom: 8, borderRadius: 999, padding: 4 },
  segmentButton: { paddingVertical: 8, paddingHorizontal: 24, borderRadius: 999 },
  segmentButtonText: { fontSize: 14, fontWeight: '500' },
  playScrollView: { flex: 1 },
  playContainer: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 20 },
  startTitle: { fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  startDescription: { fontSize: 16, textAlign: 'center', marginBottom: 24 },
  gameModeCard: { width: '100%', padding: 20, borderRadius: 16, borderWidth: 2, marginBottom: 12, alignItems: 'center' },
  gameModeTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  gameModeDescription: { fontSize: 14 },
  rulesContainer: { width: '100%', padding: 20, borderRadius: 16, borderWidth: 1, marginTop: 12 },
  rulesTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  ruleItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  ruleNumber: { fontSize: 18, fontWeight: 'bold', width: 28 },
  ruleText: { fontSize: 14, flex: 1 },
  gameInfoBar: { flexDirection: 'row', marginHorizontal: 20, padding: 12, borderRadius: 12, borderWidth: 1 },
  infoItem: { flex: 1, alignItems: 'center' },
  infoLabel: { fontSize: 12, marginBottom: 4 },
  infoValue: { fontSize: 16, fontWeight: 'bold' },
  infoDivider: { width: 1, marginHorizontal: 12 },
  figureContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  keyboardContainer: { paddingBottom: 16 },
  guessWordButton: { marginHorizontal: 20, marginBottom: 10, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 2 },
  guessWordButtonText: { fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  modalCard: { width: '100%', borderRadius: 20, padding: 24, borderWidth: 1 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
  modalSubtitle: { fontSize: 14, textAlign: 'center', marginBottom: 20 },
  modalInput: { borderWidth: 2, borderRadius: 12, padding: 14, fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 2 },
  modalConfirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalBtnText: { fontSize: 16, fontWeight: '700' },
  categoryContainer: { flex: 1 },
  categoryContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  categoryTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  categorySubtitle: { fontSize: 14, textAlign: 'center', marginBottom: 24 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  categoryCard: { width: '48%', padding: 20, borderRadius: 15, borderWidth: 2, alignItems: 'flex-start', justifyContent: 'center', minHeight: 80 },
  categoryCardText: { fontSize: 16, fontWeight: 'bold', textAlign: 'left' },
  statsContainer: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 40 },
  tabStripWrapper: { flex: 1, overflow: 'hidden', alignItems: 'flex-start' },
  // flex:1 is required here. Without it, this row has no definite height for
  // its ScrollView children to stretch into, so content gets clipped by the
  // overflow:hidden wrapper before it reaches the true screen bottom.
  tabStrip: { flex: 1, width: width * 2, flexDirection: 'row', alignSelf: 'flex-start' },
  statsSectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  statsCard: { width: '48%', padding: 15, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  statsCardWide: { width: '100%' },
  statsValue: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  statsLabel: { fontSize: 12, textAlign: 'center' },
  loadingText: { fontSize: 16, textAlign: 'center', marginTop: 20 },
  achievementsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  achievementCard: { width: '48%', padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  achievementCardLocked: { opacity: 0.5 },
  achievementEmoji: { fontSize: 32, marginBottom: 6 },
  achievementEmojiLocked: { opacity: 0.5 },
  achievementName: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  achievementDesc: { fontSize: 11, textAlign: 'center' },
  achievementTextLocked: { opacity: 0.7 },
  progressTrack: { marginTop: 8, width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.1)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: '#22c55e' },
  lockedDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 15, fontSize: 14, fontWeight: '500' }
});

type SegmentKey = 'play' | 'stats';
type GameMode = 'menu' | 'category-select' | 'playing';
type GameType = 'daily' | 'custom';

type StatsCardProps = {
  label: string;
  value: string;
  wide?: boolean;
  textColor: string;
  secondaryText: string;
  cardColor: string;
  borderColor: string;
};
const StatsCard: React.FC<StatsCardProps> = ({
  label,
  value,
  wide = false,
  textColor,
  secondaryText,
  cardColor,
  borderColor,
}) => (
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


type CategoryCardProps = {
  name: string;
  onPress: () => void;
  textColor: string;
  cardColor: string;
  borderColor: string;
};
const CategoryCard: React.FC<CategoryCardProps> = ({
  name,
  onPress,
  textColor,
  cardColor,
  borderColor,
}) => (
  <TouchableOpacity
    style={[styles.categoryCard, { backgroundColor: cardColor, borderColor }]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text style={[styles.categoryCardText, { color: textColor }]}>{name}</Text>
  </TouchableOpacity>
);

function getHangmanProgress(id: string, stats: import('./utils/storage').HangmanStats | null): number {
  if (!stats) return 0;
  const clamp = (v: number, t: number) => Math.min(v / t, 1);
  const cw = (cat: string) => stats.categoryWins[cat] ?? 0;
  switch (id) {
    case 'dedicated_player':    return clamp(stats.gamesPlayed, 10);
    case 'hangman_enthusiast':  return clamp(stats.gamesPlayed, 50);
    case 'hangman_addict':      return clamp(stats.gamesPlayed, 100);
    case 'on_a_roll':           return clamp(Math.max(stats.currentStreak, stats.bestStreak), 3);
    case 'hot_streak':          return clamp(Math.max(stats.currentStreak, stats.bestStreak), 5);
    case 'unstoppable':         return clamp(Math.max(stats.currentStreak, stats.bestStreak), 10);
    case 'daily_player':        return clamp(Math.max(stats.currentDayStreak, stats.bestDayStreak), 3);
    case 'weekly_warrior':      return clamp(Math.max(stats.currentDayStreak, stats.bestDayStreak), 7);
    case 'monthly_master':      return clamp(Math.max(stats.currentDayStreak, stats.bestDayStreak), 30);
    case 'hangman_master':      return clamp(stats.gamesWon, 25);
    case 'hangman_legend':      return clamp(stats.gamesWon, 50);
    case 'hangman_champion':    return clamp(stats.gamesWon, 100);
    case 'perfectionist':       return clamp(stats.perfectGames, 5);
    case 'flawless':            return clamp(stats.perfectGames, 10);
    case 'survivor':            return clamp(stats.closeGames, 5);
    case 'clutch_player':       return clamp(stats.closeGames, 10);
    case 'animal_expert':       return clamp(cw('Animals'), 10);
    case 'world_traveler':      return clamp(cw('Countries'), 10);
    case 'foodie':              return clamp(cw('Foods'), 10);
    case 'sports_fan':          return clamp(cw('Sports Teams'), 10);
    case 'tech_guru':           return clamp(cw('Technology'), 10);
    case 'film_buff':           return clamp(cw('Movie Titles'), 10);
    case 'nature_lover':        return clamp(cw('Insects'), 10);
    case 'career_counselor':    return clamp(cw('Occupations'), 10);
    case 'dino_hunter':         return clamp(cw('Dinosaurs'), 10);
    case 'superhero':           return clamp(cw('Superheroes'), 10);
    case 'star_gazer':          return clamp(cw('Space'), 10);
    case 'dog_lover':           return clamp(cw('Dog Breeds'), 10);
    case 'cat_person':          return clamp(cw('Cat Breeds'), 10);
    case 'fashion_forward':     return clamp(cw('Clothing'), 10);
    case 'game_master':         return clamp(cw('Games'), 10);
    case 'world_explorer':      return clamp(cw('Landmarks'), 10);
    case 'capital_expert':      return clamp(cw('US Capitals'), 10);
    case 'music_fan':           return clamp(cw('Song Titles'), 10);
    case 'tv_buff':             return clamp(cw('TV Show Titles'), 10);
    case 'category_king': {
      const allCats = ['Animals','Countries','Foods','Sports Teams','US Capitals','Technology','Insects','Dinosaurs','Superheroes','Cat Breeds','Dog Breeds','Space','Clothing','Games','Landmarks','Occupations','Movie Titles','Song Titles','TV Show Titles'];
      return clamp(Math.min(...allCats.map(c => cw(c))), 10);
    }
    case 'vocabulary_builder':  return clamp(stats.wordsGuessed.length, 25);
    case 'word_collector':      return clamp(stats.wordsGuessed.length, 50);
    case 'lexicon_master':      return clamp(stats.wordsGuessed.length, 100);
    case 'big_brain':           return clamp((stats.longestWordGuessed || '').length, 10);
    default: return 0;
  }
}

export default function HangmanScreen() {
  const { background } = useTheme();
  const insets = useSafeAreaInsets();
  // TEMPORARY DIAGNOSTIC STATE. Remove once the bottom-cutoff root cause is
  // confirmed. Measures the exact numbers involved so the next screenshot
  // shows hard data instead of another guess.
  const [dbgContainerHeight, setDbgContainerHeight] = useState(0);
  const [dbgHeaderHeight, setDbgHeaderHeight] = useState(0);
  const [dbgSegmentHeight, setDbgSegmentHeight] = useState(0);

  const [segment, setSegment] = useState<SegmentKey>('play');
  const SEGMENT_KEYS: SegmentKey[] = ['play', 'stats'];
  const tabAnim = useRef(new Animated.Value(0)).current;
  // Measured directly instead of trusting flex propagation through the
  // Animated.View row below. This is belt-and-suspenders after flex:1 alone
  // did not reliably give the row (and its ScrollView pages) the full
  // height, which was letting content sit un-scrollable-into below a fixed line.
  const [tabAreaHeight, setTabAreaHeight] = useState(0);
  const currentTabIdxRef = useRef(0);
  const dragBase = useRef(0);
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  const [gameType, setGameType] = useState<GameType>('custom');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [playerStats, setPlayerStats] = useState<HangmanStats | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [unlockedAchievements, setUnlockedAchievements] = useState<(Achievement & { unlockedAt: string })[]>([]);
  const [lockedAchievements, setLockedAchievements] = useState<Achievement[]>([]);
  const [pendingAchievements, setPendingAchievements] = useState<Achievement[]>([]);
  const [currentPopupAchievement, setCurrentPopupAchievement] = useState<Achievement | null>(null);

  // Daily Challenge state
  const [dailyStats, setDailyStats] = useState<DailyChallengeStats | null>(null);
  const [dailyHistory, setDailyHistory] = useState<CalendarHistory>({});
  const [dailyInProgressToday, setDailyInProgressToday] = useState(false);
  const [showDailyPopup, setShowDailyPopup] = useState(false);
  const [playingDaily, setPlayingDaily] = useState(false);
  const [dailyWord, setDailyWord] = useState<string>('');
  const [dailyGameEnded, setDailyGameEnded] = useState(false);
  const [showGuessModal, setShowGuessModal] = useState(false);
  const [resultCardClosed, setResultCardClosed] = useState(false);
  const [guessInput, setGuessInput] = useState('');
  // Stashes a restored in-progress Daily attempt (app closed/backgrounded
  // mid-game) found on launch. Not applied to the hook immediately —
  // startDailyChallenge() picks it up when the user actually taps Play, so
  // the app doesn't auto-jump into the game screen on launch.
  const resumedDailyProgressRef = useRef<HangmanDailyProgress | null>(null);
  const resumedPracticeProgressRef = useRef<HangmanPracticeProgress | null>(null);

  const {
    word,
    category,
    incorrectGuesses,
    correctGuesses,
    remainingAttempts,
    maxAttempts,
    status,
    isPlaying,
    isWon,
    isLost,
    isIdle,
    startGame,
    startGameWithCategory,
    startGameWithWord,
    hydrateGame,
    resetGame,
    guessLetter,
    guessWord,
    getDisplayWord,
    isLetterGuessed,
    isLetterCorrect,
    isLetterIncorrect,
    getGameStats,
  } = useHangman();

  const stats = getGameStats();
  const displayWord = getDisplayWord();

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      // ⚠️ DEV ONLY — gated by DEBUG_UNLOCK_ALL_HANGMAN, must be false before App Store release
      if (DEBUG_UNLOCK_ALL_HANGMAN) {
        await unlockAllAchievementsForDev();
      }

      const [stats, unlocked, locked, hist] = await Promise.all([
        loadHangmanStats(),
        getUnlockedAchievementsWithDetails(),
        getLockedAchievements(),
        loadHangmanDailyHistory().catch(() => ({})),
      ]);
      setPlayerStats(stats);
      setUnlockedAchievements(unlocked);
      setLockedAchievements(locked);
      setDailyHistory((hist as CalendarHistory) ?? {});
    };
    loadData();
    loadDailyStats().then(async (stats) => {
      setDailyStats(stats);
      // Stash an in-progress Daily attempt (if any) unless today's is done —
      // startDailyChallenge() applies it when the user taps Play.
      if (stats.lastPlayedDate !== getTodayDateString()) {
        const progress = await loadDailyProgress();
        resumedDailyProgressRef.current = progress;
        setDailyInProgressToday(!!progress);
      }
      // Stash any in-progress practice (category) game for resume.
      resumedPracticeProgressRef.current = await loadPracticeProgress();
    });
  }, []);

  // Achievement popup queue
  useEffect(() => {
    if (pendingAchievements.length > 0 && !currentPopupAchievement) {
      setCurrentPopupAchievement(pendingAchievements[0]);
      setPendingAchievements((prev) => prev.slice(1));
    }
  }, [pendingAchievements, currentPopupAchievement]);

  const handleAchievementDismiss = () => setCurrentPopupAchievement(null);

  // Save stats after regular (non-daily) game ends
  useEffect(() => {
    if ((isWon || isLost) && !playingDaily) {
      const saveGameStats = async () => {
        const updatedStats = await updateStatsAfterGame(
          isWon,
          word,
          category,
          correctGuesses.length,
          incorrectGuesses.length,
          remainingAttempts
        );
        setPlayerStats(updatedStats);

        const gameResult = {
          won: isWon,
          incorrectGuesses: incorrectGuesses.length,
          remainingLives: remainingAttempts,
        };
        const newAchievements = await checkAchievements(updatedStats, gameResult);
        if (newAchievements.length > 0) {
          setPendingAchievements((prev) => [...prev, ...newAchievements]);
        }
        const [unlocked, locked] = await Promise.all([
          getUnlockedAchievementsWithDetails(),
          getLockedAchievements(),
        ]);
        setUnlockedAchievements(unlocked);
        setLockedAchievements(locked);
      };
      saveGameStats();
    }
  }, [isWon, isLost, playingDaily]);

  // Handle daily challenge game end
  useEffect(() => {
    if (playingDaily && (isWon || isLost) && !dailyGameEnded) {
      setDailyGameEnded(true);
      
      const handleDailyEnd = async () => {
        const result = isWon ? 'won' : 'lost';
        await saveDailyResult(result, dailyWord, incorrectGuesses.length);
        await saveHangmanDailyHistoryEntry({
          dateISO: getTodayDateString(),
          result,
          detail: result === 'won'
            ? `Solved (${incorrectGuesses.length} mistake${incorrectGuesses.length !== 1 ? 's' : ''})`
            : `Lost — ${dailyWord.toUpperCase()}`,
        });
        resumedDailyProgressRef.current = null;
        await clearDailyProgress();
        const updatedDailyStats = await loadDailyStats();
        setDailyStats(updatedDailyStats);
        setShowDailyPopup(true);
        if (isWon) maybeRequestReview(updatedDailyStats.streak || 0);
        if (isWon) maybeFlagReminderOptIn(updatedDailyStats.streak || 0);
        syncDailyReminder();
      };

      handleDailyEnd();
    }
  }, [isWon, isLost, playingDaily, dailyGameEnded, dailyWord]);

  // Autosave Daily progress on every guess so the attempt survives the app
  // being backgrounded, force-quit, or swiped away mid-game.
  useEffect(() => {
    if (!playingDaily || !isPlaying) return;
    saveDailyProgress({
      dateISO: getTodayDateString(),
      word: dailyWord,
      category,
      guessedLetters: [...correctGuesses, ...incorrectGuesses],
      incorrectGuesses,
      correctGuesses,
    });
  }, [playingDaily, isPlaying, dailyWord, category, correctGuesses, incorrectGuesses]);

  // Autosave practice progress on every guess.
  useEffect(() => {
    if (playingDaily || !isPlaying) return;
    savePracticeProgress({
      word,
      category,
      guessedLetters: [...correctGuesses, ...incorrectGuesses],
      incorrectGuesses,
      correctGuesses,
    });
  }, [playingDaily, isPlaying, word, category, correctGuesses, incorrectGuesses]);

  // Clear practice progress when a practice game ends (win or loss).
  useEffect(() => {
    if ((isWon || isLost) && !playingDaily) {
      resumedPracticeProgressRef.current = null;
      clearPracticeProgress().catch(() => {});
    }
  }, [isWon, isLost, playingDaily]);

  // Clear selected letter when game ends
  useEffect(() => {
    if (!isPlaying) setSelectedLetter(null);
  }, [isPlaying]);

  // Reset the closed result card whenever a fresh round starts
  useEffect(() => {
    if (isPlaying) setResultCardClosed(false);
  }, [isPlaying]);

  // Set game mode to playing when game starts
  useEffect(() => {
    if ((isPlaying || isWon || isLost) && gameMode !== 'playing') {
      setGameMode('playing');
    }
  }, [isPlaying, isWon, isLost]);

  // Start daily challenge - picks word from main word list based on date
  const startDailyChallenge = () => {
    // Resuming an in-progress attempt restored on launch — restore the
    // exact guessed/correct/incorrect letters instead of starting fresh.
    const resumed = resumedDailyProgressRef.current;
    if (resumed) {
      setDailyWord(resumed.word);
      setPlayingDaily(true);
      setDailyGameEnded(false);
      setShowDailyPopup(false);
      setSelectedCategory('Daily Challenge');
      hydrateGame({
        word: resumed.word,
        category: resumed.category,
        guessedLetters: resumed.guessedLetters,
        incorrectGuesses: resumed.incorrectGuesses,
        correctGuesses: resumed.correctGuesses,
      });
      setGameMode('playing');
      return;
    }

    // Category pick avoids whatever ran in the last few days (see
    // pickDailyCategory) so a category can't feel like it's "every day" —
    // real feedback from a daily player who kept landing on the same one or
    // two categories, even though pure independent randomness was working as
    // designed and just happened to cluster.
    const today = new Date();
    const categoryNames = Object.keys(WORD_CATEGORIES);
    const pickedCategory = pickDailyCategory(today, categoryNames);
    // Filter the category before picking so a profane word can never be the
    // system-chosen answer, even if one is added to the word data later.
    const categoryWords: string[] = WORD_CATEGORIES[pickedCategory]
      .filter((w) => !PROFANITY_BLOCKLIST.has(w.toLowerCase()));
    const pickedWord = pickDailyWordFromCategory(today, categoryWords);
    const dailyEntry = { word: pickedWord, category: pickedCategory };

    if (!dailyEntry) {
      console.error('No daily word found!');
      return;
    }

    setDailyWord(dailyEntry.word);
    setPlayingDaily(true);
    setDailyGameEnded(false);
    setShowDailyPopup(false);
    setSelectedCategory('Daily Challenge');
    startGameWithWord(dailyEntry.word, dailyEntry.category);
    setGameMode('playing');
  };

  const handleBackToMenu = () => router.back();
  
  const handleBackToModeSelect = () => {
    // Reset all game state
    resetGame();
    setGameMode('menu');
    setSelectedCategory(null);
    setPlayingDaily(false);
    setDailyGameEnded(false);
    setShowDailyPopup(false);
    setSelectedLetter(null);
  };

  // Daily is a single continuous attempt, but leaving mid-game (word still
  // unsolved, not yet won/lost) no longer counts as a loss — the guessed
  // letters are already autosaved on every guess (see the effect above), so
  // leaving just freezes the attempt where it stands. Coming back today
  // resumes it via resumedDailyProgressRef instead of forcing a finish just
  // because you tapped away. Runs BEFORE resetGame()/handleBackToModeSelect()
  // clears the in-memory guesses, snapshotting the live state into the ref
  // first so a same-session re-entry (tapping "Play Today's Challenge" again
  // right after leaving) resumes correctly too, not just a cross-launch one.
  const stashDailyProgressOnLeave = () => {
    resumedDailyProgressRef.current = {
      dateISO: getTodayDateString(),
      word: dailyWord,
      category,
      guessedLetters: [...correctGuesses, ...incorrectGuesses],
      incorrectGuesses,
      correctGuesses,
    };
  };

  // Progress is autosaved on every guess; leaving just freezes it in place.
  const handleGameplayBackPress = () => {
    stashDailyProgressOnLeave();
    handleBackToModeSelect();
  };

  const handleBackToCategorySelect = () => setGameMode('category-select');
  
  const handlePlayAgain = () => {
    setSelectedLetter(null);
    setResultCardClosed(false);
    if (playingDaily) {
      // Can't play daily again - go back to menu
      handleBackToModeSelect();
      return;
    }
    // Fresh game — discard any stale practice save.
    resumedPracticeProgressRef.current = null;
    clearPracticeProgress().catch(() => {});
    if (selectedCategory && selectedCategory !== 'Daily Challenge') {
      startGameWithCategory(selectedCategory, isPhraseCategory(selectedCategory));
    } else {
      startGame();
    }
  };
  
  const handleSelectGameType = (type: GameType) => {
    setGameType(type);
    if (type === 'daily') {
      if (dailyStats?.lastPlayedDate === getTodayDateString()) {
        setShowDailyPopup(true);
      } else {
        startDailyChallenge();
      }
    } else {
      setGameMode('category-select');
    }
  };

  const handleSelectCategory = (categoryName: string) => {
    setSelectedCategory(categoryName);
    // If there's a saved practice game for this exact category, resume it.
    const resumed = resumedPracticeProgressRef.current;
    if (resumed && resumed.category === categoryName) {
      resumedPracticeProgressRef.current = null;
      hydrateGame({
        word: resumed.word,
        category: resumed.category,
        guessedLetters: resumed.guessedLetters,
        incorrectGuesses: resumed.incorrectGuesses,
        correctGuesses: resumed.correctGuesses,
      });
    } else {
      // Clear any stale practice save for a different category.
      resumedPracticeProgressRef.current = null;
      clearPracticeProgress().catch(() => {});
      startGameWithCategory(categoryName, isPhraseCategory(categoryName));
    }
    setGameMode('playing');
  };
  
  const handleKeyPress = (letter: string) => setSelectedLetter(letter);
  const handleEnter = () => { 
    if (selectedLetter) { 
      guessLetter(selectedLetter); 
      setSelectedLetter(null); 
    } 
  };
  const handleBack = () => setSelectedLetter(null);
  
  // All categories combined — word categories first, then phrase categories (deduplicated)
  const getCategories = () => {
    const wordKeys = Object.keys(WORD_CATEGORIES);
    const phraseKeys = Object.keys(PHRASE_CATEGORIES).filter(k => !wordKeys.includes(k));
    return [...wordKeys, ...phraseKeys];
  };

  // Auto-detect if a category is a phrase category
  const isPhraseCategory = (categoryName: string) =>
    Object.keys(PHRASE_CATEGORIES).includes(categoryName);

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

  // Full live-drag pan responder matching WordBuilder
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

  // Handle closing daily popup
  const handleCloseDailyPopup = () => {
    setShowDailyPopup(false);
    setPlayingDaily(false);
    setDailyGameEnded(false);
    resetGame();
    setGameMode('menu');
    setSelectedCategory(null);
  };

  // --- GAME MODES ---
  if (gameMode === 'playing' && (isPlaying || isWon || isLost)) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: background.backgroundColor }]}>
        <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />
        <AchievementPopup
          achievement={currentPopupAchievement}
          onDismiss={handleAchievementDismiss}
          backgroundColor={background.cardColor}
          textColor={background.textColor}
        />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleGameplayBackPress}>
            <Text style={[styles.backButtonText, { color: background.secondaryText }]}>
              ← Back
            </Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: background.textColor }]}>Hangman</Text>
          <View style={styles.headerPlaceholder} />
        </View>
        <View style={[
          styles.gameInfoBar,
          { backgroundColor: background.cardColor, borderColor: background.borderColor },
        ]}>
          <View style={styles.infoItem}>
            <Text style={[styles.infoLabel, { color: background.secondaryText }]}>
              {playingDaily ? 'Daily Challenge' : 'Category'}
            </Text>
            <Text style={[styles.infoValue, { color: COLORS.accent }]}>
              {category}
            </Text>
          </View>
          <View style={[styles.infoDivider, { backgroundColor: background.borderColor }]} />
          <View style={styles.infoItem}>
            <Text style={[styles.infoLabel, { color: background.secondaryText }]}>
              Lives Left
            </Text>
            <Text style={[
              styles.infoValue,
              { color: remainingAttempts <= 2 ? COLORS.danger : background.textColor }
            ]}>
              {remainingAttempts}/{maxAttempts}
            </Text>
          </View>
        </View>
        <View style={styles.figureContainer}>
          <HangmanFigure
            incorrectGuesses={incorrectGuesses.length}
            maxAttempts={maxAttempts}
            isWon={isWon}
            isLost={isLost}
            figureSkin="classic"
            gallowsSkin="default"
          />
        </View>
        <WordDisplay
          displayWord={displayWord}
          isWon={isWon}
          isLost={isLost}
          actualWord={word}
        />
        <View style={styles.keyboardContainer}>
          {isPlaying && (
            <TouchableOpacity
              style={[styles.guessWordButton, { borderColor: COLORS.accent }]}
              onPress={() => { setGuessInput(''); setShowGuessModal(true); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.guessWordButtonText, { color: COLORS.accent }]}>
                Guess the Word
              </Text>
            </TouchableOpacity>
          )}
          <Keyboard
            selectedLetter={selectedLetter}
            onKeyPress={handleKeyPress}
            onEnter={handleEnter}
            onBack={handleBack}
            isLetterGuessed={isLetterGuessed}
            isLetterCorrect={isLetterCorrect}
            isLetterIncorrect={isLetterIncorrect}
            disabled={!isPlaying}
          />
        </View>

        {/* Guess Word Modal */}
        <Modal
          visible={showGuessModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowGuessModal(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowGuessModal(false)}>
            <Pressable onPress={() => {}} style={[styles.modalCard, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
              <Text style={[styles.modalTitle, { color: background.textColor }]}>Guess the Word</Text>
              <Text style={[styles.modalSubtitle, { color: background.secondaryText }]}>
                Wrong? You lose instantly!
              </Text>
              <TextInput
                style={[styles.modalInput, { color: background.textColor, borderColor: background.borderColor, backgroundColor: background.backgroundColor }]}
                placeholder="Type your guess..."
                placeholderTextColor={background.secondaryText}
                value={guessInput}
                onChangeText={setGuessInput}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                onSubmitEditing={() => {
                  if (guessInput.trim()) {
                    setShowGuessModal(false);
                    guessWord(guessInput.trim());
                  }
                }}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { borderColor: background.borderColor }]}
                  onPress={() => setShowGuessModal(false)}
                >
                  <Text style={[styles.modalBtnText, { color: background.secondaryText }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalConfirmBtn, { backgroundColor: guessInput.trim() ? COLORS.accent : background.borderColor }]}
                  onPress={() => {
                    if (guessInput.trim()) {
                      setShowGuessModal(false);
                      guessWord(guessInput.trim());
                    }
                  }}
                  disabled={!guessInput.trim()}
                >
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>Guess!</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
        
        {/* Regular Game End Popup (non-daily) */}
        {!playingDaily && (
          <GameStatus
            isVisible={(isWon || isLost) && !resultCardClosed}
            isWon={isWon}
            word={word}
            category={category}
            incorrectGuesses={incorrectGuesses.length}
            totalGuesses={stats.totalGuesses}
            onPlayAgain={handlePlayAgain}
            onBackToMenu={handleBackToModeSelect}
            onClose={() => setResultCardClosed(true)}
            achievement={currentPopupAchievement}
            onDismissAchievement={handleAchievementDismiss}
          />
        )}

        {/* Daily Challenge End Popup */}
        {playingDaily && showDailyPopup && dailyStats && (
          <DailyChallengePopup
            visible={true}
            won={isWon}
            word={dailyWord}
            category={selectedCategory || ''}
            streak={dailyStats.streak || 0}
            bestStreak={dailyStats.bestStreak || 0}
            incorrectCount={incorrectGuesses.length}
            maxAttempts={maxAttempts}
            onBackToMenu={handleCloseDailyPopup}
            onClose={() => setShowDailyPopup(false)}
            achievement={currentPopupAchievement}
            onDismissAchievement={handleAchievementDismiss}
          />
        )}
      </SafeAreaView>
    );
  }

  if (gameMode === 'category-select') {
    const categories = getCategories();
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: background.backgroundColor }]}>
        <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBackToModeSelect}>
            <Text style={[styles.backButtonText, { color: background.secondaryText }]}>
              ← Back
            </Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: background.textColor }]}>
            Categories
          </Text>
          <View style={styles.headerPlaceholder} />
        </View>
        <ScrollView
          style={styles.categoryContainer}
          contentContainerStyle={styles.categoryContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.categoryTitle, { color: background.textColor }]}>
            Pick a Category
          </Text>
          <Text style={[styles.categorySubtitle, { color: background.secondaryText }]}>
            Pick a category to start guessing
          </Text>
          <View style={styles.categoryGrid}>
            {categories.map((categoryName) => (
              <CategoryCard
                key={categoryName}
                name={categoryName}
                onPress={() => handleSelectCategory(categoryName)}
                textColor={background.textColor}
                cardColor={background.cardColor}
                borderColor={background.borderColor}
              />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Main Menu
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: background.backgroundColor }]}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && Math.abs(h - dbgContainerHeight) > 1) setDbgContainerHeight(h);
      }}
    >
      <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />
      <FallingLetters />
      <AchievementPopup
        achievement={currentPopupAchievement}
        onDismiss={handleAchievementDismiss}
        backgroundColor={background.cardColor}
        textColor={background.textColor}
      />
      <View
        style={styles.header}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - dbgHeaderHeight) > 1) setDbgHeaderHeight(h);
        }}
      >
        <TouchableOpacity style={styles.backButton} onPress={handleBackToMenu}>
          <Text style={[styles.backButtonText, { color: background.secondaryText }]}>
            ← Games
          </Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: background.textColor }]}>Hangman</Text>
        <View style={styles.headerPlaceholder} />
      </View>
      <View
        style={[styles.segmentSwitcher, { backgroundColor: background.cardColor }]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - dbgSegmentHeight) > 1) setDbgSegmentHeight(h);
        }}
      >
        {(['play', 'stats'] as SegmentKey[]).map((key) => {
          const isActive = key === segment;
          const label = key === 'play' ? 'Play' : 'Stats';
          return (
            <Pressable
              key={key}
              style={[
                styles.segmentButton,
                isActive && { backgroundColor: background.backgroundColor },
              ]}
              onPress={() => handleSegmentPress(key)}
            >
              <Text style={[
                styles.segmentButtonText,
                { color: background.secondaryText },
                isActive && { color: background.textColor, fontWeight: '600' },
              ]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View
        style={styles.tabStripWrapper}
        {...menuPanResponder.panHandlers}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - tabAreaHeight) > 1) setTabAreaHeight(h);
        }}
      >
      <Animated.View style={[styles.tabStrip, tabAreaHeight ? { height: tabAreaHeight } : null, { transform: [{ translateX: tabAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -width],
      }) }] }]}>

        <ScrollView
          style={{ width, flex: 1 }}
          contentContainerStyle={styles.playContainer}
          showsVerticalScrollIndicator={false}
        >
          <DailyChallengeCard
            played={dailyStats?.lastPlayedDate === getTodayDateString()}
            inProgress={dailyInProgressToday}
            result={dailyStats?.lastDailyResult || ''}
            word={dailyStats?.lastDailyWord || ''}
            streak={dailyStats?.streak || 0}
            bestStreak={dailyStats?.bestStreak || 0}
            incorrectCount={dailyStats?.lastIncorrectCount ?? 0}
            maxAttempts={6}
            onPlay={() => {
              if (dailyStats?.lastPlayedDate === getTodayDateString()) {
                setShowDailyPopup(true);
              } else {
                startDailyChallenge();
              }
            }}
          />
          <TouchableOpacity
            style={[
              styles.gameModeCard,
              { backgroundColor: background.cardColor, borderColor: background.borderColor },
            ]}
            onPress={() => handleSelectGameType('custom')}
            activeOpacity={0.8}
          >
            <Text style={[styles.gameModeTitle, { color: background.textColor }]}>Quick Play</Text>
            <Text style={[styles.gameModeDescription, { color: background.secondaryText }]}>
              Choose a category and start guessing
            </Text>
          </TouchableOpacity>
          <View
            style={[
              styles.rulesContainer,
              { backgroundColor: background.cardColor, borderColor: background.borderColor },
            ]}
          >
            <Text style={[styles.rulesTitle, { color: background.textColor }]}>
              How to Play
            </Text>
            <View style={styles.ruleItem}>
              <Text style={[styles.ruleNumber, { color: COLORS.accent }]}>1</Text>
              <Text style={[styles.ruleText, { color: background.secondaryText }]}>
                Select a letter from the keyboard
              </Text>
            </View>
            <View style={styles.ruleItem}>
              <Text style={[styles.ruleNumber, { color: COLORS.accent }]}>2</Text>
              <Text style={[styles.ruleText, { color: background.secondaryText }]}>
                Press ENTER to submit your guess
              </Text>
            </View>
            <View style={styles.ruleItem}>
              <Text style={[styles.ruleNumber, { color: COLORS.accent }]}>3</Text>
              <Text style={[styles.ruleText, { color: background.secondaryText }]}>
                Correct letters appear in the word
              </Text>
            </View>
            <View style={styles.ruleItem}>
              <Text style={[styles.ruleNumber, { color: COLORS.accent }]}>4</Text>
              <Text style={[styles.ruleText, { color: background.secondaryText }]}>
                Wrong guesses add parts to the hangman
              </Text>
            </View>
            <View style={styles.ruleItem}>
              <Text style={[styles.ruleNumber, { color: COLORS.accent }]}>5</Text>
              <Text style={[styles.ruleText, { color: background.secondaryText }]}>
                Guess the word before 6 wrong guesses!
              </Text>
            </View>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>

        <ScrollView style={{ width, flex: 1 }} contentContainerStyle={styles.statsContainer} showsVerticalScrollIndicator={false}>
          {/* Daily Challenge Stats */}
          {dailyStats && dailyStats.gamesPlayed > 0 && (
            <>
              <Text style={[styles.statsSectionTitle, { color: background.textColor }]}>Daily Challenge Stats</Text>
              <View style={styles.statsGrid}>
                <StatsCard
                  label="Dailies Played"
                  value={dailyStats.gamesPlayed.toString()}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard
                  label="Last Result"
                  value={dailyStats.lastDailyResult === 'won' ? '✓ Won' : dailyStats.lastDailyResult === 'lost' ? '✗ Lost' : '-'}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard
                  label="Current Streak"
                  value={`${dailyStats.streak} ${dailyStats.streak === 1 ? 'day' : 'days'}`}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard
                  label="Best Streak"
                  value={`${dailyStats.bestStreak} ${dailyStats.bestStreak === 1 ? 'day' : 'days'}`}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard
                  label="Daily Wins"
                  value={(dailyStats.dailyWins || 0).toString()}
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
              <Text style={[styles.statsSectionTitle, { color: background.textColor, marginTop: 24 }]}>Daily History</Text>
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

          {playerStats ? (
            <>
              <Text style={[styles.statsSectionTitle, { color: background.textColor, marginTop: dailyStats && dailyStats.gamesPlayed > 0 ? 24 : 0 }]}>Quick Play Stats</Text>
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
                  label="Win Rate"
                  value={`${getWinRate(playerStats)}%`}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard
                  label="Games Won"
                  value={playerStats.gamesWon.toString()}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard
                  label="Games Lost"
                  value={playerStats.gamesLost.toString()}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
              </View>
              <Text style={[styles.statsSectionTitle, { color: background.textColor, marginTop: 24 }]}>Streaks</Text>
              <View style={styles.statsGrid}>
                <StatsCard
                  label="Current Win Streak"
                  value={playerStats.currentStreak.toString()}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard
                  label="Best Win Streak"
                  value={playerStats.bestStreak.toString()}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard
                  label="Current Day Streak"
                  value={playerStats.currentDayStreak.toString()}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard
                  label="Best Day Streak"
                  value={playerStats.bestDayStreak.toString()}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
              </View>
              <Text style={[styles.statsSectionTitle, { color: background.textColor, marginTop: 24 }]}>Performance</Text>
              <View style={styles.statsGrid}>
                <StatsCard
                  label="Guess Accuracy"
                  value={`${getGuessAccuracy(playerStats)}%`}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard
                  label="Avg. Wrong Guesses"
                  value={getAverageIncorrectGuesses(playerStats).toString()}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard
                  label="Perfect Games"
                  value={playerStats.perfectGames.toString()}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard
                  label="Close Calls"
                  value={playerStats.closeGames.toString()}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
              </View>
              <Text style={[styles.statsSectionTitle, { color: background.textColor, marginTop: 24 }]}>Categories</Text>
              <View style={styles.statsGrid}>
                <StatsCard
                  label="Favorite Category"
                  value={getFavoriteCategory(playerStats)}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard
                  label="Best Category"
                  value={getBestCategory(playerStats)}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard
                  label="Unique Words"
                  value={getUniqueWordsCount(playerStats).toString()}
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
                <StatsCard
                  label="Longest Word"
                  value={(playerStats.longestWordGuessed || '-').toUpperCase()}
                  wide
                  textColor={background.textColor}
                  secondaryText={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
              </View>
              <Text style={[styles.statsSectionTitle, { color: background.textColor, marginTop: 24 }]}>
                Achievements ({unlockedAchievements.length}/{getTotalAchievementCount()})
              </Text>
              {unlockedAchievements.length > 0 && (
                <View style={styles.achievementsGrid}>
                  {unlockedAchievements.map((achievement) => (
                    <View
                      key={achievement.id}
                      style={[
                        styles.achievementCard,
                        { backgroundColor: background.cardColor, borderColor: background.borderColor },
                      ]}
                    >
                      <View style={[styles.achievementEmoji]}>
                        <AchievementIcon category={achievement.category} size={26} color={background.textColor} />
                      </View>
                      <Text style={[styles.achievementName, { color: background.textColor }]} numberOfLines={1}>
                        {achievement.name}
                      </Text>
                      <Text style={[styles.achievementDesc, { color: background.secondaryText }]} numberOfLines={2}>
                        {achievement.description}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              {lockedAchievements.length > 0 && unlockedAchievements.length > 0 && (
                <View style={styles.lockedDivider}>
                  <View
                    style={[styles.dividerLine, { backgroundColor: background.borderColor }]}
                  />
                  <Text style={[styles.dividerText, { color: background.secondaryText }]}>
                    Locked
                  </Text>
                  <View
                    style={[styles.dividerLine, { backgroundColor: background.borderColor }]}
                  />
                </View>
              )}
              {lockedAchievements.length > 0 && (
                <View style={styles.achievementsGrid}>
                  {lockedAchievements.map((achievement) => {
                    const progress = getHangmanProgress(achievement.id, playerStats);
                    return (
                    <View
                      key={achievement.id}
                      style={[
                        styles.achievementCard,
                        styles.achievementCardLocked,
                        { backgroundColor: background.cardColor, borderColor: background.borderColor },
                      ]}
                    >
                      <View style={[styles.achievementEmoji, styles.achievementEmojiLocked]}>
                        <AchievementIcon category={achievement.category} size={26} color={background.textColor} />
                      </View>
                      <Text style={[
                        styles.achievementName,
                        { color: background.textColor },
                        styles.achievementTextLocked,
                      ]} numberOfLines={1}>
                        {achievement.name}
                      </Text>
                      <Text style={[
                        styles.achievementDesc,
                        { color: background.secondaryText },
                        styles.achievementTextLocked,
                      ]} numberOfLines={2}>
                        {achievement.description}
                      </Text>
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
            </>
          ) : (
            <Text style={[styles.loadingText, { color: background.secondaryText }]}>
              Loading stats...
            </Text>
          )}
        </ScrollView>

      </Animated.View>
      </View>

      {/* Daily Results Popup (when viewing from menu after already played) */}
      {showDailyPopup && dailyStats && !playingDaily && (
        <DailyChallengePopup
          visible={true}
          won={dailyStats.lastDailyResult === 'won'}
          word={dailyStats.lastDailyWord || ''}
          category={'Daily Challenge'}
          streak={dailyStats.streak || 0}
          bestStreak={dailyStats.bestStreak || 0}
          incorrectCount={dailyStats.lastIncorrectCount ?? 0}
          maxAttempts={6}
          onBackToMenu={() => setShowDailyPopup(false)}
          onClose={() => setShowDailyPopup(false)}
        />
      )}

      {/* TEMPORARY DIAGNOSTIC OVERLAY. Remove once the bottom-cutoff root
          cause is confirmed. */}
      <View style={styles.dbgOverlay} pointerEvents="none">
        <Text style={styles.dbgText}>
          win:{Math.round(Dimensions.get('window').height)} top:{Math.round(insets.top)} bot:{Math.round(insets.bottom)} cont:{Math.round(dbgContainerHeight)} hdr:{Math.round(dbgHeaderHeight)} seg:{Math.round(dbgSegmentHeight)} tab:{Math.round(tabAreaHeight)}
        </Text>
      </View>
    </SafeAreaView>
  );
}
