// src/shared/leaderboards/WeeklyFuryHomeCard.tsx
//
// "Weekly Fury" card at the bottom of the home screen, in the same style as
// the game menus' Today's Leaderboard card: this week's top three, a dotted
// gap and the player's own row. "See all" opens Your Fury.

import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../ThemeContext';
import { withOpacity } from '../ResultsScreen';
import { WEEKLY_BOARD_ID } from './boards';
import { GapRow, MessageRow } from './BoardRows';
import { localDateISO, weekMondayISO } from './dates';
import { flushPending } from './submit';
import { promptGameCenterSignIn, SIGN_IN_PROMPT } from './TodayLeaderboardCard';
import { useLeaderboard } from './useLeaderboard';
import { WEEKLY_NOT_OPEN, WEEKLY_NOT_OPEN_DETAIL, WeeklyRowView } from './WeeklyFurySection';

export const WeeklyFuryHomeCard: React.FC<{ style?: StyleProp<ViewStyle> }> = ({ style }) => {
  const { background } = useTheme();
  const { status, board, reload } = useLeaderboard(WEEKLY_BOARD_ID, { weeksBack: 0, count: 3 });
  const monday = weekMondayISO(localDateISO());

  // Coming back to the home screen retries queued scores and re-reads the
  // board, the same way the game menu cards do.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      const first = !focusedOnce.current;
      focusedOnce.current = true;
      flushPending().finally(() => {
        // The hook loads on mount already; reload on every later return.
        if (!first) reload();
      });
    }, [reload]),
  );

  if (status === 'unavailable') return null;

  const openFury = () => router.push('/fury');

  let body: React.ReactNode;
  if (status === 'signedOut') {
    body = (
      <Pressable onPress={promptGameCenterSignIn} accessibilityRole="button">
        <MessageRow text={SIGN_IN_PROMPT} first highlight />
      </Pressable>
    );
  } else if (status === 'loading') {
    body = <MessageRow text="Loading..." first />;
  } else if (status === 'error') {
    body = (
      <Pressable onPress={reload} accessibilityRole="button">
        <MessageRow text="Couldn't load the weekly board. Tap to try again." first />
      </Pressable>
    );
  } else if (status === 'notOpen') {
    body = <MessageRow text={WEEKLY_NOT_OPEN} detail={WEEKLY_NOT_OPEN_DETAIL} first />;
  } else {
    const top = (board?.rows ?? []).slice(0, 3);
    const local = board?.local ?? null;
    const localInTop = !!local && top.some((r) => r.playerId === local.playerId);
    body = (
      <>
        {top.length === 0 && <MessageRow text="No Fury points posted yet this week" first />}
        {top.map((row, i) => (
          <WeeklyRowView key={row.playerId} row={row} monday={monday} first={i === 0} />
        ))}
        {!localInTop && (
          <>
            {top.length > 0 && <GapRow />}
            {local ? (
              <WeeklyRowView row={local} monday={monday} first />
            ) : (
              <MessageRow text="Finish a daily to place" first highlight />
            )}
          </>
        )}
      </>
    );
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: background.cardColor, borderColor: withOpacity(background.borderColor, 0.45) },
        style,
      ]}
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: background.textColor }]}>Weekly Fury</Text>
        <Pressable onPress={openFury} hitSlop={12} accessibilityRole="button">
          <Text style={[styles.more, { color: background.accentColor }]}>See all ›</Text>
        </Pressable>
      </View>
      <View style={styles.rows}>{body}</View>
    </View>
  );
};

// Same as TodayLeaderboardCard.
const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 24,
    alignSelf: 'stretch',
  },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 17, fontWeight: '900', flexShrink: 1 },
  more: { fontSize: 12, fontWeight: '800' },
  rows: { marginTop: 8 },
});
