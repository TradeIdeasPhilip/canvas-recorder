import { ReadOnlyRect } from "phil-lib/misc";
import { interpolateColors, interpolateRects, Keyframe } from "./interpolate";
import { Showable } from "./showable";

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
