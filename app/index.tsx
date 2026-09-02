// app/index.tsx
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FallingLetters } from '../src/shared/FallingLetters';
import { SplashScreen } from '../src/shared/SplashScreen';
import { useTheme } from '../src/shared/ThemeContext';
import { ConfirmModal } from '../src/shared/ConfirmModal';
import { COLORS } from '../src/shared/theme';
import { consumeReminderOptInPending, requestReminderPermission, gameIdForRoute } from '../src/shared/dailyReminders';
import { COLORBLIND_GAME_ACCENTS, GAME_ACCENTS } from '../src/shared/gameColors';
import { refreshDailyRitual, acceptSkipOffer, declineSkipOffer, type DailyRitualSummary } from '../src/shared/dailyRitual';
import { HapticManager } from '../src/shared/HapticManager';
import { ShieldCheck } from 'lucide-react-native';
import { WordReportPrompt } from '../src/shared/WordReportPrompt';
import { useCountdownToMidnight } from '../src/wordladder/utils/ladderStorage';

const GAMES = [
  {
    name: 'Wordsmith',
    description: 'Build words from random letters before time runs out',
    route: '/wordbuilder',
    accentColor: GAME_ACCENTS.wordsmith,
    bgColor: '#EEEDFE',
    borderColor: '#AFA9EC',
    textColor: '#3C3489',
    descColor: '#534AB7',
    icon: 'hammer-outline' as const,
  },
  {
    name: 'Furdle',
    description: 'Guess the 5-letter word in 6 tries',
    route: '/wordle',
    accentColor: GAME_ACCENTS.furdle,
    bgColor: '#E1F5EE',
    borderColor: '#5DCAA5',
    textColor: '#085041',
    descColor: '#0F6E56',
    icon: 'grid-outline' as const,
  },
  {
    name: 'Hangman',
    description: 'Guess the word before running out of attempts',
    route: '/hangman',
    accentColor: GAME_ACCENTS.hangman,
    bgColor: '#FAECE7',
    borderColor: '#F0997B',
    textColor: '#4A1B0C',
    descColor: '#993C1D',
    icon: 'skull-outline' as const,
  },
  {
    name: 'Word Grid',
    description: 'Swipe to connect letters and find hidden words',
    route: '/wordgrid',
    accentColor: GAME_ACCENTS.wordgrid,
    bgColor: '#E6F1FB',
    borderColor: '#85B7EB',
    textColor: '#0C447C',
    descColor: '#185FA5',
    icon: 'flash-outline' as const,
  },
  {
    name: 'Word Search',
    description: 'Find themed words hidden in a letter grid',
    route: '/wordsearch',
    accentColor: GAME_ACCENTS.wordsearch,
    bgColor: '#FAEEDA',
    borderColor: '#EF9F27',
    textColor: '#412402',
    descColor: '#854F0B',
    icon: 'search-outline' as const,
  },
  {
    name: 'Word Ladder',
    description: 'Change one letter at a time to reach the target word',
    route: '/wordladder',
    accentColor: GAME_ACCENTS.wordladder,
    bgColor: '#EEF2E3',
    borderColor: '#A9BC7C',
    textColor: '#33401C',
    descColor: '#556B2F',
    icon: 'ladder' as const,
    iconSet: 'material' as const,
  },
  {
    name: 'Hex Hive',
    description: 'Find words hidden among the hexagon letters',
    route: '/hexhive',
    accentColor: GAME_ACCENTS.hexhive,
    bgColor: '#FBF1DA',
    borderColor: '#E8C468',
    textColor: '#4A3600',
    descColor: '#8A6D0E',
    icon: 'hexagon-multiple-outline' as const,
    iconSet: 'material' as const,
  },
  {
    name: 'Anagrams',
    description: 'Unscramble 5 words, easiest to hardest',
    route: '/anagrams',
    accentColor: GAME_ACCENTS.anagrams,
    bgColor: '#FBE7E4',
    borderColor: '#E8938A',
    textColor: '#5C1810',
    descColor: '#96382B',
    icon: 'shuffle-outline' as const,
  },
];

