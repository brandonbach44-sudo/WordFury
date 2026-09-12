import React from 'react';
import { Share } from 'react-native';
import { useTheme } from '../../shared/ThemeContext';
import { ResultsScreen } from '../../shared/ResultsScreen';
import { AchievementPopup, AchievementLike } from '../../shared/AchievementPopup';
import { buildHangmanShareText } from '../utils/dailyChallenge';

type GameStatusProps = {
  isVisible: boolean;
  isWon: boolean;
  word: string;
  category: string;
  incorrectGuesses: number;
  totalGuesses: number;
  maxAttempts?: number;
  onPlayAgain: () => void;
  onBackToMenu: () => void;
  onClose: () => void;
  // Achievement toast to render inside this Modal — see AchievementPopup.
  achievement?: AchievementLike | null;
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
  onPlayAgain,
  onBackToMenu,
  onClose,
  achievement = null,
  onDismissAchievement,
}) => {
  const { background } = useTheme();

  if (!isVisible) return null;
  const TEXT = background.textColor ?? '#111827';
  const CARD = background.cardColor ?? '#ffffff';

  const handleShare = async () => {
    try {
      // Practice categories are randomly picked each game, not a shared
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
        badge={category}
        cells={[
          { label: 'MISSES', value: `${incorrectGuesses}/${maxAttempts}` },
          { label: 'LIVES LEFT', value: `${maxAttempts - incorrectGuesses}` },
          { label: 'WORD', value: word.toUpperCase(), headline: true },
        ]}
        groups={[
          {
            caption: 'THIS GAME',
            rows: [
              { label: 'Result', value: isWon ? 'Solved' : 'Lost',
                tone: (isWon ? 'good' : 'warn') as 'good' | 'warn' },
              { label: 'The word was', value: word.toUpperCase() },
              { label: 'Category', value: category },
              { label: 'Wrong guesses', value: `${incorrectGuesses} of ${maxAttempts}` },
              { label: 'Total guesses', value: `${totalGuesses}` },
            ],
          },
        ]}
        onMainMenu={onBackToMenu}
        onPlayAgain={onPlayAgain}
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
export default GameStatus;