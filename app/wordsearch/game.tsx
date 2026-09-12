// app/wordsearch/game.tsx
// Generates the puzzle here so we never pass large JSON through URL params.
// Autosaves in-progress Quick Play so returning mid-game resumes seamlessly.

import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../../src/shared/ThemeContext';
import { WORD_SEARCH_THEMES } from '../../src/wordsearch/data/themes';
import PlayScreen from '../../src/wordsearch/PlayScreen';
import { generatePuzzle, type PlacedWord , WordSearchPuzzle } from '../../src/wordsearch/utils/generator';
import { DIFFICULTY_CONFIG, type Difficulty } from '../../src/wordsearch/utils/difficultyConfig';
import {
  loadWordSearchPracticeProgress,
  type WordSearchPracticeProgress,
} from '../../src/wordsearch/utils/wsStorage';

export default function WordSearchGameRoute() {
  const { background } = useTheme();
  const params = useLocalSearchParams();

  const themeId = params.themeId as string | undefined;
  const difficulty = (params.difficulty as string | undefined) as Difficulty | undefined;

  const [savedProgress, setSavedProgress] = useState<WordSearchPracticeProgress | null | undefined>(undefined);
  const hydrated = savedProgress !== undefined;

  // Load any in-progress practice run on first mount only.
  useEffect(() => {
    loadWordSearchPracticeProgress().then((p) => setSavedProgress(p ?? null));
  }, []);

  const puzzle = useMemo<WordSearchPuzzle | null>(() => {
    if (!themeId || !difficulty) return null;

    // If there's a saved session for this exact theme+difficulty, reconstruct
    // the exact puzzle from the stored grid and word placements so the player
    // can resume right where they left off.
    if (
      savedProgress &&
      savedProgress.theme === themeId &&
      savedProgress.difficulty === difficulty
    ) {
      const restoredWords: PlacedWord[] = savedProgress.wordPlacements.map((wp) => ({
        word: wp.word,
        row: wp.startRow,
        col: wp.startCol,
        direction: wp.direction as PlacedWord['direction'],
        length: wp.word.length,
      }));
      return { grid: savedProgress.gridLetters, words: restoredWords, themeId };
    }

    // No matching saved session — generate a fresh puzzle.
    const theme = WORD_SEARCH_THEMES.find((t) => t.id === themeId);
    const config = DIFFICULTY_CONFIG[difficulty];
    if (!theme || !config) return null;
    return generatePuzzle(theme, {
      rows: config.rows,
      cols: config.cols,
      wordsPerPuzzle: config.wordsPerPuzzle,
      allowBackwards: config.allowBackwards,
      allowDiagonal: config.allowDiagonal,
      maxWordLength: config.maxWordLength,
    });
  }, [themeId, difficulty, savedProgress]);

  if (!hydrated || !themeId || !difficulty || !puzzle) {
    return (
      <View style={{ flex: 1, backgroundColor: background.backgroundColor, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={background.accentColor} size="large" />
      </View>
    );
  }

  // Only pass savedProgress as initialPracticeProgress if it matches this session's
  // theme+difficulty — otherwise it's stale data for a different puzzle.
  const practiceProgressForScreen =
    savedProgress &&
    savedProgress.theme === themeId &&
    savedProgress.difficulty === difficulty
      ? savedProgress
      : null;

  return (
    <PlayScreen
      themeId={themeId as any}
      difficulty={difficulty}
      puzzleData={puzzle}
      timeLimit={DIFFICULTY_CONFIG[difficulty].timeLimit}
      initialPracticeProgress={practiceProgressForScreen}
    />
  );
}
