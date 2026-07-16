import { ScalarInfo } from "./showable";
import {
  discreteKeyframes,
  durationKeyframes,
  interpolateColors,
  interpolateNumbers,
  interpolatePoints,
  interpolateRects,
  Keyframe,
} from "./interpolate";
import { ReadOnlyRect } from "phil-lib/misc";
import { Point } from "./glib/path-shape";

// This code is often used to create schedules for Showable.schedules.
// This interface makes it easier for the TypeScript programmer to access the data.

export class StringScheduleInfo {
  readonly type = "string";
  readonly schedule: Keyframe<string>[];
  /**
   * When set, the Visual Editor renders each keyframe value as a combo box
   * (`<input list="…">`) instead of a plain textarea, offering these strings as
   * autocomplete suggestions.  The user can still type any value; the list is
   * not strictly enforced.
   *
   * Mutable so it can be populated asynchronously after construction — for
   * example, font family names loaded from `document.fonts.ready`.
   */
  choices?: readonly string[];
  /**
   * When true, the Visual Editor opens a font-picker dialog instead of a
   * combo box.  See `useDialog` on the `"string"` ScheduleInfo variant.
   */
  useDialog?: boolean;
  at(timeInMs: number): string {
    return discreteKeyframes(timeInMs, this.schedule);
  }
  set(overwriteWith: string | readonly Keyframe<string>[]) {
    this.schedule.length = 0;
    if (typeof overwriteWith === "string") {
      this.schedule.push({ time: 0, value: overwriteWith });
    } else {
      this.schedule.push(...overwriteWith);
    }
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
    schedule: Keyframe<string>[] | string,
  ) {
    if (typeof schedule == "string") {
      this.schedule = [{ time: 0, value: schedule }];
    } else {
      this.schedule = schedule.slice();
    }
  }
}

/**
 * A select schedule shows the user a list of strings and lets him select one from the Visual Editor.
 * This is like `StringScheduleInfo` except that there are constraints.
 *
 * This class implements ScheduleInfo.
 * TypeScript isn't cooperating, but it is true.
 *
 * `T` contains all of the legal options.
 * It is usually inferred from the `choices` argument to the constructor.
 *
 * `U` is unfortunately required to keep TypeScript happy.
 * This is the type of the *initial* value or values in the schedule.
 * This will be a subset of `T`.
 * Just ignore `U` and focus on `T`.
 */
export class SelectScheduleInfo<T extends string, U extends T> {
  readonly type = "select";
  readonly choices: readonly T[];
  readonly schedule: Keyframe<T>[];
  set(overwriteWith: T | readonly Keyframe<T>[]) {
    this.schedule.length = 0;
    if (typeof overwriteWith === "string") {
      this.schedule.push({ time: 0, value: overwriteWith });
    } else {
      this.schedule.push(...overwriteWith);
    }
  }
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
  readonly schedule: Keyframe<string>[];
  at(timeInMs: number): string {
    return interpolateColors(timeInMs, this.schedule);
  }
  set(overwriteWith: string | readonly Keyframe<string>[]) {
    this.schedule.length = 0;
    if (typeof overwriteWith === "string") {
      this.schedule.push({ time: 0, value: overwriteWith });
    } else {
      this.schedule.push(...overwriteWith);
    }
  }
  /**
   * @param description Human-readable label shown in the visual editor.
   * Also serves as the sub-key that identifies this schedule within its
   * parent {@link VisuallyEditable}'s database record.
   *
   * This is mutable for one specific reason.
   * Often a Showable does not want to expose its subcomponents to the user.
   * Instead it will export specific schedules from its subcomponents.
   * If you create two subcomponents of the same type, their schedules will initially have identical descriptions.
   * You can change this description from "Color" to "Left Color" or "Right Color".
   * Do this once at initialization time and never change it.
   * @param schedule Initial keyframes.
   * * If you provide a single value, this will create an array with exactly one entry.
   * * If you provide an array, this will duplicate the array.
   * This is the *safe* option because the Visual Editor assumes all schedules have their own distinct arrays.
   * * If you provide another ColorScheduleInfo then these two ColorScheduleInfo objects will share an array.
   * Use this when you only plan to share one of the schedules with the Visual Editor.
   * Use this with **caution**.
   */
  constructor(
    public description: string,
    schedule: readonly Keyframe<string>[] | string | ColorScheduleInfo,
  ) {
    if (typeof schedule === "string") {
      this.schedule = [{ time: 0, value: schedule }];
    } else if (schedule instanceof Array) {
      this.schedule = schedule.slice();
    } else {
      this.schedule = schedule.schedule;
    }
  }
}

