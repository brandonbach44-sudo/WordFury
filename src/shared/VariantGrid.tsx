// src/shared/VariantGrid.tsx
// Wrapping grid for the style/variant pickers in the Customize popups
// (Anagrams cubes, Wordsmith tiles, Furdle keys). These used to be
// horizontal ScrollViews, but the Customize tab sits inside a screen whose
// Play / Stats / Customize tabs also swipe horizontally, so swiping the
// picker swiped the page and the cards cut off at either end were
// unreachable. Every card is now visible at once with no scrolling.
//
// The grid measures the width it is given and picks a column count that
// keeps rows balanced: as few rows as fit, then the fewest columns that
// still fill them, so 6 cards lay out 3 + 3 rather than 4 + 2 and 7 cards
// 4 + 3. A short last row is centred.
import React, { useState } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';

interface VariantGridProps {
  /** Rendered width of one card, including padding and border. */
  itemWidth: number;
  itemCount: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function variantGridColumns(
  itemCount: number,
  availableWidth: number,
  itemWidth: number,
  gap: number,
): number {
  const maxCols = Math.max(1, Math.floor((availableWidth + gap) / (itemWidth + gap)));
  const rows = Math.ceil(itemCount / maxCols);
  return Math.max(1, Math.ceil(itemCount / rows));
}

export default function VariantGrid({ itemWidth, itemCount, gap = 12, style, children }: VariantGridProps) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const cols = availableWidth > 0
    ? variantGridColumns(itemCount, availableWidth, itemWidth, gap)
    : itemCount;
  const rowWidth = cols * itemWidth + (cols - 1) * gap;

  return (
    <View
      style={[styles.outer, availableWidth === 0 && styles.unmeasured]}
      onLayout={(e) => setAvailableWidth(e.nativeEvent.layout.width)}
    >
      <View style={[styles.grid, { gap, width: rowWidth }, style]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { alignItems: 'center' },
  // Hidden for the one frame before the width is known, so the grid never
  // flashes at the wrong column count.
  unmeasured: { opacity: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});
