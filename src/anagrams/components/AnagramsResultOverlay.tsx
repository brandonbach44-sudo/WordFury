// src/anagrams/components/AnagramsResultOverlay.tsx
// Matches the shared results/share/stat-pill design language used by
// Wordle / Word Ladder's result overlays (brand tag, stat pills, share
// button, close).

import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../shared/ThemeContext';
import { AchievementPopup, AchievementLike } from '../../shared/AchievementPopup';
import { ResultsScreen, Card, withOpacity, type PillTriple, type LifetimeSpec } from '../../shared/ResultsScreen';
import { accentForGame } from '../../shared/gameColors';
import type { RoundResult } from '../utils/scoring';

export interface AnagramsLifetimeStats {
  bestScore: number;
  gamesPlayed: number;
  currentStreak: number;
  bestStreak: number;
  perfectRuns: number;
}

type Props = {
  visible: boolean;
  mode: 'daily' | 'practice';
  // What to show for each round: the word the player typed when solved,
  // the target answer when missed.
  words: string[];
  roundResults: RoundResult[];
  totalScore: number;
  perfectBonusApplied: boolean;
  timeSeconds: number;
  // Rounds finished this sitting. Not meaningful on Daily, where at most one
  // run is ever played.
  roundsThisSession?: number;
  lifetimeStats: AnagramsLifetimeStats | null;
  nextDailySecondsRemaining?: number | null;
  shareText?: string;
  onClose: () => void;
  onPlayAgain: () => void;
  onGoHome: () => void;
  // Achievement toast to render inside this Modal — see AchievementPopup.
  achievements?: AchievementLike[];
  onDismissAchievement?: () => void;
};

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

const AnagramsResultOverlay: React.FC<Props> = ({
  visible,
  mode,
  words,
  roundResults,
  totalScore,
  perfectBonusApplied,
  timeSeconds,
  roundsThisSession = 0,
  lifetimeStats,
  nextDailySecondsRemaining,
  shareText,
  onClose,
  onPlayAgain,
  onGoHome,
  achievements = [],
  onDismissAchievement,
}) => {
  const { background, colorBlindMode } = useTheme();

  const handleShare = async () => {
    try {
      const text = shareText && shareText.length > 0 ? shareText : `Anagrams, Score ${totalScore}`;
      await Share.share({ message: text });
    } catch (e) {
      console.warn('Share failed', e);
    }
  };
  const TEXT = background.textColor ?? '#111827';
  const CARD = background.cardColor ?? '#ffffff';

  const isDaily = mode === 'daily';
  const wordsSolved = roundResults.filter((r) => r.solved && !r.skipped).length;
  const missed = roundResults.length - wordsSolved;
  const allSolved = wordsSolved === roundResults.length && roundResults.length > 0;

  const title = perfectBonusApplied ? 'Perfect Run!' : allSolved ? 'Nice Work!' : 'Run Complete';
  const subtitle = perfectBonusApplied
    ? `All ${roundResults.length} words, zero hints, flawless.`
    : `You solved ${wordsSolved}/${roundResults.length} words.`;

  const badge = [
    ...(isDaily ? [] : ['Quick Play']),
    ...(perfectBonusApplied ? ['Perfect Run Bonus'] : []),
  ];

  const pills: PillTriple = isDaily
    ? [
        { label: 'Solved', value: `${wordsSolved}` },
        { label: 'Missed', value: `${missed}` },
        { label: 'Time', value: formatSeconds(timeSeconds) },
      ]
    : [
        { label: 'Solved', value: `${wordsSolved}` },
        { label: 'Missed', value: `${missed}` },
        // Quick Play has no daily streak to show, so the third pill is this
        // sitting's round count instead.
        { label: 'Rounds', value: `${roundsThisSession}` },
      ];

  // Every round's word in order. "Longest Find" used to sit here, but the
  // round 5 word always has the most letters, so it only ever repeated the
  // final word. The recap shows the whole run instead: solved words in the
  // Anagrams accent, missed words grey with the answer, and an amber dot for
  // a hint (the same yellow the share grid uses). Chips rather than 5 rows of
  // letter tiles, which do not fit a 375x667 screen alongside the hero,
  // pills and lifetime row. Solved chips are tinted, not filled, so this
  // does not turn into a row of highlighted chips, and missed chips are
  // dashed so the two read apart without colour.
  const accent = accentForGame('anagrams', colorBlindMode);
  const signature = roundResults.length > 0 ? (
    <Card padding={16} style={recapStyles.card}>
      <Text style={[recapStyles.caption, { color: background.secondaryText }]}>YOUR WORDS</Text>
      <View style={recapStyles.chipWrap}>
        {roundResults.map((r, i) => {
          const word = (words[i] ?? '').toUpperCase();
          const solved = r.solved && !r.skipped;
          const hinted = r.hintsUsed > 0;
          return (
            <View
              key={i}
              style={[
                recapStyles.chip,
                solved
                  ? { backgroundColor: withOpacity(accent, 0.14), borderColor: accent }
                  : { borderColor: withOpacity(background.secondaryText, 0.6), borderStyle: 'dashed' },
              ]}
              accessible
              accessibilityLabel={`Round ${i + 1}, ${word}, ${solved ? 'solved' : 'missed'}${hinted ? ', hint used' : ''}`}
            >
              <Text
                style={[recapStyles.chipText, { color: solved ? background.textColor : background.secondaryText }]}
                numberOfLines={1}
              >
                {word}
              </Text>
              {hinted && <View style={recapStyles.hintDot} />}
            </View>
          );
        })}
      </View>
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
              { label: 'Best Score', value: `${lifetimeStats.bestScore}` },
              { label: 'Games', value: `${lifetimeStats.gamesPlayed}` },
              { label: 'Perfect Runs', value: `${lifetimeStats.perfectRuns}` },
            ],
      }
    : undefined;

  const commonProps = {
    visible,
    gameName: 'ANAGRAMS',
    onClose,
    title,
    subtitle,
    badge: badge.length > 0 ? badge : undefined,
    hero: { label: 'Score', value: `${totalScore}` },
    pills,
    signature,
    lifetime,
    onMainMenu: onGoHome,
    onShare: handleShare,
    shareLabel: 'Share Result',
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

const recapStyles = StyleSheet.create({
  card: { marginTop: 16, alignItems: 'center' },
  caption: { fontSize: 10, fontWeight: '800', letterSpacing: 2.2, textTransform: 'uppercase', marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  // Same metrics as the shared Chip (radius 999, 5 / 11 padding, 12px / 800).
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1.5,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  chipText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  hintDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b', marginLeft: 5 },
});

export default AnagramsResultOverlay;
