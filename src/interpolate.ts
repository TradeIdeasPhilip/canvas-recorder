import { FULL_CIRCLE, lerp } from "phil-lib/misc";
import { LCommand, PathShape, QCommand } from "./glib/path-shape";

/**
 * If the old code used element.animate(), this will help build the new code.
 * This code knows how to interpolate between one value and another.
 */

/**
 *
 * @param progress A value between 0 and 1.
 * @param from A valid css color.  The result is this when progress = 0.
 * @param to A valid css color.  The result is this when progress = 1.
 * @returns A valid css color.  Something in between the two inputs.
 */

export function interpolateColor(progress: number, from: string, to: string) {
  return `color-mix(in srgb, ${to} ${progress * 100}%, ${from})`;
}

function equalWeights<T>(
  progress: number,
  array: readonly T[],
):
  | { single: true; value: T }
  | { single: false; progress: number; from: T; to: T } {
  if (array.length == 0) {
    throw new Error("wtf");
  }
  if (array.length == 1 || progress <= 0) {
    return { single: true, value: array[0] };
  }
  const transitionCount = array.length - 1;
  const scaledProgress = progress * transitionCount;
  if (scaledProgress >= transitionCount) {
    return { single: true, value: array.at(-1)! };
  }
  const index = Math.floor(scaledProgress);
  const localProgress = scaledProgress - index;
  if (localProgress == 0) {
    return { single: true, value: array[index] };
  }
  return {
    single: false,
    progress: localProgress,
    from: array[index],
    to: array[index + 1],
  };
}

export type Keyframe<T> = {
  time: number;
  value: T;
  easeAfter?: (progress: number) => number;
};

export type Keyframes<T> = readonly Keyframe<T>[];

/**
 *
 * @param time There is no fixed scale.  This fits into the values of time in the array.
 * @param keyframes Inputs should come in order.
 * @returns
 */
export function timedKeyframes<T>(
  time: number,
  keyframes: Keyframes<T>,
):
  | { single: true; value: T }
  | { single: false; progress: number; from: T; to: T } {
  if (time <= keyframes[0].time) {
    return { single: true, value: keyframes[0].value };
  }
  if (time >= keyframes.at(-1)!.time) {
    return { single: true, value: keyframes.at(-1)!.value };
  }
  // TODO change this to a binary search
  for (let i = 1; i < keyframes.length; i++) {
    const to = keyframes[i];
    if (time == to.time) {
      return { single: true, value: to.value };
    }
    const from = keyframes[i - 1];
    if (time >= from.time && time <= to.time) {
      let progress = (time - from.time) / (to.time - from.time);
      if (from.easeAfter) {
        progress = from.easeAfter(progress);
      }
      return { single: false, progress, from: from.value, to: to.value };
    }
  }
  throw new Error("wtf");
}

/**
 *
 * @param time There is no fixed scale.  This fits into the values of time in the array.
 * @param array Inputs should come in order.
 * @returns
 */
export function interpolateNumbers(
  time: number,
  keyframes: Keyframes<number>,
): number {
  const relevant = timedKeyframes(time, keyframes);
  if (relevant.single) {
    return relevant.value;
  } else {
    return lerp(relevant.from, relevant.to, relevant.progress);
  }
}

/**
 * Pick a color from the list of colors, interpolating as required.
 * @param progress A value between 0 and 1.
 * @param colors A list of colors.
 * Progress = 0 returns the first item.
 * Progress = 1 returns the last item.
 * The remainder are keyframes spread evenly in time.
 * @returns A color from the `colors` input, or an interpolation between two adjacent colors.
 */
export function interpolateColors(progress: number, colors: readonly string[]) {
  const relevant = equalWeights(progress, colors);
  if (relevant.single) {
    return relevant.value;
  } else {
    return interpolateColor(relevant.progress, relevant.from, relevant.to);
  }
}

/**
 * Interpolate between two paths.  The two paths must have identical command types in the identical order.  Only the arguments to the commands can change.
 *
 * See matchShapes() in morph-animations.ts for a newer version of this function.
 * @param from The path to return at progress <= 0.
 * @param to The path to return at progress >= 1.
 * @returns A function that will take progress as an input and returns a path as an output.
 */
