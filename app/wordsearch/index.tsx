// app/wordsearch/index.tsx

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
import DailyCalendar, { type CalendarHistory } from '../../src/shared/DailyCalendar';
import { COLORS } from '../../src/shared/theme';
import {
  formatDisplayDate,
  getTodayDateString,
  useCountdownToMidnight,
} from '../../src/wordsearch/utils/storage';
import {
  loadWordSearchDailyStats,
  loadWordSearchDailyProgress,
  loadWordSearchStats,
  loadWSDailyHistory,
  type WordSearchDailyStats,
  type WordSearchStats,
} from '../../src/wordsearch/utils/wsStorage';
import {
  getUnlockedWSAchievements,
  WS_ACHIEVEMENTS,
  type WSAchievement,
} from '../../src/wordsearch/utils/wsAchievements';

const { width } = Dimensions.get('window');
type Tab = 'play' | 'stats';
const TABS: Tab[] = ['play', 'stats'];

// ── Streak pill (matches Word Builder exactly) ──────────────────────────────
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

// ── Main screen ─────────────────────────────────────────────────────────────
const WordSearchEntryScreen: React.FC = () => {
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

  const [stats, setStats] = useState<WordSearchStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [dailyStats, setDailyStats] = useState<WordSearchDailyStats | null>(null);
  const [dailyInProgress, setDailyInProgress] = useState(false);
  const [unlockedAchievements, setUnlockedAchievements] = useState<(WSAchievement & { unlockedAt: string })[]>([]);
  const [dailyHistory, setDailyHistory] = useState<CalendarHistory>({});
  const countdown = useCountdownToMidnight();

  const dailyPlayed = dailyStats?.lastPlayedDate === getTodayDateString();

  const loadAll = useCallback(async () => {
    const [s, ds, hist, unlocked, progress] = await Promise.all([
      loadWordSearchStats().catch(() => null),
      loadWordSearchDailyStats().catch(() => null),
      loadWSDailyHistory().catch(() => ({})),
      getUnlockedWSAchievements().catch(() => []),
      loadWordSearchDailyProgress().catch(() => null),
    ]);
    setStats(s);
    setDailyStats(ds);
    setDailyHistory((hist as CalendarHistory) ?? {});
    setUnlockedAchievements(unlocked);
    const playedToday = ds?.lastPlayedDate === getTodayDateString();
    setDailyInProgress(!playedToday && !!progress);
    setLoadingStats(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Refresh every time this screen regains focus (e.g. returning from a
  // finished game) so stats/daily state never look stale.
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
    const result = dailyStats?.lastDailyResult === 'won' ? 'Won' : 'Lost';
    const streakLine = (dailyStats?.streak ?? 0) > 1 ? `Streak: ${dailyStats!.streak} days\n` : '';
    const message = `Word Search Daily\n${formatDisplayDate()}\n\n${result} Score: ${dailyStats?.lastDailyScore ?? 0}\n${streakLine}\nPlay Word Fury!`;
    try { await Share.share({ message }); } catch {}
  };

  // gamesPlayed/gamesWon on WordSearchStats are combined (daily + quick play);
  // dailyGamesPlayed/dailyGamesWon track the daily-only subset within it, so
  // subtracting gives the Quick-Play-only counts for the split stats below.
  const quickPlayGamesPlayed = Math.max(0, (stats?.gamesPlayed ?? 0) - (stats?.dailyGamesPlayed ?? 0));
  const quickPlayGamesWon = Math.max(0, (stats?.gamesWon ?? 0) - (stats?.dailyGamesWon ?? 0));
  const quickPlayWinRate = quickPlayGamesPlayed > 0 ? Math.round((quickPlayGamesWon / quickPlayGamesPlayed) * 100) : 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background.backgroundColor }]}>
      <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />
      <FallingLetters />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={[styles.backText, { color: background.secondaryText }]}>← Games</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: background.textColor }]}>Word Search</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {/* Segment switcher */}
      <View style={[styles.segmentSwitcher, { backgroundColor: background.cardColor }]}>
        {TABS.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <Pressable
              key={tab}
              style={[styles.segmentButton, isActive && { backgroundColor: background.backgroundColor }]}
              onPress={() => handleTabPress(tab)}
            >
              <Text style={[
                styles.segmentButtonText,
                { color: background.secondaryText },
                isActive && { color: background.textColor, fontWeight: '600' },
              ]}>
                {tab === 'play' ? 'Play' : 'Stats'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Swipable tab strip */}
      <View
        style={styles.tabStripWrapper}
        {...panResponder.panHandlers}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - tabAreaHeight) > 1) setTabAreaHeight(h);
        }}
      >
        <Animated.View style={[styles.tabStrip, tabAreaHeight ? { height: tabAreaHeight } : null, {
          transform: [{ translateX: tabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -width] }) }],
        }]}>

          {/* ── PLAY TAB ── */}
          <ScrollView style={{ width }} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>

            {/* Daily Challenge Card — matches Word Builder */}
            <View style={[
              styles.dailyCard,
              { backgroundColor: background.cardColor, borderColor: dailyPlayed ? COLORS.accent : background.borderColor },
            ]}>
              <Text style={[styles.dailyTitle, { color: background.textColor }]}>Daily Challenge</Text>
              <Text style={[styles.dailySubtitle, { color: background.secondaryText }]}>{formatDisplayDate()}</Text>

              {/* Score display — only when completed */}
              {dailyPlayed && dailyStats && (
                <View style={styles.dailyCompletedInfo}>
                  <Text style={styles.dailyCompletedScore}>{dailyStats.lastDailyScore}</Text>
                  <Text style={[styles.dailyCompletedLabel, { color: background.secondaryText }]}>
                    {dailyStats.lastDailyResult === 'won' ? 'All words found' : 'Better luck tomorrow'}
                  </Text>
                </View>
              )}

              {/* Streak pills */}
              <View style={styles.dailyStatPillRow}>
                <DailyStatPill
                  label="Current streak"
                  value={dailyStats?.streak ?? 0}
                  icon={Flame}
                  iconColor="#e85d04"
                  highlight
                  secondaryText={background.secondaryText}
                />
                <DailyStatPill
                  label="Best streak"
                  value={dailyStats?.bestStreak ?? 0}
                  icon={Trophy}
                  iconColor="#d4a017"
                  secondaryText={background.secondaryText}
                />
              </View>

              {/* Play button — not played */}
              {!dailyPlayed && (
                <TouchableOpacity
                  style={[styles.dailyButton, { backgroundColor: background.backgroundColor, borderColor: background.borderColor, borderWidth: 2 }]}
                  onPress={() => router.push('/wordsearch/daily')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.dailyButtonText, { color: background.textColor }]}>{dailyInProgress ? "Continue Today's Challenge" : "Play Today's Challenge"}</Text>
                </TouchableOpacity>
              )}

              {/* View Results + Share — played */}
              {dailyPlayed && (
                <View style={styles.dailyActionRow}>
                  <TouchableOpacity
                    style={[styles.dailyActionButton, { backgroundColor: background.backgroundColor, borderColor: background.borderColor, borderWidth: 1.5 }]}
                    onPress={() => router.push('/wordsearch/daily')}
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

              {/* Countdown — played */}
              {dailyPlayed && (
                <View style={[styles.dailyCountdownContainer, { borderTopColor: 'rgba(0,0,0,0.1)' }]}>
                  <Text style={[styles.dailyCountdownLabel, { color: background.secondaryText }]}>Next challenge in</Text>
                  <Text style={[styles.dailyCountdownTime, { color: background.textColor }]}>{countdown}</Text>
                </View>
              )}
            </View>

            {/* Quick Play Card */}
            <TouchableOpacity
              style={[styles.modeCard, { backgroundColor: background.cardColor, borderColor: background.borderColor, borderWidth: 2 }]}
              onPress={() => router.push('/wordsearch/play')}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeTitle, { color: background.textColor }]}>Quick Play</Text>
              <Text style={[styles.modeDesc, { color: background.secondaryText }]}>
                Choose a category and difficulty, then find all hidden words
              </Text>
            </TouchableOpacity>

            {/* How to Play */}
            <View style={[styles.rulesCard, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
              <Text style={[styles.rulesTitle, { color: background.textColor }]}>How to Play</Text>
              {[
                'Drag your finger across letters in the grid',
                'Words can go in any direction — even diagonal',
                'Found words are highlighted and crossed off the list',
                'Find all words to complete the puzzle',
              ].map((rule, i) => (
                <View key={i} style={styles.ruleRow}>
                  <Text style={[styles.ruleNum, { color: COLORS.accent }]}>{i + 1}</Text>
                  <Text style={[styles.ruleText, { color: background.secondaryText }]}>{rule}</Text>
                </View>
              ))}
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>

          {/* ── STATS TAB ── */}
          <ScrollView style={{ width }} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
            {loadingStats ? (
              <ActivityIndicator color={COLORS.accent} style={{ marginTop: 20 }} />
            ) : stats && stats.gamesPlayed > 0 ? (
              <>
                {/* ── DAILY WORD SEARCH ── */}
                <Text style={[styles.sectionTitle, { color: background.textColor }]}>Daily Word Search</Text>
                <View style={styles.statsGrid}>
                  {[
                    { label: 'Current Streak', value: (dailyStats?.streak ?? 0).toString() },
                    { label: 'Best Streak', value: (dailyStats?.bestStreak ?? 0).toString() },
                    { label: 'Games Played', value: (dailyStats?.dailyGamesPlayed ?? 0).toString() },
                    { label: 'Games Won', value: (stats.dailyGamesWon ?? 0).toString() },
                    { label: 'Last Score', value: (dailyStats?.lastDailyScore ?? 0).toString() },
                  ].map(({ label, value }) => (
                    <View key={label} style={[styles.statsCard, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
                      <Text style={[styles.statsValue, { color: background.textColor }]}>{value}</Text>
                      <Text style={[styles.statsLabel, { color: background.secondaryText }]}>{label}</Text>
                    </View>
                  ))}
                </View>

                {/* ── DAILY HISTORY CALENDAR ── */}
                <Text style={[styles.sectionTitle, { color: background.textColor, marginTop: 25 }]}>Daily History</Text>
                <DailyCalendar
                  history={dailyHistory}
                  accentColor={COLORS.accent}
                  textColor={background.textColor}
                  secondaryTextColor={background.secondaryText}
                  cardColor={background.cardColor}
                  borderColor={background.borderColor}
                />

                {/* ── QUICK PLAY ── */}
                <Text style={[styles.sectionTitle, { color: background.textColor, marginTop: 25 }]}>Quick Play</Text>
                <View style={styles.statsGrid}>
                  {[
                    { label: 'Games Played', value: quickPlayGamesPlayed.toString() },
                    { label: 'Games Won', value: `${quickPlayGamesWon} (${quickPlayWinRate}%)` },
                    { label: 'Best Score', value: (stats.bestScore ?? 0).toString() },
                    { label: 'Win Streak', value: (stats.currentStreak ?? 0).toString() },
                    { label: 'Words Found', value: (stats.totalWordsFound ?? 0).toString() },
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
                No stats yet. Play a game to get started!
              </Text>
            )}

            {/* Achievements — unlocked first, then locked */}
            <Text style={[styles.sectionTitle, { color: background.textColor, marginTop: 25 }]}>
              Achievements ({unlockedAchievements.length}/{WS_ACHIEVEMENTS.length})
            </Text>

            {unlockedAchievements.length > 0 && (
              <View style={styles.achievementsGrid}>
                {WS_ACHIEVEMENTS.filter((a) => unlockedAchievements.some((u) => u.id === a.id)).map((achievement) => (
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

            {unlockedAchievements.length > 0 && unlockedAchievements.length < WS_ACHIEVEMENTS.length && (
              <View style={styles.lockedDivider}>
                <View style={[styles.dividerLine, { backgroundColor: background.borderColor }]} />
                <Text style={[styles.dividerText, { color: background.secondaryText }]}>Locked</Text>
                <View style={[styles.dividerLine, { backgroundColor: background.borderColor }]} />
              </View>
            )}

            {WS_ACHIEVEMENTS.filter((a) => !unlockedAchievements.some((u) => u.id === a.id)).length > 0 && (
              <View style={styles.achievementsGrid}>
                {WS_ACHIEVEMENTS.filter((a) => !unlockedAchievements.some((u) => u.id === a.id)).map((achievement) => (
                  <View
                    key={achievement.id}
                    style={[styles.achievementCard, styles.achievementCardLocked, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}
                  >
                    <View style={[styles.achievementEmoji, styles.achievementEmojiLocked]}>
                      <AchievementIcon category={achievement.category} size={26} color={background.textColor} />
                    </View>
                    <Text style={[styles.achievementName, styles.achievementTextLocked, { color: background.textColor }]}>{achievement.name}</Text>
                    <Text style={[styles.achievementDesc, styles.achievementTextLocked, { color: background.secondaryText }]}>{achievement.description}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>

        </Animated.View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  backButton: { flex: 1, alignItems: 'flex-start', padding: 8 },
  backText: { fontSize: 16, fontWeight: '500' },
  headerPlaceholder: { flex: 1 },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center' },

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
  tabStrip: { flex: 1, width: width * 2, flexDirection: 'row' },
  tabContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },

  // Daily card — mirrors Word Builder
  dailyCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    marginBottom: 24,
  },
  dailyTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  dailySubtitle: { fontSize: 14, marginBottom: 16, textAlign: 'center' },
  dailyCompletedInfo: { alignItems: 'center', paddingVertical: 8 },
  dailyCompletedScore: { fontSize: 48, fontWeight: 'bold', color: COLORS.accent },
  dailyCompletedLabel: { fontSize: 14, marginTop: 4, marginBottom: 8 },
  dailyStatPillRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 16 },
  dailyStatPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f3e7d7',
    minWidth: 100,
    alignItems: 'center',
  },
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

  // Mode cards
  modeCard: { borderRadius: 16, padding: 20, marginBottom: 16 },
  modeTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  modeDesc: { fontSize: 14 },

  // Rules card
  rulesCard: { borderRadius: 16, borderWidth: 1, padding: 20, marginBottom: 16 },
  rulesTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  ruleNum: { fontSize: 18, fontWeight: 'bold', width: 28 },
  ruleText: { fontSize: 14, flex: 1 },

  // Stats
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  statsCard: { width: '48%', borderRadius: 12, borderWidth: 1, padding: 15, alignItems: 'center' },
  statsValue: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  statsLabel: { fontSize: 12, textAlign: 'center' },
  emptyText: { fontSize: 14, marginTop: 8 },

  // Achievements
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
});

export default WordSearchEntryScreen;
