// app/wordladder/daily.tsx

import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../../src/shared/ThemeContext';
import { COLORS } from '../../src/shared/theme';
import type { LadderPuzzle } from '../../src/wordladder/utils/generator';
import { generateDailyLadder } from '../../src/wordladder/utils/generator';
import {
  DailyLockState,
  DailyProgressState,
  getTodayDateString,
  loadCachedDailyPuzzle,
  loadDailyLock,
  loadDailyProgress,
  saveCachedDailyPuzzle,
} from '../../src/wordladder/utils/ladderStorage';
import LadderPlayScreen from '../../src/wordladder/screens/LadderPlayScreen';

export default function WordLadderDailyScreen() {
  const { background } = useTheme();
  const [lock, setLock] = useState<DailyLockState | null>(null);
  const [progress, setProgress] = useState<DailyProgressState | null>(null);
  const [puzzle, setPuzzle] = useState<LadderPuzzle | null>(null);
  const [loading, setLoading] = useState(true);

  // Generate immediately on mount. The crash this screen used to have was a
  // missing ConfirmModal import in the play screen, NOT slow generation, so no
  // artificial delay is needed — and a delay only showed players a spinner.
  // The word graph is pre-warmed at app startup (see app/_layout.tsx), so this
  // is fast enough to run inline.
  //
  // The puzzle itself is cached the first time it's generated for a date
  // (loadCachedDailyPuzzle/saveCachedDailyPuzzle) rather than recomputed on
  // every mount — generateDailyLadder is a pure function of the date, but it
  // reads the live word list, so recomputing it fresh could silently hand a
  // returning player a different puzzle than the one they already saw today
  // if the dictionary changed underneath them (e.g. an app update installing
  // mid-day). The cache is what actually pins "today's puzzle" in place.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [existingLock, existingProgress, cached] = await Promise.all([
        loadDailyLock(),
        loadDailyProgress(),
        loadCachedDailyPuzzle(),
      ]);
      if (cancelled) return;

      let generatedPuzzle: LadderPuzzle;
      if (cached) {
        generatedPuzzle = {
          start: cached.start,
          end: cached.end,
          par: cached.par,
          wordLength: cached.wordLength,
          difficulty: 'medium',
          solutionPath: cached.solutionPath,
        };
      } else {
        generatedPuzzle = generateDailyLadder(new Date());
        await saveCachedDailyPuzzle({
          dateISO: getTodayDateString(),
          start: generatedPuzzle.start,
          end: generatedPuzzle.end,
          par: generatedPuzzle.par,
          wordLength: generatedPuzzle.wordLength,
          solutionPath: generatedPuzzle.solutionPath,
        });
      }
      if (cancelled) return;

      if (existingLock && existingLock.dateISO === getTodayDateString()) {
        setLock(existingLock);
      } else if (existingProgress) {
        setProgress(existingProgress);
      }
      setPuzzle(generatedPuzzle);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !puzzle) {
    return (
      <View style={{ flex: 1, backgroundColor: background.backgroundColor, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  const activePuzzle = lock
    ? { start: lock.start, end: lock.end, par: lock.par, wordLength: lock.start.length, difficulty: 'medium' as const, solutionPath: [] }
    : puzzle;

  return (
    <LadderPlayScreen
      puzzle={activePuzzle}
      mode="daily"
      difficulty="medium"
      lockedResult={lock}
      initialProgress={progress}
      onGoHome={() => router.back()}
    />
  );
}
