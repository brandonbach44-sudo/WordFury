// src/anagrams/utils/sessionStats.ts
//
// A count that only means "since the app was opened," never persisted. This
// backs Quick Play's third results pill, which the redesign specifically
// wants to be a sitting's number rather than a lifetime one (a repeated
// lifetime stat would just duplicate the ghost row directly below it).
//
// A module-level variable rather than component state: AnagramsPlayScreen
// remounts on every Quick Play "Play Again" (app/anagrams/game.tsx bumps a
// `key` to force a fresh mount), so state kept in that component would reset
// to 0 every round. Same pattern as Word Search's sessionStats.ts.
let practiceRoundsThisSession = 0;

export function incrementAnagramsPracticeRoundsThisSession(): number {
  practiceRoundsThisSession += 1;
  return practiceRoundsThisSession;
}
