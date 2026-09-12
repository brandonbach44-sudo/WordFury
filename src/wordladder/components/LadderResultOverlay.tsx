// src/wordladder/components/LadderResultOverlay.tsx
// Matches the shared results/share/stat-pill design language used by
// Wordle's result overlay (brand tag, stat pills, share button, close).

import React from 'react';
import { Share } from 'react-native';

import { useTheme } from '../../shared/ThemeContext';
import { AchievementPopup, AchievementLike } from '../../shared/AchievementPopup';
import { WordReportPrompt } from '../../shared/WordReportPrompt';
import { getGolfTerm } from '../utils/golfTerms';
import { ResultsScreen } from '../../shared/ResultsScreen';

type Props = {
  visible: boolean;
  mode: 'daily' | 'practice';
  status: 'won' | 'gave_up';
  startWord: string;
  endWord: string;
  steps: number;
  par: number;
  timeSeconds: number | null;
  hintsUsed: number;
  currentStreak: number | null;
  bestStreak: number | null;
  nextDailySecondsRemaining?: number | null;
  shareText?: string;
  onClose: () => void;
  onPlayAgain: () => void;
  onGoHome: () => void;
  // Achievement toast to render inside this Modal (see AchievementPopup —
  // native Modals always render above plain views, so a toast mounted only
  // at the parent screen level would be hidden behind this overlay whenever
  // both are visible at once, e.g. finishing the puzzle unlocks something).
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

const LadderResultOverlay: React.FC<Props> = ({
  visible,
  mode,
  status,
  startWord,
  endWord,
  steps,
  par,
  timeSeconds,
  hintsUsed,
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

  // Rendered in a native Modal (instead of a plain absolutely-positioned
  // View) so the results screen always covers the full device screen and
  // always sits above everything else — including the achievement toast —
  // regardless of how the parent play screen is laid out. A plain absolute
  // View here was found to sometimes only cover part of the screen and let
  // the close (X) button end up under other content where taps didn't
  // register.
  const overPar = steps - par;
  const vsPar = !isWin ? '\u2014' : overPar === 0 ? 'E' : `+${overPar}`;

  return (
    <>
      <ResultsScreen
        visible={visible}
        gameName="WORD LADDER"
        onClose={onClose}
        title={title}
        subtitle={subtitle}
        badge={`${startWord.toUpperCase()} \u2192 ${endWord.toUpperCase()}`}
        cells={[
          { label: 'STEPS', value: isWin ? `${steps}` : '\u2014' },
          { label: 'TIME', value: timeSeconds != null ? formatSeconds(timeSeconds) : '\u2014' },
          { label: 'VS PAR', value: vsPar, headline: true },
        ]}
        groups={[
          {
            caption: 'THIS ROUND',
            rows: [
              { label: 'Result', value: isWin ? golfTerm : 'Gave up' },
              { label: 'Steps taken', value: isWin ? `${steps}` : '\u2014' },
              { label: 'Par', value: `${par}` },
              ...(timeSeconds != null
                ? [{ label: 'Time', value: formatSeconds(timeSeconds) }]
                : []),
              ...(hintsUsed > 0
                ? [{ label: 'Hints used', value: `${hintsUsed}`, tone: 'warn' as const }]
                : []),
            ],
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
        extra={<WordReportPrompt />}
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

export default LadderResultOverlay;
