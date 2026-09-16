// src/shared/ResultsScreen.tsx
//
// The one results screen every game renders. See docs/RESULTS_SCREEN_V2.md
// for the card-and-pill layout (hero, pills, signature, chips, toggle,
// lifetime) every game now uses.
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from './ThemeContext';

export type PillSpec = { label: string; value: string };

/** Exactly three pills. Two is the bug this redesign exists to fix, so a
 * caller passing the wrong count fails at the type, not at render. */
export type PillTriple = readonly [PillSpec, PillSpec, PillSpec];

export type HeroSpec = { label: string; value: string; suffix?: string; note?: string };
export type ChipSpec = { label: string; highlighted?: boolean };
export type ToggleSpec = { label: string; content: React.ReactNode };
export type LifetimeSpec = { caption?: string; pills: PillTriple };
export type CountdownSpec = { label: string; value: string };

/** countdown and onPlayAgain are mutually exclusive, enforced at the type. */
type CountdownOrPlayAgain =
  | { countdown?: CountdownSpec; onPlayAgain?: undefined }
  | { countdown?: undefined; onPlayAgain?: () => void };

type BaseNewProps = {
  visible: boolean;
  gameName: string;
  onClose: () => void;

  title: string;
  subtitle?: string;
  /** One pill, segments joined with a middot. Quick Play prepends "Quick Play". */
  badge?: string[];

  hero?: HeroSpec;
  pills?: PillTriple;
  signature?: React.ReactNode;
  chips?: ChipSpec[];
  toggle?: ToggleSpec;
  lifetime?: LifetimeSpec;

  extra?: React.ReactNode;

  onMainMenu: () => void;
  mainMenuLabel?: string;
  playAgainLabel?: string;
  onShare?: () => void;
  shareLabel?: string;
};

export type NewResultsScreenProps = BaseNewProps & CountdownOrPlayAgain;

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

