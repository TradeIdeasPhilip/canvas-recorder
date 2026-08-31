import { Point } from "bezier-js";
import {
  ArrowScheduleInfo,
  NumberScheduleInfo,
  ColorScheduleInfo,
  ArrowValue,
} from "../schedule-helper";
import { ShowOptions } from "../showable";
import { DurationAgnosticComponent } from "./duration-agnostic";
import { Keyframe } from "../interpolate";

/**
 * Standard registry component: a directed arrow with a rectangular shaft and
 * filled triangular head.  Uses a single filled {@link Path2D} so partially
 * transparent colors don't double-blend where the head overlaps the shaft.
 *
 * Both endpoints are {@link PointScheduleInfo} schedules, so the Visual Editor
 * renders them as draggable circles directly on the canvas.
 */
export class ArrowComponent extends DurationAgnosticComponent {
  readonly registryKey: string;

  readonly arrowSchedule = new ArrowScheduleInfo("Location", {
    flat: { x: 2, y: 4.5 },
    pointy: { x: 12, y: 4.5 },
  });
  readonly widthSchedule = new NumberScheduleInfo("Width", 0.5);
  readonly colorSchedule = new ColorScheduleInfo("Color", "#555");
  override readonly replaceableComponents = undefined;
  constructor(
    initialValues: {
      registryKey?: string;
      description?: string;
      arrow?: ArrowValue | readonly Keyframe<ArrowValue>[];
      width?: number | readonly Keyframe<number>[];
      color?: string | readonly Keyframe<string>[];
    } = {},
  ) {
    super(initialValues.description ?? "Arrow");
    this.schedules.push(
      this.arrowSchedule,
      this.widthSchedule,
      this.colorSchedule,
    );
    this.registryKey = initialValues.registryKey ?? "Arrow";
    if (initialValues.arrow !== undefined)
      this.arrowSchedule.set(initialValues.arrow);
    if (initialValues.width !== undefined)
      this.widthSchedule.set(initialValues.width);
    if (initialValues.color !== undefined)
      this.colorSchedule.set(initialValues.color);
  }

  static show(options: {
    context: CanvasRenderingContext2D;
    flat: Point;
    tip: Point;
    width: number;
    color: string;
  }) {
    const { color, context, flat, tip, width } = options;

    const dx = tip.x - flat.x;
    const dy = tip.y - flat.y;
    const length = Math.hypot(dx, dy);
    // **Bad Math**
    if (length < 1e-9) return;

    // Unit vector along arrow, and 90°-CCW perpendicular.
    const ux = dx / length;
    const uy = dy / length;
    const px = -uy;
    const py = ux;

    const halfWidth = width / 2;

    // Arrowhead geometry (Google Slides style concave chevron).
    // Scale the head down proportionally when the arrow is shorter than the desired head length.
    const headScale = Math.min(1, length / (width * 6.5));
    // Notch: where the shaft ends and the arrowhead begins.  ±hw wide, 4.8w back from tip.
    const notchBack = width * 4.8 * headScale;
    // Wing tips: the outermost corners.  ±2.4w wide, 6.5w back from tip.
    const wingBack = width * 6.5 * headScale;
    const wingHW = width * 2.4 * headScale;

    // Positions along the arrow axis.
    const notchX = tip.x - ux * notchBack;
    const notchY = tip.y - uy * notchBack;
    const wingX = tip.x - ux * wingBack;
    const wingY = tip.y - uy * wingBack;

    const path = new Path2D();
    path.moveTo(flat.x + px * halfWidth, flat.y + py * halfWidth);
    path.lineTo(notchX + px * halfWidth, notchY + py * halfWidth);
    path.lineTo(wingX + px * wingHW, wingY + py * wingHW);
    path.lineTo(tip.x, tip.y);
    path.lineTo(wingX - px * wingHW, wingY - py * wingHW);
    path.lineTo(notchX - px * halfWidth, notchY - py * halfWidth);
    path.lineTo(flat.x - px * halfWidth, flat.y - py * halfWidth);
    path.closePath();

    context.fillStyle = color;
    context.fill(path);
  }

  override show(options: ShowOptions) {
    const { context, timeInMs } = options;
    const { flat, pointy } = this.arrowSchedule.at(timeInMs);
    const width = this.widthSchedule.at(timeInMs);
    const color = this.colorSchedule.at(timeInMs);
    ArrowComponent.show({ context, flat, tip: pointy, width, color });
    // No children are expected, but children are possible, mostly for debugging.
    super.show(options);
  }
}
