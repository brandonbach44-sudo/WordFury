// src/shared/leaderboards/friends.ts
//
// Game Center friends access. Asked for the first time the Friends tab is
// opened, never at launch. Without the NSGKFriendListUsageDescription string
// (added by the game-center config plugin) every friends call errors.

import { useCallback, useEffect, useState } from 'react';
import { GameCenter, type FriendsAuthorizationStatus } from '../../../modules/game-center';
import { useGameCenterState } from './gameCenter';

export type FriendsAccess = FriendsAuthorizationStatus | 'checking' | 'unavailable';

export function useFriendsAccess(active: boolean): { access: FriendsAccess; request: () => void } {
  const gc = useGameCenterState();
  const [access, setAccess] = useState<FriendsAccess>('checking');

  const request = useCallback(() => {
    if (!GameCenter) return;
    setAccess('checking');
    GameCenter.requestFriendsAuthorization()
      .then(setAccess)
      .catch(() => setAccess('denied'));
  }, []);

  useEffect(() => {
    if (!active) return;
    if (!GameCenter || gc.status !== 'signedIn') {
      setAccess('unavailable');
      return;
    }
    let cancelled = false;
    GameCenter.friendsAuthorizationStatus()
      .then((status) => {
        if (cancelled) return;
        if (status === 'notDetermined') {
          // First visit to the Friends tab: this is the moment to ask.
          request();
        } else {
          setAccess(status);
        }
      })
      .catch(() => {
        if (!cancelled) setAccess('denied');
      });
    return () => {
      cancelled = true;
    };
  }, [active, gc.status, request]);

  return { access, request };
}

export const FRIENDS_DENIED_HELP =
  "Word Fury can't see your Game Center friends yet. Allow it in Settings, then come back to this tab.";
