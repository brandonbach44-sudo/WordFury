// app/anagrams/index.tsx

import { router, useFocusEffect } from 'expo-router';
import { AchievementIcon } from '../../src/shared/AchievementIcon';
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
import { COLORS } from '../../src/shared/theme';
import {
  formatDisplayDate,
  hasPlayedTodayDaily,
  loadDailyLock,
  loadDailyProgress,
  loadAnagramsStats,
  useCountdownToMidnight,
  type AnagramsStats,
  type DailyLockState,
  loadAnagramsDailyHistory,
} from '../../src/anagrams/utils/anagramsStorage';
import DailyCalendar, { type CalendarHistory } from '../../src/shared/DailyCalendar';
import {
  getUnlockedAchievements,
  getAchievementProgress,
  ANAGRAMS_ACHIEVEMENTS,
  type Achievement,
} from '../../src/anagrams/utils/anagramsAchievements';
import { AnagramsCubesTab } from '../../src/anagrams/components/AnagramsCubesTab';

const { width } = Dimensions.get('window');
// Same segment order as Word Builder's Play / Customize / Stats switcher.
type Tab = 'play' | 'customize' | 'stats';
const TABS: Tab[] = ['play', 'customize', 'stats'];
const TAB_LABELS: Record<Tab, string> = { play: 'Play', customize: 'Customize', stats: 'Stats' };

