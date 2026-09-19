# Rotate and Auto Size the Multi Text Component

Proposal:

Add the abilities to rotate the text and and to do various auto sizing operations.

## Rotations

Currently rotations are done with a seperate `SlideComponent`.

The Multi Text Component class already handles scaling through the font size, skew via the "oblique" property and and translations via the position or rectangle property.
The only major piece missing was rotations.
_Maybe the GUI will make more sense with the rotations done here, too_?
I'm not certain.

See the [proposed Wrap button](./add-component-dialog.md#add-wrap-button), which will make it easier to add a rotation to _any_ type of component.

Are rotations intertwined with auto sizing?
At first I thought about them together.
Now I'm thinking these are two seperate projects.

## Auto Sizing

I've got an example of auto sizing in galaga.ts.
The individual slide does the auto sizing and it's a bit more work than it seems like it should be.
It seems like the Multi Text Component could include options for auto sizing.
The individual slide would have no interesting code;
it would set the bounds and the content and select a few settings to control the auto size.

My question: **How many cases do we get into**?
Looking "from the helicopter" it seems like there are multiple questions, like whether or not the width is fixed and whether or not the height is fixed.
These seem to overlap and we will probably have to write code for each combination of these and more.

### What to Display in the Visual Editor's GUI

Notice that the TextComponent in simple-text.ts is different from the Multi Text Component.
One uses a point to set the position of the text and the other used a rectangle.
In fact that should depend on your other settings.
You might get a point or a rectangle and it can change.

You actually might get a hybrid:
What if the text is fixed width, either word wrapped or auto-sized, but the height is unlimited?
We might want to display a line segment with three circles.
The two on the ends work the the top or bottom line of a rectangle, where any change in y position applies to both.
And the circle in the middle works like the circle in the center of a rectangle moving the line segment without resizing it.

And the height might be constrained but not the width?

Alignment and baseline only make sense sometimes, and (maybe) should be removed from the TypeScript type (one record records a lot of details, grouping any properties that depend on each other into one big property)

Do you ever need word wrap _and_ auto-size together?
What if word wrap is not sufficient on its own?
HTML just lets things poke out of the container.
If we're already implementing auto sizing, we might as well make auto sizing the fallback when that _and_ word wrap were both selected.

`ParagraphLayout` lets you set the width to `+Infinity` when you want to disable word wrap.
In that case it determines the `width` based on what's actually used.
Otherwise it returns the `width` you requested.

Changing the size to make things fit left to right is easy.
That's a simple transform, scale by desired width / current width.
But up and down might be more complicated.
If you are using word wrap, and we make the font size smaller because the document is too long, you never know for certain how much smaller to make the font size to get it perfect.

### Can you freeze the current settings?

What if you use the auto sizing to help you lay out your biggest item.
Then you want to freeze that and make all of the messages use the same sizes.
I.e. Auto sizing becomes a development time tool and is not run while playing the video.
This won't be the only use case, but it might be a common one.

## Continuing that logic, from the assistant's side (9/17/2026)

### Three mechanisms, not one

Most of the apparent complexity comes from "auto size" being three different levers wearing one name.

1. **Wrap.**
   Changes where the lines break.
   Discrete, and it only ever trades width for height.
2. **Scale the finished block.**
   Lay the text out, measure it, apply a uniform transform to the result.
   Continuous and exact, and it preserves the line breaks, so the paragraph keeps its shape and only changes size.
   This is what `galaga.ts` does.
3. **Change the font size and lay out again.**
   Also continuous, but the line breaks move, so the paragraph comes out a different *shape*, not just a different size.

Doing nothing and letting the text overflow, as HTML does, is the fourth option.
It has to stay available, because it's the only honest answer in some cases.

The difference between 2 and 3 is the crux of the whole design:
scaling a finished block preserves its aspect ratio, so it can satisfy exactly **one** constraint.
Laying out again changes the aspect ratio, so it can chase **two** constraints at once.
That is the only reason the hard, iterative case exists, and it's why it should be one clearly labeled option rather than the default.

### Width is an input, height is an output

This asymmetry drives everything else.
`ParagraphLayout.align()` *takes* a width and *returns* a height.

* A width constraint can be satisfied before layout runs.  Free.
* A height constraint can only be checked after layout runs.  Never free.

So "fixed width" and "fixed height" are not two symmetric cases, and no amount of restructuring will make them symmetric.
Any height constraint costs either a scale step (cheap, deterministic) or a search (expensive).

### Each dimension is in one of three states, not two

You framed it as fixed vs. not fixed.
I think there's a third state hiding in there, and it explains why wrap and `panAndZoom()` feel so different:

* **Free** — take whatever the text naturally is.
* **Limit** — don't exceed this; smaller is fine.
* **Target** — be exactly this; grow the text if it's too small.

Word wrap is a *limit*.
`panAndZoom(…, "meet")` in galaga.ts is a *target* — it happily scales a short word up to fill the strip.
Those are different intentions, and today there's no way to say which one you meant.
A "may this grow, or only shrink?" flag is the smallest way to express it.

### So, how many cases?

Naively: 3 states × 2 dimensions × 4 mechanisms, which is the scary number you were expecting.
Two facts collapse most of it.

* Wrap only applies to width, so every "wrap" row has a bounded width by definition.
* Uniform scaling cannot hit two targets at once.
  A rectangle with both dimensions targeted is really "fit with slack in one direction" (meet) or "overflow in one direction" (slice).
  The only way to actually hit both is mechanism 3.

What survives:

| Frame | Mechanism | Call it | Status |
| --- | --- | --- | --- |
| Point | overflow | Natural | exists today, `width = Infinity` |
| Horizontal segment | wrap | Text box | exists today, the main mode |
| Horizontal segment | scale block | Fit the width | new, one line stretched to a span |
| Horizontal segment | wrap, scale only if a single word still doesn't fit | Wrap with fallback | your "word wrap is not sufficient on its own" case |
| Vertical segment | scale block | Fit the height | new, titles and banners |
| Rectangle | scale block, meet | Fit the box | this is galaga.ts |
| Rectangle | wrap to the width, scale down if too tall | Wrap and shrink | the common "just make it fit" |
| Rectangle | re-lay-out at a smaller font size | Autofit | the only row that iterates |

Eight rows, and the first six are each a couple of lines of policy.
I'd build rows 1, 2, 6, 7 first; those cover everything I've seen you actually want.

### It's one pipeline, not eight implementations

This is the part I'd most want to correct from the original note.
You wrote that we'll "probably have to write code for each combination."
I don't think so.  Every row above is the same five steps:

1. Choose a wrap width — the frame's width, or `Infinity`.
2. Lay out and measure.  (`layoutAt()` already does exactly this.)
3. Choose a scale factor.  **This is the only step that differs between rows.**
4. Only for Autofit: adjust the font size and go back to step 2.
5. Anchor the block inside the frame.

Steps 1, 2 and 5 are shared.
Step 3 is a small function of (measured box, frame, which dimensions are constrained, may-it-grow).
Step 4 is one loop that only one row ever enters.

On that loop: I don't think it's as unknowable as the note suggests.
Height as a function of font size is monotonic (smaller text is never taller) and piecewise constant, because the line count is an integer.
So the answer is well defined — the largest font size whose height still fits — and bisection converges on it.
It's finitely many distinct line-break configurations, not a mystery.
What it costs is a full layout per probe, maybe eight to ten of them.
That's the real argument for freezing it rather than running it every frame.

### The alignment conflation

`Alignment` currently does two unrelated jobs, and I think this is the single biggest cleanup available.

1. How ragged the lines are inside the paragraph (left / center / right / justify).
2. Where the paragraph box attaches to `Position` — see the `offset.x` formula in `layoutAt()`, where `center` subtracts half the width and `right` subtracts all of it.

`Baseline` is purely job 2, for the other axis.

Because they're welded together you can't currently ask for left-ragged lines in a box that's centered on a point.
You can fake it by subtracting half the width from `Position` yourself, but it breaks the moment the width animates.

Splitting these is also exactly why `FittedText` in galaga.ts had to hide `Position` and `Baseline`:
once something else owns block placement, those two knobs are meaningless, while `Alignment` still matters because it changes the *shape* of the box.
That's a clean seam and it should be a real one.

### What the properties should look like

Two organizing principles:

* **Structure is a scalar, geometry is a schedule.**
  What kind of frame you have and how it's fitted change which other fields mean anything, and what the editor draws.
  You don't animate that.
  The numbers inside the frame animate freely.
* **One rectangle underneath, different handles on top.**
  Rather than separate Position / Width / Height / Rect schedules that lose data when you switch modes,
  keep a single rectangle schedule and let the frame shape decide which parts are read and which handles the editor draws.
  Switching Point → Rect → Point is then lossless, and the "line segment with three circles" is just a rectangle with its height ignored.

That gives roughly:

**Structural, scalars:**

* `Frame` — point | horizontal | vertical | rectangle.
  Decides which parts of the rectangle are live, and which handles the GUI draws.  Answers your question directly: the GUI shape is derived, not a separate setting.
* `Fit` — overflow | wrap | scale | wrap then scale | autofit.
  Only the combinations in the table above are offered; the illegal ones never appear.
* `May Grow` — whether scaling is allowed to enlarge, or only to shrink.  This is the limit/target distinction.
* `Compute` — live | frozen.  See below.

**Geometry, schedules:**

* `Rect` — one rectangle, interpreted per `Frame`.

**Paragraph, schedules, always meaningful:**

* `Line Alignment` — left | center | right | justify.  Raggedness only, job 1 above.
* `Additional Line Height`.

**Anchoring, schedules:**

* `Anchor X`, `Anchor Y` — 0…1, where the slack goes.
  0.5 / 0.5 is centered; 0 / 0 is top left.
  These replace `Baseline` and job 2 of `Alignment`, and they're the same numbers as `panAndZoom()`'s `howFarRight` / `howFarDown`, which is a good sign.

Migration requirement: `Frame = point`, `Fit = overflow`, with `Anchor` derived from today's `Alignment` and `Baseline`, has to reproduce existing videos exactly.
Worth writing that down as a test before touching anything.

### Answers to the questions you left open

**Do you ever need word wrap *and* auto-size together?**
Yes, and your instinct to make auto-size the fallback is right, but there are two different fallbacks and they deserve different names.
"Wrap with fallback" only shrinks when a single unbreakable word is wider than the frame — rare, a safety net.
"Wrap and shrink" wraps to the width and then shrinks the whole block because it came out too tall — common, probably the button you actually want.

**Freezing.**
This is more important than it looks, because live auto-sizing has a failure mode nobody wants:
if the *content* animates, the size animates with it, and the text visibly breathes as words appear.
Freezing isn't only a performance tool, it's the fix for that.
Three things it needs:
the editor has to *show* the computed scale, there has to be a "bake this" action that writes it into the manual setting, and freezing has to name the time it froze at, because the answer depends on the playhead.
Your "make all the messages match the biggest one" use case is a step beyond that — it's a max across several components, which argues for baking a number you then paste, rather than anything automatic.

**Are rotations intertwined with auto sizing?**
Separate projects, as you concluded, but only if the order of operations is settled now.
The order that works is: lay out → rotate → fit the rotated box into the frame.
galaga.ts does exactly that, and the fit math never has to know the angle.
Leave a slot for rotation between steps 2 and 3 of the pipeline and adding it later disturbs nothing.

**Should this live in MultiTextComponent at all?**
Partly.
Wrap and autofit *must* live here, because they need the layout.
But "measure it, scale it, anchor it" needs nothing but a bounding box, and would work just as well for an image, a video clip, or a group.
Given the Wrap Component button in add-component-dialog.md, the natural split is a generic fitting wrapper for mechanism 2,
plus wrap and autofit as properties here.
That wants an optional `measure()` on `Showable`, which `layoutAt()` already all but provides.

### Gotchas that aren't on either list yet

* **Stroke width isn't in the metrics.**
  The measured box is the font's cap-to-descender box; a round cap paints about half a stroke width past it on every side.
  galaga.ts covers this with a hand-tuned margin.
  If this moves into the component, the component knows the fonts, so it can inset properly instead of guessing.
* **Auto-size must be a multiplier on the authored sizes, not a replacement.**
  Formats set per-span sizes deliberately — big word, small word.
  Scaling preserves those ratios; "set the font size to N" would destroy them.
* **`Additional Line Height` is in absolute units.**
  It scales with mechanism 2 and doesn't with mechanism 3.
  Two mechanisms, two different answers to the same question, and someone will notice.
* **Empty text.**
  A zero-sized box makes every one of these divide by zero.  Needs one defined answer, once.
* **Justify plus an unbounded width** is degenerate: it stretches the short lines to match the longest one.
  Probably should be quietly disallowed rather than explained.

### What I'd want decided before building

1. One rectangle underneath, or separate Position / Width / Height schedules?  I argued for one, but it's your editor.
2. Is `May Grow` a real knob, or is "targets grow, limits don't" enough of a rule to leave implicit?
3. Does the Visual Editor support the property list *changing* when a scalar changes?
   Everything above assumes switching `Frame` re-draws the panel.
   If that's hard today, it's the first thing to build.
