// app/fury-breakdown.tsx
//
// Score breakdown, opened from the row under the hero on Your Fury: how Fury
// points work, the placement bonus chips and rule, and the chosen week day
// by day. It loads and refreshes its week the same way WeeklyFurySection
// does, so its total always matches the hero there.

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../src/shared/ThemeContext';
import { addDaysISO, localDateISO, weekMondayISO } from '../src/shared/leaderboards/dates';
import {
  BonusRule,
  HowPointsWork,
  TierCard,
  WEEK_OPTIONS,
  WeekBreakdownCard,
  type Week,
} from '../src/shared/leaderboards/FuryBreakdown';
import { useGameCenterState } from '../src/shared/leaderboards/gameCenter';
import { loadWeek, refreshFury, type WeekBreakdown } from '../src/shared/leaderboards/ledger';
import { Segmented } from '../src/shared/leaderboards/Segmented';

export default function FuryBreakdownScreen() {
  const { background } = useTheme();
  const gc = useGameCenterState();
  const params = useLocalSearchParams<{ week?: string }>();
  const [week, setWeek] = useState<Week>(params.week === 'last' ? 'last' : 'this');
  const [breakdown, setBreakdown] = useState<WeekBreakdown | null>(null);

  const today = localDateISO();
  const thisMonday = weekMondayISO(today);
  const monday = week === 'this' ? thisMonday : addDaysISO(thisMonday, -7);
  const signedIn = gc.status === 'signedIn';

  const loadBreakdown = useCallback(() => {
    loadWeek(monday).then(setBreakdown).catch(() => {});
  }, [monday]);

  useEffect(loadBreakdown, [loadBreakdown]);

  // Same refresh as Your Fury, so the numbers here match its hero.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      refreshFury({ rebuild: 'daily' }).finally(() => {
        if (!cancelled) loadBreakdown();
      });
      return () => {
        cancelled = true;
      };
    }, [loadBreakdown]),
  );

  return (
    <View style={[styles.root, { backgroundColor: background.backgroundColor }]}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={background.statusBar === 'dark' ? 'dark-content' : 'light-content'} />

        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={[styles.brand, { color: background.secondaryText }]}>SCORE BREAKDOWN</Text>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()} hitSlop={10}>
            <X size={22} color={background.secondaryText} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sectionTitle, { color: background.textColor }]}>How Fury points work</Text>
          <HowPointsWork />

          <Text style={[styles.sectionTitle, styles.sectionGap, { color: background.textColor }]}>
            Placement bonus
          </Text>
          <TierCard />
          <BonusRule />

          {breakdown && (
            <WeekBreakdownCard
              breakdown={breakdown}
              todayISO={today}
              showBonus={signedIn}
              title={week === 'this' ? 'Your Week' : 'Last Week'}
            >
              <Segmented options={WEEK_OPTIONS} value={week} onChange={setWeek} style={styles.seg} />
            </WeekBreakdownCard>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 10,
  },
  headerSpacer: { width: 22 },
  brand: { fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  closeButton: { width: 22, alignItems: 'flex-end' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },

  sectionTitle: { textAlign: 'center', fontSize: 22, fontWeight: '900', marginTop: 8, marginBottom: 14 },
  sectionGap: { marginTop: 28, marginBottom: 0 },
  seg: { marginTop: 12 },
});
