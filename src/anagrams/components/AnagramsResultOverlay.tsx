// src/anagrams/components/AnagramsResultOverlay.tsx
// Matches the shared results/share/stat-pill design language used by
// Wordle / Word Ladder's result overlays (brand tag, stat pills, share
// button, close).

import React from 'react';
import { Modal, Share } from 'react-native';

import { useTheme } from '../../shared/ThemeContext';
import { AchievementPopup, AchievementLike } from '../../shared/AchievementPopup';
import { ResultsScreen } from '../../shared/ResultsScreen';
import type { RoundResult } from '../utils/scoring';

type Props = {
  visible: boolean;
  mode: 'daily' | 'practice';
  words: string[];
  roundResults: RoundResult[];
  totalScore: number;
  perfectBonusApplied: boolean;
  timeSeconds: number;
  currentStreak: number | null;
  bestStreak: number | null;
  nextDailySecondsRemaining?: number | null;
  shareText?: string;
  onClose: () => void;
  onPlayAgain: () => void;
  onGoHome: () => void;
  // Achievement toast to render inside this Modal — see AchievementPopup.
  achievement?: AchievementLike | null;
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
  currentStreak,
  bestStreak,
  nextDailySecondsRemaining,
  shareText,
  onClose,
  onPlayAgain,
  onGoHome,
  achievement = null,
  onDismissAchievement,
}) => {
  const { background } = useTheme();

  const handleShare = async () => {
    try {
      const text = shareText && shareText.length > 0 ? shareText : `Anagrams — Score ${totalScore}`;
      await Share.share({ message: text });
    } catch (e) {
      console.warn('Share failed', e);
    }
  };
  const TEXT = background.textColor ?? '#111827';
  const CARD = background.cardColor ?? '#ffffff';

  const isDaily = mode === 'daily';
  const wordsSolved = roundResults.filter((r) => r.solved && !r.skipped).length;
  const allSolved = wordsSolved === roundResults.length && roundResults.length > 0;

  const title = perfectBonusApplied ? 'Perfect Run!' : allSolved ? 'Nice Work!' : 'Run Complete';
  const subtitle = perfectBonusApplied
    ? `All ${roundResults.length} words, zero hints — flawless.`
    : `You solved ${wordsSolved}/${roundResults.length} words.`;

  // Rendered in a native Modal so this always covers the full screen,
  // regardless of the parent play screen's layout. The achievement toast is
  // rendered again as the last child below, inside this same Modal, since a
  // toast mounted only at the parent screen level would otherwise be hidden
  // behind this overlay (native Modals always paint above plain views).
  return (
    <>
      <ResultsScreen
        visible={visible}
        gameName="ANAGRAMS"
        onClose={onClose}
        title={title}
        subtitle={subtitle}
        badge={perfectBonusApplied ? 'Perfect run bonus' : undefined}
        cells={[
          { label: 'SOLVED', value: `${wordsSolved}/${roundResults.length}` },
          { label: 'TIME', value: formatSeconds(timeSeconds) },
          { label: 'SCORE', value: `${totalScore}`, headline: true },
        ]}
        groups={[
          {
            // The word list reads better as tally rows than as a boxed list:
            // one line per word, the outcome where the value goes.
            caption: 'THE WORDS',
            rows: words.map((w, i) => {
              const result = roundResults[i];
              const solved = result?.solved && !result?.skipped;
              return {
                label: w.toUpperCase(),
                value: solved ? 'Solved' : result?.skipped ? 'Skipped' : 'Missed',
                tone: (solved ? 'good' : 'default') as 'good' | 'default',
              };
            }),
          },
          ...(currentStreak != null || bestStreak != null
            ? [{
                caption: 'STREAK',
                rows: [
                  ...(currentStreak != null
                    ? [{ label: 'Current', value: `${currentStreak} ${currentStreak === 1 ? 'day' : 'days'}` }]
                    : []),
                  ...(bestStreak != null
                    ? [{ label: 'Best', value: `${bestStreak} ${bestStreak === 1 ? 'day' : 'days'}` }]
                    : []),
                ],
              }]
            : []),
        ]}
        countdown={
          isDaily && nextDailySecondsRemaining != null
            ? { label: 'NEXT DAILY IN', value: formatCountdown(nextDailySecondsRemaining) }
            : null
        }
        onMainMenu={onGoHome}
        onPlayAgain={isDaily ? undefined : onPlayAgain}
        onShare={handleShare}
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

export default AnagramsResultOverlay;
