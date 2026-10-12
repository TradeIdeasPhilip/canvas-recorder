# Kerning

_Ideas and a plan, 10/8/2026.  Not scheduled._

Per-pair spacing for the stroked fonts:  mainly the line font (`src/glib/line-font.ts`), and
later the Hershey-derived `Font.futuraL()`.  `Font.cursive()` is excluded:  its letters are
designed to touch their neighbours exactly.

**When.**  This changes the layout of every string, so it's a natural fit right after the
[library split](library-split.md), where a major version bump makes it an explicit breaking
change.  It doesn't have to wait, though.  Behind an opt-in flag on `Font`, off by default,
nothing moves until a video asks for it.

## Where things stand

- **There are no sidebearings.**  In the line font, `advance` is the letter's *ink width*:  the
  ink runs from `x = 0` to `x = advance`.  The only spacing is one constant per font,
  `font.kerning`, which is `defaultKerning = 2.5 × strokeWidth`
  (`LineFontMetrics` in `line-font.ts`).
- So letters are placed **bounding box to bounding box with a fixed gap**.  That is exactly
  why pairs like `To`, `AV`, `Ty` and `L'` look loose:  their boxes are a constant distance
  apart, but their ink isn't.
- **Layout has one hook to change.**  Inside a word,
  `x += description.advance + font.kerning` (`paragraph-layout.ts:20`).  `Font.getWord()` even
  carries the comment "This could add special things, like kerning or ligatures."  Pair kerning
  is one extra term there:  `+ font.pairKerning(previous, next)`.
- **Only pairs within a word matter.**  Words are laid out as units, and the space between
  words is separate (`spaceCount × spaceWidth + kerning`).  Punctuation belongs to its word, so
  `y.`, `L'` and `"T` are all in-word pairs.
- **Stroke width affects the shapes slightly** (for example `dotHeight = strokeWidth / 3`), and
  the fonts come in many boldnesses.  So a pair's kerning depends on the boldness, not just on
  the letters.  That argues for computing kerning per `Font` instance rather than shipping one
  fixed table.

## The core idea, made exact

The proposed rule:  bring two letters together until some part of one comes within a minimum
distance of the other.  For *stroked* fonts this can be computed exactly, with no bitmaps:

- The ink of a stroked path with round caps is its centreline thickened by a disc of radius
  `r = strokeWidth / 2`.  So the ink-to-ink distance is the centreline-to-centreline distance
  minus `strokeWidth`.  "Ink at least `d` apart" means "centrelines at least `strokeWidth + d`
  apart".
- **Profiles.**  For each letter, compute a *right profile* and a *left profile*:  at each of N
  heights, the rightmost and leftmost `x` of its centreline.  Flatten each command into short
  line segments, then intersect them with horizontal lines.  That's exact up to the flattening,
  and cheap.
- **Thicken the profile instead of the shape.**  To account for round ink, widen each profile
  by a semicircle:

  `right′(y) = max over |y − y′| ≤ R of right(y′) + √(R² − (y − y′)²)`, with
  `R = r + d / 2`

  Do the same for the other letter's left profile.  Then the two letters are exactly `d` apart,
  in true 2-D distance, when the thickened profiles just touch.
- **The pair's kerning** is whatever shift makes the smallest horizontal gap across all heights
  equal to that touching point, minus the default gap.  That's O(N) per pair:  microseconds.
  Each letter's profile is computed once per `Font` and cached.

So the "minimum distance between any part" rule is affordable *at runtime, for any boldness*,
with no data file at all.  Hand overrides, stored as small deltas in em units, sit on top.

## Rules beyond minimum distance

Minimum distance alone has two well-known failure modes:

1. **Letters in different vertical zones don't constrain each other.**  A quote and a period
   never share a height, so the rule would stack them on top of each other.  The same goes for
   `"` followed by `,`, or `'` followed by `.`.
   - **Fix:**  if the two letters share no height where both have ink, fall back to a
     bounding-box rule, so their boxes can't overlap horizontally.  That one rule generalizes
     every punctuation-over-punctuation case.
2. **Deep openings over-tighten.**  In `To`, the `o` slides under the bar until it nearly
   touches the stem.  The minimum distance is satisfied, but it looks cramped.  Type designers
   kern `To` by only around a tenth of an em.
   - **Simple fix:**  a cap on how far any pair may tighten.
   - **Better fix, if the cap isn't enough:**  measure *area*, not just the minimum.  Average
     the gap over the heights the two letters share, clamping each height's gap to a *depth
     limit*, so a deep opening counts as "open enough" rather than "infinitely open".  Then aim
     the average at a target.  This is how HT Letterspacer, an open-source spacing tool, works,
     and it also fixes *spacing*, which the minimum rule can't.  `lo` currently looks looser
     than `ll`, because only one point of the `o` is close.
   - **Use the looser of the two rules:**  the hard minimum always wins.

