// src/wordgrid/components/DailyChallengeCard.tsx
import React from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Flame, Share2, Trophy } from 'lucide-react-native';

import { useTheme } from '../../shared/ThemeContext';
import {
  buildScoreBlocks,
  formatDisplayDate,
  useCountdownToMidnight,
} from '../utils/dailyChallenge';

type Props = {
  played: boolean;
  inProgress?: boolean;
  score: number;
  wordsCount: number;
  streak: number;
  bestStreak: number;
  shareText: string;
  onPlay: () => void;
};

export const DailyChallengeCard: React.FC<Props> = ({
  played,
  inProgress,
  score,
  wordsCount,
  streak,
  bestStreak,
  shareText,
  onPlay,
}) => {
  const { background } = useTheme();
  const countdown = useCountdownToMidnight();

  const BG = background.backgroundColor;
  const TEXT = background.textColor;
  const SUBTEXT = background.secondaryText;
  const CARD = background.cardColor;
  const BORDER = background.borderColor;

  const handleShare = async () => {
    try {
      await Share.share({ message: shareText });
    } catch (_) {}
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: CARD,
          borderColor: played ? '#4ecca3' : BORDER,
        },
      ]}
    >
      <Text style={[styles.title, { color: TEXT }]}>Daily Challenge</Text>
      <Text style={[styles.subtitle, { color: SUBTEXT }]}>{formatDisplayDate()}</Text>

      {/* Completed score display */}
      {played && (
        <View style={styles.completedInfo}>
          <Text style={[styles.completedScore, { color: background.accentColor }]}>{score}</Text>
          <Text style={[styles.completedLabel, { color: SUBTEXT }]}>
            {wordsCount} words found
          </Text>
        </View>
      )}

      {/* Streak pills */}
      <View style={styles.pillRow}>
        <View style={[styles.pill, styles.pillHighlight]}>
          <Text style={[styles.pillLabel, { color: SUBTEXT }]}>Current streak</Text>
          <View style={styles.pillValueRow}>
            <Flame size={18} color="#e85d04" />
            <Text style={[styles.pillValue, { color: TEXT }]}>{streak}</Text>
          </View>
        </View>
        <View style={[styles.pill, { backgroundColor: '#f3e7d7' }]}>
          <Text style={[styles.pillLabel, { color: SUBTEXT }]}>Best streak</Text>
          <View style={styles.pillValueRow}>
            <Trophy size={18} color="#d4a017" />
            <Text style={[styles.pillValue, { color: TEXT }]}>{bestStreak}</Text>
          </View>
        </View>
      </View>

      {/* Play button */}
      {!played && (
        <Pressable
          onPress={onPlay}
          style={({ pressed }) => [
            styles.playButton,
            { borderColor: BORDER, backgroundColor: BG, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Text style={[styles.playButtonText, { color: TEXT }]}>
            {inProgress ? "Continue Today's Challenge" : "Play Today's Challenge"}
          </Text>
        </Pressable>
      )}

      {/* View Results + Share */}
      {played && (
        <View style={styles.actionRow}>
          <Pressable
            onPress={onPlay}
            style={({ pressed }) => [
              styles.actionButton,
              { borderColor: BORDER, backgroundColor: BG, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Text style={[styles.actionText, { color: TEXT }]}>View Results</Text>
          </Pressable>
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [
              styles.shareIconButton,
              { borderColor: BORDER, backgroundColor: BG, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Share2 size={18} color={TEXT} />
          </Pressable>
        </View>
      )}

      {/* Countdown */}
      {played && (
        <View style={[styles.countdown, { borderTopColor: BORDER }]}>
          <Text style={[styles.countdownLabel, { color: SUBTEXT }]}>Next challenge in</Text>
          <Text style={[styles.countdownTime, { color: TEXT }]}>{countdown}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  completedInfo: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 12,
  },
  completedScore: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4ecca3',
  },
  completedLabel: {
    fontSize: 14,
    marginTop: 4,
  },
  pillRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    minWidth: 100,
    alignItems: 'center',
  },
  pillHighlight: {
    backgroundColor: 'rgba(78, 204, 163, 0.15)',
  },
  pillLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  pillValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  playButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 2,
  },
  playButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  shareIconButton: {
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  countdown: {
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  countdownLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  countdownTime: {
    fontSize: 20,
    fontWeight: '600',
  },
});
