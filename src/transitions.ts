import { ease, easeIn } from "./interpolate";
import { Showable } from "./showable";

/**
 * Create a new Showable transitioning from one showable to another.
 * This slides the old item off to the left and slides the new item in from the right.
 *
 * `timeInMs` is frozen at the end of `from` and the start of `to`.
 * `globalTime` progresses as normal.
 * @param from Start by displaying the end of this.
 * @param to End by displaying the beginning of this.
 * @param duration In milliseconds.
 * @param easingFunction Default is {@link ease}().
 * @returns The new scene.
 */
export function slideLeft(
  from: Showable,
  to: Showable,
  duration: number,
  easingFunction = ease,
) {
  const result: Showable = {
    duration,
    description: `Slide left » ${from.description} » ${to.description}`,
    show(options) {
      const { context, timeInMs } = options;
      const originalMatrix = context.getTransform();
      const progress = easingFunction(timeInMs / this.duration);
      context.translate(-16 * progress, 0);
      from.show({ ...options, timeInMs: from.duration });
      context.translate(16, 0);
      to.show({ ...options, timeInMs: 0 });
      context.setTransform(originalMatrix);
    },
  };
  return result;
}

export function fadeOut(
  from: Showable,
  duration: number,
  easingFunction = easeIn,
) {
  const result: Showable = {
    duration,
    description: `${from.description} » fadeOut`,
    show(options) {
      const { context, timeInMs } = options;
      const progress = easingFunction(timeInMs / duration);
      context.globalAlpha = 1 - progress;
      from.show({ ...options, timeInMs: from.duration });
      context.globalAlpha = 1;
    },
  };
  return result;
}
