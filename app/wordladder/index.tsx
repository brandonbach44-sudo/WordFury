// app/wordladder/index.tsx

import { router, useFocusEffect } from 'expo-router';
import { AchievementIcon } from '../../src/shared/AchievementIcon';
import GameIntro, { markIntroSeen, shouldShowIntro } from '../../src/shared/GameIntro';
import { WordChain } from '../../src/shared/introVisuals';
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
import DailyCalendar, { type CalendarHistory } from '../../src/shared/DailyCalendar';
import { loadLadderDailyHistory } from '../../src/wordladder/utils/ladderStorage';

import { useTheme } from '../../src/shared/ThemeContext';
import { FallingLetters } from '../../src/shared/FallingLetters';
import { COLORS } from '../../src/shared/theme';
import {
  DIFFICULTY_CONFIG,
  DIFFICULTY_ORDER,
  type LadderDifficulty,
} from '../../src/wordladder/utils/generator';
import {
  formatDisplayDate,
  hasPlayedTodayDaily,
  loadDailyLock,
  loadDailyProgress,
  loadLadderStats,
  useCountdownToMidnight,
  type DailyLockState,
  type LadderStats,
} from '../../src/wordladder/utils/ladderStorage';
import {
  getUnlockedAchievements,
  LADDER_ACHIEVEMENTS,
  type Achievement,
} from '../../src/wordladder/utils/ladderAchievements';
import { getGolfTerm } from '../../src/wordladder/utils/golfTerms';

const { width } = Dimensions.get('window');
type Tab = 'play' | 'stats';
const TABS: Tab[] = ['play', 'stats'];

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

const DIFFICULTY_COLORS: Record<LadderDifficulty, string> = {
  easy: '#1D9E75',
  medium: '#378ADD',
  hard: '#D85A30',
};

