// src/shared/ResultsScreen.tsx
//
// The one results screen every game renders. Before this, all eight games drew
// their own: eight files between 297 and 712 lines sharing nothing but theme
// colours, which is exactly why they had drifted apart from each other.
//
// Layout, top to bottom:
//   game name centred, close button pinned right
//   title / subtitle / badge
//   three cells, one of them filled, for the numbers that define the round
//   tally groups: label, dotted leader, value, one line each
//   anything game-specific (answer key, guess chart, calendar) via `extra`
//   Main Menu and Share
//
// Three cells is deliberate. A grid of stat cards has to divide evenly, and the
// games do not agree on how many stats they have, so someone always ends up
// with an orphan cell in the last row. Three is the one shape all eight can
// fill. Everything that varies goes in the tally instead, which takes any
// number of rows and any length of label without changing shape.
//
// It also has to fit on one screen. The old Word Search results ran 977pt of
// content into about 799pt of usable height on a 430x932pt phone, so Main Menu
// and Share sat below the fold. Of that, 225pt was margin around five hairline
// dividers and 372pt was six rows of stat pills. Both are gone here.
import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from './ThemeContext';
import { COLORS } from './theme';

/** One of the three headline cells. Exactly one should be the headline. */
export type ResultCell = {
  label: string;
  value: string;
  /** Fills the cell and inverts its text. Reserve it for the number that defines the round. */
  headline?: boolean;
};

export type ResultRowTone = 'default' | 'good' | 'warn';

export type ResultRow = {
  label: string;
  value: string;
  tone?: ResultRowTone;
  /** Draws a rule above and sets the row in the total's weight. */
  total?: boolean;
};

export type ResultGroup = {
  caption: string;
  rows: ResultRow[];
};

type Props = {
  visible: boolean;
  /** Shown centred in the header, e.g. "WORD SEARCH". */
  gameName: string;
  onClose: () => void;

  title: string;
  subtitle?: string;
  /** The outlined pill under the subtitle. */
  badge?: string;

  cells: ResultCell[];
  groups: ResultGroup[];

  countdown?: { label: string; value: string } | null;

  /** Game-specific block, rendered under the tally: answer key, guess chart, calendar. */
  extra?: React.ReactNode;

  onMainMenu: () => void;
  mainMenuLabel?: string;
  /** Omitted on Daily, where there is only one attempt per day. */
  onPlayAgain?: () => void;
  playAgainLabel?: string;
  onShare?: () => void;
  shareLabel?: string;
};

