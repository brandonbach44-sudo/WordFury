// src/shared/leaderboards/boardCache.ts
//
// Loaded boards are cached for 60 seconds so flipping between tabs and
// screens doesn't reload them. Posting a score clears the cache, so a menu
// card never shows a board from before the player's own result.

import type { LoadedBoard } from './entries';

const TTL_MS = 60000;
const cache = new Map<string, { at: number; data: LoadedBoard }>();

export function boardCacheKey(boardId: string, scope: string, back: number, count: number): string {
  return `${boardId}|${scope}|${back}|${count}`;
}

export function getCachedBoard(key: string): LoadedBoard | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

export function setCachedBoard(key: string, data: LoadedBoard): void {
  cache.set(key, { at: Date.now(), data });
}

export function invalidateBoardCache(boardId?: string): void {
  if (!boardId) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${boardId}|`)) cache.delete(key);
  }
}
