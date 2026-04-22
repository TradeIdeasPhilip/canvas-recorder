import {
  interpolateColor,
  interpolatePoints,
  interpolateRects,
  Keyframe,
  timedKeyframes,
} from "./interpolate";
import { ReadOnlyRect } from "phil-lib/misc";
import { myRainbow } from "./glib/my-rainbow";
import { MakeShowableInSeries, Showable, ShowOptions } from "./showable";
import { lerp } from "phil-lib/misc";
import { Point } from "./glib/path-shape";
import { applyTransform, panAndZoom } from "./glib/transforms";
import { createRectangleComponent } from "./slide-components";
import { LineFontMetrics, makeLineFont } from "./glib/line-font";
import { ParagraphLayout } from "./glib/paragraph-layout";
import { computeGridTransform, drawGrid } from "./glib/grid";

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

// Cached mipmap chain.  Rebuilt whenever the source canvas size changes.
const mipmapLevels: {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}[] = [];
let mipmapSourceSize = { width: 0, height: 0 };

/**
 * Hybrid downsampler: GPU mipmap to the last aligned level, then exact JS
 * pixel summation.
 *
 * "Aligned" means the canvas width is an exact integer multiple of `cols`
 * (and height of `rows`), so every halftone cell maps to a perfect rectangle
 * of pixels with no fractional-coverage edge artifacts.
 *
 * For a 3840×2160 source with the default period (cols=64, rows=36) the
 * aligned level is 960×540 — 15×15 px per cell.  Two GPU halvings reach it;
 * the JS loop reads 225 values per cell (vs 3600 for the full-res slow path).
 */
function createHalftone(fromImage: HTMLCanvasElement, period = 0.25): Path2D {
  const cols = Math.ceil(16 / period);
  const rows = Math.ceil(9 / period);

  // Find the smallest aligned level reachable by repeated halvings.
  let alignedW = fromImage.width;
  let alignedH = fromImage.height;
  while (alignedW > cols && alignedH > rows) {
    const nextW = Math.ceil(alignedW / 2);
    const nextH = Math.ceil(alignedH / 2);
    if (nextW % cols !== 0 || nextH % rows !== 0) break;
    alignedW = nextW;
    alignedH = nextH;
  }

  // Rebuild the mipmap chain when the source canvas size changes.
  if (
    fromImage.width !== mipmapSourceSize.width ||
    fromImage.height !== mipmapSourceSize.height
  ) {
    mipmapSourceSize = { width: fromImage.width, height: fromImage.height };
    mipmapLevels.length = 0;

    let w = fromImage.width;
    let h = fromImage.height;
    while (w > alignedW || h > alignedH) {
      w = Math.max(alignedW, Math.ceil(w / 2));
      h = Math.max(alignedH, Math.ceil(h / 2));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const isLast = w === alignedW && h === alignedH;
      const ctx = canvas.getContext("2d", { willReadFrequently: isLast })!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      mipmapLevels.push({ canvas, ctx });
    }
  }

  // Walk the mipmap chain to alignedW×alignedH.
  let src: HTMLCanvasElement = fromImage;
  for (const { canvas, ctx } of mipmapLevels) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    src = canvas;
  }

  // Exact JS summation from the aligned canvas.
  // cellPxW × cellPxH are whole numbers, so every cell has identical coverage.
  const cellPxW = alignedW / cols;
  const cellPxH = alignedH / rows;
  const cellArea = cellPxW * cellPxH;
  const readCtx =
    mipmapLevels.length > 0
      ? mipmapLevels[mipmapLevels.length - 1].ctx
      : fromImage.getContext("2d", { willReadFrequently: true })!;
  const { data } = readCtx.getImageData(0, 0, alignedW, alignedH);

  const result = new Path2D();
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const px0 = ix * cellPxW;
      const py0 = iy * cellPxH;
      let alphaSum = 0;
      for (let py = py0; py < py0 + cellPxH; py++) {
        for (let px = px0; px < px0 + cellPxW; px++) {
          alphaSum += data[(py * alignedW + px) * 4 + 3];
        }
      }
      const alpha = alphaSum / (cellArea * 255);
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

type HalftoneFunction = (
  fromImage: HTMLCanvasElement,
  period?: number,
) => Path2D;

/**
 * Wraps a {@link Showable} with a halftone drop-shadow effect.
 *
 * On each frame:
 *  1. Renders `base` onto a fixed 4K off-screen canvas.
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
 * @param options.halftone     Downsampling function.  Default: fast mipmap path.
 *                             Pass `createHalftoneSlow` to use exact JS averaging.
 */
