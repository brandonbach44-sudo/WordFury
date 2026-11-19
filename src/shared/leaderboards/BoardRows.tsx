// src/shared/leaderboards/BoardRows.tsx
//
// List rows shared by the menu card and the full board: place marker, name,
// and the result in the game's own terms. The local player's row is tinted
// and reads "You".

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import { withOpacity } from '../ResultsScreen';
import { boardFor, type GameId } from './boards';
import type { BoardRow } from './entries';
import { PlaceMarker } from './ui';

/** "3 guesses · 1:12" becomes a bold lead ("3 guesses") and a quiet tail ("1:12"). */
export function splitResult(text: string): { main: string; sub: string | null } {
  const parts = text.split(' · ');
  return { main: parts[0], sub: parts.length > 1 ? parts.slice(1).join(' · ') : null };
}

export const BoardRowView: React.FC<{
  gameId: GameId;
  row: BoardRow;
  first?: boolean;
}> = ({ gameId, row, first }) => {
  const { background } = useTheme();
  const { main, sub } = splitResult(boardFor(gameId).formatForDisplay(row.value));
  return (
    <View
      style={[
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: withOpacity(background.borderColor, 0.28) },
        row.isLocal && [styles.you, { backgroundColor: withOpacity(background.accentColor, 0.1) }],
      ]}
    >
      <PlaceMarker place={row.place} />
      <Text
        style={[styles.name, { color: row.isLocal ? background.accentColor : background.textColor }]}
        numberOfLines={1}
      >
        {row.isLocal ? 'You' : row.displayName}
      </Text>
      <View style={styles.result}>
        <Text style={[styles.main, { color: background.textColor }]} numberOfLines={1}>
          {main}
        </Text>
        {!!sub && (
          <Text style={[styles.sub, { color: background.secondaryText }]} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
    </View>
  );
};

/** A plain message row in the same rhythm as the list rows. */
export const MessageRow: React.FC<{ text: string; first?: boolean; highlight?: boolean }> = ({
  text,
  first,
  highlight,
}) => {
  const { background } = useTheme();
  return (
    <View
      style={[
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: withOpacity(background.borderColor, 0.28) },
        highlight && [styles.you, { backgroundColor: withOpacity(background.accentColor, 0.1) }],
      ]}
    >
      <Text
        style={[styles.message, { color: highlight ? background.accentColor : background.secondaryText }]}
        numberOfLines={2}
      >
        {text}
      </Text>
    </View>
  );
};

/** The dotted break between the top rows and the player's own row. */
export const GapRow: React.FC = () => {
  const { background } = useTheme();
  return <Text style={[styles.gap, { color: background.secondaryText }]}>···</Text>;
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 41,
    paddingVertical: 7,
  },
  you: {
    borderRadius: 12,
    borderTopWidth: 0,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    marginTop: 2,
  },
  name: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '700' },
  result: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexShrink: 0 },
  main: { fontSize: 14, fontWeight: '900' },
  sub: { fontSize: 12, fontWeight: '700', minWidth: 30, textAlign: 'right' },
  message: { flex: 1, fontSize: 13, fontWeight: '700' },
  gap: { textAlign: 'center', fontWeight: '900', letterSpacing: 3, fontSize: 12, paddingVertical: 2 },
});
