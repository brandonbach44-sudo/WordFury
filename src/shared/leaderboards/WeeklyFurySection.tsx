// src/shared/leaderboards/WeeklyFurySection.tsx
//
// The weekly Fury board on Your Fury: a hero card with the week's Fury
// points and the player's weekly place, This week / Last week, the board
// itself (each row shows seven Monday-to-Sunday squares and a medal count
// read from the entry's context). Under the hero, a Score breakdown row opens
// app/fury-breakdown.tsx with the rules and the player's own breakdown.
//
// Signed-out players keep their finishing points from the local ledger:
// they see the hero, with no bonus, no rank and no board.

import { router, useFocusEffect } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { heroFontSize } from '../heroFontSize';
import { withOpacity } from '../ResultsScreen';
import { useTheme } from '../ThemeContext';
import { WEEKLY_BOARD_ID } from './boards';
import { GapRow, MessageRow } from './BoardRows';
import { addDaysISO, localDateISO, weekIdFor, weekMondayISO } from './dates';
import type { BoardRow } from './entries';
import { furyCardColors as cardColors, fmtFury as fmt, WEEK_OPTIONS, type Week } from './FuryBreakdown';
import { MAX_WEEKLY_FURY } from './furyPoints';
import { useGameCenterState } from './gameCenter';
import { loadWeek, refreshFury, unpackWeeklyContext, type WeekBreakdown } from './ledger';
import { Segmented } from './Segmented';
import { promptGameCenterSignIn, SIGN_IN_PROMPT } from './TodayLeaderboardCard';
import { MEDAL_COLORS, PlaceMarker, RankMark, rankMarkFor } from './ui';
import { useLeaderboard } from './useLeaderboard';

const FLAME = '#e85d04';

export const WeeklyFurySection: React.FC = () => {
  const { background } = useTheme();
  const gc = useGameCenterState();
  const [week, setWeek] = useState<Week>('this');
  const [breakdown, setBreakdown] = useState<WeekBreakdown | null>(null);

  const today = localDateISO();
  const thisMonday = weekMondayISO(today);
  const monday = week === 'this' ? thisMonday : addDaysISO(thisMonday, -7);

  const { status, board, reload } = useLeaderboard(WEEKLY_BOARD_ID, {
    weeksBack: week === 'this' ? 0 : 1,
    count: 25,
  });

  const loadBreakdown = useCallback(() => {
    loadWeek(monday).then(setBreakdown).catch(() => {});
  }, [monday]);

  useEffect(loadBreakdown, [loadBreakdown]);

  // Opening Your Fury collects settled bonuses, rebuilds the ledger from
  // Game Center at most once a day, and posts the weekly total.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      refreshFury({ rebuild: 'daily' }).finally(() => {
        if (cancelled) return;
        loadBreakdown();
        reload();
      });
      return () => {
        cancelled = true;
      };
    }, [loadBreakdown, reload]),
  );

  const dailies = breakdown ? breakdown.dailiesDone.reduce((a, b) => a + b, 0) : 0;
  const heroText = fmt(breakdown?.total ?? 0);
  const local = board?.local ?? null;
  const rows = board?.rows ?? [];
  const localShown = !!local && rows.some((r) => r.playerId === local.playerId);
  const count = board?.totalPlayerCount ?? null;
  const signedIn = gc.status === 'signedIn';

  let list: React.ReactNode = null;
  if (status === 'signedOut') {
    list = (
      <Pressable onPress={promptGameCenterSignIn} accessibilityRole="button">
        <View style={[styles.card, styles.list, cardColors(background)]}>
          <MessageRow text={SIGN_IN_PROMPT} first highlight />
        </View>
      </Pressable>
    );
  } else if (status === 'ready' || status === 'empty') {
    list = (
      <>
        <View style={[styles.card, styles.list, cardColors(background)]}>
          {rows.length === 0 && !local && <MessageRow
              text={week === 'this' ? 'No Fury points posted yet this week' : 'No Fury points posted last week'}
              first
            />}
          {rows.map((row, i) => (
            <WeeklyRowView key={row.playerId} row={row} monday={monday} first={i === 0} />
          ))}
          {local && !localShown && (
            <>
              {rows.length > 0 && <GapRow />}
              <WeeklyRowView row={local} monday={monday} first />
            </>
          )}
        </View>
        {count !== null && (
          <Text style={[styles.count, { color: background.secondaryText }]}>
            {fmt(count)} {count === 1 ? 'player' : 'players'} {week === 'this' ? 'this week' : 'last week'} · max{' '}
            {fmt(MAX_WEEKLY_FURY)}
          </Text>
        )}
      </>
    );
  } else if (status === 'error') {
    list = (
      <Pressable onPress={reload} accessibilityRole="button">
        <Text style={[styles.note, { color: background.secondaryText }]}>
          Couldn't load the weekly board. Tap to try again.
        </Text>
      </Pressable>
    );
  } else if (status === 'notOpen') {
    list = <Text style={[styles.note, { color: background.secondaryText }]}>Weekly Fury opens Monday</Text>;
  } else if (status === 'loading') {
    list = <Text style={[styles.note, { color: background.secondaryText }]}>Loading...</Text>;
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: background.textColor }]}>
        {week === 'this' ? 'This Week' : 'Last Week'}
      </Text>
      <Text style={[styles.subtitle, { color: background.secondaryText }]}>
        Fury points from every daily. Resets Monday.
      </Text>

      <View style={[styles.card, styles.hero, cardColors(background)]}>
        <Text style={[styles.heroLabel, { color: background.secondaryText }]}>Your Fury points</Text>
        <Text
          style={[styles.heroValue, heroFontSize(heroText), { color: background.textColor }]}
          numberOfLines={1}
        >
          {heroText}
        </Text>
        <Text style={[styles.heroNote, { color: background.secondaryText }]}>
          {dailies} {dailies === 1 ? 'daily' : 'dailies'}
          {signedIn ? ` · ${fmt(breakdown?.bonusTotal ?? 0)} from placements` : ''}
        </Text>
        {signedIn && local && <RankMark spec={rankMarkFor(local.place, 'Week')} />}
      </View>

      <Pressable
        onPress={() => router.push({ pathname: '/fury-breakdown', params: { week } })}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.linkRow,
          { backgroundColor: background.cardColor, borderColor: background.borderColor },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={styles.linkInfo}>
          <Text style={[styles.linkLabel, { color: background.textColor }]}>Score breakdown</Text>
          <Text style={[styles.linkDescription, { color: background.secondaryText }]}>
            How Fury points work and your week, day by day
          </Text>
        </View>
        <ChevronRight size={20} color={background.secondaryText} />
      </Pressable>

      <Segmented options={WEEK_OPTIONS} value={week} onChange={setWeek} style={styles.seg} />
      {list}

    </View>
  );
};

