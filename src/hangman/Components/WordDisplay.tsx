import React, { useState } from 'react';
import { Dimensions, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../shared/ThemeContext';
import { getSemanticColors } from '../../shared/semanticColors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DEFAULT_SLOT_WIDTH = 38;
const DEFAULT_SLOT_MARGIN = 4; // marginHorizontal each side
const DEFAULT_SLOT_TOTAL = DEFAULT_SLOT_WIDTH + DEFAULT_SLOT_MARGIN * 2; // 46
const DEFAULT_FONT_SIZE = 26;
const MIN_SLOT_WIDTH = 12;
const MIN_SLOT_MARGIN = 1;
const MIN_FONT_SIZE = 9;
// Slot height and the gap under each line scale with the same ratio as slot
// width. They used to be fixed at 54 and 16, which meant shrinking a long
// phrase made the letters smaller but left every row just as tall, so the
// block's height never actually came down.
const DEFAULT_SLOT_HEIGHT = 54;
const MIN_SLOT_HEIGHT = 20;
const DEFAULT_LINE_GAP = 16;
const MIN_LINE_GAP = 4;
const DEFAULT_SLOT_PAD_BOTTOM = 7;
const CONTAINER_PADDING_V = 20;
// Long phrases (Countries — "Saint Vincent and the Grenadines") used to
// wrap into 5+ lines at a fixed slot size, which pushed the keyboard/guess
// controls off screen. Instead,
// the wrap itself is now solved for: slot size shrinks until the phrase
// fits within this many lines, not just until the longest single line fits
// horizontally.
const MAX_LINES = 3;

type WordDisplayProps = {
  displayWord: string[];
  isWon?: boolean;
  isLost?: boolean;
  actualWord?: string;
};

const isLetter = (char: string) => /[a-zA-Z]/.test(char);
const isPunctuation = (char: string) => char !== ' ' && !isLetter(char);

function buildLines(letters: string[], maxPerLine: number): number[][] {
  // Returns arrays of indices into `letters`
  const lines: number[][] = [];
  let currentLine: number[] = [];
  let currentWordIndices: number[] = [];

  const flush = () => {
    if (currentWordIndices.length === 0) return;
    const lineLetters = currentLine.filter(i => i !== -1).length; // -1 = space
    if (lineLetters + currentWordIndices.length > maxPerLine && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [];
    }
    // Break a single word that's longer than maxPerLine across multiple lines
    let remaining = [...currentWordIndices];
    while (remaining.length > 0) {
      const lineCount = currentLine.filter(i => i !== -1).length;
      const spaceLeft = maxPerLine - lineCount;
      const chunk = remaining.splice(0, spaceLeft);
      currentLine.push(...chunk);
      if (remaining.length > 0) {
        lines.push(currentLine);
        currentLine = [];
      }
    }
    currentWordIndices = [];
  };

  for (let i = 0; i < letters.length; i++) {
    if (letters[i] === ' ') {
      flush();
      if (currentLine.length > 0) currentLine.push(-1); // -1 = space marker
    } else {
      currentWordIndices.push(i);
    }
  }
  flush();
  if (currentLine.length > 0) {
    while (currentLine[currentLine.length - 1] === -1) currentLine.pop();
    lines.push(currentLine);
  }
  return lines;
}

export const WordDisplay: React.FC<WordDisplayProps> = ({
  displayWord,
  isWon = false,
  isLost = false,
  actualWord = '',
}) => {
  const { background, colorBlindMode } = useTheme();
  // The height this block actually has to work with, measured rather than
  // assumed. This View is flex:1, so its height is whatever the gallows above
  // and the keyboard below leave behind, which differs by device. A two-line
  // phrase (any multi-word Landmark, say) needs about 180pt, and on a 874pt
  // screen only about 125pt is left, so the second line used to spill out the
  // bottom of the box. Nothing clips in React Native by default and the
  // "Guess the Word" button has no background fill, so that spilled row
  // showed straight through the button.
  const [boxHeight, setBoxHeight] = useState(0);
  // Outcome colours come from the shared semantic palette: the app's accent
  // and danger by default, orange/blue in Color Blind Mode.
  const semantic = getSemanticColors(colorBlindMode);
  const wonColor = semantic.outcomeWon;
  const lostColor = semantic.outcomeLost;

  const availableWidth = SCREEN_WIDTH - 32; // paddingHorizontal 16 each side

  // Always use actualWord characters so text content never changes — only color changes
  const source = actualWord || displayWord.map(c => (c === '_' ? 'W' : c)).join('');
  const sourceChars = source.split('');

  // Shrink the slot size (which raises how many letters fit per line) until
  // the whole phrase wraps within MAX_LINES, instead of wrapping at a fixed
  // size and letting the line count grow unbounded for long phrases.
  const MIN_SLOT_TOTAL = MIN_SLOT_WIDTH + MIN_SLOT_MARGIN * 2;
  const availableHeight = boxHeight > 0 ? boxHeight - CONTAINER_PADDING_V * 2 : 0;

  const metricsFor = (total: number) => {
    const r = total / DEFAULT_SLOT_TOTAL;
    return {
      ratio: r,
      slotHeight: Math.max(MIN_SLOT_HEIGHT, Math.floor(DEFAULT_SLOT_HEIGHT * r)),
      lineGap: Math.max(MIN_LINE_GAP, Math.floor(DEFAULT_LINE_GAP * r)),
    };
  };

  // Before the first layout lands, availableHeight is 0 and this is skipped,
  // so the width rules alone decide the size exactly as they did before.
  const fitsHeight = (lineCount: number, total: number) => {
    if (availableHeight <= 0) return true;
    const { slotHeight, lineGap } = metricsFor(total);
    return lineCount * (slotHeight + lineGap) <= availableHeight;
  };

  // Shrinking is safe to loop on: smaller slots fit more letters per line, so
  // the line count falls, and each line gets shorter too. The box itself is
  // flex:1 and so never resizes in response, which means no measure loop.
  let slotTotal = DEFAULT_SLOT_TOTAL;
  let maxPerLine = Math.max(5, Math.floor(availableWidth / slotTotal));
  let lines = buildLines(sourceChars, maxPerLine);
  while (
    (lines.length > MAX_LINES || !fitsHeight(lines.length, slotTotal)) &&
    slotTotal > MIN_SLOT_TOTAL
  ) {
    slotTotal = Math.max(MIN_SLOT_TOTAL, slotTotal - 2);
    maxPerLine = Math.max(5, Math.floor(availableWidth / slotTotal));
    lines = buildLines(sourceChars, maxPerLine);
  }

  // Within that line count, shrink further if the longest line is still too
  // wide to fit horizontally at the chosen slot size.
  const longestLineLength = lines.reduce(
    (max, line) => Math.max(max, line.filter(i => i !== -1).length),
    0
  );
  const fitsAtChosenSize = longestLineLength * slotTotal <= availableWidth;
  if (!fitsAtChosenSize) {
    slotTotal = Math.max(MIN_SLOT_TOTAL, availableWidth / Math.max(1, longestLineLength));
  }
  const { ratio, slotHeight, lineGap } = metricsFor(slotTotal);
  const slotWidth = Math.max(MIN_SLOT_WIDTH, Math.floor(DEFAULT_SLOT_WIDTH * ratio));
  const slotMargin = Math.max(MIN_SLOT_MARGIN, Math.floor(DEFAULT_SLOT_MARGIN * ratio));
  const fontSize = Math.max(MIN_FONT_SIZE, Math.floor(DEFAULT_FONT_SIZE * ratio));
  const slotPadBottom = Math.max(2, Math.floor(DEFAULT_SLOT_PAD_BOTTOM * ratio));
  const slotSizing = { height: slotHeight, paddingBottom: slotPadBottom };

  const letterColor = (idx: number): string => {
    if (isWon) return wonColor;
    if (isLost && displayWord[idx] === '_') return lostColor;
    return background.textColor;
  };

  const dashColor = (idx: number): string => {
    if (isWon) return wonColor;
    if (isLost && displayWord[idx] === '_') return lostColor;
    return background.borderColor;
  };

  const isRevealed = (idx: number): boolean => displayWord[idx] !== '_';

  return (
    <View
      style={styles.container}
      onLayout={(e: LayoutChangeEvent) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && Math.abs(h - boxHeight) > 1) setBoxHeight(h);
      }}
    >
      {lines.map((lineIndices, lineIdx) => (
        <View key={lineIdx} style={[styles.lineRow, { marginBottom: lineGap }]}>
          {lineIndices.map((charIdx, posIdx) => {
            // Space between words
            if (charIdx === -1) {
              return <View key={`sp${posIdx}`} style={styles.spaceGap} />;
            }

            const char = sourceChars[charIdx];

            if (isPunctuation(char)) {
              return (
                <View key={`pu${posIdx}`} style={[styles.slot, slotSizing, { width: slotWidth, marginHorizontal: slotMargin, borderBottomColor: 'transparent' }]}>
                  <Text style={[styles.letter, { fontSize, color: background.textColor }]}>{char}</Text>
                </View>
              );
            }

            // The letter is ALWAYS rendered — only the color changes, never the content.
            // This means no text layout change occurs when a letter is revealed.
            const revealed = isRevealed(charIdx);
            return (
              <View
                key={`sl${posIdx}`}
                style={[styles.slot, slotSizing, { width: slotWidth, marginHorizontal: slotMargin, borderBottomColor: dashColor(charIdx) }]}
              >
                <Text
                  style={[
                    styles.letter,
                    { fontSize, color: revealed ? letterColor(charIdx) : 'transparent' },
                  ]}
                >
                  {char}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: CONTAINER_PADDING_V,
    paddingHorizontal: 16,
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    // Backstop only. The sizing above should already keep the lines inside
    // this box, but if anything ever did exceed it, a clipped edge inside the
    // word area beats painting over the Guess the Word button underneath.
    overflow: 'hidden',
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  slot: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderBottomWidth: 3,
  },
  letter: {
    fontWeight: 'bold',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  spaceGap: {
    width: 16,
    marginHorizontal: 4,
  },
});

export default WordDisplay;
