import { fft } from "fft-js";
import {
  Command,
  LCommand,
  ParametricFunction,
  PathShape,
  Point,
} from "../glib/path-shape";
import {
  assertNonNullable,
  initializedArray,
  lerp,
  makeBoundedLinear,
  makeLinear,
  Random,
  sum,
} from "phil-lib/misc";
import { ease } from "../interpolate";
import { PathShapeSplitter } from "../glib/path-shape-splitter";

/**
 * Transform a path.
 * Translate it so that the origin of the path is in a particular location relative to the bounding box of the path.
 *
 * Often I `panAndZoom` so the origin is irrelevant.
 * Which is good because the origin is at odd places in a lot of the art that I steal.
 * However, when you do a fourier transform, the origin is relevant.
 *
 * In the current animations the body of the image is panned and zoomed into place.
 * But the animation starts with a point drawn at the origin.
 * The animation has to move toward the center of the final image.
 * That's why I talk about moving the origin, relative to the image,
 * rather than moving the image relative to the origin.
 * @param path The path to transform
 * @param x 0 puts the origin at the far left of the bounding box,
 * 1 puts it at the far right, 0.5 in the middle.
 * The default is 0.5.
 * @param y 0 puts the origin at the top of the bounding box,
 * 1 puts it at the bottom, 0.5 in the middle.
 * The default is 0.5.
 * @returns The transformed path.
 */
export function recenter(path: PathShape | string, x = 0.5, y = 0.5) {
  const pathShape =
    path instanceof PathShape ? path : PathShape.fromRawString(path);
  const bBox = pathShape.getBBox();
  const Δx = -lerp(bBox.x.min, bBox.x.max, x);
  const Δy = -lerp(bBox.y.min, bBox.y.max, y);
  const result = pathShape.translate(Δx, Δy);
  return result;
}

/**
 *
 * @param numberOfPoints
 * @param skip 0 to make a polygon.
 * 1 to make a star, if numberOfPoints is odd and at least 5.
 * 2 to make a different star, if numberOfPoints is odd and at least 7.
 * @param random A random number generator or a seed for a new random number generator.
 */
export function makePolygon(
  numberOfPoints: number,
  skip: number,
  random: (() => number) | string = "My seed 2025",
  randomness = 0.25,
) {
  const rotate = ((2 * Math.PI) / numberOfPoints) * (1 + skip);
  if (typeof random === "string") {
    random = Random.fromString(random);
  }
  const jiggle = () => (random() - 0.5) * randomness;
  const vertices = initializedArray(numberOfPoints, (i) => {
    const θ = i * rotate;
    return { x: Math.cos(θ) + jiggle(), y: Math.sin(θ) + jiggle() };
  });
  const commands = vertices.map((vertex, index) => {
    const nextVertex = vertices[(index + 1) % numberOfPoints];
    return new LCommand(vertex.x, vertex.y, nextVertex.x, nextVertex.y);
  });
  return new PathShape(commands);
}

export interface FourierTerm {
  frequency: number;
  amplitude: number;
  phase: number;
}

export type Complex = [real: number, imaginary: number];

export function samplesFromParametric(
  func: ParametricFunction,
  numSamples: number = 1024,
): Complex[] {
  if (Math.log2(numSamples) % 1 !== 0) {
    throw new Error("numSamples must be a power of 2");
  }
  const samples: Complex[] = [];
  for (let i = 0; i < numSamples; i++) {
    const t = i / (numSamples - 1);
    const point = func(t);
    samples.push([point.x, point.y]);
  }
  return samples;
}

function keepNonZeroTerms(terms: readonly FourierTerm[]): FourierTerm[] {
  let sum = 0;
  terms.forEach((term) => (sum += term.amplitude));
  const cutoff = sum / 1e7;
  const result = terms.filter((term) => term.amplitude > cutoff);
  let newSum = 0;
  result.forEach((term) => (newSum += term.amplitude));
  return result;
}

