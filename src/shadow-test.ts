import { ease, interpolateColor } from "./interpolate";
import { myRainbow } from "./glib/my-rainbow";
import { MakeShowableInSeries, Showable, ShowOptions } from "./showable";
import { lerp } from "phil-lib/misc";
import { zipper } from "./zipper";

export const DEFAULT_SLIDE_DURATION_MS = 10_000;

type CanvasFillStyle = string | CanvasGradient | CanvasPattern;

/**
 * Reads the alpha channel of `fromImage` at halftone resolution and returns
 * a Path2D of circles whose *area* is proportional to the local alpha value.
 *
 * The returned path is in the 16×9 logical coordinate space, ready to be
 * filled on a context that has the standard root transform applied.
 *
 * @param fromImage A full-size canvas (same dimensions as the main canvas).
 * @param period Grid cell size in 16×9 units.  Matches the sierpiński
 *   halftone background so the dot density looks consistent.
 */
// At 100% opacity the dot radius reaches this fraction of the half-cell width.
// 0.9 keeps dots non-overlapping with a small gap between neighbors.
// Tweak this constant to taste.
const MAX_RADIUS_FACTOR = 0.9;

// Cached mipmap chain: each entry is a canvas at half the previous dimensions,
// down to near the halftone target size.  Rebuilt whenever the source canvas
// size changes (i.e. essentially never at runtime).
const mipmapLevels: {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}[] = [];
let mipmapSourceSize = { width: 0, height: 0 };

// Final small canvas: one pixel per halftone cell, read back to CPU.
let smallCanvas: HTMLCanvasElement | undefined;
let smallCtx: CanvasRenderingContext2D | undefined;

function createHalftone(fromImage: HTMLCanvasElement, period = 0.25): Path2D {
  const cols = Math.ceil(16 / period);
  const rows = Math.ceil(9 / period);

  // Rebuild the mipmap chain when the source canvas size changes.
  if (
    fromImage.width !== mipmapSourceSize.width ||
    fromImage.height !== mipmapSourceSize.height
  ) {
    mipmapSourceSize = { width: fromImage.width, height: fromImage.height };
    mipmapLevels.length = 0;

    let w = fromImage.width;
    let h = fromImage.height;
    // Halve until we're within 2× of the target in both dimensions.
    while (w > cols * 2 || h > rows * 2) {
      w = Math.max(cols, Math.ceil(w / 2));
      h = Math.max(rows, Math.ceil(h / 2));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      mipmapLevels.push({ canvas, ctx });
    }
  }

  // Ensure the small (final) canvas exists at the right size.
  if (
    !smallCanvas ||
    smallCanvas.width !== cols ||
    smallCanvas.height !== rows
  ) {
    smallCanvas = document.createElement("canvas");
    smallCanvas.width = cols;
    smallCanvas.height = rows;
    smallCtx = smallCanvas.getContext("2d", { willReadFrequently: true })!;
  }

  // Walk the chain: each step halves dimensions, keeping bilinear correct.
  let src: HTMLCanvasElement = fromImage;
  for (const { canvas, ctx } of mipmapLevels) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    src = canvas;
  }

  // Final step to exact halftone grid size.
  const ctx = smallCtx!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, cols, rows);
  ctx.drawImage(src, 0, 0, cols, rows);

  const { data } = ctx.getImageData(0, 0, cols, rows);

  const result = new Path2D();
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const alpha = data[(iy * cols + ix) * 4 + 3] / 255;
      if (alpha > 0) {
        const x = (ix + 0.5) * period;
        const y = (iy + 0.5) * period;
        // Area ∝ alpha  →  radius ∝ sqrt(alpha).
        const radius = Math.sqrt(alpha) * (period / 2) * MAX_RADIUS_FACTOR;
        result.moveTo(x + radius, y);
        result.arc(x, y, radius, 0, Math.PI * 2);
      }
    }
  }
  return result;
}