export default function WordLadderEntryScreen() {
  const { background } = useTheme();

  // First-open worked example. The Perfect Day system walks players into this
  // game whether or not they've ever seen a word ladder, and "change one letter
  // each step" is much easier to show than to say.
  const [showIntro, setShowIntro] = useState(false);
  useEffect(() => {
    shouldShowIntro('wordladder').then(setShowIntro);
  }, []);
  const closeIntro = useCallback(() => {
    setShowIntro(false);
    markIntroSeen('wordladder').catch(() => {});
  }, []);

  const [activeTab, setActiveTab] = useState<Tab>('play');
  const tabAnim = useRef(new Animated.Value(0)).current;
  // Measured directly instead of trusting flex propagation through the
  // Animated.View row below. This is belt-and-suspenders after flex:1 alone
  // did not reliably give the row (and its ScrollView pages) the full
  // height, which was letting content sit un-scrollable-into below a fixed line.
  const [tabAreaHeight, setTabAreaHeight] = useState(0);
  const currentTabIdxRef = useRef(0);
  const dragBase = useRef(0);

  const [stats, setStats] = useState<LadderStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [dailyHistory, setDailyHistory] = useState<CalendarHistory>({});
  const [dailyLock, setDailyLock] = useState<DailyLockState | null>(null);
  const [dailyPlayed, setDailyPlayed] = useState(false);
  const [dailyInProgress, setDailyInProgress] = useState(false);
  const [unlocked, setUnlocked] = useState<(Achievement & { unlockedAt: string })[]>([]);
  const countdown = useCountdownToMidnight();

  const loadAll = useCallback(async () => {
    const [s, hist, lock, played, ach, progress] = await Promise.all([
      loadLadderStats().catch(() => null),
      loadLadderDailyHistory().catch(() => ({})),
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

  // Initial load
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
    if (!dailyLock) return;
    const result = dailyLock.result === 'won' ? `Solved in ${dailyLock.steps} steps (par ${dailyLock.par})` : `Gave up (par ${dailyLock.par})`;
    const streakLine = (stats?.daily.currentStreak ?? 0) > 1 ? `\n${stats?.daily.currentStreak} day streak` : '';
    const message = `Word Ladder Daily\n${formatDisplayDate()}\n${dailyLock.start.toUpperCase()} → ${dailyLock.end.toUpperCase()}\n${result}${streakLine}`;
    try {
      await Share.share({ message });
    } catch {}
  };

  const practiceStats = stats?.practice;
  const combinedGames = (stats?.practice.gamesPlayed ?? 0) + (stats?.daily.gamesPlayed ?? 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background.backgroundColor }]}>
      <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />
      <FallingLetters />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={[styles.backText, { color: background.secondaryText }]}>← Games</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: background.textColor }]}>Word Ladder</Text>
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
                {tab === 'play' ? 'Play' : 'Stats'}
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
            { transform: [{ translateX: tabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -width] }) }] },
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
              <Text style={[styles.dailyTitle, { color: background.textColor }]}>Daily Ladder</Text>
              <Text style={[styles.dailySubtitle, { color: background.secondaryText }]}>{formatDisplayDate()}</Text>

              {dailyPlayed && dailyLock && (
                <View style={styles.dailyCompletedInfo}>
                  <View style={[styles.dailyLadderVisual, { borderColor: background.borderColor, backgroundColor: background.backgroundColor }]}>
                    <Text style={[styles.dailyLadderWord, { color: background.textColor }]}>{dailyLock.start.toUpperCase()}</Text>
                    <Text style={[styles.dailyLadderArrow, { color: background.secondaryText }]}>→</Text>
                    <Text style={[styles.dailyLadderWord, { color: background.textColor }]}>{dailyLock.end.toUpperCase()}</Text>
                  </View>
                  <Text
                    style={styles.dailyCompletedScore}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.5}
                  >
                    {dailyLock.result === 'won' ? getGolfTerm(dailyLock.steps, dailyLock.par) : '—'}
                  </Text>
                  <Text style={[styles.dailyCompletedLabel, { color: background.secondaryText }]}>
                    {dailyLock.result === 'won'
                      ? `${dailyLock.steps} step${dailyLock.steps === 1 ? '' : 's'} · Par ${dailyLock.par}`
                      : 'Gave up today'}
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
                  onPress={() => router.push('/wordladder/daily')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.dailyButtonText, { color: background.textColor }]}>{dailyInProgress ? "Continue Today's Ladder" : "Play Today's Ladder"}</Text>
                </TouchableOpacity>
              )}

              {dailyPlayed && (
                <View style={styles.dailyActionRow}>
                  <TouchableOpacity
                    style={[styles.dailyActionButton, { backgroundColor: background.backgroundColor, borderColor: background.borderColor, borderWidth: 1.5 }]}
                    onPress={() => router.push('/wordladder/daily')}
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

            {/* Quick Play — difficulty picker */}
            <Text style={[styles.sectionLabel, { color: background.textColor }]}>Quick Play</Text>
            {DIFFICULTY_ORDER.map((diff) => {
              const config = DIFFICULTY_CONFIG[diff];
              const color = DIFFICULTY_COLORS[diff];
              return (
                <TouchableOpacity
                  key={diff}
                  style={[styles.modeCard, { backgroundColor: background.cardColor, borderColor: background.borderColor, borderWidth: 2 }]}
                  onPress={() => router.push({ pathname: '/wordladder/game', params: { difficulty: diff } })}
                  activeOpacity={0.8}
                >
                  <View style={[styles.modeAccent, { backgroundColor: color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modeTitle, { color: background.textColor }]}>{config.label}</Text>
                    <Text style={[styles.modeDesc, { color: background.secondaryText }]}>
                      {config.wordLength}-letter words · usually {config.minSteps}-{config.maxSteps} steps
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            <View style={[styles.rulesCard, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
              <View style={styles.rulesTitleRow}>
                <Text style={[styles.rulesTitle, { color: background.textColor }]}>How to Play</Text>
                {/* Always reopenable, so the intro is a reference rather than a
                    one-time thing someone skipped and can never get back. */}
                <Pressable onPress={() => setShowIntro(true)} hitSlop={8}>
                  <Text style={[styles.rulesExampleLink, { color: COLORS.accent }]}>See example</Text>
                </Pressable>
              </View>
              {[
                'Change exactly one letter to form a new word each step',
                'Every word along the way must be a real dictionary word',
                'Reach the target word in as few steps as possible',
                'Stuck? Use a hint to reveal one letter of the next word',
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
            ) : combinedGames > 0 ? (
              <>
                {/* ── DAILY LADDER ── */}
                <Text style={[styles.sectionTitle, { color: background.textColor }]}>Daily Ladder</Text>
                <View style={styles.statsGrid}>
                  {[
                    { label: 'Current Streak', value: (stats?.daily.currentStreak ?? 0).toString() },
                    { label: 'Best Streak', value: (stats?.daily.bestStreak ?? 0).toString() },
                    { label: 'Games Played', value: (stats?.daily.gamesPlayed ?? 0).toString() },
                    { label: 'Won', value: (stats?.daily.gamesWon ?? 0).toString() },
                    {
                      label: 'Win Rate',
                      value: `${
                        stats && stats.daily.gamesPlayed > 0
                          ? Math.round((stats.daily.gamesWon / stats.daily.gamesPlayed) * 100)
                          : 0
                      }%`,
                    },
                    { label: 'Perfect Solves', value: (stats?.daily.perfectSolves ?? 0).toString() },
                    {
                      label: 'Fastest Solve',
                      value: stats?.daily.fastestTimeSeconds != null ? `${stats.daily.fastestTimeSeconds}s` : '—',
                    },
                  ].map(({ label, value }) => (
                    <View key={label} style={[styles.statsCard, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
                      <Text style={[styles.statsValue, { color: background.textColor }]}>{value}</Text>
                      <Text style={[styles.statsLabel, { color: background.secondaryText }]}>{label}</Text>
                    </View>
                  ))}
                </View>

                {/* ── DAILY HISTORY CALENDAR ── */}
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

                {/* ── QUICK PLAY ── */}
                <Text style={[styles.sectionTitle, { color: background.textColor, marginTop: 25 }]}>Quick Play</Text>
                <View style={styles.statsGrid}>
                  {[
                    { label: 'Games Played', value: (practiceStats?.gamesPlayed ?? 0).toString() },
                    {
                      label: 'Won',
                      value: `${practiceStats?.gamesWon ?? 0} (${
                        practiceStats && practiceStats.gamesPlayed > 0
                          ? Math.round((practiceStats.gamesWon / practiceStats.gamesPlayed) * 100)
                          : 0
                      }%)`,
                    },
                    { label: 'Easy Wins', value: (practiceStats?.easyWins ?? 0).toString() },
                    { label: 'Medium Wins', value: (practiceStats?.mediumWins ?? 0).toString() },
                    { label: 'Hard Wins', value: (practiceStats?.hardWins ?? 0).toString() },
                    { label: 'Perfect Solves', value: (practiceStats?.perfectSolves ?? 0).toString() },
                    {
                      label: 'Fastest Solve',
                      value: practiceStats?.fastestTimeSeconds != null ? `${practiceStats.fastestTimeSeconds}s` : '—',
                    },
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
                No stats yet. Play a ladder to get started!
              </Text>
            )}

            {/* Achievements — unlocked first, then locked */}
            <Text style={[styles.sectionTitle, { color: background.textColor, marginTop: 25 }]}>
              Achievements ({unlocked.length}/{LADDER_ACHIEVEMENTS.length})
            </Text>

            {unlocked.length > 0 && (
              <View style={styles.achievementsGrid}>
                {LADDER_ACHIEVEMENTS.filter((a) => unlocked.some((u) => u.id === a.id)).map((achievement) => (
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

            {unlocked.length > 0 && unlocked.length < LADDER_ACHIEVEMENTS.length && (
              <View style={styles.lockedDivider}>
                <View style={[styles.dividerLine, { backgroundColor: background.borderColor }]} />
                <Text style={[styles.dividerText, { color: background.secondaryText }]}>Locked</Text>
                <View style={[styles.dividerLine, { backgroundColor: background.borderColor }]} />
              </View>
            )}

            {LADDER_ACHIEVEMENTS.filter((a) => !unlocked.some((u) => u.id === a.id)).length > 0 && (
              <View style={styles.achievementsGrid}>
                {LADDER_ACHIEVEMENTS.filter((a) => !unlocked.some((u) => u.id === a.id)).map((achievement) => (
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

      <GameIntro
        visible={showIntro}
        onClose={closeIntro}
        accentColor={COLORS.accent}
        cards={[
          {
            heading: 'Climb from one word to another',
            body: 'You start at one word and have to reach the target. Every rung of the ladder has to be a real word.',
            visual: (
              <WordChain
                words={['COLD', 'CORD', 'CORE', 'CARE']}
                accent={COLORS.accent}
                textColor={background.textColor}
                secondaryText={background.secondaryText}
              />
            ),
          },
          {
            heading: 'One letter at a time',
            body: 'Each step changes exactly one letter and leaves the rest where they are. The highlighted letter is the one that moved.',
            visual: (
              <WordChain
                words={['CORD', 'CORE']}
                accent={COLORS.accent}
                textColor={background.textColor}
                secondaryText={background.secondaryText}
              />
            ),
          },
          {
            heading: 'Fewer steps is better',
            body: 'Every puzzle has a par, which is the shortest ladder possible. Match it or beat it. Stuck on a rung? A hint reveals one letter.',
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

  dailyCard: { borderRadius: 16, padding: 20, borderWidth: 2, marginBottom: 24 },
  dailyTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  dailySubtitle: { fontSize: 14, marginBottom: 16, textAlign: 'center' },
  dailyCompletedInfo: { alignItems: 'center', paddingVertical: 8 },
  dailyLadderVisual: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  dailyLadderWord: { fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  dailyLadderArrow: { fontSize: 16, fontWeight: '700' },
  dailyCompletedScore: { fontSize: 32, fontWeight: 'bold', color: COLORS.accent, textAlign: 'center' },
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
  rulesTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rulesExampleLink: { fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
  rulesTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  ruleNum: { fontSize: 18, fontWeight: 'bold', width: 28 },
  ruleText: { fontSize: 14, flex: 1 },

  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
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
});