export function samplesToFourier(samples: readonly Complex[]): FourierTerm[] {
  const numSamples = samples.length;
  if (Math.log2(numSamples) % 1 !== 0) {
    throw new Error("numSamples must be a power of 2");
  }
  const phasors = fft(samples);
  const terms: FourierTerm[] = [];
  for (let k = 0; k < numSamples; k++) {
    const [real, imag] = phasors[k];
    const amplitude = Math.sqrt(real * real + imag * imag) / numSamples;
    const phase = Math.atan2(imag, real);
    const frequency = k <= numSamples / 2 ? k : k - numSamples; // Map k > N/2 to negative
    terms.push({ frequency, amplitude, phase });
  }
  // Sort by amplitude, descending
  terms.sort((a, b) => b.amplitude - a.amplitude);
  return keepNonZeroTerms(terms);
}

const cacheHealth = { miss: 0, hit: 0 };
(window as any).cacheHealth = cacheHealth;

/**
 * Create a parametric function based on the output of a prior call to an FFT.
 *
 * This lets you select which terms you want to use.
 * The original purpose was to animate the process of adding more terms.
 * @param terms The output of a fast Fourier transform after minor massaging.
 * @param numTerms How many of the terms do you wish to compute and sum?
 * @param start The first term to include.
 * I.e. Skip the first `start` terms and start with `terms[start]`
 * @returns A new function to compute the value of all the selected terms at a given t.
 * The input the function, `t`, varies from 0 to 1, inclusive.
 * Each function will share the same underlying array of `terms` for efficiency.
 *
 * The returned function will be cached for performance.
 * Each call to this function will create a new cache.
 */
export function termsToParametricFunction(
  terms: readonly FourierTerm[],
  numTerms: number,
  start = 0,
): ParametricFunction {
  const end = Math.min(start + numTerms, terms.length);
  /**
   * The main event!
   *
   * Compute each of the terms and add the results.
   * @param t A value from 0 to 1, inclusive.
   * @returns A sum of all of the terms computed at `t`.
   */
  function sumOfFourierTerms(t: number): Point {
    let x = 0,
      y = 0;
    for (let k = start; k < end; k++) {
      const { frequency, amplitude, phase } = terms[k];
      const angle = 2 * Math.PI * frequency * t + phase;
      x += amplitude * Math.cos(angle);
      y += amplitude * Math.sin(angle);
    }
    return { x, y };
  }
  /**
   * This gets used a lot.
   * It helps a lot.
   */
  const cache = new Map<number, Point>();
  function cachedSumOfFourierTerms(t: number): Point {
    const cached = cache.get(t);
    if (cached) {
      cacheHealth.hit++;
      return cached;
    }
    cacheHealth.miss++;
    const result = sumOfFourierTerms(t);
    cache.set(t, result);
    return result;
  }
  return cachedSumOfFourierTerms;
}

/**
 * If a term's frequency is 0 then its contribution will be fixed.
 * I.e. it will not depend on the angle.
 * @param term Created by samplesToFourier()
 * @returns `undefined` if this term does not have a fixed value.
 * Otherwise returns the contribution of the term.
 */
export function hasFixedContribution(term: FourierTerm): Point | undefined {
  if (term.frequency == 0) {
    return {
      x: Math.cos(term.phase) * term.amplitude,
      y: Math.sin(term.phase) * term.amplitude,
    };
  } else {
    return undefined;
  }
}

function samplesFromPathOrig(
  pathString: string,
  numberOfTerms: number,
): Complex[] {
  const splitter = new PathShapeSplitter(pathString);
  const sampleCount = numberOfTerms;
  const segmentCount = sampleCount - 1;
  return initializedArray(sampleCount, (index) => {
    const point = splitter.at((splitter.length / segmentCount) * index);
    return [point.x, point.y];
  });
}

