import React from 'react';
import { Share } from 'react-native';
import { useTheme } from '../../shared/ThemeContext';
import { ResultsScreen, type PillTriple } from '../../shared/ResultsScreen';
import { AchievementPopup, AchievementLike } from '../../shared/AchievementPopup';
import { buildHangmanShareText } from '../utils/dailyChallenge';
import { HangmanSignature } from './HangmanSignature';

type GameStatusProps = {
  isVisible: boolean;
  isWon: boolean;
  word: string;
  category: string;
  incorrectGuesses: number;
  totalGuesses: number;
  maxAttempts?: number;
  // Win streak across every mode (see HangmanStats.currentStreak) -- this is
  // not a daily-only figure, unlike most other games' streaks.
  currentStreak: number;
  onPlayAgain: () => void;
  onBackToMenu: () => void;
  onClose: () => void;
  // Achievement toast to render inside this Modal — see AchievementPopup.
  achievements?: AchievementLike[];
  onDismissAchievement?: () => void;
};

export const GameStatus: React.FC<GameStatusProps> = ({
  isVisible,
  isWon,
  word,
  category,
  incorrectGuesses,
  totalGuesses,
  maxAttempts = 6,
  currentStreak,
  onPlayAgain,
  onBackToMenu,
  onClose,
  achievements = [],
  onDismissAchievement,
}) => {
  const { background } = useTheme();

  if (!isVisible) return null;
  const TEXT = background.textColor ?? '#111827';
  const CARD = background.cardColor ?? '#ffffff';

  const handleShare = async () => {
    try {
      // Quick Play categories are randomly picked each game, not a shared
      // daily puzzle, so revealing the word here is safe (unlike Daily).
      const text = buildHangmanShareText({
        isDaily: false,
        won: isWon,
        incorrectCount: incorrectGuesses,
        maxAttempts,
        category,
        word,
      });
      await Share.share({ message: text });
    } catch (e) {
      console.warn('Share failed', e);
    }
  };

  const title = isWon ? 'You Got It!' : 'Game Over';
  const subtitle = isWon
    ? `You guessed it with ${incorrectGuesses}/${maxAttempts} wrong guesses.`
    : `The word was revealed below.`;

  const pills: PillTriple = [
    { label: 'Misses', value: `${incorrectGuesses}/${maxAttempts}` },
    { label: 'Lives', value: `${maxAttempts - incorrectGuesses}` },
    // No daily streak to show here, so the third pill is this round's
    // letters guessed instead of the "Best" streak Daily shows.
    { label: 'Letters', value: `${totalGuesses}` },
  ];

  // Same Modal setup as every other game's result overlay (transparent=false,
  // statusBarTranslucent, presentationStyle="overFullScreen") with manual
  // safe-area padding via useSafeAreaInsets() instead of SafeAreaView —
  // SafeAreaView was found to report a 0 top inset inside this Modal on iOS,
  // which is why the header used to render jammed under the notch with the
  // brand title clipped and the close button sitting too high.
  return (
    <>
      <ResultsScreen
        visible={isVisible}
        gameName="HANGMAN"
        onClose={onClose}
        title={title}
        subtitle={subtitle}
        badge={['Quick Play', category]}
        hero={{ label: 'Streak', value: `${currentStreak}` }}
        pills={pills}
        signature={<HangmanSignature word={word} solved={isWon} incorrectGuesses={incorrectGuesses} maxAttempts={maxAttempts} />}
        onMainMenu={onBackToMenu}
        onPlayAgain={onPlayAgain}
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
export default GameStatus;