// src/shared/leaderboards/TodayLeaderboardCard.tsx
//
// "Today's Leaderboard" card under the Daily Challenge card on each game's
// Play tab: the top three with medal numbers, a dotted gap, and the
// player's own row highlighted. "See all" opens the full board.

import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../ThemeContext';
import { withOpacity } from '../ResultsScreen';
import { BOARDS, type GameId } from './boards';
import { BoardRowView, GapRow, MessageRow } from './BoardRows';
import { requestGameCenterSignIn, SIGN_IN_SETTINGS_HINT } from './gameCenter';
import { flushPending } from './submit';
import { useLeaderboard } from './useLeaderboard';

export const SIGN_IN_PROMPT = 'Sign in to Game Center to compete';

/** What a tap on a signed-out leaderboard card does. */
export async function promptGameCenterSignIn(): Promise<void> {
  const outcome = await requestGameCenterSignIn();
  if (outcome === 'useSettings') {
    Alert.alert('Sign in to Game Center', SIGN_IN_SETTINGS_HINT);
  } else if (outcome === 'restricted') {
    Alert.alert('Game Center is restricted', 'Game Center is turned off for this account, so leaderboards are unavailable.');
  }
}

export const TodayLeaderboardCard: React.FC<{ gameId: GameId; style?: StyleProp<ViewStyle> }> = ({
  gameId,
  style,
}) => {
  const { background } = useTheme();
  const { status, board, reload } = useLeaderboard(BOARDS[gameId].boardId, { count: 3 });

  // A game menu opening is one of the moments queued scores are retried,
  // and the board is re-read whenever the menu comes back into view.
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

  const openBoard = () => router.push({ pathname: '/leaderboard/[game]', params: { game: gameId } });

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
        <MessageRow text="Couldn't load the board. Tap to try again." first />
      </Pressable>
    );
  } else if (status === 'notOpen') {
    body = <MessageRow text="Today's board opens soon" first />;
  } else {
    const top = (board?.rows ?? []).slice(0, 3);
    const local = board?.local ?? null;
    const localInTop = !!local && top.some((r) => r.playerId === local.playerId);
    body = (
      <>
        {top.length === 0 && <MessageRow text="No scores yet today" first />}
        {top.map((row, i) => (
          <BoardRowView key={row.playerId} gameId={gameId} row={row} first={i === 0} />
        ))}
        {!localInTop && (
          <>
            {top.length > 0 && <GapRow />}
            {local ? (
              <BoardRowView gameId={gameId} row={local} first />
            ) : (
              <MessageRow text="Play today's daily to place" first highlight />
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
        <Text style={[styles.title, { color: background.textColor }]}>Today's Leaderboard</Text>
        {status !== 'signedOut' && (
          <Pressable onPress={openBoard} hitSlop={12} accessibilityRole="button">
            <Text style={[styles.more, { color: background.accentColor }]}>See all ›</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.rows}>{body}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 24,
    // Fill the column whatever the parent's alignItems (Hangman centers).
    alignSelf: 'stretch',
  },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 17, fontWeight: '900', flexShrink: 1 },
  more: { fontSize: 12, fontWeight: '800' },
  rows: { marginTop: 8 },
});