/** One row of the weekly board, on Your Fury and the home card. */
export const WeeklyRowView: React.FC<{ row: BoardRow; monday: string; first?: boolean }> = ({ row, monday, first }) => {
  const { background } = useTheme();
  const ctx = unpackWeeklyContext(row.context);
  // Squares and medals only mean something for the week they were packed for.
  const valid = ctx.weekId === weekIdFor(monday);
  const days = valid ? ctx.dailiesDone : [0, 0, 0, 0, 0, 0, 0];
  const podiums = valid ? ctx.podiums : 0;
  return (
    <View
      style={[
        styles.wkrow,
        !first && { borderTopWidth: 1, borderTopColor: withOpacity(background.borderColor, 0.28) },
        row.isLocal && [styles.you, { backgroundColor: withOpacity(background.accentColor, 0.1) }],
      ]}
    >
      <PlaceMarker place={row.place} />
      <View style={styles.wkName}>
        <View style={styles.who}>
          <Text
            style={[styles.name, { color: row.isLocal ? background.accentColor : background.textColor }]}
            numberOfLines={1}
          >
            {row.isLocal ? 'You' : row.displayName}
          </Text>
          {podiums > 0 && (
            <View style={styles.med} accessibilityLabel={`${podiums} top three finishes`}>
              <View style={[styles.medDot, { backgroundColor: MEDAL_COLORS[1] }]} />
              <Text style={[styles.medText, { color: background.secondaryText }]}>{podiums}</Text>
            </View>
          )}
        </View>
        <View style={styles.dots}>
          {days.map((n, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    n >= 7
                      ? FLAME
                      : n >= 4
                        ? withOpacity(FLAME, 0.65)
                        : n >= 1
                          ? withOpacity(FLAME, 0.35)
                          : withOpacity(background.borderColor, 0.18),
                },
              ]}
            />
          ))}
        </View>
      </View>
      <Text style={[styles.wkScore, { color: background.textColor }]}>{fmt(row.value)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  title: { textAlign: 'center', fontSize: 24, fontWeight: '900' },
  subtitle: { textAlign: 'center', fontSize: 14, fontWeight: '600', marginTop: 6 },
  card: { borderRadius: 18, borderWidth: 1 },
  hero: { marginTop: 16, padding: 16, alignItems: 'center' },
  heroLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 2.2, textTransform: 'uppercase', textAlign: 'center' },
  heroValue: { fontWeight: '900', letterSpacing: -1, marginTop: 4 },
  heroNote: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  // Same as the Settings link rows.
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  linkInfo: { flex: 1, marginRight: 15 },
  linkLabel: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  linkDescription: { fontSize: 13 },
  seg: { marginTop: 12 },
  list: { marginTop: 10, paddingVertical: 4, paddingHorizontal: 16 },
  count: { textAlign: 'center', fontSize: 12, fontWeight: '700', marginTop: 10 },
  note: { textAlign: 'center', fontSize: 13, fontWeight: '600', marginTop: 16 },

  wkrow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  you: { borderRadius: 12, borderTopWidth: 0, paddingHorizontal: 8, marginHorizontal: -8, marginTop: 2 },
  wkName: { flex: 1, minWidth: 0 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 14, fontWeight: '700' },
  med: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  medDot: { width: 9, height: 9, borderRadius: 5 },
  medText: { fontSize: 11, fontWeight: '800' },
  dots: { flexDirection: 'row', gap: 3, marginTop: 5 },
  dot: { width: 9, height: 9, borderRadius: 3 },
  wkScore: { fontSize: 15, fontWeight: '900' },
});
