// If I ever want to allow the user to intermix replaceable and fixed
// components, I should start testing here!  The feature would be useful and easy to
// test in this class.
// Currently all replaceable components are at zIndex:0.
// The fixed components will be arranged according to their zIndex.
// And the replaceable components can be arranged by user with the Visual Editor.
// But they will all be grouped together, never interleaved with the fixed components.
// This seems like a very useful feature in most places.
// At a bare minimum it would be nice to ask to go before or after all of the fixed controls.
// In this class it would be nice to have full control over interleaving.
// I'm not 100% sure how important this is for other classes, but a good part of the
// replaceable components in general is for quick prototyping.
// I.e. lots of random cases, hard to predict in advance, it would be nice to have
// the tool already ready then next time I need it so I don't have to stop what I'm doing
// then.

import { Showable, ShowOptions } from "../showable";
import { Mutable } from "../utility";
import {
  InParallelComponent,
  ParallelChildInfo,
  ShowChildInfo,
  PaddingComponent,
} from "./in-parallel";

/**
 * Each of the children is displayed one after the next.
 * The total duration of this item is the sum of all of its children's durations.
 *
 * This is the modern replacement for {@link MakeShowableInSeries}.
 *
 * This adds the ability to adjust durations at run time.
 * I.e. {@link ShowableParent.scheduleHasChanged}()
 * Even if you don't need that directly, if any on your children need need that ability, then use this class.
 * Most new code supports that by default.
 */
