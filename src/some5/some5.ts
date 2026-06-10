import { MakeShowableInSeries, Showable } from "../showable";
import { makeShadowDemo, DEFAULT_SLIDE_DURATION_MS } from "../shadow-test";
import { myRainbow } from "../glib/my-rainbow";
import { buildComponents, componentRegistry } from "../slide-components";
import slide1 from "./slide1.json";
import { Font } from "../glib/letters-base";
import { ParagraphLayout } from "../glib/paragraph-layout";
import { makeLineFontRatio } from "../glib/line-font";
import { Point } from "../glib/path-shape";
import {  transform } from "../glib/transforms";

const colorfulBox: Showable = {
  description: "Colorful Box",
  duration: 0,
  show({ context }) {
    context.lineWidth = 0.1;
    context.lineCap = "square";
    context.strokeStyle = myRainbow.myBlue;
    context.beginPath();
    context.moveTo(-1, -1);
    context.lineTo(1, -1);
    context.stroke();
    context.strokeStyle = myRainbow.cssBlue;
    context.beginPath();
    context.moveTo(-1, -1);
    context.lineTo(-1, 1);
    context.stroke();
    context.strokeStyle = myRainbow.orange;
    context.beginPath();
    context.moveTo(-1, 1);
    context.lineTo(1, 1);
    context.stroke();
    context.strokeStyle = myRainbow.red;
    context.beginPath();
    context.moveTo(1, -1);
    context.lineTo(1, 1);
    context.stroke();
    context.strokeStyle = myRainbow.magenta;
    context.beginPath();
    context.moveTo(-1, 0);
    context.lineTo(1, 0);
    context.stroke();
    context.strokeStyle = myRainbow.violet;
    context.beginPath();
    context.moveTo(0, -1);
    context.lineTo(0, 1);
    context.stroke();
  },
};

componentRegistry.set("Colorful Box", () => colorfulBox);

function makeEmptySlide(description: string): Showable {
  return {
    description,
    duration: DEFAULT_SLIDE_DURATION_MS,
    components: [],
    show(options) {
      for (const child of this.components!) child.show(options);
    },
  };
}

const slideList = new MakeShowableInSeries("SoME5");

{
  const slide: Showable = {
    description: "Slide 1",
    duration: DEFAULT_SLIDE_DURATION_MS,
    components: buildComponents(slide1),
    show(options) {
      for (const child of this.components!) child.show(options);
    },
  };
  slideList.add(slide);
}