// This is more complicated than samplesFromPathOrig but it give you 2 things:
// * It fills in the jumps.
//   They are replaced with straight lines.
//   That would have happened anyway, but this avoids the crazy oscillations.
// * This makes sure that every point named explicitly in the path string will be sampled.
//   Which is essential if one part of your path has a lot of detail.
// Originally this was a lot faster, too, but since removing PathCaliper that does not
// seem to be an issue.
export function samplesFromPath(
  pathString: string,
  numberOfTerms: number,
): Complex[] {
  // I added the following line just to test samplesFromPathOrig().
  //return samplesFromPathOrig(pathString, numberOfTerms);
  try {
    const commands = PathShape.fromRawString(pathString).commands;
    if (commands.length == 0) {
      throw new Error("wtf");
    }
    const connectedCommands = new Array<Command>();
    commands.forEach((command, index) => {
      connectedCommands.push(command);
      const nextCommand = commands[(index + 1) % commands.length];
      if (PathShape.needAnM(command, nextCommand)) {
        const newSegment = new LCommand(
          command.x,
          command.y,
          nextCommand.x0,
          nextCommand.y0,
        );
        connectedCommands.push(newSegment);
      }
    });
    const lengths = connectedCommands.map(
      (
        command,
        originalIndex,
      ): {
        readonly command: Command;
        readonly length: number;
        readonly originalIndex: number;
        numberOfVertices: number;
      } => {
        const length = command.getLength();
        return {
          command,
          length: length,
          numberOfVertices: 0,
          originalIndex,
        };
      },
    );
    {
      /**
       * This contains the same objects as the `lengths` array.
       * We are modifying the objects' `numberOfVertices` property.
       *
       * This is sorted with the longest items first in the list.
       * We will be removing the smallest items first, `pop`-ing them.
       */
      const working = lengths.toSorted((a, b) => b.length - a.length);
      let verticesAvailable = numberOfTerms;
      let lengthAvailable = sum(working.map(({ length }) => length));
      while (true) {
        if (verticesAvailable == 0) {
          break;
        }
        const segmentInfo = working.pop();
        if (!segmentInfo) {
          throw new Error("wtf");
        }
        if (segmentInfo.length > 0) {
          const idealNumberOfVertices =
            (verticesAvailable / lengthAvailable) * segmentInfo.length;
          const numberOfVertices = Math.max(
            1,
            Math.round(idealNumberOfVertices),
          );
          segmentInfo.numberOfVertices = numberOfVertices;
          verticesAvailable -= numberOfVertices;
          lengthAvailable -= segmentInfo.length;
        }
      }
    }
    const result = new Array<Complex>();
    //console.log(lengths);
    lengths.forEach(({ numberOfVertices, command }) => {
      if (numberOfVertices == 1) {
        result.push([command.x0, command.y0]);
      } else if (numberOfVertices > 1) {
        const splitter = command.makeSplitter();
        for (let i = 0; i < numberOfVertices; i++) {
          const distance = (splitter.length * i) / numberOfVertices;
          const { x, y } = splitter.at(distance);
          result.push([x, y]);
        }
      }
    });
    return result;
    /**
     * create a sorted copy of the lengths array, sorted by path length.
     * keep track of the number of vertices available,
     * starting with what we were given,
     * decreasing as we dole them out.
     *
     * can this get rid of the filter/flatMap above?
     * This step, not "const lengths = subPaths.map"
     * should get rid of paths with 0 length.
     * yes!!
     *
     * Start processing from the short end.
     * If a length is 0, skip the command entirely and continue on to the next.
     * Given the number of vertices available and the amount of distance available,
     * what is the ideal number of vertices per distance?
     * and what is the ideal number of vertices for this command?
     * Round to an integer.
     * Set a min value of 1 vertex.
     * Store the result for this record, remove it from the list, and repeat.
     */
    /**
     * Now that we know how many vertexes are allocated for each command,
     * the rest is trivial.
     * Go back to the original, unsorted array of lengths.
     * Go through them in order.
     * For i = (0 ... n-1), look at position i/n*length.
     * I.e. always do the staring point and never do the ending point.
     */
  } catch (reason) {
    console.warn("using fallback", reason);
    return samplesFromPathOrig(pathString, numberOfTerms);
  }
}

export const numberOfFourierSamples = 1024;

// TODO add in y1 and y2, rather than just assuming they are 0 and 1.
function makeEasing(x1: number, x2: number) {
  if (x1 >= x2) {
    throw new Error("wtf");
  }
  const inputMap = makeLinear(x1, 0, x2, 1);
  function customEasing(t: number) {
    if (t <= x1) {
      return 0;
    } else if (t >= x2) {
      return 1;
    }
    const input = inputMap(t);
    const eased = ease(input);
    return eased;
  }
  return customEasing;
}

/**
 * This does a lot of one time setup for displaying all of the animations.
 * The return value hides a lot of internal state.
 *
 * @returns An array of functions each of which take progress of 0-1 as input and return a path string.
 *
 * Note that there is one entry in the array for each _transition_.
 * Fencepost!
 * The number of transitions is one less than the number of states.
 */
