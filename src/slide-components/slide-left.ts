import { Showable, ShowOptions } from "../showable";
import { InSeriesComponent, Transition } from "./in-series";
import { ComponentWithLiveDuration } from "./live-duration";
import { showError } from "./show-error";

/**
 * A {@link Transition}.
 * The previous Showable slides left off the screen.
 * At the same time the next Showable slides left onto the screen.
 */
export class SlideLeftTransition
  extends ComponentWithLiveDuration
  implements Transition
{
  constructor(options: { description?: string; duration?: number } = {}) {
    super(options.description ?? "Slide Left", options.duration ?? 1000);
  }
  readonly registryKey = "Slide Left Transition";
  override show(options: ShowOptions): void {
    // Thoughts about the future:
    // For now I'm focused on using this in an InSeriesComponent.
    // That said, it would not be hard to give it two normal children (fixed or removable) and work that way.
    // I.e. this might not always be an error.
    showError(
      options.context,
      "A SlideLeft's parent must be an InSeriesComponent.",
    );
  }
  [InSeriesComponent.TRANSITION](
    options: ShowOptions,
    before: Showable | undefined,
    after: Showable | undefined,
  ): void {
    const progress = options.timeInMs / this.duration;
    const context = options.context;
    context.save();
    // Set up the outgoing Showable:
    context.translate(progress * -16, 0);
    if (before) {
      const atEnd: ShowOptions = { ...options, timeInMs: before.duration };
      before.show(atEnd);
    }
    // Set up the incoming Showable:
    context.translate(16, 0);
    if (after) {
      const atBeginning: ShowOptions = { ...options, timeInMs: 0 };
      after.show(atBeginning);
    }
    context.restore();
  }
}
