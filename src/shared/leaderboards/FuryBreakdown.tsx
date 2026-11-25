// src/shared/leaderboards/FuryBreakdown.tsx
//
// The pieces of the Score breakdown screen (app/fury-breakdown.tsx): how
// Fury points work, the placement bonus chips and rule, and the week's
// day-by-day breakdown. Moved off Your Fury so the streak and history sit
// higher up there.
//
// Signed-out players see finishing points only: no bonus in the breakdown.

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { withOpacity } from '../ResultsScreen';
import { useTheme } from '../ThemeContext';
import { GAME_IDS } from './boards';
import { MessageRow } from './BoardRows';
import { addDaysISO } from './dates';
import { FINISH_REAL, FINISH_THROWAWAY, PERCENT_TIERS, PODIUM_BONUS, PODIUM_MIN_PLAYERS } from './furyPoints';
import type { WeekBreakdown } from './ledger';
import { MEDAL_COLORS } from './ui';

export type Week = 'this' | 'last';
export const WEEK_OPTIONS = [
  { value: 'this', label: 'This week' },
  { value: 'last', label: 'Last week' },
] as const;

export const fmtFury = (n: number) => Math.round(n).toLocaleString('en-US');
const fmt = fmtFury;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function furyCardColors(background: { cardColor: string; borderColor: string }) {
  return { backgroundColor: background.cardColor, borderColor: withOpacity(background.borderColor, 0.45) };
}
const cardColors = furyCardColors;

/** Three lines on how Fury points are earned, numbers from furyPoints.ts. */
export const HowPointsWork: React.FC = () => {
  const { background } = useTheme();
  const lines = [
    `${FINISH_REAL} for each daily you finish`,
    `${FINISH_THROWAWAY} if you finish without really trying`,
    "Plus a placement bonus for where you place on each game's board",
  ];
  return (
    <View style={[styles.card, styles.howCard, cardColors(background)]}>
      {lines.map((l, i) => (
        <Text
          key={l}
          style={[
            styles.howLine,
            { color: background.textColor },
            i > 0 && { borderTopWidth: 1, borderTopColor: withOpacity(background.borderColor, 0.28) },
          ]}
        >
          {l}
        </Text>
      ))}
    </View>
  );
};

/** When the bonus lands and when medal places count. */
export const BonusRule: React.FC = () => {
  const { background } = useTheme();
  return (
    <Text style={[styles.rule, { color: background.secondaryText }]}>
      Each day's bonus lands the next morning, once that day's boards close. Medal places need at least{' '}
      {PODIUM_MIN_PLAYERS} players on the board.
    </Text>
  );
};

/** Per day: dailies, finishing points and the placement bonus, then the week's sum. */
export const WeekBreakdownCard: React.FC<{
  breakdown: WeekBreakdown;
  todayISO: string;
  showBonus: boolean;
  /** Section title: "Your Week" or "Last Week". */
  title?: string;
  /** Shown under the subtitle, above the card (the week toggle). */
  children?: React.ReactNode;
}> = ({ breakdown, todayISO, showBonus, title = 'Your Week', children }) => {
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
      <Text style={[styles.title, styles.breakdownTitle, { color: background.textColor }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: background.secondaryText }]}>
        {FINISH_REAL} for each daily you finish, plus a bonus for where you place.
      </Text>
      {children}
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

export function sumBonus(breakdown: WeekBreakdown, dateISO: string): number {
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
export const TierCard: React.FC = () => {
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

const styles = StyleSheet.create({
  title: { textAlign: 'center', fontSize: 24, fontWeight: '900' },
  subtitle: { textAlign: 'center', fontSize: 14, fontWeight: '600', marginTop: 6 },
  card: { borderRadius: 18, borderWidth: 1 },
  heroLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 2.2, textTransform: 'uppercase', textAlign: 'center' },

  howCard: { paddingVertical: 4, paddingHorizontal: 14 },
  howLine: { fontSize: 14, fontWeight: '700', paddingVertical: 10 },

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
