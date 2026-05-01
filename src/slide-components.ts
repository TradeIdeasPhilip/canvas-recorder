import { ReadOnlyRect } from "phil-lib/misc";
import {
  discreteKeyframes,
  interpolateColors,
  interpolateNumbers,
  interpolateRects,
  Keyframe,
} from "./interpolate";
import { Showable } from "./showable";
import { SingleImage, SlowImage } from "./slow-image-sources";
import { computeGridTransform, drawGrid } from "./glib/grid";

/**
 * Standard registry component: a filled rectangle with an editable color and
 * position/size schedule.
 *
 * Pass pre-populated schedule arrays to seed an existing animation; omit them
 * to get a single-keyframe default suitable for a brand-new rectangle.
 */
export function createRectangleComponent(
  initialColorSchedule?: Keyframe<string>[],
  initialRectSchedule?: Keyframe<ReadOnlyRect>[],
): Showable {
  const colorSchedule: Keyframe<string>[] = initialColorSchedule ?? [
    { time: 0, value: "cyan" },
  ];
  const rectSchedule: Keyframe<ReadOnlyRect>[] = initialRectSchedule ?? [
    { time: 0, value: { x: 2, y: 2, width: 6, height: 4 } },
  ];

  return {
    description: "Rectangle",
    duration: 0,
    schedules: [
      { description: "Color", type: "color", schedule: colorSchedule },
      { description: "Rect", type: "rectangle", schedule: rectSchedule },
    ],
    show({ context, timeInMs }) {
      const color = interpolateColors(timeInMs, colorSchedule);
      const rect = interpolateRects(timeInMs, rectSchedule);
      context.fillStyle = color;
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
    },
  };
}

/**
 * Standard registry component: a Cartesian function graph with an editable
 * destination rect and view window.
 *
 * The function `f` is supplied at construction time (code, not data).
 * Everything visual — position, view range, colors, font — is an editable
 * schedule, so you can adjust the graph live in the editor without restarting.
 *
 * The y range is auto-computed from sampling `f` over the default x range
 * and stored as the initial keyframe values, ready to be overridden.
 */
/**
 * Standard registry component: draws a single image loaded from a URL.
 *
 * While the image is loading (or if the URL is empty), the destination
 * rectangle is left blank.  If the URL is non-empty but the load fails,
 * {@link SlowImage.showError} draws a red ✕ so the problem is obvious.
 *
 * The URL schedule is discrete — changing it mid-animation triggers a fresh
 * load.  The dest-rect schedule is interpolated so you can animate placement.
 */
export function createSingleImageComponent(initialUrl = ""): Showable {
  const urlSchedule: Keyframe<string>[] = [{ time: 0, value: initialUrl }];
  const destRectSchedule: Keyframe<ReadOnlyRect>[] = [
    { time: 0, value: { x: 1, y: 1, width: 14, height: 7 } },
  ];

  let trackedUrl = "";
  let image: SingleImage | null = null;

  return {
    description: "Static Image",
    duration: 0,
    schedules: [
      { description: "URL", type: "string", schedule: urlSchedule },
      {
        description: "Dest Rect",
        type: "rectangle",
        schedule: destRectSchedule,
      },
    ],
    show({ context, timeInMs }) {
      const url = discreteKeyframes(timeInMs, urlSchedule);
      const dest = interpolateRects(timeInMs, destRectSchedule);

      if (url !== trackedUrl) {
        trackedUrl = url;
        image = url ? new SingleImage(url) : null;
      }

      if (!image) return; // empty URL — leave the area blank
      if (!image.somethingIsAvailable) {
        SlowImage.showError(context, dest.x, dest.y, dest.width, dest.height);
        return;
      }

      // Fit the image inside dest, preserving aspect ratio (centered).
      const imgAspect = image.naturalWidth / image.naturalHeight;
      const destAspect = dest.width / dest.height;
      let drawW: number, drawH: number;
      if (imgAspect > destAspect) {
        drawW = dest.width;
        drawH = dest.width / imgAspect;
      } else {
        drawH = dest.height;
        drawW = dest.height * imgAspect;
      }
      const drawX = dest.x + (dest.width - drawW) / 2;
      const drawY = dest.y + (dest.height - drawH) / 2;
      context.drawImage(
        image.data as CanvasImageSource,
        drawX,
        drawY,
        drawW,
        drawH,
      );
    },
  };
}