export class NumberScheduleInfo {
  readonly type = "number";
  readonly schedule: Keyframe<number>[];
  at(timeInMs: number): number {
    return interpolateNumbers(timeInMs, this.schedule);
  }
  set(overwriteWith: number | readonly Keyframe<number>[]) {
    this.schedule.length = 0;
    if (typeof overwriteWith === "number") {
      this.schedule.push({ time: 0, value: overwriteWith });
    } else {
      this.schedule.push(...overwriteWith);
    }
  }
  /**
   * @param description Human-readable label shown in the visual editor.
   * Also serves as the sub-key that identifies this schedule within its
   * parent {@link VisuallyEditable}'s database record.
   * @param schedule Initial keyframes. The array is explicitly mutable and
   * will be modified by the Visual Editor at runtime.
   * @param timeAxisLabel Override the "Time (ms)" column header.
   * Use {@link progressAxisLabel} when keyframe times are 0–1 progress values.
   */
  constructor(
    readonly description: string,
    schedule: Keyframe<number>[] | number,
    readonly timeAxisLabel?: string,
  ) {
    if (typeof schedule === "number") {
      this.schedule = [{ time: 0, value: schedule }];
    } else {
      this.schedule = schedule.slice();
    }
  }
}

export class NumberDurationScheduleInfo {
  readonly type = "number";
  readonly editDurations = true;
  readonly schedule: Keyframe<number>[];
  at(timeInMs: number) {
    return durationKeyframes(timeInMs, this.schedule);
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
    schedule: Keyframe<number>[] | number,
  ) {
    if (typeof schedule === "number") {
      this.schedule = [{ time: 0, value: schedule }];
    } else {
      this.schedule = schedule.slice();
    }
  }
}

export class RectangleScheduleInfo {
  set(overwriteWith: ReadOnlyRect | readonly Keyframe<ReadOnlyRect>[]) {
    this.schedule.length = 0;
    if (overwriteWith instanceof Array) {
      this.schedule.push(...overwriteWith);
    } else {
      this.schedule.push({ time: 0, value: overwriteWith });
    }
  }
  readonly type = "rectangle";
  readonly schedule: Keyframe<ReadOnlyRect>[];
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
    schedule: readonly Keyframe<ReadOnlyRect>[] | ReadOnlyRect,
  ) {
    if (schedule instanceof Array) {
      this.schedule = schedule.slice();
    } else {
      this.schedule = [{ time: 0, value: schedule }];
    }
  }
}

// MARK: Arrow schedule

export type ArrowValue = { flat: Point; pointy: Point };

export function interpolateArrow(
  timeInMs: number,
  schedule: readonly Keyframe<ArrowValue>[],
): ArrowValue {
  return {
    flat: interpolatePoints(timeInMs, schedule.map((kf) => ({ ...kf, value: kf.value.flat }))),
    pointy: interpolatePoints(timeInMs, schedule.map((kf) => ({ ...kf, value: kf.value.pointy }))),
  };
}

export class ArrowScheduleInfo {
  readonly type = "arrow" as const;
  readonly schedule: Keyframe<ArrowValue>[];
  at(timeInMs: number): ArrowValue {
    return interpolateArrow(timeInMs, this.schedule);
  }
  set(overwriteWith: ArrowValue | readonly Keyframe<ArrowValue>[]) {
    this.schedule.length = 0;
    if (overwriteWith instanceof Array) {
      this.schedule.push(...overwriteWith);
    } else {
      this.schedule.push({ time: 0, value: overwriteWith });
    }
  }
  constructor(
    readonly description: string,
    schedule: readonly Keyframe<ArrowValue>[] | ArrowValue,
  ) {
    if (schedule instanceof Array) {
      this.schedule = schedule.slice();
    } else {
      this.schedule = [{ time: 0, value: schedule }];
    }
  }
}

export class PointScheduleInfo {
  readonly type = "point";
  readonly schedule: Keyframe<Point>[];
  at(timeInMs: number): Point {
    return interpolatePoints(timeInMs, this.schedule);
  }
  set(overwriteWith: Point|readonly Keyframe<Point>[]) {
    this.schedule.length = 0;
    if (overwriteWith instanceof Array) {
      this.schedule.push(...overwriteWith);
    } else {
      this.schedule.push({ time: 0, value: overwriteWith });
    }
  }
  /**
   * @param description Human-readable label shown in the visual editor.
   * Also serves as the sub-key that identifies this schedule within its
   * parent {@link VisuallyEditable}'s database record.
   * @param schedule Initial keyframes. The array is explicitly mutable and
   * will be modified by the Visual Editor at runtime.
   * This constructor always creates a new array.
   * If this value is a single point, a schedule will be created with that point as the only value.
   */
  constructor(
    readonly description: string,
    schedule: readonly Keyframe<Point>[] | Point,
  ) {
    if (schedule instanceof Array) {
      this.schedule = schedule.slice();
    } else {
      this.schedule = [{ time: 0, value: schedule }];
    }
  }
}

// ── Scalar field helpers ────────────────────────────────────────────────────
// These are like the *ScheduleInfo classes above but hold a single mutable
// value instead of a keyframe array.  They satisfy the ScalarInfo union type.

/** A string scalar field. */
export class StringScalarInfo implements Extract<
  ScalarInfo,
  { type: "string" }
> {
  readonly type = "string" as const;
  value: string;
  constructor(
    readonly description: string,
    initialValue: string,
  ) {
    this.value = initialValue;
  }
}