function formatSeconds(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
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

export default function AnagramsEntryScreen() {
  const { background } = useTheme();

  const [activeTab, setActiveTab] = useState<Tab>('play');
  const tabAnim = useRef(new Animated.Value(0)).current;
  // Measured directly instead of trusting flex propagation through the
  // Animated.View row below. This is belt-and-suspenders after flex:1 alone
  // did not reliably give the row (and its ScrollView pages) the full
  // height, which was letting content sit un-scrollable-into below a fixed line.
  const [tabAreaHeight, setTabAreaHeight] = useState(0);
  const currentTabIdxRef = useRef(0);
  const dragBase = useRef(0);

  const [stats, setStats] = useState<AnagramsStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [dailyLock, setDailyLock] = useState<DailyLockState | null>(null);
  const [dailyHistory, setDailyHistory] = useState<CalendarHistory>({});
  const [dailyPlayed, setDailyPlayed] = useState(false);
  const [dailyInProgress, setDailyInProgress] = useState(false);
  const [unlocked, setUnlocked] = useState<(Achievement & { unlockedAt: string })[]>([]);
  const countdown = useCountdownToMidnight();

  const loadAll = useCallback(async () => {
    const [s, hist, lock, played, ach, progress] = await Promise.all([
      loadAnagramsStats().catch(() => null),
      loadAnagramsDailyHistory().catch(() => ({})),
      loadDailyLock().catch(() => null),
      hasPlayedTodayDaily().catch(() => false),
      getUnlockedAchievements().catch(() => []),
      loadDailyProgress().catch(() => null),
    ]);
    setStats(s);
    setDailyHistory((hist as CalendarHistory) ?? {});
    setDailyLock(lock);
    setDailyPlayed(played);
    setUnlocked(ach);
    setDailyInProgress(!played && !!progress);
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
    if (!dailyLock) return;
    const result = dailyLock.won
      ? `Solved all 5 words — Score ${dailyLock.totalScore}${dailyLock.perfectBonusApplied ? ' (Perfect Run!)' : ''}`
      : `Score ${dailyLock.totalScore}`;
    const streakLine = (stats?.daily.currentStreak ?? 0) > 1 ? `\n${stats?.daily.currentStreak} day streak` : '';
    const message = `Anagrams Daily\n${formatDisplayDate()}\n${result}${streakLine}`;
    try {
      await Share.share({ message });
    } catch {}
  };

  const practiceStats = stats?.practice;
  const combinedGames = (stats?.practice.gamesPlayed ?? 0) + (stats?.daily.gamesPlayed ?? 0);

  const dailyWinRate =
    stats && stats.daily.gamesPlayed > 0 ? Math.round((stats.daily.gamesWon / stats.daily.gamesPlayed) * 100) : 0;
  const dailyAvgTime =
    stats && stats.daily.gamesPlayed > 0 ? stats.daily.totalTimeSeconds / stats.daily.gamesPlayed : null;
  const practiceAvgTime =
    practiceStats && practiceStats.gamesPlayed > 0 ? practiceStats.totalTimeSeconds / practiceStats.gamesPlayed : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background.backgroundColor }]}>
      <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />
      <FallingLetters />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={[styles.backText, { color: background.secondaryText }]}>← Games</Text>
        </TouchableOpacity>
        <View style={styles.titleWrap} pointerEvents="box-none">
          <Text style={[styles.title, { color: background.textColor }]}>Anagrams</Text>
        </View>
        <View style={styles.headerPlaceholder} />
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
                {TAB_LABELS[tab]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        style={styles.tabStripWrapper}
        {...panResponder.panHandlers}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - tabAreaHeight) > 1) setTabAreaHeight(h);
        }}
      >
        <Animated.View
          style={[
            styles.tabStrip,
            tabAreaHeight ? { height: tabAreaHeight } : null,
            { width: width * TABS.length, transform: [{ translateX: Animated.multiply(tabAnim, -width) }] },
          ]}
        >
          {/* ── PLAY TAB ── */}
          <ScrollView style={{ width }} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
            <View
              style={[
                styles.dailyCard,
                { backgroundColor: background.cardColor, borderColor: dailyPlayed ? COLORS.accent : background.borderColor },
              ]}
            >
              <Text style={[styles.dailyTitle, { color: background.textColor }]}>Daily Anagrams</Text>
              <Text style={[styles.dailySubtitle, { color: background.secondaryText }]}>{formatDisplayDate()}</Text>

              {dailyPlayed && dailyLock && (
                <View style={styles.dailyCompletedInfo}>
                  <Text style={styles.dailyCompletedScore}>{dailyLock.totalScore}</Text>
                  <Text style={[styles.dailyCompletedLabel, { color: background.secondaryText }]}>
                    {dailyLock.won ? 'All 5 solved' : 'Today\'s score'}
                  </Text>
                </View>
              )}

              <View style={styles.dailyStatPillRow}>
                <DailyStatPill
                  label="Current streak"
                  value={stats?.daily.currentStreak ?? 0}
                  icon={Flame}
                  iconColor="#e85d04"
                  highlight
                  secondaryText={background.secondaryText}
                />
                <DailyStatPill
                  label="Best streak"
                  value={stats?.daily.bestStreak ?? 0}
                  icon={Trophy}
                  iconColor="#d4a017"
                  secondaryText={background.secondaryText}
                />
              </View>

              {!dailyPlayed && (
                <TouchableOpacity
                  style={[styles.dailyButton, { backgroundColor: background.backgroundColor, borderColor: background.borderColor, borderWidth: 2 }]}
                  onPress={() => router.push('/anagrams/daily')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.dailyButtonText, { color: background.textColor }]}>{dailyInProgress ? "Continue Today's Anagrams" : "Play Today's Anagrams"}</Text>
                </TouchableOpacity>
              )}

              {dailyPlayed && (
                <View style={styles.dailyActionRow}>
                  <TouchableOpacity
                    style={[styles.dailyActionButton, { backgroundColor: background.backgroundColor, borderColor: background.borderColor, borderWidth: 1.5 }]}
                    onPress={() => router.push('/anagrams/daily')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.dailyActionText, { color: background.textColor }]}>View Results</Text>
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

              {dailyPlayed && (
                <View style={[styles.dailyCountdownContainer, { borderTopColor: 'rgba(0,0,0,0.1)' }]}>
                  <Text style={[styles.dailyCountdownLabel, { color: background.secondaryText }]}>Next challenge in</Text>
                  <Text style={[styles.dailyCountdownTime, { color: background.textColor }]}>{countdown}</Text>
                </View>
              )}
            </View>

            {/* Quick Play */}
            <Text style={[styles.sectionLabel, { color: background.textColor }]}>Quick Play</Text>
            <TouchableOpacity
              style={[styles.modeCard, { backgroundColor: background.cardColor, borderColor: background.borderColor, borderWidth: 2 }]}
              onPress={() => router.push('/anagrams/game')}
              activeOpacity={0.8}
            >
              <View style={[styles.modeAccent, { backgroundColor: '#D4A017' }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.modeTitle, { color: background.textColor }]}>Classic</Text>
                <Text style={[styles.modeDesc, { color: background.secondaryText }]}>
                  Unscramble 5 words, easiest to hardest — unlimited replays
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeCard, { backgroundColor: background.cardColor, borderColor: background.borderColor, borderWidth: 2 }]}
              onPress={() => router.push('/anagrams/categories')}
              activeOpacity={0.8}
            >
              <View style={[styles.modeAccent, { backgroundColor: COLORS.accent }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.modeTitle, { color: background.textColor }]}>Categories</Text>
                <Text style={[styles.modeDesc, { color: background.secondaryText }]}>
                  Same 5-word run, themed words — Animals, Food, Countries & more
                </Text>
              </View>
            </TouchableOpacity>

            <View style={[styles.rulesCard, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
              <Text style={[styles.rulesTitle, { color: background.textColor }]}>How to Play</Text>
              {[
                'Unscramble each set of letters into a real word',
                'Words get progressively longer and harder as you go',
                'Solve fast and hint-free for the highest score',
                'Stuck? Skip a word — it just won\'t count toward your score',
              ].map((rule, i) => (
                <View key={i} style={styles.ruleRow}>
                  <Text style={[styles.ruleNum, { color: COLORS.accent }]}>{i + 1}</Text>
                  <Text style={[styles.ruleText, { color: background.secondaryText }]}>{rule}</Text>
                </View>
              ))}
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>

          {/* ── CUSTOMIZE TAB ── */}
          <View style={{ width }}>
            <AnagramsCubesTab />
          </View>

          {/* ── STATS TAB ── */}
          <ScrollView style={{ width }} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
            {loadingStats ? (
              <ActivityIndicator color={COLORS.accent} style={{ marginTop: 20 }} />
            ) : combinedGames > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: background.textColor }]}>Daily Anagrams</Text>

                {/* Streak highlight row */}
                <View style={styles.streakRow}>
                  <View style={[styles.streakBox, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
                    <Text style={[styles.streakNum, { color: background.textColor }]}>{stats?.daily.currentStreak ?? 0}</Text>
                    <Text style={[styles.streakLbl, { color: background.secondaryText }]}>Current Streak</Text>
                  </View>
                  <View style={[styles.streakBox, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
                    <Text style={[styles.streakNum, { color: background.textColor }]}>{stats?.daily.bestStreak ?? 0}</Text>
                    <Text style={[styles.streakLbl, { color: background.secondaryText }]}>Best Streak</Text>
                  </View>
                  <View style={[styles.streakBox, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
                    <Text style={[styles.streakNum, { color: '#22c55e' }]}>{dailyWinRate}%</Text>
                    <Text style={[styles.streakLbl, { color: background.secondaryText }]}>Win Rate</Text>
                  </View>
                </View>

                <View style={styles.statsGrid}>
                  {[
                    { label: 'Games Played', value: (stats?.daily.gamesPlayed ?? 0).toString() },
                    { label: 'Won', value: (stats?.daily.gamesWon ?? 0).toString() },
                    { label: 'Lost', value: ((stats?.daily.gamesPlayed ?? 0) - (stats?.daily.gamesWon ?? 0)).toString() },
                    { label: 'Best Score', value: (stats?.daily.bestScore ?? 0).toString() },
                    { label: 'Lifetime Score', value: (stats?.daily.totalScore ?? 0).toLocaleString() },
                    { label: 'Perfect Runs', value: (stats?.daily.perfectRuns ?? 0).toString() },
                    { label: 'Words Solved', value: (stats?.daily.wordsSolved ?? 0).toString() },
                    { label: 'Avg Time / Run', value: dailyAvgTime != null ? formatSeconds(dailyAvgTime) : '--' },
                    { label: 'Fastest Perfect', value: stats?.daily.fastestPerfectTimeSeconds != null ? formatSeconds(stats.daily.fastestPerfectTimeSeconds) : '--' },
                  ].map(({ label, value }) => (
                    <View key={label} style={[styles.statsCard, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
                      <Text style={[styles.statsValue, { color: background.textColor }]}>{value}</Text>
                      <Text style={[styles.statsLabel, { color: background.secondaryText }]}>{label}</Text>
                    </View>
                  ))}
                </View>

                <Text style={[styles.sectionTitle, { color: background.textColor, marginTop: 25 }]}>Daily History</Text>
                <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                  <DailyCalendar
                    history={dailyHistory}
                    accentColor={COLORS.accent}
                    textColor={background.textColor}
                    secondaryTextColor={background.secondaryText}
                    cardColor={background.cardColor}
                    borderColor={background.borderColor}
                  />
                </View>

                <Text style={[styles.sectionTitle, { color: background.textColor, marginTop: 28 }]}>Quick Play</Text>
                <View style={styles.statsGrid}>
                  {[
                    { label: 'Games Played', value: (practiceStats?.gamesPlayed ?? 0).toString() },
                    { label: 'Won', value: (practiceStats?.gamesWon ?? 0).toString() },
                    { label: 'Lost', value: ((practiceStats?.gamesPlayed ?? 0) - (practiceStats?.gamesWon ?? 0)).toString() },
                    { label: 'Best Score', value: (practiceStats?.bestScore ?? 0).toString() },
                    { label: 'Lifetime Score', value: (practiceStats?.totalScore ?? 0).toLocaleString() },
                    { label: 'Perfect Runs', value: (practiceStats?.perfectRuns ?? 0).toString() },
                    { label: 'Words Solved', value: (practiceStats?.wordsSolved ?? 0).toString() },
                    { label: 'Avg Time / Run', value: practiceAvgTime != null ? formatSeconds(practiceAvgTime) : '--' },
                    { label: 'Fastest Perfect', value: practiceStats?.fastestPerfectTimeSeconds != null ? formatSeconds(practiceStats.fastestPerfectTimeSeconds) : '--' },
                  ].map(({ label, value }) => (
                    <View key={label} style={[styles.statsCard, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
                      <Text style={[styles.statsValue, { color: background.textColor }]}>{value}</Text>
                      <Text style={[styles.statsLabel, { color: background.secondaryText }]}>{label}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={[styles.emptyText, { color: background.secondaryText }]}>
                No stats yet. Play an Anagrams run to get started!
              </Text>
            )}

            {/* Achievements — unlocked first, then locked */}
            <Text style={[styles.sectionTitle, { color: background.textColor, marginTop: 25 }]}>
              Achievements ({unlocked.length}/{ANAGRAMS_ACHIEVEMENTS.length})
            </Text>

            {unlocked.length > 0 && (
              <View style={styles.achievementsGrid}>
                {ANAGRAMS_ACHIEVEMENTS.filter((a) => unlocked.some((u) => u.id === a.id)).map((achievement) => (
                  <View key={achievement.id} style={[styles.achievementCard, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
                    <View style={styles.achievementEmoji}>
                      <AchievementIcon category={achievement.category} size={26} color={background.textColor} />
                    </View>
                    <Text style={[styles.achievementName, { color: background.textColor }]}>{achievement.name}</Text>
                    <Text style={[styles.achievementDesc, { color: background.secondaryText }]}>{achievement.description}</Text>
                  </View>
                ))}
              </View>
            )}

            {unlocked.length > 0 && unlocked.length < ANAGRAMS_ACHIEVEMENTS.length && (
              <View style={styles.lockedDivider}>
                <View style={[styles.dividerLine, { backgroundColor: background.borderColor }]} />
                <Text style={[styles.dividerText, { color: background.secondaryText }]}>Locked</Text>
                <View style={[styles.dividerLine, { backgroundColor: background.borderColor }]} />
              </View>
            )}

            {ANAGRAMS_ACHIEVEMENTS.filter((a) => !unlocked.some((u) => u.id === a.id)).length > 0 && (
              <View style={styles.achievementsGrid}>
                {ANAGRAMS_ACHIEVEMENTS.filter((a) => !unlocked.some((u) => u.id === a.id)).map((achievement) => {
                  const progress = stats ? getAchievementProgress(achievement, stats) : undefined;
                  const showProgress = progress !== undefined && progress > 0;
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
                      {showProgress && (
                        <View style={[styles.progressTrack, { backgroundColor: background.borderColor }]}>
                          <View style={[styles.progressFill, { width: `${Math.round(progress! * 100)}%` }]} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    position: 'relative',
  },
  backButton: { padding: 8, zIndex: 1 },
  backText: { fontSize: 16, fontWeight: '500' },
  headerPlaceholder: { width: 60, zIndex: 1 },
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
  // flex:1 is required here. Without it, this row has no definite height for
  // its ScrollView children to stretch into, so content gets clipped by the
  // overflow:hidden wrapper before it reaches the true screen bottom.
  tabStrip: { flex: 1, flexDirection: 'row' },
  tabContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },

  dailyCard: { borderRadius: 16, padding: 20, borderWidth: 2, marginBottom: 24 },
  dailyTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  dailySubtitle: { fontSize: 14, marginBottom: 16, textAlign: 'center' },
  dailyCompletedInfo: { alignItems: 'center', paddingVertical: 8 },
  dailyCompletedScore: { fontSize: 48, fontWeight: 'bold', color: COLORS.accent },
  dailyCompletedLabel: { fontSize: 14, marginTop: 4, marginBottom: 8 },
  dailyStatPillRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 16 },
  dailyStatPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f3e7d7', minWidth: 100, alignItems: 'center' },
  dailyStatPillHighlight: { backgroundColor: 'rgba(78, 204, 163, 0.15)' },
  dailyStatPillLabel: { fontSize: 11, marginBottom: 2 },
  dailyStatPillValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dailyStatPillValue: { fontSize: 18, fontWeight: '600', color: '#2c2416' },
  dailyButton: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  dailyButtonText: { fontSize: 16, fontWeight: '600' },
  dailyActionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  dailyActionButton: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  dailyActionText: { fontSize: 14, fontWeight: '600' },
  dailyShareIconButton: { borderRadius: 12, padding: 10, alignItems: 'center', justifyContent: 'center' },
  dailyCountdownContainer: { alignItems: 'center', paddingTop: 12, borderTopWidth: 1 },
  dailyCountdownLabel: { fontSize: 12, marginBottom: 4 },
  dailyCountdownTime: { fontSize: 20, fontWeight: '600' },

  sectionLabel: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  modeCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, marginBottom: 12, overflow: 'hidden' },
  modeAccent: { width: 5, height: 40, borderRadius: 3, marginRight: 14 },
  modeTitle: { fontSize: 17, fontWeight: 'bold', marginBottom: 2 },
  modeDesc: { fontSize: 13 },

  rulesCard: { borderRadius: 16, borderWidth: 1, padding: 20, marginBottom: 16, marginTop: 8 },
  rulesTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  ruleNum: { fontSize: 18, fontWeight: 'bold', width: 28 },
  ruleText: { fontSize: 14, flex: 1 },

  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },

  streakRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  streakBox: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: 'center' },
  streakNum: { fontSize: 28, fontWeight: '900' },
  streakLbl: { fontSize: 11, textAlign: 'center', marginTop: 2 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  statsCard: { width: '48%', borderRadius: 12, borderWidth: 1, padding: 15, alignItems: 'center' },
  statsValue: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  statsLabel: { fontSize: 12, textAlign: 'center' },
  emptyText: { fontSize: 14, marginTop: 8 },

  achievementsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  achievementCard: { width: '48%', padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  achievementEmoji: { fontSize: 32, marginBottom: 6 },
  achievementEmojiLocked: { opacity: 0.5 },
  achievementName: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  achievementDesc: { fontSize: 11, textAlign: 'center' },
  achievementCardLocked: { opacity: 0.5 },
  achievementTextLocked: { opacity: 0.7 },
  lockedDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 11, fontWeight: '600', marginHorizontal: 10, textTransform: 'uppercase', letterSpacing: 0.8 },

  // Green progress bar for locked, progress-trackable achievements —
  // same look as Wordle's achievement progress bars.
  progressTrack: {
    marginTop: 8,
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#22c55e',
  },
});
