import { Scalar } from "../showable";
import { Mutable } from "../utility";
import {
  InParallelComponent,
  ParallelChildInfo,
  ShowChildInfo,
} from "./in-parallel";

/**
 * What to do before a {@link Showable} is supposed to start or after it is supposed to end.
 * * "hide" = Don't show at all.
 * * "freeze" = Call show() with `timeInMs` set to 0 before or to `duration` after the item should be running.
 *   In some contexts this is called "hold".
 * * "live" = Call show() the values that might be less than 0 or greater than duration.
 *
 * This is aimed at specific containers, like {@link PaddingComponent}.
 * The general assumption is that `Showable` containers are only called with timeInMs between 0 and duration.
 */
export type AtEnd = "hide" | "freeze" | "live";

/**
 * A PaddingComponent does two major things:
 * * It requests extra time before and after its primary component is scheduled.
 * * It decides what to show before and after the primary component is scheduled.
 *
 * The primary component is the subcomponent with the lowest z order.
 * I.e. the first subcomponent.
 * I chose that because it was simple.
 * If necessary we can add an option to select a specific subcomponent to be the primary component regardless of the z order.
 *
 * Other subcomponents are "callouts".
 * The requested duration of a callout is ignored.
 * All callouts start at the same time as the primary component.
 * So it the primary component gets rescheduled, all of its children move with it.
 *
 * The PaddingComponent's parent might call show() at times before 0 or after the duration of the primary component and the callout.
 * The PaddingComponent can be configured to handle these cases in different ways, for the primary component.
 * However, the PaddingComponent will pass all show() requests on to the callouts without modifications.
 * It is up to the individual subcomponents to deal with out of bounds timeInMs values.
 *
 * Most components, like rectangles and arrows, will show themselves any time they are called regardless of timeInMs.
 * There are two easy ways to modify this.
 * * You can alter the item to be off screen or transparent at certain times.
 *   Schedules work just fine with times that are out of bounds.
 * * You can wrap the subcomponent in its own PaddingComponent.
 *   That can easily hide or hold the component outside of its normally scheduled time.
 *   And you can use the initialTime property to change the start time relative to the primary component.
 *   `initialTime` can be positive or negative.
 *
 * PaddingComponent is often used with {@link InParallelComponent}.
 * The latter is responsible for an entire scene.
 * The former makes each element of the scene appear and disappear at the right time.
 */
export class PaddingComponent extends InParallelComponent {
  readonly registryKey: string = "Padding";
  protected override recomputeDuration(
    children: Mutable<ParallelChildInfo>[],
  ): number {
    const start = this.initialTimeScalar.value;
    children.forEach((childInfo) => {
      childInfo.start = start;
    });
    const primaryChild = children.at(0)?.child;
    const primaryChildDuration = primaryChild ? primaryChild.duration : 0;
    return (
      this.initialTimeScalar.value +
      primaryChildDuration +
      this.extraTimeScalar.value
    );
  }
  constructor(
    initialValues: {
      initialTime?: number;
      extraTime?: number;
      showBefore?: AtEnd;
      showAfter?: AtEnd;
      description?: string;
      registryKey?: string;
    } = {},
  ) {
    super(initialValues.description ?? "Padding");
    this.scalars.push(
      this.initialTimeScalar,
      this.extraTimeScalar,
      this.showBeforeScalar,
      this.showAfterScalar,
    );
    if (initialValues.initialTime !== undefined) {
      this.initialTimeScalar.value = initialValues.initialTime;
    }
    if (initialValues.extraTime !== undefined) {
      this.extraTimeScalar.value = initialValues.extraTime;
    }
    if (initialValues.showBefore !== undefined) {
      this.showBeforeScalar.value = initialValues.showBefore;
    }
    if (initialValues.showAfter !== undefined) {
      this.showAfterScalar.value = initialValues.showAfter;
    }
    if (initialValues.registryKey !== undefined) {
      // If you are subclassing PaddingComponent
      // or you are adding fixed subcomponents to an object,
      // then you need to create a new registry key.
      // Otherwise, keep the default.
      // TODO Does it ever make sense for someone to change the registry key to undefined?
      this.registryKey = initialValues.registryKey;
    }
  }
  readonly initialTimeScalar: Scalar<"number"> = this.makeNotifyingScalar(
    "number",
    "Initial Time",
    0,
  );
  readonly extraTimeScalar: Scalar<"number"> = this.makeNotifyingScalar(
    "number",
    "Extra Time",
    0,
  );
  /**
   * See {@link AtEnd} for the meanings of these choices.
   */
  readonly showBeforeScalar: Scalar<"select"> = {
    description: "Show Before",
    type: "select",
    choices: ["hide", "freeze", "live"],
    value: "hide",
  };
  /**
   * See {@link AtEnd} for the meanings of these choices.
   */
  readonly showAfterScalar: Scalar<"select"> = {
    description: "Show After",
    type: "select",
    choices: ["hide", "freeze", "live"],
    value: "freeze",
  };
  protected override showChild(info: ShowChildInfo) {
    const primary = info.index == 0;
    let timeInMs = info.options.timeInMs;
    if (timeInMs < 0) {
      const before = primary ? this.showBeforeScalar.value : "live";
      switch (before) {
        case "hide": {
          return;
        }
        case "freeze": {
          timeInMs = 0;
        }
        // case "live": leave it alone.  Let the child deal with the out of bounds time.
      }
    } else if (timeInMs > info.child.duration) {
      const after = primary ? this.showAfterScalar.value : "live";
      switch (after) {
        case "hide": {
          return;
        }
        case "freeze": {
          timeInMs = info.child.duration;
        }
        // case "live": leave it alone.  Let the child deal with the out of bounds time.
      }
    }
    info.child.show({ ...info.options, timeInMs });
  }
  override getFramePromises(
    timeInMs: number,
    set: Pick<Set<Promise<unknown>>, "add">,
  ): void {
    // Copy exactly what show() and showChild() do.
    // Ignore the same children.
    // When passing the request onto a child, use the same timestamp as show() and showChild().
    this.children.forEach((info, index) => {
      if (info.child.getFramePromises) {
        const primary = index == 0;
        let childTime = timeInMs - info.start;
        if (childTime < 0) {
          const before = primary ? this.showBeforeScalar.value : "live";
          switch (before) {
            case "hide": {
              return;
            }
            case "freeze": {
              childTime = 0;
            }
            // case "live": leave it alone.  Let the child deal with the out of bounds time.
          }
        } else if (childTime > info.child.duration) {
          const after = primary ? this.showAfterScalar.value : "live";
          switch (after) {
            case "hide": {
              return;
            }
            case "freeze": {
              childTime = info.child.duration;
            }
            // case "live": leave it alone.  Let the child deal with the out of bounds time.
          }
        }
        info.child.getFramePromises(childTime, set);
      }
    });
  }
}
