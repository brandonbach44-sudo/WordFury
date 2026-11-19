// src/shared/leaderboards/ui.tsx
//
// Small pieces every leaderboard surface shares: the rank mark that sits in
// a hero card's corner, the place marker at the start of each list row, and
// the self-fetching daily rank mark for results screens.
//
// Theme tokens throughout; the three medal fills are the only hardcoded
// colours, per the plan.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import { withOpacity } from '../ResultsScreen';
import { boardFor, type GameId } from './boards';
import { localDateISO } from './dates';
import { useGameCenterState } from './gameCenter';
import { settleBonuses } from './ledger';
import { loadDailyStanding } from './standing';

export const MEDAL_COLORS: Record<1 | 2 | 3, string> = {
  1: '#d4a017',
  2: '#9aa3ad',
  3: '#b5703f',
};

export function medalColor(place: number): string | null {
  return place === 1 || place === 2 || place === 3 ? MEDAL_COLORS[place] : null;
}

export type RankMarkSpec =
  | { kind: 'medal'; place: 1 | 2 | 3 }
  | { kind: 'plaque'; place: number; label: string }
  | { kind: 'held'; label: string };

/** 1st to 3rd get a medal, everyone else a plaque with a small label. */
export function rankMarkFor(place: number, label: string): RankMarkSpec {
  return place >= 1 && place <= 3 ? { kind: 'medal', place: place as 1 | 2 | 3 } : { kind: 'plaque', place, label };
}

/**
 * 52 by 52 pt, absolutely positioned in the top-right corner of the card it
 * sits in, so it adds no height. Number only: never "st", "nd" or "rd", and
 * never a sentence.
 */
export const RankMark: React.FC<{ spec: RankMarkSpec }> = ({ spec }) => {
  const { background } = useTheme();
  if (spec.kind === 'medal') {
    return (
      <View
        style={[styles.mark, styles.medal, { backgroundColor: MEDAL_COLORS[spec.place] }]}
        accessibilityLabel={`Place ${spec.place}`}
      >
        <Text style={styles.medalText}>{spec.place}</Text>
      </View>
    );
  }
  if (spec.kind === 'held') {
    return (
      <View
        style={[styles.mark, styles.plaque, styles.held, { borderColor: withOpacity(background.borderColor, 0.45) }]}
        accessibilityLabel="Score waiting to post"
      >
        <Text style={[styles.heldText, { color: background.secondaryText }]}>-</Text>
        <Text style={[styles.label, { color: background.secondaryText }]}>{spec.label}</Text>
      </View>
    );
  }
  return (
    <View
      style={[styles.mark, styles.plaque, { borderColor: background.textColor }]}
      accessibilityLabel={`Place ${spec.place}`}
    >
      <Text
        style={[styles.plaqueText, { color: background.textColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {spec.place.toLocaleString('en-US')}
      </Text>
      <Text style={[styles.label, { color: background.secondaryText }]}>{spec.label}</Text>
    </View>
  );
};

/** The place marker at the start of a list row. */
export const PlaceMarker: React.FC<{ place: number }> = ({ place }) => {
  const { background } = useTheme();
  const medal = medalColor(place);
  if (medal) {
    return (
      <View style={[styles.pos, styles.posMedal, { backgroundColor: medal }]}>
        <Text style={styles.posMedalText}>{place}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.pos, { borderColor: withOpacity(background.borderColor, 0.45), borderWidth: 1.5 }]}>
      <Text
        style={[styles.posText, { color: background.textColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {place}
      </Text>
    </View>
  );
};

/**
 * The rank mark for a game's daily, fetched fresh every time `visible`
 * turns on. Renders nothing when signed out, when the daily was lost or
 * given up, or when there's no score on the board.
 */
export const DailyRankMark: React.FC<{ gameId: GameId; dateISO?: string; visible: boolean }> = ({
  gameId,
  dateISO,
  visible,
}) => {
  const gc = useGameCenterState();
  const [spec, setSpec] = useState<RankMarkSpec | null>(null);
  const date = dateISO ?? localDateISO();

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setSpec(null);
    (async () => {
      try {
        const standing = await loadDailyStanding(gameId, date);
        if (cancelled) return;
        const board = boardFor(gameId);
        if (standing.kind === 'pending') {
          setSpec(board.isLoss(standing.value) ? null : { kind: 'held', label: 'Today' });
        } else if (standing.kind === 'posted') {
          setSpec(board.isLoss(standing.row.value) ? null : rankMarkFor(standing.row.place, 'Today'));
        } else {
          setSpec(null);
        }
      } catch {
        if (!cancelled) setSpec(null);
      }
      // Opening a results screen is also when settled bonuses are collected.
      settleBonuses().catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, gameId, date, gc.status]);

  return spec ? <RankMark spec={spec} /> : null;
};

const styles = StyleSheet.create({
  mark: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medal: {
    borderRadius: 26,
    // Inner ring in white at 45%, as in the mockup.
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  medalText: { color: '#ffffff', fontSize: 24, fontWeight: '900' },
  plaque: { borderWidth: 2, borderRadius: 14, paddingHorizontal: 3 },
  held: { borderStyle: 'dashed' },
  plaqueText: { fontSize: 20, fontWeight: '900', lineHeight: 22 },
  heldText: { fontSize: 22, fontWeight: '900', lineHeight: 24 },
  label: { fontSize: 8, fontWeight: '800', letterSpacing: 1, marginTop: 2, textTransform: 'uppercase' },

  pos: { width: 30, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  posMedal: { width: 26, borderRadius: 13, marginHorizontal: 2 },
  posMedalText: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
  posText: { fontSize: 13, fontWeight: '900' },
});
