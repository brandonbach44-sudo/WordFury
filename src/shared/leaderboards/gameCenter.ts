// src/shared/leaderboards/gameCenter.ts
//
// Game Center sign-in state for the whole app.
//
// On iOS 26, installing GameKit's authenticate handler while the player is
// signed out shows a full-screen sign-in. So the handler is never installed
// on a first launch: only once the player has finished a daily or tapped a
// leaderboard card. From then on it is installed at every launch, from the
// root layout, without blocking anything.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { GameCenter, type GameCenterAuthState } from '../../../modules/game-center';

const ENABLED_KEY = 'gamecenter_enabled_v1';

// How long to wait for GameKit's first auth callback before treating the
// player as signed out for now. A later callback still updates the state.
const AUTH_TIMEOUT_MS = 15000;

export type GameCenterStatus =
  | 'unavailable' // no native module (Android, web, Expo Go)
  | 'notEnabled' // never asked: the player hasn't finished a daily or tapped a board yet
  | 'loading'
  | 'signedOut'
  | 'restricted' // child account or parental controls; treated as signed out
  | 'signedIn';

export type GameCenterState = {
  status: GameCenterStatus;
  playerId: string | null;
  displayName: string | null;
  canPresentSignIn: boolean;
};

let state: GameCenterState = {
  status: GameCenter && Platform.OS === 'ios' ? 'notEnabled' : 'unavailable',
  playerId: null,
  displayName: null,
  canPresentSignIn: false,
};
const listeners = new Set<(s: GameCenterState) => void>();
let authPromise: Promise<GameCenterState> | null = null;
let authListenerInstalled = false;

function setState(next: GameCenterState) {
  state = next;
  listeners.forEach((l) => l(state));
}

function fromNative(native: GameCenterAuthState): GameCenterState {
  if (native.isAuthenticated) {
    return {
      status: 'signedIn',
      playerId: native.playerId || null,
      displayName: native.displayName || null,
      canPresentSignIn: false,
    };
  }
  return {
    status: native.isRestricted ? 'restricted' : 'signedOut',
    playerId: null,
    displayName: null,
    canPresentSignIn: native.canPresentSignIn,
  };
}

export function getGameCenterState(): GameCenterState {
  return state;
}

export function isSignedIn(): boolean {
  return state.status === 'signedIn';
}

export function subscribeGameCenter(listener: (s: GameCenterState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React view of the sign-in state. */
export function useGameCenterState(): GameCenterState {
  const [s, setS] = useState(state);
  useEffect(() => {
    setS(state);
    return subscribeGameCenter(setS);
  }, []);
  return s;
}

function authenticate(): Promise<GameCenterState> {
  if (!GameCenter || Platform.OS !== 'ios') return Promise.resolve(state);
  if (authPromise) return authPromise;

  if (!authListenerInstalled) {
    authListenerInstalled = true;
    GameCenter.addListener('onAuthChange', (native) => setState(fromNative(native)));
  }
  if (state.status === 'notEnabled') setState({ ...state, status: 'loading' });

  const native = GameCenter;
  authPromise = new Promise<GameCenterState>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // No answer yet: count as signed out until GameKit says otherwise.
      if (state.status === 'loading') setState({ ...state, status: 'signedOut' });
      resolve(state);
    }, AUTH_TIMEOUT_MS);
    native
      .authenticate()
      .then((result) => {
        setState(fromNative(result));
      })
      .catch(() => {
        setState({ ...state, status: 'signedOut' });
      })
      .finally(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(state);
      });
  });
  return authPromise;
}

/**
 * Called once at launch from the root layout. Installs the authenticate
 * handler only if the player has opted in before; never on a first launch.
 */
export async function initGameCenterAtLaunch(): Promise<void> {
  if (state.status === 'unavailable') return;
  try {
    const enabled = await AsyncStorage.getItem(ENABLED_KEY);
    if (enabled === '1') authenticate();
  } catch {
    // Storage unavailable: stay quiet, the next daily or board tap enables it.
  }
}

/**
 * Opts the player in (after a finished daily, or a tap on a leaderboard card)
 * and signs in. Resolves with the resulting state.
 */
export async function enableGameCenter(): Promise<GameCenterState> {
  if (state.status === 'unavailable') return state;
  try {
    await AsyncStorage.setItem(ENABLED_KEY, '1');
  } catch {
    // Not fatal: this session still signs in.
  }
  return authenticate();
}

export type SignInOutcome = 'signedIn' | 'presented' | 'useSettings' | 'restricted' | 'unavailable';

/**
 * What a tap on "Sign in to Game Center to compete" does: enable, then show
 * Apple's sign-in view if GameKit provided one. Otherwise the player has to
 * sign in from the Game Center section of the Settings app.
 */
export async function requestGameCenterSignIn(): Promise<SignInOutcome> {
  if (!GameCenter || state.status === 'unavailable') return 'unavailable';
  const s = await enableGameCenter();
  if (s.status === 'signedIn') return 'signedIn';
  if (s.status === 'restricted') return 'restricted';
  try {
    const presented = await GameCenter.presentSignIn();
    return presented ? 'presented' : 'useSettings';
  } catch {
    return 'useSettings';
  }
}

export const SIGN_IN_SETTINGS_HINT =
  'Open the Settings app, tap Game Center, and sign in. Then come back to Word Fury.';
