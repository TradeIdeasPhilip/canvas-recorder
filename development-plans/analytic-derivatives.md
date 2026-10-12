# Analytic Derivatives for glitchFreeParametric()

_Assessment, 10/8/2026.  Not scheduled._

## The idea

`PathShape.glitchFreeParametric()` (`src/glib/path-shape.ts`) samples a function and fits
quadratic Béziers between the samples, using the curve's direction at each sample.  Today that
direction is estimated numerically.  Let the caller optionally supply the derivative instead.

The automatic estimate stays the common case.  Fourier series are the motivation:  their
derivative is trivial, and the Fourier animations stutter near the end, when there are many
terms.

## What the automatic derivative costs

`getDirection(f, t, ε)` isn't a plain finite difference.  It measures the chord's angle at
`t ± ε` and at `t ± 2ε`, then extrapolates to zero width.  That's 4 calls to `f`, on top of
the 1 for the point itself:  **5 calls per sample.**  A Fourier derivative reuses the `sin` and
`cos` the point already computed, so the analytic version is about **1 call per sample**.  That
is better than the hoped-for 2/5, *if* the calls are actually being made, which isn't certain
(see "The unverified premise").

## The previous attempt (`save/`, 4/30/2026)

`save/path-shape.ts` and `save/fourier-shared.ts` are complete copies of the two files from
April.  Diffing them against the live files isolates the attempt from unrelated drift.

**`path-shape.ts` part — sound, reusable nearly as is.**

- `PointWithDerivative` and `DifferentiableParametricFunction` types.
- `addParametricPathDifferentiable()`, which takes the direction as `atan2(dy, dx)` instead of
  calling `getDirection()`.
- `glitchFreeParametricDifferentiable()`, which feeds that first try into the existing glitch
  fixer through a new `firstTryOverride` parameter.

**`fourier-shared.ts` part — one real bug.**

- The derivative of the Fourier sum is **correct**:  with `angle = 2πft + φ`, the derivative of
  `A·cos(angle)` is `−A·2πf·sin(angle)`.
- The chain-rule factor `safePartEnds` is also right, and it doesn't matter much anyway, since
  only the direction is used and a positive scale doesn't change direction.
- **The two blending functions are wrong.**  Both compute
  `base(t) + fraction(t)·adding(t)`, where `fraction = 1 − getFraction(t)` is an easing ramp
  that depends on `t`.  The product rule gives

  `base′ + fraction·adding′ + fraction′·adding`

  and the attempt left out the last term.  `fraction′` is zero outside the transition window
  and nonzero inside it, so the supplied tangents were wrong in exactly the part of the curve
  that's visibly animating.

**Why it "didn't work".**  The glitch fixer's `isGood()` only checks that a segment isn't more
than twice as long as a straight line.

- A *slightly* wrong tangent passes that check and just draws a slightly wrong curve.
- A *badly* wrong one makes `QCommand.angles()` give up and draw a straight line:  a visible
  corner.

The README's explanation, that exact tangents make `findIntersection` fail more often than
noisy ones, doesn't hold up.  The numerical estimate uses `ε = 0.0001 / segments`, so it
agrees with a correct analytic tangent to many decimal places.  The two should behave the
same.  The second attempt's "fix" sent failed segments back through the numerical derivative.
That hid the corners, but left the subtly wrong curves, and gave back much of the speedup in the
transition window.

**Verdict:**  close to "one small bug".  Port the `path-shape.ts` part, re-apply the Fourier
part with the product-rule term, and drop the second attempt's fallback.  The missing
`fraction′` is cheap:  `makeEasing()` is a linear map into `ease()`, so either differentiate it
or take a finite difference of `getFraction` alone.  That costs nothing compared with a
Fourier sum.

## The unverified premise:  is this where the time goes?

`termsToParametricFunction()` caches results by `t`, in a `Map` that is **never cleared**.

- **The common case** (one shape to another).  The sample `t` values are the same every frame,
  and so are the `t ± ε` values, since `ε` depends only on the segment count.  So after the
  first frame of a transition, most Fourier sums may already be cache hits, and analytic
  derivatives would save little there.
- **The "growing from a dot" case.**  `t` is rescaled by `safePartEnds`, which changes every
  frame.  Every key is new:  no hits, and the cache **grows without bound**.  Memory growth and
  garbage-collection pauses are a credible cause of stutter on their own.
- **The glitch fixer's re-samples.**  These use `t` values that move with the transition
  window, so they mostly miss.

Other per-frame costs that might matter as much:  `isGood()` computes a Bézier arc length for
every segment of every frame, plus `findIntersection`, `PathShape` and `Path2D` construction,
and the stroke itself.

**So measure before building.**  If hits vastly outnumber misses at the stuttering part,
analytic derivatives won't fix it, and the cache or `isGood()` is the better target.

## How to measure, in spite of thermal throttling

- **Count, don't just time.**  `philDebug.cacheHealth` already counts Fourier sums
  (`miss`) and cache hits (`hit`).  Calls per frame is deterministic:  it doesn't care
  about heat, the profiler, or anything else running.  Read it in the console before and after
  a few seconds of the stuttering section.  This one check decides whether the project is
  worth doing.
- **Interleave A and B instead of before-then-after.**  Make the derivative mode a runtime
  flag (`philDebug`), and have it flip itself every N frames, say 60, keeping separate running
  medians of the time spent in `glitchFreeParametric()`.  Heat then affects both modes
  equally, within a second of each other, with no restart.  Show the ratio in the Debug Log.
- **Check correctness automatically.**  In a debug mode, compare each analytic direction with
  `getDirection()`'s estimate at the same sample, and `console.error` beyond a small angle.
  This would have caught the product-rule bug immediately, and it guards every future caller.

## Effort and certainty

| Item | Effort | Certainty |
|---|---|---|
| Measure first:  `cacheHealth` counts at the stuttering section | Trivial | High |
| Port the `path-shape.ts` part | Small | High |
| Fourier derivatives, with the product-rule fix | Small | High |
| Self-check against `getDirection()` | Small | High |
| Interleaved A/B timing | Small | High |
| Bound the cache, e.g. per frame, or by key | Small | High |
| **That it removes the stutter** | — | **Medium–Low until measured** |

Other callers would benefit for free:  `src/showcase.ts` builds a Fourier path with
`glitchFreeParametric()` too.  Once this is ported, `save/` can be deleted.