// Colorblind-safe replacement for the 8 tile colors above, keyed by route so
// it stays aligned with GAMES even if the array is reordered. Built from the
// Okabe-Ito / Wong palette — the standard qualitative palette designed
// specifically for this exact problem (up to 8 categories that all need to
// stay visually distinct for every common form of color vision deficiency),
// rather than reusing the original hand-picked brand hues which weren't
// chosen with that constraint in mind.
const COLORBLIND_GAME_COLORS: Record<string, { accentColor: string; bgColor: string; borderColor: string; textColor: string; descColor: string }> = {
  '/wordbuilder': { accentColor: COLORBLIND_GAME_ACCENTS.wordsmith, bgColor: '#FBEAE0', borderColor: '#E8A87C', textColor: '#4A2000', descColor: '#7A3600' }, // vermillion
  '/wordle':      { accentColor: COLORBLIND_GAME_ACCENTS.furdle, bgColor: '#DFF5EE', borderColor: '#66C9AA', textColor: '#00382A', descColor: '#00614A' }, // bluish green
  '/hangman':     { accentColor: COLORBLIND_GAME_ACCENTS.hangman, bgColor: '#FAE9F1', borderColor: '#E3AECB', textColor: '#4A1F35', descColor: '#7A3A5C' }, // reddish purple
  '/wordgrid':    { accentColor: COLORBLIND_GAME_ACCENTS.wordgrid, bgColor: '#DFF0FA', borderColor: '#6FB3DD', textColor: '#002E4A', descColor: '#004E7A' }, // blue
  '/wordsearch':  { accentColor: COLORBLIND_GAME_ACCENTS.wordsearch, bgColor: '#FCF1DC', borderColor: '#F0CA70', textColor: '#4A3200', descColor: '#7A5300' }, // orange
  '/wordladder':  { accentColor: COLORBLIND_GAME_ACCENTS.wordladder, bgColor: '#E7F5FC', borderColor: '#A7D9F2', textColor: '#0B3A52', descColor: '#135E82' }, // sky blue
  '/hexhive':     { accentColor: COLORBLIND_GAME_ACCENTS.hexhive, bgColor: '#FBF7DC', borderColor: '#E8D670', textColor: '#4A4000', descColor: '#7A6900' }, // yellow
  '/anagrams':    { accentColor: COLORBLIND_GAME_ACCENTS.anagrams, bgColor: '#EDEDED', borderColor: '#A8A8A8', textColor: '#1A1A1A', descColor: '#333333' }, // near-black (grayscale is always safe)
};

const COMING_SOON: string[] = ['Crossword'];

/**
 * One queued dialog. Built at the moment the app decides to say something, so
 * the copy captures the values that were true then rather than re-reading state
 * later.
 */
