// MARK: Multi Text

import { Point } from "bezier-js";
import { Font } from "../glib/letters-base";
import { makeLineFontRatio } from "../glib/line-font";
import { LaidOut, ParagraphLayout } from "../glib/paragraph-layout";
import { PathShape } from "../glib/path-shape";
import {
  PointScheduleInfo,
  SelectScheduleInfo,
  NumberScheduleInfo,
  StringScheduleInfo,
  StringScalarInfo,
  ColorScheduleInfo,
} from "../schedule-helper";
import { ShowOptions, Showable, ScheduleInfo, Scalar } from "../showable";
import { DurationAgnosticComponent } from "./duration-agnostic";
import { ShowChildInfo } from "./in-parallel";
import { showError } from "./show-error";
import { Keyframe } from "../interpolate";
// Type-only: registry.ts imports this module, so a runtime import would be circular.
import type { ComponentRegistryEntry } from "./registry";

/**
 * This is needed as a default in some places but should never actually be used.
 */
const baseFont = Font.cursive(1);

const TEXT_FORMAT_LIST = Symbol("Text Format List");
function getFormat(
  name: string,
  available: readonly TextFormatComponent[],
): TextFormatComponent | undefined {
  return available.findLast((component) => component.nameScalar.value == name);
}
/**
 *
 * @param options The incoming options, which might include formatters from MultiTextComponent ancestors.
 * @param current New formatters
 * @returns A list of formatters.
 * Any and all formatters read of `options` will come first,
 * followed by the formatters associated with the `current` MultiTextComponent.
 */
function extractTextFormatList(
  options: ShowOptions & {
    [TEXT_FORMAT_LIST]?: readonly TextFormatComponent[];
  },
  current: readonly TextFormatComponent[],
) {
  if (options[TEXT_FORMAT_LIST]) {
    return [...options[TEXT_FORMAT_LIST], ...current];
  } else {
    return current;
  }
}
/**
 *
 * @param options These are the incoming options.
 * Start from a copy of these.
 * @param textFormatList Add these into the options,
 * replacing any previous TEXT_FORMAT_LIST.
 * Presumably you created this list from a call to {@link extractTextFormatList}().
 * So one immutable array will be replacing another.
 * But the contents of the array will only grow, with new formatters being added to the end.
 * @returns A new ShowableOptions to share with children.
 * This will contain the next list of formatters.
 */
function setTextFormatList(
  options: ShowOptions,
  textFormatList: readonly TextFormatComponent[],
) {
  return { ...options, [TEXT_FORMAT_LIST]: textFormatList };
}
// MARK: Auto Sizing

/**
 * How the frame's **width** constrains the text.
 *
 * * `unbounded` — ignore Width entirely.  No word wrap, so the text is as wide
 *   as it wants to be, and only a "\n" starts a new line.
 * * `wrap` — Width is a word wrap limit.  This is the traditional text box,
 *   and it is the default.
 * * `scale` — Width is a target.  Lay the text out with no wrapping, then
 *   scale the finished block until it is exactly Width wide.
 * * `wrap, then scale` — wrap to Width, and *additionally* scale down if a
 *   single unbreakable word still doesn't fit.  A safety net, not a layout.
 *
 * `scale` here means a uniform transform applied to the finished paragraph.
 * The line breaks never move, so the paragraph keeps its shape and only
 * changes size.  Contrast {@link HEIGHT_MODES}'s `shrink font`.
 */
export const WIDTH_MODES = [
  "unbounded",
  "wrap",
  "scale",
  "wrap, then scale",
] as const;

/**
 * How the frame's **height** constrains the text.
 *
 * * `unbounded` — ignore Height.  The paragraph is as tall as it needs to be.
 *   This is the default, and it's what every version before auto sizing did.
 * * `scale` — scale the finished block so it fits Height.  Cheap and exact:
 *   the answer is Height divided by the measured height, and the line breaks
 *   don't move.
 * * `shrink font` — shrink the *font* and lay out again until the result fits
 *   Height.  The line breaks do move, so the paragraph changes shape, which is
 *   the only way to chase a width and a height at the same time.  This is the
 *   expensive one:  it searches, so it costs several layouts per frame.  See
 *   {@link MultiTextComponent.autoSizeScalar} for how to pay that cost once.
 */
