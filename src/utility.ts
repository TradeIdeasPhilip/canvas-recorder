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

type StrokeColorsOptions = {
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

/**
 * These colors are all bright and distinct and all look good against a dark background.
 * I hand picked these.
 */
export const darkRainbow = [
  "rgb(255, 0, 0)",
  "rgb(255, 128, 0)",
  "rgb(255, 255, 0)",
  "rgb(0, 255, 0)",
  "rgb(0, 255, 255)",
  "rgb(0, 128, 255)",
  "rgb(0, 0, 255)",
  "rgb(128, 0, 255)",
  "rgb(255, 0, 255)",
];

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
  const colorsToUse = options.colors ?? darkRainbow;
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
