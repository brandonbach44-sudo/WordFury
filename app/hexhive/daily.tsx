// app/hexhive/daily.tsx
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { useTheme } from '../../src/shared/ThemeContext';
import {
  getDailyPuzzle,
  getPuzzleSolution,
  getTodayDateString,
  type HexHivePuzzle,
} from '../../src/hexhive/utils/generator';
import { loadDailyProgress } from '../../src/hexhive/utils/storage';
import HexHivePlayScreen from '../../src/hexhive/screens/HexHivePlayScreen';

export default function HexHiveDailyScreen() {
  const { background } = useTheme();
  const [puzzle, setPuzzle] = useState<HexHivePuzzle | null>(null);
  const [initialFoundWords, setInitialFoundWords] = useState<string[] | undefined>(undefined);
  const [puzzleDate, setPuzzleDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Generate immediately on mount. InteractionManager.runAfterInteractions()
  // does not work with Expo Router's native stack — native animations are
  // invisible to JS, so the callback fired straight away anyway while still
  // showing players a loading spinner. Hex Hive puzzles are curated letter
  // sets, so generation is a lookup, not a search.
  const load = useCallback(async (isCancelled: () => boolean) => {
    const dateISO = getTodayDateString();
    const generated = getDailyPuzzle(new Date());
    const progress = await loadDailyProgress();
    if (isCancelled()) return;
    // Only restore words that are actually valid for today's letters, so a
    // save carried over from a previous day's puzzle can never leak into
    // this one's found list.
    const valid = new Set(getPuzzleSolution(generated).words);
    setPuzzle(generated);
    setPuzzleDate(dateISO);
    setInitialFoundWords(progress ? progress.foundWords.filter((w) => valid.has(w)) : undefined);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  // If the screen is left open across midnight, roll over to the new day's
  // puzzle when the app comes back to the foreground instead of leaving
  // yesterday's board up.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && puzzleDate && puzzleDate !== getTodayDateString()) {
        load(() => false);
      }
    });
    return () => sub.remove();
  }, [load, puzzleDate]);

  if (loading || !puzzle || !puzzleDate) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: background.backgroundColor,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator color="#D4A017" size="large" />
      </View>
    );
  }

  return (
    <HexHivePlayScreen
      key={puzzleDate}
      puzzle={puzzle}
      mode="daily"
      dailyDateISO={puzzleDate}
      initialFoundWords={initialFoundWords}
      onGoHome={() => router.back()}
    />
  );
}
