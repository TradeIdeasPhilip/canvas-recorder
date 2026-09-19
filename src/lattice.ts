import { LinearFunction, makeLinear, ReadOnlyRect } from "phil-lib/misc";
import { Point } from "./glib/path-shape";

/**
 * A grid of cells covering a rectangular area.
 *
 * This is the plain-data form.  It is what lives in a keyframe and what gets
 * written to a JSON file, analogous to `ReadOnlyRect`.
 * Wrap it in a {@link Lattice} to ask anything about the resulting layout.
 */
export type LatticeValue = {
  /** Left edge of the area we are trying to cover. */
  x: number;
  /** Top edge of the area we are trying to cover. */
  y: number;
  /** Width of the area we are trying to cover. */
  width: number;
  /** Height of the area we are trying to cover. */
  height: number;
  /** Width of a single cell. */
  cellWidth: number;
  /** Height of a single cell. */
  cellHeight: number;
};

/**
 * Never report more than this many rows or columns.
 *
 * A cell size approaching 0 would otherwise ask for 1/epsilon cells, and
 * something has to draw all of them.
 */
const MAX_COUNT = 100;

/**
 * How many cells fit along one axis.
 *
 * A cell size of 0 means *one* cell rather than infinitely many.  That is
 * arbitrary, but it keeps the Visual Editor well behaved as the user drags the
 * cell-size control point all the way down to nothing.
 */
function countCells(total: number, cell: number): number {
  if (!(cell > 0)) {
    return 1;
  }
  return Math.max(0, Math.min(MAX_COUNT, Math.floor(total / cell)));
}

/**
 * Maps a cell index to the center of that cell along one axis.
 *
 * The first and last cells sit flush against the ends of the covered area and
 * any slack is spread evenly between each adjacent pair.  With fewer than two
 * cells there is no second position to interpolate toward, so the single cell
 * sits flush against the start.  That also keeps the layout from jumping as the
 * count crosses between 0, 1 and 2.
 */
function makeCenterFunction(
  start: number,
  total: number,
  cell: number,
  count: number,
): LinearFunction {
  if (count < 2) {
    const only = start + cell / 2;
    return () => only;
  }
  return makeLinear(0, start + cell / 2, count - 1, start + total - cell / 2);
}

/**
 * The layout described by a {@link LatticeValue}.
 *
 * Construct one of these, then ask it where the cells are.
 */
export class Lattice {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  /** How many cells fit across.  Never negative, never more than 100. */
  readonly columnCount: number;
  /** How many cells fit down.  Never negative, never more than 100. */
  readonly rowCount: number;
  readonly #centerX: LinearFunction;
  readonly #centerY: LinearFunction;

  /**
   * @param value The area to cover and the cell size.  The six numbers are
   * copied out, so later changes to `value` do not affect this object.
   */
  constructor(value: LatticeValue) {
    this.x = value.x;
    this.y = value.y;
    this.width = value.width;
    this.height = value.height;
    this.cellWidth = value.cellWidth;
    this.cellHeight = value.cellHeight;
    this.columnCount = countCells(this.width, this.cellWidth);
    this.rowCount = countCells(this.height, this.cellHeight);
    this.#centerX = makeCenterFunction(
      this.x,
      this.width,
      this.cellWidth,
      this.columnCount,
    );
    this.#centerY = makeCenterFunction(
      this.y,
      this.height,
      this.cellHeight,
      this.rowCount,
    );
  }

  /**
   * The center of the cell at the given column and row.
   *
   * Fractions and out of bounds indices are fine; they extrapolate along the
   * same line as the real cells.
   */
  centerOf(column: number, row: number): Point {
    return { x: this.#centerX(column), y: this.#centerY(row) };
  }

  /**
   * The bounding box of the cell at the given column and row.
   *
   * Fractions and out of bounds indices are fine; see {@link centerOf}().
   */
  cellRect(column: number, row: number): ReadOnlyRect {
    return {
      x: this.#centerX(column) - this.cellWidth / 2,
      y: this.#centerY(row) - this.cellHeight / 2,
      width: this.cellWidth,
      height: this.cellHeight,
    };
  }

  /**
   * Every cell, in English reading order: left to right, then down a row.
   *
   * This is a standard iterator, so `forEach()`, `toArray()`, `map()` and the
   * rest of the iterator helpers all work on the result.
   */
  *cells(): Generator<{
    rect: ReadOnlyRect;
    row: number;
    column: number;
  }> {
    for (let row = 0; row < this.rowCount; row++) {
      for (let column = 0; column < this.columnCount; column++) {
        yield { rect: this.cellRect(column, row), row, column };
      }
    }
  }
}
