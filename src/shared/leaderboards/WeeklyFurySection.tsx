// src/shared/leaderboards/WeeklyFurySection.tsx
//
// The weekly Fury board on Your Fury: a hero card with the week's Fury
// points and the player's weekly place, This week / Last week, the board
// itself (each row shows seven Monday-to-Sunday squares and a medal count
// read from the entry's context), and below it the player's own breakdown.
//
// Signed-out players keep their finishing points from the local ledger:
// they see the hero and the breakdown, with no bonus, no rank and no board.

import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { withOpacity } from '../ResultsScreen';
import { useTheme } from '../ThemeContext';
import { GAME_IDS, WEEKLY_BOARD_ID } from './boards';
import { GapRow, MessageRow } from './BoardRows';
import { addDaysISO, localDateISO, weekIdFor, weekMondayISO } from './dates';
import type { BoardRow } from './entries';
import { FINISH_REAL, MAX_WEEKLY_FURY, PERCENT_TIERS, PODIUM_BONUS, PODIUM_MIN_PLAYERS } from './furyPoints';
import { useGameCenterState } from './gameCenter';
import { loadWeek, refreshFury, unpackWeeklyContext, type WeekBreakdown } from './ledger';
import { Segmented } from './Segmented';
import { promptGameCenterSignIn, SIGN_IN_PROMPT } from './TodayLeaderboardCard';
import { MEDAL_COLORS, PlaceMarker, RankMark, rankMarkFor } from './ui';
import { useLeaderboard } from './useLeaderboard';

type Week = 'this' | 'last';
const WEEK_OPTIONS = [
  { value: 'this', label: 'This week' },
  { value: 'last', label: 'Last week' },
] as const;

const FLAME = '#e85d04';
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
          {rows.length === 0 && !local && <MessageRow text="No Fury points posted yet this week" first />}
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
          style={[styles.heroValue, { color: background.textColor }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {fmt(breakdown?.total ?? 0)}
        </Text>
        <Text style={[styles.heroNote, { color: background.secondaryText }]}>
          {dailies} {dailies === 1 ? 'daily' : 'dailies'}
          {signedIn ? ` · ${fmt(breakdown?.bonusTotal ?? 0)} from placements` : ''}
        </Text>
        {signedIn && local && <RankMark spec={rankMarkFor(local.place, 'Week')} />}
      </View>

      <Segmented options={WEEK_OPTIONS} value={week} onChange={setWeek} style={styles.seg} />
      {list}

      {breakdown && <WeekBreakdownCard breakdown={breakdown} todayISO={today} showBonus={signedIn} />}
      <TierCard />
      <Text style={[styles.rule, { color: background.secondaryText }]}>
        Each day's bonus lands the next morning, once that day's boards close. Medal places need at least{' '}
        {PODIUM_MIN_PLAYERS} players on the board.
      </Text>
    </View>
  );
};

