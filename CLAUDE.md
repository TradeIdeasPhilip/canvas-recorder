# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

A TypeScript/Vite browser app for creating and recording mathematical animation videos. The author makes math education videos (3b1b/SoME audience). The live preview reloads instantly on save; hitting "Record and Save Video" encodes to HEVC/H.265.

## Commands

```bash
npm run dev        # Start Vite dev server (primary workflow)
npm run build      # tsc + vite build → docs/ (for GitHub Pages)
npm run preview    # Preview the production build
npm run record -- alpha-test # Build a video using command line FFMPEG, "alpha-test" is the name of the video.
```

No test runner. No linter script. TypeScript errors surface in the IDE and on `npm run build`.

Open the app at:
- `http://localhost:5173/canvas-recorder.html?toShow=<key>` — specific video
- `http://localhost:5173/canvas-recorder.html` — selection menu of all registered videos

## Adding a New Video

1. Create `src/your-name.ts` — export a `Showable` object.
2. Register it in `src/dynamic-exports.ts` — add an entry to `showableOptions` using a dynamic `import()`.

`dev/canvas-recorder.ts` is the index of every available video; browse it to see what exists.

## Coordinate System

The canvas is always **16 units wide × 9 units tall**, regardless of actual pixel dimensions. The root transform (`scale(canvas.width/16, canvas.height/9)`) is applied before any `show()` call. All drawing uses these logical units. Never work in pixels directly.

## Core Abstraction: `Showable`

Everything renderable is a `Showable` (defined in `src/showable.ts`):

```ts
type Showable = {
  description: string;   // shown in the GUI tree
  duration: number;      // milliseconds; must be > 0 in a series
  show(options: ShowOptions): void;
}
```

`ShowOptions` provides:
- `context` — the `CanvasRenderingContext2D` (16×9 space)
- `timeInMs` — time within this showable (0 → duration)
- `globalTime` — wall-clock ms from program start (use for effects that must not reset on loop)

**Canvas state contract:** `fillStyle`, `strokeStyle`, `lineCap`, `lineJoin`, `lineWidth`, and the current path are disposable. `transform` and `globalAlpha` must be restored with `save()`/`restore()`.

## Composing Showables

| Class | Purpose |
|---|---|
| `MakeShowableInSeries` | Plays children one after another. `duration=0` children are hidden in the GUI — give them nonzero duration. |
| `MakeShowableInParallel` | Plays all children simultaneously; total duration = max of children. `duration=0` children are fine here. |
| `makeRepeater(showable, count)` | Loops a showable. `count` can be `Infinity`. |
| `addMargins(base, extra)` | Adds hidden/frozen time before or after a showable. |
| `reschedule(base, duration, offset)` | Changes duration and/or start time. |

## Seamless Loops

For a `Showable` meant to repeat seamlessly, any animated offset must return to its starting value at `timeInMs === duration`. The pattern for `strokeColors`:

```ts
// N must be a positive integer — ensures the offset completes exactly N full cycles
const relativeOffset = (timeInMs / DURATION_MS) * N;
```

## Key Libraries (`src/`)

**`src/interpolate.ts`** — animation math:
- `Keyframe<T>` / `timedKeyframes()` — time-based keyframe lookup with interpolation
- `interpolateNumbers/Colors/Points/Rects()` — typed interpolators
- `ease`, `easeIn`, `easeOut`, `easeAndBack` — standard easing curves
- `progress` conventionally means a `number` in `[0, 1]`

**`src/stroke-colors.ts`** — `strokeColors(options)`:
Strokes a `PathShape` with multiple colors, cycling through them. Key options:
- `pathShape` — a `PathShape` (not a raw `Path2D`)
- `relativeOffset` — shift the color pattern along the path (animate for moving colors)
- `repeatCount` — how many full rainbow cycles appear along the path at once
- `sectionLength` / `colorCount` — alternative sizing controls
- `colors` — defaults to `myRainbow`

**`src/glib/path-shape.ts`** — `PathShape` and friends:
- `LCommand(x0, y0, x, y)` — line segment
- `QCommand` / `CCommand` — quadratic/cubic Bézier
- `PathBuilder` — fluent builder for complex paths
- `ParametricToPath` — converts a parametric function `(t) => {x, y}` into a `PathShape`
- `PathShape` methods: `.translate()`, `.transform()`, `.reverse()`, `.scale()`, `.canvasPath` (→ `Path2D`)

**`src/glib/transforms.ts`** — coordinate mapping:
- `panAndZoom(srcRect, destRect, mode)` — fits one rect into another (like SVG `preserveAspectRatio`)
- `applyTransform(context, matrix)` — applies a `DOMMatrix` to a context

**`src/glib/grid.ts`** — `drawGrid(context, { destRect, viewRect, ... })`:
Draws a labeled Cartesian grid. Uses math y-up convention. Labels render *outside* `destRect`, so inset it from canvas edges to keep them visible.

**`src/glib/my-rainbow.ts`** — `myRainbow`: a curated array of colors used as the default palette throughout.

**`src/glib/line-font.ts`** + **`src/glib/paragraph-layout.ts`** — stroke-based text rendered as `PathShape` (encoder-friendly, no raster fonts).

## Pixel-Perfect Encoding Notes (from README)

- **Avoid blurs, noise, and gradients** — they look fine on screen but degrade badly after HEVC encoding and YouTube compression.
- **Prefer filled/stroked paths** — solid objects with crisp edges survive encoding best.
- Time and space stay continuous until the last moment; never convert to pixels/frames early.

## Project Layout

```
dev/canvas-recorder.ts   ← GUI harness
record/cli-record.ts     ← Command line main program (for alpha channel and other rarely uses options)
src/dynamic-exports.ts   ← video registry (showableOptions)
src/                     ← all video content and shared libraries
src/glib/                ← graphics library (PathShape, transforms, grid, fonts…)
src/showcase.ts          ← curated examples; good starting point for copy-paste
src/showable.ts          ← Showable type + composition helpers
src/interpolate.ts       ← keyframes and easing
src/stroke-colors.ts     ← multi-color path stroking
docs/                    ← production build output (served by GitHub Pages)
```
