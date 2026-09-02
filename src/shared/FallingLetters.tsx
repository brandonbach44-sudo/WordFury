import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// How far (in px) a tile fades in/out as it crosses the top or bottom edge of
// its container. The container clips with overflow:hidden, so without this a
// tile mid-crossing renders as a hard, flat-cut shape — exactly the "cutoffs
// at the top and bottom" look reported by testers. Fading it to transparent
// before it reaches the clip line means the clip never shows anything.
const EDGE_FADE = 45;

interface TileConfig {
  id: number;
  letter: string;
  startX: number;
  delay: number;
  duration: number;
  size: number;
  seedY: number; // >= 0 → starts mid-screen (pre-seeded); -1 → starts from top after delay
}

function FallingTile({ tile, areaHeight }: { tile: TileConfig; areaHeight: number }) {
  const totalDistance = areaHeight + tile.size + 120;
  const isPreSeeded = tile.seedY >= 0;
  const translateY = useRef(new Animated.Value(isPreSeeded ? tile.seedY : -tile.size - 20)).current;

  const bottomEdge = areaHeight - tile.size;
  const opacity = translateY.interpolate({
    inputRange: [
      -tile.size - 20,
      -EDGE_FADE,
      0,
      Math.max(0, bottomEdge - EDGE_FADE),
      bottomEdge,
      totalDistance,
    ],
    outputRange: [0, 0, 1, 1, 0, 0],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    // Each loop waits a random rest before falling again — this is what
    // prevents tiles from syncing into batches over time.
    const fall = (restDelay: number) => {
      timeout = setTimeout(() => {
        translateY.setValue(-tile.size - 20);
        Animated.timing(translateY, {
          toValue: totalDistance,
          duration: tile.duration,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            // Random rest 1–4 s before next fall keeps tiles permanently spread out
            fall(1000 + Math.random() * 3000);
          }
        });
      }, restDelay);
    };

    if (isPreSeeded) {
      // First pass: animate from current mid-screen Y to bottom (proportional duration)
      const remainingFraction = (totalDistance - tile.seedY) / totalDistance;
      Animated.timing(translateY, {
        toValue: totalDistance,
        duration: remainingFraction * tile.duration,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) fall(500 + Math.random() * 2000);
      });
    } else {
      // Incoming tile: staggered initial delay, then loop with random rests
      fall(tile.delay);
    }

    return () => clearTimeout(timeout);
  }, []);

  return (
    <Animated.View
      style={[
        styles.tileWrapper,
        {
          left: tile.startX,
          top: 0,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        style={[
          styles.tile,
          {
            width: tile.size,
            height: tile.size,
            borderRadius: tile.size * 0.18,
          },
        ]}
      >
        <Text style={[styles.letter, { fontSize: tile.size * 0.5 }]}>
          {tile.letter}
        </Text>
      </View>
    </Animated.View>
  );
}

export function FallingLetters() {
  // Measured from the actual rendered box (via onLayout) rather than the raw
  // device window height, since this container sits inside a SafeAreaView and
  // is usually smaller than the window by the status bar / home indicator.
  // Tile positions and the fade math below are generated from this real
  // height, so nothing spawns already past the true visible bottom edge.
  const [areaHeight, setAreaHeight] = useState(0);

  const tiles = useMemo<TileConfig[]>(() => {
    if (areaHeight <= 0) return [];

    // 12 pre-seeded tiles scattered across the screen at mount — immediate visual density
    const preSeeded: TileConfig[] = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      letter: LETTERS[Math.floor(Math.random() * LETTERS.length)],
      startX: Math.random() * (SCREEN_WIDTH - 60),
      delay: 0,
      duration: 10000 + Math.random() * 8000,
      size: 40 + Math.random() * 20,
      seedY: Math.random() * areaHeight * 0.85,
    }));

    // 8 incoming tiles with tight stagger to fill gaps without bunching
    const incoming: TileConfig[] = Array.from({ length: 8 }, (_, i) => ({
      id: 12 + i,
      letter: LETTERS[Math.floor(Math.random() * LETTERS.length)],
      startX: Math.random() * (SCREEN_WIDTH - 60),
      delay: 500 + Math.random() * 5000, // 0.5–5.5 s stagger
      duration: 10000 + Math.random() * 8000,
      size: 40 + Math.random() * 20,
      seedY: -1,
    }));

    return [...preSeeded, ...incoming];
    // Regenerate only when we go from "not yet measured" to "measured" —
    // small later layout wobbles shouldn't restart every tile's animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaHeight > 0]);

  return (
    <View
      style={styles.container}
      pointerEvents="none"
      onLayout={(e: LayoutChangeEvent) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && areaHeight === 0) setAreaHeight(h);
      }}
    >
      {tiles.map((tile) => (
        <FallingTile key={tile.id} tile={tile} areaHeight={areaHeight} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  tileWrapper: {
    position: 'absolute',
  },
  tile: {
    backgroundColor: '#FFECB3',
    borderWidth: 2,
    borderColor: '#FFD54F',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
    opacity: 0.85,
  },
  letter: {
    fontWeight: 'bold',
    color: '#5D4037',
  },
});
