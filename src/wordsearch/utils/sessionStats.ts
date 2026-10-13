// src/wordsearch/utils/sessionStats.ts
//
// A count that only means "since the app was opened," never persisted. This
// backs Quick Play's third results pill, which the redesign specifically
// wants to be a sitting's number rather than a lifetime one (a "Best" pill
// would otherwise repeat the lifetime ghost row directly below it).
//
// A module-level variable rather than component state: PlayScreen unmounts
// and remounts on every Quick Play "Play Again" (`router.replace` to the same
// route), so state kept in that component would reset to 0 every round.
let practiceRoundsThisSession = 0;

export function incrementWordSearchPracticeRoundsThisSession(): number {
  practiceRoundsThisSession += 1;
  return practiceRoundsThisSession;
}
