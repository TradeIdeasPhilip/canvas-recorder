import { MakeShowableInSeries, Showable } from "../showable";
import { makeShadowDemo, DEFAULT_SLIDE_DURATION_MS } from "../shadow-test";
import { myRainbow } from "../glib/my-rainbow";
import { buildComponents, TextComponent } from "../slide-components";
import slide1 from "./slide1.json";
import { Font } from "../glib/letters-base";
import { ParagraphLayout } from "../glib/paragraph-layout";
import { makeLineFontRatio } from "../glib/line-font";
import { Point } from "../glib/path-shape";
import { applyTransform, transform } from "../glib/transforms";
import { ReadOnlyRect } from "phil-lib/misc";

function showColorfulBox(context: CanvasRenderingContext2D, lineWidth: number) {
  context.lineWidth = lineWidth;
  context.lineCap = "square";
  context.strokeStyle = myRainbow.violet;
  context.beginPath();
  context.moveTo(-1, -1);
  context.lineTo(1, -1);
  context.stroke();
  context.strokeStyle = myRainbow.myBlue;
  context.beginPath();
  context.moveTo(-1, 1);
  context.lineTo(1, 1);
  context.stroke();
  context.lineCap = "butt";
  context.strokeStyle = myRainbow.red;
  context.beginPath();
  context.moveTo(-1, -1);
  context.lineTo(-1, 1);
  context.stroke();
  context.strokeStyle = myRainbow.yellow;
  context.beginPath();
  context.moveTo(1, -1);
  context.lineTo(1, 1);
  context.stroke();
  context.strokeStyle = myRainbow.cssBlue;
  context.beginPath();
  context.moveTo(-1, 0);
  context.lineTo(1, 0);
  context.stroke();
  context.strokeStyle = myRainbow.orange;
  context.beginPath();
  context.moveTo(0, -1);
  context.lineTo(0, 1);
  context.stroke();
}

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
  private readonly laidOutTimes: ReturnType<
    InstanceType<typeof ParagraphLayout>["align"]
  >;
  private readonly laidOutEquals: ReturnType<
    InstanceType<typeof ParagraphLayout>["align"]
  >;
  /**
   *
   * @param font Everything resizes to match this font.
   * The line widths all come from this font.
   */
  constructor(readonly font: Font) {
    {
      const layout = new ParagraphLayout(font);
      layout.addWord("-1.00");
      const laidOut = layout.align();
      this.numberWidth = laidOut.width;
      this.numberHeight = laidOut.height;
    }
    this.betweenRows = this.numberHeight * (2 / 3);
    this.betweenColumns = this.numberWidth / 2;
    this.margin = this.betweenColumns;
    this.lipWidth = this.margin / 2;
    this.squareMatrixWidth =
      2 * this.margin + 2 * this.betweenColumns + 3 * this.numberWidth;
    this.columnVectorWidth = 2 * this.margin + this.numberWidth;
    {
      const layout = new ParagraphLayout(font);
      layout.addText("×");
      this.laidOutTimes = layout.align();
    }
    {
      const layout = new ParagraphLayout(font);
      layout.addText("=");
      this.laidOutEquals = layout.align();
    }
    {
      const left1 =
        this.squareMatrixWidth +
        this.betweenColumns +
        this.laidOutTimes.width +
        this.betweenColumns;
      const left2 =
        left1 +
        this.columnVectorWidth +
        this.betweenColumns +
        this.laidOutEquals.width +
        this.betweenColumns;
      const right = left2 + this.columnVectorWidth;
      this.layout311 = {
        total: {
          height: 2 * this.betweenRows + 3 * this.numberHeight,
          width: right,
        },
        transform: { left: 0, width: this.squareMatrixWidth },
        from: {
          left: left1,
          width: this.columnVectorWidth,
        },
        to: { left: left2, width: this.columnVectorWidth },
      };
    }
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
    color: string,
    context: CanvasRenderingContext2D,
  ) {
    context.lineWidth = this.font.strokeWidth;
    context.strokeStyle = color;
    context.lineCap = "square";
    context.lineJoin = "miter";
    const boxLeft = left;
    const boxRight = left + this.squareMatrixWidth;
    const boxTop = top;
    const boxBottom = top + this.layout311.total.height;
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
    color: string,
    context: CanvasRenderingContext2D,
  ) {
    context.lineWidth = this.font.strokeWidth;
    context.strokeStyle = color;
    context.lineCap = "square";
    context.lineJoin = "miter";
    const boxLeft = left;
    const boxRight = left + this.columnVectorWidth;
    const boxTop = top;
    const boxBottom = top + this.layout311.total.height;
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
        this.draw3x3(left, top, item, MatrixLayout.GREEN, context);
        left += this.squareMatrixWidth;
      } else if (typeof item === "string") {
        strokeText(item);
      } else {
        this.draw3x1(left, top, item, MatrixLayout.CYAN, context);
        left += this.columnVectorWidth;
      }
      left += this.betweenColumns;
    });
  }
  static readonly CYAN = "rgb(0%, 75%, 75%)";
  static readonly GREEN = "rgb(0%, 75%, 0%)";
  static readonly MAGENTA = myRainbow.magenta;
  /**
   * Draw three matrices for `transform` × `from` = `to`.
   * @param left The left side of the entire equation.
   * @param top The top of the entire equation.
   * @param transform The first matrix, a 3x3 transform
   * @param from The second matrix, a column vector representing an input point.
   * @param to The third matrix, a column vector representing `transform` × `from`.
   * @param context Draw here.
   */
  show311(
    left: number,
    top: number,
    transform: DOMMatrixReadOnly,
    from: Point,
    to: Point,
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
    this.draw3x3(left, top, transform, MatrixLayout.MAGENTA, context);
    left += this.squareMatrixWidth;
    left += this.betweenColumns;
    strokeText("×");
    left += this.betweenColumns;
    this.draw3x1(left, top, from, MatrixLayout.CYAN, context);
    left += this.betweenColumns;
    left += this.columnVectorWidth;
    strokeText("=");
    left += this.betweenColumns;
    this.draw3x1(left, top, to, MatrixLayout.GREEN, context);
    left += this.columnVectorWidth;
  }
  readonly layout311: {
    readonly total: { readonly width: number; readonly height: number };
    readonly transform: { readonly left: number; readonly width: number };
    readonly from: { readonly left: number; readonly width: number };
    readonly to: { readonly left: number; readonly width: number };
  };
}

