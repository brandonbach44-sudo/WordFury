// src/wordsearch/components/WordSearchResultOverlay.tsx
//
// Extracted out of PlayScreen.tsx into its own component so Word Search's
// results screen follows the exact same pattern as every other game
// (LadderResultOverlay, AnagramsResultOverlay, WordleResultOverlay): a
// single dedicated file, always rendered the same way, that PlayScreen just
// feeds data into. Previously this was ~350 lines of hand-rolled JSX mixed
// directly into the 900+ line gameplay file — easy for a future edit to
// that file to silently break a button here without anyone noticing. Pulling
// it out structurally prevents that class of bug instead of relying on
// remembering to keep it in sync by hand.

import React from 'react';
import { Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useTheme } from '../../shared/ThemeContext';
import { useSemanticColors } from '../../shared/semanticColors';
import { AchievementPopup, AchievementLike } from '../../shared/AchievementPopup';
import { ResultsScreen, type ChipSpec, type LifetimeSpec, type PillTriple } from '../../shared/ResultsScreen';
import { DIRECTION_VECTORS, type PlacedWord } from '../utils/generator';
import type { WordSearchStats } from '../utils/wsStorage';
import type { WSAchievement } from '../utils/wsAchievements';

export interface WordSearchResultData {
  score: number;
  foundWords: number;
  totalWords: number;
  allFound: boolean;
  timeString: string;
  multiplier: number;
  timeBonus: number;
  newAchievements: WSAchievement[];
  // True only for a legacy-data fallback result where the exact found-word
  // count couldn't be recovered — see app/wordsearch/daily.tsx. Shows "—"
  // instead of `foundWords`, which would otherwise misleadingly read as 0.
  foundWordsUnknown?: boolean;
}

type Props = {
  visible: boolean;
  mode: 'daily' | 'practice';
  themeName: string;
  difficulty: string;
  resultData: WordSearchResultData;
  lifetimeStats: WordSearchStats | null;
  // Quick Play's third pill: rounds finished this sitting, never persisted.
  // Not meaningful on Daily, where at most one round is ever played.
  roundsThisSession?: number;
  nextDailySecondsRemaining?: number | null;
  onClose: () => void;
  onPlayAgain: () => void;
  onGoHome: () => void;
  // Achievement toast rendered inside this Modal — see AchievementPopup:
  // native Modals always paint above plain views, so a toast mounted only
  // at the parent screen level would be hidden behind this overlay.
  achievements?: AchievementLike[];
  onDismissAchievement?: () => void;
  // Puzzle answer key — grid + every placed word, plus which of those the
  // player actually found. Used for the "Show Answer Key" reveal below.
  // Optional so older call sites (if any) don't break.
  puzzleGrid?: string[][];
  puzzleWords?: PlacedWord[];
  foundWordTexts?: string[];
};

