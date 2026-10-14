# Paint Layers

_Brainstorm, 10/13/2026.  Not scheduled, except that the first stage (rainbow text) may come
soon._

## Why

The line fonts were chosen for the special effects they allow:  rainbows, glows, shadows,
dashes, several strokes of the same path.  The previous project, before components existed, did
a lot of these.  This one almost never does, because doing one means writing code.

**The goal:** components that know these effects, are easy to customize, and are easy to extend
with new ones.  The simple case should stay simple, and double images should be available when
wanted.

The [library split](library-split.md) is making good progress, and with it comes the freedom
to make breaking changes.  So this can be tried in small steps, without knowing the whole plan
first.

## The idea:  make the path, change it, paint it

Today a Text Format does two jobs:

1. **Making the path:**  font, size, boldness, slant.  This has to happen before the layout.
2. **Painting it:**  color and alpha, used when stroking.

Boldness is used by both:  it reserves room for the wider stroke when making the path, and it
sets the line width when painting.

Splitting those apart gives three roles:

| Role | Today | Later |
|---|---|---|
| **Make** a path | Text Format (font), Fourier | A generic **Path** component |
| **Change** it (optional) | Handwriting Effect | Wavy, drunken lines, … |
| **Paint** it | Text Format's Color and Alpha; Fourier's colors and line width | **Paint layers**, shared by all of the above |

Once painting is its own thing, "works on any path, not just text" mostly comes free.  A paint
layer doesn't care where its path came from.

## Paint layers

### In the GUI:  layers are children

This uses the same pattern Multi Text already uses for spans, formats and text effects:  **paint
layers are optional children of a Text Format.**  Later the same layer components sit under a
Path component, or under Fourier.

- **No children:** exactly today's behavior.  The simple case stays simple.
- **One child per extra stroke.**  The tree editor already handles insert, delete, reorder,
  copy, paste and save, so there's no new list editor to build.
- **Sharing the path is automatic.**  Every layer is handed the same path.  This is the CSS
  `--variable` shared by several `<path>` elements, with nothing to declare.

Kinds of layer, roughly:

- **Stroke:**  color, alpha, width, dash pattern, dash offset, x / y offset (a hand-made
  shadow).
