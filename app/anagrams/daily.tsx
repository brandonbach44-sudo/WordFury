// app/anagrams/daily.tsx

import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../../src/shared/ThemeContext';
import type { AnagramPuzzle } from '../../src/anagrams/utils/generator';
import { generateDailyAnagrams } from '../../src/anagrams/utils/generator';
import {
  DailyLockState,
  DailyProgressState,
  getTodayDateString,
  loadDailyLock,
  loadDailyProgress,
} from '../../src/anagrams/utils/anagramsStorage';
import AnagramsPlayScreen from '../../src/anagrams/screens/AnagramsPlayScreen';

export default function AnagramsDailyScreen() {
  const { background } = useTheme();
  const [lock, setLock] = useState<DailyLockState | null>(null);
  const [progress, setProgress] = useState<DailyProgressState | null>(null);
  const [puzzle, setPuzzle] = useState<AnagramPuzzle | null>(null);
  const [loading, setLoading] = useState(true);

  // Generate immediately on mount. The crash this screen used to have was a
  // missing ConfirmModal import in the play screen, NOT slow generation, so no
  // artificial delay is needed — and a delay only showed players a spinner.
  // The word graph is pre-warmed at app startup (see app/_layout.tsx), so this
  // is fast enough to run inline.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const generatedPuzzle = generateDailyAnagrams(new Date());
      const [existingLock, existingProgress] = await Promise.all([
        loadDailyLock(),
        loadDailyProgress(),
      ]);
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
        <ActivityIndicator color={background.accentColor} size="large" />
      </View>
    );
  }

  return (
    <AnagramsPlayScreen
      puzzle={puzzle}
      mode="daily"
      lockedResult={lock}
      initialProgress={progress}
      onGoHome={() => router.back()}
    />
  );
}