interface HomeDialog {
  key: string;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  hideCancel?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export default function Home() {
  const { background, colorBlindMode } = useTheme();
  const [showSplash, setShowSplash] = useState(true);
  // Measured directly and locked in on first layout rather than trusting
  // flex:1 alone. The game-menu screens had the exact same scrollable area
  // sometimes settle a bit short of the true available height, leaving
  // content stuck below an invisible line with plain background beneath it
  // until a scroll gesture forced a re-measure. Locking the real number in
  // removes that gap here too.
  const [scrollAreaHeight, setScrollAreaHeight] = useState(0);
  const [ritual, setRitual] = useState<DailyRitualSummary | null>(null);
  const resetsIn = useCountdownToMidnight();

  // ── One dialog at a time, queued ──────────────────────────────────────────
  // This screen can want to say several things at once: a Perfect Day landed,
  // a Streak Skip is on offer, the first skip was just earned, the reminder
  // opt-in is due. It used to render five separate <ConfirmModal>s, each with
  // its own visible flag.
  //
  // React Native's Modal is a real native modal. Presenting one while another
  // is still dismissing deadlocks UIKit and leaves an invisible full-screen
  // view swallowing every touch — the app looks frozen, and the only way out
  // is force-quitting it. Accepting a Streak Skip did exactly that: it hid the
  // offer and showed the relief message in the same breath. Perfect Day plus a
  // skip offer, or either plus the reminder prompt, could collide the same way.
  //
  // So: one Modal, ever. Dialogs queue, and the next is presented only after
  // the previous has finished dismissing (onDismiss), with a timeout as a
  // backstop so a missed callback can't wedge the queue forever.
  const [dialogQueue, setDialogQueue] = useState<HomeDialog[]>([]);
  const [activeDialog, setActiveDialog] = useState<HomeDialog | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const dismissFallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The key of whatever is on screen, in a ref so enqueueDialog can check it
  // without being rebuilt every time the active dialog changes.
  const activeKeyRef = useRef<string | null>(null);

  const enqueueDialog = useCallback((dialog: HomeDialog) => {
    // Keyed so the same message can't be queued twice — checking the ACTIVE
    // dialog as well as the queue. A skip offer stays pending in storage until
    // it's answered, so backgrounding the app with the offer on screen and
    // returning re-runs the focus effect and would otherwise queue a second
    // copy to appear right after the first was dismissed.
    setDialogQueue((q) =>
      activeKeyRef.current === dialog.key || q.some((d) => d.key === dialog.key)
        ? q
        : [...q, dialog]
    );
  }, []);

  useEffect(() => {
    if (activeDialog || dialogQueue.length === 0) return;
    const next = dialogQueue[0];
    activeKeyRef.current = next.key;
    setActiveDialog(next);
    setDialogQueue((q) => q.slice(1));
    setDialogVisible(true);
  }, [activeDialog, dialogQueue]);

  const closeDialog = useCallback(() => {
    setDialogVisible(false);
    // onDismiss is iOS-only and, being a native callback, is not something to
    // stake the whole queue on. If it hasn't fired by now the modal is gone
    // anyway.
    if (dismissFallback.current) clearTimeout(dismissFallback.current);
    dismissFallback.current = setTimeout(() => {
      activeKeyRef.current = null;
      setActiveDialog(null);
    }, 450);
  }, []);

  const handleDialogDismissed = useCallback(() => {
    if (dismissFallback.current) {
      clearTimeout(dismissFallback.current);
      dismissFallback.current = null;
    }
    activeKeyRef.current = null;
    setActiveDialog(null);
  }, []);

  useEffect(
    () => () => {
      if (dismissFallback.current) clearTimeout(dismissFallback.current);
    },
    []
  );

  // Checked every time the player lands back on the home screen — this is
  // the natural, unhurried moment after a win, not mid-game. The flag can
  // only ever be true once per install (see maybeFlagReminderOptIn), so
  // this prompt shows at most one time, ever.
  useFocusEffect(
    useCallback(() => {
      consumeReminderOptInPending().then((pending) => {
        if (!pending) return;
        enqueueDialog({
          key: 'reminderOptIn',
          title: 'Keep your streak alive',
          message:
            "Get a gentle nudge in the evening if you've got an unplayed daily challenge, so your streak never resets by accident.",
          cancelText: 'Not Now',
          confirmText: 'Enable',
          onConfirm: () => {
            requestReminderPermission();
          },
        });
      });
    }, [enqueueDialog])
  );

  // Words the games rejected that look like real words. Collected silently
  // during play (see src/shared/wordReports.ts) and rendered by
  // WordReportPrompt below, at the bottom of the scroll — it also now shows
  // on each game's own results screen, since bottom-of-home-only turned out
  // to be easy to miss entirely.

  // Recompute the cross-game ritual every time the player lands back home —
  // which is exactly when they've just finished a daily. refreshDailyRitual
  // only writes when something actually changed, so this is safe to call on
  // every focus.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      refreshDailyRitual()
        .then((summary) => {
          if (cancelled) return;
          setRitual(summary);
          // The Perfect Day celebration fires here rather than inside whichever
          // game happened to be the eighth — it lands at the natural end of a
          // session, and it means none of the eight game screens need to know
          // this feature exists.
          if (summary.shouldCelebratePerfectDay) {
            enqueueDialog({
              key: 'perfectDay',
              title: 'Perfect Day',
              message: `All 8 dailies cleared. That's ${summary.perfectDays} perfect ${
                summary.perfectDays === 1 ? 'day' : 'days'
              } — and a ${summary.streak}-day Fury Streak.`,
              confirmText: 'Nice',
              hideCancel: true,
            });
            HapticManager.achievement();
          }
          // A live offer takes priority over the intro — it's time-sensitive
          // and the player is mid-decision about a streak they care about.
          // Both can be queued in the same pass now; they simply show in turn
          // instead of fighting over the one native modal slot.
          if (summary.pendingSkipOffer) {
            const atRisk = summary.pendingSkipOffer.streakAtRisk;
            const gamesSaved = Object.values(summary.completion).filter(Boolean).length;
            enqueueDialog({
              key: 'skipOffer',
              title: 'Missed a day',
              message: `You didn't play yesterday. Use a Streak Skip to keep your ${atRisk}-day streak going?`,
              cancelText: 'Let it reset',
              confirmText: `Use skip — ${Math.max(0, summary.skipsAvailable - 1)} left`,
              onCancel: () => {
                declineSkipOffer()
                  .then(() => refreshDailyRitual())
                  .then(setRitual)
                  .catch(() => {});
              },
              onConfirm: () => {
                acceptSkipOffer()
                  .then(() => refreshDailyRitual())
                  .then((updated) => {
                    setRitual(updated);
                    // Name what was rescued — an abstract counter becomes
                    // something concrete, and this is the message that teaches
                    // the value of the next skip. Queued, so it appears only
                    // once the offer has finished dismissing.
                    enqueueDialog({
                      key: 'skipRelief',
                      title: 'Skip used',
                      message:
                        `Your ${atRisk}-day Fury Streak is safe` +
                        (gamesSaved > 0
                          ? `, along with ${gamesSaved} game streak${gamesSaved === 1 ? '' : 's'}.`
                          : '.'),
                      confirmText: 'Good',
                      hideCancel: true,
                    });
                    HapticManager.achievement();
                  })
                  .catch(() => {});
              },
            });
          } else if (summary.shouldShowSkipIntro) {
            enqueueDialog({
              key: 'skipIntro',
              title: 'Streak Skip earned',
              message:
                "You've banked a Streak Skip. It covers one missed day and keeps every streak alive — you'll be asked before it's ever used.",
              confirmText: 'Got it',
              hideCancel: true,
            });
            HapticManager.achievement();
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [enqueueDialog])
  );

  return (
    <View style={[styles.root, { backgroundColor: background.backgroundColor }]}>
      <FallingLetters />
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle={background.statusBar === 'dark' ? 'dark-content' : 'light-content'}
        />

        {/* Header */}
        <View style={styles.header}>
          {/* The left slot was an empty 38px spacer balancing the settings gear.
              It's now the way into the history screen.
              A chevron on the Today card was the only entry point at first, and
              nobody found it -- including me, testing my own build. A permanent
              icon in the header costs the game grid nothing (the header is
              already this tall) and is somewhere people actually look. */}
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => router.push('/fury')}
            accessibilityLabel="Your Fury history"
          >
            <Ionicons
              name="flame"
              size={22}
              color={(ritual?.streak ?? 0) > 0 ? '#F97316' : background.textColor}
            />
          </TouchableOpacity>
          <Text style={[styles.title, { color: background.textColor }]}>
            Word Fury
          </Text>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => router.push('/settings')}
          >
            <Ionicons name="settings-outline" size={22} color={background.textColor} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={[styles.scrollView, scrollAreaHeight ? { flex: undefined, height: scrollAreaHeight } : null]}
          contentContainerStyle={styles.gamesContainer}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0 && Math.abs(h - scrollAreaHeight) > 1) setScrollAreaHeight(h);
          }}
        >
          {/* ── TODAY CARD ──────────────────────────────────────────────────────
              The fraction is the headline, not the streak: "how many are left
              today" is the question a returning player actually has, and seeing
              5/8 at 9pm reads as an invitation rather than a scolding. The eight
              segments make what's left glanceable without counting. */}
          {ritual && (
            /* Tapping the card opens the cross-game history screen. The card
               deliberately gains no row and no height for this -- the games are
               the point of the home screen, so the affordance is a chevron
               inside the card's existing padding and nothing more. */
            <Pressable
              onPress={() => router.push('/fury')}
              style={({ pressed }) => [
                styles.todayCard,
                { backgroundColor: background.cardColor, borderColor: background.borderColor },
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={styles.todayTopRow}>
                <View style={styles.todayFractionWrap}>
                  <Text style={[styles.todayFraction, { color: background.textColor }]}>
                    {ritual.completedCount}
                    <Text style={[styles.todayFractionTotal, { color: background.secondaryText }]}>
                      /{ritual.totalCount}
                    </Text>
                  </Text>
                  <Text style={[styles.todayLabel, { color: background.secondaryText }]}>
                    Dailies today
                  </Text>
                </View>

                <View style={styles.todayStreakWrap}>
                  <View style={styles.todayStreakRow}>
                    {/* Skips are a CROSS-GAME resource, so they're shown on the
                        cross-game surface and nowhere else. A count on an
                        individual game's menu would read as "this game has a
                        skip", which is the wrong model. */}
                    {ritual.skipsAvailable > 0 && (
                      <View style={styles.todaySkipBadge}>
                        <ShieldCheck size={15} color={background.secondaryText} />
                        <Text style={[styles.todaySkipCount, { color: background.secondaryText }]}>
                          {ritual.skipsAvailable}
                        </Text>
                      </View>
                    )}
                    <Ionicons name="flame" size={18} color={ritual.streak > 0 ? '#F97316' : background.secondaryText} />
                    <Text style={[styles.todayStreakValue, { color: background.textColor }]}>
                      {ritual.streak}
                    </Text>
                  </View>
                  {/* "Fury Streak ›" rather than a bare chevron floating in the
                      corner: the words say what tapping leads to, and it sits
                      against the number whose history it shows. Costs no height
                      -- it's the label that was already here. */}
                  <Text style={[styles.todayLabel, { color: background.secondaryText }]}>
                    Fury Streak ›
                  </Text>
                </View>
              </View>

              {/* One segment per game, lit as each daily is cleared. */}
              <View style={styles.todaySegments}>
                {GAMES.map((game) => {
                  const id = gameIdForRoute(game.route);
                  const done = id ? ritual.completion[id] : false;
                  const colors = colorBlindMode ? COLORBLIND_GAME_COLORS[game.route] ?? game : game;
                  return (
                    <View
                      key={game.route}
                      style={[
                        styles.todaySegment,
                        {
                          backgroundColor: done ? colors.accentColor : background.borderColor,
                          opacity: done ? 1 : 0.35,
                        },
                      ]}
                    />
                  );
                })}
              </View>

              <Text
                style={[
                  styles.todayReset,
                  { color: ritual.streakAtRiskToday ? '#F97316' : background.secondaryText },
                ]}
              >
                {ritual.isPerfectDay
                  ? 'Perfect Day — all 8 cleared'
                  : ritual.streakAtRiskToday
                  ? `Play one daily to keep your ${ritual.streak}-day streak`
                  : `Resets in ${resetsIn}`}
              </Text>

            </Pressable>
          )}

          <View style={styles.grid}>
            {GAMES.map((game, index) => {
              const isLastOdd = GAMES.length % 2 !== 0 && index === GAMES.length - 1;
              const colors = colorBlindMode ? COLORBLIND_GAME_COLORS[game.route] ?? game : game;
              // Today's daily done? The Today card says HOW MANY are left; this
              // badge says WHICH ones, at the moment the player is choosing
              // where to tap. Deliberately a quiet badge rather than a grey-out
              // — a finished game must stay inviting, since practice modes and
              // stats are still in there.
              const gameId = gameIdForRoute(game.route);
              const dailyDone = !!(ritual && gameId && ritual.completion[gameId]);
              return (
                <TouchableOpacity
                  key={game.name}
                  style={[
                    styles.tile,
                    {
                      backgroundColor: colors.bgColor,
                      borderColor: colors.borderColor,
                      width: isLastOdd ? '100%' : '48.5%',
                    },
                  ]}
                  activeOpacity={0.75}
                  onPress={() => router.push(game.route as any)}
                >
                  {/* Color accent bar */}
                  <View style={[styles.accentBar, { backgroundColor: colors.accentColor }]} />

                  {dailyDone && (
                    <View style={[styles.tileCheck, { backgroundColor: colors.accentColor }]}>
                      <Ionicons name="checkmark" size={13} color="#fff" />
                    </View>
                  )}

                  <View style={styles.tileBody}>
                    {/* Icon */}
                    <View style={[styles.iconWrap, { backgroundColor: colors.accentColor + '22' }]}>
                      {'iconSet' in game && game.iconSet === 'material' ? (
                        <MaterialCommunityIcons name={game.icon as any} size={18} color={colors.accentColor} />
                      ) : (
                        <Ionicons name={game.icon as any} size={18} color={colors.accentColor} />
                      )}
                    </View>

                    <Text style={[styles.gameName, { color: colors.textColor }]}>
                      {game.name}
                    </Text>
                    <Text
                      style={[styles.gameDesc, { color: colors.descColor }]}
                      numberOfLines={2}
                    >
                      {game.description}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Coming Soon */}
          {COMING_SOON.length > 0 && (
            <>
              <Text style={[styles.comingSoonLabel, { color: background.secondaryText }]}>
                Coming soon
              </Text>
              <View style={styles.chipsRow}>
                {COMING_SOON.map((name) => (
                  <View
                    key={name}
                    style={[styles.chip, { borderColor: background.borderColor }]}
                  >
                    <Text style={[styles.chipText, { color: background.secondaryText }]}>
                      {name}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── MISSING WORD REPORT ───────────────────────────────────────────
              Last thing in the scroll, so it costs nothing above the fold and
              the game grid never moves. Only appears when there is something
              worth sending, and at most once a day. Nothing interrupts play:
              a rejected word behaves exactly as it always has. Also shows on
              each game's own results screen now — see WordReportPrompt. */}
          <WordReportPrompt />
        </ScrollView>
      </SafeAreaView>

      {/* ── THE ONE DIALOG ───────────────────────────────────────────────────
          Every message this screen can raise — Perfect Day, a Streak Skip
          offer, the relief after spending one, the first-skip explainer, the
          reminder opt-in — comes through here, one at a time.

          There used to be five separate <ConfirmModal>s. React Native's Modal
          is a real native modal, and presenting one while another is still
          dismissing deadlocks UIKit: an invisible full-screen view stays behind
          and eats every touch, so the app appears frozen until it's force-quit.
          Accepting a skip hid the offer and showed the relief in the same
          breath, which is exactly that. */}
      <ConfirmModal
        visible={dialogVisible}
        title={activeDialog?.title ?? ''}
        message={activeDialog?.message ?? ''}
        confirmText={activeDialog?.confirmText ?? 'OK'}
        cancelText={activeDialog?.cancelText}
        hideCancel={activeDialog?.hideCancel}
        onCancel={() => {
          const dialog = activeDialog;
          closeDialog();
          dialog?.onCancel?.();
        }}
        onConfirm={() => {
          const dialog = activeDialog;
          closeDialog();
          dialog?.onConfirm?.();
        }}
        onDismiss={handleDialogDismissed}
        backgroundColor={background.cardColor}
        textColor={background.textColor}
        secondaryText={background.secondaryText}
        borderColor={background.borderColor}
        destructiveColor={COLORS.accent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 5,
  },
  headerPlaceholder: {
    width: 38,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  settingsButton: {
    padding: 8,
  },
  // ── Today card (cross-game daily ritual) ──────────────────────────────────
  todayCard: {
    // No horizontal margin: gamesContainer already pads 16px, so this keeps the
    // card's edges flush with the tile grid below it.
    marginBottom: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  todayTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  todayFractionWrap: { alignItems: 'flex-start' },
  todayFraction: { fontSize: 30, fontWeight: '900', lineHeight: 34 },
  todayFractionTotal: { fontSize: 18, fontWeight: '800' },
  todayLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 2 },
  todayStreakWrap: { alignItems: 'flex-end' },
  todayStreakRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  todayStreakValue: { fontSize: 22, fontWeight: '900' },
  todaySkipBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: 8 },
  todaySkipCount: { fontSize: 13, fontWeight: '800' },
  todaySegments: { flexDirection: 'row', gap: 4, marginTop: 12 },
  todaySegment: { flex: 1, height: 6, borderRadius: 3 },
  todayReset: { fontSize: 11, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  // Mirrors settingsButton on the right so the header stays balanced and gains
  // no height.
  historyButton: { width: 38, alignItems: 'flex-start', justifyContent: 'center' },

  // ── Tile completion badge ─────────────────────────────────────────────────
  tileCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },

  scrollView: {
    flex: 1,
  },
  gamesContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  tile: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 0,
  },
  accentBar: {
    height: 5,
    width: '100%',
  },
  tileBody: {
    padding: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  gameName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  gameDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  comingSoonLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    opacity: 0.6,
  },
  chipText: {
    fontSize: 12,
  },
});
