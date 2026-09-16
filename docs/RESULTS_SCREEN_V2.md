# Results screen v2: cards and pills

Rebuilds `src/shared/ResultsScreen.tsx` around the card-and-pill look testers
preferred, without giving up the rule that every screen fits on one page.

Mockups of all thirteen screens, at true 430x932 scale, are the reference for
anything this document leaves ambiguous. Match them.

Baseline: commit `764df57` on `main`.

## Why this is a rewrite and not a restyle

Build 30 replaced the card layout with three square cells and a dotted tally
because the card version ran 977pt into about 799pt of usable height. Testers
liked the cards. The height problem was real, so the cards only come back if
the space is found somewhere else.

It was found in two places:

1. **Three pills per row instead of two.** The old screen hard-coded two pills
   in a 382pt content area while the pills were 120pt wide, so a third stat
   orphaned onto its own row. Three across removes the orphan and saves roughly
   120pt per screen.
2. **Lifetime stats become pills too, not a dotted list.** The tally is gone
   entirely. Brandon's words: the All Time block was confusing and hard to read.

That is the whole budget story. Do not reintroduce a two-per-row pill layout or
a dotted leader row.

## The three weights

The page must read in three levels of emphasis with no explanatory labels:

| Weight | What it carries | Treatment |
|---|---|---|
| Hero card | the one number that defines the round | solid white card, 54px value |
| White pills | this round | white fill, 18px value, body ink |
| Ghost pills | all time | translucent fill, 15px value, secondary ink |

If a number does not belong to exactly one of those three, it does not go on
the screen.

## Exact values

All colors come from `background.*` in `ThemeContext`, never from `COLORS`.
The two literals below are the only hardcoded colors allowed.

The placeholder for a value with nothing to show yet is `'-'`, never an em
dash. This has come back three times now; do not reintroduce it.

```
card fill            background.cardColor
card border          background.borderColor at 45% opacity
quiet rule           background.borderColor at 28% opacity
card radius          18
card padding         14, or 16 for the hero and any card holding tiles

pill                 radius 999, border 1px at 45%, padding 9 vertical / 6 horizontal
pill label           9px / 800 / letterSpacing 1.1 / uppercase / background.secondaryText
pill value           18px / 900 / background.textColor, marginTop 2
pill row             flexDirection row, gap 8, marginTop 12, every pill flex 1

ghost pill           same shape, fill #ffffff at 45% opacity, border 1px at 28%
ghost pill value     15px / 900 / background.secondaryText, marginTop 1
ghost pill row       gap 8, marginTop 8

hero card            contents CENTERED, all three lines. The label, value and
                     note are centre aligned and the card centres its children.
                     This was missing from build 40 and the score sat left.
hero label           10px / 800 / letterSpacing 2.2 / uppercase / secondaryText
hero value           54px / 900 / letterSpacing -1 / lineHeight 1.02 / textColor
hero suffix          20px / 800 / secondaryText, inline after the value
hero note            12px / 600 / secondaryText, marginTop 3
hero card            marginTop 16

caption              10px / 800 / letterSpacing 2.2 / uppercase / secondaryText, marginTop 16
chip                 radius 999, padding 5 vertical / 11 horizontal, 12px / 800 / letterSpacing 0.6
chip, highlighted    fill background.accentColor, white ink, accent border
                     AT MOST ONE chip per screen is highlighted, the notable one
                     (best word, longest find). Build 40 filled every chip, which
                     makes the highlight meaningless and the list heavy.
chip wrap            flexWrap, gap 6, marginTop 8
toggle row           1px dashed border, radius 999, padding 8, 12px / 800 / secondaryText

letter tile          44x50, radius 10, 1px border, 22px / 900 (the rack in Anagrams)
word tile, solved    46x46, radius 10, fill #22c55e, white ink, 24px / 900, gap 6
word tile, lost      46x46, radius 10, transparent fill, 2px border in borderColor,
                     body ink, 24px / 900, gap 6

badge pill           1.5px border, radius 999, padding 4 vertical / 14 horizontal,
                     11px / 800 / letterSpacing 1.4 / uppercase / secondaryText, marginTop 10
                     segments joined with " · ", one pill, never a row of pills

footer               pinned, paddingBottom 34
                     Main Menu and Play Again sit in a ROW and use flex 1 to
                     split the width. Share is a standalone child of the footer
                     COLUMN and must NOT carry flex 1: in a column that sets
                     flexBasis 0 on its height, so the button collapses to its
                     padding and the label clips to nothing. That shipped in
                     build 40 as an empty green pill.
Main Menu            2px border, radius 999, padding 11, 14px / 800
Share Result         fill #22c55e, radius 999, padding 12, white 14px / 800, marginTop 10
Play Again           same as Main Menu, used in place of the countdown in Quick Play
```

Header, title and subtitle keep their current values from the shipped file:
game name 13 / 700 / letterSpacing 2, title 24 / 900, subtitle 14 / 600.

## The component API

Replace the `cells` and `groups` props. New shape:

```
gameName, onClose, title, subtitle?
badge?: string[]                // one pill, segments joined with a middot.
                                // Quick Play prepends "Quick Play" as segment one.
hero?: { label, value, suffix?, note? }
pills: { label, value }[]       // exactly three, or omit the row entirely
signature?: React.ReactNode     // the one per-game card, see the table below
chips?: { label, highlighted? }[]
toggle?: { label, content }     // collapsible, matches the current answer-key pattern
lifetime?: { caption?, pills: { label, value }[] }   // caption defaults to "All time"
countdown?: { label, value }    // daily only
onMainMenu, onShare?, onPlayAgain?
extra?: React.ReactNode
```

Rules the component enforces, not the caller:

