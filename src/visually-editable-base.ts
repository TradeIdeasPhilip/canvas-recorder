import { ScheduleInfo } from "./showable";
import {
  discreteKeyframes,
  interpolateColors,
  interpolateNumbers,
  interpolatePoints,
  interpolateRects,
  Keyframe,
} from "./interpolate";
import { ReadOnlyRect } from "phil-lib/misc";
import { Point } from "./glib/path-shape";

// This code is primarily made for the automatically generated code in *-dfm.ts to import.

/**
 * This data was all generate from the IndexDb in the browser.
 * We need a way to map these objects back to that database so we can sync changes at real time.
 * Details TBD, presumably each item has a string name, maybe a guid.
 */
export type IndexDbKey = string;

export class StringScheduleInfo {
  readonly type = "string";
  at(timeInMs: number): string {
    return discreteKeyframes(timeInMs, this.schedule);
  }
  /**
   * @param name How you will access this from the individual video's code.
   * @param description Human-readable label shown in the visual editor.
   * Also serves as the sub-key that identifies this schedule within its
   * parent {@link VisuallyEditable}'s database record.
   * @param schedule Initial keyframes. The array is explicitly mutable and
   * will be modified by the Visual Editor at runtime.
   */
  constructor(
    readonly name: string,
    readonly description: string,
    readonly schedule: Keyframe<string>[],
  ) {}
}

export class ColorScheduleInfo {
  readonly type = "color";
  at(timeInMs: number): string {
    return interpolateColors(timeInMs, this.schedule);
  }
  /**
   * @param name How you will access this from the individual video's code.
   * @param description Human-readable label shown in the visual editor.
   * Also serves as the sub-key that identifies this schedule within its
   * parent {@link VisuallyEditable}'s database record.
   * @param schedule Initial keyframes. The array is explicitly mutable and
   * will be modified by the Visual Editor at runtime.
   */
  constructor(
    readonly name: string,
    readonly description: string,
    readonly schedule: Keyframe<string>[],
  ) {}
}

export class NumberScheduleInfo {
  readonly type = "number";
  at(timeInMs: number): number {
    return interpolateNumbers(timeInMs, this.schedule);
  }
  /**
   * @param name How you will access this from the individual video's code.
   * @param description Human-readable label shown in the visual editor.
   * Also serves as the sub-key that identifies this schedule within its
   * parent {@link VisuallyEditable}'s database record.
   * @param schedule Initial keyframes. The array is explicitly mutable and
   * will be modified by the Visual Editor at runtime.
   */
  constructor(
    readonly name: string,
    readonly description: string,
    readonly schedule: Keyframe<number>[],
  ) {}
}

export class RectangleScheduleInfo {
  readonly type = "rectangle";
  at(timeInMs: number): ReadOnlyRect {
    return interpolateRects(timeInMs, this.schedule);
  }
  /**
   * @param name How you will access this from the individual video's code.
   * @param description Human-readable label shown in the visual editor.
   * Also serves as the sub-key that identifies this schedule within its
   * parent {@link VisuallyEditable}'s database record.
   * @param schedule Initial keyframes. The array is explicitly mutable and
   * will be modified by the Visual Editor at runtime.
   */
  constructor(
    readonly name: string,
    readonly description: string,
    readonly schedule: Keyframe<ReadOnlyRect>[],
  ) {}
}

export class PointScheduleInfo {
  readonly type = "point";
  at(timeInMs: number): Point {
    return interpolatePoints(timeInMs, this.schedule);
  }
  /**
   * @param name How you will access this from the individual video's code.
   * @param description Human-readable label shown in the visual editor.
   * Also serves as the sub-key that identifies this schedule within its
   * parent {@link VisuallyEditable}'s database record.
   * @param schedule Initial keyframes. The array is explicitly mutable and
   * will be modified by the Visual Editor at runtime.
   */
  constructor(
    readonly name: string,
    readonly description: string,
    readonly schedule: Keyframe<Point>[],
  ) {}
}

/**
 * The Visual Editor has one of these objects per **slide deck**.
 *
 * That said, this code does not have any direct knowledge of a slide deck class.
 * Other classes could use VisuallyEditable, but it was designed for a slide deck.
 */
export class VisuallyEditable {
  /**
   * @param name Code identifier used for typed property access in generated files.
    * @param key The IndexedDB key for this node's document (e.g. `"shadow-test|Font Inspector"`).
   * All schedules belonging to this node are stored together under this key;
   * individual schedules are distinguished within that document by their {@link ScheduleInfo.description}.
   * @param children Child nodes, each with their own key and schedules.
   * @param schedules The editable schedules attached directly to this node.
   */
  constructor(
    readonly name: string,
    readonly key: IndexDbKey,
    readonly children: readonly VisuallyEditable[],
    readonly schedules: readonly ScheduleInfo[],
  ) {}
  *traverse(): Generator<VisuallyEditable, void, never> {
    yield this;
    for (const child of this.children) {
      yield* child.traverse();
    }
  }
}
