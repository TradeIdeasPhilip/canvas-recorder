import { makeBoundedLinear } from "phil-lib/misc";
import { PathShape, Point } from "./glib/path-shape";
import { interpolatePoint } from "./interpolate";
import { PathShapeSplitter } from "./glib/path-shape-splitter";

/**
 * @param pathShape An arbitrary path.
 * @returns A {@link ParametricFunction} that traces out the {@link pathShape}.
 * An input of 0 to this function will return the first point in the path.
 * An input of 1 to this function will return the last point in the path.
 * In between points are traced out with a constant amount of length per input progress.
 */
export function pathToParametric(pathShape: PathShape): ParametricFunction {
  const splitter = PathShapeSplitter.create(pathShape);
  function parametricFromPath(progress: number) {
    return splitter.at(progress * splitter.length);
  }
  return parametricFromPath;
}

/**
 *
 * @param point An arbitrary point.
 * @returns A {@link ParametricFunction} that returns {@link point} for every input.
 */
export function constantToParametric(point: Point): ParametricFunction {
  function parametricFromPoint() {
    return point;
  }
  return parametricFromPoint;
}

/**
 * A function that takes a number from 0 to 1 (inclusive) as input, and returns x and y coordinates.
 * This is a nice way to describe a curve using math.
 * And it is a perfect input for some other tools, like {@link PathShape.parametric}().
 */
export type ParametricFunction = (progress: number) => Point;

/**
 * Given two {@link ParametricFunction}s, return a new  {@link ParametricFunction}.
 * Adjust the details over time to "fade" from one function to the other.
 * The resulting function will show parts of both functions, with a smooth region connecting them.
 * @param from Start with this input.
 * @param to End up looking like this input.
 * @param overlap How big a region to average over.
 * A small region will show two distinct curves with a line connecting them.
 * Larger regions can have more space to make the curve naturally connect the two sides.
 * Large enough regions can make whole sections of your graph appear to move over time, often a pleasant result.
 *
 * This number is measured relative to the input to `from`, `to`, and the result of `createCrossFade()`.
 * That is slightly different from the scale used for `crossFadeProgress`.
 * @param crossFadeProgress How much of a change we've made.
 * 0 means to return the `from` function unchanged.
 * 1 means to return the `to` function unchanged.
 * 0.5 means to show about half and half, with a little overlap in the middle.
 * If `overlap` is small, `overlap * 0.95` means to show most of `from` as originally specified, most of the averaged region, and no completely unaltered parts of `to`.
 * @param easing A standard easing function mapping the range [0,1] to [0,1].
 * Defaults to linear.
 * When the underlying data comes from Fourier decomposition I find linear works well.
 * But when moving between two arbitrary curves, sometimes it helps to set this to {@link ease}.
 */
export function createCrossFadeFunction(
  from: ParametricFunction,
  to: ParametricFunction,
  overlap: number,
  crossFadeProgress: number,
  easing = (progress: number) => progress,
): ParametricFunction {
  if (crossFadeProgress <= 0) {
    return from;
  } else if (crossFadeProgress >= 1) {
    return to;
  } else {
    const farSide = (1 - crossFadeProgress) * (1 + overlap);
    const nearSide = farSide - overlap;
    const progressToStrengthOfTo = makeBoundedLinear(nearSide, 0, farSide, 1);
    function crossFadeResult(progress: number) {
      const strengthOfTo = progressToStrengthOfTo(progress);
      switch (strengthOfTo) {
        case 0: {
          return from(progress);
        }
        case 1: {
          return to(progress);
        }
        default: {
          return interpolatePoint(
            easing(strengthOfTo),
            from(progress),
            to(progress),
          );
        }
      }
    }
    return crossFadeResult;
  }
}

/**
 *
 * @param from At progress = 0, the result will be this.
 * @param to At progress = 1, the result will be this.
 * @param overlap How big a region to average over.
 * A small overlap will show two distinct curves with a line connecting them.
 * Larger overlaps lead to more space to make the curve naturally connect the two sides.
 * A large enough overlap can make whole sections of your graph appear to move over time, often a pleasant result.
 *
 * This number is measured relative to the input to `from`, `to`, and the result of `createCrossFade()`.
 * A value of 1/4 means that 1/4 of the path will be replaced by the average of the two inputs.
 * p amount of progress always corresponds to p * the total length of either input path.
 * @param numberOfSegments Higher number for more quality.
 * Lower number for better performance.
 * Passed on to {@link PathShape.parametric}() as is.
 * @param easing How to average the values between the two functions.
 * The default is linear.
 * @returns A function that takes progress (0-1) as an input will return a new {@link PathShape} depending on the input.
 * 0 means to draw {@link from} unchanged.
 * 1 means draw {@link to} unchanged.
 * As the progress increases the overlap will move across the PathShape and the from PathShape will get replaced by the to PathShape.
 */
export function createPathShapeCrossFade(
  from: PathShape,
  to: PathShape,
  overlap: number,
  numberOfSegments: number,
  easing = (progress: number) => progress,
): (progress: number) => PathShape {
  const fromParametricFunction = pathToParametric(from);
  const toParametricFunction = pathToParametric(to);
  function crossFade(progress: number): PathShape {
    const movingFunction = createCrossFadeFunction(
      fromParametricFunction,
      toParametricFunction,
      overlap,
      progress,
      easing,
    );
    const movingPathShape = PathShape.parametric(
      movingFunction,
      numberOfSegments,
    );
    return movingPathShape;
  }
  return crossFade;
}
