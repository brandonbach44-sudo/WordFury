// app/leaderboard/[game].tsx
//
// One game's full daily board, shared by all eight games. Today or
// Yesterday; a podium for the top three, then the list (first 25), the
// player's own row pinned at the bottom when they're further down, and the
// day's player count.

import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { withOpacity } from '../../src/shared/ResultsScreen';
import { useTheme } from '../../src/shared/ThemeContext';
import { BoardRowView, GapRow, MessageRow } from '../../src/shared/leaderboards/BoardRows';
import { BOARDS, isGameId, type GameId } from '../../src/shared/leaderboards/boards';
import { FRIENDS_DENIED_HELP, useFriendsAccess } from '../../src/shared/leaderboards/friends';
import { enableGameCenter } from '../../src/shared/leaderboards/gameCenter';
import { Podium } from '../../src/shared/leaderboards/Podium';
import { Segmented } from '../../src/shared/leaderboards/Segmented';
import { promptGameCenterSignIn, SIGN_IN_PROMPT } from '../../src/shared/leaderboards/TodayLeaderboardCard';
import { useLeaderboard } from '../../src/shared/leaderboards/useLeaderboard';

type Day = 'today' | 'yesterday';
type Scope = 'global' | 'friends';

const DAY_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
] as const;

const SCOPE_OPTIONS = [
  { value: 'global', label: 'Everyone' },
  { value: 'friends', label: 'Friends' },
] as const;