Expect more special rules to accumulate, as you anticipated:  per-character classes such as
"punctuation that may tuck under an overhang" (`T.` and `r,` are traditionally kerned tight),
and probably something for parentheses and operators in math.

## Review tools

These matter more than the algorithm, and none of them are hard to build:

- **A pair sheet** (a new page, `kerning.html`).
  - One tile per pair, showing default and kerned side by side.  The closest point is drawn
    as a little red or green bar showing the clearance.
  - Sorted by importance:  how often the pair occurs, weighted by how far the computed kern
    moves it.  Big adjustments to common pairs are the ones most worth eyeballing.
  - Arrow keys nudge an override.  **Copy as TypeScript** exports the overrides, the way the
    Visual Editor's copy buttons do.
- **A flicker toggle.**  The same text, kerned and unkerned, flipping back and forth.  Type
    designers rely on this; differences that are invisible side by side jump out.
- **Real strings.**  Every string the project actually prints, kerned, to check in context.

## Which pairs matter most

Four lists, merged:

1. **This project's own strings.**
   - **Statically:**  scan `src/` for string literals passed to text APIs (`text:`,
     `addText()`, `singlePathShape`) and count their pairs.
   - **At runtime:**  a dev-only hook in `Font.getWord()` that records every pair it sees.  This
     also catches generated strings, like numbers and labels built in code.
2. **Classic trouble pairs** from type design:
   - `AV AW AY AT Av Aw Ay`
   - `LT LV LW LY Ly L'`
   - `PA P. P,`
   - `TA Ta Te To Tr Tu Tw Ty T. T, T-`
   - `VA Va Ve Vo V. V,`
   - `WA Wa We Wo W.`
   - `YA Ya Ye Yo Y.`
   - `F. F, Fa Ko ky`
   - `r. r, y. y, v. w. f'`
   - quotes next to letters and periods
   - `11 17 71 7.` — the digit `1` is the classic loose one
3. **English letter pairs.**  The most common, in roughly this order, are TH, HE, IN, ER, AN,
   RE, ON, AT, EN, ND.  This is from Peter Norvig's analysis of Google Books; fetch the full
   table when implementing.  Most lowercase pairs are similar shapes that already look fine
   with constant spacing, so weight them by how much the algorithm actually changes them.
4. **Math.**  These are math videos.
   - `(x f( (j x) y)`, digits beside letters (`2x`), operators (`x+`, `=`)
   - superscripts, and the Greek and blackboard-bold characters in `internals.md`

   Parentheses next to descenders and overhangs are likely the most visible problems in
   practice.

## The questions you asked

- **The bitmap idea** (an M height of 10 px, with 3× horizontal resolution).  That's the
  profile idea at low resolution.  It would work, but 10 rows is too coarse:  a period or a
  dot is about one stroke tall, a fraction of a row.  Vector profiles are simpler *and*
  exact, and the round stroke becomes a formula instead of pixels.  You get any vertical
  resolution you like for free.
- **Can bezier.js help?**  Partly.  It has `project()` (the closest point on a curve to a
  *point*), `intersects()` (curve with curve), `getLUT()` (sampling), `bbox()`, and `offset()`.
  It has no "minimum distance between two curves", and you remembered right that there's
  nothing for whole paths.  `getLUT()` is handy for flattening, but the profile method doesn't
  need the rest.
- **Brute force at 100 px** (pixel-to-pixel minimum).  It's unnecessary, since the profile
  method is exact and runs in microseconds per pair.  If 2-D minimum distance is ever wanted
  directly, flattening both letters and taking the minimum segment-to-segment distance is
  simple, and fast enough to run offline.

## Effort and certainty

| Item | Effort | Certainty |
|---|---|---|
| Per-letter profiles from `PathShape` | Small | High |
| Pair kerning:  minimum distance, the shared-zone fallback, and a cap | Small | High that it works; medium that it looks right untuned |
| `Font` option plus the one-line layout change | Small | High |
| Overrides (deltas in em) and Copy as TypeScript | Small | High |
| The pair-sheet page, with the flicker toggle | Small–Medium | High |
| The corpus scan, static and runtime | Small | High |
| The area model with a depth limit, if the cap isn't enough | Medium | Medium |
| Tuning | Open-ended, and the fun part | — |

## Open questions

- **Kerning across a format change inside one word**, as when Multi Text changes `TextFormat`
  mid-word:  two different fonts or sizes.  Skip it, or use the more conservative of the two?
- **Should the target clearance scale with stroke width** (like `defaultKerning` does) or with
  M height?  It probably scales with stroke width, so a bolder font still keeps a visible gap.
- **`futuraL`'s letters may already include sidebearings,** since they come from Hershey data.
  Check before reusing the line font's assumptions.
- **Animations that reveal text letter by letter, or morph it,** will see positions shift
  slightly.  That's harmless, but worth one look.
