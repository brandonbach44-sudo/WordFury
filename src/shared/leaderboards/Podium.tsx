// src/shared/leaderboards/Podium.tsx
// The top three, 2nd / 1st / 3rd, on gold, silver and bronze blocks.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import { withOpacity } from '../ResultsScreen';
import { boardFor, type GameId } from './boards';
import { splitResult } from './BoardRows';
import type { BoardRow } from './entries';
import { MEDAL_COLORS } from './ui';

const BLOCK_HEIGHT: Record<1 | 2 | 3, number> = { 1: 84, 2: 62, 3: 46 };

export const Podium: React.FC<{ gameId: GameId; rows: BoardRow[] }> = ({ gameId, rows }) => {
  const { background } = useTheme();
  const top = rows.slice(0, 3);
  if (top.length === 0) return null;
  // Visual order 2nd, 1st, 3rd. Blocks follow list position, so two players
  // tied for 1st still stand on 1st and 2nd blocks but both show "1".
  const order = [top[1], top[0], top[2]];
  const slots: (1 | 2 | 3)[] = [2, 1, 3];

  return (
    <View>
      <View style={styles.podium}>
        {order.map((row, i) => {
          const slot = slots[i];
          if (!row) return <View key={`empty-${slot}`} style={styles.pod} />;
          const { main, sub } = splitResult(boardFor(gameId).formatForDisplay(row.value));
          return (
            <View key={row.playerId} style={styles.pod}>
              <Text
                style={[styles.who, { color: row.isLocal ? background.accentColor : background.textColor }]}
                numberOfLines={1}
              >
                {row.isLocal ? 'You' : row.displayName}
              </Text>
              <Text style={[styles.ps, { color: background.secondaryText }]} numberOfLines={2}>
                {sub ? `${main}\n${sub}` : main}
              </Text>
              <View
                style={[
                  styles.block,
                  { height: BLOCK_HEIGHT[slot], backgroundColor: MEDAL_COLORS[slot] },
                  row.isLocal && { borderWidth: 3, borderBottomWidth: 0, borderColor: withOpacity(background.accentColor, 0.55) },
                ]}
              >
                <Text style={styles.blockText}>{row.place}</Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={[styles.base, { backgroundColor: withOpacity(background.borderColor, 0.45) }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 10, marginTop: 18 },
  pod: { width: 104, alignItems: 'center' },
  who: { fontSize: 12, fontWeight: '800', maxWidth: 104 },
  ps: { fontSize: 12, fontWeight: '700', marginTop: 1, lineHeight: 16, textAlign: 'center' },
  block: {
    alignSelf: 'stretch',
    marginTop: 6,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    alignItems: 'center',
    paddingTop: 8,
  },
  blockText: { color: '#ffffff', fontSize: 22, fontWeight: '900' },
  base: { height: 2, marginHorizontal: 6 },
});
