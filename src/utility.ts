import { Showable } from "./showable";

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