export function getAnimationRules(
  terms: string | FourierTerm[],
  keyframes: readonly number[],
): ((progress: number) => PathShape)[] {
  // In principal this could be adapted to transition from any curve to any other curve.
  // Currently this function has some details that are specific to Fourier.
  // 1) This includes an optimization.  We know that the two paths are related.
  //    The second path includes more terms than the first, but a superset.
  //    So we reuse the result of the first instead of computing the second from scratch.
  // 2) Starting or ending with a single point causes some special cases.
  //    We currently detect these cases based on the Fourier terms.
  // 3) We need to decide how much space is given to the transition between the two functions.
  //    The current logic is very specific to the Fourier series.
  // 4) We need to tell PathShape.glitchFreeParametric() how many segments to use.
  //    This depends how complicated the path is.
  //    The current logic for this is based on the Fourier terms.
  if (typeof terms === "string") {
    const samples = samplesFromPath(terms, numberOfFourierSamples);
    terms = samplesToFourier(samples);
  } else {
    terms = [...terms];
  }
  keyframes = [...keyframes];
  const numberOfSteps = keyframes.length - 1;
  const getMaxFrequency = (numberOfTerms: number) => {
    const maxFrequency = Math.max(
      ...terms.slice(0, numberOfTerms).map((term) => Math.abs(term.frequency)),
    );
    return maxFrequency;
  };
  const recommendedNumberOfSegments = (numberOfTerms: number) => {
    if (numberOfTerms == 0) {
      return 8;
    } else {
      const maxFrequency = getMaxFrequency(numberOfTerms);
      return 8 * Math.min(maxFrequency, 110) + 7;
    }
  };
  const result: ((t: number) => PathShape)[] = initializedArray(
    numberOfSteps,
    (index) => {
      const startingTermCount = keyframes[index];
      const endingTermCount = keyframes[index + 1];
      if (
        startingTermCount == 0 &&
        endingTermCount == 1 &&
        terms[0].frequency == 0
      ) {
        /**
         * Special case:  A dot is moving.
         *    Going from 0 terms to 1 term with frequency = zero.
         *    Don't even think about the animation that we do in other places.
         *    This script is completely unique.
         *    Draw a single line for the path.
         *    Both ends start at the first point.
         *    Use makeEasing() to move the points smoothly.
         */
        const goal = assertNonNullable(hasFixedContribution(terms[0]));
        /**
         * @param t A value between 0 and 1.
         * @returns The coordinates as a string.
         */
        function location(t: number) {
          return `${goal.x * t},${goal.y * t}`;
        }
        const getLeadingProgress = makeEasing(0, 0.5);
        const getTrailingProgress = makeEasing(0, 1);
        return (t: number) => {
          const trailingProgress = getTrailingProgress(t);
          const from = location(trailingProgress);
          const leadingProgress = getLeadingProgress(t);
          const to = location(leadingProgress);
          const pathString = `M ${from} L ${to}`;
          // console.log({ t, trailingProgress, leadingProgress, pathString });
          return PathShape.fromRawString(pathString);
        };
      } else if (startingTermCount == endingTermCount) {
        const parametricFunction = termsToParametricFunction(
          terms,
          startingTermCount,
        );
        const numberOfDisplaySegments =
          recommendedNumberOfSegments(endingTermCount);
        const path = PathShape.glitchFreeParametric(
          parametricFunction,
          numberOfDisplaySegments,
        );
        const result = path;
        return (_timeInMs: number): PathShape => {
          return result;
        };
      } else {
        // TODO this should probably be the largest from the group that we are adding.
        const firstInterestingFrequency = Math.abs(
          terms[startingTermCount].frequency,
        );
        const r = 0.2 / firstInterestingFrequency;
        /**
         * This creates a function which takes a time in milliseconds,
         * 0 at the beginning of the script.
         * The output is scaled to the range 0 - 1,
         * for use with PathShape.parametric().
         * The output might be outside of that range.
         * I.e. the input and output are both numbers but they are interpreted on different scales.
         */
        const tToCenter = makeBoundedLinear(0, -r, 1, 1 + r);
        const startingFunction = termsToParametricFunction(
          terms,
          startingTermCount,
        );
        const addingFunction = termsToParametricFunction(
          terms,
          endingTermCount - startingTermCount,
          startingTermCount,
        );
        const numberOfDisplaySegments =
          recommendedNumberOfSegments(endingTermCount);
        if (
          startingTermCount == 0 ||
          (startingTermCount == 1 && hasFixedContribution(terms[0]))
        ) {
          // We are converting from a dot to something else.
          const startingPoint = hasFixedContribution(terms[0]) ?? {
            x: 0,
            y: 0,
          };
          return (timeInMs: number): PathShape => {
            const centerOfChange = tToCenter(timeInMs);
            const startOfChange = centerOfChange - r;
            const endOfChange = centerOfChange + r;
            const getFraction = makeEasing(startOfChange, endOfChange);
            /**
             * 0 to `safePartEnds`, inclusive are safe inputs to `parametricFunction()`.
             */
            const safePartEnds = Math.min(1, endOfChange);
            if (safePartEnds <= 0) {
              // There is no safe part!
              return PathShape.fromRawString(
                `M${startingPoint.x},${startingPoint.y} L${startingPoint.x},${startingPoint.y}`,
              );
            } else {
              const frugalSegmentCount = Math.ceil(
                // TODO that 150 is crude.  The transition might require
                // more detail than the before or the after.
                // Or it might require less, not that we are glitch-free.
                Math.max(numberOfDisplaySegments, 150) * safePartEnds,
              );
              function parametricFunction(t: number) {
                t = t * safePartEnds;
                const base = startingFunction(t);
                const fraction = 1 - getFraction(t);
                if (fraction == 0) {
                  return base;
                } else {
                  const adding = addingFunction(t);
                  return {
                    x: base.x + fraction * adding.x,
                    y: base.y + fraction * adding.y,
                  };
                }
              }
              const path = PathShape.glitchFreeParametric(
                parametricFunction,
                frugalSegmentCount,
              );
              return path;
            }
          };
        } else {
          // COMMON CASE:  Converting from one normal shape into another.
          return (timeInMs: number): PathShape => {
            const centerOfChange = tToCenter(timeInMs);
            const getFraction = makeEasing(
              centerOfChange - r,
              centerOfChange + r,
            );
            function parametricFunction(t: number) {
              const base = startingFunction(t);
              const fraction = 1 - getFraction(t);
              if (fraction == 0) {
                return base;
              } else {
                const adding = addingFunction(t);
                return {
                  x: base.x + fraction * adding.x,
                  y: base.y + fraction * adding.y,
                };
              }
            }
            const path = PathShape.glitchFreeParametric(
              parametricFunction,
              numberOfDisplaySegments,
            );
            return path;
          };
        }
      }
    },
  );
  return result;
}

