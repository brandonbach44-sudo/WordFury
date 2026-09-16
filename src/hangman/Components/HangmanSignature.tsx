// src/hangman/Components/HangmanSignature.tsx
//
// Hangman's results-screen signature card: the solved (or revealed) word in
// its own full-width card, per docs/BUILD41_PLAN.md -- previously it was
// squeezed into a pill the same size as Misses and Lives. Below the word,
// a row of miss marks echoes the round's spent attempts (filled = a wrong
// guess, hollow = a life that was never spent).

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../shared/ThemeContext';
import { Card, WordTiles } from '../../shared/ResultsScreen';

type Props = {
  word: string;
  solved: boolean;
  incorrectGuesses: number;
  maxAttempts: number;
};

export const HangmanSignature: React.FC<Props> = ({ word, solved, incorrectGuesses, maxAttempts }) => {
  const { background } = useTheme();

  return (
    <Card padding={16} style={styles.card}>
      <WordTiles word={word.toUpperCase()} solved={solved} />
      <View style={styles.missRow}>
        {Array.from({ length: maxAttempts }, (_, i) => {
          const missed = i < incorrectGuesses;
          return (
            <View
              key={i}
              style={[
                styles.missDot,
                missed
                  ? { backgroundColor: '#ef4444', borderColor: '#ef4444' }
                  : { backgroundColor: 'transparent', borderColor: background.borderColor },
              ]}
            />
          );
        })}
      </View>
    </Card>
  );
};

export default HangmanSignature;

const styles = StyleSheet.create({
  card: { marginTop: 16, alignItems: 'center' },
  missRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  missDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
});
