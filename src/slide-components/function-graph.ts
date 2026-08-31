import { ReadOnlyRect } from "phil-lib/misc";
import { drawGrid, computeGridTransform } from "../glib/grid";
import {
  StringScheduleInfo,
  RectangleScheduleInfo,
  NumberScheduleInfo,
  ColorScheduleInfo,
} from "../schedule-helper";
import { Showable, ShowOptions } from "../showable";
import { showError } from "./show-error";

export class FunctionGraphComponent implements Showable {
  /**
   * Register a named function here so it can be selected via the "Function Name"
   * schedule in the visual editor.  Call this from your video's TypeScript file
   * before the component is rendered.
   *
   * @example
   * FunctionGraphComponent.functions.set("sin", Math.sin);
   * FunctionGraphComponent.functions.set("x²", x => x * x);
   */
  static readonly functions = new Map<string, (x: number) => number>();

  readonly registryKey = "Function Graph";
  readonly description = "Function Graph";
  readonly duration = 0;

  readonly functionNameSchedule = new StringScheduleInfo(
    "Function Name",
    "sin",
  );
  readonly destRectSchedule = new RectangleScheduleInfo("Dest Rect", {
    x: 2,
    y: 2,
    width: 6,
    height: 4,
  });
  readonly xMinSchedule = new NumberScheduleInfo("X Min", -Math.PI * 2);
  readonly xMaxSchedule = new NumberScheduleInfo("X Max", Math.PI * 2);
  readonly yMinSchedule = new NumberScheduleInfo("Y Min", -1.5);
  readonly yMaxSchedule = new NumberScheduleInfo("Y Max", 1.5);
  readonly gridColorSchedule = new StringScheduleInfo(
    "Grid Color",
    "rgba(255,255,255,0.35)",
  );
  readonly gridLineWidthSchedule = new NumberScheduleInfo(
    "Grid Line Width",
    0.02,
  );
  readonly fontSchedule = new StringScheduleInfo("Font", "0.28px sans-serif");
  readonly curveColorSchedule = new ColorScheduleInfo(
    "Curve Color",
    "rgb(0,128,255)",
  );

  readonly schedules = [
    this.functionNameSchedule,
    this.destRectSchedule,
    this.xMinSchedule,
    this.xMaxSchedule,
    this.yMinSchedule,
    this.yMaxSchedule,
    this.gridColorSchedule,
    this.gridLineWidthSchedule,
    this.fontSchedule,
    this.curveColorSchedule,
  ] as const;

  show({ context, timeInMs }: ShowOptions): void {
    const functionName = this.functionNameSchedule.at(timeInMs);
    const f = FunctionGraphComponent.functions.get(functionName);
    if (!f) {
      showError(context, `Unknown function:\n"${functionName}"`);
      return;
    }

    const destRect = this.destRectSchedule.at(timeInMs);
    const xMin = this.xMinSchedule.at(timeInMs);
    const xMax = this.xMaxSchedule.at(timeInMs);
    const yMin = this.yMinSchedule.at(timeInMs);
    const yMax = this.yMaxSchedule.at(timeInMs);
    if (xMax <= xMin || yMax <= yMin) return;

    const gridColor = this.gridColorSchedule.at(timeInMs);
    const gridLineWidth = this.gridLineWidthSchedule.at(timeInMs);
    const font = this.fontSchedule.at(timeInMs);
    const curveColor = this.curveColorSchedule.at(timeInMs);

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

    const SAMPLE_COUNT = 300;
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
  }
}