/** One row of the weekly board. */
const WeeklyRowView: React.FC<{ row: BoardRow; monday: string; first?: boolean }> = ({ row, monday, first }) => {
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

/** Per day: dailies, finishing points and the placement bonus, then the week's sum. */
const WeekBreakdownCard: React.FC<{ breakdown: WeekBreakdown; todayISO: string; showBonus: boolean }> = ({
  breakdown,
  todayISO,
  showBonus,
}) => {
  const { background } = useTheme();
  const lines = useMemo(() => {
    const out: { key: string; day: string; text: React.ReactNode; total: number }[] = [];
    const accent = { color: background.accentColor, fontWeight: '800' as const };
    const wait = { fontStyle: 'italic' as const, fontWeight: '600' as const };

    // The previous Sunday's bonus is credited to this week.
    const prevSunday = addDaysISO(breakdown.mondayISO, -1);
    const prevBonus = sumBonus(breakdown, prevSunday);
    if (showBonus && prevBonus > 0) {
      out.push({ key: 'prev', day: 'Sun', text: 'Placement from last Sunday', total: prevBonus });
    }

    breakdown.days.forEach((d, i) => {
      if (d.dateISO > todayISO) return;
      const games = GAME_IDS.map((g) => d.games[g]).filter((c): c is NonNullable<typeof c> => !!c);
      if (games.length === 0) return;
      const finish = games.reduce((s, c) => s + c.finish, 0);
      // Sunday's own bonus lands in next week.
      const isSunday = i === 6;
      const bonus = isSunday ? 0 : games.reduce((s, c) => s + (c.bonus !== null && !c.dropped ? c.bonus : 0), 0);
      const unsettled = !isSunday && games.some((c) => c.bonus === null);
      const bonusPart = !showBonus ? null : isSunday ? (
        <Text style={wait}>bonus lands next week</Text>
      ) : unsettled ? (
        <Text style={wait}>{d.dateISO === todayISO ? 'settles tomorrow' : 'settling'}</Text>
      ) : (
        <Text style={accent}>{fmt(bonus)}</Text>
      );
      out.push({
        key: d.dateISO,
        day: DAY_NAMES[i],
        text: (
          <>
            {games.length} {games.length === 1 ? 'daily' : 'dailies'} · {fmt(finish)}
            {bonusPart && <> + {bonusPart}</>}
          </>
        ),
        total: finish + (showBonus ? bonus : 0),
      });
    });
    return out;
  }, [breakdown, todayISO, showBonus, background.accentColor]);

  return (
    <View style={styles.breakdownWrap}>
      <Text style={[styles.title, styles.breakdownTitle, { color: background.textColor }]}>Your Week</Text>
      <Text style={[styles.subtitle, { color: background.secondaryText }]}>
        {FINISH_REAL} for each daily you finish, plus a bonus for where you place.
      </Text>
      <View style={[styles.card, styles.bd, cardColors(background)]}>
        {lines.length === 0 && <MessageRow text="Finish a daily to start this week's Fury" first />}
        {lines.map((l, i) => (
          <View
            key={l.key}
            style={[styles.bdrow, i > 0 && { borderTopWidth: 1, borderTopColor: withOpacity(background.borderColor, 0.28) }]}
          >
            <Text style={[styles.bdDay, { color: background.textColor }]}>{l.day}</Text>
            <Text style={[styles.bdText, { color: background.secondaryText }]}>{l.text}</Text>
            <Text style={[styles.bdTotal, { color: background.textColor }]}>{fmt(l.total)}</Text>
          </View>
        ))}
        <View style={[styles.bdrow, { borderTopWidth: 2, borderTopColor: withOpacity(background.borderColor, 0.45) }]}>
          <Text style={[styles.bdDay, { color: background.textColor }]}>Week</Text>
          <Text style={[styles.bdText, { color: background.secondaryText }]}>
            {fmt(breakdown.finishTotal)} finishing
            {showBonus && (
              <>
                {' + '}
                <Text style={{ color: background.accentColor, fontWeight: '800' }}>{fmt(breakdown.bonusTotal)}</Text>
                {' placement'}
              </>
            )}
          </Text>
          <Text style={[styles.bdTotal, styles.bdSum, { color: background.textColor }]}>
            {fmt(showBonus ? breakdown.total : breakdown.finishTotal)}
          </Text>
        </View>
      </View>
    </View>
  );
};

function sumBonus(breakdown: WeekBreakdown, dateISO: string): number {
  // The previous Sunday isn't one of the week's seven days, so its bonus is
  // what's left of the bonus total after this week's Monday to Saturday.
  if (dateISO !== addDaysISO(breakdown.mondayISO, -1)) return 0;
  let inWeek = 0;
  breakdown.days.slice(0, 6).forEach((d) => {
    for (const g of GAME_IDS) {
      const c = d.games[g];
      if (c && c.bonus !== null && !c.dropped) inWeek += c.bonus;
    }
  });
  return Math.max(0, breakdown.bonusTotal - inWeek);
}

/** The placement bonus table, straight from furyPoints.ts. */
const TierCard: React.FC = () => {
  const { background } = useTheme();
  const chips: { label: string; medal?: 1 | 2 | 3 }[] = [
    { label: `1st +${PODIUM_BONUS[0]}`, medal: 1 },
    { label: `2nd +${PODIUM_BONUS[1]}`, medal: 2 },
    { label: `3rd +${PODIUM_BONUS[2]}`, medal: 3 },
    ...PERCENT_TIERS.map((t) => ({ label: `Top ${Math.round(t.pct * 100)}% +${t.bonus}` })),
  ];
  return (
    <View style={[styles.card, styles.tierCard, cardColors(background)]}>
      <Text style={[styles.heroLabel, { color: background.secondaryText }]}>Placement bonus, per game per day</Text>
      <View style={styles.tiers}>
        {chips.map((c) => (
          <View
            key={c.label}
            style={[
              styles.tier,
              c.medal
                ? { backgroundColor: MEDAL_COLORS[c.medal], borderColor: MEDAL_COLORS[c.medal] }
                : { backgroundColor: background.cardColor, borderColor: withOpacity(background.borderColor, 0.45) },
            ]}
          >
            <Text style={[styles.tierText, { color: c.medal ? '#ffffff' : background.textColor }]}>{c.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

function cardColors(background: { cardColor: string; borderColor: string }) {
  return { backgroundColor: background.cardColor, borderColor: withOpacity(background.borderColor, 0.45) };
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  title: { textAlign: 'center', fontSize: 24, fontWeight: '900' },
  subtitle: { textAlign: 'center', fontSize: 14, fontWeight: '600', marginTop: 6 },
  card: { borderRadius: 18, borderWidth: 1 },
  hero: { marginTop: 16, padding: 16, alignItems: 'center' },
  heroLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 2.2, textTransform: 'uppercase', textAlign: 'center' },
  heroValue: { fontSize: 54, fontWeight: '900', letterSpacing: -1, lineHeight: 55, marginTop: 4 },
  heroNote: { fontSize: 12, fontWeight: '600', marginTop: 3 },
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

  breakdownWrap: { marginTop: 28 },
  breakdownTitle: { fontSize: 22 },
  bd: { marginTop: 14, paddingVertical: 4, paddingHorizontal: 14 },
  bdrow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
  bdDay: { width: 46, fontSize: 13, fontWeight: '900' },
  bdText: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '700' },
  bdTotal: { fontSize: 13, fontWeight: '900', textAlign: 'right' },
  bdSum: { fontSize: 16 },

  tierCard: { marginTop: 14, padding: 14 },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tier: { borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9 },
  tierText: { fontSize: 11, fontWeight: '800' },
  rule: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 12, lineHeight: 17 },
});
