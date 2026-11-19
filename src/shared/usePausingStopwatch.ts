// src/shared/usePausingStopwatch.ts
//
// Count-up stopwatch that only runs while the app is in the foreground.
// Used for dailies with no time limit (Hangman), where time only breaks
// ties: thinking time inside the app counts, time spent away does not.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

export function usePausingStopwatch(onPause?: (seconds: number) => void) {
  const accumulatedMs = useRef(0);
  const segmentStart = useRef<number | null>(null);
  const running = useRef(false);
  const onPauseRef = useRef(onPause);
  useEffect(() => {
    onPauseRef.current = onPause;
  }, [onPause]);

  const read = useCallback((): number => {
    const live = segmentStart.current !== null ? Math.max(0, Date.now() - segmentStart.current) : 0;
    return Math.max(0, Math.round((accumulatedMs.current + live) / 1000));
  }, []);

  /** Starts (or resumes) timing from `initialSeconds` already on the clock. */
  const start = useCallback((initialSeconds: number = 0) => {
    accumulatedMs.current = Math.max(0, initialSeconds) * 1000;
    segmentStart.current = AppState.currentState === 'active' ? Date.now() : null;
    running.current = true;
  }, []);

  /** Stops timing and returns the final whole seconds. */
  const stop = useCallback((): number => {
    const seconds = read();
    accumulatedMs.current = seconds * 1000;
    segmentStart.current = null;
    running.current = false;
    return seconds;
  }, [read]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (!running.current) return;
      if (state === 'active') {
        if (segmentStart.current === null) segmentStart.current = Date.now();
        return;
      }
      if (segmentStart.current !== null) {
        accumulatedMs.current += Math.max(0, Date.now() - segmentStart.current);
        segmentStart.current = null;
        onPauseRef.current?.(read());
      }
    });
    return () => sub.remove();
  }, [read]);

  return useMemo(() => ({ start, stop, read }), [start, stop, read]);
}