// Every color in the exact-values table comes from ThemeContext, but a few
// need it at partial opacity, and BackgroundOption only stores solid hex.
function withOpacity(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// ---------------------------------------------------------------------------
// Primitives. Signature blocks for the migrated games are built from these.
// ---------------------------------------------------------------------------

type CardProps = {
  padding?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export const Card: React.FC<CardProps> = ({ padding = 14, style, children }) => {
  const { background } = useTheme();
  return (
    <View
      style={[
        primitiveStyles.card,
        {
          backgroundColor: background.cardColor,
          borderColor: withOpacity(background.borderColor, 0.45),
          padding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

export const Pill: React.FC<PillSpec> = ({ label, value }) => {
  const { background } = useTheme();
  return (
    <View
      style={[
        primitiveStyles.pill,
        { backgroundColor: background.cardColor, borderColor: withOpacity(background.borderColor, 0.45) },
      ]}
    >
      <Text style={[primitiveStyles.pillLabel, { color: background.secondaryText }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[primitiveStyles.pillValue, { color: background.textColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
    </View>
  );
};

export const GhostPill: React.FC<PillSpec> = ({ label, value }) => {
  const { background } = useTheme();
  return (
    <View
      style={[
        primitiveStyles.pill,
        // The one hardcoded fill in this file besides the green tiles/share
        // button below: white at 45%, the same on every theme rather than a
        // per-theme "ghost" color nobody asked for.
        { backgroundColor: 'rgba(255, 255, 255, 0.45)', borderColor: withOpacity(background.borderColor, 0.28) },
      ]}
    >
      <Text style={[primitiveStyles.pillLabel, { color: background.secondaryText }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[primitiveStyles.ghostValue, { color: background.secondaryText }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
    </View>
  );
};

export const Chip: React.FC<ChipSpec> = ({ label, highlighted }) => {
  const { background } = useTheme();
  return (
    <View
      style={[
        primitiveStyles.chip,
        highlighted
          ? { backgroundColor: background.accentColor, borderColor: background.accentColor }
          : { backgroundColor: 'transparent', borderColor: withOpacity(background.borderColor, 0.45) },
      ]}
    >
      <Text
        style={[primitiveStyles.chipText, { color: highlighted ? '#ffffff' : background.textColor }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
};

export const Caption: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { background } = useTheme();
  return <Text style={[primitiveStyles.caption, { color: background.secondaryText }]}>{children}</Text>;
};

export type WordTilesProps = { word: string; solved: boolean };

export const WordTiles: React.FC<WordTilesProps> = ({ word, solved }) => {
  const { background } = useTheme();
  return (
    <View style={primitiveStyles.wordTilesRow}>
      {word.split('').map((letter, i) => (
        <View
          key={i}
          style={[
            primitiveStyles.wordTile,
            solved
              ? { backgroundColor: '#22c55e' }
              : { backgroundColor: 'transparent', borderWidth: 2, borderColor: background.borderColor },
          ]}
        >
          <Text style={[primitiveStyles.wordTileText, { color: solved ? '#ffffff' : background.textColor }]}>
            {letter}
          </Text>
        </View>
      ))}
    </View>
  );
};

const primitiveStyles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1 },

  pill: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  pillLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  pillValue: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  ghostValue: { fontSize: 15, fontWeight: '900', marginTop: 1 },

  chip: { borderRadius: 999, borderWidth: 1.5, paddingVertical: 5, paddingHorizontal: 11 },
  chipText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },

  caption: { fontSize: 10, fontWeight: '800', letterSpacing: 2.2, textTransform: 'uppercase', marginTop: 16 },

  wordTilesRow: { flexDirection: 'row', gap: 6 },
  wordTile: { width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  wordTileText: { fontSize: 24, fontWeight: '900' },
});

// ---------------------------------------------------------------------------
// Render path
// ---------------------------------------------------------------------------

const ResultsScreenV2: React.FC<NewResultsScreenProps> = ({
  visible,
  gameName,
  onClose,
  title,
  subtitle,
  badge,
  hero,
  pills,
  signature,
  chips,
  toggle,
  lifetime,
  countdown,
  extra,
  onMainMenu,
  mainMenuLabel = 'Main Menu',
  onPlayAgain,
  playAgainLabel = 'Play Again',
  onShare,
  shareLabel = 'Share Result',
}) => {
  const { background } = useTheme();
  const insets = useSafeAreaInsets();
  const [toggleOpen, setToggleOpen] = useState(false);

  const TEXT = background.textColor;
  const SUBTEXT = background.secondaryText;
  const CARD = background.cardColor;
  const BORDER = background.borderColor;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={[v2Styles.root, { backgroundColor: background.backgroundColor }]}>
        <View style={[v2Styles.header, { paddingTop: insets.top + 10, borderColor: BORDER }]}>
          <View style={v2Styles.headerSpacer} />
          <Text style={[v2Styles.gameName, { color: SUBTEXT }]} numberOfLines={1}>
            {gameName}
          </Text>
          <Pressable
            style={({ pressed }) => [v2Styles.closeButton, { opacity: pressed ? 0.6 : 1 }]}
            onPress={onClose}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Close results"
          >
            <X size={22} color={SUBTEXT} />
          </Pressable>
        </View>

        {/* The footer sits outside the ScrollView so it is pinned and never
            scrolls, however tall the content above it runs. */}
        <View style={v2Styles.body}>
          <ScrollView
            style={v2Styles.scroll}
            contentContainerStyle={v2Styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[v2Styles.title, { color: TEXT }]}>{title}</Text>
            {!!subtitle && <Text style={[v2Styles.subtitle, { color: SUBTEXT }]}>{subtitle}</Text>}
            {!!badge && badge.length > 0 && (
              <View style={[v2Styles.badge, { borderColor: SUBTEXT }]}>
                <Text style={[v2Styles.badgeText, { color: SUBTEXT }]} numberOfLines={1}>
                  {badge.join(' · ')}
                </Text>
              </View>
            )}

            {!!hero && (
              <Card padding={16} style={v2Styles.heroCard}>
                <Text style={[v2Styles.heroLabel, { color: SUBTEXT }]}>{hero.label}</Text>
                <Text
                  style={[v2Styles.heroValue, { color: TEXT }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {hero.value}
                  {!!hero.suffix && <Text style={[v2Styles.heroSuffix, { color: SUBTEXT }]}> {hero.suffix}</Text>}
                </Text>
                {!!hero.note && <Text style={[v2Styles.heroNote, { color: SUBTEXT }]}>{hero.note}</Text>}
              </Card>
            )}

            {!!pills && (
              <View style={v2Styles.pillRow}>
                {pills.map((pill) => (
                  <View key={pill.label} style={v2Styles.pillFlex}>
                    <Pill label={pill.label} value={pill.value} />
                  </View>
                ))}
              </View>
            )}

            {signature}

            {!!chips && chips.length > 0 && (
              <View style={v2Styles.chipWrap}>
                {chips.map((chip, i) => (
                  <Chip key={`${chip.label}-${i}`} label={chip.label} highlighted={chip.highlighted} />
                ))}
              </View>
            )}

            {!!toggle && (
              <View style={v2Styles.toggleWrap}>
                <Pressable
                  style={({ pressed }) => [
                    v2Styles.toggleRow,
                    { borderColor: SUBTEXT, opacity: pressed ? 0.7 : 1 },
                  ]}
                  onPress={() => setToggleOpen((v) => !v)}
                >
                  <Text style={[v2Styles.toggleText, { color: SUBTEXT }]}>
                    {toggleOpen ? `Hide ${toggle.label}` : `Show ${toggle.label}`}
                  </Text>
                </Pressable>
                {toggleOpen && <View style={v2Styles.toggleContent}>{toggle.content}</View>}
              </View>
            )}

            {!!lifetime && (
              <View>
                <Caption>{lifetime.caption ?? 'All time'}</Caption>
                <View style={v2Styles.ghostPillRow}>
                  {lifetime.pills.map((pill) => (
                    <View key={pill.label} style={v2Styles.pillFlex}>
                      <GhostPill label={pill.label} value={pill.value} />
                    </View>
                  ))}
                </View>
              </View>
            )}

            {!!countdown && (
              <View style={v2Styles.countdown}>
                <Text style={[v2Styles.countdownLabel, { color: SUBTEXT }]}>{countdown.label}</Text>
                <Text style={[v2Styles.countdownValue, { color: TEXT }]}>{countdown.value}</Text>
              </View>
            )}

            {extra}
          </ScrollView>

          <View style={[v2Styles.footer, { paddingBottom: insets.bottom + 34 }]}>
            <View style={v2Styles.buttons}>
              <Pressable
                style={({ pressed }) => [
                  v2Styles.button,
                  { borderColor: BORDER, backgroundColor: CARD, opacity: pressed ? 0.75 : 1 },
                ]}
                onPress={onMainMenu}
              >
                <Text style={[v2Styles.buttonText, { color: TEXT }]} numberOfLines={1}>
                  {mainMenuLabel}
                </Text>
              </Pressable>
              {!!onPlayAgain && (
                <Pressable
                  style={({ pressed }) => [
                    v2Styles.button,
                    { borderColor: BORDER, backgroundColor: CARD, opacity: pressed ? 0.75 : 1 },
                  ]}
                  onPress={onPlayAgain}
                >
                  <Text style={[v2Styles.buttonText, { color: TEXT }]} numberOfLines={1}>
                    {playAgainLabel}
                  </Text>
                </Pressable>
              )}
            </View>
            {!!onShare && (
              <Pressable
                style={({ pressed }) => [
                  v2Styles.button,
                  v2Styles.shareButton,
                  v2Styles.shareRow,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
                onPress={onShare}
              >
                <Text style={[v2Styles.buttonText, v2Styles.shareButtonText]} numberOfLines={1}>
                  {shareLabel}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const v2Styles = StyleSheet.create({
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

  body: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 20 },

  title: { textAlign: 'center', fontSize: 24, fontWeight: '900' },
  subtitle: { textAlign: 'center', fontSize: 14, fontWeight: '600', marginTop: 8 },

  badge: {
    alignSelf: 'center',
    marginTop: 10,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 14,
  },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },

  heroCard: { marginTop: 16, alignItems: 'center' },
  heroLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 2.2, textTransform: 'uppercase', textAlign: 'center' },
  heroValue: { fontSize: 54, fontWeight: '900', letterSpacing: -1, lineHeight: 55, textAlign: 'center' },
  heroSuffix: { fontSize: 20, fontWeight: '800' },
  heroNote: { fontSize: 12, fontWeight: '600', marginTop: 3, textAlign: 'center' },

  pillRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  pillFlex: { flex: 1 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },

  toggleWrap: { marginTop: 16, alignItems: 'center' },
  toggleRow: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 999,
    padding: 8,
  },
  toggleText: { fontSize: 12, fontWeight: '800' },
  toggleContent: { marginTop: 16, alignItems: 'center', width: '100%' },

  ghostPillRow: { flexDirection: 'row', gap: 8, marginTop: 8 },

  countdown: { alignItems: 'center', marginTop: 18 },
  countdownLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  countdownValue: { fontSize: 18, fontWeight: '900', marginTop: 3 },

  footer: { paddingHorizontal: 24, paddingTop: 16 },
  buttons: { flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 999,
    padding: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 14, fontWeight: '800' },
  // Standalone child of the footer COLUMN, not the buttons ROW, so it must
  // not inherit button's flex: 1. In a column that sets flexBasis 0 on the
  // button's height, collapsing it to its padding with a clipped label.
  shareButton: { flex: 0, alignSelf: 'stretch', backgroundColor: '#22c55e', borderColor: '#22c55e', padding: 12 },
  shareRow: { marginTop: 10 },
  shareButtonText: { color: '#ffffff' },
});

export const ResultsScreen = ResultsScreenV2;

export default ResultsScreen;