export const ResultsScreen: React.FC<Props> = ({
  visible,
  gameName,
  onClose,
  title,
  subtitle,
  badge,
  cells,
  groups,
  countdown,
  extra,
  onMainMenu,
  mainMenuLabel = 'Main Menu',
  onPlayAgain,
  playAgainLabel = 'Play Again',
  onShare,
  shareLabel = 'Share',
}) => {
  const { background } = useTheme();
  const insets = useSafeAreaInsets();

  const BG = background.backgroundColor;
  const TEXT = background.textColor;
  const SUBTEXT = background.secondaryText;
  const CARD = background.cardColor;
  const BORDER = background.borderColor;
  const ACCENT = background.accentColor;

  // Tone colours come from the theme, not the shared constant. The constant's
  // green and amber are tuned for the dark themes and drop to about 1.2:1 on
  // the saturated light backgrounds, which is not readable.
  const toneColor = (tone?: ResultRowTone) =>
    tone === 'good' ? ACCENT : tone === 'warn' ? COLORS.warning : TEXT;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: BG }]}>
        {/* Header. The spacer matches the close button's width so the game name
            sits centred on the screen rather than centred on what is left of it. */}
        <View style={[styles.header, { paddingTop: insets.top + 10, borderColor: BORDER }]}>
          <View style={styles.headerSpacer} />
          <Text style={[styles.gameName, { color: SUBTEXT }]} numberOfLines={1}>
            {gameName}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.6 : 1 }]}
            onPress={onClose}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Close results"
          >
            <X size={22} color={SUBTEXT} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: TEXT }]}>{title}</Text>
          {!!subtitle && (
            <Text style={[styles.subtitle, { color: SUBTEXT }]}>{subtitle}</Text>
          )}
          {!!badge && (
            <View style={[styles.badge, { borderColor: ACCENT }]}>
              <Text style={[styles.badgeText, { color: ACCENT }]} numberOfLines={1}>
                {badge}
              </Text>
            </View>
          )}

          {cells.length > 0 && (
            <View style={styles.cells}>
              {cells.map((cell) => {
                // The filled cell inverts against the page rather than picking a
                // colour of its own, so it stays legible in every background theme
                // including the two dark ones.
                const fill = cell.headline ? TEXT : CARD;
                const ink = cell.headline ? BG : TEXT;
                const sub = cell.headline ? BG : SUBTEXT;
                return (
                  <View
                    key={cell.label}
                    style={[styles.cell, { backgroundColor: fill, borderColor: TEXT }]}
                  >
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                      style={[styles.cellValue, { color: ink }]}
                    >
                      {cell.value}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.cellLabel, { color: sub, opacity: cell.headline ? 0.75 : 1 }]}
                    >
                      {cell.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {groups.map((group, gi) => (
            <View
              key={group.caption}
              style={[
                styles.group,
                gi > 0 && { marginTop: 15, paddingTop: 13, borderTopWidth: 1, borderTopColor: BORDER },
              ]}
            >
              <Text style={[styles.caption, { color: SUBTEXT }]}>{group.caption}</Text>
              {group.rows.map((row) => (
                <View
                  key={row.label}
                  style={[
                    styles.row,
                    row.total && { marginTop: 5, paddingTop: 7, borderTopWidth: 2, borderTopColor: TEXT },
                  ]}
                >
                  <Text
                    style={[styles.rowLabel, { color: TEXT }, row.total && styles.rowLabelTotal]}
                    numberOfLines={1}
                  >
                    {row.label}
                  </Text>
                  {/* The leader is a dotted border on a flexing spacer, so it
                      stretches to whatever room the label and value leave. */}
                  <View style={[styles.leader, { borderBottomColor: BORDER }]} />
                  <Text
                    style={[
                      styles.rowValue,
                      { color: toneColor(row.tone) },
                      row.total && [styles.rowValueTotal, { color: ACCENT }],
                    ]}
                    numberOfLines={1}
                  >
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          ))}

          {!!countdown && (
            <View style={styles.countdown}>
              <Text style={[styles.countdownLabel, { color: SUBTEXT }]}>{countdown.label}</Text>
              <Text style={[styles.countdownValue, { color: TEXT }]}>{countdown.value}</Text>
            </View>
          )}

          {extra}

          {/* Main Menu and Play Again share a row; Share gets its own full-width
              row beneath so three buttons never squeeze into one line. */}
          <View style={styles.buttons}>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                { borderColor: BORDER, backgroundColor: CARD, opacity: pressed ? 0.75 : 1 },
              ]}
              onPress={onMainMenu}
            >
              <Text style={[styles.buttonText, { color: TEXT }]} numberOfLines={1}>
                {mainMenuLabel}
              </Text>
            </Pressable>
            {!!onPlayAgain && (
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  { borderColor: BORDER, backgroundColor: CARD, opacity: pressed ? 0.75 : 1 },
                ]}
                onPress={onPlayAgain}
              >
                <Text style={[styles.buttonText, { color: TEXT }]} numberOfLines={1}>
                  {playAgainLabel}
                </Text>
              </Pressable>
            )}
          </View>
          {!!onShare && (
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.shareButton,
                styles.shareRow,
                { opacity: pressed ? 0.75 : 1 },
              ]}
              onPress={onShare}
            >
              <Text style={[styles.buttonText, styles.shareButtonText]} numberOfLines={1}>
                {shareLabel}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerSpacer: { width: 22 },
  gameName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  closeButton: { width: 22, alignItems: 'flex-end' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 20 },

  title: { textAlign: 'center', fontSize: 24, fontWeight: '900' },
  subtitle: { textAlign: 'center', fontSize: 14, fontWeight: '600', marginTop: 8 },
  badge: {
    alignSelf: 'center',
    marginTop: 14,
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 16,
  },
  badgeText: { fontSize: 13, fontWeight: '700' },

  // Square-edged on purpose: these read as puzzle cells, not as more cards.
  cells: { flexDirection: 'row', gap: 4, marginTop: 24 },
  cell: {
    flex: 1,
    borderWidth: 2,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellValue: { fontSize: 18, fontWeight: '900' },
  cellLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.9, marginTop: 2 },

  group: { marginTop: 22 },
  caption: { fontSize: 10, fontWeight: '800', letterSpacing: 2.2, marginBottom: 7 },

  row: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingVertical: 3 },
  rowLabel: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  rowLabelTotal: { fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  leader: {
    flex: 1,
    borderBottomWidth: 1.5,
    borderStyle: 'dotted',
    opacity: 0.55,
    transform: [{ translateY: -4 }],
  },
  rowValue: { fontSize: 15, fontWeight: '800' },
  rowValueTotal: { fontSize: 22, fontWeight: '900' },

  countdown: { alignItems: 'center', marginTop: 18 },
  countdownLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  countdownValue: { fontSize: 18, fontWeight: '900', marginTop: 3 },

  buttons: { flexDirection: 'row', gap: 10, marginTop: 22 },
  button: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 14, fontWeight: '800' },
  shareButton: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  shareRow: { marginTop: 10 },
  shareButtonText: { color: '#ffffff' },
});

export default ResultsScreen;