/**
 * Wraps a {@link Showable} with a halftone drop-shadow effect.
 *
 * On each frame:
 *  1. Renders `base` onto a full-size off-screen canvas.
 *  2. Samples its alpha channel at halftone resolution.
 *  3. Fills the resulting dot pattern on the main canvas, offset by (dx, dy),
 *     to produce the shadow.
 *  4. Composites the original image on top.
 *
 * @param options.base         The content to shadow.
 * @param options.dotColor     Color of the halftone dots.  Default `"#ccc"`.
 * @param options.background   Optional background fill drawn before the shadow.
 * @param options.dx           Shadow x offset in 16×9 units.  Default `0.2`.
 * @param options.dy           Shadow y offset in 16×9 units.  Default `0.2`.
 */
export function makeShadowDemo(options: {
  readonly base: Showable;
  readonly dotColor?: CanvasFillStyle;
  readonly background?: CanvasFillStyle;
  readonly dx?: number;
  readonly dy?: number;
}): Showable {
  const { base, dotColor = "#ccc", background, dx = 0.2, dy = 0.2 } = options;

  // Fixed-size 4K off-screen canvas.  Using a constant size means the halftone
  // sampling is always at the same resolution regardless of the display canvas
  // size, so the live preview and the saved file look identical.
  const TEMP_W = 3840;
  const TEMP_H = 2160;
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = TEMP_W;
  tempCanvas.height = TEMP_H;
  const tempCtx = tempCanvas.getContext("2d")!;
  // Apply the standard 16×9 root transform once — it never changes.
  tempCtx.scale(TEMP_W / 16, TEMP_H / 9);

  const result: Showable = {
    description: `${base.description} » shadow`,
    duration: base.duration,
    children: [{ start: 0, child: base }],
    show(showOptions: ShowOptions) {
      const { context } = showOptions;
      // Render `base` into the fixed 4K temp canvas.
      const tc = tempCtx;
      tc.save();
      tc.resetTransform();
      tc.clearRect(0, 0, TEMP_W, TEMP_H);
      tc.restore();
      base.show({ ...showOptions, context: tc });

      // Sample the alpha channel and build the halftone Path2D.
      const halftone = createHalftone(tempCanvas);

      // --- Composite onto the main context ---

      if (background !== undefined) {
        context.fillStyle = background;
        context.fillRect(0, 0, 16, 9);
      }

      // Shadow: same dot path, shifted by (dx, dy).
      context.save();
      context.translate(dx, dy);
      context.fillStyle = dotColor;
      context.fill(halftone);
      context.restore();

      // Original image on top.
      // drawImage dst coords are in 16×9 logical space (scale transform active).
      context.drawImage(tempCanvas, 0, 0, 16, 9);
    },
  };
  return result;
}

// ---------------------------------------------------------------------------
// Slide 1 — shape gallery
// ---------------------------------------------------------------------------

/**
 * Draw an equilateral polygon (triangle, square, etc.) as a closed path.
 * @param sides  3 for triangle, 4 for square, …
 * @param startAngle  Angle (radians) of the first vertex.
 */