/**
 * Just the time when the curve is moving.
 * Does not include the pauses.
 */
const PLAY_DURATION = 4000;
const PAUSE_BEFORE_FIRST = 0;
const PAUSE_BETWEEN = 500;
const PAUSE_AFTER_LAST = 500;

/**
 * Attach the given `animationRules` to `destination` to create a Showable animation.
 * @param description
 * @param animationRules The curves to draw at different times.
 * @returns
 */
export function createFourierAnimation(
  animationRules: readonly ((t: number) => PathShape)[],
): {
  getInfo(timeInMS: number): {
    pathShape: PathShape;
    index: number;
    progress: number;
  };
  duration: number;
} {
  function getInfo(timeInMS: number) {
    const unitized =
      (timeInMS - PAUSE_BEFORE_FIRST) / (PLAY_DURATION + PAUSE_BETWEEN);
    let index: number;
    let progress: number;
    if (unitized <= 0) {
      index = 0;
      progress = 0;
    } else if (unitized >= animationRules.length) {
      index = animationRules.length - 1;
      progress = 1;
    } else {
      index = Math.floor(unitized);
      progress = Math.min(
        1,
        ((unitized - index) * (PLAY_DURATION + PAUSE_BETWEEN)) / PLAY_DURATION,
      );
    }
    const pathShape = animationRules[index](progress);
    return { pathShape, index, progress };
  }
  const duration =
    animationRules.length * (PLAY_DURATION + PAUSE_BETWEEN) -
    PAUSE_BETWEEN +
    PAUSE_BEFORE_FIRST +
    PAUSE_AFTER_LAST;
  return { duration, getInfo };
}
