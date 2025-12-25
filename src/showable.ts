import { positiveModulo } from "phil-lib/misc";

/**
 * This represents an animation.
 * This might be the entire animation we intend to display or record.
 * Or this might be a part of the animation that will be joined with other parts.
 */
export type Showable = {
  /**
   * Draw this object to the canvas.
   *
   * This should have no other assumptions or side effects.
   * The system can call show with any input at any time.
   * @param timeInMs Show the animation at this time.
   *
   * This will typically be between 0 and `duration`, inclusive.
   * See addMargins() or MakeShowableInSeries or makeShowableInSeries() if you need to be certain.
   */
  show(timeInMs: number, context: CanvasRenderingContext2D): void;
  /**
   * How long should this effect last, in milliseconds?
   * This should be 0 or positive.
   *
   * This can be +Infinity.
   * That could be a problem when saving to a file.
   * That can be overridden by MakeShowableInParallel.
   */
  readonly duration: number;
  /**
   * Something user friendly.
   *
   * Aimed at a person using our development console.
   * That type of user can navigate a tree of Showable objects.
   */
  readonly description: string;
  /**
   * Aimed at a person using our development console.
   * That type of user can navigate a tree of Showable objects.
   */
  readonly children?: readonly {
    readonly start: number;
    readonly child: Showable;
  }[];
};

/**
 * Runtime assertion that value >= 0.
 * +Infinity is allowed, NaN is not.
 * @param value Verify this.
 * @throws If the value is negative or NaN this will throw an exception.
 */
function notNegative(value: number) {
  if (value < 0 || Number.isNaN(value)) {
    throw new Error("wtf");
  }
}

export class MakeShowableInParallel {
  readonly #all: Showable[] = [];
  #duration = 0;
  #used = false;
  add(showable: Showable, minDuration = showable.duration) {
    if (this.#used) {
      throw new Error("wtf");
    }
    notNegative(minDuration);
    this.#all.push(showable);
    this.#duration = Math.max(this.#duration, minDuration);
  }
  /**
   * This will add an item and it will extend the last frame to the end of the composite Showable object.
   * @param showable To be added.
   */
  addJustified(showable: Showable, startAtMs = 0) {
    this.add(
      addMargins(showable, { hiddenBefore: startAtMs, frozenAfter: Infinity }),
      showable.duration
    );
  }
  build(description: string): Showable {
    if (this.#used) {
      throw new Error("wtf");
    }
    this.#used = true;
    const duration = this.#duration;
    const all = this.#all;
    const end = all.length;
    const show = (timeInMS: number, context: CanvasRenderingContext2D) => {
      for (let i = 0; i < end; i++) {
        all[i].show(timeInMS, context);
      }
    };
    return {
      duration,
      show,
      description,
      children: this.#all.map((child) => {
        return { start: 0, child };
      }),
    };
  }
  /**
   * Creates a new Showable object which passes each show() call to all of its children.
   *
   * This creates a MakeShowableInParallel internally and calls add() on each child with the default arguments.
   * @param description Copied to the resulting Showable object.
   * @param children To be added to this group.
   * @returns A new Showable object which passes each show() call to all of its children.
   */
  static all(description: string, children: Showable[]) {
    const builder = new this();
    children.forEach((child) => {
      builder.add(child);
    });
    return builder.build(description);
  }
}