class MatrixLayout {
  /**
   * This matches the results of {@link formatNumber}().
   *
   * This can be a very tight bound.
   * In particular, the line width can make the values spill out.
   *
   * For simplicity this always leaves room for a minus sign on the left.
   * And we usually pad on the right with 0's.
   * So positive numbers will be tighter on the right than the left.
   */
  readonly numberWidth: number;
  /**
   * One row of text, height determined by the font.
   */
  readonly numberHeight: number;
  /**
   * Extra space to add between the rows in a matrix.
   *
   * The default spacing from the font, including {@link numberHeight}, is aimed at a paragraph.
   * This class draws text in approximate double space.
   * There should be about the same space between rows as between columns.
   */
  readonly betweenRows: number;
  /**
   * Extra space between each columns.
   *
   * This is relatives to {@link numberWidth}.
   * If this were 0, it's possible that things would be touching.
   */
  readonly betweenColumns: number;
  readonly betweenMatrices: number;
  /**
   * How much horizontal space to put between the vertical line of a matrix and the numbers inside that matrix.
   */
  private readonly margin: number;
  /**
   * The width of the top and bottom lines on the [ and ] that surround a matrix.
   */
  private readonly lipWidth: number;
  /**
   * The distance between the [ and ] of a 3 x 3 matrix.
   *
   * This does not include any padding.
   * If you put exactly this much space between two matrices, two closing and opening brackets would overlap.
   * It might look like this: "[ matrix I matrix ]"
   */
  private readonly squareMatrixWidth: number;
  /**
   * The distance between the [ and ] of a 3 x 1 matrix.
   *
   * This does not include any padding.
   * If you put exactly this much space between two matrices, two closing and opening brackets would overlap.
   * It might look like this: "[ matrix I matrix ]"
   */
  private readonly columnVectorWidth: number;
  /**
   *
   * @param font Everything resizes to match this font.
   * The line widths all come from this font.
   */
  constructor(readonly font: Font) {
    const layout = new ParagraphLayout(font);
    layout.addWord("-1.00");
    const laidOut = layout.align();
    this.numberWidth = laidOut.width;
    this.numberHeight = laidOut.height;
    this.betweenRows = this.numberHeight * (2 / 3);
    this.betweenColumns = this.numberWidth / 2;
    this.betweenMatrices = this.numberWidth;
    this.margin = this.betweenColumns;
    this.lipWidth = this.margin / 2;
    this.squareMatrixWidth =
      2 * this.margin + 2 * this.betweenColumns + 3 * this.numberWidth;
    this.columnVectorWidth = 2 * this.margin + this.numberWidth;
  }
  /**
   * Note:  The examples were chose to make them all fit in the same space.
   * @param x To format.
   * @returns A number in a standard format.
   * Keep this fixed so layout is simple.
   */
  formatNumber(x: number) {
    if (!isFinite(x)) {
      // It's tempting to throw an Error here.
      // If I really expected to see this I would try to center this and/or draw it in red ink.
      return "???";
    } else {
      return x.toFixed(2);
    }
  }
  /**
   * How far down from the top of the matrix to draw the contents of the nth row.
   * @param rowNumber 0 for the top row, 2 for the bottom row.
   */
  private rowTop(rowNumber: number) {
    // Currently there is no space added between the top of the top row of text and the top of the bracket.
    // The latter lines up perfectly with the top of the matrix.
    // I don't explicitly add any extra space above the top row, but the font naturally adds some space above all numbers.
    // Some characters, like [ and ], go above the numbers.
    // But I don't expect to see any of them in this context.
    return rowNumber * (this.betweenRows + this.numberHeight);
  }
  /**
   * Draw a single entry in a matrix.
   * @param matrixLeft All measurements are relative to this.
   * @param matrixTop All measurements are relative to this.
   * @param value To display.
   * Numbers are all formatted the same way to make them line up at the decimal point.
   * Strings are centered.
   * The bottom row uses strings like "0" and "1", instead of numbers, to avoid formatting.
   * NaN and ±Infinity make a simple attempt at an error message.
   * @param column 0 for the left column.
   * @param row 0 for the top, 2 for the bottom.
   * @param context Where to draw.
   */
  private strokeEntry(
    matrixLeft: number,
    matrixTop: number,
    value: number | string,
    column: number,
    row: number,
    context: CanvasRenderingContext2D,
  ) {
    const text: string =
      typeof value === "number" ? this.formatNumber(value) : value;
    const alignment = typeof value === "number" ? "right" : ("center" as const);
    const entryLeft =
      this.margin +
      matrixLeft +
      column * (this.betweenColumns + this.numberWidth);
    const entryTop = matrixTop + this.rowTop(row);
    // context.fillStyle = "pink";
    // context.fillRect(
    //   entryLeft,
    //   entryTop,
    //   layout.numberWidth,
    //   layout.numberHeight,
    // );
    context.stroke(
      ParagraphLayout.singlePathShape({
        font: this.font,
        text,
        alignment,
        width: this.numberWidth,
      }).translate(entryLeft, entryTop).canvasPath,
    );
  }
  draw3x3(
    left: number,
    top: number,
    matrix: DOMMatrixReadOnly,
    context: CanvasRenderingContext2D,
  ) {
    context.lineWidth = this.font.strokeWidth;
    context.strokeStyle = "black";
    context.lineCap = "square";
    context.lineJoin = "miter";
    const boxLeft = left;
    const boxRight = left + this.squareMatrixWidth;
    const boxTop = top;
    const boxBottom = top + 2 * this.betweenRows + 3 * this.numberHeight;
    context.beginPath();
    context.moveTo(boxLeft + this.lipWidth, boxTop);
    context.lineTo(boxLeft, boxTop);
    context.lineTo(boxLeft, boxBottom);
    context.lineTo(boxLeft + this.lipWidth, boxBottom);
    context.moveTo(boxRight - this.lipWidth, boxTop);
    context.lineTo(boxRight, boxTop);
    context.lineTo(boxRight, boxBottom);
    context.lineTo(boxRight - this.lipWidth, boxBottom);
    context.stroke();
    context.lineCap = "round";
    context.lineJoin = "round";
    this.strokeEntry(left, top, matrix.a, 0, 0, context);
    this.strokeEntry(left, top, matrix.c, 1, 0, context);
    this.strokeEntry(left, top, matrix.e, 2, 0, context);
    this.strokeEntry(left, top, matrix.b, 0, 1, context);
    this.strokeEntry(left, top, matrix.d, 1, 1, context);
    this.strokeEntry(left, top, matrix.f, 2, 1, context);
    // Remember that we are using the halftone shadow.
    // That is sensitive to alpha.
    // Partially transparent black looks a lot like gray at first, but the shadow will be lighter.
    context.strokeStyle = "rgba(0, 0, 0, 0.4)";
    this.strokeEntry(left, top, "0", 0, 2, context);
    this.strokeEntry(left, top, "0", 1, 2, context);
    this.strokeEntry(left, top, "1", 2, 2, context);
  }
  draw3x1(
    left: number,
    top: number,
    point: Point,
    context: CanvasRenderingContext2D,
  ) {
    context.lineWidth = this.font.strokeWidth;
    context.strokeStyle = "black";
    context.lineCap = "square";
    context.lineJoin = "miter";
    const boxLeft = left;
    const boxRight = left + this.columnVectorWidth;
    const boxTop = top;
    const boxBottom = top + 2 * this.betweenRows + 3 * this.numberHeight;
    context.beginPath();
    context.moveTo(boxLeft + this.lipWidth, boxTop);
    context.lineTo(boxLeft, boxTop);
    context.lineTo(boxLeft, boxBottom);
    context.lineTo(boxLeft + this.lipWidth, boxBottom);
    context.moveTo(boxRight - this.lipWidth, boxTop);
    context.lineTo(boxRight, boxTop);
    context.lineTo(boxRight, boxBottom);
    context.lineTo(boxRight - this.lipWidth, boxBottom);
    context.stroke();
    context.lineCap = "round";
    context.lineJoin = "round";
    this.strokeEntry(left, top, point.x, 0, 0, context);
    this.strokeEntry(left, top, point.y, 0, 1, context);
    context.strokeStyle = "rgba(0, 0, 0, 0.4)";
    this.strokeEntry(left, top, "1", 0, 2, context);
  }
  show(
    left: number,
    top: number,
    items: (DOMMatrixReadOnly | Point | "×" | "=")[],
    context: CanvasRenderingContext2D,
  ) {
    /**
     * This will start at `left` and it will update `left` based on the width of what we just drew.
     * This does not add any blank space.
     * @param text To display
     */
    const strokeText = (text: string) => {
      context.lineWidth = this.font.strokeWidth;
      context.strokeStyle = "black";
      // Assume text is one line tall, for simplicity.
      const textTop = top + this.rowTop(1);
      const layout = new ParagraphLayout(this.font);
      layout.addText(text);
      const laidOut = layout.align();
      context.stroke(
        laidOut.singlePathShape().translate(left, textTop).canvasPath,
      );
      left += laidOut.width;
    };
    items.forEach((item) => {
      if (item instanceof DOMMatrixReadOnly) {
        this.draw3x3(left, top, item, context);
        left += this.squareMatrixWidth;
      } else if (typeof item === "string") {
        strokeText(item);
      } else {
        this.draw3x1(left, top, item, context);
        left += this.columnVectorWidth;
      }
      left += this.betweenColumns;
    });
  }
}

