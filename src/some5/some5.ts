import { lerp, ReadOnlyRect } from "phil-lib/misc";
import { Font } from "../glib/letters-base";
import { makeLineFontRatio } from "../glib/line-font";
import { myRainbow } from "../glib/my-rainbow";
import { ParagraphLayout } from "../glib/paragraph-layout";
import { Point } from "../glib/path-shape";
import { applyTransform, transform } from "../glib/transforms";
import {
  durationKeyframes,
  ease,
  easeIn,
  easeOut,
  interpolateNumbers,
  Keyframe,
} from "../interpolate";
import {
  NumberDurationScheduleInfo,
  NumberScheduleInfo,
} from "../schedule-helper";
import { DEFAULT_SLIDE_DURATION_MS, makeShadowDemo } from "../shadow-test";
import { MakeShowableInSeries, Showable, ShowOptions } from "../showable";
import {
  buildComponents,
  MultiTextComponent,
  TextComponent,
  TextFormatComponent,
  TextSpanComponent,
} from "../slide-components";
import slide1 from "./slide1.json";

const paddedEaseSubSchedule: readonly Keyframe<number>[] = [
  { time: 0.15, value: 0, easeAfter: ease },
  { time: 0.85, value: 1 },
];
/**
 * Hold the initial position (0) for a short time (15% of the total).
 * Then use the normal {@link ease}() to move to the final state.
 * Hold the final state(1) for a short time (15% of the total).
 * @param progress A number from 0 to 1
 * @returns A number from 0 to 1
 */
function paddedEase(progress: number) {
  return interpolateNumbers(progress, paddedEaseSubSchedule);
}

