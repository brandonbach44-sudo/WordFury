import React from 'react';

import { useTheme } from '../../shared/ThemeContext';
import { ResultsScreen } from '../../shared/ResultsScreen';
import { AchievementPopup, AchievementLike } from '../../shared/AchievementPopup';
import { buildHangmanShareText, useCountdownToMidnight } from '../utils/dailyChallenge';

type Props = {
  visible: boolean;
  won: boolean;
  word: string;
  category: string;
  streak: number;
  bestStreak: number;
  incorrectCount: number;
  maxAttempts: number;
  onBackToMenu: () => void;
  onClose: () => void;
  // Achievement toast to render inside this Modal — see AchievementPopup.
  achievement?: AchievementLike | null;
  onDismissAchievement?: () => void;
};

export const DailyChallengePopup: React.FC<Props> = ({
  visible,
  won,
  word,
  category,
  streak,
  bestStreak,
  incorrectCount,
  maxAttempts,
  onBackToMenu,
  onClose,
  achievement = null,
  onDismissAchievement,
}) => {
  const { background } = useTheme();
  const countdown = useCountdownToMidnight();
  const TEXT = background.textColor ?? '#111827';
  const CARD = background.cardColor ?? '#ffffff';

  const title = won ? 'Nice!' : 'Better luck tomorrow';
  const subtitle = won
    ? `You guessed it with ${incorrectCount}/${maxAttempts} wrong guesses.`
    : "Better luck next time!";

  const handleShare = async () => {
    const message = buildHangmanShareText({
      isDaily: true,
      won,
      incorrectCount,
      maxAttempts,
      category,
      streak,
    });
    try {
      const { Share } = require('react-native');
      await Share.share({ message });
    } catch (e) {}
  };

  // Rendered in a native Modal so this always covers the full screen,
  // regardless of the parent play screen's layout. The achievement toast is
  // rendered again as the last child below, inside this same Modal, since a
  // toast mounted only at the parent screen level would otherwise be hidden
  // behind this overlay (native Modals always paint above plain views).
  return (
    <>
      <ResultsScreen
        visible={visible}
        gameName="HANGMAN"
        onClose={onClose}
        title={title}
        subtitle={subtitle}
        badge={category}
        cells={[
          { label: 'MISSES', value: `${incorrectCount}/${maxAttempts}` },
          { label: 'WORD', value: word.toUpperCase() },
          { label: 'STREAK', value: `${streak}`, headline: true },
        ]}
        groups={[
          {
            caption: 'THIS GAME',
            rows: [
              { label: 'Result', value: won ? 'Solved' : 'Lost',
                tone: (won ? 'good' : 'warn') as 'good' | 'warn' },
              { label: 'Word', value: word.toUpperCase() },
              { label: 'Category', value: category },
              { label: 'Wrong guesses', value: `${incorrectCount} of ${maxAttempts}` },
            ],
          },
          {
            caption: 'DAILY STREAK',
            rows: [
              { label: 'Current', value: `${streak} ${streak === 1 ? 'day' : 'days'}` },
              { label: 'Best', value: `${bestStreak} ${bestStreak === 1 ? 'day' : 'days'}` },
            ],
          },
        ]}
        countdown={{ label: 'NEXT DAILY IN', value: countdown }}
        onMainMenu={onBackToMenu}
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
