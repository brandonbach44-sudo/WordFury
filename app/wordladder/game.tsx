// app/wordladder/game.tsx
// Quick Play — generates a fresh puzzle on-device for the chosen difficulty.
// Autosaves progress so returning to the app mid-game resumes seamlessly.

import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../../src/shared/ThemeContext';
import { generatePracticeLadder, type LadderDifficulty, type LadderPuzzle } from '../../src/wordladder/utils/generator';
import LadderPlayScreen from '../../src/wordladder/screens/LadderPlayScreen';
import { loadQuickPlayProgress, clearQuickPlayProgress, type QuickPlayProgressState } from '../../src/wordladder/utils/ladderStorage';

export default function WordLadderGameRoute() {
  const { background } = useTheme();
  const params = useLocalSearchParams();
  const difficulty = ((params.difficulty as string) || 'medium') as LadderDifficulty;

  const [puzzleKey, setPuzzleKey] = useState(0);
  const [puzzle, setPuzzle] = useState<LadderPuzzle | null>(null);
  const [savedProgress, setSavedProgress] = useState<QuickPlayProgressState | null>(null);

  // Generate immediately on mount. The old crash here was a missing
  // ConfirmModal import in the play screen, not slow generation, so the
  // artificial delay (which showed players a spinner) is gone. The word graph
  // is pre-warmed at app startup (see app/_layout.tsx).
  useEffect(() => {
    setPuzzle(null);
    let cancelled = false;
    (async () => {
      const p = await loadQuickPlayProgress();
      if (cancelled) return;
      if (p) {
        setSavedProgress(p);
        setPuzzle({
          start: p.puzzle.start,
          end: p.puzzle.end,
          par: p.puzzle.par,
          wordLength: p.puzzle.wordLength,
          difficulty: (p.puzzle.difficulty || difficulty) as LadderDifficulty,
          solutionPath: p.puzzle.solution,
        });
      } else {
        setSavedProgress(null);
        setPuzzle(generatePracticeLadder(difficulty));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [puzzleKey]);

  // On play-again, wipe the saved progress and trigger a new generation.
  const handlePlayAgain = () => {
    clearQuickPlayProgress().catch(() => {});
    setSavedProgress(null);
    setPuzzleKey((k) => k + 1);
  };

  if (!puzzle) {
    return (
      <View style={{ flex: 1, backgroundColor: background.backgroundColor, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={background.accentColor} size="large" />
      </View>
    );
  }

  return (
    <LadderPlayScreen
      key={puzzleKey}
      puzzle={puzzle}
      mode="practice"
      difficulty={difficulty}
      initialPracticeProgress={savedProgress}
      onGoHome={() => router.back()}
      onPlayAgain={handlePlayAgain}
    />
  );
}