export function makePathShapeInterpolator(from: PathShape, to: PathShape) {
  if (from.commands.length != to.commands.length) {
    console.error(from, to);
    throw new Error("wtf");
  }
  const interpolators = from.commands.map((fromCommand, index) => {
    const toCommand = to.commands[index];
    if (fromCommand instanceof LCommand && toCommand instanceof LCommand) {
      function makeLCommand(progress: number) {
        return new LCommand(
          lerp(fromCommand.x0, toCommand.x0, progress),
          lerp(fromCommand.y0, toCommand.y0, progress),
          lerp(fromCommand.x, toCommand.x, progress),
          lerp(fromCommand.y, toCommand.y, progress),
        );
      }
      return makeLCommand;
    } else if (
      fromCommand instanceof QCommand &&
      toCommand instanceof QCommand
    ) {
      const from = fromCommand;
      const to = toCommand;
      function makeQCommand(progress: number) {
        return QCommand.controlPoints(
          lerp(from.x0, to.x0, progress),
          lerp(from.y0, to.y0, progress),
          lerp(from.x1, to.x1, progress),
          lerp(from.y1, to.y1, progress),
          lerp(from.x, to.x, progress),
          lerp(from.y, to.y, progress),
        );
      }
      return makeQCommand;
    } else {
      // I could do the CCommand if and when there is a need
      console.error({
        command: fromCommand,
        otherCommand: toCommand,
        index,
        from,
        to,
      });
      throw new Error("wtf");
    }
  });
  function interpolate(progress: number): PathShape {
    if (progress <= 0) {
      return from;
    } else if (progress >= 1) {
      return to;
    } else {
      const commands = interpolators.map((f) => f(progress));
      return new PathShape(commands);
    }
  }
  return interpolate;
}

export function qCommandInterpolation(
  fromCommands: readonly QCommand[],
  toCommands: readonly QCommand[],
  progress: number,
) {
  if (fromCommands.length != toCommands.length) {
    throw new Error("wtf");
  }
  const result = fromCommands.map((fromCommand, index) => {
    const toCommand = toCommands[index];
    return QCommand.controlPoints(
      lerp(fromCommand.x0, toCommand.x0, progress),
      lerp(fromCommand.y0, toCommand.y0, progress),
      lerp(fromCommand.x1, toCommand.x1, progress),
      lerp(fromCommand.y1, toCommand.y1, progress),
      lerp(fromCommand.x, toCommand.x, progress),
      lerp(fromCommand.y, toCommand.y, progress),
    );
  });
  return result;
  /**
   * Do this after splitting on connected segments.
   * Do this to each connected segment.
   * Do this before calling pathShapeInterpolation()
   *
   * Can we give preference that if a connected segment must be split,
   * and we have corners, we do the split at the corners?
   * That's pretty specific, not sure of the test case.
   *
   * Start by counting the number of corners.
   * If any segment is adjacent to two corners, split it in half.
   * Record the number of segments currently present,
   * plus one for the piece to be added in each corner.
   * Do this for the initial and final states.
   * Then use the algorithm we've been using to match things.
   * Using the recently modified list of commands.
   * And the count that includes the commands to be added.
   * Then we find the positions of the corners in each PathShape.
   * And we verify that the number matches the previous pass.
   * That's all we can do in advance.
   * __When we have a value for progress:__
   * Create an array of QCommand for the result
   * Walk through the commands from the matching pass.
   * Most get copied to the result unchanged.
   * But when we get to a pair with a corner:
   * Before the corner, cut off the last part.
   * Cut off (1-progress)/2 from the end.
   * Keep 0 through 1-((1-progress)/2).
   * Add that to the result.
   * Now look at the command after the bend.
   * Cut off the first part.
   * Cut off (1-progress)/2 from the beginning.
   * Keep (1-progress)/2 through 1.
   * Now create the bendy part.
   * Start where the first piece ends,
   * the one we just cut then added to result.
   * End where the next piece starts,
   * the one we just created but have not yet added to the result.
   * The middle control point is the meeting point of the two commands before clipping.
   * Add the bendy piece then the recently clipped piece to the result.
   * Do that for both of the paths.
   * Then the simplest interpolation between the commands in each of those to make a third.
   *
   * No.  The match step comes before the call to makePathShapeInterpolator()
   * A filler command should be added before the call
   */
}

/**
 * This converts a linear timing to an eased timing.
 * This is similar to a css "ease" or "ease-in-out" timing function.
 * @param t A value between 0 and 1.
 * @returns A value between 0 and 1.
 */
export function ease(t: number): number {
  const angle = t * Math.PI;
  const cosine = Math.cos(angle);
  const result = (1 - cosine) / 2;
  return result;
}

/**
 * This creates an "ease-in" acceleration profile.
 * It starts (t=0) with an speed of 0 that quickly increases.
 * The speed is maximum and nearly constant near the end (t=1).
 * @param t A value between 0 and 1.
 * @returns A value between 0 and 1.
 */
export function easeIn(t: number): number {
  return 1 - Math.cos((t * Math.PI) / 2);
}

/**
 * This creates an "ease-out" acceleration profile.
 * The speed is maximum and nearly constant at the beginning (t=0).
 * The speed quickly drops to 0 at the end (t=1).
 * @param t A value between 0 and 1.
 * @returns A value between 0 and 1.
 */
export function easeOut(t: number): number {
  return Math.sin((t * Math.PI) / 2);
}

/**
 * As the input goes from 0 to 1, the output from 0 to 1 and back.
 * It slows down near the ends and moves quickly in between.
 * @param t Typically a value between 0 and 1.
 * The function is periodic and effectively starts with `t %= 1;`.
 * @returns A value between 0 and 1.
 */
export function easeAndBack(t: number): number {
  return -Math.cos(t * FULL_CIRCLE) / 2 + 0.5;
}
