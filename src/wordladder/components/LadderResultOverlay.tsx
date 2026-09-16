// src/wordladder/components/LadderResultOverlay.tsx
// Matches the shared results/share/stat-pill design language used by
// Wordle's result overlay (brand tag, stat pills, share button, close).

import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../shared/ThemeContext';
import { AchievementPopup, AchievementLike } from '../../shared/AchievementPopup';
import { WordReportPrompt } from '../../shared/WordReportPrompt';
import { getGolfTerm } from '../utils/golfTerms';
import { ResultsScreen, Card, type PillTriple, type LifetimeSpec } from '../../shared/ResultsScreen';

export interface LadderLifetimeStats {
  gamesPlayed: number;
  currentStreak: number;
  bestStreak: number;
  bestStepsOverPar: number | null;
  fastestTimeSeconds: number | null;
}

type Props = {
  visible: boolean;
  mode: 'daily' | 'practice';
  status: 'won' | 'gave_up';
  startWord: string;
  endWord: string;
  // The full climbed path, start word first. Used for the signature card's
  // rung-by-rung recap -- see diffIndex below for the changed-letter highlight.
  chain: string[];
  steps: number;
  par: number;
  timeSeconds: number | null;
  hintsUsed: number;
  lifetimeStats: LadderLifetimeStats | null;
  nextDailySecondsRemaining?: number | null;
  shareText?: string;
  onClose: () => void;
  onPlayAgain: () => void;
  onGoHome: () => void;
  // Achievement toast to render inside this Modal (see AchievementPopup —
  // native Modals always render above plain views, so a toast mounted only
  // at the parent screen level would be hidden behind this overlay whenever
  // both are visible at once, e.g. finishing the puzzle unlocks something).
  achievements?: AchievementLike[];
  onDismissAchievement?: () => void;
};

function buildTiles(word: string, length: number): string[] {
  const padded = word.toUpperCase().padEnd(length, ' ');
  return padded.slice(0, length).split('');
}

function diffIndex(a: string, b: string): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return i;
  }
  return -1;
}

function formatVsPar(stepsOverPar: number | null): string {
  if (stepsOverPar == null) return '-';
  return stepsOverPar === 0 ? 'E' : `+${stepsOverPar}`;
}

function formatSeconds(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${sec.toString().padStart(2, '0')}s`;
}

const LadderResultOverlay: React.FC<Props> = ({
  visible,
  mode,
  status,
  startWord,
  endWord,
  chain,
  steps,
  par,
  timeSeconds,
  hintsUsed,
  lifetimeStats,
  nextDailySecondsRemaining,
  shareText,
  onClose,
  onPlayAgain,
  onGoHome,
  achievements = [],
  onDismissAchievement,
}) => {
  const { background } = useTheme();

  const handleShare = async () => {
    try {
      const text =
        shareText && shareText.length > 0
          ? shareText
          : `Word Ladder ${startWord.toUpperCase()} → ${endWord.toUpperCase()}`;
      await Share.share({ message: text });
    } catch (e) {
      console.warn('Share failed', e);
    }
  };
  const TEXT = background.textColor ?? '#111827';
  const CARD = background.cardColor ?? '#ffffff';
  const BORDER = background.borderColor ?? '#e5e7eb';

  const isDaily = mode === 'daily';
  const isWin = status === 'won';

  // Golf scoring relative to par (the shortest possible path) — since par
  // is by definition the minimum, a finished ladder can only land exactly
  // on par or over it, never under, so this only ever surfaces "Par",
  // "Bogey", "Double Bogey", etc. in practice.
  const golfTerm = getGolfTerm(steps, par);

  const title = isWin ? `${golfTerm}!` : 'Ladder Revealed';
  const subtitle = isWin
    ? `You reached ${endWord.toUpperCase()} in ${steps} step${steps === 1 ? '' : 's'} (par ${par}).`
    : `You gave up — the shortest path took ${par} step${par === 1 ? '' : 's'}.`;

  const overPar = steps - par;
  const badge = [
    ...(isDaily ? [] : ['Quick Play']),
    `${startWord.toUpperCase()} → ${endWord.toUpperCase()}`,
  ];
  const vsPar = !isWin ? '\u2014' : overPar === 0 ? 'E' : `+${overPar}`;

  const pills: PillTriple = [
    { label: 'Steps', value: isWin ? `${steps}` : '\u2014' },
    { label: 'Par', value: `${par}` },
    { label: 'Time', value: timeSeconds != null ? formatSeconds(timeSeconds) : '\u2014' },
  ];

  const wordLength = startWord.length;
  const signature = chain.length > 0 ? (
    <Card padding={16} style={ladderRackStyles.card}>
      {chain.map((word, i) => {
        const prev = i > 0 ? chain[i - 1] : null;
        const changed = prev ? diffIndex(prev, word) : -1;
        return (
          <View key={`${word}-${i}`} style={ladderRackStyles.row}>
            {buildTiles(word, wordLength).map((letter, ci) => (
              <View
                key={ci}
                style={[
                  ladderRackStyles.tile,
                  { borderColor: ci === changed ? '#4ecca3' : BORDER },
                  ci === changed && ladderRackStyles.tileChanged,
                ]}
              >
                <Text style={[ladderRackStyles.tileText, { color: TEXT }]}>{letter.trim()}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </Card>
  ) : undefined;

  const lifetime: LifetimeSpec | undefined = lifetimeStats
    ? {
        pills: isDaily
          ? [
              { label: 'Streak', value: `${lifetimeStats.currentStreak}` },
              { label: 'Best Streak', value: `${lifetimeStats.bestStreak}` },
              { label: 'Games', value: `${lifetimeStats.gamesPlayed}` },
            ]
          : [
              { label: 'Best', value: formatVsPar(lifetimeStats.bestStepsOverPar) },
              {
                label: 'Fastest',
                value: lifetimeStats.fastestTimeSeconds != null ? formatSeconds(lifetimeStats.fastestTimeSeconds) : '\u2014',
              },
              { label: 'Games', value: `${lifetimeStats.gamesPlayed}` },
            ],
      }
    : undefined;

  const commonProps = {
    visible,
    gameName: 'WORD LADDER',
    onClose,
    title,
    subtitle,
    badge,
    hero: {
      label: 'vs Par',
      value: vsPar,
      note: hintsUsed > 0 ? `${hintsUsed} hint${hintsUsed === 1 ? '' : 's'} used` : undefined,
    },
    pills,
    signature,
    lifetime,
    extra: <WordReportPrompt />,
    onMainMenu: onGoHome,
    onShare: handleShare,
    shareLabel: 'Share Result',
  };

  // Rendered in a native Modal (instead of a plain absolutely-positioned
  // View) so the results screen always covers the full device screen and
  // always sits above everything else — including the achievement toast —
  // regardless of how the parent play screen is laid out. A plain absolute
  // View here was found to sometimes only cover part of the screen and let
  // the close (X) button end up under other content where taps didn't
  // register.
  return (
    <>
      {isDaily ? (
        <ResultsScreen
          {...commonProps}
          countdown={
            nextDailySecondsRemaining != null
              ? { label: 'Next daily in', value: formatCountdown(nextDailySecondsRemaining) }
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

const ladderRackStyles = StyleSheet.create({
  card: { marginTop: 16, alignItems: 'center' },
  row: { flexDirection: 'row', gap: 4, marginTop: 4 },
  tile: {
    width: 26,
    height: 30,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileChanged: { borderWidth: 2 },
  tileText: { fontSize: 13, fontWeight: '900' },
});

export default LadderResultOverlay;
