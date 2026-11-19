// modules/game-center/index.ts
//
// JS face of the local Game Center module. On anything without the native
// module (Android, web, Expo Go) `GameCenter` is null and callers treat the
// player as signed out.

import { requireOptionalNativeModule } from 'expo';

type EventSubscription = { remove(): void };

export type GameCenterAuthState = {
  isAuthenticated: boolean;
  isRestricted: boolean;
  playerId: string;
  displayName: string;
  canPresentSignIn: boolean;
};

export type GameCenterEntry = {
  rank: number;
  value: number;
  context: number;
  displayName: string;
  playerId: string;
  isLocal: boolean;
};

export type GameCenterOccurrence = {
  /** Epoch ms, or -1 when the board isn't recurring. */
  startDate: number;
  durationSeconds: number;
  nextStartDate: number;
};

export type GameCenterEntriesResult = {
  local?: GameCenterEntry;
  entries: GameCenterEntry[];
  totalPlayerCount: number;
  occurrenceStart: number;
  durationSeconds: number;
};

export type FriendsAuthorizationStatus = 'notDetermined' | 'authorized' | 'denied' | 'restricted';

type GameCenterNativeModule = {
  authenticate(): Promise<GameCenterAuthState>;
  getAuthState(): Promise<GameCenterAuthState>;
  presentSignIn(): Promise<boolean>;
  submitScore(boardId: string, value: number, context: number): Promise<void>;
  loadOccurrence(boardId: string): Promise<GameCenterOccurrence>;
  loadEntries(
    boardId: string,
    scope: 'global' | 'friends',
    first: number,
    count: number,
    occurrencesBack: number,
  ): Promise<GameCenterEntriesResult>;
  friendsAuthorizationStatus(): Promise<FriendsAuthorizationStatus>;
  requestFriendsAuthorization(): Promise<FriendsAuthorizationStatus>;
  addListener(
    eventName: 'onAuthChange',
    listener: (state: GameCenterAuthState) => void,
  ): EventSubscription;
};

export const GameCenter = requireOptionalNativeModule<GameCenterNativeModule>('GameCenter');