export function makeShadowDemo(options: {
  readonly base: Showable;
  readonly dotColor?: CanvasFillStyle;
  readonly background?: CanvasFillStyle;
  readonly dx?: number;
  readonly dy?: number;
  readonly halftone?: HalftoneFunction;
}): Showable {
  const {
    base,
    dotColor = "#ccc",
    background,
    dx = 0.2,
    dy = 0.2,
    halftone = createHalftone,
  } = options;

  // Fixed-size 4K off-screen canvas.  Using a constant size means the halftone
  // sampling is always at the same resolution regardless of the display canvas
  // size, so the live preview and the saved file look identical.
  const TEMP_W = 3840;
  const TEMP_H = 2160;
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = TEMP_W;
  tempCanvas.height = TEMP_H;
  const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true })!;
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
      const halftonePath = halftone(tempCanvas);

      // --- Composite onto the main context ---

      if (background !== undefined) {
        context.fillStyle = background;
        context.fillRect(0, 0, 16, 9);
      }

      // Shadow: same dot path, shifted by (dx, dy).
      context.save();
      context.translate(dx, dy);
      context.fillStyle = dotColor;
      context.fill(halftonePath);
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

// Bounding box that exactly contains all 9 shapes (used as panAndZoom srcRect).
const SLIDE1_CONTENT_RECT: ReadOnlyRect = {
  x: COL_X[0] - SHAPE_RADIUS,
  y: ROW_Y[0] - SHAPE_RADIUS,
  width: COL_X[2] - COL_X[0] + 2 * SHAPE_RADIUS,
  height: ROW_Y[2] - ROW_Y[0] + 2 * SHAPE_RADIUS,
};

// Row fill factories: solid, 25 % opacity, no fill.
const FILL_FOR_ROW = [
  (color: string): string => color,
  (color: string): string => interpolateColor(0.25, "transparent", color),
  (_color: string): string => "transparent",
] as const;

/**
 * Project-specific slide component: nine shapes in a 3×3 grid.
 *
 * Columns (shape type):  triangle | square | circle
 * Rows    (fill):        solid    | 25 %   | none
 *
 * Colors go column-major through {@link myRainbow}.
 * Exported so the dev GUI can offer it in the component registry.
 */
export function createNineShapesComponent(): Showable {
  const layoutSchedule: Keyframe<ReadOnlyRect>[] = [
    { time: 0, value: { x: 2, y: 2, width: 6, height: 4 } },
  ];
  return {
    description: "Nine Shapes",
    duration: 0,
    schedules: [{ description: "Layout", type: "rectangle", schedule: layoutSchedule }],
    show({ context, timeInMs }) {
      const progress = timeInMs / DEFAULT_SLIDE_DURATION_MS;
      const destRect = interpolateRects(timeInMs, layoutSchedule);
      const matrix = panAndZoom(
        SLIDE1_CONTENT_RECT,
        destRect,
        "srcRect fits completely into destRect",
      );
      context.save();
      applyTransform(context, matrix);
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
            polygon(context, cx, cy, SHAPE_RADIUS, 3, -Math.PI / 2);
          } else if (col === 1) {
            polygon(context, cx, cy, SHAPE_RADIUS, 4, Math.PI / 4);
          } else {
            context.beginPath();
            context.arc(cx, cy, SHAPE_RADIUS, 0, Math.PI * 2);
          }
          context.fill();
          context.stroke();
        }
      }
      context.restore();
    },
  };
}

// ---------------------------------------------------------------------------
// Shadow configuration — copy and customize when using makeShadowDemo
// in your own project.
// ---------------------------------------------------------------------------

const SHADOW_OPTIONS: Omit<Parameters<typeof makeShadowDemo>[0], "base"> = {
  background: "white",
  dotColor: "#ccc",
  dx: 0.2,
  dy: 0.2,
};

// ---------------------------------------------------------------------------
// Slide list
// ---------------------------------------------------------------------------

const slideList = new MakeShowableInSeries("Shadow Test");

// ---------------------------------------------------------------------------
// Slide 1 — shape gallery
// ---------------------------------------------------------------------------
{
  const slide: Showable = {
    description: "Slide 1: Shape Gallery",
    duration: DEFAULT_SLIDE_DURATION_MS,
    components: [createNineShapesComponent()],
    show(options) {
      for (const child of this.components!) child.show(options);
    },
  };
  slideList.add(slide);
}

