// MARK: Hold Previous

import { ShowOptions, Showable } from "../showable";
import { Transition, InSeriesComponent } from "./in-series";
import { ComponentWithLiveDuration } from "./live-duration";
import { showError } from "./show-error";

/**
 * Display and hold the opening frame of the next component.
 *
 * This is a {@link Transition} and can only be used in an {@link InSeriesComponent}.
 * In other contexts you might consider a {@link PaddingComponent} as an alternative.
 */
export class HoldPreviousTransition
  extends ComponentWithLiveDuration
  implements Transition
{
  readonly registryKey = "Hold Previous";
  override readonly replaceableComponents = undefined;
  constructor(options: { description?: string; duration?: number } = {}) {
    super(options.description ?? "Hold Previous", options.duration ?? 1000);
  }
  override show(options: ShowOptions): void {
    showError(
      options.context,
      "A HoldPreviousTransition's parent must be an InSeriesComponent.",
    );
  }
  [InSeriesComponent.TRANSITION](
    options: ShowOptions,
    before: Showable | undefined,
    after: Showable | undefined,
  ): void {
    if (before) {
      before.show({ ...options, timeInMs: before.duration });
    }
  }
}

// MARK: Hold Next

/**
 * Display and hold the final frame of the next component.
 *
 * This is a {@link Transition} and can only be used in an {@link InSeriesComponent}.
 * In other contexts you might consider a {@link PaddingComponent} as an alternative.
 */
export class HoldNextTransition
  extends ComponentWithLiveDuration
  implements Transition
{
  readonly registryKey = "Hold Next";
  override readonly replaceableComponents = undefined;
  constructor(options: { description?: string; duration?: number } = {}) {
    super(options.description ?? "Hold Next", options.duration ?? 1000);
  }
  override show(options: ShowOptions): void {
    showError(
      options.context,
      "A HoldNextTransition's parent must be an InSeriesComponent.",
    );
  }
  [InSeriesComponent.TRANSITION](
    options: ShowOptions,
    before: Showable | undefined,
    after: Showable | undefined,
  ): void {
    if (after) {
      after.show({ ...options, timeInMs: 0 });
    }
  }
}
