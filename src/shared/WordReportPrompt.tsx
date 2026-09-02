// src/shared/WordReportPrompt.tsx
//
// The dim "N words you tried weren't in our dictionary — Report" row.
//
// Originally this only lived at the bottom of the home screen's scroll —
// below the whole game grid — reasoning that it costs zero height and never
// moves the grid. Real feedback (a Reddit tester, relayed via TestFlight)
// found a word the game rejected and never noticed there was any way to
// report it. The home-only placement traded discoverability for tidiness,
// and lost that trade: most players never scroll past the games to see it.
//
// The fix isn't a popup — recordRejectedWord() in wordReports.ts still fires
// silently mid-play, same as always, and nothing interrupts a game in
// progress. It's showing this same dim line in one more place: each game's
// own results screen, right after a round ends, which is both the moment a
// player is most likely to remember "wait, didn't it just tell me FJORL
// wasn't a word?" and the one place they're guaranteed to actually look.
//
// Still ONE central list and ONE offer per day (see wordReports.ts) — this
// doesn't ask more often, it just gives the one daily offer a better chance
// of being seen. Whichever screen (home or a results screen) the player
// dismisses or reports from marks the day as offered everywhere else too.
//
// Self-contained on purpose: a results screen only needs to drop in
// <WordReportPrompt /> — no state to wire up, no FeedbackForm to mount
// separately. Renders nothing when there's nothing to offer.

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { useTheme } from './ThemeContext';
import FeedbackForm from '../../FeedbackForm';
import {
  buildReportMessage,
  clearWordReports,
  loadPendingReports,
  markReportsOffered,
  type WordReport,
} from './wordReports';

export function WordReportPrompt() {
  const { background } = useTheme();
  const [pendingReports, setPendingReports] = useState<WordReport[]>([]);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    loadPendingReports().then(({ reports, shouldOffer }) => {
      if (cancelled) return;
      setPendingReports(shouldOffer ? reports : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A results screen is usually a fresh mount (a game just ended), so a
  // plain effect covers it. The home screen instead stays mounted across
  // navigations, so it needs the focus-based version to refresh after
  // returning from a game. Both together make this "just work" wherever it's
  // dropped in — redundant on first mount, harmless since loadPendingReports
  // is a cheap read.
  useEffect(load, [load]);
  useFocusEffect(load);

  if (pendingReports.length === 0) return null;

  return (
    <>
      <View style={[styles.row, { borderColor: background.borderColor }]}>
        <Pressable style={styles.main} onPress={() => setShowForm(true)}>
          <Text style={[styles.text, { color: background.secondaryText }]}>
            {pendingReports.length === 1
              ? "1 word you tried wasn't in our dictionary"
              : `${pendingReports.length} words you tried weren't in our dictionary`}
          </Text>
          <Text style={[styles.action, { color: background.textColor }]}>Report</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            // Dismissing counts as having been asked, so it doesn't come
            // straight back on the next screen or tomorrow morning.
            setPendingReports([]);
            markReportsOffered().catch(() => {});
          }}
          hitSlop={10}
          style={styles.dismiss}
        >
          <X size={16} color={background.secondaryText} />
        </Pressable>
      </View>

      <FeedbackForm
        visible={showForm}
        initialCategory="other"
        initialMessage={buildReportMessage(pendingReports)}
        onSent={() => {
          setPendingReports([]);
          clearWordReports().catch(() => {});
        }}
        onClose={() => {
          setShowForm(false);
          markReportsOffered().catch(() => {});
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.9,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontSize: 11.5, flexShrink: 1 },
  action: { fontSize: 11.5, fontWeight: '800', textDecorationLine: 'underline' },
  dismiss: { paddingLeft: 8 },
});
