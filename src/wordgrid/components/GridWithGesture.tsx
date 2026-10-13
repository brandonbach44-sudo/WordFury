// app/wordgrid/components/GridWithGesture.tsx
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Line } from 'react-native-svg';
import type { Position } from '../utils/pathFinder';

const GRID_SIZE = 4;
const CELL_GAP = 8;
const GRID_PADDING = 12;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CELL_SIZE = Math.floor(
  (SCREEN_WIDTH - 48 - GRID_PADDING * 2 - CELL_GAP * (GRID_SIZE - 1)) / GRID_SIZE
);
const CELL_STEP = CELL_SIZE + CELL_GAP;
const GRID_DIM = GRID_SIZE * CELL_SIZE + CELL_GAP * (GRID_SIZE - 1);

// Anti-trembling: ignore finger movement within this radius of the current cell center.
// Kept small — the Voronoi midpoint is the real boundary; this just prevents jitter.
const DEAD_ZONE = CELL_STEP * 0.15;

// Extra clearance required before a backtrack fires.
// The finger must be BACKTRACK_GAP px CLOSER to the previous cell than to the current one.
// Forces a genuine reversal past the midpoint rather than a micro-wobble.
const BACKTRACK_GAP = CELL_STEP * 0.20;

// Smoothing applied to the raw touch point before it's used for cell detection
// (0 = no smoothing/raw point, 1 = frozen). At a 4-cell corner, the current cell
// and both orthogonal neighbors and the diagonal one are all momentarily
// equidistant — real finger jitter at that exact point is what causes "hooking"
// the wrong letter. Smoothing removes the jitter so the touch resolves toward
// wherever it's actually, consistently heading. The live rubber-band line still
// uses the raw point so the visual feels responsive.
const SMOOTHING_ALPHA = 0.55;

// Absolute confidence radius for committing to a NEW cell going forward.
// At the exact point where 4 cells meet (a grid corner), the candidate cell's
// center is ~0.707 * CELL_STEP away — the true geometric ambiguity point.
// Requiring the smoothed touch to be closer than this to the candidate's own
// center (not just "closer than to the old cell", which compounds badly on
// diagonals) means we simply wait out the corner instead of guessing there,
// with no extra penalty once the finger is clearly heading into a cell.
const CONFIDENT_RADIUS = CELL_STEP * 0.52;

// How strongly the recent swipe direction breaks ties between candidate cells
// that are nearly equidistant from the touch (the corner case). Expressed as
// a distance "discount" in px awarded to a candidate perfectly aligned with
// the direction the finger has actually been moving. Kept small relative to
// CELL_STEP so it only ever matters near corners — it never overrides a
// candidate that's clearly closer for an unrelated reason.
const DIRECTION_BIAS = CELL_STEP * 0.22;

// How much the instantaneous frame-to-frame movement is smoothed into a
// running "swipe direction" estimate. Higher = steadier direction, slower to
// react to a genuine change in swipe direction.
const VELOCITY_ALPHA = 0.5;

// How far the finger may drift from where it touched down before this stops
// being a tap and becomes a drag. Absolute px, not CELL_STEP-relative -- this
// is about distinguishing finger tremor from an intentional swipe, not about
// grid geometry.
const TAP_SLOP = 10;

// Center pixel of a cell (relative to the inner gesture area, offset by padding)
function cellCenter(pos: Position) {
  return {
    x: GRID_PADDING + pos.col * CELL_STEP + CELL_SIZE / 2,
    y: GRID_PADDING + pos.row * CELL_STEP + CELL_SIZE / 2,
  };
}

// Voronoi assignment: which of the 16 cells is the finger physically closest to?
// This is more robust than angle-sector math — the finger lands where it is,
// not where a 45° sector says it should be.
function getClosestCell(touchX: number, touchY: number): Position {
  let bestDistSq = Infinity;
  let bestCell: Position = { row: 0, col: 0 };
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const c = cellCenter({ row, col });
      const d = (touchX - c.x) ** 2 + (touchY - c.y) ** 2;
      if (d < bestDistSq) {
        bestDistSq = d;
        bestCell = { row, col };
      }
    }
  }
  return bestCell;
}