// ---------------------------------------------------------------------------
// Slide 2 — growing rectangle (linear width → linear shadow)
// ---------------------------------------------------------------------------
{
  const slide: Showable = {
    description: "Slide 2: Growing Rectangle",
    duration: DEFAULT_SLIDE_DURATION_MS,
    components: [
      createRectangleComponent(
        [
          { time: 0, value: myRainbow.red },
          { time: DEFAULT_SLIDE_DURATION_MS, value: myRainbow.yellow },
        ],
        [
          { time: 0, value: { x: 1, y: 1, width: 1, height: 2 } },
          { time: DEFAULT_SLIDE_DURATION_MS, value: { x: 1, y: 1, width: 14, height: 2 } },
        ],
      ),
    ],
    show(options) {
      for (const child of this.components!) child.show(options);
    },
  };
  slideList.add(slide);
}

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
{
  const slide: Showable = {
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
  slideList.add(slide);
}

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
{
  const PATTERN_SIDE = 16; // 16 × 16 = 256 pixels
  const PATTERN_PIXELS = PATTERN_SIDE * PATTERN_SIDE;
  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = PATTERN_SIDE;
  patternCanvas.height = PATTERN_SIDE;
  const patternCtx = patternCanvas.getContext("2d")!;

  const slide: Showable = {
    description: "Slide 4: Pattern Fill Linearity Test",
    duration: DEFAULT_SLIDE_DURATION_MS,
    show({ context, timeInMs }) {
      const progress = timeInMs / DEFAULT_SLIDE_DURATION_MS;
      const n = Math.min(
        PATTERN_PIXELS,
        Math.floor(progress * (PATTERN_PIXELS + 1)),
      );

      // Rebuild the pattern: first n pixels black/opaque, rest transparent.
      patternCtx.clearRect(0, 0, PATTERN_SIDE, PATTERN_SIDE);
      patternCtx.fillStyle = "black";
      for (let i = 0; i < n; i++) {
        patternCtx.fillRect(i % PATTERN_SIDE, Math.floor(i / PATTERN_SIDE), 1, 1);
      }

      const pattern = context.createPattern(patternCanvas, "repeat")!;
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
  slideList.add(slide);
}

// ---------------------------------------------------------------------------
// Slide 5 — vertical lines
// ---------------------------------------------------------------------------
{
  const positionSchedule: Keyframe<Point>[] = [
    { time: 0, value: { x: 1, y: 1 } },
  ];

  const slide: Showable = {
    description: "Slide 5: Vertical Lines",
    duration: DEFAULT_SLIDE_DURATION_MS,
    schedules: [
      {
        description: "Starting Position",
        type: "point",
        schedule: positionSchedule,
      },
    ],
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
      const progress = timeInMs / DEFAULT_SLIDE_DURATION_MS;
      const startingPosition = interpolatePoints(timeInMs, positionSchedule);
      const left = startingPosition.x + progress;
      drawVerticalLines(context, left, startingPosition.y);
    },
  };
  slideList.add(slide);
}

// ---------------------------------------------------------------------------
// Font Inspector — lineFont metrics and glyph viewer
// ---------------------------------------------------------------------------
{
  const FONT_SIZE = 1.0;
  const metrics = new LineFontMetrics(FONT_SIZE);
  const font = makeLineFont(metrics);

  const textSchedule: Keyframe<string>[] = [{ time: 0, value: "Ag" }];
  const zoomRectSchedule: Keyframe<ReadOnlyRect>[] = [
    { time: 0, value: { x: 0.3, y: 0.5, width: 10.5, height: 8 } },
  ];
  const simplePosSchedule: Keyframe<Point>[] = [
    { time: 0, value: { x: 12.5, y: 5 } },
  ];

  // Metric lines in font y-space (baseline = 0, above = negative, below = positive).
  // drawGrid uses y-up (math) convention, so we pass −fontY when mapping.
  // The grid labels then show: capitalTop ≈ +1 (one fontSize above baseline),
  // descender ≈ −0.25 (below baseline), which reads naturally as "distance from baseline".
  const METRIC_LINES = [
    { label: "top",           y: metrics.top,           color: "#e88" },
    { label: "capitalTop",    y: metrics.capitalTop,    color: "#ffa040" },
    { label: "capitalMiddle", y: metrics.capitalMiddle, color: "#dd0" },
    { label: "baseline",      y: metrics.baseline,      color: "#4c4" },
    { label: "descender",     y: metrics.descender,     color: "#88f" },
    { label: "bottom",        y: metrics.bottom,        color: "#c8f" },
  ] as const;

  const slide: Showable = {
    description: "Font Inspector",
    duration: DEFAULT_SLIDE_DURATION_MS,
    schedules: [
      { description: "Text",                type: "string",    schedule: textSchedule },
      { description: "Zoom Area",           type: "rectangle", schedule: zoomRectSchedule },
      { description: "Simple Text Position",type: "point",     schedule: simplePosSchedule },
    ],
    show({ context, timeInMs }) {
      // Read current schedule values.
      const textKf = timedKeyframes(timeInMs, textSchedule);
      const text = textKf.single ? textKf.value : textKf.from;
      const zoomRect = interpolateRects(timeInMs, zoomRectSchedule);
      const simplePos = interpolatePoints(timeInMs, simplePosSchedule);

      // Build text layout (shared by both views).
      const layout = new ParagraphLayout(font);
      layout.addText(text);
      const laidOut = layout.align();
      const textPath = laidOut.singlePathShape();

      // ── Zoomed + instrumented view ──────────────────────────────────────

      // viewRect in math (y-up) space, where math_y = −font_y.
      const PAD_X = FONT_SIZE * 0.5;
      const PAD_Y = FONT_SIZE * 0.25;
      const mathViewRect: ReadOnlyRect = {
        x: -PAD_X,
        y: -(metrics.bottom + PAD_Y),
        width: Math.max(laidOut.width, FONT_SIZE) + 2 * PAD_X,
        height: (metrics.bottom - metrics.top) + 2 * PAD_Y,
      };

      drawGrid(context, {
        destRect: zoomRect,
        viewRect: mathViewRect,
        color: "rgba(150, 150, 150, 0.35)",
        targetTickCount: 6,
      });

      const xf = computeGridTransform(zoomRect, mathViewRect);
      if (!xf) return;
      const { toCanvasY, effectiveRect } = xf;
      const scale = effectiveRect.width / mathViewRect.width;

      // Clip text and metric lines to the grid area.
      context.save();
      context.beginPath();
      context.rect(effectiveRect.x, effectiveRect.y, effectiveRect.width, effectiveRect.height);
      context.clip();

      // Metric reference lines (drawn in canvas space via toCanvasY(−fontY)).
      for (const { y: fontY, color } of METRIC_LINES) {
        const cy = toCanvasY(-fontY);
        context.strokeStyle = color;
        context.lineWidth = 0.025;
        context.setLineDash([0.12, 0.08]);
        context.beginPath();
        context.moveTo(effectiveRect.x, cy);
        context.lineTo(effectiveRect.x + effectiveRect.width, cy);
        context.stroke();
      }
      context.setLineDash([]);

      // Draw text in ParagraphLayout coordinate space.
      // ParagraphLayout places the top of text at path y=0, baseline at path y=−metrics.top.
      // We need: canvas_y = toCanvasY(−(path_y + metrics.top))
      //   = effectiveRect.y + effectiveRect.height + (metrics.top + mathViewRect.y) × scale + path_y × scale
      context.translate(
        effectiveRect.x - mathViewRect.x * scale,
        effectiveRect.y + effectiveRect.height + (metrics.top + mathViewRect.y) * scale,
      );
      context.scale(scale, scale);
      context.strokeStyle = "#000";
      context.lineWidth = metrics.strokeWidth;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke(textPath.canvasPath);

      context.restore(); // removes clip and transform

      // Legend labels to the right of the grid.
      context.font = "0.22px sans-serif";
      context.textAlign = "left";
      context.textBaseline = "middle";
      const legendX = effectiveRect.x + effectiveRect.width + 0.1;
      for (const { label, y: fontY, color } of METRIC_LINES) {
        context.fillStyle = color;
        context.fillText(label, legendX, toCanvasY(-fontY));
      }

      // ── Simple unadorned copy ───────────────────────────────────────────
      // simplePos.y is the baseline; shift up by metrics.top to compensate
      // for ParagraphLayout placing top-of-text at path y=0.
      context.save();
      context.translate(simplePos.x, simplePos.y + metrics.top);
      context.strokeStyle = "#000";
      context.lineWidth = metrics.strokeWidth;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke(textPath.canvasPath);
      context.restore();
    },
  };
  slideList.add(slide);
}

export const shadowTest = makeShadowDemo({
  base: slideList.build(),
  ...SHADOW_OPTIONS,
});