- `pills` is three or nothing. Two pills is the bug this redesign exists to fix,
  so a length other than 3 should fail the build via the type, not render.
- `lifetime.pills` is likewise three.
- `countdown` and `onPlayAgain` are mutually exclusive.
- The footer is pinned and never scrolls. Content above it may not push it.

Export the primitives as well, since the signature blocks are built from them:
`Card`, `Pill`, `GhostPill`, `Chip`, `Caption`, `WordTiles`.

## Per-game composition

Order on every screen: title, subtitle, badge, hero, pills, signature,
chips, toggle, lifetime, countdown or Play Again, footer. A game omits what it
does not have. Nothing is reordered.

| Screen | Hero | Pills | Signature card |
|---|---|---|---|
| Word Search | Score | Found, Time, Streak | none, chips carry it |
| Word Grid | Score | Words, Best, Longest | best word and its points |
| Wordsmith | Score | none, the donut carries them | progress ring plus four stats |
| Furdle, solved | Streak | Guesses, Time, Best | the word in solved tiles |
| Furdle, lost | none | Guesses, Time, Streak | the word in lost tiles, plus the near-miss line |
| Hex Hive | Score | Words, Pangrams, Longest | six-hex rank ladder, distance to next rank |
| Anagrams | Score | Solved, Missed, Time | the letter rack, longest find called out |
| Word Ladder | vs Par | Steps, Par, Time | the chain, each rung with the letter changed |
| Hangman | Streak | Misses, Lives left, Best | word tiles plus spent-miss marks |

Quick Play differs from the daily in exactly three ways, the same three in
every game:

1. `"Quick Play"` as the first segment of `badge`.
2. The third pill cannot be a daily streak, so it becomes this session's number
   (see the table below).
3. `onPlayAgain` instead of `countdown`.

**The badge is not new and it is not only for the mode.** Six games already
pass `badge` today and must keep doing so: Hangman passes the category, Hex Hive
the rank name, Word Ladder the start and end words, Anagrams the perfect-run
bonus, Wordsmith the mode and duration. Word Search passes theme, difficulty and
multiplier. Do not fold that content into the subtitle: the subtitle is a
sentence, the badge is metadata, and cramming puzzle data into prose loses the
pill that testers liked. Word Search's badge is
`["Harvest", "Hard", "2x"]`, and on Quick Play `["Quick Play", "Harvest", "Hard", "2x"]`.

Two games no longer need their old badge because the signature card now carries
it better: Furdle passed the solution word, which is now the tile card, and Word
Ladder passed START to END, which is now the chain.

**"This session's number" means this sitting, not a lifetime figure.** It must
never repeat a value already shown in the lifetime ghost row, which is the trap:
a "Best" pill beside a ghost "Best" pill is two numbers saying one thing.

| Game | Quick Play third pill |
|---|---|
| Word Grid | this run's rank among today's runs, e.g. "#2" |
| Furdle | session record, e.g. "4-0" |
| Word Search | rounds this session |
| Wordsmith | rounds this session |
| Hex Hive | rounds this session |
| Anagrams | rounds this session |
| Word Ladder | rounds this session |
| Hangman | none needed, its three pills are Misses, Lives and Letters |

Everything else, Share included, is identical.

## Decisions to preserve

**No percentage on Wordsmith.** The ring fills proportionally, the centre reads
the found count with WORDS beneath it. A player who found 4 of 14 should not be
shown "29%".

**Furdle reveals the word, and says nothing about sharing.** The share builder
already omits the solution so a shared daily cannot spoil the board. That stays
true and stays unmentioned on screen.

**A lost Furdle has no hero number.** A large 0 where the streak was is a kick
on the way out. The word leads instead, in outlined tiles rather than green,
because the green was not earned. Same shape, different finish, so the loss
reads at a glance with no red.

**Word Ladder is the tightest screen**, roughly 40pt spare at 430x932 with the
chain, the lifetime row and the countdown. Anything added there means something
else comes off.

**Furdle Quick Play has no distribution chart.** It overflowed into the buttons,
and a distribution of quick-play rounds carries little meaning. The daily keeps
its chart.

**Hangman's second mode is Quick Play**, not practice. Every game's second mode
is called Quick Play in anything the player reads. Do not rename the internal
`gameMode` value, which is still `practice` and is wired into Furdle's hydration
logic fixed in `764df57`. This is a user-facing string change only.

## Build order

1. The primitives and the new `ResultsScreen` API, with one game migrated.
   Word Search is the simplest, so start there and look at it on a device before
   going further.
2. Word Grid, Wordsmith, Hex Hive, Anagrams.
3. Word Ladder, the tightest screen.
4. Hangman daily and Hangman Quick Play, including the Quick Play renaming.
5. Furdle solved, Furdle lost, Furdle Quick Play.
6. Delete the dead `cells` / `groups` / dotted-leader code and any orphaned
   StyleSheet entries.

Commit each step separately.

## Known failure mode from last time

The missing-word report prompt, `<WordReportPrompt />`, was dropped three times
during the build 30 migration while replacing large JSX blocks, in Word Grid,
Wordsmith and both Hex Hive screens. It was caught each time by checking the
diff for removed references. Do the same check here after every screen, and
check the same for `AchievementPopup`, which now takes the whole array.

## Verification

- `npm run check` clean, warnings not above 62.
- Every screen at 430x932 and at 402x874, the smaller device a tester is on:
  all content visible, Main Menu and Share never pushed off.
- Word Ladder and Word Grid specifically, the two with the least headroom.
- A dark theme: the hero card, ghost pills and word tiles have only been seen
  on Cream.
- Chip rows with a full word list, not a short one. The mockups use sample data
  and real lists run longer.
- The report prompt and the achievement card still present on every screen.
