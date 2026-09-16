import React from 'react';

import { useTheme } from '../../shared/ThemeContext';
import { ResultsScreen, type PillTriple } from '../../shared/ResultsScreen';
import { AchievementPopup, AchievementLike } from '../../shared/AchievementPopup';
import { buildHangmanShareText, useCountdownToMidnight } from '../utils/dailyChallenge';
import { HangmanSignature } from './HangmanSignature';

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
  achievements?: AchievementLike[];
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
  achievements = [],
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

  const pills: PillTriple = [
    { label: 'Misses', value: `${incorrectCount}/${maxAttempts}` },
    { label: 'Lives', value: `${maxAttempts - incorrectCount}` },
    { label: 'Best', value: `${bestStreak}` },
  ];

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
        badge={[category]}
        hero={{ label: 'Streak', value: `${streak}` }}
        pills={pills}
        signature={<HangmanSignature word={word} solved={won} incorrectGuesses={incorrectCount} maxAttempts={maxAttempts} />}
        countdown={{ label: 'Next daily in', value: countdown }}
        onMainMenu={onBackToMenu}
        onShare={handleShare}
        shareLabel="Share Result"
      />
      <AchievementPopup
        achievements={achievements}
        onDismiss={onDismissAchievement ?? (() => {})}
        backgroundColor={CARD}
        textColor={TEXT}
      />
    </>
  );
};
