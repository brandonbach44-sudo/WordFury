import React from "react";
import { Share, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../shared/ThemeContext";
import { AchievementPopup, AchievementLike } from "../../shared/AchievementPopup";
import { ResultsScreen, Card, WordTiles, Caption, type PillTriple, type LifetimeSpec } from "../../shared/ResultsScreen";
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
  winPercentage: number | null;
  bestGuessCount: number | null;
  guessDistribution: Record<number, number> | null;
  // Quick Play's results screen shows this instead of a daily streak, which
  // doesn't apply outside the Daily.
  sessionRecord: { wins: number; losses: number };
  onClose: () => void;
  onPlayAgain: () => void;
  onGoHome: () => void;
  onGoPractice: () => void;
  nextDailySecondsRemaining?: number | null;
  shareText?: string;
  evaluationRows?: CellState[][];
  // Achievement toast to render inside this Modal — see AchievementPopup.
  achievements?: AchievementLike[];
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

const WordleResultOverlay = ({
  visible,
  mode,
  status,
  solutionWord,
  guessesCount,
  timeSeconds,
  currentStreak,
  winPercentage,
  bestGuessCount,
  guessDistribution,
  sessionRecord,
  onClose,
  onPlayAgain,
  onGoHome,
  onGoPractice,
  nextDailySecondsRemaining,
  shareText,
  evaluationRows,
  achievements = [],
  onDismissAchievement,
}: Props) => {
  const { background } = useTheme();

  const isDaily = mode === "daily";
  const isWin = status === "won";
  const hasThisGameData = guessesCount > 0 || timeSeconds != null;

  const handleShare = async () => {
    try {
      const text = shareText && shareText.length > 0
        ? shareText
        : `Furdle ${isWin ? `${guessesCount}/6` : "X/6"}`;
      await Share.share({ message: text });
    } catch (e) {
      console.warn("Share failed", e);
    }
  };
  const TEXT = background.textColor ?? "#111827";
  const SUBTEXT = background.secondaryText ?? "#6b7280";
  const CARD = background.cardColor ?? "#ffffff";

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

  const badge = isDaily ? undefined : ["Quick Play"];

  // No hero number for a loss (see below) or for Quick Play, where the
  // streak this tracks is a Daily-only concept -- currentStreak is null
  // whenever this isn't a Daily win, same guard the legacy cells used.
  const hero = currentStreak != null && isWin ? { label: "Streak", value: `${currentStreak}` } : undefined;

  const pills: PillTriple = [
    { label: "Guesses", value: hasThisGameData ? (isWin ? `${guessesCount}/6` : "X/6") : "—" },
    { label: "Time", value: timeText ?? "—" },
    !isDaily
      ? { label: "Record", value: `${sessionRecord.wins}-${sessionRecord.losses}` }
      : isWin
        ? { label: "Best", value: bestGuessCount != null ? `${bestGuessCount}` : "—" }
        : { label: "Streak", value: `${currentStreak ?? 0}` },
  ];

  // The solved word gets its own tile card rather than the badge, which no
  // longer carries it (see docs/RESULTS_SCREEN_V2.md). A loss shows the same
  // tiles outlined instead of filled, plus how close the best guess came.
  const bestGuessCorrect = !isWin && evaluationRows && evaluationRows.length > 0
    ? Math.max(...evaluationRows.map((row) => row.filter((c) => c === "correct").length))
    : 0;
  const signature = solutionWord ? (
    <Card padding={16} style={styles.signatureCard}>
      <WordTiles word={solutionWord.toUpperCase()} solved={isWin} />
      {!isWin && evaluationRows && evaluationRows.length > 0 && (
        <Text style={[styles.nearMissText, { color: SUBTEXT }]}>
          Your closest guess had {bestGuessCorrect} of {solutionWord.length} letters right.
        </Text>
      )}
    </Card>
  ) : undefined;

  // Games Played and Best Streak come out here -- Win Rate is the one number
  // not trivially recomputed elsewhere, and Current Streak is what carries
  // weight right after finishing. The full archive stays on the stats page.
  const lifetime: LifetimeSpec | undefined = winPercentage != null || currentStreak != null || bestGuessCount != null
    ? {
        pills: [
          { label: "Win Rate", value: winPercentage != null ? `${winPercentage}%` : "—" },
          { label: "Streak", value: `${currentStreak ?? 0}` },
          { label: "Best Solve", value: bestGuessCount != null ? `${bestGuessCount}` : "—" },
        ],
      }
    : undefined;

  // The guess distribution is always visible on the Daily, never behind a
  // toggle -- Quick Play never shows it at all (a distribution of quick-play
  // rounds carries little meaning, and it overflowed into the buttons the
  // one time it was tried).
  const distribution = isDaily && guessDistribution ? (
    <View style={styles.distSection}>
      <Caption>Guess Distribution</Caption>
      <GuessDistributionChart
        distribution={guessDistribution}
        highlightGuess={isWin ? guessesCount : null}
        textColor={TEXT}
        secondaryText={SUBTEXT}
      />
    </View>
  ) : null;

  const commonProps = {
    visible,
    gameName: "FURDLE",
    onClose,
    title,
    subtitle,
    badge,
    hero,
    pills,
    signature,
    lifetime,
    extra: (
      <>
        {distribution}
        <WordReportPrompt />
      </>
    ),
    onMainMenu: onGoHome,
    onShare: hasThisGameData ? handleShare : undefined,
    shareLabel: "Share Result",
  };

  // Rendered in a native Modal so this always covers the full screen,
  // regardless of the parent play screen's layout. The achievement toast is
  // rendered again as the last child below, inside this same Modal, since a
  // toast mounted only at the parent screen level would otherwise be hidden
  // behind this overlay (native Modals always paint above plain views).
  return (
    <>
      {isDaily ? (
        <ResultsScreen
          {...commonProps}
          countdown={
            nextDailySecondsRemaining != null
              ? { label: "Next daily in", value: formatCountdown(nextDailySecondsRemaining) }
              : undefined
          }
        />
      ) : (
        <ResultsScreen {...commonProps} onPlayAgain={onPlayAgain} />
      )}
      <AchievementPopup
        achievements={achievements}
        onDismiss={onDismissAchievement ?? (() => {})}
        backgroundColor={CARD}
        textColor={TEXT}
      />
    </>
  );
};

export default WordleResultOverlay;

const styles = StyleSheet.create({
  signatureCard: { marginTop: 16, alignItems: "center" },
  nearMissText: { fontSize: 13, fontWeight: "600", marginTop: 10, textAlign: "center" },
  distSection: { alignItems: "center", width: "100%" },
  distWrap: {
    marginTop: 8,
    width: "100%",
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
});
