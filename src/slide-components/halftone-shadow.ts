import { ColorScheduleInfo, NumberScheduleInfo } from "../schedule-helper";
import { Showable, ShowOptions } from "../showable";
import { InParallelComponent } from "./in-parallel";
import { Keyframe } from "../interpolate";

/** At 100% opacity the dot radius reaches this fraction of the half-cell width. */
const HALFTONE_MAX_RADIUS_FACTOR = 0.9;

/**
 * Wraps its children with a halftone drop-shadow effect.
 *
 * On each frame:
 *  1. Renders all children onto a tiny canvas (one pixel per halftone circle)
 *     to sample alpha cheaply.
 *  2. Reads the alpha channel and fills a dot Path2D offset by (dx, dy) as the shadow.
 *  3. Renders all children again at full quality onto the main canvas.
 *
 * Add content as replaceable children via the Visual Editor, or supply a `base`
 * Showable in the constructor to add it as a fixed child.
 */
export class HalftoneShadowComponent extends InParallelComponent {
  readonly registryKey = "Halftone Shadow";
  readonly dotColorSchedule = new ColorScheduleInfo("Dot Color", "#ccc");
  readonly backgroundColorSchedule = new ColorScheduleInfo(
    "Background Color",
    "transparent",
  );
  readonly dxSchedule = new NumberScheduleInfo("Dx", 0.2);
  readonly dySchedule = new NumberScheduleInfo("Dy", 0.2);
  readonly periodSchedule = new NumberScheduleInfo("Period", 0.25);

  #smallCanvas: HTMLCanvasElement | undefined;
  #smallCtx: CanvasRenderingContext2D | undefined;
  #smallCols = 0;
  #smallRows = 0;

  constructor(
    initialValues: {
      base?: Showable;
      description?: string;
      dotColor?: string | readonly Keyframe<string>[];
      backgroundColor?: string | readonly Keyframe<string>[];
      dx?: number | readonly Keyframe<number>[];
      dy?: number | readonly Keyframe<number>[];
      period?: number | readonly Keyframe<number>[];
    } = {},
  ) {
    const { base } = initialValues;
    super(
      initialValues.description ??
        (base ? `${base.description} » shadow` : "Halftone Shadow"),
    );
    this.schedules.push(
      this.dotColorSchedule,
      this.backgroundColorSchedule,
      this.dxSchedule,
      this.dySchedule,
      this.periodSchedule,
    );
    if (base) this.addFixed({ child: base });
    if (initialValues.dotColor !== undefined)
      this.dotColorSchedule.set(initialValues.dotColor);
    if (initialValues.backgroundColor !== undefined)
      this.backgroundColorSchedule.set(initialValues.backgroundColor);
    if (initialValues.dx !== undefined) this.dxSchedule.set(initialValues.dx);
    if (initialValues.dy !== undefined) this.dySchedule.set(initialValues.dy);
    if (initialValues.period !== undefined)
      this.periodSchedule.set(initialValues.period);
  }

  override show(options: ShowOptions): void {
    const { context, timeInMs } = options;
    const dotColor = this.dotColorSchedule.at(timeInMs);
    const backgroundColor = this.backgroundColorSchedule.at(timeInMs);
    const dx = this.dxSchedule.at(timeInMs);
    const dy = this.dySchedule.at(timeInMs);
    const period = this.periodSchedule.at(timeInMs);
    const cols = Math.ceil(16 / period);
    const rows = Math.ceil(9 / period);

    // Low-power mode or CLI context: skip the halftone pass.
    if (options.quality === "Low Power" || typeof document === "undefined") {
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, 16, 9);
      super.show(options);
      return;
    }

    // Resize the small canvas when period changes.
    if (
      !this.#smallCanvas ||
      this.#smallCols !== cols ||
      this.#smallRows !== rows
    ) {
      this.#smallCanvas = document.createElement("canvas");
      this.#smallCanvas.width = cols;
      this.#smallCanvas.height = rows;
      this.#smallCtx = this.#smallCanvas.getContext("2d", {
        willReadFrequently: true,
      })!;
      // Apply the 16×9 root transform once — it stays until the canvas is replaced.
      this.#smallCtx.scale(cols / 16, rows / 9);
      this.#smallCols = cols;
      this.#smallRows = rows;
    }
    const smallCtx = this.#smallCtx!;

    // Render children into the small canvas for alpha sampling.
    smallCtx.save();
    smallCtx.resetTransform();
    smallCtx.clearRect(0, 0, cols, rows);
    smallCtx.restore();
    super.show({ ...options, context: smallCtx, registerTransform: undefined });

    // Draw background.
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, 16, 9);

    // Build halftone dot path from the alpha channel and draw as the shadow.
    const { data } = smallCtx.getImageData(0, 0, cols, rows);
    const path = new Path2D();
    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        const alpha = data[(iy * cols + ix) * 4 + 3] / 255;
        if (alpha > 0) {
          const x = (ix + 0.5) * period;
          const y = (iy + 0.5) * period;
          const radius =
            Math.sqrt(alpha) * (period / 2) * HALFTONE_MAX_RADIUS_FACTOR;
          path.moveTo(x + radius, y);
          path.arc(x, y, radius, 0, Math.PI * 2);
        }
      }
    }
    context.save();
    context.translate(dx, dy);
    context.fillStyle = dotColor;
    context.fill(path);
    context.restore();

    // Render children at full quality onto the main canvas.
    super.show(options);
  }
}