// Every cell belonging to a placed word, expanded from its start position +
// direction + length — same math the generator used to lay it down.
function wordCells(word: PlacedWord): { row: number; col: number }[] {
  const { dr, dc } = DIRECTION_VECTORS[word.direction];
  return Array.from({ length: word.length }, (_, i) => ({
    row: word.row + dr * i,
    col: word.col + dc * i,
  }));
}

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${sec.toString().padStart(2, '0')}s`;
}

const WordSearchResultOverlay: React.FC<Props> = ({
  visible,
  mode,
  themeName,
  difficulty,
  resultData,
  lifetimeStats,
  roundsThisSession = 0,
  nextDailySecondsRemaining,
  onClose,
  onPlayAgain,
  onGoHome,
  achievements = [],
  onDismissAchievement,
  puzzleGrid,
  puzzleWords,
  foundWordTexts,
}) => {
  const { background } = useTheme();
  // The answer key told "found" from "missed" with green against red — the one
  // pairing lost under the most common forms of colour vision deficiency, on
  // the single screen whose whole job is showing how you did. Both fills now
  // come from the shared semantic palette, so Color Blind Mode reaches them.
  const semantic = useSemanticColors();
  const { width: windowWidth } = useWindowDimensions();
  const isDaily = mode === 'daily';

  // Available on both Daily and Practice: by the time this screen shows,
  // the player's own attempt (and score, for Daily) is already locked in,
  // so there's nothing left to spoil for *them*. The Share button still
  // never includes the actual words (see "Progress bar instead of listing
  // found words" below) — that's the only auto-shared surface, so this
  // manual reveal doesn't leak anything unless someone deliberately
  // screenshots it and sends it to a friend who hasn't played yet, same
  // risk every other game's results screen already carries.
  const foundWordsUnknown = !!resultData.foundWordsUnknown;
  const canShowAnswerKey = !!puzzleGrid && !!puzzleWords && !foundWordsUnknown;
  const foundSet = new Set(foundWordTexts ?? []);

  const TEXT = background.textColor ?? '#111827';
  const SUBTEXT = background.secondaryText ?? '#6b7280';
  const CARD = background.cardColor ?? '#ffffff';
  const BORDER = background.borderColor ?? '#e5e7eb';

  const title = resultData.allFound
    ? 'Nice!'
    : foundWordsUnknown
    ? 'Already Played'
    : resultData.foundWords / resultData.totalWords >= 0.75
    ? 'Great Job!'
    : resultData.foundWords / resultData.totalWords >= 0.5
    ? 'Good Effort!'
    : "Time's Up!";
  const subtitle = resultData.allFound
    ? `You found all ${resultData.totalWords} words in ${resultData.timeString}!`
    : foundWordsUnknown
    ? `You already completed today's puzzle.`
    : `You found ${resultData.foundWords}/${resultData.totalWords} words in ${resultData.timeString}.`;

  const difficultyLabel = difficulty ? `${difficulty.charAt(0).toUpperCase()}${difficulty.slice(1)}` : '';
  const badge = [
    ...(isDaily ? [] : ['Quick Play']),
    themeName,
    ...(difficultyLabel ? [difficultyLabel] : []),
    ...(resultData.multiplier > 1 ? [`${resultData.multiplier}x`] : []),
  ];

  // The hero note carries the round summary, e.g. how a time bonus padded
  // the score. The multiplier lives in the badge instead, since it describes
  // the puzzle's difficulty setting rather than something that happened
  // during the round.
  const heroNoteParts: string[] = [];
  if (resultData.timeBonus > 0) heroNoteParts.push(`+${resultData.timeBonus} time bonus`);

  const pills: PillTriple = isDaily
    ? [
        { label: 'Found', value: foundWordsUnknown ? '-' : `${resultData.foundWords}/${resultData.totalWords}` },
        { label: 'Time', value: resultData.timeString },
        { label: 'Streak', value: `${lifetimeStats?.currentStreak ?? 0}` },
      ]
    : [
        { label: 'Found', value: foundWordsUnknown ? '-' : `${resultData.foundWords}/${resultData.totalWords}` },
        { label: 'Time', value: resultData.timeString },
        // Quick Play has no daily streak to show, and "Best" would just
        // repeat the lifetime ghost pill directly below it, so the third
        // pill is this sitting's round count instead.
        { label: 'Rounds', value: `${roundsThisSession}` },
      ];

  const chips: ChipSpec[] | undefined = puzzleWords
    ? puzzleWords.map((w) => ({ label: w.word, highlighted: foundSet.has(w.word) }))
    : undefined;

  // Progress bar instead of listing which words were found — the Daily
  // theme's word list is shared by everyone that day, so naming specific
  // found words would spoil valid answers for friends who haven't played
  // yet (same reasoning as Furdle/Anagrams/Word Grid). The bar still
  // communicates how close to a clean sweep the run was, spoiler-free.
  const handleShare = async () => {
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const pipCount = 10;
    const totalForPips = Math.max(resultData.totalWords, 1);
    const filledPips = Math.min(pipCount, Math.max(0, Math.round((resultData.foundWords / totalForPips) * pipCount)));
    const progressBar = '🟩'.repeat(filledPips) + '⬜'.repeat(pipCount - filledPips);
    const pct = Math.round((resultData.foundWords / totalForPips) * 100);

    const header = isDaily ? `WORD SEARCH DAILY — ${dateStr}` : 'WORD SEARCH';
    const scoreLine = resultData.allFound && resultData.timeBonus > 0
      ? `Score: ${resultData.score.toLocaleString()} (+${resultData.timeBonus} time bonus${resultData.multiplier > 1 ? `, ${resultData.multiplier}× multiplier` : ''})`
      : `Score: ${resultData.score.toLocaleString()}`;

    const lines: string[] = [
      header,
      themeName,
      ...(foundWordsUnknown ? [] : [progressBar]),
      foundWordsUnknown
        ? `${resultData.score.toLocaleString()} pts · ${resultData.timeString}`
        : `${resultData.foundWords}/${resultData.totalWords} words · ${pct}% · ${resultData.timeString}`,
      '',
      scoreLine,
    ];
    if (isDaily && lifetimeStats && lifetimeStats.currentStreak > 1) {
      lines.push(`${lifetimeStats.currentStreak} day streak`);
    }
    lines.push('', 'wordfury.app');

    const text = lines.join('\n');
    try {
      await Share.share({ message: text });
    } catch (e) {
      console.warn('Share failed', e);
    }
  };

  // The toggle button itself is now rendered by ResultsScreen (the `toggle`
  // prop); this is just the legend + grid it shows when expanded.
  const answerKeyContent = canShowAnswerKey ? (
    <View>
      <View style={styles.answerKeyLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: semantic.correct }]} />
          <Text style={[styles.legendText, { color: SUBTEXT }]}>Found</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: semantic.wrong }]} />
          <Text style={[styles.legendText, { color: SUBTEXT }]}>Missed</Text>
        </View>
      </View>
      {(() => {
        const grid = puzzleGrid!;
        const cols = grid[0]?.length ?? 1;
        const cellSize = Math.max(14, Math.min(26, Math.floor((Math.min(windowWidth, 420) - 56) / cols)));

        // Cell -> color, missed words drawn after found words so
        // an intersection between a found and missed word still
        // reads clearly as "missed" (the more useful signal).
        const cellColor = new Map<string, string>();
        for (const w of puzzleWords!) {
          if (!foundSet.has(w.word)) continue;
          for (const c of wordCells(w)) cellColor.set(`${c.row},${c.col}`, semantic.correct);
        }
        for (const w of puzzleWords!) {
          if (foundSet.has(w.word)) continue;
          for (const c of wordCells(w)) cellColor.set(`${c.row},${c.col}`, semantic.wrong);
        }

        return (
          <View style={[styles.answerKeyGrid, { borderColor: BORDER }]}>
            {grid.map((row, rIdx) => (
              <View key={rIdx} style={{ flexDirection: 'row' }}>
                {row.map((letter, cIdx) => {
                  const fill = cellColor.get(`${rIdx},${cIdx}`);
                  return (
                    <View
                      key={cIdx}
                      style={[
                        styles.answerKeyCell,
                        {
                          width: cellSize,
                          height: cellSize,
                          backgroundColor: fill ? `${fill}33` : CARD,
                          borderColor: BORDER,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.answerKeyCellText,
                          { fontSize: Math.max(8, cellSize * 0.42), color: fill ?? TEXT },
                        ]}
                      >
                        {letter}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        );
      })()}
    </View>
  ) : null;

  const lifetime: LifetimeSpec | undefined = lifetimeStats
    ? {
        pills: [
          { label: 'Best', value: lifetimeStats.bestScore.toLocaleString() },
          { label: 'Played', value: `${lifetimeStats.gamesPlayed}` },
          { label: 'Words', value: lifetimeStats.totalWordsFound.toLocaleString() },
        ],
      }
    : undefined;

  const commonProps = {
    visible,
    gameName: 'WORD SEARCH',
    onClose,
    title,
    subtitle,
    badge,
    hero: {
      label: 'Score',
      value: resultData.score.toLocaleString(),
      note: heroNoteParts.length > 0 ? heroNoteParts.join(', ') : undefined,
    },
    pills,
    chips,
    toggle: answerKeyContent ? { label: 'Answer Key', content: answerKeyContent } : undefined,
    lifetime,
    onMainMenu: onGoHome,
    onShare: handleShare,
    shareLabel: 'Share Result',
  };

  return (
    <>
      {isDaily ? (
        <ResultsScreen
          {...commonProps}
          countdown={
            nextDailySecondsRemaining != null && nextDailySecondsRemaining > 0
              ? { label: 'Next daily in', value: formatCountdown(nextDailySecondsRemaining) }
              : undefined
          }
        />
      ) : (
        <ResultsScreen {...commonProps} onPlayAgain={onPlayAgain} />
      )}
      <AchievementPopup
        achievements={achievements}
        onDismiss={onDismissAchievement ?? (() => {})}
        backgroundColor={CARD}
        textColor={TEXT}
      />
    </>
  );
};

export default WordSearchResultOverlay;

const styles = StyleSheet.create({
  answerKeyLegend: { flexDirection: 'row', gap: 18, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontSize: 12, fontWeight: '700' },
  answerKeyGrid: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  answerKeyCell: { alignItems: 'center', justifyContent: 'center', borderWidth: 0.5 },
  answerKeyCellText: { fontWeight: '800' },
});
