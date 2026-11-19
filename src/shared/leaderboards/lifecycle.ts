// src/shared/leaderboards/lifecycle.ts
//
// App-level upkeep: when the app comes to the foreground or the player
// signs in, send queued scores, collect settled bonuses and post the weekly
// total. A fresh install's ledger is rebuilt from Game Center on sign-in.

import { subscribeGameCenter, isSignedIn } from './gameCenter';
import { refreshFury } from './ledger';
import { flushPending } from './submit';

let running: Promise<void> | null = null;

/** Safe to call often: overlapping calls share one run. */
export function syncLeaderboards(): Promise<void> {
  if (!isSignedIn()) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    try {
      await flushPending();
      await refreshFury({ rebuild: 'ifMissing' });
    } finally {
      running = null;
    }
  })();
  return running;
}

let installed = false;

/** Runs a sync every time the player becomes signed in. */
export function installLeaderboardSync(): void {
  if (installed) return;
  installed = true;
  let wasSignedIn = isSignedIn();
  subscribeGameCenter((s) => {
    const now = s.status === 'signedIn';
    if (now && !wasSignedIn) syncLeaderboards();
    wasSignedIn = now;
  });
}
