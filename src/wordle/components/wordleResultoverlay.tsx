import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Share2, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../../shared/ThemeContext";
import { AchievementPopup, AchievementLike } from "../../shared/AchievementPopup";
import { WordReportPrompt } from "../../shared/WordReportPrompt";

type CellState = "correct" | "present" | "absent" | "empty";

type Props = {
  visible: boolean;
  mode: "daily" | "practice";
  status: "won" | "lost";
  solutionWord: string;
  guessesCount: number;
  timeSeconds: number | null;
  currentStreak: number | null;
  bestStreak: number | null;
  winPercentage: number | null;
  gamesPlayed: number | null;
  bestGuessCount: number | null;
  guessDistribution: Record<number, number> | null;
  averageTimeSeconds: number | null;
  averageGuesses: number | null;
  onClose: () => void;
  onPlayAgain: () => void;
  onGoHome: () => void;
  onGoPractice: () => void;
  nextDailySecondsRemaining?: number | null;
  shareText?: string;
  evaluationRows?: CellState[][];
  // Achievement toast to render inside this Modal — see AchievementPopup.
  achievement?: AchievementLike | null;
  onDismissAchievement?: () => void;
};

function formatSeconds(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, "0")}h ${m
    .toString()
    .padStart(2, "0")}m ${sec.toString().padStart(2, "0")}s`;
}

const StatPill = ({
  label,
  value,
  textColor,
  borderColor,
  backgroundColor,
}: {
  label: string;
  value: string;
  textColor: string;
  borderColor: string;
  backgroundColor: string;
}) => {
  return (
    <View style={[styles.statPill, { borderColor, backgroundColor }]}>
      <Text style={[styles.statPillLabel, { color: textColor }]}>{label}</Text>
      <Text style={[styles.statPillValue, { color: textColor }]}>{value}</Text>
    </View>
  );
};

const BigStat = ({
  value,
  label,
  textColor,
  secondaryText,
}: {
  value: string;
  label: string;
  textColor: string;
  secondaryText: string;
}) => {
  return (
    <View style={styles.bigStat}>
      <Text style={[styles.bigStatValue, { color: textColor }]}>{value}</Text>
      <Text style={[styles.bigStatLabel, { color: secondaryText }]}>{label}</Text>
    </View>
  );
};

const GuessDistributionChart = ({
  distribution,
  highlightGuess,
  textColor,
  secondaryText,
}: {
  distribution: Record<number, number>;
  highlightGuess: number | null;
  textColor: string;
  secondaryText: string;
}) => {
  const maxCount = Math.max(1, ...[1, 2, 3, 4, 5, 6].map((n) => distribution[n] ?? 0));
  return (
    <View style={styles.distWrap}>
      {[1, 2, 3, 4, 5, 6].map((n) => {
        const count = distribution[n] ?? 0;
        const pct = count > 0 ? Math.max(0.08, count / maxCount) : 0.08;
        const isHighlighted = highlightGuess === n;
        return (
          <View key={n} style={styles.distRow}>
            <Text style={[styles.distRowLabel, { color: secondaryText }]}>{n}</Text>
            <View style={styles.distBarTrack}>
              <View
                style={[
                  styles.distBarFill,
                  {
                    flex: pct,
                    backgroundColor: isHighlighted ? "#22c55e" : secondaryText,
                    opacity: isHighlighted ? 1 : 0.55,
                  },
                ]}
              >
                <Text style={styles.distBarCount}>{count}</Text>
              </View>
              <View style={{ flex: 1 - pct }} />
            </View>
          </View>
        );
      })}
    </View>
  );
};

const PrimaryButton = ({
  label,
  onPress,
  borderColor,
  textColor,
  backgroundColor,
  fullWidth,
}: {
  label: string;
  onPress: () => void;
  borderColor: string;
  textColor: string;
  backgroundColor: string;
  fullWidth?: boolean;
}) => {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.primaryButton,
        fullWidth && styles.primaryButtonFullWidth,
        { borderColor, backgroundColor, opacity: pressed ? 0.75 : 1 },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.primaryButtonText, { color: textColor }]}>
        {label}
      </Text>
    </Pressable>
  );
};

const WordleResultOverlay = ({
  visible,
  mode,
  status,
  solutionWord,
  guessesCount,
  timeSeconds,
  currentStreak,
  bestStreak,
  winPercentage,
  gamesPlayed,
  bestGuessCount,
  guessDistribution,
  averageTimeSeconds,
  averageGuesses,
  onClose,
  onPlayAgain,
  onGoHome,
  onGoPractice,
  nextDailySecondsRemaining,
  shareText,
  evaluationRows,
  achievement = null,
  onDismissAchievement,
}: Props) => {
  const { background } = useTheme();
  const insets = useSafeAreaInsets();

  const handleShare = async () => {
    try {
      const text = shareText && shareText.length > 0
        ? shareText
        : `Furdle ${isWin ? `${guessesCount}/6` : "X/6"}`;
      const { Share } = require("react-native");
      await Share.share({ message: text });
    } catch (e) {
      console.warn("Share failed", e);
    }
  };

  const BG = background.backgroundColor ?? "#f9f5ec";
  const TEXT = background.textColor ?? "#111827";
  const SUBTEXT = background.secondaryText ?? "#6b7280";
  const CARD = background.cardColor ?? "#ffffff";
  const BORDER = background.borderColor ?? "#e5e7eb";

  const isDaily = mode === "daily";
  const isWin = status === "won";
  const hasThisGameData = guessesCount > 0 || timeSeconds != null;

  let title = isWin ? "Nice!" : "Out of guesses";
  let subtitle: string;

  if (isDaily) {
    if (isWin) {
      subtitle = hasThisGameData
        ? `You solved today's word in ${guessesCount} ${
            guessesCount === 1 ? "guess" : "guesses"
          }.`
        : "You already completed today's Daily.";
    } else {
      subtitle = hasThisGameData
        ? "Better luck tomorrow."
        : "You've already played today's Daily.";
    }
  } else {
    if (isWin) {
      subtitle = hasThisGameData
        ? `You solved it in ${guessesCount} ${
            guessesCount === 1 ? "guess" : "guesses"
          }.`
        : "You solved it.";
    } else {
      subtitle = "Try again!";
    }
  }

  const timeText =
    timeSeconds != null ? formatSeconds(timeSeconds) : undefined;

  const avgTimeText =
    averageTimeSeconds != null ? formatSeconds(averageTimeSeconds) : undefined;

  // Rendered in a native Modal so this always covers the full screen,
  // regardless of the parent play screen's layout. The achievement toast is
  // rendered again as the last child below, inside this same Modal, since a
  // toast mounted only at the parent screen level would otherwise be hidden
  // behind this overlay (native Modals always paint above plain views).
  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="none"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: BG }]}>
      {/* Page header — mirrors the app's other full-screen headers */}
      <View style={[styles.pageHeader, { borderColor: BORDER, paddingTop: insets.top + 10 }]}>
        <View style={styles.headerSpacer} />
        <Text style={[styles.brand, { color: SUBTEXT }]}>FURDLE</Text>
        <Pressable
          style={({ pressed }) => [styles.closeIconButton, { opacity: pressed ? 0.6 : 1 }]}
          onPress={onClose}
          hitSlop={16}
        >
          <X size={22} color={SUBTEXT} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.card}>
        {/* Title + subtitle */}
        <Text style={[styles.title, { color: TEXT }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: SUBTEXT }]}>{subtitle}</Text>

        {/* Solution */}
        <View style={[styles.solutionBox, { borderColor: BORDER }]}>
          <Text style={[styles.solutionLabel, { color: SUBTEXT }]}>Solution</Text>
          <Text style={[styles.solutionWord, { color: TEXT }]}>
            {solutionWord.toUpperCase()}
          </Text>
        </View>

        {/* This game (only if we have real data) */}
        {hasThisGameData && (
          <>
            <View
              style={[styles.divider, { backgroundColor: BORDER, opacity: 0.35 }]}
            />
            <Text style={[styles.sectionTitle, { color: TEXT }]}>This game</Text>
            <View style={styles.statsRow}>
              <StatPill
                label="Guesses"
                value={`${guessesCount}`}
                textColor={TEXT}
                borderColor={BORDER}
                backgroundColor={CARD}
              />
              {timeText ? (
                <StatPill
                  label="Time"
                  value={timeText}
                  textColor={TEXT}
                  borderColor={BORDER}
                  backgroundColor={BG}
                />
              ) : null}
            </View>
          </>
        )}

        {/* Mode stats — NYT-style STATISTICS block */}
        <View style={[styles.divider, { backgroundColor: BORDER, opacity: 0.35 }]} />
        <Text style={[styles.sectionTitle, { color: TEXT }]}>Statistics</Text>

        <View style={styles.bigStatsRow}>
          <BigStat
            value={gamesPlayed != null ? `${gamesPlayed}` : "--"}
            label="Played"
            textColor={TEXT}
            secondaryText={SUBTEXT}
          />
          <BigStat
            value={winPercentage != null ? `${winPercentage}` : "--"}
            label="Win %"
            textColor={TEXT}
            secondaryText={SUBTEXT}
          />
          {isDaily ? (
            <>
              <BigStat
                value={currentStreak != null ? `${currentStreak}` : "--"}
                label={"Current\nStreak"}
                textColor={TEXT}
                secondaryText={SUBTEXT}
              />
              <BigStat
                value={bestStreak != null ? `${bestStreak}` : "--"}
                label={"Max\nStreak"}
                textColor={TEXT}
                secondaryText={SUBTEXT}
              />
            </>
          ) : (
            <>
              <BigStat
                value={bestGuessCount != null ? `${bestGuessCount}` : "--"}
                label={"Best\nGuess"}
                textColor={TEXT}
                secondaryText={SUBTEXT}
              />
              <BigStat
                value={averageGuesses != null ? averageGuesses.toFixed(1) : "--"}
                label={"Avg\nGuesses"}
                textColor={TEXT}
                secondaryText={SUBTEXT}
              />
            </>
          )}
        </View>

        {avgTimeText ? (
          <Text style={[styles.avgTimeNote, { color: SUBTEXT }]}>
            Avg time: {avgTimeText}
          </Text>
        ) : null}

        {guessDistribution ? (
          <>
            <View
              style={[styles.divider, { backgroundColor: BORDER, opacity: 0.35 }]}
            />
            <Text style={[styles.sectionTitle, { color: TEXT }]}>
              Guess Distribution
            </Text>
            <GuessDistributionChart
              distribution={guessDistribution}
              highlightGuess={isWin ? guessesCount : null}
              textColor={TEXT}
              secondaryText={SUBTEXT}
            />
          </>
        ) : null}

        {/* Countdown */}
        {isDaily && nextDailySecondsRemaining != null ? (
          <>
            <View
              style={[styles.divider, { backgroundColor: BORDER, opacity: 0.35 }]}
            />
            <Text style={[styles.countdownLabel, { color: SUBTEXT }]}>
              Next Daily in
            </Text>
            <Text style={[styles.countdownValue, { color: TEXT }]}>
              {formatCountdown(nextDailySecondsRemaining)}
            </Text>
          </>
        ) : null}

        {/* Buttons */}
        <View style={styles.buttonRow}>
          {isDaily ? (
            <PrimaryButton
              label="Main Menu"
              onPress={onGoHome}
              borderColor={BORDER}
              textColor={TEXT}
              backgroundColor={CARD}
              fullWidth
            />
          ) : (
            <>
              <PrimaryButton
                label="Play Again"
                onPress={onPlayAgain}
                borderColor={BORDER}
                textColor={TEXT}
                backgroundColor={CARD}
              />
              <PrimaryButton
                label="Main Menu"
                onPress={onGoHome}
                borderColor={BORDER}
                textColor={TEXT}
                backgroundColor={CARD}
              />
            </>
          )}
        </View>

        {hasThisGameData && (
          <Pressable
            style={({ pressed }) => [styles.shareButton, { opacity: pressed ? 0.75 : 1 }]}
            onPress={handleShare}
          >
            <View style={styles.shareButtonInner}>
              <Share2 size={18} color="#fff" />
              <Text style={styles.shareButtonText}>Share Result</Text>
            </View>
          </Pressable>
        )}

        <WordReportPrompt />
      </View>
      </ScrollView>
      <AchievementPopup
        achievement={achievement}
        onDismiss={onDismissAchievement ?? (() => {})}
        backgroundColor={CARD}
        textColor={TEXT}
      />
      </View>
    </Modal>
  );
};

export default WordleResultOverlay;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerSpacer: {
    width: 22,
  },
  closeIconButton: {
    width: 22,
    alignItems: "flex-end",
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    padding: 8,
  },
  brand: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
  },
  title: {
    textAlign: "center",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 6,
    marginTop: 10,
  },
  subtitle: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
  },
  solutionBox: {
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  solutionLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 4,
  },
  solutionWord: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 2,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 8,
  },
  statPill: {
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 110,
    alignItems: "center",
  },
  statPillLabel: {
    fontSize: 10,
    fontWeight: "800",
    opacity: 0.8,
    marginBottom: 2,
  },
  statPillValue: {
    fontSize: 13,
    fontWeight: "900",
  },
  bigStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  bigStat: {
    flex: 1,
    alignItems: "center",
  },
  bigStatValue: {
    fontSize: 26,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  bigStatLabel: {
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 2,
    lineHeight: 13,
  },
  avgTimeNote: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
  },
  distWrap: {
    marginTop: 2,
  },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  distRowLabel: {
    width: 14,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right",
    marginRight: 6,
  },
  distBarTrack: {
    flex: 1,
    flexDirection: "row",
    height: 18,
  },
  distBarFill: {
    borderRadius: 4,
    minWidth: 22,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 6,
  },
  distBarCount: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  countdownLabel: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4,
    letterSpacing: 1,
  },
  countdownValue: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "center",
    width: "100%",
    gap: 10,
    marginTop: 14,
  },
  primaryButton: {
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 120,
    alignItems: "center",
  },
  primaryButtonFullWidth: {
    width: "100%",
    paddingVertical: 12,
    minWidth: undefined,
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
  },
  shareButton: {
    marginTop: 10,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    backgroundColor: "#22c55e",
  },
  shareButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  shareButtonText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 0.5,
  },
  secondaryButton: {
    marginTop: 10,
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
  },
});
