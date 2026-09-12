import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../shared/ThemeContext";
import { AchievementPopup, AchievementLike } from "../../shared/AchievementPopup";
import { ResultsScreen } from "../../shared/ResultsScreen";
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
  const TEXT = background.textColor ?? "#111827";
  const SUBTEXT = background.secondaryText ?? "#6b7280";
  const BORDER = background.borderColor ?? "#e5e7eb";
  const CARD = background.cardColor ?? "#ffffff";

  const [showDistribution, setShowDistribution] = useState(false);
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
    <>
      <ResultsScreen
        visible={visible}
        gameName="FURDLE"
        onClose={onClose}
        title={title}
        subtitle={subtitle}
        badge={solutionWord ? solutionWord.toUpperCase() : undefined}
        cells={[
          {
            label: 'GUESSES',
            value: hasThisGameData ? (isWin ? `${guessesCount}/6` : 'X/6') : '\u2014',
          },
          { label: 'TIME', value: timeText ?? '\u2014' },
          {
            label: 'STREAK',
            value: currentStreak != null ? `${currentStreak}` : '\u2014',
            headline: true,
          },
        ]}
        groups={[
          ...(hasThisGameData
            ? [{
                caption: 'THIS GAME',
                rows: [
                  { label: 'Result', value: isWin ? 'Solved' : 'Out of guesses',
                    tone: (isWin ? 'good' : 'warn') as 'good' | 'warn' },
                  ...(timeText ? [{ label: 'Time', value: timeText }] : []),
                ],
              }]
            : []),
          {
            caption: 'ALL TIME',
            rows: [
              ...(winPercentage != null ? [{ label: 'Win rate', value: `${winPercentage}%` }] : []),
              ...(gamesPlayed != null ? [{ label: 'Games played', value: `${gamesPlayed}` }] : []),
              ...(bestGuessCount != null
                ? [{ label: 'Best solve', value: `${bestGuessCount} ${bestGuessCount === 1 ? 'guess' : 'guesses'}` }]
                : []),
              ...(averageGuesses != null
                ? [{ label: 'Average guesses', value: averageGuesses.toFixed(1) }]
                : []),
              ...(avgTimeText ? [{ label: 'Average time', value: avgTimeText }] : []),
              ...(bestStreak != null
                ? [{ label: 'Best streak', value: `${bestStreak} ${bestStreak === 1 ? 'day' : 'days'}` }]
                : []),
            ],
          },
        ]}
        countdown={
          isDaily && nextDailySecondsRemaining != null
            ? { label: 'NEXT DAILY IN', value: formatCountdown(nextDailySecondsRemaining) }
            : null
        }
        extra={
          <>
            {guessDistribution ? (
              <View style={{ marginTop: 22 }}>
                <Pressable
                  onPress={() => setShowDistribution((v) => !v)}
                  style={({ pressed }) => [
                    styles.chartToggle,
                    { borderColor: BORDER, backgroundColor: CARD, opacity: pressed ? 0.75 : 1 },
                  ]}
                >
                  <Text style={[styles.chartToggleText, { color: TEXT }]}>
                    {showDistribution ? 'Hide guess distribution' : 'Show guess distribution'}
                  </Text>
                </Pressable>
                {showDistribution && (
                  <View style={{ marginTop: 10 }}>
                    <GuessDistributionChart
                      distribution={guessDistribution}
                      highlightGuess={isWin ? guessesCount : null}
                      textColor={TEXT}
                      secondaryText={SUBTEXT}
                    />
                  </View>
                )}
              </View>
            ) : null}
            <WordReportPrompt />
          </>
        }
        onMainMenu={onGoHome}
        onPlayAgain={isDaily ? undefined : onPlayAgain}
        onShare={hasThisGameData ? handleShare : undefined}
        shareLabel="Share Result"
      />
      <AchievementPopup
        achievement={achievement}
        onDismiss={onDismissAchievement ?? (() => {})}
        backgroundColor={CARD}
        textColor={TEXT}
      />
    </>
  );
};

export default WordleResultOverlay;

const styles = StyleSheet.create({
  chartToggle: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  chartToggleText: { fontSize: 14, fontWeight: "800" },
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
});
