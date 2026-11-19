// app/fury.tsx
//
// "Your Fury" — the cross-game history screen.
//
// Leaderboards added the weekly Fury board at the top of this screen (see
// src/shared/leaderboards/WeeklyFurySection.tsx). Unlike the history below,
// that section does write: opening it settles bonuses and posts the week's
// total to Game Center.
//
// ── Why this screen exists ──────────────────────────────────────────────────
// The ritual shipped with real substance (Fury Streak, Perfect Days, Streak
// Skips) and exactly one place to see any of it: a number on the Today card
// that resets its meaning every midnight. Every individual game has a full
// calendar; the cross-game layer had the thinnest surface in the app.
//
// The heat map is the point. A streak counter states a fact; a month of filled
// squares with one hole in it makes an argument, and that argument is what
// makes a Streak Skip feel worth spending.
//
// ── Read-only, and derived ──────────────────────────────────────────────────
// This screen writes nothing. The calendar comes from the eight games' own
// history stores via furyHistory.ts, and the headline numbers come from
// loadRitualDisplay() -- deliberately NOT refreshDailyRitual(), which writes and
// consumes the home screen's one-shot Perfect Day flags.
//
// ── Where it lives ──────────────────────────────────────────────────────────
// A plain stack screen reached by tapping the Today card, so it costs the game
// grid zero height. The games are the point of the app; this is one level down
// from the card that summarises them. No horizontal gestures here either --
// close button and edge-swipe back only.

import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, Flame, ShieldCheck, X } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { ALL_GAME_IDS, GAME_LABELS, type GameId } from '../src/shared/dailyReminders';
import { loadRitualDisplay } from '../src/shared/dailyRitual';
import {
  loadFuryHistory,
  summariseFuryHistory,
  wasRecording,
  type FuryFirstRecorded,
  type FuryHistory,
} from '../src/shared/furyHistory';
import { accentForGame } from '../src/shared/gameColors';
import { useTheme } from '../src/shared/ThemeContext';
import { WeeklyFurySection } from '../src/shared/leaderboards/WeeklyFurySection';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Eight opacity steps of the flame accent, one per daily cleared.
 *
 * A single-hue luminance ramp rather than eight hues: nothing is encoded in
 * colour identity, so this reads correctly under every form of colour vision
 * deficiency without needing a colourblind variant of its own. The per-game
 * dots in the day detail DO carry hue, so those go through accentForGame().
 */
const RAMP = [0.14, 0.26, 0.38, 0.5, 0.62, 0.74, 0.87, 1];
const FLAME = '#F97316';

