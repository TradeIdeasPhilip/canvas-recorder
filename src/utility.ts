import { sum } from "phil-lib/misc";
import { Showable } from "./showable";

/**
 * Assert that `source` has exactly one element and return that element.
 * @returns The element.
 * @throws An exception if source does not have exactly 1 element.
 */
export function only<T>(source: ArrayLike<T>): T {
  if (source.length != 1) {
    throw new Error("wtf");
  }
  return source[0];
}

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

export function countPresent(items: readonly unknown[]) {
  let result = 0;
  items.forEach((item) => {
    if (item !== undefined && item !== null) {
      result++;
    }
  });
  return result;
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

export function doTableLayout<
  T extends { readonly width: number; readonly height: number },
>(
  rows: ReadonlyArray<ReadonlyArray<T>>,
  options: {
    readonly top?: number;
    readonly left?: number;
    readonly rowGap?: number;
    readonly columnGap?: number;
  } = {},
) {
  const top = options.top ?? 0;
  const left = options.left ?? 0;
  const rowGap = options.rowGap ?? 0;
  const columnGap = options.columnGap ?? 0;
  const rowHeights = rows.map((row) =>
    Math.max(...row.map((cell) => cell.height)),
  );
  const columnWidths = new Array<number>();
  rows.forEach((row) => {
    row.forEach((cell, columnIndex) => {
      const previousValue = columnWidths.at(columnIndex) ?? -Infinity;
      columnWidths[columnIndex] = Math.max(previousValue, cell.width);
    });
  });
  let rowTop = top;
  const rowTops = rowHeights.map((rowHeight) => {
    const result = rowTop;
    rowTop += rowHeight + rowGap;
    return result;
  });
  let columnLeft = left;
  const columnLefts = columnWidths.map((columnWidth) => {
    const result = columnLeft;
    columnLeft += columnWidth + columnGap;
    return result;
  });
  const offsets = rows.map((row, rowIndex) => {
    const rowTop = rowTops[rowIndex];
    const rowHeight = rowHeights[rowIndex];
    return row.map((source, columnIndex) => {
      const columnLeft = columnLefts[columnIndex];
      const columnWidth = columnWidths[columnIndex];
      const dx = columnLeft + (columnWidth - source.width) / 2;
      const dy = rowTop + (rowHeight - source.height) / 2;
      return { dx, dy, source };
    });
  });
  return { offsets, columnLefts, columnWidths, rowTops, rowHeights };
}

/**
 * Spread several clips out evenly.
 *
 * Create the same amount of space between each pair of clips.
 * Make them fit in a given range.
 * @param clips List of items to relocate.
 * These will remain in order.
 * @param options
 * * `startFrom` - Number of milliseconds between the start of the scene and when the first clip starts playing.
 * This can be negative to start playing before the previous scene ends.
 * The default is the incoming `startMsIntoScene` of the first element of `clips`.
 * * `endAt` - Number of milliseconds between the start of the scene and when the last clip finishes.
 * The default is the incoming end time of the last element of `clips`.
 * * `startWeight` - How much space to leave between `startFrom and the start of the first clip.
 * The space between each pair of adjacent clips is given a weight of 1.
 * The default is 0 space before the first clip.
 * * `endWeight` - How much space to leave between the end of the last clip and `endAt`.
 * The space between each pair of adjacent clips is given a weight of 1.
 * The default is 0 space after the last clip.
 * @returns `clips`, after the start times of the elements have been adjusted.
 */
export function distribute<
  T extends { startMsIntoScene: number; lengthMs: number },
>(
  clips: T[],
  options: {
    startFrom?: number;
    endAt?: number;
    startWeight?: number;
    endWeight?: number;
  },
): T[] {
  if (clips.length == 0) {
    return clips;
  }
  const startFrom = options.startFrom ?? clips[0].startMsIntoScene;
  const endAt =
    options.endAt ??
    (() => {
      const { startMsIntoScene, lengthMs } = clips.at(-1)!;
      return startMsIntoScene + lengthMs;
    })();
  const timeAvailable = endAt - startFrom;
  const timeUsed = sum(clips.map(({ lengthMs }) => lengthMs));
  const timeToDistribute = timeAvailable - timeUsed;
  if (timeToDistribute < 0) {
    throw new Error("wtf");
  }
  /**
   * Distribute the extra space evenly over this many spaces.
   *
   * Between each pair of clips is exactly one space.
   * Before the first clip and after the last, that's configurable.
   * By default they get 0 spaces.
   * They can request a non-integer amount of space.
   */
  let numberOfSpaces = clips.length - 1;
  let { startWeight, endWeight } = options;
  if (numberOfSpaces == 0) {
    // The default values for startWeight and endWeight are (conceptually) tiny positive numbers.
    // Most of the time this is so close to 0 that it just gets rounds off to 0.
    // But if everything else is 0, then all of the weight is given to the one of these that was undefined.
    // If they are both undefined, then the weight is split evenly between them.
    if (startWeight === undefined) {
      if (endWeight === undefined) {
        startWeight = 0.5;
        endWeight = 0.5;
      } else {
        if (endWeight == 0) {
          startWeight = 1;
        } else {
          startWeight = 0;
        }
      }
    } else {
      if (endWeight === undefined) {
        if (startWeight == 0) {
          endWeight = 1;
        } else {
          endWeight = 0;
        }
      }
    }
  } else {
    startWeight ??= 0;
    endWeight ??= 0;
  }
  if (startWeight < 0 || endWeight < 0) {
    throw new Error("wtf");
  }
  numberOfSpaces += startWeight + endWeight;
  if (numberOfSpaces <= 0) {
    throw new Error("wtf");
  }
  const msPerSpace = timeToDistribute / numberOfSpaces;
  let start = startFrom + startWeight * msPerSpace;
  clips.forEach((clip) => {
    clip.startMsIntoScene = start;
    start += clip.lengthMs + msPerSpace;
  });
  return clips;
}