export const HEIGHT_MODES = ["unbounded", "scale", "shrink font"] as const;

/**
 * What {@link MultiTextComponent.layoutAt}() returns:  everything you need to
 * know about what show() is about to draw, without drawing it.
 *
 * To reproduce what show() draws:  translate by {@link offset}, scale by
 * {@link scale}, then draw {@link laidOut} in its own coordinates.  In that
 * order.
 */
export type PlacedText = {
  /**
   * The paragraph in its own coordinates, where the top of the first line is
   * at y = 0 and x = 0 is the left edge of the wrap width.
   *
   * This is the layout *before* {@link scale} is applied, so `laidOut.width`
   * and `laidOut.height` both need multiplying by `scale` to get the size the
   * text actually takes up on screen.
   */
  readonly laidOut: LaidOut;
  /**
   * Where the top left of the (scaled) paragraph lands.
   *
   * Anyone measuring the text needs to include this.  The layout alone says
   * how big the text is, not where it ends up.
   */
  readonly offset: Point;
  /**
   * The uniform scale factor auto sizing chose.  1 when nothing is being
   * scaled, which includes every mode that leaves Width Mode on `wrap` and
   * Height Mode on `unbounded`.
   */
  readonly scale: number;
  /**
   * The font size multiplier that `shrink font` chose, or 1 for every other
   * mode.  Reported mostly so you can see what the search decided.
   */
  readonly sizeMultiplier: number;
};

/** Where an anchor puts the text relative to {@link MultiTextComponent.positionSchedule}. */
const ANCHOR_FRACTION = {
  left: 0,
  center: 0.5,
  right: 1,
  top: 0,
  middle: 0.5,
  bottom: 1,
} as const;

/**
 * Use this to combine multiple formats into one paragraph.
 *
 * This contains a sequence of TextSpanComponent objects with the text to display.
 * And a sequence of TextFormatComponent objects with formatting instructions.
 * Each TextSpanComponent object points to a TextFormatComponent object by name.
 * Presumably a lot of formatting will be reused, like "normal" and bold.
 *
 * This is a prototype.
 * The basic functionality is there and works.
 * But the GUI needs some cleanup.
 * If nothing else it needs instructions.
 * Ideally it would be impossible to add a TextSpanComponent or a TextFormatComponent to anything but one of these components.
 * And these components should have two *preferred* types of children:  TextSpanComponent or TextFormatComponent.
 *
 * Currently we print a warning on the screen for any errors.
 *
 * We can now have other children.
 * TextSpanComponent and TextFormatComponent have special meanings.
 * Any other children are drawn like normal.
 * These children are drawn before the TextSpanComponents are drawn.
 * One reason is that descendants get full access to this component's formatters.
 * So a top level Multi Text can create formatters shared by other Multi Text Components.
 * This includes Multi Text Components that are wrapped in other components.
 */