export function createFunctionGraphComponent(
  f: (x: number) => number = Math.sin,
): Showable {
  const SAMPLE_COUNT = 300;
  const X_DEFAULT_MIN = -Math.PI * 2;
  const X_DEFAULT_MAX = Math.PI * 2;

  // Sample f to auto-range the y axis.
  const yValues: number[] = [];
  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const x =
      X_DEFAULT_MIN + ((X_DEFAULT_MAX - X_DEFAULT_MIN) * i) / SAMPLE_COUNT;
    yValues.push(f(x));
  }
  const yDataMin = Math.min(...yValues);
  const yDataMax = Math.max(...yValues);
  const yPad = Math.max((yDataMax - yDataMin) * 0.1, 0.1);

  const destRectSchedule: Keyframe<ReadOnlyRect>[] = [
    { time: 0, value: { x: 2, y: 2, width: 6, height: 4 } },
  ];
  const xMinSchedule: Keyframe<number>[] = [{ time: 0, value: X_DEFAULT_MIN }];
  const xMaxSchedule: Keyframe<number>[] = [{ time: 0, value: X_DEFAULT_MAX }];
  const yMinSchedule: Keyframe<number>[] = [
    { time: 0, value: yDataMin - yPad },
  ];
  const yMaxSchedule: Keyframe<number>[] = [
    { time: 0, value: yDataMax + yPad },
  ];
  const gridColorSchedule: Keyframe<string>[] = [
    { time: 0, value: "rgba(255,255,255,0.35)" },
  ];
  const gridLineWidthSchedule: Keyframe<number>[] = [{ time: 0, value: 0.02 }];
  const fontSchedule: Keyframe<string>[] = [
    { time: 0, value: "0.28px sans-serif" },
  ];
  const curveColorSchedule: Keyframe<string>[] = [
    { time: 0, value: "rgb(0,128,255)" },
  ];

  return {
    description: "Function Graph",
    duration: 0,
    schedules: [
      {
        description: "Dest Rect",
        type: "rectangle",
        schedule: destRectSchedule,
      },
      { description: "X Min", type: "number", schedule: xMinSchedule },
      { description: "X Max", type: "number", schedule: xMaxSchedule },
      { description: "Y Min", type: "number", schedule: yMinSchedule },
      { description: "Y Max", type: "number", schedule: yMaxSchedule },
      {
        description: "Grid Color",
        type: "string",
        schedule: gridColorSchedule,
      },
      {
        description: "Grid Line Width",
        type: "number",
        schedule: gridLineWidthSchedule,
      },
      { description: "Font", type: "string", schedule: fontSchedule },
      {
        description: "Curve Color",
        type: "color",
        schedule: curveColorSchedule,
      },
    ],
    show({ context, timeInMs }) {
      const destRect = interpolateRects(timeInMs, destRectSchedule);
      const xMin = interpolateNumbers(timeInMs, xMinSchedule);
      const xMax = interpolateNumbers(timeInMs, xMaxSchedule);
      const yMin = interpolateNumbers(timeInMs, yMinSchedule);
      const yMax = interpolateNumbers(timeInMs, yMaxSchedule);
      if (xMax <= xMin || yMax <= yMin) return;

      const gridColor = discreteKeyframes(timeInMs, gridColorSchedule);
      const gridLineWidth = interpolateNumbers(timeInMs, gridLineWidthSchedule);
      const font = discreteKeyframes(timeInMs, fontSchedule);
      const curveColor = interpolateColors(timeInMs, curveColorSchedule);

      const viewRect: ReadOnlyRect = {
        x: xMin,
        y: yMin,
        width: xMax - xMin,
        height: yMax - yMin,
      };

      drawGrid(context, {
        destRect,
        viewRect,
        color: gridColor,
        majorLineWidth: gridLineWidth,
        font,
      });

      // Use the same transform as drawGrid so the curve aligns with the grid.
      const xf = computeGridTransform(destRect, viewRect);
      if (!xf) return;
      const { toCanvasX, toCanvasY, effectiveRect } = xf;

      // Border — drawn around the actual letterboxed area.
      context.strokeStyle = gridColor;
      context.lineWidth = gridLineWidth * 1.5;
      context.setLineDash([]);
      context.lineCap = "butt";
      context.strokeRect(
        effectiveRect.x,
        effectiveRect.y,
        effectiveRect.width,
        effectiveRect.height,
      );

      // Function curve — clipped to effectiveRect.
      context.save();
      context.beginPath();
      context.rect(
        effectiveRect.x,
        effectiveRect.y,
        effectiveRect.width,
        effectiveRect.height,
      );
      context.clip();

      context.beginPath();
      for (let i = 0; i <= SAMPLE_COUNT; i++) {
        const mx = xMin + ((xMax - xMin) * i) / SAMPLE_COUNT;
        const cx = toCanvasX(mx);
        const cy = toCanvasY(f(mx));
        if (i === 0) context.moveTo(cx, cy);
        else context.lineTo(cx, cy);
      }
      context.strokeStyle = curveColor;
      context.lineWidth = 0.04;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();

      context.restore();
    },
  };
}

/** Registry of component factories available in the "Add" dropdown. */
export const componentRegistry = new Map<string, () => Showable>([
  ["Rectangle", () => createRectangleComponent()],
  ["Function Graph (sin)", () => createFunctionGraphComponent()],
  ["Function Graph (x²)", () => createFunctionGraphComponent((x) => x * x)],
  ["Static Image", () => createSingleImageComponent()],
]);
