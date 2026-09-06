// app/hexhive/index.tsx

import { router, useFocusEffect } from 'expo-router';
import { AchievementIcon } from '../../src/shared/AchievementIcon';
import GameIntro, { markIntroSeen, shouldShowIntro } from '../../src/shared/GameIntro';
import { HiveLetters, WordWithRequiredLetter } from '../../src/shared/introVisuals';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Flame, Share2, Trophy } from 'lucide-react-native';

import { useTheme } from '../../src/shared/ThemeContext';
import { FallingLetters } from '../../src/shared/FallingLetters';
import {
  formatDisplayDate,
  getDailyPuzzle,
  getPuzzleSolution,
  getTodayDateString,
} from '../../src/hexhive/utils/generator';
import { getRankProgress, scoreWordForPuzzle, getEffectiveMaxScore } from '../../src/hexhive/utils/scoring';
import {
  loadHexHiveStats,
  loadDailyProgress,
  loadDailyHistory,
  type HexHiveStats,
  type DailyHistory,
} from '../../src/hexhive/utils/storage';
import {
  getUnlockedAchievements,
  HEXHIVE_ACHIEVEMENTS,
  type Achievement,
} from '../../src/hexhive/utils/achievements';
import HexHiveCalendar from '../../src/hexhive/components/HexHiveCalendar';

const ACCENT = '#D4A017';
const { width } = Dimensions.get('window');
type Tab = 'play' | 'stats';
const TABS: Tab[] = ['play', 'stats'];

// Maps each achievement id to a 0–1 progress fraction given the current
// stats snapshot, mirroring Wordle's Stats tab (progress bars on locked,
// countable achievements). Achievements not listed here (or already
// unlocked) simply show no bar.
function getAchievementProgress(id: string, stats: HexHiveStats): number | undefined {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  switch (id) {
    case 'hh_first_word':
      return clamp(stats.totalWordsFound / 1);
    case 'hh_words_50':
      return clamp(stats.totalWordsFound / 50);
    case 'hh_words_250':
      return clamp(stats.totalWordsFound / 250);
    case 'hh_words_1000':
      return clamp(stats.totalWordsFound / 1000);
    case 'hh_words_2500':
      return clamp(stats.totalWordsFound / 2500);
    case 'hh_words_5000':
      return clamp(stats.totalWordsFound / 5000);
    case 'hh_first_pangram':
      return clamp(stats.totalPangramsFound / 1);
    case 'hh_pangrams_10':
      return clamp(stats.totalPangramsFound / 10);
    case 'hh_pangrams_25':
      return clamp(stats.totalPangramsFound / 25);
    case 'hh_pangrams_50':
      return clamp(stats.totalPangramsFound / 50);
    case 'hh_long_word_9':
      return clamp(stats.longestWordFound.length / 9);
    case 'hh_long_word_11':
      return clamp(stats.longestWordFound.length / 11);
    case 'hh_long_word_13':
      return clamp(stats.longestWordFound.length / 13);
    case 'hh_reach_amazing':
      return clamp(stats.bestDailyRankIndex / 7);
    case 'hh_reach_genius':
      return clamp(stats.bestDailyRankIndex / 8);
    case 'hh_reach_master':
      return clamp(stats.bestDailyRankIndex / 9);
    case 'hh_streak_3':
      return clamp(stats.bestStreak / 3);
    case 'hh_streak_7':
      return clamp(stats.bestStreak / 7);
    case 'hh_streak_30':
      return clamp(stats.bestStreak / 30);
    case 'hh_streak_100':
      return clamp(stats.bestStreak / 100);
    case 'hh_fullclear_streak_3':
      return clamp(stats.bestFullClearStreak / 3);
    case 'hh_fullclear_streak_7':
      return clamp(stats.bestFullClearStreak / 7);
    case 'hh_first_full_clear':
      return clamp(stats.fullClears / 1);
    case 'hh_days_10':
      return clamp(stats.daysPlayed / 10);
    case 'hh_days_50':
      return clamp(stats.daysPlayed / 50);
    case 'hh_days_100':
      return clamp(stats.daysPlayed / 100);
    case 'hh_fullclears_10':
      return clamp(stats.fullClears / 10);
    case 'hh_fullclears_25':
      return clamp(stats.fullClears / 25);
    case 'hh_qp_first_round':
      return clamp(stats.practicePuzzlesPlayed / 1);
    case 'hh_qp_rounds_10':
      return clamp(stats.practicePuzzlesPlayed / 10);
    case 'hh_qp_rounds_50':
      return clamp(stats.practicePuzzlesPlayed / 50);
    case 'hh_qp_score_50':
      return clamp(stats.practiceBestScore / 50);
    case 'hh_qp_score_100':
      return clamp(stats.practiceBestScore / 100);
    case 'hh_qp_words_10':
      return clamp(stats.practiceBestWordCount / 10);
    case 'hh_qp_words_20':
      return clamp(stats.practiceBestWordCount / 20);
    case 'hh_qp_pangram':
      return clamp(stats.practicePangramsFound / 1);
    default:
      return undefined;
  }
}

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
  <View style={[styles.dailyStatPill, highlight && styles.dailyStatPillHighlight]}>
    <Text style={[styles.dailyStatPillLabel, { color: secondaryText }]}>{label}</Text>
    <View style={styles.dailyStatPillValueRow}>
      <Icon size={18} color={iconColor} />
      <Text style={styles.dailyStatPillValue}>{value}</Text>
    </View>
  </View>
);