function rampColor(count: number): string {
  const step = RAMP[Math.min(count, RAMP.length) - 1] ?? RAMP[0];
  return `rgba(249, 115, 22, ${step})`;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export default function FuryHistoryScreen() {
  const { background, colorBlindMode } = useTheme();

  const [history, setHistory] = useState<FuryHistory>({});
  // When each game started keeping a history, so a blank row can say "not
  // recorded" instead of looking like a day the player skipped.
  const [firstRecorded, setFirstRecorded] = useState<FuryFirstRecorded>({});
  const [ritual, setRitual] = useState<{
    streak: number;
    bestStreak: number;
    perfectDays: number;
    skipsAvailable: number;
  } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const now = new Date();
  const todayISO = toISODate(now);
  const [viewMonth, setViewMonth] = useState(
    () => new Date(now.getFullYear(), now.getMonth(), 1),
  );

  // Refresh on focus rather than on a timer, so finishing a daily and coming
  // back here reflects it -- same policy as the Today card.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [h, r] = await Promise.all([loadFuryHistory(), loadRitualDisplay()]);
        if (cancelled) return;
        setHistory(h.history);
        setFirstRecorded(h.firstRecorded);
        setRitual(r);
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // All eight histories load once on focus; paging months filters what is
  // already in memory rather than hitting AsyncStorage eight more times.
  const totals = useMemo(() => summariseFuryHistory(history), [history]);

  const isCurrentMonth =
    viewMonth.getFullYear() === now.getFullYear() && viewMonth.getMonth() === now.getMonth();

  const cells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startWeekday = new Date(year, month, 1).getDay();
    const list: { dateISO: string | null; dayNum: number | null }[] = [];
    for (let i = 0; i < startWeekday; i++) list.push({ dateISO: null, dayNum: null });
    for (let day = 1; day <= daysInMonth; day++) {
      list.push({ dateISO: toISODate(new Date(year, month, day)), dayNum: day });
    }
    return list;
  }, [viewMonth]);

  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const selectedDay = selectedDate ? history[selectedDate] : null;

  const stepMonth = (delta: number) => {
    setSelectedDate(null);
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  return (
    <View style={[styles.root, { backgroundColor: background.backgroundColor }]}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={background.statusBar === 'dark' ? 'dark-content' : 'light-content'} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={[styles.brand, { color: background.secondaryText }]}>YOUR FURY</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => router.back()}
            hitSlop={10}
          >
            <X size={22} color={background.secondaryText} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Weekly Fury board ────────────────────────────────────────────
              This week's Fury points and the weekly leaderboard come first;
              the streak history below is unchanged. */}
          <WeeklyFurySection />

          {/* ── Hero ─────────────────────────────────────────────────────────
              Current streak is the headline because it is the number at stake;
              best sits beside it as the thing to beat. */}
          <View
            style={[
              styles.hero,
              { backgroundColor: background.cardColor, borderColor: background.borderColor },
            ]}
          >
            <View style={styles.heroTop}>
              <Flame size={26} color={FLAME} />
              <View style={styles.heroMain}>
                <Text style={[styles.heroNum, { color: background.textColor }]}>
                  {ritual?.streak ?? 0}
                </Text>
                <Text style={[styles.heroLabel, { color: background.secondaryText }]}>
                  DAY FURY STREAK
                </Text>
              </View>
              <View style={styles.heroBest}>
                <Text style={[styles.heroBestNum, { color: background.textColor }]}>
                  {ritual?.bestStreak ?? 0}
                </Text>
                <Text style={[styles.heroLabel, { color: background.secondaryText }]}>BEST</Text>
              </View>
            </View>

            <View style={styles.kpiRow}>
              <Kpi
                value={String(ritual?.perfectDays ?? 0)}
                label="PERFECT DAYS"
                background={background}
              />
              <Kpi value={String(totals.daysPlayed)} label="DAYS PLAYED" background={background} />
              <Kpi
                value={String(totals.dailiesDone)}
                label="DAILIES DONE"
                background={background}
              />
              <Kpi
                value={String(ritual?.skipsAvailable ?? 0)}
                label="SKIPS"
                background={background}
                icon={<ShieldCheck size={11} color={background.secondaryText} />}
              />
            </View>
          </View>

          {/* ── Heat map ─────────────────────────────────────────────────── */}
          <View
            style={[
              styles.calendar,
              { backgroundColor: background.cardColor, borderColor: background.borderColor },
            ]}
          >
            <View style={styles.calHeader}>
              <TouchableOpacity onPress={() => stepMonth(-1)} style={styles.navButton} hitSlop={8}>
                <ChevronLeft size={20} color={background.textColor} />
              </TouchableOpacity>
              <Text style={[styles.monthLabel, { color: background.textColor }]}>{monthLabel}</Text>
              <TouchableOpacity
                onPress={() => !isCurrentMonth && stepMonth(1)}
                style={styles.navButton}
                disabled={isCurrentMonth}
                hitSlop={8}
              >
                <ChevronRight
                  size={20}
                  color={isCurrentMonth ? background.borderColor : background.textColor}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((l, i) => (
                <Text key={i} style={[styles.weekdayLabel, { color: background.secondaryText }]}>
                  {l}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((cell, i) => {
                if (!cell.dateISO) return <View key={i} style={styles.cellWrap} />;
                const count = history[cell.dateISO]?.count ?? 0;
                // Future days render blank and inert, so "not yet" reads
                // differently from "nothing recorded".
                const isFuture = cell.dateISO > todayISO;
                const isPerfect = count >= ALL_GAME_IDS.length;
                const isSelected = selectedDate === cell.dateISO;
                const filled = count > 0 && !isFuture;

                return (
                  <TouchableOpacity
                    key={i}
                    style={styles.cellWrap}
                    activeOpacity={filled ? 0.6 : 1}
                    disabled={!filled}
                    onPress={() => setSelectedDate(isSelected ? null : cell.dateISO)}
                  >
                    <View
                      style={[
                        styles.cell,
                        filled
                          ? { backgroundColor: rampColor(count) }
                          : isFuture
                            ? styles.cellFuture
                            : // A zero day is neutral, never a failure: history
                              // only goes back to when each game's store
                              // shipped, so "didn't play" and "wasn't recorded"
                              // are indistinguishable and must not look like a
                              // miss.
                              [styles.cellEmpty, { borderColor: background.borderColor }],
                        isPerfect && styles.cellPerfect,
                        isSelected && { borderWidth: 2.5, borderColor: background.textColor },
                      ]}
                    >
                      <Text
                        style={[
                          styles.cellText,
                          {
                            color: filled
                              ? count >= 4
                                ? '#ffffff'
                                : '#5c3d15'
                              : background.secondaryText,
                            opacity: isFuture ? 0.45 : 1,
                          },
                        ]}
                      >
                        {cell.dayNum}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Legend */}
            <View style={[styles.legend, { borderTopColor: background.borderColor }]}>
              <Text style={[styles.legendText, { color: background.secondaryText }]}>0</Text>
              <View style={styles.swatches}>
                <View
                  style={[
                    styles.swatch,
                    styles.cellEmpty,
                    { borderColor: background.borderColor },
                  ]}
                />
                {RAMP.map((_, i) => (
                  <View
                    key={i}
                    style={[styles.swatch, { backgroundColor: rampColor(i + 1) }]}
                  />
                ))}
              </View>
              <Text style={[styles.legendText, { color: background.secondaryText }]}>
                {ALL_GAME_IDS.length}
              </Text>
              <Text
                style={[styles.legendText, styles.legendPerfect, { color: background.secondaryText }]}
              >
                dailies cleared
              </Text>
            </View>
          </View>

          {/* ── Day detail ───────────────────────────────────────────────────
              What makes the screen worth reopening: the day becomes a record in
              each game's own vocabulary, not just a count. */}
          {selectedDay && selectedDate && (
            <View
              style={[
                styles.detail,
                { backgroundColor: background.cardColor, borderColor: background.borderColor },
              ]}
            >
              <View style={styles.detailTop}>
                <Text style={[styles.detailDate, { color: background.textColor }]}>
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
                <Text style={[styles.detailCount, { color: FLAME }]}>
                  {selectedDay.count} / {ALL_GAME_IDS.length}
                </Text>
              </View>
              {selectedDay.count >= ALL_GAME_IDS.length ? (
                <Text style={[styles.detailNote, { color: background.secondaryText }]}>
                  Perfect Day — every daily cleared
                </Text>
              ) : (
                (() => {
                  const notRecording = ALL_GAME_IDS.filter(
                    (id) => !wasRecording(firstRecorded, id, selectedDate)
                  ).length;
                  if (notRecording === 0) return null;
                  // Says plainly why the day looks emptier than it was, on the
                  // day itself, rather than leaving it to a footnote nobody
                  // connects to the row they're looking at.
                  return (
                    <Text style={[styles.detailNote, { color: background.secondaryText }]}>
                      {notRecording === 1
                        ? '1 game wasn\'t keeping a history yet on this date'
                        : `${notRecording} games weren't keeping a history yet on this date`}
                    </Text>
                  );
                })()
              )}

              {ALL_GAME_IDS.map((id: GameId, idx) => {
                const entry = selectedDay.games[id];
                const accent = accentForGame(id, colorBlindMode);
                // A game that wasn't keeping a history on this date can't be
                // reported as a miss. Hex Hive has recorded since early July,
                // the rest only since mid-August, so early days genuinely have
                // no data for most games -- and showing that as a dash read as
                // "you skipped seven games" to someone who hadn't.
                const recording = wasRecording(firstRecorded, id, selectedDate);
                return (
                  <View
                    key={id}
                    style={[
                      styles.gameRow,
                      idx > 0 && { borderTopWidth: 1, borderTopColor: background.borderColor + '55' },
                    ]}
                  >
                    <View
                      style={[
                        styles.gameDot,
                        { backgroundColor: entry ? accent : background.borderColor + '66' },
                      ]}
                    />
                    <Text
                      style={[
                        styles.gameName,
                        { color: entry ? accent : background.secondaryText, opacity: entry ? 1 : 0.55 },
                      ]}
                    >
                      {GAME_LABELS[id]}
                    </Text>
                    <Text
                      style={[
                        styles.gameDetail,
                        !entry && !recording && styles.gameDetailUnrecorded,
                        { color: background.secondaryText, opacity: entry ? 1 : 0.45 },
                      ]}
                      numberOfLines={1}
                    >
                      {entry?.detail || (recording ? '—' : 'not recorded')}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Honest about what the history can and cannot know. Shown always,
              not just early on -- the caveat never stops being true. */}
          <Text style={[styles.footnote, { color: background.secondaryText }]}>
            History is recorded from the day each game started keeping one, so earlier days may
            look emptier than they were. Blank days are not counted as misses.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Kpi({
  value,
  label,
  background,
  icon,
}: {
  value: string;
  label: string;
  background: { textColor: string; secondaryText: string; borderColor: string; backgroundColor?: string };
  icon?: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.kpi,
        { borderColor: background.borderColor, backgroundColor: background.backgroundColor },
      ]}
    >
      <Text style={[styles.kpiValue, { color: background.textColor }]}>{value}</Text>
      <View style={styles.kpiLabelRow}>
        {icon}
        <Text style={[styles.kpiLabel, { color: background.secondaryText }]}>{label}</Text>
      </View>
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

  hero: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroMain: { alignItems: 'flex-start' },
  heroNum: { fontSize: 40, fontWeight: '900', lineHeight: 42 },
  heroLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7, marginTop: 2 },
  heroBest: { marginLeft: 'auto', alignItems: 'flex-end' },
  heroBestNum: { fontSize: 20, fontWeight: '900' },

  kpiRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  kpi: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  kpiValue: { fontSize: 17, fontWeight: '900' },
  kpiLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  kpiLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  calendar: { borderWidth: 1.5, borderRadius: 16, padding: 14 },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  navButton: { padding: 6 },
  monthLabel: { fontSize: 15, fontWeight: '800' },
  weekdayRow: { flexDirection: 'row', marginBottom: 5 },
  weekdayLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 10.5,
    fontWeight: '700',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellWrap: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2.5,
  },
  cell: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellEmpty: { borderWidth: 1.5, borderStyle: 'dashed', opacity: 0.55 },
  cellFuture: { backgroundColor: 'transparent' },
  cellPerfect: { borderWidth: 2, borderColor: FLAME },
  cellText: { fontSize: 12, fontWeight: '700' },

  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: 1,
  },
  legendText: { fontSize: 10, fontWeight: '700' },
  legendPerfect: { marginLeft: 'auto' },
  swatches: { flexDirection: 'row', gap: 3 },
  swatch: { width: 14, height: 14, borderRadius: 4 },

  detail: { marginTop: 13, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 12 },
  detailTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  detailDate: { fontSize: 14, fontWeight: '800' },
  detailCount: { fontSize: 12, fontWeight: '800' },
  detailNote: { fontSize: 10.5, fontWeight: '600', marginTop: 2, marginBottom: 6 },
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  gameDot: { width: 8, height: 8, borderRadius: 4 },
  gameName: { fontSize: 11.5, fontWeight: '700', width: 96 },
  gameDetail: { fontSize: 10.5, marginLeft: 'auto', textAlign: 'right', flexShrink: 1 },
  gameDetailUnrecorded: { fontStyle: 'italic' },

  footnote: { fontSize: 10.5, lineHeight: 15, marginTop: 16, textAlign: 'center', opacity: 0.8 },
});
