import { positiveModulo } from "phil-lib/misc";
import { PathShapeSplitter } from "./glib/path-shape-splitter";
import { Showable } from "./showable";
import { PathShape } from "./glib/path-shape";

// TODO copy this to phil-lib/client-misc.ts
// Right under download() which only works on strings.
// Or maybe join them.  The last argument could have type string|Blob.
export function downloadBlob(filename: string, blob: Blob) {
  const blobURL = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobURL;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(blobURL);
}

/**
 * My favorite shade of blue.
 *
 * The normal css "blue", #0000FF, is way too dark for use on a black background.
 * This adds some green for a much brighter color.
 * Out of context I'd call this color blue.
 * And it looks good with css "red" and "white".
 * #ff0000 #ffffff #007fff
 */
export const BLUE = "#007fff";

export const blackBackground: Showable = {
  description: "background",
  /**
   * The intent is to use this in a MakeShowableInParallel.
   * It will run as long as it needs to.
   */
  duration: 0,
  show({ context }) {
    context.fillStyle = "black";
    context.fillRect(0, 0, 16, 9);
  },
};

export function applyTransform(
  context: CanvasRenderingContext2D,
  matrix: DOMMatrixReadOnly,
) {
  context.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
}

export type StrokeColorsOptions = {
  /** Stroke this path. */
  readonly pathShape: PathShape;
  /** Draw everything here. */
  readonly context: CanvasRenderingContext2D;
  /**
   * A list of CSS color strings to use when stroking the path.
   */
  readonly colors?: ReadonlyArray<string>;
  /**
   * How far ahead to jump in the colors.
   * This is measured in userspace units, same as pathShape.getLength().
   * A small, positive number means to make the first section a little bit smaller,
   * move all of the other sections forward to fill in the gap,
   * and make the last section larger and/or add a new section at the end.
   * As if you added a small section to the beginning of the curve, and later covered it up.
   * Larger number and negative numbers will work.
   *
   * For example, consider a line segment going from left to right.
   * Animate this property so it slowly grows.
   * The colored segments will slowly move to the left.
   *
   * At most one of offset and relative offset may be set.
   * If neither is set, the default is offset=0.
   */
  offset?: number;
  /**
   * This is an alternative to setting the offset.
   * 0 and small positive and negative values work as with offset.
   * But the scale is different.
   * A value of 1 means to rotate once all the way through the colors.
   * Jumping directly between 0 and 1 will have no visible effect.
   * Gradually animating the change between 0 and 1 will cause the colors to move one complete cycle.
   *
   * If the length of the path is changing over time,
   * I often find it's better to use relativeOffset and offset.
   */
  relativeOffset?: number;
  /**
   * sectionLength says how far to go before changing colors.
   * It is measured in userspace units, just like pathShape.getLength().
   *
   * At most one of sectionLength, repeatCount and colorCount can be used.
   * Setting none of these is the same as setting repeatCount to 1.
   */
  sectionLength?: number;
  /**
   * repeatCount says how many times to display the entire list of colors.
   *
   * At most one of sectionLength, repeatCount and colorCount can be used.
   * Setting none of these is the same as setting repeatCount to 1.
   */
  repeatCount?: number;
  /**
   * colorCount says how many different colored segments to draw.
   * If offset == 0 (and round off error is not a problem) then you will have exactly colorCount sections.
   * Otherwise the first and last segments might be smaller,
   * adding up to single segment.
   *
   * At most one of sectionLength, repeatCount and colorCount can be used.
   * Setting none of these is the same as setting repeatCount to 1.
   */
  colorCount?: number;
};