const matrixLayout = new MatrixLayout(makeLineFontRatio(1 / 3, 1.2));

{
  const baseTransform = "translate(2px,2px)"
  const slide: Showable = {
    description: "Slide 2",
    duration: DEFAULT_SLIDE_DURATION_MS,
    components: [],
    show(options) {
      for (const child of this.components!) child.show(options);
      // matrixLayout.draw3x3(0.25, 5, new DOMMatrix(), options.context);
      // matrixLayout.draw3x1(5.75, 5, { x: -2, y: -3 }, options.context);
      const {timeInMs,context}=options;
      const originalPoint : Point = {x: -1, y:-1};
      const progress = timeInMs / this.duration;
      const angle = progress * 360;
      const transformString = `rotate(${angle.toFixed(2)}deg)`
      const matrix = new DOMMatrixReadOnly(transformString);
      const transformedPoint = transform(originalPoint.x, originalPoint.y, matrix)
      const originalTransform = context.getTransform();
      matrixLayout.show(
        0.25,
        5,
        [matrix, "×", originalPoint, "=", transformedPoint],
        options.context,
      );
    },
  };
  slideList.add(slide);
}

for (let i = 3; i <= 10; i++) {
  slideList.add(makeEmptySlide(`Slide ${i}`));
}

export const some5 = makeShadowDemo({
  base: slideList.build(),
  background: "white",
  dotColor: "#ddd",
  dx: 0.2,
  dy: 0.2,
});