function StatsGrid({
  items,
  cardColor,
  borderColor,
  textColor,
  secondaryColor,
}: {
  items: { label: string; value: string }[];
  cardColor: string;
  borderColor: string;
  textColor: string;
  secondaryColor: string;
}) {
  return (
    <View style={styles.statsGrid}>
      {items.map(({ label, value }) => (
        <View key={label} style={[styles.statsCard, { backgroundColor: cardColor, borderColor }]}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.statsValue, { color: textColor }]}>{value}</Text>
          <Text style={[styles.statsLabel, { color: secondaryColor }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function AchievementCard({
  achievement,
  unlocked,
  progress,
  textColor,
  secondaryText,
  cardColor,
  borderColor,
}: {
  achievement: Achievement;
  unlocked: boolean;
  progress?: number;
  textColor: string;
  secondaryText: string;
  cardColor: string;
  borderColor: string;
}) {
  const opacity = unlocked ? 1 : 0.5;
  const showProgress = !unlocked && progress !== undefined && progress > 0;

  return (
    <View style={[styles.achievementCard, { backgroundColor: cardColor, borderColor, opacity }]}>
      <View style={styles.achievementEmoji}>
        <AchievementIcon category={achievement.category} size={26} color={textColor} />
      </View>
      <Text style={[styles.achievementName, { color: textColor }]}>{achievement.name}</Text>
      <Text style={[styles.achievementDesc, { color: secondaryText }]}>{achievement.description}</Text>
      {showProgress && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress! * 100)}%` }]} />
        </View>
      )}
    </View>
  );
}

export default function HexHiveEntryScreen() {
  const { background } = useTheme();

  // First-open worked example. Hex Hive's two rules that trip people up -- every
  // word must use the centre letter, and letters can repeat -- are both far
  // clearer shown than stated, and the Perfect Day system now sends people in
  // here who have never played this kind of puzzle.
  const [showIntro, setShowIntro] = useState(false);
  useEffect(() => {
    shouldShowIntro('hexhive').then(setShowIntro);
  }, []);
  const closeIntro = useCallback(() => {
    setShowIntro(false);
    markIntroSeen('hexhive').catch(() => {});
  }, []);

  const [activeTab, setActiveTab] = useState<Tab>('play');
  const tabAnim = useRef(new Animated.Value(0)).current;
  const currentTabIdxRef = useRef(0);
  const dragBase = useRef(0);

  const [stats, setStats] = useState<HexHiveStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [dailyWordCount, setDailyWordCount] = useState(0);
  const [dailyScore, setDailyScore] = useState(0);
  const [dailyPlayed, setDailyPlayed] = useState(false);
  const [dailyFullyCleared, setDailyFullyCleared] = useState(false);
  const [unlocked, setUnlocked] = useState<(Achievement & { unlockedAt: string })[]>([]);
  const [history, setHistory] = useState<DailyHistory>({});

  const loadAll = useCallback(async () => {
    const puzzle = getDailyPuzzle(new Date());
    const [s, progress, ach, hist] = await Promise.all([
      loadHexHiveStats().catch(() => null),
      loadDailyProgress().catch(() => null),
      getUnlockedAchievements().catch(() => []),
      loadDailyHistory().catch(() => ({})),
    ]);
    setStats(s);
    setUnlocked(ach);
    setHistory(hist);

    if (progress && progress.foundWords.length > 0) {
      const solution = getPuzzleSolution(puzzle);
      const pangramSet = new Set(solution.pangrams);
      const score = progress.foundWords.reduce((sum, w) => sum + scoreWordForPuzzle(w, pangramSet.has(w)), 0);
      setDailyWordCount(progress.foundWords.length);
      setDailyScore(score);
      setDailyPlayed(true);
      setDailyFullyCleared(getRankProgress(score, getEffectiveMaxScore(solution.maxScore)).isMaxRank);
    } else {
      setDailyWordCount(0);
      setDailyScore(0);
      setDailyPlayed(s?.lastPlayedDate === getTodayDateString());
      setDailyFullyCleared(false);
    }
    setLoadingStats(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  useEffect(() => {
    currentTabIdxRef.current = TABS.indexOf(activeTab);
  }, [activeTab]);

  const handleTabPress = (tab: Tab) => {
    const idx = TABS.indexOf(tab);
    setActiveTab(tab);
    Animated.spring(tabAnim, { toValue: idx, useNativeDriver: true, tension: 70, friction: 12 }).start();
  };

  const panResponder = useRef(
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
        tabAnim.setValue(Math.max(0, Math.min(TABS.length - 1, raw)));
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
        if (gs.dx < -25 || gs.vx < -0.3) newIdx = Math.min(Math.floor(base) + 1, TABS.length - 1);
        else if (gs.dx > 25 || gs.vx > 0.3) newIdx = Math.max(Math.ceil(base) - 1, 0);
        currentTabIdxRef.current = newIdx;
        setActiveTab(TABS[newIdx]);
        Animated.spring(tabAnim, { toValue: newIdx, useNativeDriver: true, tension: 70, friction: 12 }).start();
      },
    })
  ).current;

  const handleShare = async () => {
    const puzzle = getDailyPuzzle(new Date());
    const solution = getPuzzleSolution(puzzle);
    const rank = getRankProgress(dailyScore, getEffectiveMaxScore(solution.maxScore));
    const streakLine = (stats?.currentStreak ?? 0) > 1 ? `\n${stats?.currentStreak} day streak` : '';
    const message = `Hex Hive\n${formatDisplayDate()}\nRank: ${rank.name} (${dailyScore} pts)\n${dailyWordCount} words found${streakLine}`;
    try {
      await Share.share({ message });
    } catch {}
  };

  const combinedWords = stats?.totalWordsFound ?? 0;
  const unlockedIds = new Set(unlocked.map((u) => u.id));
  const unlockedAchievements = HEXHIVE_ACHIEVEMENTS.filter((a) => unlockedIds.has(a.id));
  const lockedAchievements = HEXHIVE_ACHIEVEMENTS.filter((a) => !unlockedIds.has(a.id));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background.backgroundColor }]}>
      <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />
      <FallingLetters />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={[styles.backText, { color: background.secondaryText }]}>← Games</Text>
        </TouchableOpacity>
        <View style={styles.titleWrap} pointerEvents="none">
          <Text style={[styles.title, { color: background.textColor }]}>Hex Hive</Text>
        </View>
      </View>

      <View style={[styles.segmentSwitcher, { backgroundColor: background.cardColor }]}>
        {TABS.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <Pressable
              key={tab}
              style={[styles.segmentButton, isActive && { backgroundColor: background.backgroundColor }]}
              onPress={() => handleTabPress(tab)}
            >
              <Text
                style={[
                  styles.segmentButtonText,
                  { color: background.secondaryText },
                  isActive && { color: background.textColor, fontWeight: '600' },
                ]}
              >
                {tab === 'play' ? 'Play' : 'Stats'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.tabStripWrapper} {...panResponder.panHandlers}>
        <Animated.View
          style={[
            styles.tabStrip,
            { transform: [{ translateX: tabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -width] }) }] },
          ]}
        >
          {/* ── PLAY TAB ── */}
          <ScrollView style={{ width }} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
            <View
              style={[
                styles.dailyCard,
                { backgroundColor: background.cardColor, borderColor: dailyPlayed ? ACCENT : background.borderColor },
              ]}
            >
              <Text style={[styles.dailyTitle, { color: background.textColor }]}>Daily Hex Hive</Text>
              <Text style={[styles.dailySubtitle, { color: background.secondaryText }]}>{formatDisplayDate()}</Text>

              {dailyPlayed && (
                <View style={styles.dailyCompletedInfo}>
                  {dailyFullyCleared && (
                    <View style={styles.fullClearBadge}>
                      <Text style={styles.fullClearBadgeText}>Solved!</Text>
                    </View>
                  )}
                  <Text style={[styles.dailyCompletedScore, { color: ACCENT }]}>{dailyScore}</Text>
                  <Text style={[styles.dailyCompletedLabel, { color: background.secondaryText }]}>
                    {dailyWordCount} word{dailyWordCount === 1 ? '' : 's'} found
                  </Text>
                </View>
              )}

              <View style={styles.dailyStatPillRow}>
                <DailyStatPill
                  label="Current streak"
                  value={stats?.currentStreak ?? 0}
                  icon={Flame}
                  iconColor="#e85d04"
                  highlight
                  secondaryText={background.secondaryText}
                />
                <DailyStatPill
                  label="Best streak"
                  value={stats?.bestStreak ?? 0}
                  icon={Trophy}
                  iconColor="#d4a017"
                  secondaryText={background.secondaryText}
                />
              </View>

              {!dailyPlayed && (
                <TouchableOpacity
                  style={[styles.dailyButton, { backgroundColor: background.backgroundColor, borderColor: background.borderColor, borderWidth: 2 }]}
                  onPress={() => router.push('/hexhive/daily')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.dailyButtonText, { color: background.textColor }]}>Play Today&apos;s Hive</Text>
                </TouchableOpacity>
              )}

              {dailyPlayed && (
                <View style={styles.dailyActionRow}>
                  <TouchableOpacity
                    style={[styles.dailyActionButton, { backgroundColor: background.backgroundColor, borderColor: background.borderColor, borderWidth: 1.5 }]}
                    onPress={() => router.push('/hexhive/daily')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.dailyActionText, { color: background.textColor }]}>Keep Playing</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.dailyShareIconButton, { backgroundColor: background.backgroundColor, borderColor: background.borderColor, borderWidth: 1.5 }]}
                    onPress={handleShare}
                    activeOpacity={0.8}
                  >
                    <Share2 size={18} color={background.textColor} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <Text style={[styles.sectionLabel, { color: background.textColor }]}>Quick Play</Text>
            <TouchableOpacity
              style={[styles.modeCard, { backgroundColor: background.cardColor, borderColor: background.borderColor, borderWidth: 2 }]}
              onPress={() => router.push('/hexhive/practice')}
              activeOpacity={0.8}
            >
              <View style={[styles.modeAccent, { backgroundColor: ACCENT }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.modeTitle, { color: background.textColor }]}>Quick Play</Text>
                <Text style={[styles.modeDesc, { color: background.secondaryText }]}>
                  60 seconds, a fresh random hive — no streak, just words
                </Text>
              </View>
            </TouchableOpacity>

            <View style={[styles.rulesCard, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
              <View style={styles.rulesTitleRow}>
                <Text style={[styles.rulesTitle, { color: background.textColor }]}>How to Play</Text>
                {/* Always reopenable, so the intro is a reference rather than a
                    one-time thing someone skipped and can never get back. */}
                <Pressable onPress={() => setShowIntro(true)} hitSlop={8}>
                  <Text style={[styles.rulesExampleLink, { color: ACCENT }]}>See example</Text>
                </Pressable>
              </View>
              {[
                'Every word must use the center (gold) letter',
                'Words must be at least 4 letters long',
                'Letters can be reused as many times as you like',
                'Find a pangram — a word using all 7 letters — for a big bonus',
              ].map((rule, i) => (
                <View key={i} style={styles.ruleRow}>
                  <Text style={[styles.ruleNum, { color: ACCENT }]}>{i + 1}</Text>
                  <Text style={[styles.ruleText, { color: background.secondaryText }]}>{rule}</Text>
                </View>
              ))}
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>

          {/* ── STATS TAB ── */}
          <ScrollView style={{ width }} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
            {loadingStats ? (
              <ActivityIndicator color={ACCENT} style={{ marginTop: 20 }} />
            ) : combinedWords > 0 || (stats?.practicePuzzlesPlayed ?? 0) > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: background.textColor }]}>Daily Challenge</Text>
                <StatsGrid
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                  textColor={background.textColor}
                  secondaryColor={background.secondaryText}
                  items={[
                    { label: 'Current Streak', value: (stats?.currentStreak ?? 0).toString() },
                    { label: 'Best Streak', value: (stats?.bestStreak ?? 0).toString() },
                    { label: 'Days Played', value: (stats?.daysPlayed ?? 0).toString() },
                    { label: 'Daily Wins', value: (stats?.fullClears ?? 0).toString() },
                    { label: 'Win Streak', value: (stats?.currentFullClearStreak ?? 0).toString() },
                    { label: 'Best Win Streak', value: (stats?.bestFullClearStreak ?? 0).toString() },
                    { label: 'Best Daily Score', value: (stats?.bestDailyScore ?? 0).toString() },
                    { label: 'Best Daily Words', value: (stats?.bestDailyWordCount ?? 0).toString() },
                    { label: 'Words Found', value: (stats?.dailyWordsFound ?? 0).toString() },
                    { label: 'Pangrams Found', value: (stats?.dailyPangramsFound ?? 0).toString() },
                  ]}
                />

                <Text style={[styles.sectionTitle, { color: background.textColor, marginTop: 28 }]}>Quick Play</Text>
                <StatsGrid
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                  textColor={background.textColor}
                  secondaryColor={background.secondaryText}
                  items={[
                    { label: 'Rounds Played', value: (stats?.practicePuzzlesPlayed ?? 0).toString() },
                    { label: 'Best Score', value: (stats?.practiceBestScore ?? 0).toString() },
                    { label: 'Best Words (Round)', value: (stats?.practiceBestWordCount ?? 0).toString() },
                    { label: 'Words Found', value: (stats?.practiceWordsFound ?? 0).toString() },
                    { label: 'Pangrams Found', value: (stats?.practicePangramsFound ?? 0).toString() },
                  ]}
                />

                <View style={[styles.lifetimeStrip, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
                  <View style={styles.lifetimeItem}>
                    <Text style={[styles.lifetimeValue, { color: ACCENT }]}>{stats?.totalWordsFound ?? 0}</Text>
                    <Text style={[styles.lifetimeLabel, { color: background.secondaryText }]}>Total Words</Text>
                  </View>
                  <View style={[styles.lifetimeDivider, { backgroundColor: background.borderColor }]} />
                  <View style={styles.lifetimeItem}>
                    <Text style={[styles.lifetimeValue, { color: ACCENT }]}>{stats?.totalPangramsFound ?? 0}</Text>
                    <Text style={[styles.lifetimeLabel, { color: background.secondaryText }]}>Total Pangrams</Text>
                  </View>
                  <View style={[styles.lifetimeDivider, { backgroundColor: background.borderColor }]} />
                  <View style={styles.lifetimeItem}>
                    <Text style={[styles.lifetimeValue, { color: ACCENT }]}>
                      {stats?.longestWordFound ? stats.longestWordFound.toUpperCase() : '—'}
                    </Text>
                    <Text style={[styles.lifetimeLabel, { color: background.secondaryText }]}>Longest Word</Text>
                  </View>
                </View>

                <Text style={[styles.sectionTitle, { color: background.textColor, marginTop: 24 }]}>
                  Daily History
                </Text>
                <HexHiveCalendar
                  history={history}
                  accentColor={ACCENT}
                  textColor={background.textColor}
                  secondaryTextColor={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />
              </>
            ) : (
              <Text style={[styles.emptyText, { color: background.secondaryText }]}>
                No stats yet. Play a hive to get started!
              </Text>
            )}

            {/* Achievements — unlocked first, then locked (with progress bars) */}
            <Text style={[styles.sectionTitle, { color: background.textColor, marginTop: 28 }]}>
              Achievements ({unlockedAchievements.length}/{HEXHIVE_ACHIEVEMENTS.length})
            </Text>

            {unlockedAchievements.length > 0 && (
              <View style={styles.achievementsGrid}>
                {unlockedAchievements.map((achievement) => (
                  <AchievementCard
                    key={achievement.id}
                    achievement={achievement}
                    unlocked
                    textColor={background.textColor}
                    secondaryText={background.secondaryText}
                    cardColor={background.cardColor}
                    borderColor={background.borderColor}
                  />
                ))}
              </View>
            )}

            {unlockedAchievements.length > 0 && lockedAchievements.length > 0 && (
              <View style={styles.lockedDivider}>
                <View style={[styles.dividerLine, { backgroundColor: background.borderColor }]} />
                <Text style={[styles.dividerText, { color: background.secondaryText }]}>Locked</Text>
                <View style={[styles.dividerLine, { backgroundColor: background.borderColor }]} />
              </View>
            )}

            {lockedAchievements.length > 0 && (
              <View style={styles.achievementsGrid}>
                {lockedAchievements.map((achievement) => (
                  <AchievementCard
                    key={achievement.id}
                    achievement={achievement}
                    unlocked={false}
                    progress={stats ? getAchievementProgress(achievement.id, stats) : undefined}
                    textColor={background.textColor}
                    secondaryText={background.secondaryText}
                    cardColor={background.cardColor}
                    borderColor={background.borderColor}
                  />
                ))}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </Animated.View>
      </View>

      <GameIntro
        visible={showIntro}
        onClose={closeIntro}
        accentColor={ACCENT}
        cards={[
          {
            heading: 'Seven letters, one of them required',
            body: 'You get seven letters. The gold one in the middle has to appear in every single word you find.',
            visual: (
              <HiveLetters
                center="T"
                outer={['P', 'L', 'A', 'N', 'E', 'R']}
                accent={ACCENT}
                textColor={background.textColor}
                borderColor={background.borderColor}
              />
            ),
          },
          {
            heading: 'Build words four letters or longer',
            body: 'PLANET works: four or more letters, and it uses the gold T. PLANE would not, because it leaves the centre letter out.',
            visual: (
              <WordWithRequiredLetter
                word="PLANET"
                required="T"
                accent={ACCENT}
                textColor={background.textColor}
              />
            ),
          },
          {
            heading: 'Reuse letters freely, and hunt the pangram',
            body: 'Letters can be used as many times as you like, so PATENT is fine. A word using all seven letters is a pangram and pays a big bonus.',
            visual: (
              <WordWithRequiredLetter
                word="PATENT"
                required="T"
                accent={ACCENT}
                textColor={background.textColor}
              />
            ),
          },
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    position: 'relative',
  },
  backButton: { padding: 8, zIndex: 1 },
  backText: { fontSize: 16, fontWeight: '500' },
  titleWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold' },

  segmentSwitcher: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 8,
    borderRadius: 999,
    padding: 4,
  },
  segmentButton: { paddingVertical: 8, paddingHorizontal: 24, borderRadius: 999 },
  segmentButtonText: { fontSize: 14, fontWeight: '500' },

  tabStripWrapper: { flex: 1, overflow: 'hidden', alignItems: 'flex-start' },
  tabStrip: { width: width * 2, flexDirection: 'row' },
  tabContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },

  dailyCard: { borderRadius: 16, padding: 20, borderWidth: 2, marginBottom: 24 },
  dailyTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  dailySubtitle: { fontSize: 14, marginBottom: 16, textAlign: 'center' },
  dailyCompletedInfo: { alignItems: 'center', paddingVertical: 8 },
  dailyCompletedScore: { fontSize: 48, fontWeight: 'bold' },
  dailyCompletedLabel: { fontSize: 14, marginTop: 4, marginBottom: 8 },
  fullClearBadge: {
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  fullClearBadgeText: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  dailyStatPillRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 16 },
  dailyStatPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f3e7d7', minWidth: 100, alignItems: 'center', justifyContent: 'center' },
  dailyStatPillHighlight: { backgroundColor: 'rgba(212, 160, 23, 0.15)' },
  dailyStatPillLabel: { fontSize: 11, marginBottom: 2 },
  dailyStatPillValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dailyStatPillValue: { fontSize: 18, fontWeight: '600', color: '#2c2416', textAlign: 'center' },
  dailyButton: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  dailyButtonText: { fontSize: 16, fontWeight: '600' },
  dailyActionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  dailyActionButton: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  dailyActionText: { fontSize: 14, fontWeight: '600' },
  dailyShareIconButton: { borderRadius: 12, padding: 10, alignItems: 'center', justifyContent: 'center' },

  sectionLabel: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  modeCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, marginBottom: 12, overflow: 'hidden' },
  modeAccent: { width: 5, height: 40, borderRadius: 3, marginRight: 14 },
  modeTitle: { fontSize: 17, fontWeight: 'bold', marginBottom: 2 },
  modeDesc: { fontSize: 13 },

  rulesCard: { borderRadius: 16, borderWidth: 1, padding: 20, marginBottom: 16, marginTop: 8 },
  rulesTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rulesExampleLink: { fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
  rulesTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  ruleNum: { fontSize: 18, fontWeight: 'bold', width: 28 },
  ruleText: { fontSize: 14, flex: 1 },

  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  statsCard: { width: '48%', borderRadius: 12, borderWidth: 1, padding: 15, alignItems: 'center', justifyContent: 'center' },
  statsValue: { fontSize: 20, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  statsLabel: { fontSize: 12, textAlign: 'center' },
  emptyText: { fontSize: 14, marginTop: 8 },

  lifetimeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    marginTop: 16,
  },
  lifetimeItem: { flex: 1, alignItems: 'center' },
  lifetimeDivider: { width: 1, height: 32 },
  lifetimeValue: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  lifetimeLabel: { fontSize: 10, textAlign: 'center' },

  achievementsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  achievementCard: { width: '48%', padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginBottom: 10, justifyContent: 'center' },
  achievementEmoji: { fontSize: 32, marginBottom: 6 },
  achievementName: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  achievementDesc: { fontSize: 11, textAlign: 'center' },
  lockedDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 11, fontWeight: '600', marginHorizontal: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
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
    backgroundColor: ACCENT,
  },
});