type MyRainbow = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
] & {
  /**
   * Standard css red.  Full intensity.
   */
  readonly red: string;
  /**
   * Full intensity.
   *
   * Slightly different from css orange.
   */
  readonly orange: string;
  /**
   * A slightly darkened version of standard css yellow.
   *
   * You don't need the brightness on a black background.
   * And this makes things easier to read on a white background.
   */
  readonly yellow: string;
  /**
   * A slightly darkened version of standard css green.
   *
   * When you see the rainbow colors together, this makes them all look close to the same brightness.
   */
  readonly green: string;
  /**
   * A slightly darkened version of standard css cyan.
   *
   * When you see the rainbow colors together, this makes them all look close to the same brightness.
   */
  readonly cyan: string;
  /**
   * My favorite shade of blue.
   * A little bit on the green side of blue, full intensity.
   *
   * Known in older code as `BLUE`.
   * The normal css "blue", #0000FF, is way too dark for use on a black background.
   * This adds some green for a much brighter color.
   * Out of context I'd call this color blue.
   * And it looks good with css "red" and "white".
   * #ff0000 #ffffff #007fff
   */
  readonly myBlue: string;
  /**
   * Similar to standard css blue, but a little brighter and easier to read on a black background.
   *
   * To my eye this looks like the exact same shade as css blue.
   * I adjusted the numbers to keep that shade.
   * This is still a lot darker than `myBlue`, which is good because it keeps those colors distinct.
   */
  readonly cssBlue: string;
  /**
   * A dark, bluish shade of purple.  Full intensity.
   *
   * I can't find any good match with standard color names.
   * css violet is in the same general family.
   */
  readonly violet: string;
  /**
   * Standard css magenta.  Full intensity.
   */
  readonly magenta: string;
};

/**
 * These colors are all bright and distinct and all look good against a black or white background.
 * I hand picked these.
 *
 * Source:  https://tradeideasphilip.github.io/random-svg-tests/colors.html ,
 * https://github.com/TradeIdeasPhilip/random-svg-tests/commit/89a047a44b85186c940e004607f8dcb44b69fe42
 */
export const myRainbow = (function () {
  const result = [
    "rgb(255, 0, 0)",
    "rgb(255, 128, 0)",
    "#d8d800",
    "#0e0",
    "#00d8d8",
    "rgb(0, 128, 255)",
    "rgb(32, 64, 255)",
    "rgb(128, 0, 255)",
    "rgb(255, 0, 255)",
  ] as any;
  result.red = result[0];
  result.orange = result[1];
  result.yellow = result[2];
  result.green = result[3];
  result.cyan = result[4];
  result.myBlue = result[5];
  result.cssBlue = result[6];
  result.violet = result[7];
  result.magenta = result[8];
  return result as MyRainbow;
})();

function countNotNullable(items: readonly unknown[]) {
  let result = 0;
  items.forEach((item) => {
    if (item !== undefined && item !== null) {
      result++;
    }
  });
  return result;
}

export function strokeColors(options: StrokeColorsOptions) {
  const splitter = new PathShapeSplitter(options.pathShape);
  const colorsToUse = options.colors ?? myRainbow;
  if (
    countNotNullable([
      options.sectionLength,
      options.repeatCount,
      options.colorCount,
    ]) > 1
  ) {
    throw new Error("wtf");
  }
  const sectionLength: number =
    options.sectionLength ??
    splitter.length /
      (options.colorCount ?? (options.repeatCount ?? 1) * colorsToUse.length);
  if (options.relativeOffset !== undefined && options.offset !== undefined) {
    throw new Error("wtf");
  }
  if (options.offset == undefined) {
    if (options.relativeOffset == undefined) {
      options.offset = 0;
    } else {
      options.offset =
        options.relativeOffset * sectionLength * colorsToUse.length;
    }
  }
  if (options.offset < 0) {
    options.offset = positiveModulo(
      options.offset,
      colorsToUse.length * sectionLength,
    );
  }
  let colorIndex = 0;
  let startPosition = -options.offset;
  while (startPosition < splitter.length) {
    const endPosition = startPosition + sectionLength;
    const section = splitter.get(startPosition, endPosition);
    const color = colorsToUse[colorIndex % colorsToUse.length];
    options.context.strokeStyle = color;
    options.context.stroke(section.canvasPath);
    startPosition = endPosition;
    colorIndex++;
  }
}

/**
 * Like {@link Array.map}(), but
 * 1. The callback function is given __two__ adjacent values each time.
 * 2. The callback function is called array.length **- 1** times.
 * @param array To walk over
 * @param f
 * @returns A collection of the results
 */
export function mapEachPair<T, U>(
  array: readonly T[],
  f: (a: T, b: T, indexOfFirst: number, array: readonly T[]) => U,
) {
  const result = new Array<U>();
  array.forEach((second, index) => {
    if (index != 0) {
      const first = array[index - 1];
      const u = f(first, second, index - 1, array);
      result.push(u);
    }
  });
  return result;
}