export class MakeShowableInSeries {
  #duration = 0;
  get duration() {
    return this.#duration;
  }
  readonly #script = new Array<{
    start: number;
    child: Showable;
  }>();
  #used = false;
  add(child: Showable) {
    if (this.#used) {
      throw new Error("wtf");
    }
    if (this.#duration === Infinity) {
      console.warn("Adding a new Showable after infinite time.");
    }
    const newEntry = { start: this.#duration, child };
    notNegative(child.duration);
    this.#duration += child.duration;
    this.#script.push(newEntry);
  }
  skip(duration: number) {
    if (this.#used) {
      throw new Error("wtf");
    }
    notNegative(duration);
    this.#duration += duration;
  }
  build(description: string): Showable {
    if (this.#used) {
      throw new Error("wtf");
    }
    this.#used = true;
    /**
     * Work from the back.
     * If a time is on the boundary between two children, show() the one that starts later.
     * That will be the first one you see if you reversedScript.forEach().
     */
    const reversedScript = this.#script.toReversed();
    const duration = this.duration;
    const show = (timeInMs: number, context: CanvasRenderingContext2D) => {
      for (const { start, child } of reversedScript) {
        const localTime = timeInMs - start;
        if (localTime >= 0 && localTime <= child.duration) {
          // This item can be shown now.
          child.show(localTime, context);
          break;
        }
      }
    };
    return { description, duration, show, children: this.#script };
  }
  /**
   * Create a new showable that contains all of the inputs as children.
   * The new composite showable's duration will be the sum of the durations of all children.
   *
   * Each call to the composite's show() will call show() on at most one of the inputs, and will call hide() on the others.
   * All hide() calls will be done before the optional call to show().
   * This is important in case any of the inputs are sharing any resources.
   * An input will only be called at times between 0 and duration.
   * If a time is exactly on the boundary of two inputs, only the later input will be shown.
   * That means that any input could be shown at time 0.
   * But only the last input in the list could be called at time == duration.
   * @param children The child items to show.
   * @returns A new showable.
   */
  static all(description: string, children: Showable[]): Showable {
    const builder = new this();
    children.forEach((child) => {
      builder.add(child);
    });
    return builder.build(description);
  }
}

/**
 * Create a new showable that calls the original over and over.
 * This can be useful for a background pattern that goes on forever, or as long as the foreground action continues.
 * And in test it often makes sense to repeat the current scene over and over.
 * @param showable The action to repeat
 * @param count How many times to repeat the action.
 * This can be Infinity.
 * Otherwise, calling this after the last repeat will freeze the time at the end of the period.
 * @returns A new `Showable` object that will call the original multiple times.
 */
export function makeRepeater(showable: Showable, count = Infinity): Showable {
  const period = showable.duration;
  const repeaterDuration = count * period;
  function show(timeInMS: number, context: CanvasRenderingContext2D) {
    const iteration = Math.floor(timeInMS / period);
    if (iteration >= count) {
      showable.show(period, context);
    } else {
      const timeWithinPeriod = positiveModulo(timeInMS, period);
      showable.show(timeWithinPeriod, context);
    }
  }
  return {
    description: `${showable.description} » repeater`,
    duration: repeaterDuration,
    show,
    children: [{ start: 0, child: showable }],
  };
}

/**
 * This ensures that the base will be hidden before and after it's requested time slot.
 * This can add additional time before and after the base executes.
 * @param base Show this items.
 * @param extra
 * * hiddenBefore Wait this many milliseconds before showing `base`.  Default is 0.
 * * hiddenAfter Wait this many milliseconds after showing `base`.  Default is 0.
 * * frozenBefore Hold the initial image of `base` for this many milliseconds.  Default is 0.
 * * frozenAfter Hold the final image of `base` for this many milliseconds.  Default is 0.
 * @returns
 */
export function addMargins(
  base: Showable,
  extra: {
    hiddenBefore?: number;
    hiddenAfter?: number;
    frozenBefore?: number;
    frozenAfter: number;
  }
): Showable {
  const builder = new MakeShowableInSeries();
  if (extra.hiddenBefore !== undefined) {
    builder.skip(extra.hiddenBefore);
  }
  if (extra.frozenBefore !== undefined && extra.frozenBefore > 0) {
    builder.add({
      description: `${base.description} » frozen before`,
      duration: extra.frozenBefore,
      show(timeInMS: number, context: CanvasRenderingContext2D) {
        base.show(0, context);
      },
    });
  }
  builder.add(base);
  if (extra.frozenAfter !== undefined && extra.frozenAfter > 0) {
    builder.add({
      description: `${base.description} » frozen after`,
      duration: extra.frozenAfter,
      show(timeInMS: number, context: CanvasRenderingContext2D) {
        base.show(base.duration, context);
      },
    });
  }
  if (extra.hiddenAfter !== undefined) {
    builder.skip(extra.hiddenAfter);
  }
  const description = `${base.description} » margins`;
  return builder.build(description);
}