function polygon(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  startAngle: number,
) {
  context.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = startAngle + (i * Math.PI * 2) / sides;
    const x = cx + radius * Math.cos(a);
    const y = cy + radius * Math.sin(a);
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

// Column x-centres and row y-centres in 16×9 logical units.
const COL_X = [16 / 6, 8, (16 * 5) / 6] as const; // ≈ 2.67, 8.00, 13.33
const ROW_Y = [1.5, 4.5, 7.5] as const;
const SHAPE_RADIUS = 1.1;
const LINE_WIDTH = 0.07;

// Row fill factories: solid, 25 % opacity, no fill.
const FILL_FOR_ROW = [
  (color: string): string => color,
  (color: string): string => interpolateColor(0.25, "transparent", color),
  (_color: string): string => "transparent",
] as const;

/**
 * Nine shapes arranged in a 3×3 grid.
 *
 * Columns (shape type):  triangle | square | circle
 * Rows    (fill):        solid    | 25 %   | none
 *
 * Colors go column-major through {@link myRainbow}:
 *   triangles → red / orange / yellow
 *   squares   → green / cyan / myBlue
 *   circles   → cssBlue / violet / magenta
 */
const slide1: Showable = {
  description: "Slide 1: Shape Gallery",
  duration: DEFAULT_SLIDE_DURATION_MS,
  show({ context, timeInMs }) {
    const progress = timeInMs / this.duration;
    context.lineWidth = lerp(LINE_WIDTH, LINE_WIDTH * 4, progress);
    context.lineJoin = "round";

    for (let col = 0; col < 3; col++) {
      const cx = COL_X[col];
      for (let row = 0; row < 3; row++) {
        const cy = ROW_Y[row];
        const color = myRainbow[col * 3 + row];
        context.strokeStyle = color;
        context.fillStyle = FILL_FOR_ROW[row](color);

        if (col === 0) {
          // Equilateral triangle pointing up.
          polygon(context, cx, cy, SHAPE_RADIUS, 3, -Math.PI / 2);
        } else if (col === 1) {
          // Square with a flat bottom edge.
          polygon(context, cx, cy, SHAPE_RADIUS, 4, Math.PI / 4);
        } else {
          // Circle.
          context.beginPath();
          context.arc(cx, cy, SHAPE_RADIUS, 0, Math.PI * 2);
        }

        context.fill();
        context.stroke();
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Deck and top-level export
// ---------------------------------------------------------------------------

const deckBuilder = new MakeShowableInSeries("Shadow Test");
deckBuilder.add(slide1);
const deck = deckBuilder.build();

const slide1Shadow = makeShadowDemo({
  base: deck,
  background: "white",
});

// ---------------------------------------------------------------------------
// Shadow dy for slides 2–4: push shadow to lower half, unobstructed.
// ---------------------------------------------------------------------------
const SHADOW_DY = 4;

// ---------------------------------------------------------------------------
// Slide 2 — growing rectangle (linear width → linear shadow)
// ---------------------------------------------------------------------------

const slide2Base: Showable = {
  description: "Slide 2: Growing Rectangle",
  duration: DEFAULT_SLIDE_DURATION_MS,
  show({ context, timeInMs }) {
    const progress = timeInMs / DEFAULT_SLIDE_DURATION_MS;
    context.fillStyle = "black";
    context.fillRect(1, 1, lerp(0, 14, progress), 2);
  },
};

const slide2Shadow = makeShadowDemo({
  base: slide2Base,
  background: "white",
  dx: 0,
  dy: SHADOW_DY,
});

// ---------------------------------------------------------------------------
// Slide 3 — shape with diagonal + curve right edge sweeping across
//
// Path:  M x0,y0  h w  l 1,1.5  q 0,1.5 -1,1.5  h -w  z
//   Left side:   vertical, closed.
//   Top edge:    horizontal (width w).
//   Right top:   45°-ish diagonal line (+1, +1.5).
//   Right bottom: quadratic curve back left (control 0,+1.5; end -1,+1.5).
//   Bottom edge: horizontal back (width w).
// As w grows, the crooked right edge moves across the screen.
// ---------------------------------------------------------------------------

const slide3Base: Showable = {
  description: "Slide 3: Diagonal + Curve Edge",
  duration: DEFAULT_SLIDE_DURATION_MS,
  show({ context, timeInMs }) {
    const progress = timeInMs / DEFAULT_SLIDE_DURATION_MS;
    const w = lerp(0, 13, progress);
    const path = new Path2D(`M 1,1 h ${w} l 1,1.5 q 0,1.5 -1,1.5 h ${-w} z`);
    context.fillStyle = "black";
    context.fill(path);
  },
};

const slide3Shadow = makeShadowDemo({
  base: slide3Base,
  background: "white",
  dx: 0,
  dy: SHADOW_DY,
});

// ---------------------------------------------------------------------------
// Slide 4 — animated pattern fill, verifying radius ∝ √(coverage)
//
// Fills the three solid shapes (top row of slide 1, no stroke) with a 16×16
// device-pixel pattern.  Each frame, exactly n of the 256 pixels are opaque.
// n steps from 0 to 256 linearly over the slide duration.
//
// The pattern transform is set to the inverse of the context scale so that
// each pattern pixel = 1 device pixel, not 1 logical unit.  This makes the
// tile small enough to repeat many times per halftone cell, averaging cleanly
// to n/256 alpha instead of appearing as large 1-unit chunks.
//
// Expected result: shadow dot radius grows as √(n/256).
// ---------------------------------------------------------------------------

const PATTERN_SIDE = 16; // 16 × 16 = 256 pixels
const PATTERN_PIXELS = PATTERN_SIDE * PATTERN_SIDE;

const _patternCanvas = document.createElement("canvas");
_patternCanvas.width = PATTERN_SIDE;
_patternCanvas.height = PATTERN_SIDE;
const _patternCtx = _patternCanvas.getContext("2d")!;

const slide4Base: Showable = {
  description: "Slide 4: Pattern Fill Linearity Test",
  duration: DEFAULT_SLIDE_DURATION_MS,
  show({ context, timeInMs }) {
    const progress = timeInMs / DEFAULT_SLIDE_DURATION_MS;
    const n = Math.min(
      PATTERN_PIXELS,
      Math.floor(progress * (PATTERN_PIXELS + 1)),
    );

    // Rebuild the pattern: first n pixels black/opaque, rest transparent.
    _patternCtx.clearRect(0, 0, PATTERN_SIDE, PATTERN_SIDE);
    _patternCtx.fillStyle = "black";
    for (let i = 0; i < n; i++) {
      _patternCtx.fillRect(
        i % PATTERN_SIDE,
        Math.floor(i / PATTERN_SIDE),
        1,
        1,
      );
    }

    const pattern = context.createPattern(_patternCanvas, "repeat")!;
    // Counteract the context's scale transform so the pattern tiles at
    // device-pixel resolution, not logical-unit resolution.
    const { width, height } = context.canvas;
    pattern.setTransform(new DOMMatrix([16 / width, 0, 0, 9 / height, 0, 0]));
    context.fillStyle = pattern;

    // Top row of slide 1: solid shapes (row 0), no stroke.
    for (let col = 0; col < 3; col++) {
      const cx = COL_X[col];
      const cy = ROW_Y[0]; // y = 1.5 — top row
      if (col === 0) {
        polygon(context, cx, cy, SHAPE_RADIUS, 3, -Math.PI / 2);
      } else if (col === 1) {
        polygon(context, cx, cy, SHAPE_RADIUS, 4, Math.PI / 4);
      } else {
        context.beginPath();
        context.arc(cx, cy, SHAPE_RADIUS, 0, Math.PI * 2);
      }
      context.fill();
    }

    // Debug text — Verdana for consistent digit widths (no wiggle in animation).
    const coverage = n / PATTERN_PIXELS;
    context.font = "0.45px Verdana";
    context.fillStyle = "black";
    context.textBaseline = "top";
    context.fillText(
      `${n} / ${PATTERN_PIXELS} pixels — ${(coverage * 100).toFixed(3)}% coverage — radius ∝ ${Math.sqrt(coverage).toFixed(3)}`,
      0.25,
      7.75,
    );
  },
};

const slide4Shadow = makeShadowDemo({
  base: slide4Base,
  background: "white",
  dx: 0,
  dy: SHADOW_DY,
});

// ---------------------------------------------------------------------------
// slide 5, vertical lines
// ---------------------------------------------------------------------------

const slide5Base: Showable = {
  description: "vertical lines",
  duration: DEFAULT_SLIDE_DURATION_MS,
  show({ context, timeInMs }) {
    function drawVerticalLines(
      context: CanvasRenderingContext2D,
      left: number,
      top: number,
    ) {
      context.lineWidth = LINE_WIDTH;
      const bottom = top + 3;
      let x = left;
      myRainbow.forEach((color, index) => {
        context.strokeStyle = color;
        context.beginPath();
        context.moveTo(x, top);
        context.lineTo(x, bottom);
        context.stroke();
        /**
         * The lines look different depending how they align with the halftone dots.
         * I don't know exactly what I'm looking for, but this should cause lots of different alignments.
         */
        const diff = 0.9 ** index;
        x += diff;
      });
    }
    const progress = timeInMs / this.duration;
    const left = 1 + progress;
    drawVerticalLines(context, left, 1);
  },
};

const slide5Shadow = makeShadowDemo({
  base: slide5Base,
  background: "white",
  dx: 0,
  dy: SHADOW_DY,
});

// ---------------------------------------------------------------------------
// Combined deck — all chapters in sequence under one URL.
// ---------------------------------------------------------------------------

const allShadowTests = new MakeShowableInSeries("Shadow Tests");
allShadowTests.add(slide1Shadow);
allShadowTests.add(slide2Shadow);
allShadowTests.add(slide3Shadow);
allShadowTests.add(slide4Shadow);
allShadowTests.add(slide5Shadow);

export const shadowTest = allShadowTests.build();
