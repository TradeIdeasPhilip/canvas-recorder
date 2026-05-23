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
   * @param description Human-readable label shown in the visual editor.
   * Also serves as the sub-key that identifies this schedule within its
   * parent {@link VisuallyEditable}'s database record.
   * @param schedule Initial keyframes. The array is explicitly mutable and
   * will be modified by the Visual Editor at runtime.
   */
  constructor(
    readonly description: string,
    readonly schedule: Keyframe<string>[],
  ) {}
}

/**
 * A select schedule shows the user a list of strings and lets him select one from the Visual Editor.
 * This is like `StringScheduleInfo` except that there are constraints.
 *
 * This class implements ScheduleInfo.
 * TypeScript isn't cooperating, but it is true.
 */
export class SelectScheduleInfo<T extends string, U extends T> {
  readonly type = "select";
  readonly choices: readonly string[];
  readonly schedule: Keyframe<string>[];
  /**
   *
   * @param description Displayed to the user and used as a database key.
   * @param schedule The initial value for `this.schedule`.
   * If `schedule` is an array, it is *copied* into place.
   * @param choices
   */
  constructor(
    readonly description: string,
    schedule: Keyframe<U>[] | U,
    choices: readonly T[],
  ) {
    this.choices = choices.slice();
    if (typeof schedule === "string") {
      this.schedule = [{ time: 0, value: schedule }];
    } else {
      this.schedule = schedule.slice();
    }
  }
  at(timeInMs: number): T {
    return discreteKeyframes(timeInMs, this.schedule) as T;
  }
  /**
   * Check that all values in the schedule are legal.
   *
   * Note:  The constraints are not enforced everywhere.
   * It is possible that some code other than the Visual Editor is loading values into the schedule.
   * It is possible that a value got saved in the database and the code changed so that value is no longer valid.
   * There is no way for me to ensure that `T` and `choices` match perfectly.
   * And calling this on every call to {@link at}() seems unnecessarily expensive.
   *
   * @throws If there is a bad keyframe, throw an Error.
   */
  assertConstraints(): void {
    this.schedule.forEach((keyframe) => {
      const foundAt = this.choices.indexOf(keyframe.value);
      if (foundAt < 0) {
        throw new Error(
          `${keyframe.value} is not a valid choice for ${this.description}`,
        );
      }
    });
  }
}

export class ColorScheduleInfo {
  readonly type = "color";
  at(timeInMs: number): string {
    return interpolateColors(timeInMs, this.schedule);
  }
  /**
   * @param description Human-readable label shown in the visual editor.
   * Also serves as the sub-key that identifies this schedule within its
   * parent {@link VisuallyEditable}'s database record.
   * @param schedule Initial keyframes. The array is explicitly mutable and
   * will be modified by the Visual Editor at runtime.
   */
  constructor(
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
   * @param description Human-readable label shown in the visual editor.
   * Also serves as the sub-key that identifies this schedule within its
   * parent {@link VisuallyEditable}'s database record.
   * @param schedule Initial keyframes. The array is explicitly mutable and
   * will be modified by the Visual Editor at runtime.
   */
  constructor(
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
   * @param description Human-readable label shown in the visual editor.
   * Also serves as the sub-key that identifies this schedule within its
   * parent {@link VisuallyEditable}'s database record.
   * @param schedule Initial keyframes. The array is explicitly mutable and
   * will be modified by the Visual Editor at runtime.
   */
  constructor(
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
   * @param description Human-readable label shown in the visual editor.
   * Also serves as the sub-key that identifies this schedule within its
   * parent {@link VisuallyEditable}'s database record.
   * @param schedule Initial keyframes. The array is explicitly mutable and
   * will be modified by the Visual Editor at runtime.
   */
  constructor(
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
   * @param key The IndexedDB key for this node's document (e.g. `"shadow-test|Font Inspector"`).
   * All schedules belonging to this node are stored together under this key;
   * individual schedules are distinguished within that document by their {@link ScheduleInfo.description}.
   * @param children Child nodes, each with their own key and schedules.
   * @param schedules The editable schedules attached directly to this node.
   */
  constructor(
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