export class InSeriesComponent extends InParallelComponent {
  static readonly TRANSITION = Symbol("Transition");
  readonly registryKey = "In Series";
  constructor(
    initialValues: {
      description?: string;
    } = {},
  ) {
    super(initialValues.description ?? "In Series");
  }
  /**
   * Display the children one after another, sorted by zIndex.
   * The first one starts at time=0.
   * The others each start immediately after the previous one ends.
   * The total duration for this component is the sum of the durations of each of its children.
   */
  protected override recomputeDuration(
    children: Mutable<ParallelChildInfo>[],
  ): number {
    let start = 0;
    children.forEach((childInfo) => {
      childInfo.start = start;
      start += childInfo.child.duration;
    });
    return start;
  }
  #allowExtendedTimes(child: Showable) {
    // The padding component is specifically designed to handle times before 0 and after duration.
    // It will blank and/or hold its primary child, so that is only shown at times between 0 and duration.
    // And the other children are expecting extending times, so callouts do not have to be limited to their immediate parent's allotted time.
    // So the result is clearly true for any child of type PaddingComponent.
    // Maybe it should be true in other cases, too, but I can't picture those cases.
    // Default to false because it's safer; most Showable objects do not expect to be called at extended times.
    return child instanceof PaddingComponent;
  }
  override getFramePromises(
    incomingTimeInMs: number,
    set: Pick<Set<Promise<unknown>>, "add">,
  ): void {
    this.children.forEach(({ start, child }, index, children) => {
      const isLastChild = () => {
        return index == children.length - 1;
      };
      const timeInMs = incomingTimeInMs - start;
      const duration = child.duration;
      if (
        this.#allowExtendedTimes(child) ||
        (timeInMs >= 0 &&
          (timeInMs < duration || (timeInMs == duration && isLastChild())))
      ) {
        if (InSeriesComponent.TRANSITION in child) {
          // Do a transition.
          // Simplifying assumption:
          //   The transition will actually use any and all of the children we give it.
          //   We know that's not true.
          //   HoldPreviousTransition and HoldNextTransition each ignore one of the inputs.
          //   So we assume that it's safe to call getFramePromises() on extra children when we are unsure.
          //   That's not 100% guaranteed.
          //   Maybe part of the code is broken or incomplete.
          //   We have a false reference to code that will fail, so the recording will stop.
          //   Those cases are possible, but they are not a concern at the moment.
          //   Maybe I'll return to this when the design settles down, but for now I'm declaring this *good enough*.
          // Assumption:
          //   The child will choose the last frame of `before` and the first frame of `after`.
          //   This has always been the assumption.
          //   But the implementation of that is left to the children, so they could do something different.
          //   I'm not 100% happy with my decision to let the children make that choice, but I don't have any better alternatives.
          //   This code is inheriting the assumption that the children will work the normal way.
          //   Again, this could be done more thoroughly, but I'm declaring this assumption "good enough".
          const children = this.children;
          let before: Showable | undefined;
          if (index > 0) {
            before = children[index - 1].child;
            if (InSeriesComponent.TRANSITION in before) {
              // Avoid an infinite recursion.
              // Assume this is a temporary issue as the user is rearranging things, and don't crash.
              before = undefined;
            }
          }
          let after = children.at(index + 1)?.child;
          if (after && InSeriesComponent.TRANSITION in after) {
            // Avoid an infinite recursion.
            after = undefined;
          }
          // Call getFramePromises on the *special* children.
          // This is what the actual child would have called show() on.
          if (before?.getFramePromises) {
            before.getFramePromises(before.duration, set);
          }
          after?.getFramePromises?.(0, set);
        } else {
          // A "normal" child.
          child.getFramePromises?.(timeInMs, set);
        }
      }
    });
  }
  protected override showChild(info: ShowChildInfo): void {
    /**
     * I haven't decided on a policy for this yet.
     * So let's keep the rules inside this opaque function.
     * @returns `true` if we should always show this child,
     * `false` if we should only show this child during its allotted time.
     */
    /**
     * Time is allocated exactly the same way as in {@link MakeShowableInSeries}:
     * * Most children are drawn at time >= 0 and < duration.
     * * However, the last child may also be called at duration.
     *
     * The children don't have to worry about the details.
     * Exactly one of them will be called at the instant one ends and the next starts.
     * That includes at the last child's duration.
     *
     * You cannot assume that a Showable's last frame will be displayed.
     * But you shouldn't assume that any specific time will be displayed.
     * Sometimes, however it has to be displayed.
     * In particular we often hold the last frame.
     * So we can't use the simpler rule that we only call show()
     * at times >= 0 and < duration.
     * @returns `true` if we are displaying the last child, `false` for the others.
     */
    const isLastChild = () => {
      return info.index == this.children.length - 1;
    };
    const timeInMs = info.options.timeInMs;
    const duration = info.child.duration;
    if (
      this.#allowExtendedTimes(info.child) ||
      (timeInMs >= 0 &&
        (timeInMs < duration || (timeInMs == duration && isLastChild())))
    ) {
      if (InSeriesComponent.TRANSITION in info.child) {
        const children = this.children;
        const { child, index, options } = info;
        let before: Showable | undefined;
        if (index > 0) {
          before = children[index - 1].child;
          if (InSeriesComponent.TRANSITION in before) {
            // Avoid an infinite recursion.
            // Assume this is a temporary issue as the user is rearranging things, and don't crash.
            before = undefined;
          }
        }
        let after = children.at(index + 1)?.child;
        if (after && InSeriesComponent.TRANSITION in after) {
          // Avoid an infinite recursion.
          after = undefined;
        }
        (child as Transition)[InSeriesComponent.TRANSITION](
          options,
          before,
          after,
        );
      } else {
        super.showChild(info);
      }
    }
  }
}

/**
 * This is a special type of component made to be a child of an {@link InSeriesComponent}.
 */
export type Transition = {
  /**
   * If this method exists on a child, an {@link InSeriesComponent} parent will call this instead of show().
   * @param options Standard ShowOptions
   * @param before This is the Showable immediately before the transition.
   * This will be undefined if the Transition is the first child.
   * This will be undefined if the Transition is preceded immediately by a another Transition.
   * Typically undefined will be treated like a showable that does nothing.
   * @param after This is the Showable immediately after the transition.
   * This will be undefined if the Transition is the last child.
   * This will be undefined if the Transition is followed immediately by a another Transition.
   * Typically undefined will be treated like a showable that does nothing.
   */
  [InSeriesComponent.TRANSITION]: (
    options: ShowOptions,
    before: Showable | undefined,
    after: Showable | undefined,
  ) => void;
};
