import {
  FULL_CIRCLE,
  lerp,
  polarToRectangular,
  positiveModulo,
  radiansPerDegree,
  ReadOnlyRect,
} from "phil-lib/misc";
import { Font } from "../glib/letters-base";
import { makeLineFontRatio } from "../glib/line-font";
import { myRainbow, myRainbowPerceptualKeyframes } from "../glib/my-rainbow";
import { ParagraphLayout } from "../glib/paragraph-layout";
import { PathBuilder, Point } from "../glib/path-shape";
import { applyTransform, transform } from "../glib/transforms";
import {
  durationKeyframes,
  ease,
  easeIn,
  easeOut,
  interpolateColor,
  interpolateColors,
  interpolateNumbers,
  Keyframe,
} from "../interpolate";
import {
  NumberDurationScheduleInfo,
  NumberScheduleInfo,
} from "../schedule-helper";
import { DEFAULT_SLIDE_DURATION_MS, makeShadowDemo } from "../shadow-test";
import {
  MakeShowableInSeries,
  progressAxisLabel,
  RootComponentEditor,
  ScheduleInfo,
  Showable,
  ShowOptions,
  VisualEditorAPI,
} from "../showable";
import {
  ArrowComponent,
  buildComponents,
  MultiTextComponent,
  SlideComponent,
  TextComponent,
  TextFormatComponent,
  TextSpanComponent,
} from "../slide-components";
import slide1 from "./slide1.json";
import {
  FourierTerm,
  getAnimationRules,
  makePolygon,
  samplesFromPath,
  samplesToFourier,
} from "../peano-fourier/fourier-shared";
import { strokeColors } from "../stroke-colors";
import { PathShapeSplitter } from "../glib/path-shape-splitter";
import { matchShapes } from "../morph-animation";
import { createPathShapeCrossFade } from "../cross-fade";

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

// MARK: Winking Face

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
    options: ShowOptions,
    transform?: DOMMatrixReadOnly,
  ) {
    const { context } = options;
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

// MARK: Fourier Star

class FourierStar {
  static readonly #star5 = makePolygon(5, 1, undefined, 0).transform(
    new DOMMatrix().rotateSelf(-90),
  );
  static readonly #samples = samplesFromPath(this.#star5, 256);
  static readonly #terms: readonly FourierTerm[] = samplesToFourier(
    this.#samples,
  );
  static readonly #livePathMakers = getAnimationRules(
    this.#terms,
    [1, 2, 3, 40],
  );
  static readonly #fourierIndex: readonly Keyframe<number>[] = [
    { time: 0.4, value: 0 },
    { time: 0.35, value: 1 },
    { time: 0.25, value: 2 },
  ];
  /**
   * @deprecated Do not call.
   * This is a static class.
   */
  private constructor() {
    throw new Error("wtf");
  }
  static show(options: ShowOptions, transform?: DOMMatrixReadOnly) {
    const { context, globalTime } = options;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 0.1;
    context.strokeStyle = "brown";
    const progress = positiveModulo(globalTime / 9_000, 1);
    const currentState = durationKeyframes(progress, FourierStar.#fourierIndex);
    const pathShape = FourierStar.#livePathMakers[currentState.value](
      currentState.progress,
    );
    if (transform) {
      context.save();
      applyTransform(context, transform);
    }
    context.stroke(pathShape.canvasPath);
    if (transform) {
      context.restore();
    }
  }
}

// MARK: Peace & Love

/**
 * Draw words inside the standard test square.
 * "Peace" is on top.
 * "Love" is upside down on the bottom.
 *
 * The outlines are in black.
 * The inside is mostly transparent.
 * The colors vary across the spectrum over time.
 * The speed is fixed relative to options.globalTime, for simplicity.
 * @param options
 * @param transform
 */
function showPeaceAndLove(options: ShowOptions, transform?: DOMMatrixReadOnly) {
  const { context, globalTime } = options;
  function getColor(offset = 0) {
    const progress = positiveModulo(globalTime / 3_000 + offset, 1);
    const baseColor = interpolateColors(progress, myRainbowPerceptualKeyframes);
    return interpolateColor(0.8, baseColor, "transparent");
  }
  if (transform) {
    context.save();
    applyTransform(context, transform);
  }
  //context.fillStyle = "#ccc";
  //context.fillRect(-1,-1, 2,2);
  context.strokeStyle = "black";
  context.fillStyle = getColor();
  context.font = "0.75px Ranchers";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.lineWidth = 0.02;
  context.fillText("Peace", 0, -0.35);
  context.strokeText("Peace", 0, -0.35);
  context.rotate(FULL_CIRCLE / 2);
  context.fillStyle = getColor(0.5);
  context.font = "0.75px Bevan";
  context.fillText("Love", 0, -0.39);
  context.strokeText("Love", 0, -0.39);
  if (transform) {
    context.restore();
  }
}

// MARK: Colorful Box

/**
 * A sample made to demonstrate transforms.
 * @param context Where to draw
 * @param transform By default the box is centered on (0, 0), with a hole punched in the top left corder, (-1, -1).
 */
function showColorfulBox(options: ShowOptions, transform?: DOMMatrixReadOnly) {
  const lineWidth = 0.25;
  const { context } = options;
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
  context.lineWidth = lineWidth / 2;
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

/**
 * Show all of these to the top level GUI.
 */
const slideList = new MakeShowableInSeries("SoME5");

/**
 * Add these to my prototype of a timeline editor.
 */
const forTimeline: Showable[] = [];

// MARK: Sound Clips

/** A single audio clip attached to the scene. */
/** Pins a moment in a sound clip to a moment in a timeline item. */
type Anchor = {
  /** ID of the SlideWrapperItem or TransitionItem being attached to. */
  targetId: string;
  /** Milliseconds within the target's own duration (0 = target start). */
  targetMs: number;
  /** Which moment of the clip aligns with the target point.
   *  "start" | "end" | a fraction 0–1 of the clip's lengthMs. */
  selfHandle: "start" | "end" | number;
  /** Additional shift in ms after alignment (negative = earlier). */
  offsetMs: number;
};

type SoundClip = {
  /** Stable identifier used by Anchor.targetId. Assigned at creation. */
  id: string;
  notes: string;
  source: string;
  /** Absolute ms from the MainTimeline start. Computed by resolveLayout()
   *  when anchor is set; directly editable when floating. */
  startMsIntoScene: number;
  startMsIntoClip: number;
  lengthMs: number;
  /** When set, startMsIntoScene is derived from the anchor on each tick. */
  anchor?: Anchor;
};

/**
 * Late-initialized from the Parallel Combination chapter so both that
 * chapter and Main Timeline share the same mutable array.
 */
let mainTimelineSoundClips: SoundClip[] = [];

/**
 * Add this item to both {@link slideList} and {@link forTimeline}.
 * @param toAdd The new slide.
 */
function addToBoth(toAdd: Showable) {
  slideList.add(toAdd);
  forTimeline.push(toAdd);
}

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
  addToBoth(slide);
}

/**
 * This draws matrices and related symbols.
 *
 * The size and shape are predetermined.
 * As you change the numbers, nothing should jump around.
 */
