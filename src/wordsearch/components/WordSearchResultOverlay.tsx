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

import React, { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';

import { useTheme } from '../../shared/ThemeContext';
import { useSemanticColors } from '../../shared/semanticColors';
import { AchievementPopup, AchievementLike } from '../../shared/AchievementPopup';
import { ResultsScreen } from '../../shared/ResultsScreen';
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
  nextDailySecondsRemaining?: number | null;
  onClose: () => void;
  onPlayAgain: () => void;
  onGoHome: () => void;
  // Achievement toast rendered inside this Modal — see AchievementPopup:
  // native Modals always paint above plain views, so a toast mounted only
  // at the parent screen level would be hidden behind this overlay.
  achievement?: AchievementLike | null;
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
  nextDailySecondsRemaining,
  onClose,
  onPlayAgain,
  onGoHome,
  achievement = null,
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
  const [showAnswerKey, setShowAnswerKey] = useState(false);

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

  // Same reasoning as every other game's result overlay — Modal instead of
  // an absolutely-positioned View so this always covers the full screen
  // exactly the same way, regardless of the parent play screen's layout.
  const answerKey = canShowAnswerKey ? (
    <View style={{ marginTop: 4 }}>
      <>
        <View style={[styles.divider, { backgroundColor: BORDER }]} />
        <Pressable
          style={({ pressed }) => [
            styles.answerKeyToggle,
            { borderColor: BORDER, backgroundColor: CARD, opacity: pressed ? 0.75 : 1 },
          ]}
          onPress={() => setShowAnswerKey((v) => !v)}
        >
          {showAnswerKey ? <EyeOff size={16} color={TEXT} /> : <Eye size={16} color={TEXT} />}
          <Text style={[styles.answerKeyToggleText, { color: TEXT }]}>
            {showAnswerKey ? 'Hide Answer Key' : 'Show Answer Key'}
          </Text>
        </Pressable>

        {showAnswerKey && (
          <View style={styles.answerKeyWrap}>
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
        )}
      </>
    </View>
  ) : null;


  return (
    <>
      <ResultsScreen
        visible={visible}
        gameName="WORD SEARCH"
        onClose={onClose}
        title={title}
        subtitle={subtitle}
        badge={`${themeName}${difficulty ? ` \u00b7 ${difficulty.charAt(0).toUpperCase()}${difficulty.slice(1)}` : ''}${resultData.multiplier > 1 ? ` \u00b7 ${resultData.multiplier}\u00d7` : ''}`}
        cells={[
          { label: 'FOUND', value: foundWordsUnknown ? '\u2014' : `${resultData.foundWords}/${resultData.totalWords}` },
          { label: 'TIME', value: resultData.timeString },
          { label: 'SCORE', value: resultData.score.toLocaleString(), headline: true },
        ]}
        groups={[
          {
            caption: 'HOW THAT SCORE HAPPENED',
            rows: [
              { label: 'Words', value: (resultData.score - resultData.timeBonus).toLocaleString() },
              ...(resultData.timeBonus > 0
                ? [{ label: 'Time bonus', value: `+${resultData.timeBonus}`, tone: 'good' as const }]
                : []),
              ...(resultData.multiplier > 1
                ? [{ label: 'Challenge multiplier', value: `\u00d7${resultData.multiplier}`, tone: 'warn' as const }]
                : []),
              { label: 'TOTAL', value: resultData.score.toLocaleString(), total: true },
            ],
          },
          ...(lifetimeStats
            ? [{
                caption: 'ALL TIME',
                rows: [
                  { label: 'Best score', value: lifetimeStats.bestScore.toLocaleString() },
                  { label: 'Streak', value: `${lifetimeStats.currentStreak} ${lifetimeStats.currentStreak === 1 ? 'day' : 'days'}` },
                  { label: 'Games played', value: `${lifetimeStats.gamesPlayed}` },
                  { label: 'Words found', value: lifetimeStats.totalWordsFound.toLocaleString() },
                ],
              }]
            : []),
        ]}
        countdown={
          isDaily && nextDailySecondsRemaining != null && nextDailySecondsRemaining > 0
            ? { label: 'NEXT DAILY IN', value: formatCountdown(nextDailySecondsRemaining) }
            : null
        }
        extra={answerKey}
        onMainMenu={onGoHome}
        onPlayAgain={isDaily ? undefined : onPlayAgain}
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

export default WordSearchResultOverlay;

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerSpacer: { width: 22 },
  closeIconButton: { width: 22, alignItems: 'flex-end' },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  card: { width: '100%', maxWidth: 420, borderRadius: 18, padding: 8 },
  brand: { textAlign: 'center', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { textAlign: 'center', fontSize: 24, fontWeight: '900', marginBottom: 8, marginTop: 20 },
  subtitle: { textAlign: 'center', fontSize: 14, fontWeight: '600', marginBottom: 20 },
  themePill: { alignSelf: 'center', borderWidth: 2, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 16, marginBottom: 4 },
  themePillText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  divider: { height: 1, marginVertical: 22, opacity: 0.35 },
  sectionTitle: { fontSize: 14, fontWeight: '900', marginBottom: 12, textAlign: 'center', letterSpacing: 1 },
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  statPill: { borderWidth: 2, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, minWidth: 120, alignItems: 'center' },
  statPillLabel: { fontSize: 11, fontWeight: '800', opacity: 0.8, marginBottom: 2 },
  statPillValue: { fontSize: 14, fontWeight: '900' },
  countdownLabel: { textAlign: 'center', fontSize: 12, fontWeight: '800', marginBottom: 4, letterSpacing: 1 },
  countdownValue: { textAlign: 'center', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  buttonRow: { flexDirection: 'row', justifyContent: 'center', width: '100%', gap: 10, marginTop: 24 },
  primaryButton: { borderWidth: 2, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, minWidth: 120, alignItems: 'center' },
  primaryButtonFullWidth: { width: '100%', paddingVertical: 12, minWidth: undefined },
  primaryButtonText: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  shareButton: { marginTop: 18, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', backgroundColor: '#22c55e' },
  shareButtonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareButtonText: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  answerKeyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'center',
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  answerKeyToggleText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  answerKeyWrap: { alignItems: 'center', marginTop: 16 },
  answerKeyLegend: { flexDirection: 'row', gap: 18, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontSize: 12, fontWeight: '700' },
  answerKeyGrid: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  answerKeyCell: { alignItems: 'center', justifyContent: 'center', borderWidth: 0.5 },
  answerKeyCellText: { fontWeight: '800' },
});