- **Fill:**  color, even-odd or nonzero.  Fourier already fills.
- **Rainbow:**  `strokeColors()`.  See [Rainbows](#rainbows).
- **Glow:**  see [Glow and shadow](#glow-and-shadow).

### Width:  a multiple of the font's width, by default

Each layer's width is a factor, default 1, times the base width.
- For text, the base width is the stroke width that boldness chose for the font.
- For a Path, it's the Path's own Line Width.

Change the boldness and a 3× glow stays 3×.

Today Multi Text deliberately strokes at exactly the width the font was made for, so nobody
has to think about two widths.  That stays true for the simple case.  Layers are where the two
finally come apart.

### Open:  add to the Format's stroke, or replace it?

- **Add** (leaning this way).  Each layer is marked *behind* or *in front of* the Format's own
  stroke.  The commonest change, "add a shadow", is one child, and the Format's Color keeps
  meaning something.
  - To *replace* the main stroke, for example with a rainbow, set the Format's Alpha to 0.  That
    property already exists.
  - Don't just paint over the main stroke.  Two identical round-capped strokes leave a thin
    fringe of the lower color along the anti-aliased edges.
- **Replace.**  Any layer replaces the Format's stroke.  This is more uniform, but adding a
  shadow takes two children, and Color and Alpha sit there doing nothing.

The first stage, rainbow text, is a good experiment for deciding this.

### Order across formats

Today each format is drawn as one path, one format after another.  So a shadow under format B's
text would land on top of format A's text.

**Proposal:**  inside one Multi Text, draw in passes:
1. every format's *behind* layers
2. then every format's main stroke
3. then every format's *in front* layers

That's a global-ish z order, which goes beyond what plain SVG offers; SVG has trouble with
things like shadows on just part of the text.  It's easy here, because Multi Text already
gathers every span's path by format before drawing anything.

## Rainbows

- **All three sizing modes**, since each has been useful:  `sectionLength`, `repeatCount`
  and `colorCount`.
- **Offset** is an ordinary number schedule.  Linear keyframes from 0 to N over a loop make a
  seamless loop, with N a whole number.
- **Drift** uses `ShowOptions.globalTime`, which was made for exactly this.  The colors keep
  moving even when a section repeats or the playhead is parked.  Something like "cycles per
  second", added to Offset.
- **Which mode suits which animation.**  The modes differ in *where* a change of length shows
  up, so offer them all and let the user explore.
  - **Fixed length** (`sectionLength`, with the speed also in userspace units):  new path
    appears at the end, and everything already drawn stays put.  That's exactly right for
    handwriting.  Lengthening at the start instead would also need a matching change to the
    offset to keep the illusion.
  - **Ratios** (`repeatCount`, `colorCount`):  a change of length is spread through the middle
    of the path.  That's right for morphing between paths of very different lengths.  Fixed
    lengths fail there:  one end of the path stays calm while the other end races and flashes.
    That's documented in a video on the YouTube channel.
  - Multi Text doesn't morph today, so fixed length covers the common case.  Nothing special is
    needed to combine rainbows with handwriting.

## Layers out of step (low priority)

Usually every layer is written by the same handwriting effect, at the same moment.  A fun
variation is to write the layers with **different time offsets**, so one layer chases another.
Example:  https://tradeideasphilip.github.io/handwriting-effect/

This doesn't need much, because an effect is already a function of time:
- Give each layer an optional **Delay (ms)**.
- Multi Text runs the effect once per distinct delay, at `timeInMs − delay`, and hands each
  layer its own result.
- With no effect, Delay does nothing.

This is a good example of the general problem.  In code, the libraries make it easy to mix and
match all of these parts in many ways.  A GUI has to pick which combinations to offer.  Small
knobs like this, which reuse pieces that already exist, are the cheap way to offer more of
them.

## Color lists

Rainbow needs a list of colors, which nothing has had before.

- **Cheapest version that works:**  a text field holding a palette name (`myRainbow`) or CSS
  colors separated by commas, with a row of swatches showing the result.  It needs no new
  property type, no save format change and no code generator change.  Most of the time it just
  says `myRainbow`.
- **Later, if that gets annoying:**  a real color-list property, edited with swatches that open
  the existing color picker.
- **Not needed:**  animating the list itself.  The motion comes from Offset and Drift.

## Glow and shadow

- **Blur doesn't survive encoding.**  Blurs, gradients and noise look fine on screen and fall
  apart under HEVC and YouTube compression.  That was learned the hard way in the daily Fourier
  videos (see [References](#references)), and `CLAUDE.md` says the same.
- **A stepped glow fits the project's "crisp paths" rule:**  two or three progressively wider
  strokes at low alpha, each with a crisp edge.  That makes a good Glow layer.  A real blur can
  still be an option, just not the default.
- **Shadows** are a Stroke layer with an x / y offset, behind the main stroke.
  - **Open:** are offsets in the path's own units, so they scale with the text, or multiples of
    the base width?

## Where paths come from

### A generic Path component, using the raw path

- **The property is the path string itself:**  the SVG `d` attribute, which the code calls the
  **raw path**, as opposed to the **CSS path**, `path('…')`.  Raw is the preferred form, and it's
  what the JSON files store.
- **The user can type it directly.**
- **A custom panel, like the Video File and Image File panels, is where the useful tools go:**
  - **Load SVG file** (typically from Inkscape, or downloaded from Wikimedia Commons).  The
    software finds the path or paths in it.
  - **Choosing:**  the choices are listed in a dialog on the right side of the screen while the
    preview on the left stays live, as in the component picker.  Clicking one shows it right
    away; OK copies its raw path into the property.  Selecting several could combine them.
- **Things the importer will meet:**
  - **Parser gaps.**  `PathShape.fromRawString()` handles M, L, H, V, Q, C, relative `s` and Z.
    It doesn't handle absolute `S`, `T` / `t`, or arcs (`A` / `a`), and arcs are common in
    Wikimedia files.  Arcs can be converted to cubic Béziers; that's a standard algorithm.
  - **Transforms.**  Inkscape usually puts paths inside `<g transform="…">`.  The importer has
    to apply every ancestor's transform.  `transform.baseVal.consolidate()` on each element
    gives a matrix, and `PathShape.transform()` applies it.  After that, fit the result into a
    Dest Rect the way Fourier does, so the file's own coordinates don't matter.
  - **Other shapes.**  `<polygon>`, `<polyline>`, `<rect>`, `<circle>` and `<line>` convert
    easily.  Start with `<path>`, and add these as they turn up.
  - **Outlines versus center lines.**  Many downloaded drawings are filled outlines.  Stroking
    one gives a double line, not the single pen stroke the line fonts have.  The importer can't
    fix that, but the list could say which paths are filled and which are stroked.
- **Animating the raw path:**  discrete keyframes at first.  Smooth morphing is possible when
  two keyframes have the same command structure, as in `morph-test`.

### Fourier as a subclass

Fourier already makes a path that changes over time, and draws it with fill, stroke color and
line width.  Its `drawPath()` even says "override this to draw it differently, e.g. with
strokeColors()".  That hook is what paint layers replace.

- **The refactor:**  the generic Path is the superclass, and it provides the paint layers.
  Fourier is a subclass:  it fills the path in itself and hides the raw path property, the way
  subclasses already hide or fix properties elsewhere.
- **A variant:**  an abstract "path maker" base class with two concrete subclasses, the
  raw-path Path and Fourier.  Then Fourier doesn't carry an unused raw path property.  Either
  works; pick whichever reads better when the code is written.
- **Both are already containers** (`DurationAgnosticComponent`), so paint layers can be special
  children, recognized by a `Symbol` the way text effects are.
- **Coordinate spaces differ, and that's fine.**
  - Fourier transforms its path into canvas coordinates before stroking, so its line width
    ignores the curve's scale.
  - Multi Text scales the context, so the line width grows with the text.

  A layer just strokes in whatever space it's given.  The maker decides the space and the base
  width.

## Stages

1. **Rainbow text, simply, soon.**  Useful on its own, and a learning experience for the rest.
   - **One layer kind:** Rainbow, as a child of Text Format, replacing that format's stroke.
   - **Properties:** the color text field with presets, the sizing mode and its value,
     Offset, and Drift.
   - **Width:** the font's width.  No factor yet.
   - **Afterwards:** decide add-versus-replace and the across-formats order from what this
     teaches.
2. **The shared layer interface, plus Stroke and Fill layers,** with *behind* / *in front* and the
   width factor.  Then the across-formats passes in Multi Text.
3. **The Path component** with a typed raw path.  Fourier moves under it, and its fill, color and
   width become its default layers.
4. **The SVG importer:**  the panel, the dialog, and the parser gaps.
5. **More layer kinds as they're wanted:**  stepped glow, dashes that animate, and so on.  Each
   is a small component.  Per-layer Delay ([Layers out of step](#layers-out-of-step-low-priority))
   fits here too.

## Open questions

1. Do layers add to the Format's stroke (leaning this way), or replace it?
2. Should every format's *behind* layers be drawn under every format's text?
3. Are shadow offsets in the path's own units, or multiples of the base width?
4. Should one paint style ever be shared by several formats?  A named "Paint" component that
   formats refer to, like a CSS class, would allow that.  Wait until layers are being duplicated
   in practice.

## References

- The daily Fourier "lightning bonus round":  a different twist on the Fourier demo every day,
  many of them with several stroke layers.  This is also where blur was found not to survive
  encoding.  https://www.youtube.com/playlist?list=PLJNSFdg--j7frNYLnOyVen1Rb7SjHRd3C
- https://github.com/TradeIdeasPhilip/random-svg-tests:  more examples.
  - Many only survive in the git history, because each test overwrote the one before.
  - The YouTube descriptions often link to the exact commit.
- **A useful research task before stage 2:**  go through both and list every effect, with a
  link to its commit.  That list becomes the list of layer kinds and their properties.