class MatrixLayout {
  static readonly BOTTOM_ROW_COLOR_BASE = "rgba(0, 0, 0, 0.4)";
  static bottomRowColor = this.BOTTOM_ROW_COLOR_BASE;
  static bottomRowBoldnessRatio = 1;
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
  private readonly laidOutTimes: ReturnType<ParagraphLayout["align"]>;
  /**
   * The = sign.
   *
   * Do this up front so we can easily reserve space.
   */
  private readonly laidOutEquals: ReturnType<ParagraphLayout["align"]>;
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
    context.strokeStyle = MatrixLayout.bottomRowColor;
    context.lineWidth *= MatrixLayout.bottomRowBoldnessRatio;
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
        context.strokeStyle = MatrixLayout.bottomRowColor;
        context.lineWidth =
          this.font.strokeWidth * MatrixLayout.bottomRowBoldnessRatio;
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
    context.strokeStyle = MatrixLayout.bottomRowColor;
    context.lineWidth *= MatrixLayout.bottomRowBoldnessRatio;
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

type Sample = {
  draw(options: ShowOptions, transform?: DOMMatrixReadOnly | undefined): void;
  readonly svg: string;
  readonly typescript: string;
};

const WINK: Sample = {
  draw: WinkingFace.draw,
  svg: "#winkingFace",
  typescript: "WinkingFace.draw(options);",
};
const BOX: Sample = {
  draw: showColorfulBox,
  svg: "#colorfulBox",
  typescript: "showColorfulBox(options);",
};
const FOURIER_STAR: Sample = {
  draw: FourierStar.show,
  svg: "#fourierStar",
  typescript: "FourierStar.show(options)",
};
const PEACE_AND_LOVE: Sample = {
  draw: showPeaceAndLove,
  svg: "#peaceAndLove",
  typescript: "showPeaceAndLove(options)",
};

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
  readonly duration = 40_000;
  readonly components: Showable[] = [];
  readonly schedules: ScheduleInfo[] = [];
  readonly textForTransform = new TextComponent();
  readonly originalPoint: Point;
  /**
   * This is updated on each call to show().
   * This is the value that we print in the matrix.
   */
  transformedPoint: Point = { x: NaN, y: NaN };
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
  static readonly #sampleSchedule: readonly Keyframe<
    typeof showPeaceAndLove
  >[] = [
    { time: 1 / 4, value: WINK.draw },
    { time: 1 / 4, value: BOX.draw },
    { time: 1 / 4, value: FOURIER_STAR.draw },
    { time: 1 / 4, value: PEACE_AND_LOVE.draw },
  ];
  show(options: ShowOptions) {
    for (const child of this.components!) child.show(options);
    const { timeInMs, context } = options;
    const globalProgress = durationKeyframes(
      timeInMs / this.duration,
      BeforeAndAfter.#sampleSchedule,
    );
    const progress = globalProgress.progress;
    const drawSample = globalProgress.value;
    const transformString = this.makeTransformString(progress);
    const matrix = new DOMMatrixReadOnly(transformString);
    this.transformedPoint = transform(
      this.originalPoint.x,
      this.originalPoint.y,
      matrix,
    );
    BeforeAndAfter.matrixLayout.show311(
      (16 - BeforeAndAfter.matrixLayout.layout311.total.width) / 2,
      8.75 - BeforeAndAfter.matrixLayout.layout311.total.height,
      matrix,
      this.originalPoint,
      this.transformedPoint,
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
    drawSample(options, this.rightMostTransform);
    context.setTransform(originalTransform);
    context.translate(12, 3.75);
    drawGrid(
      { x: -3.5, y: -2.5, width: 7, height: 5 },
      BeforeAndAfter.GRID_GREEN,
      context,
    );
    applyTransform(context, matrix);
    drawSample(options, this.rightMostTransform);
    context.setTransform(originalTransform);
    this.textForTransform.textSchedule.set(transformString);
    this.textForTransform.show(options);
  }
}

// MARK: Slide 2
{
  const slide = new BeforeAndAfter("Slide 2");
  addToBoth(slide);
}

// MARK: Slide 3
const slide3 = new BeforeAndAfter("Slide 3");
{
  const angleSchedule = new NumberScheduleInfo(
    "Angle",
    [
      { time: 0, value: 0, easeAfter: ease },
      { time: 0.2, value: 30 },
      { time: 0.3, value: 30, easeAfter: ease },
      { time: 0.7, value: -30 },
      { time: 0.8, value: -30, easeAfter: ease },
      { time: 1, value: 0 },
    ],
    progressAxisLabel,
  );
  slide3.schedules.push(angleSchedule);
  slide3.makeTransformString = (progress: number): string => {
    const angle = angleSchedule.at(progress);
    return `skewY(${angle.toFixed(2)}deg)`;
  };
  addToBoth(slide3);
}

// MARK: Slide 4
const slide4 = new BeforeAndAfter("Slide 4");
{
  const scaleSchedule = new NumberScheduleInfo(
    "Scale X",
    [
      { time: 0, value: 1, easeAfter: ease },
      { time: 0.2, value: -2 },
      { time: 0.3, value: -2, easeAfter: ease },
      { time: 0.7, value: 2 },
      { time: 0.8, value: 2, easeAfter: ease },
      { time: 1, value: 1 },
    ],
    progressAxisLabel,
  );
  slide4.schedules.push(scaleSchedule);
  slide4.makeTransformString = (progress: number): string => {
    const scale = scaleSchedule.at(progress);
    return `scaleX(${scale.toFixed(2)})`;
  };
  addToBoth(slide4);
}

// MARK: Slide 5
{
  const slide = new BeforeAndAfter(
    "Slide 5",
    new DOMMatrixReadOnly("translateX(1.5px)"),
  );
  addToBoth(slide);
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
  addToBoth(slide);
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
    readonly sample: Sample;
  }>[] = [
    {
      time: 1 / 8,
      value: { activeMatrix: "right", sample: WINK },
      easeAfter: ease,
    },
    {
      time: 1 / 7,
      value: { activeMatrix: "left", sample: WINK },
      easeAfter: ease,
    },
    {
      time: 1 / 8,
      value: { activeMatrix: "right", sample: FOURIER_STAR },
      easeAfter: ease,
    },
    {
      time: 1 / 8,
      value: { activeMatrix: "left", sample: FOURIER_STAR },
      easeAfter: ease,
    },
    {
      time: 1 / 8,
      value: { activeMatrix: "right", sample: BOX },
      easeAfter: ease,
    },
    {
      time: 1 / 8,
      value: { activeMatrix: "left", sample: BOX },
      easeAfter: ease,
    },
    {
      time: 1 / 8,
      value: { activeMatrix: "right", sample: PEACE_AND_LOVE },
      easeAfter: ease,
    },
    {
      time: 1 / 8,
      value: { activeMatrix: "left", sample: PEACE_AND_LOVE },
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
    globalProgress.value.sample.draw(options);
    context.setTransform(originalTransform);
    return {
      leftProgress,
      rightProgress,
      sample: globalProgress.value.sample,
    } as const;
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
addToBoth(
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
addToBoth(
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
addToBoth(
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
    ] as const;
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
      readonly sample: Sample;
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
      readonly sample: Sample;
    },
  ): void {
    this.cssSampleName.contentSchedule.set(status.sample.svg);
    this.javaScriptSampleName.contentSchedule.set(status.sample.typescript);
    this.setCodeLeftAlpha(status.leftProgress);
    this.setCodeRightAlpha(status.rightProgress);
    this.textTop.show(options);
  }
}

// MARK: Slide 10
addToBoth(
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
addToBoth(
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
addToBoth(
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

// MARK: Slide 13
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
    showHelper(
      options: ShowOptions,
      status: {
        readonly leftProgress: number;
        readonly rightProgress: number;
        readonly sample: Sample;
      },
    ): void {
      this.textTop.clearText()
        .addText1(`⸨left⸩<g transform="⸨left colorful⸩${this.leftSpec.transformString}⸨left⸩">
⸨right⸩   <g transform="⸨right colorful⸩${this.rightSpec.transformString}⸨right⸩">
⸨⸩      <use href="${status.sample.svg}" />
⸨right⸩   </g>
⸨left⸩</g>
⸨⸩ 
 
const matrix = new DOMMatrix();
⸨left⸩matrix.⸨left colorful⸩skewXSelf(30)⸨left⸩;
⸨right⸩matrix.⸨right colorful⸩translateSelf(0, 2)⸨right⸩;
⸨⸩applyTransform(context, matrix);
${status.sample.typescript}`);
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
  addToBoth(Slide13.instance);
}

// MARK: Try New Items
{
  const star5 = makePolygon(5, 1, undefined, 0).transform(
    new DOMMatrix().rotateSelf(-90),
  );
  const circle = PathBuilder.M(0, -0.5)
    .circle(0, 0, "cw")
    .circle(0, 0, "cw").pathShape;
  const shapeMaker = matchShapes(circle, star5);
  const crossFade = createPathShapeCrossFade(circle, star5, 0.25, 100, ease);
  const splitter = PathShapeSplitter.create(circle);

  const samples = samplesFromPath(star5, 256);
  const terms: readonly FourierTerm[] = samplesToFourier(samples);
  const livePathMakers = getAnimationRules(terms, [1, 2, 3, 40]);
  const fourierIndex: readonly Keyframe<number>[] = [
    { time: 0.4, value: 0 },
    { time: 0.35, value: 1 },
    { time: 0.25, value: 2 },
  ];
  /*
  const xx1 = myRainbowPerceptualKeyframes.map((original) => {
    return {
      time: original.time * 20_000,
      value: interpolateColor(0.8, original.value, "transparent"),
    };
  });
  console.log(xx1);
  const xx2 = xx1.map((base) => {
    return { time: base.time - 10_000, value: base.value };
  });
  const xx3 = xx1.map((base) => {
    return { time: base.time + 10_000, value: base.value };
  });
  console.log([...xx2, ...xx3]);
  */

  const tryNewItems: Showable = {
    description: "Try New Items",
    duration: 20_000,
    components: [],
    show(options) {
      this.components?.forEach((component) => component.show(options));
      const { context, timeInMs, globalTime } = options;
      const progress = timeInMs / this.duration;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 0.05;
      strokeColors({
        context,
        pathShape: star5.translate(1.5, 1.5),
        relativeOffset: globalTime / 2500,
      });
      context.strokeStyle = myRainbow.myBlue;
      context.stroke(
        splitter.trim(0, progress * splitter.length).translate(4.5, 1.5)
          .canvasPath,
      );
      context.strokeStyle = "magenta";
      context.stroke(shapeMaker(progress).translate(7.5, 1.5).canvasPath);
      context.strokeStyle = myRainbow.cssBlue;
      context.stroke(crossFade(progress).translate(10.5, 1.5).canvasPath);
      context.strokeStyle = myRainbow.orange;
      const f = durationKeyframes(progress, fourierIndex);
      context.stroke(
        livePathMakers[f.value](f.progress).translate(13.5, 1.5).canvasPath,
      );
    },
  };
  slideList.add(tryNewItems);
}

class ChildWrapper extends SlideComponent {
  timeToProgressSchedule = new NumberScheduleInfo("Time to Progress", -1);
  constructor(readonly child: Showable) {
    super({ description: child.description });
    this.schedulesInternal.unshift(this.timeToProgressSchedule);
  }
  protected override additionalDrawing(options: ShowOptions): void {
    const progress = this.timeToProgressSchedule.at(options.timeInMs);
    if (progress >= 0 && progress <= 1) {
      const childTime = progress * this.child.duration;
      const childOptions: ShowOptions = { ...options, timeInMs: childTime };
      this.child.show(childOptions);
    }
  }
}

// MARK: Parallel Combination
{
  const duration = 600_000;
  const slideChildren = forTimeline.map((child) => new ChildWrapper(child));
  /**
   * For each new scene freeze on the first frame for this many milliseconds before starting the action.
   * Scenes can be uncomfortable if we start the action immediately.
   *
   * This is part of the time reserved for the scene.
   */
  const freezeBeforeEnd = 500;
  /**
   * As each scene ends freeze on the last frame for this many milliseconds.
   * Scenes can be uncomfortable if the action goes all the way to the end.
   *
   * This is part of the time reserved for the scene.
   */
  const freezeAfterStart = 500;
  /**
   * Allow this many milliseconds between scenes.
   *
   * During this time there may be an animated transition.
   * Currently that means sliding the old scene off to the left while sliding the new scene in from the right.
   */
  const overlap = 350;
  /**
   * Tell a child when and how to display itself.
   * Each gets assigned after the next, with a brief transition period in between.
   * @param childWrapper Schedule this.
   * @param startTime This comes after the {@link overlap} period and before the {@link freezeAfterStart}.
   * This is the time allocated to this child alone.
   * @param endTime This comes after the {@link freezeBeforeEnd} period and before the next {@link overlap}.
   * This is the time allocated to this child alone.
   */
  function setSchedule(
    childWrapper: ChildWrapper,
    startTime: number,
    endTime: number,
  ) {
    const timeToProgress: Keyframe<number>[] = [];
    timeToProgress.push({ time: startTime - overlap - 1000, value: -1 });
    timeToProgress.push({ time: startTime - overlap, value: 0 });
    timeToProgress.push({ time: startTime + freezeAfterStart, value: 0 });
    timeToProgress.push({ time: endTime - freezeBeforeEnd, value: 1 });
    timeToProgress.push({ time: endTime + overlap, value: 1 });
    timeToProgress.push({ time: endTime + overlap + 1000, value: 2 });
    childWrapper.timeToProgressSchedule.set(timeToProgress);
    childWrapper.transformTemplate.value = "translateX(𝓐px)";
    const translateX: Keyframe<number>[] = [];
    translateX.push({ time: startTime - overlap, value: 16 });
    translateX.push({ time: startTime, value: 0 });
    translateX.push({ time: endTime, value: 0 });
    translateX.push({ time: endTime + overlap, value: -16 });
    childWrapper.placeA.set(translateX);
  }
  function spread(
    startIndex: number,
    endIndex: number,
    startTime: number,
    endTime: number,
  ) {
    const numberOfSlides = endIndex - startIndex;
    if (numberOfSlides < 1) {
      throw new Error("wtf");
    }
    if (endIndex < slideChildren.length) {
      endTime -= overlap;
    } else if (endIndex > slideChildren.length) {
      throw new Error("wtf");
    }
    const availableForMain =
      endTime -
      startTime -
      (freezeBeforeEnd + freezeAfterStart) * numberOfSlides -
      overlap * (numberOfSlides - 1);
    if (availableForMain <= 0) {
      throw new Error("wtf");
    }
    function getFrameStart(index: number) {
      return (
        startTime +
        (index - startIndex) * (overlap + freezeBeforeEnd + freezeAfterStart) +
        ((index - startIndex) / numberOfSlides) * availableForMain
      );
    }
    for (let index = startIndex; index < endIndex; index++) {
      const childWrapper = slideChildren[index];
      const frameStart = getFrameStart(index);
      const frameEnd = getFrameStart(index + 1) - overlap;
      setSchedule(childWrapper, frameStart, frameEnd);
    }
  }
  spread(0, 1, 0, 12_000);
  spread(1, 3, 12_000, 120_000);
  spread(3, slideChildren.length, 120_000, duration);
  console.log(slideChildren);
  /**
   * This slide is a test of the new {@link Showable.rootComponentEditor} property.
   * Eventually this will be filled with some type of timeline GUI.
   * For now it's a placeholder just to make sure we have the structure in place.
   * For now it only has debug data.
   * The timeline is a very rough idea and will require several prototypes.
   */
  let visualEditorAPI: VisualEditorAPI | undefined;
  const element = document.createElement("div");
  // This makes some assumptions about the container.
  // I don't actually know the details right now, so this is just a straw man:
  element.style.maxHeight = "100%";
  // Motif style so it's very obvious.
  element.style.border = "0.5em outset #A3A0A4";
  const rootComponentEditor: RootComponentEditor = {
    start(visualEditor) {
      if (visualEditorAPI) {
        // It looks like we didn't get a call to suspend().
        console.error(
          "Unexpected call to start()",
          visualEditorAPI,
          visualEditor,
        );
        // Overwrite the old state.
        // There's a good chance that will fix the problem going forward.
      }
      visualEditorAPI = visualEditor;
      element.textContent = "start() ";
      // for testing purposes:
      console.log(visualEditor);
      return element;
    },
    resetAll() {
      element.textContent += "R";
      if (visualEditorAPI === undefined) {
        throw new Error("Unexpected state.");
      }
    },
    selectionChanged(selected) {
      element.textContent += "S";
      console.log(selected);
      if (visualEditorAPI === undefined) {
        throw new Error("Unexpected state.");
      }
    },
    update(component, property) {
      element.textContent += "U";
      console.log(component, property);
      if (visualEditorAPI === undefined) {
        throw new Error("Unexpected state.");
      }
    },
    suspend() {
      element.textContent = "❌❌ BAD ❌❌";
      if (visualEditorAPI === undefined) {
        throw new Error("Unexpected state.");
      }
      // The old value is now off limits.
      // Later we might get the same object or a different object of the same type.
      visualEditorAPI = undefined;
    },
  };
  // IDs are assigned in the forEach below; cast to SoundClip[] after that.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const soundClips = [
    {
      notes: "Let’s watch some matrices in their natural habitat.\n",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 2152.48,
      lengthMs: 3332.88,
    },
    {
      notes: "These examples ... matrix multiplication.",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 6100.35,
      lengthMs: 9497.02,
    },
    {
      notes: "This is an explainer... an easy one.",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 18100.33,
      lengthMs: 3146.46,
    },
    {
      notes: "The good news: the computer will help you create the matrices.\n",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 21659.03,
      lengthMs: 3964.26,
    },
    {
      notes: "And the computer will multiply the matrices for you.",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 26308.06,
      lengthMs: 2798.21,
    },
    {
      notes: "All you have to do is put them in the right order.",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 29656.19,
      lengthMs: 2488.9,
    },
    {
      notes: "Am I the only one who gets these things backwards",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 33409.17,
      lengthMs: 2792.56,
    },
    {
      notes: "There are only two possibilities. ... wrong every time?",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 37355.25,
      lengthMs: 4913.68,
    },
    {
      notes: "How I stopped guessing ... what's really going on.",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 43156.5,
      lengthMs: 3852.06,
    },
    {
      notes: "Affine transform overview",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 52174.38,
      lengthMs: 19280.38,
    },
    {
      notes: "Point = column vector = matrix.",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 72176.1,
      lengthMs: 6636.04,
    },
    {
      notes: "Shapes are just a collection of points.",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 79339.19,
      lengthMs: 3877.48,
    },
    {
      notes: "Top left corner of square",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 83676.98,
      lengthMs: 5009.33,
    },
    {
      notes:
        "Each operation is a square matrix ... computer creates it for you.",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 89969.63,
      lengthMs: 12498.48,
    },
    {
      notes: "Apply transform to point ... each point in image.",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 106089.79,
      lengthMs: 11654.98,
    },
    {
      notes: "More details... affine matrices are bigger.\n",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 119657.4,
      lengthMs: 10484.96,
    },
    {
      notes: "And sometimes people don't bother to list out all the terms.",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 130630.46,
      lengthMs: 3829.13,
    },
    {
      notes:
        "Worthy of further study... 3x1 ... 3x3 ... The computer will take care of the rest for you.",
      source: "./Some 5 part 1.m4a",
      startMsIntoScene: 0,
      startMsIntoClip: 135655.83,
      lengthMs: 17360.6,
    },
  ];
  {
    let startTime = 1000;
    soundClips.forEach((clip) => {
      clip.startMsIntoScene = startTime;
      startTime += clip.lengthMs + 1000;
      (clip as SoundClip).id = crypto.randomUUID();
    });
  }
  // Share with Main Timeline so the GUI can edit the same array.
  mainTimelineSoundClips = soundClips as SoundClip[];
  const moreToShow: Pick<Showable, "show">[] = [];
  {
    type SimpleArrowDescription = {
      pointyEnd: Point;
      color: string;
      /**
       * Radians.
       * 0 means to the right.
       * Positive numbers mean clockwise.
       */
      angleToFlatEnd: number;
      /**
       * First fully visible at this time in milliseconds.
       * Some animation might appear before this to bring it in.
       */
      startMs: number;
      /**
       * Last fully visible at this time in milliseconds.
       * Some animation might appear after to hide it.
       */
      endMs: number;
    };
    class SimpleArrow implements Pick<Showable, "show"> {
      readonly flatEnd: Point;
      readonly #length = 1.6;
      readonly #width = 0.16;
      readonly #alphaSchedule: Keyframe<number>[];
      readonly #color: string;
      protected readonly pointyEnd: { x: number; y: number };
      constructor(description: SimpleArrowDescription) {
        this.#color = description.color;
        this.pointyEnd = description.pointyEnd;
        const vectorBack = polarToRectangular(
          this.#length,
          description.angleToFlatEnd,
        );
        this.flatEnd = {
          x: description.pointyEnd.x + vectorBack.x,
          y: description.pointyEnd.y + vectorBack.y,
        };
        const fadeInTime = 1_000;
        const fadeOutTime = 500;
        this.#alphaSchedule = [
          { time: description.startMs - fadeInTime, value: 0 },
          { time: description.startMs, value: 1 },
          { time: description.endMs, value: 1 },
          { time: description.endMs + fadeOutTime, value: 0 },
        ];
      }
      show(options: ShowOptions): void {
        const { context, timeInMs } = options;
        const alpha = interpolateNumbers(timeInMs, this.#alphaSchedule);
        if (alpha > 0) {
          const tip = this.pointyEnd;
          context.globalAlpha = alpha;
          ArrowComponent.show({
            context,
            color: this.#color,
            flat: this.flatEnd,
            tip,
            width: this.#width,
          });
          context.globalAlpha = 1;
        }
      }
    }
    // Initial point as a matrix:
    moreToShow.push(
      new SimpleArrow({
        pointyEnd: { x: 8.316318737270876, y: 6.794551934826884 },
        color: MatrixLayout.CYAN,
        angleToFlatEnd: -135 * radiansPerDegree,
        startMs: 68_000,
        endMs: 87_000 + 2416,
      }),
    );
    // Transformed point as a matrix:
    moreToShow.push(
      new SimpleArrow({
        pointyEnd: { x: 12.4, y: 7.77 },
        color: MatrixLayout.GREEN,
        angleToFlatEnd: 0,
        startMs: 68_000,
        endMs: 87_000 + 2416,
      }),
    );
    // Initial point in the image:
    moreToShow.push(
      new SimpleArrow({
        pointyEnd: { x: 3, y: 2.75 },
        color: MatrixLayout.CYAN,
        angleToFlatEnd: FULL_CIRCLE / 2,
        startMs: 81_500,
        endMs: 87_000 + 2416,
      }),
    );
    // Transformed point in the image:
    class RightCornerArrow extends SimpleArrow {
      show(options: ShowOptions): void {
        this.pointyEnd.y = 3.75 + slide3.transformedPoint.y;
        super.show(options);
      }
    }
    const rightCornerArrow = new RightCornerArrow({
      pointyEnd: { x: 11, y: 2.75 },
      color: MatrixLayout.GREEN,
      angleToFlatEnd: FULL_CIRCLE / 2,
      startMs: 81_500,
      endMs: 87_000 + 2416,
    });
    moreToShow.push(rightCornerArrow);
    // Transform as a matrix:
    moreToShow.push(
      new SimpleArrow({
        pointyEnd: { x: 3.6, y: 7.77 },
        color: MatrixLayout.MAGENTA,
        angleToFlatEnd: FULL_CIRCLE / 2,
        startMs: 88_000 + 2416,
        endMs: 98_000,
      }),
    );
    // Transform as a css string:
    moreToShow.push(
      new SimpleArrow({
        pointyEnd: { x: 6, y: 0.5 },
        color: MatrixLayout.MAGENTA,
        angleToFlatEnd: FULL_CIRCLE / 2,
        startMs: 93_250,
        endMs: 98_000,
      }),
    );
    // The multiplication sign:
    moreToShow.push(
      new SimpleArrow({
        pointyEnd: { x: 7.96, y: 7.6 },
        color: "black",
        angleToFlatEnd: FULL_CIRCLE * (3 / 4),
        startMs: 101_500,
        endMs: 110_000,
      }),
    );
    // Point to the points again.
    moreToShow.push(
      new SimpleArrow({
        pointyEnd: { x: 8.316318737270876, y: 6.794551934826884 },
        color: MatrixLayout.CYAN,
        angleToFlatEnd: -135 * radiansPerDegree,
        startMs: 134_000,
        endMs: 138_500,
      }),
    );
    moreToShow.push(
      new SimpleArrow({
        pointyEnd: { x: 12.4, y: 7.77 },
        color: MatrixLayout.GREEN,
        angleToFlatEnd: 0,
        startMs: 134_000,
        endMs: 138_500,
      }),
    );
    moreToShow.push(
      new SimpleArrow({
        pointyEnd: { x: 3, y: 2.75 },
        color: MatrixLayout.CYAN,
        angleToFlatEnd: FULL_CIRCLE * (3 / 4),
        startMs: 134_000,
        endMs: 138_500,
      }),
    );
    class RightCornerArrow2 extends SimpleArrow {
      show(options: ShowOptions): void {
        this.pointyEnd.x = 12 + slide4.transformedPoint.x;
        super.show(options);
      }
    }
    const rightCornerArrow2 = new RightCornerArrow2({
      pointyEnd: { x: 11, y: 2.75 },
      color: MatrixLayout.GREEN,
      angleToFlatEnd: FULL_CIRCLE * (3 / 4),
      startMs: 134_000,
      endMs: 138_500,
    });
    moreToShow.push(rightCornerArrow2);
    // Transform as a matrix again:
    moreToShow.push(
      new SimpleArrow({
        pointyEnd: { x: 3.6, y: 7.77 },
        color: MatrixLayout.MAGENTA,
        angleToFlatEnd: FULL_CIRCLE / 2,
        startMs: 139_000,
        endMs: 143_000,
      }),
    );
    // Transform as a css string again:
    moreToShow.push(
      new SimpleArrow({
        pointyEnd: { x: 6.6, y: 0.5 },
        color: MatrixLayout.MAGENTA,
        angleToFlatEnd: FULL_CIRCLE / 2,
        startMs: 139_000,
        endMs: 143_000,
      }),
    );
  }
  const bottomRowColorSchedule: Keyframe<string>[] = [
    { time: 120_000, value: MatrixLayout.BOTTOM_ROW_COLOR_BASE },
    { time: 122_000, value: myRainbow.red },
    { time: 124_000, value: myRainbow.red },
    { time: 126_000, value: "transparent" },
    { time: 129_000, value: "transparent" },
    { time: 131_000, value: MatrixLayout.BOTTOM_ROW_COLOR_BASE },
  ];
  const bottomRowBoldnessSchedule: Keyframe<number>[] = [
    { time: 122_000, value: 1 },
    { time: 124_000, value: 1.5 },
    { time: 127_000, value: 1.5 },
    { time: 128_000, value: 1 },
  ];
  const parallelCombination: Showable = {
    description: "Parallel Combination",
    duration,
    rootComponentEditor,
    fixedComponents: slideChildren,
    components: [],
    show(options) {
      MatrixLayout.bottomRowColor = interpolateColors(
        options.timeInMs,
        bottomRowColorSchedule,
      );
      MatrixLayout.bottomRowBoldnessRatio = interpolateNumbers(
        options.timeInMs,
        bottomRowBoldnessSchedule,
      );
      this.fixedComponents!.forEach((component) => {
        component.show(options);
      });
      moreToShow.forEach((component) => {
        component.show(options);
      });
      this.components?.forEach((component) => component.show(options));
    },
  };
  slideList.add(parallelCombination);
}

// MARK: Blank Sides

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

// Use this to make blank slides.
// Fill them in with the Visual Editors.
for (let i = 11; i <= 10; i++) {
  slideList.add(makeEmptySlide(`Slide ${i}`));
}

// MARK: Main Timeline Prototype

type SlideWrapperItem = {
  readonly id: string;
  type: "slide";
  /** References the `description` of a slide in `forTimeline`. */
  slideDescription: string;
  duration: number;
  startProgress: number;
  endProgress: number;
};

type TransitionItem = {
  readonly id: string;
  type: "transition";
  duration: number;
};

type TimelineItem = SlideWrapperItem | TransitionItem;

const MAIN_TIMELINE_HOLD_MS = 500;
const MAIN_TIMELINE_TRANSITION_MS = 350;

/** Self-contained canvas timeline bar: zoom, pan, click-to-seek, click-to-select. */
class TimelineDisplay {
  private viewStartMs = 0;
  private viewEndMs = 1;
  private playMs = 0;
  private totalMs = 1;

  selectedSoundClip: SoundClip | null = null;
  selectedItemIndex = -1;

  onSeek?: (ms: number) => void;
  onSelect?: (index: number) => void;
  /** Called whenever a slot's duration, startProgress, or endProgress changes. */
  onSlotChange?: () => void;
  /** Called on every sound clip mutation so the audio player can be refreshed. */
  onSoundChange?: () => void;
  /** Called when a sound clip is selected or deselected in the timeline. */
  onSoundSelect?: (clip: SoundClip | null) => void;
  /** Provide decoded PCM for waveform rendering. Set this after audio is ready. */
  getDecodedBuffer?: (url: string) => AudioBuffer | null;

  private keyDownHandler: ((e: KeyboardEvent) => void) | null = null;
  private keyUpHandler: ((e: KeyboardEvent) => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly getItems: () => readonly TimelineItem[],
    private readonly slideColors: Map<string, string>,
    private readonly getSoundClips?: () => SoundClip[],
  ) {
    this.setupEvents();
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(canvas);
  }

  /** Release document-level listeners and the ResizeObserver. */
  disconnect() {
    if (this.keyDownHandler) {
      document.removeEventListener("keydown", this.keyDownHandler);
      this.keyDownHandler = null;
    }
    if (this.keyUpHandler) {
      document.removeEventListener("keyup", this.keyUpHandler);
      this.keyUpHandler = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  setRange(startMs: number, endMs: number) {
    this.totalMs = endMs;
    this.viewStartMs = startMs;
    this.viewEndMs = endMs;
  }

  /** Update the total duration used for pan clamping without touching the current view. */
  setTotalMs(ms: number) {
    this.totalMs = ms;
  }

  setPlayMs(ms: number) {
    this.playMs = ms;
    this.draw();
  }

  private msToX(ms: number, w: number): number {
    const dur = this.viewEndMs - this.viewStartMs;
    return dur <= 0 ? 0 : ((ms - this.viewStartMs) / dur) * w;
  }

  draw() {
    const { canvas } = this;
    const dpr = window.devicePixelRatio ?? 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (w === 0 || h === 0) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    // Keep total duration in sync with items without resetting the view.
    this.totalMs = this.getItems().reduce((s, it) => s + it.duration, 0);

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);

    const hasSoundRow = !!this.getSoundClips;

    // Layout: video row on top, sound row below (when present).
    const videoH = hasSoundRow ? Math.round(h * 0.48) : Math.round(h * 0.7);
    const videoY = hasSoundRow ? 0 : Math.round((h - videoH) / 2);
    const soundY = Math.round(h * 0.56);
    const soundH = h - soundY;
    const fontSize = Math.min(12 * dpr, Math.round(videoH * 0.45));

    // Draw video items
    const items = this.getItems();
    let cursor = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const x0 = Math.round(this.msToX(cursor, w));
      const x1 = Math.round(this.msToX(cursor + item.duration, w));
      const iw = Math.max(1, x1 - x0);

      if (item.type === "slide") {
        const isHold = item.startProgress === item.endProgress;
        const color = this.slideColors.get(item.slideDescription) ?? "#888";
        ctx.globalAlpha = isHold ? 0.45 : 1;
        ctx.fillStyle = color;
        ctx.fillRect(x0, videoY, iw, videoH);
        ctx.globalAlpha = 1;

        if (iw > 4 * dpr) {
          ctx.font = `${fontSize}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0, videoY, iw, videoH);
          ctx.clip();
          ctx.fillText(item.slideDescription, x0 + iw / 2, videoY + videoH / 2);
          ctx.restore();
        }
      } else {
        ctx.fillStyle = "#aaa";
        ctx.fillRect(x0, videoY, iw, videoH);
        if (iw > 3 * dpr) {
          ctx.font = `${fontSize}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#555";
          ctx.fillText("T", x0 + iw / 2, videoY + videoH / 2);
        }
      }

      if (i === this.selectedItemIndex) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2 * dpr;
        ctx.strokeRect(x0 + dpr, videoY + dpr, iw - 2 * dpr, videoH - 2 * dpr);
        ctx.strokeStyle = "#000";
        ctx.lineWidth = dpr;
        ctx.strokeRect(x0 + 0.5, videoY + 0.5, iw - 1, videoH - 1);
      } else {
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, videoY + 0.5, iw - 1, videoH - 1);
      }

      cursor += item.duration;
    }

    // Draw anchor connectors (between video row and sound row)
    if (hasSoundRow && soundH > 0) {
      const items2 = this.getItems();
      const itemStart2 = new Map<string, number>();
      let c2 = 0;
      for (const it of items2) {
        itemStart2.set(it.id, c2);
        c2 += it.duration;
      }
      const clips2 = this.getSoundClips!();
      for (const clip of clips2) {
        if (!clip.anchor) continue;
        const start2 = itemStart2.get(clip.anchor.targetId);
        if (start2 === undefined) continue;
        const anchorMs = start2 + clip.anchor.targetMs;
        const ax = Math.round(this.msToX(anchorMs, w));
        const selfMs =
          clip.anchor.selfHandle === "start"
            ? 0
            : clip.anchor.selfHandle === "end"
              ? clip.lengthMs
              : clip.anchor.selfHandle * clip.lengthMs;
        const clipX = Math.round(this.msToX(clip.startMsIntoScene + selfMs, w));
        const isSelected = clip === this.selectedSoundClip;
        const connColor = isSelected ? "#f0b429" : "#e8a020";
        ctx.strokeStyle = connColor;
        ctx.lineWidth = isSelected ? 1.5 * dpr : dpr;
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.beginPath();
        ctx.moveTo(ax, videoY + videoH);
        ctx.lineTo(clipX, soundY);
        ctx.stroke();
        ctx.setLineDash([]);
        // Diamond at video row bottom
        ctx.fillStyle = connColor;
        const d = 4 * dpr;
        ctx.beginPath();
        ctx.moveTo(ax, videoY + videoH - d);
        ctx.lineTo(ax + d, videoY + videoH);
        ctx.lineTo(ax, videoY + videoH + d);
        ctx.lineTo(ax - d, videoY + videoH);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Draw sound row
    if (hasSoundRow && soundH > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.07)";
      ctx.fillRect(0, soundY, w, soundH);

      const clips = this.getSoundClips!();
      const soundFontSize = Math.min(11 * dpr, Math.round(soundH * 0.3));
      const EDGE_W = Math.max(3, Math.round(4 * dpr));

      for (const clip of clips) {
        const cx0 = Math.round(this.msToX(clip.startMsIntoScene, w));
        const cx1 = Math.round(
          this.msToX(clip.startMsIntoScene + clip.lengthMs, w),
        );
        const cw = Math.max(2, cx1 - cx0);
        const isSelected = clip === this.selectedSoundClip;

        // Background fill
        ctx.fillStyle = isSelected ? "#1f618d" : "#2e86c1";
        ctx.fillRect(cx0, soundY, cw, soundH);

        // Waveform (min/max bars per pixel, drawn in the clip's own region)
        const buf = this.getDecodedBuffer?.(clip.source) ?? null;
        if (buf && cw > 2) {
          const data = buf.getChannelData(0);
          const rate = buf.sampleRate;
          const msToSample = (ms: number) => (ms / 1000) * rate;
          const total = data.length;
          const waveColor = isSelected
            ? "rgba(255,255,255,0.9)"
            : "rgba(255,255,255,0.7)";
          ctx.fillStyle = waveColor;
          const mid = soundY + soundH / 2;
          for (let px = 0; px < cw; px++) {
            // Map this pixel column to a window in the source file
            const frac0 = px / cw;
            const frac1 = (px + 1) / cw;
            const s0 = Math.floor(
              msToSample(clip.startMsIntoClip + frac0 * clip.lengthMs),
            );
            const s1 = Math.floor(
              msToSample(clip.startMsIntoClip + frac1 * clip.lengthMs),
            );
            const from = Math.max(0, s0);
            const to = Math.min(total, Math.max(s0 + 1, s1));
            if (to <= from) continue;
            let mn = data[from]!;
            let mx = mn;
            for (let i = from + 1; i < to; i++) {
              const v = data[i]!;
              if (v < mn) mn = v;
              else if (v > mx) mx = v;
            }
            const top = mid + mn * (soundH / 2);
            const bot = mid + mx * (soundH / 2);
            ctx.fillRect(
              cx0 + px,
              Math.round(top),
              1,
              Math.max(1, Math.round(bot - top)),
            );
          }
        }

        // Darker edge handles
        ctx.fillStyle = isSelected ? "#0e3a52" : "#1a5276";
        ctx.fillRect(cx0, soundY, Math.min(EDGE_W, cw), soundH);
        ctx.fillRect(
          Math.max(cx0, cx1 - EDGE_W),
          soundY,
          Math.min(EDGE_W, cw),
          soundH,
        );

        // Notes label (bottom strip)
        if (cw > 10 * dpr) {
          const labelH = Math.round(soundH * 0.28);
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fillRect(cx0, soundY + soundH - labelH, cw, labelH);
          ctx.font = `${soundFontSize}px sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "white";
          ctx.save();
          ctx.beginPath();
          ctx.rect(
            cx0 + EDGE_W + 2,
            soundY + soundH - labelH,
            Math.max(0, cw - 2 * EDGE_W - 4),
            labelH,
          );
          ctx.clip();
          ctx.fillText(
            clip.notes.trim(),
            cx0 + EDGE_W + 4,
            soundY + soundH - labelH / 2,
          );
          ctx.restore();
        }

        ctx.strokeStyle = isSelected
          ? "rgba(255,255,255,0.8)"
          : "rgba(0,0,0,0.3)";
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.strokeRect(cx0 + 0.5, soundY + 0.5, cw - 1, soundH - 1);
      }
    }

    // Play head (full height)
    const px = Math.round(this.msToX(this.playMs, w));
    ctx.fillStyle = "#d00";
    ctx.fillRect(px, 0, Math.max(1, Math.round(dpr)), h);
  }

  private setupEvents() {
    const { canvas } = this;
    let downX = 0;
    let downStart = 0;
    let downEnd = 0;
    let panning = false;

    // Selected-slot edge drag state
    let edgeDragItem: TimelineItem | null = null;
    let edgeDragEdge: "left" | "right" = "right";
    let edgeDragStartMs = 0;
    let edgeDragStartSp = 0;
    let edgeDragStartEp = 0;
    let edgeDragStartD = 0;
    let edgeDragV = 0; // (ep - sp) / d at drag start
    // clip → targetMs at drag start; used to rescale anchors proportionally
    let edgeDragAnchorTargets: Map<SoundClip, number> = new Map();
    let lastEdgeDelta = 0; // last computed drag delta in ms; re-used on Shift toggle
    let lastHoverClientX = 0;
    let lastHoverClientY = 0;

    const cancelEdgeDrag = () => {
      if (!edgeDragItem) return;
      edgeDragItem.duration = edgeDragStartD;
      if (edgeDragItem.type === "slide") {
        edgeDragItem.startProgress = edgeDragStartSp;
        edgeDragItem.endProgress = edgeDragStartEp;
      }
      for (const [clip, tMs] of edgeDragAnchorTargets) {
        if (clip.anchor) clip.anchor.targetMs = tMs;
      }
      edgeDragItem = null;
      canvas.style.cursor = "crosshair";
      this.draw();
      this.onSlotChange?.();
    };

    const applyEdgeDrag = (delta: number, isShift: boolean) => {
      if (!edgeDragItem) return;
      const slideItem =
        edgeDragItem.type === "slide"
          ? (edgeDragItem as SlideWrapperItem)
          : null;

      if (edgeDragEdge === "right") {
        if (isShift && slideItem && edgeDragV > 0) {
          const rawD = Math.max(50, edgeDragStartD + delta);
          const newEp = Math.min(1, edgeDragStartSp + edgeDragV * rawD);
          slideItem.endProgress = newEp;
          edgeDragItem.duration = (newEp - edgeDragStartSp) / edgeDragV;
        } else {
          edgeDragItem.duration = Math.max(50, edgeDragStartD + delta);
          if (slideItem) slideItem.endProgress = edgeDragStartEp;
        }
      } else {
        // left
        if (isShift && slideItem && edgeDragV > 0) {
          const newSp = Math.max(
            0,
            Math.min(
              edgeDragStartEp - edgeDragV * 50,
              edgeDragStartSp - edgeDragV * delta,
            ),
          );
          slideItem.startProgress = newSp;
          edgeDragItem.duration = Math.max(
            50,
            (edgeDragStartEp - newSp) / edgeDragV,
          );
        } else {
          edgeDragItem.duration = Math.max(50, edgeDragStartD + delta);
          if (slideItem) slideItem.startProgress = edgeDragStartSp;
        }
      }

      if (!isShift && edgeDragStartD > 0) {
        const ratio = edgeDragItem.duration / edgeDragStartD;
        for (const [clip, tMs] of edgeDragAnchorTargets) {
          if (clip.anchor)
            clip.anchor.targetMs = Math.min(edgeDragItem.duration, tMs * ratio);
        }
      }

      canvas.style.cursor = isShift ? "col-resize" : "ew-resize";
      this.draw();
      this.onSlotChange?.();
    };

    /** Returns "left" or "right" if the pointer is near the edge of the selected slot. */
    const selectedSlotEdgeHit = (e: PointerEvent): "left" | "right" | null => {
      const idx = this.selectedItemIndex;
      if (idx < 0) return null;
      const items = this.getItems();
      if (idx >= items.length) return null;
      const rect = canvas.getBoundingClientRect();
      if (this.getSoundClips && (e.clientY - rect.top) / rect.height >= 0.5)
        return null;
      let cur = 0;
      for (let i = 0; i < idx; i++) cur += items[i]!.duration;
      const item = items[idx]!;
      const ms = msFromEvent(e);
      const edgeMs = (8 / rect.width) * (this.viewEndMs - this.viewStartMs);
      if (Math.abs(ms - cur) <= edgeMs) return "left";
      if (Math.abs(ms - (cur + item.duration)) <= edgeMs) return "right";
      return null;
    };

    // Sound clip drag state
    let soundDragClip: SoundClip | null = null;
    let soundDragHandle: "left" | "right" | "center" = "center";
    let soundDragStartMs = 0;
    let soundDragStartScene = 0;
    let soundDragStartClipStart = 0;
    let soundDragStartLength = 0;
    let soundDragStartAnchorOffset = 0;

    const cancelSoundDrag = () => {
      if (!soundDragClip) return;
      soundDragClip.startMsIntoScene = soundDragStartScene;
      soundDragClip.startMsIntoClip = soundDragStartClipStart;
      soundDragClip.lengthMs = soundDragStartLength;
      if (soundDragClip.anchor)
        soundDragClip.anchor.offsetMs = soundDragStartAnchorOffset;
      soundDragClip = null;
      this.draw();
      this.onSoundChange?.();
    };

    const msFromEvent = (e: PointerEvent): number => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      return (
        this.viewStartMs +
        (x / rect.width) * (this.viewEndMs - this.viewStartMs)
      );
    };

    /** Returns which sound clip and handle zone the pointer is over, or null. */
    const soundHitTest = (
      e: PointerEvent,
    ): { clip: SoundClip; handle: "left" | "right" | "center" } | null => {
      if (!this.getSoundClips) return null;
      const rect = canvas.getBoundingClientRect();
      if ((e.clientY - rect.top) / rect.height < 0.5) return null; // video row
      const ms = msFromEvent(e);
      const edgeMs = (8 / rect.width) * (this.viewEndMs - this.viewStartMs);
      const clips = this.getSoundClips();
      // Reverse so last-drawn (visually on top) wins on overlap
      for (let i = clips.length - 1; i >= 0; i--) {
        const clip = clips[i]!;
        const start = clip.startMsIntoScene;
        const end = start + clip.lengthMs;
        if (ms < start - edgeMs || ms > end + edgeMs) continue;
        if (Math.abs(ms - start) <= edgeMs) return { clip, handle: "left" };
        if (Math.abs(ms - end) <= edgeMs) return { clip, handle: "right" };
        if (ms >= start && ms <= end) return { clip, handle: "center" };
      }
      return null;
    };

    const indexAtMs = (ms: number): number => {
      const items = this.getItems();
      let cursor = 0;
      for (let i = 0; i < items.length; i++) {
        cursor += items[i]!.duration;
        if (ms < cursor) return i;
      }
      return Math.max(0, items.length - 1);
    };

    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);

      const edgeHit = selectedSlotEdgeHit(e);
      if (edgeHit) {
        const items = this.getItems();
        const item = items[this.selectedItemIndex]!;
        edgeDragItem = item;
        edgeDragEdge = edgeHit;
        edgeDragStartMs = msFromEvent(e);
        edgeDragStartD = item.duration;
        edgeDragStartSp = item.type === "slide" ? item.startProgress : 0;
        edgeDragStartEp = item.type === "slide" ? item.endProgress : 1;
        edgeDragV =
          edgeDragStartD > 0
            ? (edgeDragStartEp - edgeDragStartSp) / edgeDragStartD
            : 0;
        edgeDragAnchorTargets = new Map();
        if (this.getSoundClips) {
          for (const clip of this.getSoundClips()) {
            if (clip.anchor?.targetId === item.id) {
              edgeDragAnchorTargets.set(clip, clip.anchor.targetMs);
            }
          }
        }
        canvas.style.cursor = e.shiftKey ? "col-resize" : "ew-resize";
        return;
      }

      const soundHit = soundHitTest(e);
      if (soundHit) {
        soundDragClip = soundHit.clip;
        soundDragHandle = soundHit.handle;
        soundDragStartMs = msFromEvent(e);
        soundDragStartScene = soundHit.clip.startMsIntoScene;
        soundDragStartClipStart = soundHit.clip.startMsIntoClip;
        soundDragStartLength = soundHit.clip.lengthMs;
        soundDragStartAnchorOffset = soundHit.clip.anchor?.offsetMs ?? 0;
        this.selectedSoundClip = soundHit.clip;
        this.onSoundSelect?.(soundHit.clip);
        this.draw();
        return;
      }

      downX = e.clientX;
      downStart = this.viewStartMs;
      downEnd = this.viewEndMs;
      panning = false;
    });

    canvas.addEventListener("pointermove", (e) => {
      // Cursor update while hovering (no button held)
      if (e.buttons === 0) {
        lastHoverClientX = e.clientX;
        lastHoverClientY = e.clientY;
        const hit = selectedSlotEdgeHit(e);
        canvas.style.cursor = hit
          ? e.shiftKey
            ? "col-resize"
            : "ew-resize"
          : "crosshair";
        return;
      }
      if (!(e.buttons & 1)) return;

      // Edge drag on selected slot
      if (edgeDragItem) {
        lastEdgeDelta = msFromEvent(e) - edgeDragStartMs;
        applyEdgeDrag(lastEdgeDelta, e.shiftKey);
        return;
      }

      if (soundDragClip) {
        const delta = msFromEvent(e) - soundDragStartMs;
        if (soundDragHandle === "center") {
          soundDragClip.startMsIntoScene = Math.max(
            0,
            soundDragStartScene + delta,
          );
          if (soundDragClip.anchor) {
            soundDragClip.anchor.offsetMs = soundDragStartAnchorOffset + delta;
          }
        } else if (soundDragHandle === "left") {
          // Right end stays fixed; trim from the start of the audio clip.
          const rightEnd = soundDragStartScene + soundDragStartLength;
          const newScene = soundDragStartScene + delta;
          const newClipStart = soundDragStartClipStart + delta;
          const newLength = rightEnd - newScene;
          if (newScene >= 0 && newClipStart >= 0 && newLength >= 100) {
            soundDragClip.startMsIntoScene = newScene;
            soundDragClip.startMsIntoClip = newClipStart;
            soundDragClip.lengthMs = newLength;
            if (soundDragClip.anchor) {
              soundDragClip.anchor.offsetMs =
                soundDragStartAnchorOffset + delta;
            }
          }
        } else {
          // Right edge: extend or shorten the clip; startMsIntoClip stays fixed.
          const newLength = soundDragStartLength + delta;
          if (newLength >= 100) soundDragClip.lengthMs = newLength;
        }
        this.draw();
        return;
      }

      const dx = e.clientX - downX;
      if (!panning && Math.abs(dx) > 4) panning = true;
      if (!panning) return;
      const rect = canvas.getBoundingClientRect();
      const msPerPx = (downEnd - downStart) / rect.width;
      const dur = downEnd - downStart;
      let s = downStart - dx * msPerPx;
      s = Math.max(0, Math.min(this.totalMs - dur, s));
      this.viewStartMs = s;
      this.viewEndMs = s + dur;
      this.draw();
    });

    canvas.addEventListener("pointercancel", () => {
      cancelEdgeDrag();
      cancelSoundDrag();
    });

    const updateHoverCursor = (shiftKey: boolean) => {
      const fakeEvent = {
        clientX: lastHoverClientX,
        clientY: lastHoverClientY,
      } as PointerEvent;
      const hit = selectedSlotEdgeHit(fakeEvent);
      canvas.style.cursor = hit
        ? shiftKey
          ? "col-resize"
          : "ew-resize"
        : "crosshair";
    };

    this.keyDownHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (edgeDragItem) {
          e.preventDefault();
          cancelEdgeDrag();
        } else if (soundDragClip) {
          e.preventDefault();
          cancelSoundDrag();
        }
      } else if (e.key === "Shift") {
        if (edgeDragItem) applyEdgeDrag(lastEdgeDelta, true);
        else updateHoverCursor(true);
      }
    };
    document.addEventListener("keydown", this.keyDownHandler);

    this.keyUpHandler = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        if (edgeDragItem) applyEdgeDrag(lastEdgeDelta, false);
        else updateHoverCursor(false);
      }
    };
    document.addEventListener("keyup", this.keyUpHandler);

    canvas.addEventListener("pointerup", (e) => {
      if (e.button !== 0) return;

      if (edgeDragItem) {
        edgeDragItem = null;
        canvas.style.cursor = "crosshair";
        this.onSlotChange?.();
        return;
      }

      if (soundDragClip) {
        soundDragClip = null;
        this.onSoundChange?.();
        return;
      }

      if (!panning) {
        const ms = msFromEvent(e);
        const rect = canvas.getBoundingClientRect();
        const inSoundRow =
          this.getSoundClips && (e.clientY - rect.top) / rect.height >= 0.5;
        if (inSoundRow) {
          // Click in sound row but not starting a drag → select / deselect
          const hit = soundHitTest(e);
          if (!hit) {
            this.selectedSoundClip = null;
            this.onSoundSelect?.(null);
            this.draw();
          }
        } else {
          const clamped = Math.max(0, Math.min(this.totalMs, ms));
          this.onSeek?.(clamped);
          this.onSelect?.(indexAtMs(ms));
        }
      }
      panning = false;
    });

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cursorMs =
          this.viewStartMs +
          (cx / rect.width) * (this.viewEndMs - this.viewStartMs);
        const sensitivity = 1 / 7;
        const factor = e.deltaY > 0 ? 1.5 ** sensitivity : 1.5 ** -sensitivity;
        let newStart = cursorMs + (this.viewStartMs - cursorMs) * factor;
        let newEnd = cursorMs + (this.viewEndMs - cursorMs) * factor;
        newStart = Math.max(0, newStart);
        newEnd = Math.min(this.totalMs, newEnd);
        if (newEnd - newStart >= 100) {
          this.viewStartMs = newStart;
          this.viewEndMs = newEnd;
          this.draw();
        }
      },
      { passive: false },
    );
  }
}

/** Parse a single "Copy One" JSON-ish object from the sound explorer clipboard. */
function parseCopyOneClip(text: string): SoundClip | null {
  try {
    let s = text.trim();
    // Strip optional trailing comma
    if (s.endsWith(",")) s = s.slice(0, -1);
    // Strip outer braces if present
    if (s.startsWith("{") && s.endsWith("}")) {
      s = s.slice(1, -1);
    }
    // Remove // comment lines (these contain the notes text)
    let notes = "";
    s = s.replace(/\/\/\s*"([^"]*)"/g, (_, captured) => {
      notes = captured;
      return "";
    });
    s = s.replace(/\/\/[^\n]*/g, "");
    // Quote unquoted keys
    s = s.replace(
      /\b(notes|source|startMsIntoScene|startMsIntoClip|lengthMs)\s*:/g,
      '"$1":',
    );
    // Remove trailing commas before } or ]
    s = s.replace(/,(\s*[}\]])/g, "$1");
    const obj = JSON.parse(`{${s}}`) as Record<string, unknown>;
    const clip: SoundClip = {
      id: crypto.randomUUID(),
      notes: typeof obj.notes === "string" ? obj.notes : notes,
      source: typeof obj.source === "string" ? obj.source : "",
      startMsIntoScene:
        typeof obj.startMsIntoScene === "number" ? obj.startMsIntoScene : 0,
      startMsIntoClip:
        typeof obj.startMsIntoClip === "number" ? obj.startMsIntoClip : 0,
      lengthMs: typeof obj.lengthMs === "number" ? obj.lengthMs : 1000,
    };
    if (!clip.source) return null;
    return clip;
  } catch {
    return null;
  }
}

class MainTimeline {
  readonly description = "Main Timeline";
  readonly items: TimelineItem[];
  readonly soundClips: SoundClip[];
  private readonly slides: readonly Showable[];
  private readonly slideColors: Map<string, string>;
  private selectedIndex = -1;
  private selectedSoundClip: SoundClip | null = null;
  private display: TimelineDisplay | null = null;
  private soundEditorDiv: HTMLElement | null = null;
  private visAPI: VisualEditorAPI | undefined;
  private rafId = 0;

  constructor(slides: readonly Showable[], soundClips: SoundClip[] = []) {
    this.slides = slides;
    this.soundClips = soundClips;
    this.items = [];

    // Assign colors by unique description round-robin through myRainbow.
    this.slideColors = new Map();
    const seen: string[] = [];
    for (const slide of slides) {
      if (!this.slideColors.has(slide.description)) {
        const color = myRainbow[(seen.length * 3) % myRainbow.length]!;
        this.slideColors.set(slide.description, color);
        seen.push(slide.description);
      }
    }

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]!;
      if (i > 0) {
        this.items.push({
          id: crypto.randomUUID(),
          type: "transition",
          duration: MAIN_TIMELINE_TRANSITION_MS,
        });
      }
      this.items.push({
        id: crypto.randomUUID(),
        type: "slide",
        slideDescription: slide.description,
        duration: MAIN_TIMELINE_HOLD_MS,
        startProgress: 0,
        endProgress: 0,
      });
      this.items.push({
        id: crypto.randomUUID(),
        type: "slide",
        slideDescription: slide.description,
        duration: slide.duration,
        startProgress: 0,
        endProgress: 1,
      });
      this.items.push({
        id: crypto.randomUUID(),
        type: "slide",
        slideDescription: slide.description,
        duration: MAIN_TIMELINE_HOLD_MS,
        startProgress: 1,
        endProgress: 1,
      });
    }
  }

  get duration(): number {
    return this.items.reduce((s, it) => s + it.duration, 0);
  }

  /** Recomputes startMsIntoScene for every anchored clip from its anchor. */
  /** Scales targetMs for all clips anchored to item when its duration changes (speed-change mode). */
  private rescaleAnchors(item: TimelineItem, oldDuration: number): void {
    if (oldDuration <= 0) return;
    const ratio = item.duration / oldDuration;
    for (const clip of this.soundClips) {
      if (clip.anchor?.targetId === item.id) {
        clip.anchor.targetMs = Math.min(
          item.duration,
          clip.anchor.targetMs * ratio,
        );
      }
    }
  }

  /** Splits the selected slide wrapper at the current play position. */
  private splitSelected(): void {
    const idx = this.selectedIndex;
    if (idx < 0 || idx >= this.items.length) return;
    const item = this.items[idx]!;
    if (item.type !== "slide") return;

    let itemStart = 0;
    for (let i = 0; i < idx; i++) itemStart += this.items[i]!.duration;

    const playMs = this.visAPI?.getCurrentTimeMs() ?? itemStart;
    const splitMs = Math.max(
      1,
      Math.min(item.duration - 1, playMs - itemStart),
    );
    const splitT = splitMs / item.duration;
    const splitProgress =
      item.startProgress + splitT * (item.endProgress - item.startProgress);

    const secondId = crypto.randomUUID();
    const secondItem: SlideWrapperItem = {
      id: secondId,
      type: "slide",
      slideDescription: item.slideDescription,
      duration: item.duration - splitMs,
      startProgress: splitProgress,
      endProgress: item.endProgress,
    };

    // Mutate first item in place to preserve its id (anchors to first half need no update)
    item.duration = splitMs;
    item.endProgress = splitProgress;

    this.items.splice(idx + 1, 0, secondItem);

    // Clips anchored at or after the split point move to the second item
    for (const clip of this.soundClips) {
      if (
        clip.anchor?.targetId === item.id &&
        clip.anchor.targetMs >= splitMs
      ) {
        clip.anchor.targetId = secondId;
        clip.anchor.targetMs -= splitMs;
      }
    }
  }

  private resolveLayout(): void {
    const itemStart = new Map<string, number>();
    let cursor = 0;
    for (const item of this.items) {
      itemStart.set(item.id, cursor);
      cursor += item.duration;
    }
    for (const clip of this.soundClips) {
      if (!clip.anchor) continue;
      const { targetId, targetMs, selfHandle, offsetMs } = clip.anchor;
      const start = itemStart.get(targetId);
      if (start === undefined) continue;
      const anchorSceneMs = start + targetMs;
      const selfMs =
        selfHandle === "start"
          ? 0
          : selfHandle === "end"
            ? clip.lengthMs
            : selfHandle * clip.lengthMs;
      clip.startMsIntoScene = anchorSceneMs - selfMs + offsetMs;
    }
  }

  /** Pins a clip's start to the slot playing at the current time. */
  private autoAnchor(clip: SoundClip): void {
    const playMs = this.visAPI?.getCurrentTimeMs() ?? clip.startMsIntoScene;
    let cursor = 0;
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;
      if (playMs <= cursor + item.duration || i === this.items.length - 1) {
        const targetMs = Math.max(0, Math.min(item.duration, playMs - cursor));
        const anchorSceneMs = cursor + targetMs;
        clip.anchor = {
          targetId: item.id,
          targetMs,
          selfHandle: "start",
          // offsetMs keeps the clip at its current position.
          offsetMs: clip.startMsIntoScene - anchorSceneMs,
        };
        return;
      }
      cursor += item.duration;
    }
  }

  private getSlideByDescription(desc: string): Showable | undefined {
    return this.slides.find((s) => s.description === desc);
  }

  private prevSlide(fromIndex: number): SlideWrapperItem | undefined {
    for (let i = fromIndex - 1; i >= 0; i--) {
      if (this.items[i]!.type === "slide")
        return this.items[i] as SlideWrapperItem;
    }
    return undefined;
  }

  private nextSlide(fromIndex: number): SlideWrapperItem | undefined {
    for (let i = fromIndex + 1; i < this.items.length; i++) {
      if (this.items[i]!.type === "slide")
        return this.items[i] as SlideWrapperItem;
    }
    return undefined;
  }

  show(options: ShowOptions): void {
    let cursor = 0;
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;
      const localTime = options.timeInMs - cursor;
      const isLast = i === this.items.length - 1;
      if (localTime <= item.duration || isLast) {
        if (item.type === "slide") {
          const t =
            item.duration > 0
              ? Math.max(0, Math.min(1, localTime / item.duration))
              : 0;
          const progress = lerp(item.startProgress, item.endProgress, t);
          const slide = this.getSlideByDescription(item.slideDescription);
          if (slide) {
            slide.show({ ...options, timeInMs: progress * slide.duration });
          } else {
            options.context.fillStyle = "rgba(255,0,0,0.3)";
            options.context.fillRect(0, 0, 16, 9);
          }
        } else {
          // Transition: slide prev out left, slide next in from right.
          // Guard: only look at slide neighbors, not other transitions (no recursion).
          const tran =
            item.duration > 0
              ? Math.max(0, Math.min(1, localTime / item.duration))
              : 0;
          const prev = this.prevSlide(i);
          const next = this.nextSlide(i);
          if (!prev && !next) {
            options.context.fillStyle = "rgba(255,0,0,0.3)";
            options.context.fillRect(0, 0, 16, 9);
          } else {
            const { context } = options;
            context.save();
            context.beginPath();
            context.rect(0, 0, 16, 9);
            context.clip();
            if (prev) {
              const slide = this.getSlideByDescription(prev.slideDescription);
              if (slide) {
                context.save();
                context.translate(lerp(0, -16, tran), 0);
                slide.show({
                  ...options,
                  timeInMs: prev.endProgress * slide.duration,
                });
                context.restore();
              }
            }
            if (next) {
              const slide = this.getSlideByDescription(next.slideDescription);
              if (slide) {
                context.save();
                context.translate(lerp(16, 0, tran), 0);
                slide.show({
                  ...options,
                  timeInMs: next.startProgress * slide.duration,
                });
                context.restore();
              }
            }
            context.restore();
          }
        }
        break;
      }
      cursor += item.duration;
    }
  }

  readonly rootComponentEditor: RootComponentEditor = {
    start: (visAPI) => {
      this.visAPI = visAPI;
      return this.buildEditorPanel();
    },
    suspend: () => {
      cancelAnimationFrame(this.rafId);
      this.display?.disconnect();
      this.visAPI = undefined;
    },
    update: () => {},
    selectionChanged: () => {},
    resetAll: () => {},
  };

  private buildEditorPanel(): HTMLElement {
    const slideNames = this.slides.map((s) => s.description);

    const container = document.createElement("div");
    container.style.cssText =
      "display:flex;flex-direction:column;gap:6px;padding:6px;";

    // Timeline canvas (taller to accommodate sound row)
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "width:100%;height:100px;cursor:crosshair;display:block;touch-action:none;";
    canvas.title = "Click to seek & select · Drag to pan · Scroll to zoom";
    container.appendChild(canvas);

    const display = new TimelineDisplay(
      canvas,
      () => this.items,
      this.slideColors,
      () => this.soundClips,
    );
    this.display = display;
    display.setRange(0, this.duration);
    display.getDecodedBuffer = (url) =>
      this.visAPI?.getDecodedBuffer?.(url) ?? null;

    display.onSeek = (ms) => this.visAPI?.seek(ms);
    display.onSelect = (idx) => {
      this.selectedIndex = idx;
      display.selectedItemIndex = idx;
      display.draw();
      refreshVideoEditor();
    };
    display.onSlotChange = () => {
      refreshVideoEditor();
    };
    display.onSoundChange = () => {
      this.resolveLayout();
      this.visAPI?.refreshGUI("sound");
      refreshSoundEditor();
    };
    display.onSoundSelect = (clip) => {
      this.selectedSoundClip = clip;
      refreshSoundEditor();
    };

    // RAF loop to animate play head
    const tick = () => {
      this.resolveLayout();
      display.setPlayMs(this.visAPI?.getCurrentTimeMs() ?? 0);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);

    const row = (labelText: string, input: HTMLElement): HTMLElement => {
      const r = document.createElement("div");
      r.style.cssText = "display:flex;gap:4px;align-items:center;";
      const l = document.createElement("label");
      l.textContent = labelText;
      l.style.minWidth = "100px";
      r.append(l, input);
      return r;
    };

    // ── Video item editor ──────────────────────────────────────────────────
    const editorDiv = document.createElement("div");
    editorDiv.style.cssText =
      "display:flex;flex-direction:column;gap:4px;font-size:12px;";
    container.appendChild(editorDiv);

    const refreshVideoEditor = () => {
      editorDiv.innerHTML = "";
      const idx = this.selectedIndex;
      if (idx < 0 || idx >= this.items.length) {
        editorDiv.textContent = "Click a video item to edit.";
        return;
      }
      const item = this.items[idx]!;

      const title = document.createElement("div");
      title.style.fontWeight = "bold";
      title.textContent =
        item.type === "slide"
          ? `Slide wrapper [${idx}]`
          : `Transition [${idx}]`;
      editorDiv.appendChild(title);

      const durInput = document.createElement("input");
      durInput.type = "number";
      durInput.min = "1";
      durInput.value = String(Math.round(item.duration));
      durInput.style.width = "80px";
      durInput.addEventListener("change", () => {
        const v = parseFloat(durInput.value);
        if (v > 0) {
          const oldD = item.duration;
          item.duration = v;
          this.rescaleAnchors(item, oldD);
          display.draw();
        }
      });
      editorDiv.appendChild(row("Duration ms", durInput));

      if (item.type === "slide") {
        const sel = document.createElement("select");
        for (const desc of slideNames) {
          const opt = document.createElement("option");
          opt.value = desc;
          opt.textContent = desc;
          if (desc === item.slideDescription) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener("change", () => {
          item.slideDescription = sel.value;
          display.draw();
        });
        editorDiv.appendChild(row("Slide", sel));

        const spInput = document.createElement("input");
        spInput.type = "number";
        spInput.step = "0.01";
        spInput.min = "0";
        spInput.max = "1";
        spInput.value = String(item.startProgress);
        spInput.style.width = "80px";
        spInput.addEventListener("change", () => {
          item.startProgress = Math.max(
            0,
            Math.min(1, parseFloat(spInput.value)),
          );
        });
        editorDiv.appendChild(row("Start progress", spInput));

        const epInput = document.createElement("input");
        epInput.type = "number";
        epInput.step = "0.01";
        epInput.min = "0";
        epInput.max = "1";
        epInput.value = String(item.endProgress);
        epInput.style.width = "80px";
        epInput.addEventListener("change", () => {
          item.endProgress = Math.max(
            0,
            Math.min(1, parseFloat(epInput.value)),
          );
        });
        editorDiv.appendChild(row("End progress", epInput));

        const splitBtn = document.createElement("button");
        splitBtn.textContent = "Split here";
        splitBtn.title = "Split this slot at the current play position";
        splitBtn.addEventListener("click", () => {
          this.splitSelected();
          display.selectedItemIndex = this.selectedIndex;
          display.draw();
          refreshVideoEditor();
        });
        editorDiv.appendChild(splitBtn);
      }

      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete item";
      delBtn.addEventListener("click", () => {
        this.items.splice(idx, 1);
        this.selectedIndex = -1;
        display.selectedItemIndex = -1;
        display.draw();
        refreshVideoEditor();
        this.visAPI?.refreshGUI("structure");
      });
      editorDiv.appendChild(delBtn);
    };

    refreshVideoEditor();

    // ── Sound clip editor ──────────────────────────────────────────────────
    const hr = document.createElement("hr");
    hr.style.cssText = "margin:4px 0;border:none;border-top:1px solid #aaa;";
    container.appendChild(hr);

    const soundEditorDiv = document.createElement("div");
    soundEditorDiv.style.cssText =
      "display:flex;flex-direction:column;gap:4px;font-size:12px;";
    this.soundEditorDiv = soundEditorDiv;
    container.appendChild(soundEditorDiv);

    const numInput = (
      value: number,
      onChange: (v: number) => void,
    ): HTMLInputElement => {
      const inp = document.createElement("input");
      inp.type = "number";
      inp.value = String(Math.round(value * 100) / 100);
      inp.step = "100";
      inp.style.width = "90px";
      inp.addEventListener("change", () => {
        const v = parseFloat(inp.value);
        if (isFinite(v)) onChange(v);
      });
      return inp;
    };

    const refreshSoundEditor = () => {
      soundEditorDiv.innerHTML = "";
      const clip = this.selectedSoundClip;

      // Toolbar: add + paste buttons
      const toolbar = document.createElement("div");
      toolbar.style.cssText = "display:flex;gap:4px;align-items:center;";
      const soundTitle = document.createElement("span");
      soundTitle.style.cssText = "font-weight:bold;flex:1;";
      soundTitle.textContent = clip ? "Sound clip" : "Sounds";
      toolbar.appendChild(soundTitle);

      const addBtn = document.createElement("button");
      addBtn.textContent = "Add clip";
      addBtn.addEventListener("click", () => {
        const newClip: SoundClip = {
          id: crypto.randomUUID(),
          notes: "",
          source: "",
          startMsIntoScene: this.visAPI?.getCurrentTimeMs() ?? 0,
          startMsIntoClip: 0,
          lengthMs: 3000,
        };
        this.autoAnchor(newClip);
        this.soundClips.push(newClip);
        display.selectedSoundClip = newClip;
        this.selectedSoundClip = newClip;
        display.draw();
        this.visAPI?.refreshGUI("sound");
        refreshSoundEditor();
      });
      toolbar.appendChild(addBtn);

      const pasteBtn = document.createElement("button");
      pasteBtn.textContent = "Paste clip";
      pasteBtn.title = 'Paste a "Copy One" clip from the sound explorer';
      pasteBtn.addEventListener("click", async () => {
        try {
          const text = await navigator.clipboard.readText();
          const parsed = parseCopyOneClip(text);
          if (!parsed) {
            alert(
              "Clipboard doesn't look like a sound clip. Expected the 'Copy One' format from the sound explorer.",
            );
            return;
          }
          parsed.startMsIntoScene = this.visAPI?.getCurrentTimeMs() ?? 0;
          this.autoAnchor(parsed);
          this.soundClips.push(parsed);
          display.selectedSoundClip = parsed;
          this.selectedSoundClip = parsed;
          display.draw();
          this.visAPI?.refreshGUI("sound");
          refreshSoundEditor();
        } catch {
          alert(
            "Could not read clipboard. Make sure you've granted clipboard permission.",
          );
        }
      });
      toolbar.appendChild(pasteBtn);

      soundEditorDiv.appendChild(toolbar);

      if (!clip) {
        const hint = document.createElement("div");
        hint.style.cssText = "color:#888;font-size:11px;";
        hint.textContent = `${this.soundClips.length} clip(s). Click a clip in the timeline to edit.`;
        soundEditorDiv.appendChild(hint);
        return;
      }

      // Notes
      const notesArea = document.createElement("textarea");
      notesArea.rows = 2;
      notesArea.value = clip.notes;
      notesArea.style.cssText =
        "width:100%;box-sizing:border-box;resize:vertical;font-size:11px;";
      notesArea.addEventListener("input", () => {
        clip.notes = notesArea.value;
        display.draw();
      });
      soundEditorDiv.appendChild(row("Notes", notesArea));

      // Source
      const srcInput = document.createElement("input");
      srcInput.type = "text";
      srcInput.value = clip.source;
      srcInput.style.cssText = "flex:1;min-width:0;font-size:11px;";
      srcInput.addEventListener("change", () => {
        clip.source = srcInput.value;
        this.visAPI?.refreshGUI("sound");
      });
      soundEditorDiv.appendChild(row("Source", srcInput));

      // Anchor section
      const anchorDiv = document.createElement("div");
      anchorDiv.style.cssText = "display:flex;flex-direction:column;gap:3px;";
      if (clip.anchor) {
        // Find the slot description for the label
        const targetItem = this.items.find(
          (it) => it.id === clip.anchor!.targetId,
        );
        const targetLabel =
          targetItem?.type === "slide"
            ? targetItem.slideDescription
            : targetItem?.type === "transition"
              ? "Transition"
              : "(deleted slot)";
        const anchorInfo = document.createElement("div");
        anchorInfo.style.cssText = "color:#c8840a;font-size:11px;";
        anchorInfo.textContent = `Anchored to: ${targetLabel}`;
        anchorDiv.appendChild(anchorInfo);

        const offsetInp = numInput(clip.anchor.offsetMs, (v) => {
          clip.anchor!.offsetMs = v;
          this.resolveLayout();
          display.draw();
          this.visAPI?.refreshGUI("sound");
        });
        anchorDiv.appendChild(row("Offset ms", offsetInp));

        const detachBtn = document.createElement("button");
        detachBtn.textContent = "Detach";
        detachBtn.title = "Remove anchor — clip becomes floating";
        detachBtn.addEventListener("click", () => {
          delete clip.anchor;
          display.draw();
          refreshSoundEditor();
        });
        anchorDiv.appendChild(detachBtn);
      } else {
        const floatInfo = document.createElement("div");
        floatInfo.style.cssText = "color:#888;font-size:11px;";
        floatInfo.textContent = "Floating (not anchored)";
        anchorDiv.appendChild(floatInfo);

        const attachBtn = document.createElement("button");
        attachBtn.textContent = "Attach here";
        attachBtn.title = "Pin clip start to the current play head position";
        attachBtn.addEventListener("click", () => {
          this.autoAnchor(clip);
          this.resolveLayout();
          display.draw();
          refreshSoundEditor();
        });
        anchorDiv.appendChild(attachBtn);
      }
      soundEditorDiv.appendChild(anchorDiv);

      // Numeric fields
      const sceneInp = numInput(clip.startMsIntoScene, (v) => {
        clip.startMsIntoScene = v;
        display.draw();
        this.visAPI?.refreshGUI("sound");
      });
      if (clip.anchor) sceneInp.disabled = true;
      soundEditorDiv.appendChild(row("Start in scene", sceneInp));

      const clipInp = numInput(clip.startMsIntoClip, (v) => {
        clip.startMsIntoClip = v;
        this.visAPI?.refreshGUI("sound");
      });
      soundEditorDiv.appendChild(row("Start in clip", clipInp));

      const lenInp = numInput(clip.lengthMs, (v) => {
        if (v > 0) {
          clip.lengthMs = v;
          display.draw();
          this.visAPI?.refreshGUI("sound");
        }
      });
      soundEditorDiv.appendChild(row("Length ms", lenInp));

      // Delete
      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete clip";
      delBtn.addEventListener("click", () => {
        const i = this.soundClips.indexOf(clip);
        if (i >= 0) this.soundClips.splice(i, 1);
        this.selectedSoundClip = null;
        display.selectedSoundClip = null;
        display.draw();
        this.visAPI?.refreshGUI("sound");
        refreshSoundEditor();
      });
      soundEditorDiv.appendChild(delBtn);
    };

    refreshSoundEditor();
    return container;
  }
}

slideList.add(new MainTimeline(forTimeline, mainTimelineSoundClips));

export const some5 = makeShadowDemo({
  base: slideList.build(),
  background: "white",
  dotColor: "#ddd",
  dx: 0.2,
  dy: 0.2,
});

// function extrapolate(schedule: readonly Keyframe<number>[]) {
//   const result: {
//     time: number;
//     initially: number;
//     fromAbove?: number;
//     fromBelow?: number;
//   }[] = [];
//   schedule.forEach((keyframe, index, {length}) => {
//     /**
//      * The time for this keyframe.
//      */
//     const time= keyframe.time;
//     /**
//      * The value to use at this time.
//      */
//     const initially = keyframe.value;
//     /**
//      * What value we could change this to so the previous transition will be smooth.
//      * This might not be meaningful for some rows.
//      */
//     let fromAbove : undefined|number;
//     /**
//      * What value we could change this to so the next transition will be smooth.
//      * This might not be meaningful for some rows.
//      */
//     let fromBelow : undefined|number;
//     /**
//      * This function is focused on four types of easing functions:
//      * * Linear, the default, is our baseline.  We know how to {@link lerp}!
//      * * {@link easeIn} has a derivative of 0 at the beginning and π/2 times what the linear case would have had at the end.
//      * * {@link easeOut} has a derivative of 0 at the end and π/2 times what the linear case would have had at the beginning.
//      * * {@link ease} has a derivative of 0 at both ends.
//      * * Any other easing function, looking at an invalid array index, or any other problems are reported as "other".
//      */
//     type TerminalDisposition = "linear" | "π/2" | "fixed" | "other";
//     const outgoingFromPrevious : TerminalDisposition = /* TODO */;
//     const incomingToCurrent : TerminalDisposition = /* TODO */;
//     const outgoingFromCurrent : TerminalDisposition = /* TODO */;
//     const incomingToNext : TerminalDisposition = /* TODO */;
//     // Set fromAbove and fromBelow here.
//     // I imagine there will be a lot of if statements.
//     // Leave the default, undefined, if any of the values don't make sense.
//     result.push({time, initially, fromAbove,fromBelow})
//   })
//   console.table(result);
//   return result;
// }
// // Not ready for a GUI yet.
// // Eventually this should be built into the Visual Editor.
// // But I need to explore first.
// philDebug.extrapolate = extrapolate;
