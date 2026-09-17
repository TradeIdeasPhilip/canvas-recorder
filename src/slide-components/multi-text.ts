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
import { ShowOptions, Showable, ScheduleInfo } from "../showable";
import { DurationAgnosticComponent } from "./duration-agnostic";
import { ShowChildInfo } from "./in-parallel";
import { showError } from "./show-error";
import { Keyframe } from "../interpolate";

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
/**
 * What {@link MultiTextComponent.layoutAt}() returns:  everything you need to
 * know about what show() is about to draw, without drawing it.
 */
export type PlacedText = {
  /**
   * The paragraph in its own coordinates, where the top of the first line is
   * at y = 0 and x = 0 is the left edge of the wrap width.
   */
  readonly laidOut: LaidOut;
  /**
   * show() translates the paragraph by this much before drawing it, to honor
   * the Position, Alignment and Baseline schedules.
   *
   * Anyone measuring the text needs to include this.  The layout alone says
   * how big the text is, not where it ends up.
   */
  readonly offset: Point;
};

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
  readonly positionSchedule = new PointScheduleInfo("Position", {
    x: 8,
    y: 0.25,
  });
  readonly alignmentSchedule = new SelectScheduleInfo("Alignment", "center", [
    "left",
    "center",
    "right",
    "justify",
  ]);
  /**
   * How does the text align with {@link positionSchedule} vertically?
   *
   */
  readonly textBaselineSchedule = new SelectScheduleInfo("Baseline", "top", [
    "top",
    "middle",
    "bottom",
  ]);
  readonly widthSchedule = new NumberScheduleInfo("Width", 7.5);
  readonly additionalLineHeightSchedule = new NumberScheduleInfo(
    "Additional Line Height",
    0,
  );
  constructor(
    initialValues: {
      description?: string;
      position?: Point | readonly Keyframe<Point>[];
      alignment?: Parameters<MultiTextComponent["alignmentSchedule"]["set"]>[0];
      textBaseline?: Parameters<
        MultiTextComponent["textBaselineSchedule"]["set"]
      >[0];
      width?: number | readonly Keyframe<number>[];
      additionalLineHeight?: number | readonly Keyframe<number>[];
    } = {},
  ) {
    super(initialValues.description ?? "Multi Text");
    this.schedules.push(
      this.positionSchedule,
      this.alignmentSchedule,
      this.textBaselineSchedule,
      this.widthSchedule,
      this.additionalLineHeightSchedule,
    );
    if (initialValues.position !== undefined)
      this.positionSchedule.set(initialValues.position);
    if (initialValues.alignment !== undefined)
      this.alignmentSchedule.set(initialValues.alignment);
    if (initialValues.textBaseline !== undefined)
      this.textBaselineSchedule.set(initialValues.textBaseline);
    if (initialValues.width !== undefined)
      this.widthSchedule.set(initialValues.width);
    if (initialValues.additionalLineHeight !== undefined)
      this.additionalLineHeightSchedule.set(initialValues.additionalLineHeight);
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
  layoutAt(options: ShowOptions): PlacedText {
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
          return formatter?.freeze(timeInMs);
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
    const alignment = this.alignmentSchedule.at(timeInMs);
    const width = this.widthSchedule.at(timeInMs);
    const laidOut = paragraphLayout.align(
      width,
      alignment,
      this.additionalLineHeightSchedule.at(timeInMs),
    );
    const position = this.positionSchedule.at(timeInMs);
    const baseline = this.textBaselineSchedule.at(timeInMs);
    const height = laidOut.height;
    return {
      laidOut,
      offset: {
        x:
          position.x -
          (alignment == "right"
            ? width
            : alignment == "center"
              ? width / 2
              : 0),
        y:
          position.y -
          (baseline == "bottom"
            ? height
            : baseline == "middle"
              ? height / 2
              : 0),
      },
    };
  }
  override show(options: ShowOptions): void {
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
    const { laidOut, offset } = this.layoutAt(options);
    laidOut.pathShapeByTag().forEach((pathShape, callback) => {
      pathShape = pathShape.translate(offset.x, offset.y);
      (callback as (options: ShowOptions, pathShape: PathShape) => void)(
        options,
        pathShape,
      );
    });
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
  freeze(timeInMs: number) {
    const color = this.colorSchedule.at(timeInMs);
    const size = this.sizeSchedule.at(timeInMs);
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
