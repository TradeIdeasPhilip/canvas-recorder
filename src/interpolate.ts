import { lerp } from "phil-lib/misc";
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
  array: readonly T[]
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

/**
 *
 * @param time There is no fixed scale.  This fits into the values of time in the array.
 * @param array Inputs should come in order.
 * @returns
 */
export function timedKeyframes<T>(
  time: number,
  array: readonly { time: number; value: T }[]
):
  | { single: true; value: T }
  | { single: false; progress: number; from: T; to: T } {
  if (time <= array[0].time) {
    return { single: true, value: array[0].value };
  }
  if (time >= array.at(-1)!.time) {
    return { single: true, value: array.at(-1)!.value };
  }
  for (let i = 1; i < array.length; i++) {
    const to = array[i];
    if (time == to.time) {
      return { single: true, value: to.value };
    }
    const from = array[i - 1];
    if (time >= from.time && time <= to.time) {
      const progress = (time - from.time) / (to.time - from.time);
      return { single: false, progress, from: from.value, to: to.value };
    }
  }
  throw new Error("wtf");
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
          lerp(fromCommand.y, toCommand.y, progress)
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
          lerp(from.y, to.y, progress)
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