const matrixLayout = new MatrixLayout(makeLineFontRatio(1 / 4, 1.2));

{
  const textForTransform = new TextComponent();
  textForTransform.rectSchedule.set({ x: 0.5, y: 0.25, width: 15, height: 0 });
  textForTransform.alignmentSchedule.set("center");
  textForTransform.colorSchedule.set(myRainbow.magenta);
  textForTransform.sizeSchedule.set(1 / 3);
  console.log(textForTransform);
  const slide: Showable = {
    description: "Slide 2",
    duration: DEFAULT_SLIDE_DURATION_MS,
    components: [],
    show(options) {
      const GRID_CYAN = "rgba(0%, 80%, 80%, 50%)";
      const GRID_YELLOW = "rgba(80%, 80%, 0%, 0.5)";
      const GRID_GREEN = "rgba(0%, 80%, 0%, 50%)";
      const drawGrid = (cover: ReadOnlyRect, color: string) => {
        function values(from: number, distance: number) {
          const exclusionZone = 0.05;
          const result: number[] = [];
          for (
            let value = Math.ceil((from + exclusionZone) * 2) / 2;
            value + exclusionZone < from + distance;
            value += 0.5
          ) {
            result.push(value);
          }
          return result;
        }
        function prepare(value: number) {
          if (value == Math.floor(value)) {
            context.setLineDash([]);
          } else {
            context.setLineDash([0.02]);
          }
          if (value == 0) {
            context.lineWidth = 0.02;
          } else {
            context.lineWidth = 0.01;
          }
        }
        context.strokeStyle = color;
        context.lineCap = "butt";
        values(cover.x, cover.width).forEach((x) => {
          prepare(x);
          context.beginPath();
          context.moveTo(x, cover.y);
          context.lineTo(x, cover.y + cover.height);
          context.stroke();
        });
        values(cover.y, cover.height).forEach((y) => {
          prepare(y);
          context.beginPath();
          context.moveTo(cover.x, y);
          context.lineTo(cover.x + cover.width, y);
          context.stroke();
        });
        context.setLineDash([]);
      };
      for (const child of this.components!) child.show(options);
      const { timeInMs, context } = options;
      const originalPoint: Point = { x: -1, y: -1 };
      const progress = timeInMs / this.duration;
      const angle = progress * 360;
      const transformString = `rotate(${angle.toFixed(2)}deg)`;
      const matrix = new DOMMatrixReadOnly(transformString);
      const transformedPoint = transform(
        originalPoint.x,
        originalPoint.y,
        matrix,
      );
      matrixLayout.show311(
        (16 - matrixLayout.layout311.total.width) / 2,
        8.75 - matrixLayout.layout311.total.height,
        matrix,
        originalPoint,
        transformedPoint,
        options.context,
      );
      const originalTransform = context.getTransform();
      context.translate(4, 3.75);
      drawGrid({ x: -3.5, y: -2.5, width: 7, height: 5 }, GRID_CYAN);
      context.lineWidth = 0.25;
      showColorfulBox(context, 0.25);
      context.setTransform(originalTransform);
      context.translate(12, 3.75);
      drawGrid({ x: -3.5, y: -2.5, width: 7, height: 5 }, GRID_GREEN);
      context.lineWidth = 0.25;
      applyTransform(context, matrix);
      showColorfulBox(context, 0.25);
      context.setTransform(originalTransform);
      textForTransform.textSchedule.set(transformString);
      textForTransform.show(options);
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