class WinkingFace {
  /**
   * A big circle with a hole where the mouth goes.
   */
  readonly #backgroundYellow: Path2D;
  /**
   * Stroke in black.
   */
  readonly #faceStrokes: Path2D;
  /**
   * Fill in black.
   */
  readonly #leftEye: Path2D;
  private constructor() {
    const transform = new DOMMatrixReadOnly(
      "translate(-1px, -1px) scale(0.02)",
    );
    function fit(initial: string) {
      const initialPath = new Path2D(initial);
      const result = new Path2D();
      result.addPath(initialPath, transform);
      return result;
    }
    this.#backgroundYellow = fit(
      "M0 49.906A49.8 49.8 0 0 1 49.906 0a49.8 49.8 0 0 1 49.906 49.906 49.8 49.8 0 0 1-49.906 49.906A49.8 49.8 0 0 1 0 49.906z M54.6 81.204l6.298-2.804 2.438-3.006.667-3.333-7.708.094H35.527l2.737 6.267 6.583 2.804z",
    );
    this.#faceStrokes = fit(
      "M17.923 37.406c.844-3.128 2.819-5.832 5.542-7.587 2.538-2.042 5.747-3.063 8.998-2.865m48.679 12.681c-4.708-4.658-11.931-5.652-17.708-2.437m.625 33.021c0 6.119-4.808 10.983-14.446 10.983s-14.508-4.879-14.508-10.983m.092 0s14.681 5.25 28.646.113m8.988-20.75c-1.673-.979-3.683-1.885-5.979-1.923-2.323-.038-4.41.625-6.625 1.615 M2.169 49.871c0-26.447 21.291-47.737 47.738-47.737s47.738 21.291 47.738 47.738-21.291 47.737-47.737 47.737S2.169 76.317 2.169 49.871z",
    );
    this.#leftEye = fit(
      "M28.079 48.431c0-2.95 2.375-5.325 5.325-5.325s5.325 2.375 5.325 5.325-2.375 5.325-5.325 5.325-5.325-2.375-5.325-5.325z",
    );
  }
  static readonly #instance = new WinkingFace();
  /**
   * A sample made to demonstrate transforms.
   * @param context Where to draw
   * @param transform By default the box is centered on (0, 0), with a hole punched in the top left corder, (-1, -1).
   */
  static draw(
    // Adapted from https://openmoji.org/,
    // https://vecta.io/symbols/190/smileys-emotion-face-smiling/8/winking-face
    context: CanvasRenderingContext2D,
    transform?: DOMMatrixReadOnly,
  ) {
    if (transform) {
      context.save();
      applyTransform(context, transform);
    }
    context.fillStyle = "#fcea2b";
    context.fill(WinkingFace.#instance.#backgroundYellow, "evenodd");
    context.lineWidth = 0.08334;
    context.strokeStyle = "#000";
    context.lineCap = "round";
    context.stroke(WinkingFace.#instance.#faceStrokes);
    context.fillStyle = "#000";
    context.fill(WinkingFace.#instance.#leftEye);
    if (transform) {
      context.restore();
    }
  }
}

/**
 * A sample made to demonstrate transforms.
 * @param context Where to draw
 * @param transform By default the box is centered on (0, 0), with a hole punched in the top left corder, (-1, -1).
 */
function showColorfulBox(
  context: CanvasRenderingContext2D,
  transform?: DOMMatrixReadOnly,
) {
  const lineWidth = 0.25;
  context.save();
  if (transform) {
    applyTransform(context, transform);
  }
  context.beginPath();
  context.rect(-2, -2, 4, 4);
  context.arc(-1, -1, lineWidth / 2.4, 0, Math.PI * 2);
  context.clip("evenodd");
  context.lineWidth = lineWidth;
  context.lineCap = "square";
  context.strokeStyle = "#5800ff";
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
  context.strokeStyle = myRainbow.orange;
  context.beginPath();
  context.moveTo(1, -1);
  context.lineTo(1, 1);
  context.stroke();
  context.strokeStyle = myRainbow.cssBlue;
  context.beginPath();
  context.moveTo(-1, 0);
  context.lineTo(1, 0);
  context.stroke();
  context.strokeStyle = "rgb(255, 85, 0)";
  context.beginPath();
  context.moveTo(0, -1);
  context.lineTo(0, 1);
  context.stroke();
  context.restore();
}

function makeEmptySlide(description: string): Showable {
  return {
    description,
    duration: DEFAULT_SLIDE_DURATION_MS,
    /**
     * All of these are configurable, mostly for prototypes.
     * This tells the Visual Editor that we can add things.
     */
    components: [],
    show(options) {
      for (const child of this.components!) child.show(options);
    },
  };
}

const slideList = new MakeShowableInSeries("SoME5");

// MARK: Slide 1
{
  /**
   * Examples of transforms applied to text.
   * 5 versions of "hello word" in different languages.
   */
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

/**
 * This draws matrices and related symbols.
 *
 * The size and shape are predetermined.
 * As you change the numbers, nothing should jump around.
 */
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
   * Extra space between each column in the matrix.
   * This is also used between a matrix and a ⨉ or =.
   *
   * This automatically adjusts to {@link numberWidth}.
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
  /**
   * The ⨉ sign.
   *
   * Do this up front so we can easily reserve space.
   */
  private readonly laidOutTimes: ReturnType<
    InstanceType<typeof ParagraphLayout>["align"]
  >;
  /**
   * The = sign.
   *
   * Do this up front so we can easily reserve space.
   */
  private readonly laidOutEquals: ReturnType<
    InstanceType<typeof ParagraphLayout>["align"]
  >;
  private readonly pointContentWidth: number;
  private readonly pointWidth: number;
  /**
   *
   * @param font Everything resizes to match this font.
   * The line widths all come from this font.
   */
  constructor(readonly font: Font) {
    {
      /**
       * A sample so that we can reserve space.
       */
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
      const layout = new ParagraphLayout(font);
      layout.addText("x\ny\n1");
      this.pointContentWidth = layout.align().width;
    }
    this.pointWidth = 2 * this.margin + this.pointContentWidth;
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
    this.layout331 = {
      total: {
        height: this.layout311.total.height,
        width:
          2 * this.squareMatrixWidth +
          2 * this.laidOutTimes.width +
          4 * this.betweenColumns +
          this.pointWidth,
      },
      leftTransform: { left: 0, width: this.squareMatrixWidth },
      rightTransform: {
        left: this.layout311.from.left,
        width: this.squareMatrixWidth,
      },
    };
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
  drawPoint(
    left: number,
    top: number,
    color: string,
    context: CanvasRenderingContext2D,
  ) {
    context.lineWidth = this.font.strokeWidth;
    context.strokeStyle = color;
    context.lineCap = "square";
    context.lineJoin = "miter";
    const boxLeft = left;
    const boxRight = left + this.pointWidth;
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
    const textLeft = left + this.margin;
    ["x", "y", "1"].forEach((text, rowIndex) => {
      if (rowIndex == 2) {
        context.strokeStyle = "rgba(0, 0, 0, 0.4)";
      }
      const entryTop = top + this.rowTop(rowIndex);
      context.stroke(
        ParagraphLayout.singlePathShape({
          font: this.font,
          text,
          alignment: "center",
          width: this.pointContentWidth,
        }).translate(textLeft, entryTop).canvasPath,
      );
    });
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
  /**
   * For use with {@link show}().
   * This will draw a column vector with "x", "y", and "1".
   * This is thinner than a column vector with actual numbers in it.
   */
  static readonly POINT = Symbol("Point");
  /**
   * Draw matrices and related symbols.
   *
   * See {@link show311}() for an alternative.
   * @param left
   * @param top
   * @param items A list of things to draw all side by side.
   * @param context
   */
  show(
    left: number,
    top: number,
    items: (
      | DOMMatrixReadOnly
      | Point
      | "×"
      | "="
      | typeof MatrixLayout.POINT
    )[],
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
      } else if (item === MatrixLayout.POINT) {
        this.drawPoint(left, top, "black", context);
        left += this.pointWidth;
      } else {
        this.draw3x1(left, top, item, MatrixLayout.CYAN, context);
        left += this.columnVectorWidth;
      }
      left += this.betweenColumns;
    });
  }
  /**
   * Very similar to the cyan grid lines in one of the charts.
   *
   * This is fully opaque.
   * The grid lines are not.
   * The result is similar, but this casts a stronger shadow.
   */
  static readonly CYAN = "rgb(0%, 75%, 75%)";
  /**
   * Very similar to the green grid lines in one of the charts.
   *
   * This is fully opaque.
   * The grid lines are not.
   * The result is similar, but this casts a stronger shadow.
   */
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
  /**
   * This describes the layout associated with {@link show311}().
   *
   * `left` here is relative to the `left` parameter of {@link show311}().
   */
  readonly layout311: {
    readonly total: { readonly width: number; readonly height: number };
    readonly transform: { readonly left: number; readonly width: number };
    readonly from: { readonly left: number; readonly width: number };
    readonly to: { readonly left: number; readonly width: number };
  };
  show331(
    left: number,
    top: number,
    leftTransform: DOMMatrixReadOnly,
    leftTransformColor: string,
    leftTransformAlpha: number,
    rightTransform: DOMMatrixReadOnly,
    rightTransformColor: string,
    rightTransformAlpha: number,
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
    context.globalAlpha = leftTransformAlpha;
    this.draw3x3(left, top, leftTransform, leftTransformColor, context);
    left += this.squareMatrixWidth;
    left += this.betweenColumns;
    strokeText("×");
    left += this.betweenColumns;
    context.globalAlpha = rightTransformAlpha;
    this.draw3x3(left, top, rightTransform, rightTransformColor, context);
    left += this.squareMatrixWidth;
    left += this.betweenColumns;
    strokeText("×");
    left += this.betweenColumns;
    context.globalAlpha = 1;
    this.drawPoint(left, top, "black", context);
  }
  readonly layout331: {
    readonly total: { readonly width: number; readonly height: number };
    readonly leftTransform: { readonly left: number; readonly width: number };
    readonly rightTransform: { readonly left: number; readonly width: number };
  };
}

/**
 * Draw a grid.
 *
 * This uses the preexisting coordinate system.
 * Typically the caller will translate the coordinate system before calling this and the things on top of the grid.
 * @param cover What area to cover.
 * Draw lines within this rectangle.
 * The darkest lines are drawn at x=0 and y=0.
 * Medium lines are drawn at the other integer locations.
 * Dotted lines are drawn at integer + 1/2 locations.
 * @param color To match the color of the corresponding matrix.
 * @param context Where to draw.
 */
function drawGrid(
  cover: ReadOnlyRect,
  color: string,
  context: CanvasRenderingContext2D,
) {
  /**
   * This describes grid lines.
   * It works for horizontal and vertical lines.
   * @param from Start the grid here.
   * @param distance End the grid here.
   * @returns A list of places to draw the lines.
   */
  function values(from: number, distance: number) {
    /**
     * The result should look like a tic tac toe board, where the outside cells are not closed.
     * If you try to draw a line right at the edge, it will be removed.
     * If you try to draw a line too close to the edge, it will be removed.
     * This says how close we can get to the edge.
     */
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
  /**
   * Set the line width and dash associates with a line.
   * @param value An output from {@link values}().
   */
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
}

/**
 * Top is a string version of the transform.
 * Left is the untransformed shape.
 * Right is the transformed shape.
 * Bottom is an equation with matrices.
 */
class BeforeAndAfter implements Showable {
  private static readonly matrixLayout = new MatrixLayout(
    makeLineFontRatio(1 / 4, 1.2),
  );
  static readonly GRID_CYAN = "rgba(0%, 80%, 80%, 50%)";
  static readonly GRID_YELLOW = "rgba(80%, 80%, 0%, 0.5)";
  static readonly GRID_GREEN = "rgba(0%, 80%, 0%, 50%)";
  readonly duration = 20_000;
  readonly components: Showable[] = [];
  readonly textForTransform = new TextComponent();
  readonly originalPoint: Point;
  /**
   *
   * @param description This is used when saving to the database and it is display in the menu.
   * @param rightMostTransform This is applied directly to the sample image.
   * The default leaves the image centered on the origin with a side length of 2.
   */
  constructor(
    public readonly description: string,
    private readonly rightMostTransform: DOMMatrixReadOnly = new DOMMatrixReadOnly(),
  ) {
    this.textForTransform.rectSchedule.set({
      x: 0.5,
      y: 0.25,
      width: 15,
      height: 0,
    });
    this.textForTransform.alignmentSchedule.set("center");
    this.textForTransform.colorSchedule.set(myRainbow.magenta);
    this.textForTransform.sizeSchedule.set(1 / 3);
    this.originalPoint = transform(-1, -1, rightMostTransform);
  }
  /**
   * This runs the animation.
   * This says how the right side (the transformed example) will different from the left side (the original example).
   *
   * Everything is rounded to two digits.
   * Normally I leave all of the digits.
   * But we are displaying this string on the screen, so it needs to look good.
   * The animation is close enough, so I use the user friendly string in both places.
   * @param progress 0 to 1
   * @returns A valid CSS transform string.
   */
  makeTransformString(progress: number): string {
    const angle = paddedEase(progress) * 360;
    return `rotate(${angle.toFixed(2)}deg)`;
  }
  show(options: ShowOptions) {
    for (const child of this.components!) child.show(options);
    const { timeInMs, context } = options;
    const globalProgress = (timeInMs / this.duration) * 2;
    const [progress, drawSample] =
      globalProgress < 1
        ? [globalProgress, WinkingFace.draw]
        : [globalProgress - 1, showColorfulBox];
    const transformString = this.makeTransformString(progress);
    const matrix = new DOMMatrixReadOnly(transformString);
    const transformedPoint = transform(
      this.originalPoint.x,
      this.originalPoint.y,
      matrix,
    );
    BeforeAndAfter.matrixLayout.show311(
      (16 - BeforeAndAfter.matrixLayout.layout311.total.width) / 2,
      8.75 - BeforeAndAfter.matrixLayout.layout311.total.height,
      matrix,
      this.originalPoint,
      transformedPoint,
      options.context,
    );
    const originalTransform = context.getTransform();
    context.translate(4, 3.75);
    drawGrid(
      { x: -3.5, y: -2.5, width: 7, height: 5 },
      BeforeAndAfter.GRID_CYAN,
      context,
    );
    context.lineWidth = 0.25;
    drawSample(context, this.rightMostTransform);
    context.setTransform(originalTransform);
    context.translate(12, 3.75);
    drawGrid(
      { x: -3.5, y: -2.5, width: 7, height: 5 },
      BeforeAndAfter.GRID_GREEN,
      context,
    );
    applyTransform(context, matrix);
    drawSample(context, this.rightMostTransform);
    context.setTransform(originalTransform);
    this.textForTransform.textSchedule.set(transformString);
    this.textForTransform.show(options);
  }
}

// MARK: Slide 2
{
  const slide = new BeforeAndAfter("Slide 2");
  slideList.add(slide);
}

// MARK: Slide 3
{
  const angleSchedule = new NumberScheduleInfo("Angle", [
    { time: 0, value: 0, easeAfter: paddedEase },
    { time: 0.25, value: 30, easeAfter: paddedEase },
    { time: 0.75, value: -30, easeAfter: paddedEase },
    { time: 1, value: 0 },
  ]);
  const slide = new BeforeAndAfter("Slide 3");
  slide.makeTransformString = (progress: number): string => {
    const angle = angleSchedule.at(progress);
    return `skewY(${angle.toFixed(2)}deg)`;
  };
  slideList.add(slide);
}

// MARK: Slide 4
{
  const scaleSchedule = new NumberScheduleInfo("Scale X", [
    { time: 0, value: 1, easeAfter: paddedEase },
    { time: 0.25, value: -2, easeAfter: paddedEase },
    { time: 0.75, value: 2, easeAfter: paddedEase },
    { time: 1, value: 1 },
  ]);
  const slide = new BeforeAndAfter("Slide 4");
  slide.makeTransformString = (progress: number): string => {
    const scale = scaleSchedule.at(progress);
    return `scaleX(${scale.toFixed(2)})`;
  };
  slideList.add(slide);
}

// MARK: Slide 5
{
  const slide = new BeforeAndAfter(
    "Slide 5",
    new DOMMatrixReadOnly("translateX(1.5px)"),
  );
  slideList.add(slide);
}

// MARK: Slide 6
{
  const xCenter = 1.5;
  const schedule = new NumberDurationScheduleInfo("Transform", [
    { time: 1 / 3, value: 0, easeAfter: paddedEase },
    { time: 1 / 3, value: 1, easeAfter: paddedEase },
    { time: 1 / 3, value: 2, easeAfter: paddedEase },
  ]);
  const slide = new BeforeAndAfter(
    "Slide 6",
    new DOMMatrixReadOnly(`translateX(${xCenter}px)`),
  );
  slide.makeTransformString = (progress: number): string => {
    const fromSchedule = schedule.at(progress);
    switch (fromSchedule.value) {
      case 0: {
        const value = lerp(0, -xCenter, fromSchedule.progress);
        return `translateX(${value.toFixed(2)}px)`;
      }
      case 1: {
        const value = lerp(0, 135, fromSchedule.progress);
        return `rotate(${value.toFixed(2)}deg)   translateX(-1.50px)`;
      }
      case 2: {
        const value = lerp(0, xCenter, fromSchedule.progress);
        return `translateX(${value.toFixed(2)}px)   rotate(135.00deg)   translateX(-1.50px)`;
      }
      default: {
        throw new Error("wtf");
      }
    }
  };
  slideList.add(slide);
}

// MARK: ShowTwoTransforms

type SingleTransform = {
  /**
   * Something like "scale(2, 1)".
   * Something that could be used in `new Matrix(transformString)`.
   * A valid value for the CSS `transform` property.
   */
  readonly transformString: string;
  /**
   * My way of looking at the operation.
   * What does this transform do to an image?
   * Something like "makeWider" or "rotate".
   */
  readonly functionString: string;
  /**
   * Create a matrix that varies smoothly between the identity and the requested transform.
   * @param progress At 0 this should return the identity matrix.
   * At 1 this should return the matrix described in `transformString` and `functionString`.
   */
  getTransform(progress: number): DOMMatrixReadOnly;
  /**
   * Used the display the text.
   */
  readonly formatter: TextFormatComponent;
};

class ShowTwoTransforms {
  constructor(
    readonly left: SingleTransform,
    readonly right: SingleTransform,
    baseFormatter: TextFormatComponent,
    whereToDraw: "left" | "right",
    readonly matrixLayout: MatrixLayout,
    readonly duration: number,
  ) {
    this.xOffset = whereToDraw == "left" ? 0 : 8;
    this.textTop = new MultiTextComponent({
      position: { x: 4 + this.xOffset, y: 0.25 },
      width: 8,
      alignment: "center",
      additionalLineHeight: 0.3,
    });
    this.textTop.components.push(
      left.formatter,
      right.formatter,
      baseFormatter,
    );
    const leftFormatterName = left.formatter.nameScalar.value;
    const rightFormatterName = right.formatter.nameScalar.value;
    const baseFormatterName = baseFormatter.nameScalar.value;
    this.textTop
      .addText(leftFormatterName, `${left.transformString}   `)
      .addText(rightFormatterName, `${right.transformString}\n`)
      .addText(leftFormatterName, `${left.functionString}(`)
      .addText(rightFormatterName, `${right.functionString}(`)
      .addText(baseFormatterName, "x, y")
      .addText(rightFormatterName, ")")
      .addText(leftFormatterName, ")");
  }
  private readonly textTop: MultiTextComponent;
  private readonly xOffset: number;
  static #schedule: readonly Keyframe<{
    readonly activeMatrix: "left" | "right";
    readonly sample: (
      context: CanvasRenderingContext2D,
      transform?: DOMMatrixReadOnly | undefined,
    ) => void;
  }>[] = [
    {
      time: 1 / 4,
      value: { activeMatrix: "right", sample: WinkingFace.draw },
      easeAfter: ease,
    },
    {
      time: 1 / 4,
      value: { activeMatrix: "left", sample: WinkingFace.draw },
      easeAfter: ease,
    },
    {
      time: 1 / 4,
      value: { activeMatrix: "right", sample: showColorfulBox },
      easeAfter: ease,
    },
    {
      time: 1 / 4,
      value: { activeMatrix: "left", sample: showColorfulBox },
      easeAfter: ease,
    },
  ];
  show(options: ShowOptions) {
    const { context, timeInMs } = options;
    const globalProgress = durationKeyframes(
      timeInMs / this.duration,
      ShowTwoTransforms.#schedule,
    );
    const [leftProgress, rightProgress] =
      globalProgress.value.activeMatrix == "left"
        ? [globalProgress.progress, 1]
        : [0, globalProgress.progress];
    this.left.formatter.alphaSchedule.set(leftProgress);
    this.right.formatter.alphaSchedule.set(rightProgress);
    this.textTop.show(options);
    const matrixLayout = this.matrixLayout;
    matrixLayout.show331(
      (8 - matrixLayout.layout331.total.width) / 2 + this.xOffset,
      8.75 - matrixLayout.layout311.total.height,
      this.left.getTransform(1),
      this.left.formatter.colorSchedule.at(timeInMs),
      leftProgress,
      this.right.getTransform(1),
      this.right.formatter.colorSchedule.at(timeInMs),
      rightProgress,
      context,
    );
    const originalTransform = context.getTransform();
    context.translate(4 + this.xOffset, 4.5);
    context.scale(7 / 9, 7 / 9);
    drawGrid(
      { x: -4.5, y: -3, width: 9, height: 6 },
      "rgba(80%, 0%, 80%, 50%)",
      context,
    );
    applyTransform(
      context,
      this.left
        .getTransform(leftProgress)
        .multiply(this.right.getTransform(rightProgress)),
    );
    globalProgress.value.sample(context);
    context.setTransform(originalTransform);
    const sample =
      globalProgress.value.sample == WinkingFace.draw
        ? "wink"
        : globalProgress.value.sample == showColorfulBox
          ? "box"
          : ("unknown" as const);
    return { leftProgress, rightProgress, sample } as const;
  }
}

/** One of the two transforms passed to {@link SwapTransformOrder}. Color is supplied here; the formatter is created internally. */
type SwapTransformSpec = Omit<SingleTransform, "formatter"> & {
  readonly color: string;
};

/**
 * This animation shows what happens when you want to apply two different transforms, but in a different order.
 * E.g. `new DOMMatrix("rotate(45deg) scale(2, 1)")` vs `new DOMMatrix("scale(2, 1) rotate(45deg)")`
 *
 * The left side of the screen shows one version.
 * The right side shows the other version.
 * "Outer" is the leftmost transform on the left side of the screen *and* the rightmost transform on the right side of the screen.
 * "Inner" is the rightmost transform on the left side of the screen and the leftmost transform on the right side of the screen.
 *
 * {@link ShowTwoTransforms} does the bulk of the work.
 * We create one of these for each side of the screen.
 *
 * Each of these objects exposes its colors to the Visual Editor.
 * The rest is configured completely in this TypeScript code.
 */
class SwapTransformOrder implements Showable {
  readonly duration = 20_000;
  readonly components: Showable[] = [];
  readonly schedules: Showable["schedules"];
  private readonly left: ShowTwoTransforms;
  private readonly right: ShowTwoTransforms;

  constructor(
    public readonly description: string,
    outerSpec: SwapTransformSpec,
    innerSpec: SwapTransformSpec,
  ) {
    const matrixLayout = new MatrixLayout(makeLineFontRatio(0.183, 1.2));
    const outerFormat = new TextFormatComponent({
      color: outerSpec.color,
      name: "outer",
      size: 1 / 3,
    });
    const innerFormat = new TextFormatComponent({
      color: innerSpec.color,
      name: "inner",
      size: 1 / 3,
    });
    const baseFormat = new TextFormatComponent({
      color: "black",
      name: "base",
      size: 1 / 3,
    });
    [outerFormat, innerFormat, baseFormat].forEach((formatter) => {
      formatter.colorSchedule.description = formatter.nameScalar.value;
    });
    const outer: SingleTransform = {
      transformString: outerSpec.transformString,
      functionString: outerSpec.functionString,
      getTransform: outerSpec.getTransform,
      formatter: outerFormat,
    };
    const inner: SingleTransform = {
      transformString: innerSpec.transformString,
      functionString: innerSpec.functionString,
      getTransform: innerSpec.getTransform,
      formatter: innerFormat,
    };
    this.left = new ShowTwoTransforms(
      outer,
      inner,
      baseFormat,
      "left",
      matrixLayout,
      this.duration,
    );
    this.right = new ShowTwoTransforms(
      inner,
      outer,
      baseFormat,
      "right",
      matrixLayout,
      this.duration,
    );
    this.schedules = [
      outerFormat.colorSchedule,
      innerFormat.colorSchedule,
      baseFormat.colorSchedule,
    ];
  }

  show(options: ShowOptions) {
    for (const child of this.components!) child.show(options);
    const { context } = options;
    context.lineWidth = 0.05;
    context.strokeStyle = "rgb(0 0 0 / 0.25)";
    context.lineCap = "butt";
    context.beginPath();
    context.moveTo(8, 0.25);
    context.lineTo(8, 8.75);
    context.stroke();
    this.left.show(options);
    this.right.show(options);
  }
}

// MARK: Slide 7
slideList.add(
  new SwapTransformOrder(
    "Slide 7",
    {
      transformString: "scale(2)",
      functionString: "double",
      color: myRainbow.myBlue,
      getTransform(progress) {
        return new DOMMatrix().scaleSelf(progress + 1);
      },
    },
    {
      transformString: "translateX(1px)",
      functionString: "slideRightOneUnit",
      color: myRainbow.red,
      getTransform(progress) {
        return new DOMMatrix().translateSelf(progress, 0);
      },
    },
  ),
);

// MARK: Slide 8
slideList.add(
  new SwapTransformOrder(
    "Slide 8",
    {
      transformString: "rotate(45deg)",
      functionString: "rotate",
      color: myRainbow.magenta,
      getTransform(progress) {
        return new DOMMatrix().rotateSelf(progress * 45);
      },
    },
    {
      transformString: "scale(2, 1)",
      functionString: "twiceAsWide",
      color: myRainbow.cssBlue,
      getTransform(progress) {
        return new DOMMatrix().scaleSelf(progress + 1, 1);
      },
    },
  ),
);

// MARK: Slide 9
slideList.add(
  new SwapTransformOrder(
    "Slide 9",
    {
      transformString: "skewX(30deg)",
      functionString: "leanLeft",
      color: myRainbow.violet,
      getTransform(progress) {
        return new DOMMatrix().skewXSelf(progress * 30);
      },
    },
    {
      transformString: "translateY(2px)",
      functionString: "slideDownTwoUnits",
      color: myRainbow.orange,
      getTransform(progress) {
        return new DOMMatrix().translateSelf(0, progress * 2);
      },
    },
  ),
);

// MARK: TextSampleAndTwoMatrices

abstract class TwoMatricesRight implements Showable {
  readonly duration = 30_000;
  readonly components: Showable[] = [];
  private readonly standardDisplay: ShowTwoTransforms;
  protected leftFormat: TextFormatComponent;
  protected rightFormat: TextFormatComponent;
  protected baseFormat: TextFormatComponent;
  get schedules() {
    return [
      this.leftFormat.colorSchedule,
      this.rightFormat.colorSchedule,
      this.baseFormat.colorSchedule,
    ];
  }
  constructor(
    public readonly description: string,
    readonly leftSpec: SwapTransformSpec,
    readonly rightSpec: SwapTransformSpec,
  ) {
    const matrixLayout = new MatrixLayout(makeLineFontRatio(0.183, 1.2));
    this.leftFormat = new TextFormatComponent({
      color: leftSpec.color,
      name: "left",
      size: 1 / 3,
    });
    this.rightFormat = new TextFormatComponent({
      color: rightSpec.color,
      name: "right",
      size: 1 / 3,
    });
    this.baseFormat = new TextFormatComponent({
      color: "black",
      name: "base",
      size: 1 / 3,
    });
    [this.leftFormat, this.rightFormat, this.baseFormat].forEach(
      (formatter) => {
        formatter.colorSchedule.description = formatter.nameScalar.value;
      },
    );
    const left: SingleTransform = {
      transformString: leftSpec.transformString,
      functionString: leftSpec.functionString,
      getTransform: leftSpec.getTransform,
      formatter: this.leftFormat,
    };
    const right: SingleTransform = {
      transformString: rightSpec.transformString,
      functionString: rightSpec.functionString,
      getTransform: rightSpec.getTransform,
      formatter: this.rightFormat,
    };
    this.standardDisplay = new ShowTwoTransforms(
      left,
      right,
      this.baseFormat,
      "right",
      matrixLayout,
      this.duration,
    );
  }
  show(options: ShowOptions) {
    for (const child of this.components) child.show(options);
    const status = this.standardDisplay.show(options);
    this.showHelper(options, status);
  }
  abstract showHelper(
    options: ShowOptions,
    status: {
      readonly leftProgress: number;
      readonly rightProgress: number;
      readonly sample: "wink" | "box" | "unknown";
    },
  ): void;
}

type CodeSpec = SwapTransformSpec & {
  /**
   * This describes the transform as JavaScript code.
   * Similar to {@link SingleTransform.transformString}.
   * For example: "translate(1, 0)".
   * "context." and ";" will be added around this.
   */
  readonly javaScriptString: string;
};

/**
 * One side looks just like {@link ShowTwoTransforms}.
 * The other side shows a MultiText control, showing the code that matches the rest of the demo.
 */
class CodeSampleAndTwoMatrices extends TwoMatricesRight {
  private readonly textTop = new MultiTextComponent({
    position: [
      { time: 0, value: { x: 0.25, y: -8 }, easeAfter: easeOut },
      { time: 500, value: { x: 0.25, y: 0.25 } },
      {
        time: this.duration / 2 - 500,
        value: { x: 0.35, y: 0.75 },
        easeAfter: easeIn,
      },
      { time: this.duration / 2, value: { x: 0.35, y: 8.9 } },
      {
        time: this.duration / 2,
        value: { x: 0.25, y: -8 },
        easeAfter: easeOut,
      },
      {
        time: this.duration / 2 + 500,
        value: { x: 0.8, y: 0.25 },
      },
      {
        time: this.duration - 500,
        value: { x: 0.7, y: 0.75 },
        easeAfter: easeIn,
      },
      { time: this.duration, value: { x: 0.35, y: 8.9 } },
    ],
    alignment: "left",
    textBaseline: "top",
    additionalLineHeight: 0.15,
    width: 8.5,
  });
  private readonly cssSampleName = new TextSpanComponent();
  private readonly javaScriptSampleName = new TextSpanComponent();
  private readonly setCodeLeftAlpha: (alpha: number) => void;
  private readonly setCodeRightAlpha: (alpha: number) => void;

  constructor(description: string, leftSpec: CodeSpec, rightSpec: CodeSpec) {
    super(description, leftSpec, rightSpec);
    // Show code on left side.
    const baseFormatName = "";
    this.textTop
      .addText(baseFormatName, `<svg>\n`)
      .addText("left", `   <g transform="`)
      .addText("left colorful", leftSpec.transformString)
      .addText("left", `">\n`)
      .addText("right", `      <g transform="`)
      .addText("right colorful", rightSpec.transformString);
    this.textTop.addText("right", `">\n`);
    this.textTop.addText(baseFormatName, `         <use href="`);
    this.textTop.components.push(this.cssSampleName);

    this.textTop.addText(baseFormatName, `" />\n`);
    this.textTop.addText("right", `      </g>\n`);
    this.textTop.addText("left", `   </g>\n`);
    this.textTop
      .addText(baseFormatName, `</svg>\n \n \n`)
      .addText("left", "context.")
      .addText("left colorful", leftSpec.javaScriptString)
      .addText("left", ";\n")
      .addText("right", "context.")
      .addText("right colorful", rightSpec.javaScriptString);
    this.textTop.addText("right", ":\n");
    this.textTop.components.push(this.javaScriptSampleName);
    const size = 0.3;
    const boldness = 1.3;
    const leftColorfulCodeFormat = new TextFormatComponent({
      color: this.leftFormat.colorSchedule,
      name: "left colorful",
      size,
      boldness,
    });
    const rightColorfulCodeFormat = new TextFormatComponent({
      color: this.rightFormat.colorSchedule,
      name: "right colorful",
      size,
      boldness,
    });
    const leftCodeFormat = new TextFormatComponent({
      color: this.baseFormat.colorSchedule,
      name: "left",
      size,
      boldness,
    });
    const rightCodeFormat = new TextFormatComponent({
      color: this.baseFormat.colorSchedule,
      name: "right",
      size,
      boldness,
    });
    const baseCodeFormat = new TextFormatComponent({
      color: this.baseFormat.colorSchedule,
      name: "",
      size,
      boldness,
    });
    this.setCodeLeftAlpha = (alpha: number) => {
      leftColorfulCodeFormat.alphaSchedule.set(alpha);
      leftCodeFormat.alphaSchedule.set(alpha);
    };
    this.setCodeRightAlpha = (alpha: number) => {
      rightColorfulCodeFormat.alphaSchedule.set(alpha);
      rightCodeFormat.alphaSchedule.set(alpha);
    };
    this.textTop.components.push(
      leftColorfulCodeFormat,
      leftCodeFormat,
      rightColorfulCodeFormat,
      rightCodeFormat,
      baseCodeFormat,
    );
  }
  showHelper(
    options: ShowOptions,
    status: {
      readonly leftProgress: number;
      readonly rightProgress: number;
      readonly sample: "wink" | "box" | "unknown";
    },
  ): void {
    switch (status.sample) {
      case "wink": {
        this.cssSampleName.contentSchedule.set("#winkingFace");
        this.javaScriptSampleName.contentSchedule.set("WinkingFace.draw();");
        break;
      }
      case "box": {
        this.cssSampleName.contentSchedule.set("#colorfulBox");
        this.javaScriptSampleName.contentSchedule.set("showColorfulBox();");
        break;
      }
      default: {
        this.cssSampleName.contentSchedule.set("???");
        this.javaScriptSampleName.contentSchedule.set("???");
        console.warn("wtf");
        break;
      }
    }
    this.setCodeLeftAlpha(status.leftProgress);
    this.setCodeRightAlpha(status.rightProgress);
    this.textTop.show(options);
  }
}

// MARK: Slide 10
slideList.add(
  new CodeSampleAndTwoMatrices(
    "Slide 10",
    {
      transformString: "scale(2)",
      functionString: "double",
      javaScriptString: "scale(2, 2)",
      color: myRainbow.myBlue,
      getTransform(progress) {
        return new DOMMatrix().scaleSelf(progress + 1);
      },
    },
    {
      transformString: "translateX(1px)",
      functionString: "slideRightOneUnit",
      javaScriptString: "translate(1, 0)",
      color: myRainbow.red,
      getTransform(progress) {
        return new DOMMatrix().translateSelf(progress, 0);
      },
    },
  ),
);

// MARK: Slide 11
slideList.add(
  new CodeSampleAndTwoMatrices(
    "Slide 11",
    {
      transformString: "rotate(45deg)",
      functionString: "rotate",
      javaScriptString: "rotate(45)",
      color: myRainbow.magenta,
      getTransform(progress) {
        return new DOMMatrix().rotateSelf(progress * 45);
      },
    },
    {
      transformString: "scale(2, 1)",
      functionString: "twiceAsWide",
      javaScriptString: "scale(2, 1)",
      color: myRainbow.cssBlue,
      getTransform(progress) {
        return new DOMMatrix().scaleSelf(progress + 1, 1);
      },
    },
  ),
);

// MARK: Slide 12
slideList.add(
  new CodeSampleAndTwoMatrices(
    "Slide 12",
    {
      transformString: "translate(-6px)",
      functionString: "slideWayLeft",
      javaScriptString: "translate(-6, 0)",
      color: myRainbow.violet,
      getTransform(progress) {
        return new DOMMatrix().translateSelf(progress * -6, 0);
      },
    },
    {
      transformString: "translate(3px)",
      functionString: "slideALittleRight",
      javaScriptString: "translate(3, 0)",
      color: myRainbow.orange,
      getTransform(progress) {
        return new DOMMatrix().translateSelf(progress * 3, 0);
      },
    },
  ),
);

{
  class Slide13 extends TwoMatricesRight {
    private readonly textTop = new MultiTextComponent({
      position: [
        { time: 0, value: { x: 0.25, y: -8 }, easeAfter: easeOut },
        { time: 500, value: { x: 0.25, y: 0.25 } },
        {
          time: this.duration / 2 - 500,
          value: { x: 0.35, y: 0.75 },
          easeAfter: easeIn,
        },
        { time: this.duration / 2, value: { x: 0.35, y: 8.9 } },
        {
          time: this.duration / 2,
          value: { x: 0.25, y: -8 },
          easeAfter: easeOut,
        },
        {
          time: this.duration / 2 + 500,
          value: { x: 0.8, y: 0.25 },
        },
        {
          time: this.duration - 500,
          value: { x: 0.7, y: 0.75 },
          easeAfter: easeIn,
        },
        { time: this.duration, value: { x: 0.35, y: 8.9 } },
      ],
      alignment: "left",
      textBaseline: "top",
      additionalLineHeight: 0.15,
      width: 8,
    });
    private readonly setCodeLeftAlpha: (alpha: number) => void;
    private readonly setCodeRightAlpha: (alpha: number) => void;
    static readonly #svgSampleName: ReadonlyMap<string, string> = new Map([
      ["wink", "#winkingFace"],
      ["box", "#colorfulBox"],
    ]);
    static readonly #typescriptSampleName: ReadonlyMap<string, string> =
      new Map([
        ["wink", "WinkingFace.draw();"],
        ["box", "showColorfulBox();"],
      ]);
    showHelper(
      options: ShowOptions,
      status: {
        readonly leftProgress: number;
        readonly rightProgress: number;
        readonly sample: "wink" | "box" | "unknown";
      },
    ): void {
      this.textTop.clearText()
        .addText1(`⸨left⸩<g transform="⸨left colorful⸩${this.leftSpec.transformString}⸨left⸩">
⸨right⸩   <g transform="⸨right colorful⸩${this.rightSpec.transformString}⸨right⸩">
⸨⸩      <use href="${Slide13.#svgSampleName.get(status.sample) ?? "???"}" />
⸨right⸩   </g>
⸨left⸩</g>
⸨⸩ 
 
const matrix = new DOMMatrix();
⸨left⸩matrix.⸨left colorful⸩skewXSelf(30)⸨left⸩;
⸨right⸩matrix.⸨right colorful⸩translateSelf(0, 2)⸨right⸩;
⸨⸩applyTransform(context, matrix);
${Slide13.#typescriptSampleName.get(status.sample) ?? "???"}`);
      this.setCodeLeftAlpha(status.leftProgress);
      this.setCodeRightAlpha(status.rightProgress);
      this.textTop.show(options);
    }
    constructor() {
      super(
        "Slide 13",
        {
          transformString: "skewX(30deg)",
          functionString: "leanLeft",
          color: myRainbow.violet,
          getTransform(progress) {
            return new DOMMatrix().skewXSelf(progress * 30);
          },
        },
        {
          transformString: "translateY(2px)",
          functionString: "slideDownTwoUnits",
          color: myRainbow.orange,
          getTransform(progress) {
            return new DOMMatrix().translateSelf(0, progress * 2);
          },
        },
      );
      const size = 0.3;
      const boldness = 1.3;
      const leftColorfulCodeFormat = new TextFormatComponent({
        color: this.leftFormat.colorSchedule,
        name: "left colorful",
        size,
        boldness,
      });
      const rightColorfulCodeFormat = new TextFormatComponent({
        color: this.rightFormat.colorSchedule,
        name: "right colorful",
        size,
        boldness,
      });
      const leftCodeFormat = new TextFormatComponent({
        color: this.baseFormat.colorSchedule,
        name: "left",
        size,
        boldness,
      });
      const rightCodeFormat = new TextFormatComponent({
        color: this.baseFormat.colorSchedule,
        name: "right",
        size,
        boldness,
      });
      const baseCodeFormat = new TextFormatComponent({
        color: this.baseFormat.colorSchedule,
        name: "",
        size,
        boldness,
      });
      this.setCodeLeftAlpha = (alpha: number) => {
        leftColorfulCodeFormat.alphaSchedule.set(alpha);
        leftCodeFormat.alphaSchedule.set(alpha);
      };
      this.setCodeRightAlpha = (alpha: number) => {
        rightColorfulCodeFormat.alphaSchedule.set(alpha);
        rightCodeFormat.alphaSchedule.set(alpha);
      };
      this.textTop.components.push(
        leftColorfulCodeFormat,
        leftCodeFormat,
        rightColorfulCodeFormat,
        rightCodeFormat,
        baseCodeFormat,
      );
    }
    static readonly instance = new this();
  }
  slideList.add(Slide13.instance);
}

// MARK: Blank Sides

// Use this to make blank slides.
// Fill them in with the Visual Editors.
for (let i = 11; i <= 10; i++) {
  slideList.add(makeEmptySlide(`Slide ${i}`));
}

export const some5 = makeShadowDemo({
  base: slideList.build(),
  background: "white",
  dotColor: "#ddd",
  dx: 0.2,
  dy: 0.2,
});