export default function GameLeaderboardScreen() {
  const params = useLocalSearchParams<{ game: string }>();
  const gameId: GameId = isGameId(params.game) ? params.game : 'furdle';
  const { background } = useTheme();
  const [day, setDay] = useState<Day>('today');
  const [scope, setScope] = useState<Scope>('global');

  // Opening a leaderboard counts as opting in to Game Center.
  useEffect(() => {
    enableGameCenter();
  }, []);

  // Friends access is asked for the first time the Friends tab opens.
  const { access } = useFriendsAccess(scope === 'friends');
  const friendsBlocked = scope === 'friends' && access !== 'authorized';

  const { status, board, reload } = useLeaderboard(BOARDS[gameId].boardId, {
    scope,
    daysBack: day === 'today' ? 0 : 1,
    count: 25,
    enabled: !friendsBlocked,
  });

  const rows = board?.rows ?? [];
  const local = board?.local ?? null;
  const listRows = rows.slice(3);
  const localShown = !!local && rows.some((r) => r.playerId === local.playerId);
  const count = board?.totalPlayerCount ?? null;

  let content: React.ReactNode;
  if (friendsBlocked && access === 'checking') {
    content = <ActivityIndicator style={styles.spinner} color={background.accentColor} />;
  } else if (friendsBlocked && (access === 'denied' || access === 'restricted')) {
    content = (
      <View style={styles.friendsHelp}>
        <Text style={[styles.note, styles.noteTight, { color: background.secondaryText }]}>
          {access === 'restricted'
            ? 'Game Center friends are turned off for this account.'
            : FRIENDS_DENIED_HELP}
        </Text>
        {access === 'denied' && (
          <Pressable
            onPress={() => Linking.openSettings()}
            style={({ pressed }) => [
              styles.settingsButton,
              { borderColor: background.borderColor, backgroundColor: background.cardColor, opacity: pressed ? 0.75 : 1 },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.settingsText, { color: background.textColor }]}>Open Settings</Text>
          </Pressable>
        )}
      </View>
    );
  } else if (friendsBlocked) {
    // Signed out or no Game Center: the same sign-in prompt as Everyone.
    content = (
      <Pressable onPress={promptGameCenterSignIn} accessibilityRole="button">
        <View style={[styles.card, styles.list, styles.signIn, cardColors(background)]}>
          <MessageRow text={SIGN_IN_PROMPT} first highlight />
        </View>
      </Pressable>
    );
  } else if (status === 'loading') {
    content = <ActivityIndicator style={styles.spinner} color={background.accentColor} />;
  } else if (status === 'signedOut') {
    content = (
      <Pressable onPress={promptGameCenterSignIn} accessibilityRole="button">
        <View style={[styles.card, styles.list, styles.signIn, cardColors(background)]}>
          <MessageRow text={SIGN_IN_PROMPT} first highlight />
        </View>
      </Pressable>
    );
  } else if (status === 'unavailable') {
    content = <Text style={[styles.note, { color: background.secondaryText }]}>Leaderboards need Game Center on iPhone.</Text>;
  } else if (status === 'error') {
    content = (
      <Pressable onPress={reload} accessibilityRole="button">
        <Text style={[styles.note, { color: background.secondaryText }]}>Couldn't load the board. Tap to try again.</Text>
      </Pressable>
    );
  } else if (status === 'notOpen') {
    content = (
      <Text style={[styles.note, { color: background.secondaryText }]}>
        Today's board opens soon. Scores from today post as soon as it does.
      </Text>
    );
  } else if (status === 'empty') {
    content = (
      <Text style={[styles.note, { color: background.secondaryText }]}>
        {scope === 'friends'
          ? day === 'today'
            ? 'None of your Game Center friends have played today.'
            : 'None of your Game Center friends played yesterday.'
          : day === 'today'
            ? 'No scores yet today.'
            : 'Nobody posted a score yesterday.'}
      </Text>
    );
  } else {
    content = (
      <>
        <Podium gameId={gameId} rows={rows} />
        {(listRows.length > 0 || (local && !localShown)) && (
          <View style={[styles.card, styles.list, cardColors(background)]}>
            {listRows.map((row, i) => (
              <BoardRowView key={row.playerId} gameId={gameId} row={row} first={i === 0} />
            ))}
            {local && !localShown && (
              <>
                {listRows.length > 0 && <GapRow />}
                <BoardRowView gameId={gameId} row={local} first />
              </>
            )}
          </View>
        )}
        {count !== null && (
          <Text style={[styles.count, { color: background.secondaryText }]}>
            {count.toLocaleString('en-US')}{' '}
            {scope === 'friends' ? (count === 1 ? 'friend' : 'friends') : count === 1 ? 'player' : 'players'}{' '}
            {day === 'today' ? 'today' : 'yesterday'}
          </Text>
        )}
      </>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: background.backgroundColor }]}>
      <SafeAreaView style={styles.root} edges={['top']}>
        <StatusBar barStyle={background.statusBar === 'dark' ? 'dark-content' : 'light-content'} />
        <View style={[styles.header, { borderBottomColor: withOpacity(background.borderColor, 0.28) }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={16}
            style={styles.headerSide}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ChevronLeft size={22} color={background.secondaryText} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: background.secondaryText }]}>LEADERBOARD</Text>
          <View style={styles.headerSide} />
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: background.textColor }]}>{BOARDS[gameId].title}</Text>
          <Segmented options={DAY_OPTIONS} value={day} onChange={setDay} style={styles.seg} />
          <Segmented options={SCOPE_OPTIONS} value={scope} onChange={setScope} style={styles.seg2} />
          {content}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function cardColors(background: { cardColor: string; borderColor: string }) {
  return { backgroundColor: background.cardColor, borderColor: withOpacity(background.borderColor, 0.45) };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerSide: { width: 22 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  body: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 40 },
  title: { textAlign: 'center', fontSize: 22, fontWeight: '900' },
  seg: { marginTop: 12 },
  seg2: { marginTop: 8 },
  friendsHelp: { alignItems: 'center' },
  noteTight: { marginBottom: 14 },
  settingsButton: { borderWidth: 2, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 22 },
  settingsText: { fontSize: 14, fontWeight: '800' },
  card: { borderRadius: 18, borderWidth: 1 },
  list: { marginTop: 12, paddingVertical: 4, paddingHorizontal: 16 },
  signIn: { marginTop: 24 },
  count: { textAlign: 'center', fontSize: 12, fontWeight: '700', marginTop: 10 },
  note: { textAlign: 'center', fontSize: 14, fontWeight: '600', marginTop: 32, lineHeight: 20 },
  spinner: { marginTop: 40 },
});