export class MultiTextComponent extends DurationAgnosticComponent {
  readonly registryKey = "Multi Text";
  /**
   * Text Span and Text Format are what a Multi Text is made of, so offer them first.
   * Text Format only works as a direct child of a Multi Text, so it is hidden everywhere
   * else and has to be added back here.
   */
  protected override customizeComponentChoices(
    choices: string[],
    purpose: "insert" | "wrap",
    _registry: ReadonlyMap<string, ComponentRegistryEntry>,
  ): void {
    if (purpose !== "insert") return;
    choices.unshift("Text Span", "Text Format");
  }
  readonly #temporaryText = new Array<TextSpanComponent>();
  /**
   * Create, initialize, and add a TextSpanComponent to this MultiTextComponent.
   * @param style The name of the style to apply to this text.
   * @param content The text to display.
   * @returns `this`, for chaining.
   */
  addText(style: string, content: string): this {
    const span = new TextSpanComponent();
    span.styleSchedule.set(style);
    span.contentSchedule.set(content);
    this.#temporaryText.push(span);
    return this;
  }
  static #splitter = /^⸨([^⸨⸩]*)⸩([^⸨⸩]*)(.*)$/s;
  /**
   * `component.addText1("⸨format1⸩content1⸨format2⸩content2⸨format3⸩content3")`
   * is equivalent to
   * `component.add("format1", "content1").add("format2", "content2").add("format3", "content3")`
   * @param all A string containing all of the text and styles to add.
   * @returns this;
   */
  addText1(all: string): this {
    while (all != "") {
      const pieces = MultiTextComponent.#splitter.exec(all);
      if (!pieces) {
        throw new Error("Invalid here:  " + all);
      }
      this.addText(pieces[1], pieces[2]);
      all = pieces[3];
    }
    return this;
  }
  /**
   * Remove all TextSpanComponent objects created by addText() or addText1().
   */
  clearText() {
    this.#temporaryText.length = 0;
    return this;
  }
  /**
   * The point the finished text is anchored to.
   *
   * Which part of the text lands here is up to {@link anchorXSchedule} and
   * {@link textBaselineSchedule}.  Note that the text is anchored by *its own*
   * size, so Width and Height move the text only insofar as they change how
   * big it is.
   */
  readonly positionSchedule = new PointScheduleInfo("Position", {
    x: 8,
    y: 0.25,
  });
  /**
   * How ragged the lines are *within* the paragraph, and nothing else.
   *
   * This used to do two jobs:  raggedness, and deciding which part of the
   * paragraph attached to {@link positionSchedule}.  The second job now
   * belongs to {@link anchorXSchedule}, which means you can finally ask for
   * left-ragged lines in a box that is centered on a point.
   *
   * `justify` needs a real width to stretch to; with Width Mode `unbounded` it
   * stretches the short lines to match the longest one, which is rarely what
   * anybody means.
   */
  readonly alignmentSchedule = new SelectScheduleInfo("Alignment", "center", [
    "left",
    "center",
    "right",
    "justify",
  ]);
  /**
   * Which part of the text lands on {@link positionSchedule} horizontally.
   *
   * `center` matches what {@link alignmentSchedule}'s default used to do, so
   * existing videos are unaffected.
   */
  readonly anchorXSchedule = new SelectScheduleInfo("Anchor X", "center", [
    "left",
    "center",
    "right",
  ]);
  /**
   * Which part of the text lands on {@link positionSchedule} vertically.
   *
   * The name is historical — this is the vertical twin of
   * {@link anchorXSchedule}, and has nothing to do with a font's baseline.
   */
  readonly textBaselineSchedule = new SelectScheduleInfo("Baseline", "top", [
    "top",
    "middle",
    "bottom",
  ]);
  /** The frame's width.  What it *means* is up to {@link widthModeScalar}. */
  readonly widthSchedule = new NumberScheduleInfo("Width", 7.5);
  /**
   * The frame's height.  Ignored unless {@link heightModeScalar} is asking for
   * something, which it is not by default.
   */
  readonly heightSchedule = new NumberScheduleInfo("Height", 4);
  readonly additionalLineHeightSchedule = new NumberScheduleInfo(
    "Additional Line Height",
    0,
  );
  /** See {@link WIDTH_MODES}. */
  readonly widthModeScalar: Scalar<"select"> = {
    description: "Width Mode",
    type: "select",
    choices: WIDTH_MODES,
    value: "wrap",
  };
  /** See {@link HEIGHT_MODES}. */
  readonly heightModeScalar: Scalar<"select"> = {
    description: "Height Mode",
    type: "select",
    choices: HEIGHT_MODES,
    value: "unbounded",
  };
  /**
   * May auto sizing make the text *bigger*, or only smaller?
   *
   * This is the difference between a limit ("don't exceed this") and a target
   * ("be exactly this").  Word wrap is always a limit.  `scale` is a target
   * unless you say otherwise here.
   *
   * Wrapping overrules this:  when Width Mode wraps, scaling up would push the
   * text back past the width we just wrapped it to, so scaling may only shrink
   * no matter what this says.
   */
  readonly mayGrowScalar: Scalar<"select"> = {
    description: "May Grow",
    type: "select",
    choices: ["shrink or grow", "shrink only"],
    value: "shrink or grow",
  };
  /**
   * `live` recomputes the size every frame.  `frozen` computes it once and
   * then reuses the answer, which matters for two reasons:
   *
   * 1. `shrink font` searches, so it costs several layouts per frame.
   * 2. More importantly, if the *content* animates, a live size animates with
   *    it, and the text visibly breathes as words appear.  Freezing is the fix.
   *
   * Freezing bakes the computed number into {@link frozenSizeScalar}, where you
   * can see it, edit it, and save it with the project.  Set that back to 0 to
   * bake it again.
   */
  readonly autoSizeScalar: Scalar<"select"> = {
    description: "Auto Size",
    type: "select",
    choices: ["live", "frozen"],
    value: "live",
  };
  /**
   * The baked answer from {@link autoSizeScalar}, or 0 for "not baked yet".
   *
   * `shrink font` bakes a font size multiplier; every other mode bakes a scale
   * factor.  A component uses one or the other, never both, so one number
   * covers both cases.
   */
  readonly frozenSizeScalar: Scalar<"number"> = {
    description: "Frozen Size",
    type: "number",
    value: 0,
  };
  constructor(
    initialValues: {
      description?: string;
      position?: Point | readonly Keyframe<Point>[];
      alignment?: Parameters<MultiTextComponent["alignmentSchedule"]["set"]>[0];
      anchorX?: Parameters<MultiTextComponent["anchorXSchedule"]["set"]>[0];
      textBaseline?: Parameters<
        MultiTextComponent["textBaselineSchedule"]["set"]
      >[0];
      width?: number | readonly Keyframe<number>[];
      height?: number | readonly Keyframe<number>[];
      additionalLineHeight?: number | readonly Keyframe<number>[];
      widthMode?: (typeof WIDTH_MODES)[number];
      heightMode?: (typeof HEIGHT_MODES)[number];
      mayGrow?: "shrink or grow" | "shrink only";
      autoSize?: "live" | "frozen";
      frozenSize?: number;
    } = {},
  ) {
    super(initialValues.description ?? "Multi Text");
    this.schedules.push(
      this.positionSchedule,
      this.alignmentSchedule,
      this.anchorXSchedule,
      this.textBaselineSchedule,
      this.widthSchedule,
      this.heightSchedule,
      this.additionalLineHeightSchedule,
    );
    this.scalars.push(
      this.widthModeScalar,
      this.heightModeScalar,
      this.mayGrowScalar,
      this.autoSizeScalar,
      this.frozenSizeScalar,
    );
    if (initialValues.position !== undefined)
      this.positionSchedule.set(initialValues.position);
    if (initialValues.alignment !== undefined)
      this.alignmentSchedule.set(initialValues.alignment);
    if (initialValues.anchorX !== undefined)
      this.anchorXSchedule.set(initialValues.anchorX);
    if (initialValues.textBaseline !== undefined)
      this.textBaselineSchedule.set(initialValues.textBaseline);
    if (initialValues.width !== undefined)
      this.widthSchedule.set(initialValues.width);
    if (initialValues.height !== undefined)
      this.heightSchedule.set(initialValues.height);
    if (initialValues.additionalLineHeight !== undefined)
      this.additionalLineHeightSchedule.set(initialValues.additionalLineHeight);
    if (initialValues.widthMode !== undefined)
      this.widthModeScalar.value = initialValues.widthMode;
    if (initialValues.heightMode !== undefined)
      this.heightModeScalar.value = initialValues.heightMode;
    if (initialValues.mayGrow !== undefined)
      this.mayGrowScalar.value = initialValues.mayGrow;
    if (initialValues.autoSize !== undefined)
      this.autoSizeScalar.value = initialValues.autoSize;
    if (initialValues.frozenSize !== undefined)
      this.frozenSizeScalar.value = initialValues.frozenSize;
  }
  protected override showChild(info: ShowChildInfo): void {
    // We are not currently using this method.
    console.warn("yes!");
    if (info.child instanceof TextSpanComponent) {
      // TODO we should display the result of each TextSpanComponent in this call.
      // That way we can completely control the zIndex.
      // For now the text is all displayed at the highest zIndex.
    } else if (info.child instanceof TextFormatComponent) {
      // Nothing to do.
      // This is not a visible component.
    } else {
      super.showChild(info);
    }
  }
  /**
   * Our own {@link TextFormatComponent} children.
   * These name the styles that our {@link TextSpanComponent} children can ask for.
   */
  #ownFormatters(): TextFormatComponent[] {
    return this.children.flatMap(({ child }) =>
      child instanceof TextFormatComponent ? [child] : [],
    );
  }
  /**
   * Lay the text out exactly as {@link show}() does, but draw nothing.
   *
   * This is how another component can find out what this text is really going
   * to look like.
   * See `galaga.ts`'s `FittedText` for a worked example:
   * it measures the text, then picks a transform that makes the text fit a given rectangle.
   *
   * Nothing is cached.
   * The spans, the formats, and the layout can all change from one frame to the next,
   * so this repeats the same work show() does.
   * Measuring and then drawing therefore costs twice, which has not been a problem in practice.
   */
  /**
   * How many layouts `shrink font` is allowed to run while searching.
   * Ten halvings take the answer to within about a tenth of a percent, which
   * is far finer than anyone can see.
   */
  static readonly SHRINK_FONT_ITERATIONS = 10;
  /** The smallest font multiplier `shrink font` will consider. */
  static readonly MIN_FONT_MULTIPLIER = 0.05;
  /** The largest font multiplier `shrink font` will consider when it may grow. */
  static readonly MAX_FONT_MULTIPLIER = 20;

  /**
   * Step 1 and 2 of the pipeline:  lay the text out at a given font size
   * multiplier and wrap width, and measure the result.  Draws nothing.
   *
   * `sizeMultiplier` scales every format's font size, and the line spacing
   * along with it, so the paragraph shrinks as a whole.  It deliberately does
   * *not* scale `wrapWidth` — that is exactly what makes `shrink font`
   * reflow instead of just getting smaller.
   */
  #layOut(
    options: ShowOptions,
    wrapWidth: number,
    sizeMultiplier: number,
  ): LaidOut {
    const { context, timeInMs } = options;
    const allFormatters = extractTextFormatList(options, this.#ownFormatters());
    const paragraphLayout = new ParagraphLayout(baseFont);
    const initializedFormatters = new Map<
      string,
      ReturnType<TextFormatComponent["freeze"]> | undefined
    >();
    const sources = [
      ...this.children.flatMap(({ child }) =>
        child instanceof TextSpanComponent ? [child] : [],
      ),
      ...this.#temporaryText,
    ];
    sources.forEach((source) => {
      const { content, style } = source.get(timeInMs);
      const initializedFormatter = initializedFormatters.getOrInsertComputed(
        style,
        (style) => {
          const formatter = getFormat(style, allFormatters);
          return formatter?.freeze(timeInMs, sizeMultiplier);
        },
      );
      if (!initializedFormatter) {
        // Throwing an exception seems extreme or even a warning to the console,
        // as this happens in the animation frame handler.
        showError(context, `Unknown style:\n“${style}”`);
      } else {
        initializedFormatter(content, paragraphLayout);
      }
    });
    // Note:  paragraphLayout.align() has partial support for more.
    // Things like capital top or (normal text) baseline.
    // But that code seems to be in a state of flux at the moment.
    // TODO fix it.
    return paragraphLayout.align(
      wrapWidth,
      this.alignmentSchedule.at(timeInMs),
      this.additionalLineHeightSchedule.at(timeInMs) * sizeMultiplier,
    );
  }

  /**
   * The `shrink font` search:  the largest font multiplier whose laid-out
   * height still fits `frameHeight`.
   *
   * Height is monotonic in the font size (smaller text is never taller) and
   * piecewise constant, because the number of lines is an integer.  So the
   * answer is well defined and bisection converges on it.  What it costs is a
   * full layout per probe, which is the reason
   * {@link autoSizeScalar} exists.
   */
  #searchFontMultiplier(
    options: ShowOptions,
    wrapWidth: number,
    frameHeight: number,
    mayGrow: boolean,
  ): number {
    const fits = (multiplier: number) =>
      this.#layOut(options, wrapWidth, multiplier).height <= frameHeight;
    let hi = mayGrow
      ? MultiTextComponent.MAX_FONT_MULTIPLIER
      : /* Never larger than the size the author actually asked for. */ 1;
    if (fits(hi)) {
      return hi;
    }
    let lo = MultiTextComponent.MIN_FONT_MULTIPLIER;
    if (!fits(lo)) {
      // Even the smallest text we're willing to draw is too tall.  Give up and
      // overflow rather than shrinking the text to nothing.
      return lo;
    }
    for (let i = 0; i < MultiTextComponent.SHRINK_FONT_ITERATIONS; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    // lo always fits; hi may not.  Return the one we know is safe.
    return lo;
  }

  /**
   * Lay the text out exactly as {@link show}() does, but draw nothing.
   *
   * This is how another component can find out what this text is really going
   * to look like, and it is the whole auto sizing pipeline:
   *
   * 1. Pick a wrap width — the frame's Width, or `Infinity`.
   * 2. Lay out and measure.
   * 3. Pick a scale factor.  (The only step that differs between modes.)
   * 4. Only for `shrink font`:  adjust the font size and go back to step 2.
   * 5. Anchor the finished block on Position.
   *
   * Nothing is cached between frames.
   * The spans, the formats, and the layout can all change from one frame to the
   * next, so this repeats the same work show() does.
   * Measuring and then drawing therefore costs twice, which has not been a
   * problem in practice.
   */
  layoutAt(options: ShowOptions): PlacedText {
    const { timeInMs } = options;
    const widthMode = this.widthModeScalar.value;
    const heightMode = this.heightModeScalar.value;
    const frameWidth = this.widthSchedule.at(timeInMs);
    const frameHeight = this.heightSchedule.at(timeInMs);
    const wraps = widthMode === "wrap" || widthMode === "wrap, then scale";
    // Step 1.
    const wrapWidth = wraps ? frameWidth : Infinity;
    // Wrapping is a limit that the layout has already honored.  Growing past it
    // would undo that, so wrapping forces shrink-only no matter what May Grow
    // says.  See mayGrowScalar.
    const mayGrow = !wraps && this.mayGrowScalar.value === "shrink or grow";
    const frozen = this.autoSizeScalar.value === "frozen";
    const baked = this.frozenSizeScalar.value;
    const useBaked = frozen && baked > 0;

    // Steps 2 through 4.
    let sizeMultiplier = 1;
    if (heightMode === "shrink font") {
      sizeMultiplier = useBaked
        ? baked
        : this.#searchFontMultiplier(options, wrapWidth, frameHeight, mayGrow);
    }
    const laidOut = this.#layOut(options, wrapWidth, sizeMultiplier);
    // align() reports the width we *asked* for, so the only way to notice an
    // unbreakable word poking out past it is to look at the individual rows.
    // Normally this is <= laidOut.width and changes nothing.
    const widestRow = Math.max(
      0,
      ...laidOut.allRowMetrics.map(({ minWidth }) => minWidth),
    );

    // Step 3, for everything that scales the finished block instead.
    let scale = 1;
    if (heightMode !== "shrink font") {
      if (useBaked) {
        scale = baked;
      } else {
        // Every active constraint proposes a factor; the smallest one wins,
        // because it's the only one that satisfies all of them at once.
        const candidates = new Array<number>();
        if (widthMode === "scale" && laidOut.width > 0) {
          candidates.push(frameWidth / laidOut.width);
        }
        if (widthMode === "wrap, then scale" && widestRow > frameWidth) {
          candidates.push(frameWidth / widestRow);
        }
        if (heightMode === "scale" && laidOut.height > 0) {
          candidates.push(frameHeight / laidOut.height);
        }
        if (candidates.length > 0) {
          scale = Math.min(...candidates);
          if (!mayGrow) {
            scale = Math.min(scale, 1);
          }
        }
      }
    }
    if (!(scale > 0) || !Number.isFinite(scale)) {
      // Empty text, or a frame with no size.  Nothing sensible to scale by.
      scale = 1;
    }

    // Bake the answer so it stops being recomputed, and so the author can see
    // and edit the number the search picked.
    if (frozen && !useBaked) {
      this.frozenSizeScalar.value =
        heightMode === "shrink font" ? sizeMultiplier : scale;
    }

    // Step 5.  The text is anchored by its own (scaled) size, which is why the
    // frame's width and height never appear here.
    //
    // The paragraph box runs from 0 to laidOut.width, but a word too long to
    // wrap sticks out past one or both edges, and centered text sticks out of
    // both equally.  Anchoring the union of the box and the ink puts the text
    // where it visibly is.  Whenever nothing overflows this *is* the paragraph
    // box, so ordinary text is unaffected.
    const inkLeft = Math.min(0, ...laidOut.words.map((word) => word.x));
    const inkRight = Math.max(
      laidOut.width,
      ...laidOut.words.map((word) => word.x + word.wordInfo.width),
    );
    const position = this.positionSchedule.at(timeInMs);
    const blockLeft = inkLeft * scale;
    const blockWidth = (inkRight - inkLeft) * scale;
    const blockHeight = laidOut.height * scale;
    return {
      laidOut,
      scale,
      sizeMultiplier,
      offset: {
        x:
          position.x -
          ANCHOR_FRACTION[this.anchorXSchedule.at(timeInMs)] * blockWidth -
          blockLeft,
        y:
          position.y -
          ANCHOR_FRACTION[this.textBaselineSchedule.at(timeInMs)] * blockHeight,
      },
    };
  }
  override show(options: ShowOptions): void {
    const { context } = options;
    // Children that are neither spans nor formats draw normally, before the
    // text, and they can see our formatters.
    const childOptions = setTextFormatList(
      options,
      extractTextFormatList(options, this.#ownFormatters()),
    );
    this.children.forEach(({ child }) => {
      if (
        !(child instanceof TextSpanComponent) &&
        !(child instanceof TextFormatComponent)
      ) {
        child.show(childOptions);
      }
    });
    const { laidOut, offset, scale } = this.layoutAt(options);
    // The scale goes on the context rather than the path, so the stroke width
    // scales with the letters.  Scaling the PathShape alone would leave the
    // pen the same size, and small text would come out looking too heavy.
    context.save();
    context.translate(offset.x, offset.y);
    context.scale(scale, scale);
    laidOut.pathShapeByTag().forEach((pathShape, callback) => {
      (callback as (options: ShowOptions, pathShape: PathShape) => void)(
        options,
        pathShape,
      );
    });
    context.restore();
  }
}

// MARK: Text Span

export class TextSpanComponent implements Showable {
  readonly registryKey = "Text Span";
  public contentSchedule = new StringScheduleInfo("Content", "");
  // TODO do not allow easing in styleSchedule.
  public styleSchedule = new StringScheduleInfo("Style", "");
  readonly schedules = [this.contentSchedule, this.styleSchedule] as const;
  readonly description = "Text Span";
  readonly duration = 0;
  constructor(
    initialValues: {
      content?: string | readonly Keyframe<string>[];
      style?: string | readonly Keyframe<string>[];
    } = {},
  ) {
    if (initialValues.content !== undefined)
      this.contentSchedule.set(initialValues.content);
    if (initialValues.style !== undefined)
      this.styleSchedule.set(initialValues.style);
  }
  show(options: ShowOptions): void {
    // TODO Can we update the Visual Editor's GUI to prevent this from happening in the first place?
    showError(
      options.context,
      "TextSpanComponent\nshould be a child of\nMultiTextComponent",
    );
  }
  get(timeInMs: number) {
    const content = this.contentSchedule.at(timeInMs);
    const style = this.styleSchedule.at(timeInMs);
    return { content, style };
  }
}

// MARK: Text Format

type CachedFont = {
  readonly font: Font;
  readonly size: number;
  readonly boldness: number;
  readonly obliqueness: number;
};

export class TextFormatComponent implements Showable {
  readonly registryKey = "Text Format";
  readonly nameScalar = new StringScalarInfo("Name", "");
  readonly scalars = [this.nameScalar] as const;
  readonly colorSchedule: ColorScheduleInfo;
  readonly sizeSchedule = new NumberScheduleInfo("Font Size", 1);
  readonly boldnessSchedule = new NumberScheduleInfo("Boldness", 1);
  readonly obliquenessSchedule = new NumberScheduleInfo("Obliqueness", 0);
  readonly alphaSchedule = new NumberScheduleInfo("Alpha", 1);
  readonly schedules = new Array<ScheduleInfo>();
  readonly description: string;
  readonly duration = 0;
  constructor(
    initialValues: {
      description?: string;
      name?: string;
      color?: string | readonly Keyframe<string>[] | ColorScheduleInfo;
      size?: number | readonly Keyframe<number>[];
      boldness?: number | readonly Keyframe<number>[];
      obliqueness?: number | readonly Keyframe<number>[];
      alpha?: number | readonly Keyframe<number>[];
    } = {},
  ) {
    this.description = initialValues.description ?? "Text Format";
    if (initialValues.name !== undefined)
      this.nameScalar.value = initialValues.name;
    this.colorSchedule = new ColorScheduleInfo(
      "Color",
      initialValues.color ?? "#666",
    );
    if (initialValues.size !== undefined)
      this.sizeSchedule.set(initialValues.size);
    if (initialValues.boldness !== undefined)
      this.boldnessSchedule.set(initialValues.boldness);
    if (initialValues.obliqueness !== undefined)
      this.obliquenessSchedule.set(initialValues.obliqueness);
    if (initialValues.alpha !== undefined)
      this.alphaSchedule.set(initialValues.alpha);
    this.schedules.push(
      this.colorSchedule,
      this.sizeSchedule,
      this.boldnessSchedule,
      this.obliquenessSchedule,
      this.alphaSchedule,
    );
  }
  show(options: ShowOptions): void {
    // TODO Can we update the Visual Editor's GUI to prevent this from happening in the first place?
    showError(
      options.context,
      "TextFormatComponent\nshould be a child of\nMultiTextComponent",
    );
  }
  #cachedFont: undefined | CachedFont;
  /**
   * @param sizeMultiplier Scales Font Size.  This is how
   * {@link MultiTextComponent}'s `shrink font` mode makes the whole paragraph
   * smaller while keeping the sizes the author chose in proportion to each
   * other — a big word stays bigger than a small one.
   */
  freeze(timeInMs: number, sizeMultiplier = 1) {
    const color = this.colorSchedule.at(timeInMs);
    const size = this.sizeSchedule.at(timeInMs) * sizeMultiplier;
    const boldness = this.boldnessSchedule.at(timeInMs);
    const obliqueness = this.obliquenessSchedule.at(timeInMs);
    const alpha = this.alphaSchedule.at(timeInMs);
    if (
      !this.#cachedFont ||
      this.#cachedFont.size != size ||
      this.#cachedFont.boldness != boldness ||
      this.#cachedFont.obliqueness != obliqueness
    ) {
      const font = makeLineFontRatio(size, boldness).oblique(obliqueness);
      this.#cachedFont = { font, size, boldness, obliqueness };
    }
    const font = this.#cachedFont.font;
    function drawText({ context }: ShowOptions, pathShape: PathShape): void {
      context.strokeStyle = color;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = font.strokeWidth;
      context.globalAlpha = alpha;
      context.stroke(pathShape.canvasPath);
      context.globalAlpha = 1;
    }
    function addText(content: string, paragraphLayout: ParagraphLayout): void {
      paragraphLayout.addText(content, font, drawText);
    }
    return addText;
  }
}
