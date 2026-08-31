import { Showable, ShowOptions } from "../showable";
import { Keyframe } from "../interpolate";
import { ReadOnlyRect } from "phil-lib/misc";
import { ColorScheduleInfo, RectangleScheduleInfo } from "../schedule-helper";

/**
 * Standard registry component: a filled rectangle with an editable color and
 * position/size schedule.
 */
export class RectangleComponent implements Showable {
  readonly registryKey = "Rectangle";
  readonly colorSchedule = new ColorScheduleInfo("Color", "cyan");
  readonly rectSchedule = new RectangleScheduleInfo("Rect", {
    x: 2,
    y: 2,
    width: 6,
    height: 4,
  });
  readonly schedules = [this.colorSchedule, this.rectSchedule] as const;
  readonly description: string;
  readonly duration = 0;
  constructor(
    initialValues: {
      description?: string;
      color?: string | readonly Keyframe<string>[];
      rect?: ReadOnlyRect | readonly Keyframe<ReadOnlyRect>[];
    } = {},
  ) {
    this.description = initialValues.description ?? "Rectangle";
    if (initialValues.color !== undefined)
      this.colorSchedule.set(initialValues.color);
    if (initialValues.rect !== undefined)
      this.rectSchedule.set(initialValues.rect);
  }
  show({ context, timeInMs }: ShowOptions) {
    const color = this.colorSchedule.at(timeInMs);
    const rect = this.rectSchedule.at(timeInMs);
    context.fillStyle = color;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
}
