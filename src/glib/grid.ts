import { ReadOnlyRect } from "phil-lib/misc";

/**
 * "Nice Numbers for Graph Labels" — Paul Heckbert, 1990 (Graphics Gems).
 * Snaps a rough step size to the nearest human-friendly value: {1, 2, 5, 10} × 10^n.
 */
function niceStep(roughStep: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const n = roughStep / mag; // normalized 1..10
  const nice = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return nice * mag;
}

/**
 * Returns tick values covering [min, max] at the given fixed step size.
 */
function ticksWithStep(min: number, max: number, step: number): number[] {
  if (max <= min || step <= 0) return [];
  const start = Math.ceil(min / step) * step;
  const result: number[] = [];
  for (let v = start; v <= max + step * 1e-10; v += step) {
    result.push(Math.round(v / step) * step); // snap away float drift
  }
  return result;
}

function formatTick(v: number): string {
  if (Math.abs(v) < 1e-10) return "0";
  return parseFloat(v.toPrecision(4)).toString();
}

/**
 * The coordinate mapping produced by {@link computeGridTransform}.
 */
export type GridTransform = {
  /** Map a mathematical x coordinate to a canvas x coordinate. */
  toCanvasX: (mx: number) => number;
  /** Map a mathematical y coordinate to a canvas y coordinate (y-flipped). */
  toCanvasY: (my: number) => number;
  /**
   * The actual drawn rectangle on the canvas after uniform-scale letterboxing.
   * This is centered inside `destRect` and may be smaller in one dimension.
   * Use it for borders, clipping, and anything else that must align with the grid.
   */
  effectiveRect: ReadOnlyRect;
};

/**
 * Compute the uniform-scale transform that fits `viewRect` (math space) into
 * `destRect` (canvas space) while preserving a 1:1 aspect ratio.
 *
 * The result is letterboxed: the entire `viewRect` is always visible, centered
 * inside `destRect`, with unused canvas space on two sides when the aspect
 * ratios differ.
 *
 * Returns `null` when the inputs are degenerate (zero-size rect).
 *
 * Callers that need to draw their own content (e.g. a function curve) on top of
 * a grid should use this transform so both share the same coordinate mapping.
 */
export function computeGridTransform(
  destRect: ReadOnlyRect,
  viewRect: ReadOnlyRect,
): GridTransform | null {
  if (
    viewRect.width <= 0 ||
    viewRect.height <= 0 ||
    destRect.width <= 0 ||
    destRect.height <= 0
  )
    return null;

  // Uniform scale: use the smaller of the two axis scales so the full viewRect fits.
  const scale = Math.min(
    destRect.width / viewRect.width,
    destRect.height / viewRect.height,
  );

  const drawWidth = viewRect.width * scale;
  const drawHeight = viewRect.height * scale;

  // Center the drawn area inside destRect.
  const effectiveRect: ReadOnlyRect = {
    x: destRect.x + (destRect.width - drawWidth) / 2,
    y: destRect.y + (destRect.height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };

  const xMin = viewRect.x;
  const yMin = viewRect.y;

  const toCanvasX = (mx: number) => effectiveRect.x + (mx - xMin) * scale;
  // y increases upward in math space, downward on canvas.
  const toCanvasY = (my: number) =>
    effectiveRect.y + effectiveRect.height - (my - yMin) * scale;

  return { toCanvasX, toCanvasY, effectiveRect };
}

/**
 * Draw a Cartesian grid — lines and axis labels — inside a destination rectangle.
 *
 * **Coordinate conventions**
 * - `destRect` is in the 16×9 logical canvas space.
 * - `viewRect` is in mathematical space: `x` = xMin, `y` = yMin (the *bottom* edge),
 *   `width` = xRange, `height` = yRange.  y increases **upward**, opposite the canvas y-axis.
 *
 * The grid is drawn with a **uniform scale** (1:1 aspect ratio), letterboxed
 * and centered inside `destRect`.  Use {@link computeGridTransform} to get the
 * same coordinate mapping for drawing content on top of the grid.
 *
 * Grid lines are clipped to the effective (letterboxed) rect.  Labels are drawn
 * just outside it — ensure your layout leaves margin room.
 */
export function drawGrid(
  context: CanvasRenderingContext2D,
  {
    destRect,
    viewRect,
    color = "rgba(255,255,255,0.35)",
    majorLineWidth = 0.02,
    font = "0.28px sans-serif",
    targetTickCount = 6,
  }: {
    destRect: ReadOnlyRect;
    viewRect: ReadOnlyRect;
    /** CSS color for lines and labels. */
    color?: string;
    /** Line width for grid lines, in logical canvas units. */
    majorLineWidth?: number;
    /**
     * CSS font string for axis labels.  The "px" size is in logical canvas units:
     * "0.28px sans-serif" renders ~0.28 units tall in the 16×9 coordinate system.
     */
    font?: string;
    /** Approximate number of ticks per axis; actual count will be "nice". */
    targetTickCount?: number;
  },
): void {
  const xf = computeGridTransform(destRect, viewRect);
  if (!xf) return;
  const { toCanvasX, toCanvasY, effectiveRect } = xf;

  const xMin = viewRect.x;
  const xMax = viewRect.x + viewRect.width;
  const yMin = viewRect.y;
  const yMax = viewRect.y + viewRect.height;

  // One step for both axes so grid cells are square.
  // Basing on the shorter range means the short axis gets ~targetTickCount cells;
  // the long axis gets proportionally more, covering the whole view with equal squares.
  const mathStep = niceStep(
    Math.min(viewRect.width, viewRect.height) / targetTickCount,
  );
  const xTicks = ticksWithStep(xMin, xMax, mathStep);
  const yTicks = ticksWithStep(yMin, yMax, mathStep);

  // Grid lines — clipped to the effective (letterboxed) rect.
  context.save();
  context.beginPath();
  context.rect(
    effectiveRect.x,
    effectiveRect.y,
    effectiveRect.width,
    effectiveRect.height,
  );
  context.clip();

  context.strokeStyle = color;
  context.lineWidth = majorLineWidth;
  context.lineCap = "butt";
  context.setLineDash([]);

  for (const mx of xTicks) {
    const cx = toCanvasX(mx);
    context.beginPath();
    context.moveTo(cx, effectiveRect.y);
    context.lineTo(cx, effectiveRect.y + effectiveRect.height);
    context.stroke();
  }
  for (const my of yTicks) {
    const cy = toCanvasY(my);
    context.beginPath();
    context.moveTo(effectiveRect.x, cy);
    context.lineTo(effectiveRect.x + effectiveRect.width, cy);
    context.stroke();
  }

  context.restore();

  // Labels — outside the clip, in the surrounding margin.
  context.font = font;
  context.fillStyle = color;

  context.textAlign = "center";
  context.textBaseline = "top";
  for (const mx of xTicks) {
    context.fillText(
      formatTick(mx),
      toCanvasX(mx),
      effectiveRect.y + effectiveRect.height + majorLineWidth * 2,
    );
  }

  context.textAlign = "right";
  context.textBaseline = "middle";
  for (const my of yTicks) {
    context.fillText(
      formatTick(my),
      effectiveRect.x - majorLineWidth * 2,
      toCanvasY(my),
    );
  }
}