// True if a and b are 8-directionally adjacent (not the same cell).
function isAdjacent(a: Position, b: Position): boolean {
  return (
    Math.abs(a.row - b.row) <= 1 &&
    Math.abs(a.col - b.col) <= 1 &&
    !(a.row === b.row && a.col === b.col)
  );
}

// The up-to-8 cells adjacent to pos, clipped to the grid bounds.
function neighborsOf(pos: Position): Position[] {
  const out: Position[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const row = pos.row + dr;
      const col = pos.col + dc;
      if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE) {
        out.push({ row, col });
      }
    }
  }
  return out;
}

// Picks the best next cell out of `lastCell` and its neighbors, biasing
// toward whichever candidate best matches the direction the finger has
// actually been swiping (see DIRECTION_BIAS). Restricting the search to
// lastCell's neighborhood (rather than all 16 cells) also means we only ever
// compare cells that are actually reachable next, which is exactly what the
// adjacency gate downstream needs anyway.
function pickNextCell(
  lastCell: Position,
  touch: { x: number; y: number },
  velocity: { x: number; y: number }
): Position {
  const lastCenter = cellCenter(lastCell);
  const velLen = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
  const velUnit = velLen > 0.5 ? { x: velocity.x / velLen, y: velocity.y / velLen } : null;

  let best = lastCell;
  let bestScore = Infinity;
  for (const cand of [lastCell, ...neighborsOf(lastCell)]) {
    const c = cellCenter(cand);
    const dx = touch.x - c.x;
    const dy = touch.y - c.y;
    let score = Math.sqrt(dx * dx + dy * dy);

    const isSameCell = cand.row === lastCell.row && cand.col === lastCell.col;
    if (velUnit && !isSameCell) {
      const toCandX = c.x - lastCenter.x;
      const toCandY = c.y - lastCenter.y;
      const toCandLen = Math.sqrt(toCandX ** 2 + toCandY ** 2);
      const alignment = (toCandX * velUnit.x + toCandY * velUnit.y) / toCandLen; // -1..1
      score -= alignment * DIRECTION_BIAS;
    }

    if (score < bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return best;
}

// Applies one tap to an existing path, per the tap rules:
//   adjacent unselected letter -> append
//   the most recent letter -> remove it
//   an earlier selected letter -> truncate back to and including it
//   a non-adjacent letter -> reject, path unchanged
// An empty path accepts any first tile (there's nothing to be adjacent to).
function applyTapToPath(
  path: Position[],
  cell: Position
): { path: Position[]; rejected: boolean } {
  if (path.length === 0) {
    return { path: [cell], rejected: false };
  }

  const existingIdx = path.findIndex((c) => c.row === cell.row && c.col === cell.col);

  if (existingIdx === path.length - 1) {
    // Tapping the most recent letter removes it.
    return { path: path.slice(0, -1), rejected: false };
  }

  if (existingIdx !== -1) {
    // Tapping an earlier letter truncates back to it -- same trim operation
    // the drag backtrack branch in onUpdate performs, just driven by a tap.
    return { path: path.slice(0, existingIdx + 1), rejected: false };
  }

  const last = path[path.length - 1];
  if (!isAdjacent(last, cell)) {
    return { path, rejected: true };
  }

  return { path: [...path, cell], rejected: false };
}

export interface GridWithGestureHandle {
  /** Submits the current selection, as if the word strip were tapped. No-op below 3 letters. */
  submitSelection: () => void;
  /** Clears the current tap selection, as if the player tapped outside the grid. */
  clearSelection: () => void;
}

interface Props {
  grid: string[][];
  onPathComplete: (path: Position[]) => void;
  onSelectionChange?: (path: Position[]) => void;
  onTapRejected?: () => void;
  disabled?: boolean;
}

const GridWithGesture = forwardRef<GridWithGestureHandle, Props>(function GridWithGesture(
  { grid, onPathComplete, onSelectionChange, onTapRejected, disabled = false },
  ref
) {
  const [selectedCells, setSelectedCells] = useState<Position[]>([]);
  const [livePoint, setLivePoint] = useState<{ x: number; y: number } | null>(null);
  const pathRef = useRef<Position[]>([]);
  // Smoothed touch point used for cell-detection math (see SMOOTHING_ALPHA above).
  const smoothedRef = useRef<{ x: number; y: number } | null>(null);
  // Running estimate of swipe direction, used to bias corner ties (see DIRECTION_BIAS).
  const velocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Whether the current touch has moved past TAP_SLOP -- decides tap vs drag at onEnd.
  const movedRef = useRef(false);
  // Whether this gesture instance's onEnd already ran, so onFinalize's
  // cancellation fallback doesn't also fire (and wipe a tap it just made).
  const endHandledRef = useRef(false);
  // The cell under the finger at touch-down. If this touch turns into a
  // drag, onUpdate starts the drag path fresh from here, discarding whatever
  // tap preview onBegin optimistically applied.
  const dragStartCellRef = useRef<Position>({ row: 0, col: 0 });
  // Whether onBegin's optimistic tap application was a reject (non-adjacent
  // letter). Only acted on on if the touch stays a tap through onEnd -- a
  // touch that becomes a drag is a valid drag start from anywhere.
  const pendingRejectRef = useRef(false);
  const modeRef = useRef<'idle' | 'dragging' | 'tapping'>('idle');

  const updateSelection = (next: Position[]) => {
    pathRef.current = next;
    setSelectedCells(next);
    onSelectionChange?.(next);
  };

  // Submit the current path and reset state. Called from onEnd for a drag
  // (a word commits when the finger actually lifts, never just from holding
  // still mid-drag -- a pause timer used to auto-submit after 300ms
  // stationary, which cut a run short any time a player paused to think
  // about where to go next) and from submitSelection for a tapped word.
  const submitPath = () => {
    const path = pathRef.current;
    updateSelection([]);
    setLivePoint(null);
    if (path.length >= 3) onPathComplete(path);
  };

  useImperativeHandle(ref, () => ({
    submitSelection: () => {
      if (pathRef.current.length < 3) return;
      modeRef.current = 'idle';
      submitPath();
    },
    clearSelection: () => {
      if (pathRef.current.length === 0) return;
      modeRef.current = 'idle';
      updateSelection([]);
      setLivePoint(null);
    },
  }));

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => {
      const cell = getClosestCell(e.x, e.y);
      dragStartCellRef.current = cell;
      movedRef.current = false;
      endHandledRef.current = false;
      setLivePoint({ x: e.x, y: e.y });

      // Optimistically apply this touch as a tap against whatever's
      // currently selected, for the same instant feedback a drag has always
      // had -- most touches ARE taps, and there's nothing left to correct at
      // onEnd if this turns out to be one. If it turns into a drag instead,
      // onUpdate overrides this the moment real movement is seen.
      const result = applyTapToPath(pathRef.current, cell);
      pendingRejectRef.current = result.rejected;
      if (!result.rejected) updateSelection(result.path);
      // A reject leaves the current selection untouched, exactly as the tap
      // rules require -- shown only if this stays a tap through onEnd.
    })
    .onStart((_e) => {
      // onBegin already committed the starting cell — do NOT override it here.
    })
    .onUpdate((e) => {
      setLivePoint({ x: e.x, y: e.y });

      if (!movedRef.current) {
        if (Math.hypot(e.translationX, e.translationY) <= TAP_SLOP) return;
        // Real movement: this is a drag, not a tap. Starting a drag clears
        // any existing (or just-previewed) tap selection and begins fresh
        // from wherever the finger touched down.
        movedRef.current = true;
        modeRef.current = 'dragging';
        updateSelection([dragStartCellRef.current]);
        smoothedRef.current = { x: e.x, y: e.y };
        velocityRef.current = { x: 0, y: 0 };
      }

      // Update the smoothed point (EMA) used for all cell-detection math below.
      // This is what removes corner jitter without penalizing genuine diagonal moves.
      const prevSmoothed = smoothedRef.current ?? { x: e.x, y: e.y };
      const smoothed = {
        x: prevSmoothed.x + (e.x - prevSmoothed.x) * (1 - SMOOTHING_ALPHA),
        y: prevSmoothed.y + (e.y - prevSmoothed.y) * (1 - SMOOTHING_ALPHA),
      };
      smoothedRef.current = smoothed;

      // Update the running swipe-direction estimate from this frame's movement.
      const frameDx = smoothed.x - prevSmoothed.x;
      const frameDy = smoothed.y - prevSmoothed.y;
      velocityRef.current = {
        x: velocityRef.current.x * VELOCITY_ALPHA + frameDx * (1 - VELOCITY_ALPHA),
        y: velocityRef.current.y * VELOCITY_ALPHA + frameDy * (1 - VELOCITY_ALPHA),
      };

      const path = pathRef.current;
      if (path.length === 0) return;

      const lastCell = path[path.length - 1];
      const lastCenter = cellCenter(lastCell);
      const dx = smoothed.x - lastCenter.x;
      const dy = smoothed.y - lastCenter.y;
      const distFromLast = Math.sqrt(dx * dx + dy * dy);

      // Anti-trembling: ignore tiny movements right around the current cell center.
      if (distFromLast < DEAD_ZONE) return;

      // Which of lastCell's neighbors (or lastCell itself) best fits the
      // touch point, biased toward the direction we've actually been swiping.
      const closest = pickNextCell(lastCell, smoothed, velocityRef.current);

      // Still in the same cell's territory — nothing to do.
      if (closest.row === lastCell.row && closest.col === lastCell.col) return;

      // We only snap to cells that are adjacent to the current last cell.
      // This prevents "jumping" across the grid on fast swipes.
      if (!isAdjacent(lastCell, closest)) return;

      const existingIdx = path.findIndex(
        (c) => c.row === closest.row && c.col === closest.col
      );

      if (existingIdx !== -1 && existingIdx !== path.length - 1) {
        // Potential backtrack — require the finger to be convincingly past the midpoint
        // toward the previous cell before trimming, so micro-wobbles don't revert.
        const closestCenter = cellCenter(closest);
        const distToClosest = Math.sqrt(
          (smoothed.x - closestCenter.x) ** 2 + (smoothed.y - closestCenter.y) ** 2
        );
        // distFromLast - distToClosest = how much closer we are to the backtrack target
        // than to the cell we're leaving. Must exceed BACKTRACK_GAP.
        if (distFromLast - distToClosest < BACKTRACK_GAP) return;

        updateSelection(path.slice(0, existingIdx + 1));
        return;
      }

      // Already the last cell in the path — no change.
      if (existingIdx === path.length - 1) return;

      // Confidence check: don't commit to the candidate while the touch is still
      // sitting near the ambiguous corner point shared by 4 cells. Wait until it's
      // clearly inside the candidate's own territory. This is an absolute check
      // (distance to the candidate's center only), so it doesn't compound across
      // orthogonal-then-diagonal transitions the way a relative margin did.
      const closestCenter = cellCenter(closest);
      const distToClosest = Math.sqrt(
        (smoothed.x - closestCenter.x) ** 2 + (smoothed.y - closestCenter.y) ** 2
      );
      if (distToClosest > CONFIDENT_RADIUS) return;

      // Forward: add the new adjacent cell.
      updateSelection([...path, closest]);
    })
    .onEnd(() => {
      endHandledRef.current = true;

      if (!movedRef.current) {
        // Stayed within tap tolerance the whole touch: a genuine tap.
        // onBegin already applied it optimistically -- just finalize the
        // mode and fire the reject feedback if it didn't fit anywhere.
        modeRef.current = pathRef.current.length > 0 ? 'tapping' : 'idle';
        setLivePoint(null);
        if (pendingRejectRef.current) onTapRejected?.();
        return;
      }

      modeRef.current = 'idle';
      submitPath();
    })
    .onFinalize(() => {
      // Covers a cancelled drag (e.g. an incoming call interrupting the
      // touch) that never reached onEnd. A cancelled tap needs no cleanup --
      // onBegin's optimistic update already reflects the correct end state.
      if (endHandledRef.current) return;
      if (movedRef.current) {
        modeRef.current = 'idle';
        submitPath();
      }
    });

  const innerSize = GRID_DIM + GRID_PADDING * 2;

  return (
    <View style={styles.outerContainer}>
      <GestureDetector gesture={panGesture}>
        <View style={[styles.gridContainer, { width: innerSize, height: innerSize }]}>
          {/* Letter cells */}
          <View style={styles.cellsWrapper}>
            {grid.map((row, r) => (
              <View key={r} style={styles.row}>
                {row.map((letter, c) => {
                  const selIndex = selectedCells.findIndex(
                    (cell) => cell.row === r && cell.col === c
                  );
                  const isSelected = selIndex !== -1;
                  return (
                    <View
                      key={c}
                      style={[
                        styles.cell,
                        { width: CELL_SIZE, height: CELL_SIZE },
                        isSelected && styles.selectedCell,
                      ]}
                    >
                      {isSelected && (
                        <View style={styles.indexBadge}>
                          <Text style={styles.indexText}>{selIndex + 1}</Text>
                        </View>
                      )}
                      <Text style={[styles.letter, isSelected && styles.selectedLetter]}>
                        {letter}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Path lines + live rubber-band line */}
          {(selectedCells.length >= 2 || (selectedCells.length === 1 && livePoint)) && (
            <Svg
              style={StyleSheet.absoluteFill}
              width={innerSize}
              height={innerSize}
              pointerEvents="none"
            >
              {/* Committed path lines */}
              {selectedCells.slice(0, -1).map((pos, i) => {
                const from = cellCenter(pos);
                const to = cellCenter(selectedCells[i + 1]);
                return (
                  <Line
                    key={i}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="rgba(255,255,255,0.75)"
                    strokeWidth={7}
                    strokeLinecap="round"
                  />
                );
              })}
              {/* Live rubber-band: last selected cell → current finger */}
              {livePoint && selectedCells.length >= 1 && (() => {
                const from = cellCenter(selectedCells[selectedCells.length - 1]);
                return (
                  <Line
                    x1={from.x}
                    y1={from.y}
                    x2={livePoint.x}
                    y2={livePoint.y}
                    stroke="rgba(255,255,255,0.40)"
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeDasharray="6,5"
                  />
                );
              })()}
            </Svg>
          )}
        </View>
      </GestureDetector>
    </View>
  );
});

export default GridWithGesture;

const styles = StyleSheet.create({
  outerContainer: {
    alignSelf: 'center',
    marginVertical: 12,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#4ecca3',
    overflow: 'hidden',
  },
  gridContainer: {
    alignSelf: 'center',
  },
  cellsWrapper: {
    padding: GRID_PADDING,
    gap: CELL_GAP,
  },
  row: {
    flexDirection: 'row',
    gap: CELL_GAP,
  },
  cell: {
    borderWidth: 1.5,
    borderColor: '#c8b89a',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f0e6',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.13,
    shadowRadius: 4,
    elevation: 4,
  },
  selectedCell: {
    backgroundColor: '#4ecca3',
    borderColor: '#3db892',
  },
  letter: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#3d2e1c',
  },
  selectedLetter: {
    color: '#fff',
  },
  indexBadge: {
    position: 'absolute',
    top: 3,
    right: 5,
  },
  indexText: {
    fontSize: 9,
    color: '#fff',
    fontWeight: 'bold',
  },
});
