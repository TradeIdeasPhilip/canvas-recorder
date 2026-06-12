import { MakeShowableInSeries, Showable, ShowOptions } from "../showable";
import { makeShadowDemo, DEFAULT_SLIDE_DURATION_MS } from "../shadow-test";
import { myRainbow } from "../glib/my-rainbow";
import { buildComponents, TextComponent } from "../slide-components";
import slide1 from "./slide1.json";
import { Font } from "../glib/letters-base";
import { ParagraphLayout } from "../glib/paragraph-layout";
import { makeLineFontRatio } from "../glib/line-font";
import { Point } from "../glib/path-shape";
import { applyTransform, transform } from "../glib/transforms";
import { lerp, ReadOnlyRect } from "phil-lib/misc";
import {
  NumberDurationScheduleInfo,
  NumberScheduleInfo,
} from "../schedule-helper";
import { Keyframes, ease, interpolateNumbers } from "../interpolate";

const paddedEaseSubSchedule: Keyframes<number> = [
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

/**
 * A sample made to demonstrate transforms.
 * @param context Where to draw
 * @param lineWidth
 * @param transform By default the box is centered on (0, 0), with a hole punched in the top left corder, (-1, -1).
 */
function showColorfulBox(
  context: CanvasRenderingContext2D,
  lineWidth: number,
  transform: DOMMatrixReadOnly,
) {
  context.save();
  applyTransform(context, transform);
  context.beginPath();
  context.rect(-2, -2, 4, 4);
  context.arc(-1, -1, lineWidth / 2.4, 0, Math.PI * 2);
  context.clip("evenodd");
  context.lineWidth = lineWidth;
  context.lineCap = "square";
  context.strokeStyle = "#5800ff"; //myRainbow.violet;
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
}

const matrixLayout = new MatrixLayout(makeLineFontRatio(1 / 4, 1.2));

/**
 * Top is a string version of the transform.
 * Left is the untransformed shape.
 * Right is the transformed shape.
 * Bottom is an equation with matrices.
 */
class BeforeAndAfter implements Showable {
  static readonly GRID_CYAN = "rgba(0%, 80%, 80%, 50%)";
  static readonly GRID_YELLOW = "rgba(80%, 80%, 0%, 0.5)";
  static readonly GRID_GREEN = "rgba(0%, 80%, 0%, 50%)";
  readonly duration = DEFAULT_SLIDE_DURATION_MS;
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
  private drawGrid(
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
    const progress = timeInMs / this.duration;
    const transformString = this.makeTransformString(progress);
    const matrix = new DOMMatrixReadOnly(transformString);
    const transformedPoint = transform(
      this.originalPoint.x,
      this.originalPoint.y,
      matrix,
    );
    matrixLayout.show311(
      (16 - matrixLayout.layout311.total.width) / 2,
      8.75 - matrixLayout.layout311.total.height,
      matrix,
      this.originalPoint,
      transformedPoint,
      options.context,
    );
    const originalTransform = context.getTransform();
    context.translate(4, 3.75);
    this.drawGrid(
      { x: -3.5, y: -2.5, width: 7, height: 5 },
      BeforeAndAfter.GRID_CYAN,
      context,
    );
    context.lineWidth = 0.25;
    showColorfulBox(context, 0.25, this.rightMostTransform);
    context.setTransform(originalTransform);
    context.translate(12, 3.75);
    this.drawGrid(
      { x: -3.5, y: -2.5, width: 7, height: 5 },
      BeforeAndAfter.GRID_GREEN,
      context,
    );
    context.lineWidth = 0.25;
    applyTransform(context, matrix);
    showColorfulBox(context, 0.25, this.rightMostTransform);
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

for (let i = 7; i <= 10; i++) {
  slideList.add(makeEmptySlide(`Slide ${i}`));
}

export const some5 = makeShadowDemo({
  base: slideList.build(),
  background: "white",
  dotColor: "#ddd",
  dx: 0.2,
  dy: 0.2,
});
