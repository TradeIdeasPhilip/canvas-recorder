import { ReadOnlyRect } from "phil-lib/misc";
import {
  discreteKeyframes,
  interpolateColors,
  interpolateNumbers,
  interpolateRects,
  Keyframe,
} from "./interpolate";
import {
  applyScalarSnapshot,
  applySnapshot,
  SerializedScalar,
  SerializedSchedule,
  Showable,
  ShowOptions,
} from "./showable";
import { SingleImage, SlowImage } from "./slow-image-sources";
import { computeGridTransform, drawGrid } from "./glib/grid";
import { Font } from "./glib/letters-base";
import { makeLineFont, makeLineFontRatio } from "./glib/line-font";
import { ParagraphLayout } from "./glib/paragraph-layout";
import { applyTransform } from "./glib/transforms";
import { myRainbow } from "./glib/my-rainbow";
import {
  ColorScheduleInfo,
  NumberDurationScheduleInfo,
  NumberScheduleInfo,
  PointScheduleInfo,
  RectangleScheduleInfo,
  SelectScheduleInfo,
  StringScalarInfo,
  StringScheduleInfo,
} from "./schedule-helper";
import { PathShape } from "./glib/path-shape";

const errorFont = makeLineFont(1);

/**
 * Write text on the screen where it is big and easy to see, even without knowing what else is there.
 * @param context Where to draw.
 * @param text What to draw.
 * Can include " " and "\n" for optional and forced line breaks.
 */
function showError(context: CanvasRenderingContext2D, text: string) {
  const font = errorFont;
  const path = ParagraphLayout.singlePathShape({
    font,
    text,
    alignment: "center",
    width: 15.5,
  }).canvasPath;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = font.strokeWidth * 3;
  context.strokeStyle = "white";
  context.stroke(path);
  context.lineWidth = font.strokeWidth;
  context.strokeStyle = "red";
  context.stroke(path);
}

/**
 * Traditional text component.
 *
 * Uses the canvas's strokeText() and fillText().
 * Does **not** use the custom strokable fonts, like {@link createTextComponent}().
 * Uses CSS fonts, including downloaded or built in fonts.
 *
 * TODO: https://developer.mozilla.org/en-US/docs/Web/API/Document/fonts offers ways to ensure that the font has loaded.
 * We should add methods to this class for awaiting and possibly failing.
 * Like we started and discussed in {@link SlowImage}.
 *
 * TODO??:   direction?? Seems worthless.
 * The best I can tell it is used to manually say whether context.textAlign="start"
 * is equivalent to context.textAlign="left" or context.textAlign="right".
 * That just seems stupid and useless and confusing.
 * In fact, I'm removing start and end from the list of options.
 * Note that שָׁלוֹם is drawn correctly, right-to-left, regardless of this setting.
 *
 * TODO:  The following can be specified before font-style:
 * font-variant, font-weight, font-stretch, and line-height
 */
class TraditionalTextComponent implements Showable {
  /**
   * What to display.
   */
  readonly textSchedule = new StringScheduleInfo("Text", [
    { time: 0, value: "Type Here" },
  ]);
  /**
   * Where to display it.
   * See {@link textAlignSchedule} and {@link textBaselineSchedule} to know how this position will be interpreted.
   */
  readonly positionSchedule = new PointScheduleInfo("Position", [
    { time: 0, value: { x: 2, y: 1 } },
  ]);
  /**
   * The fill is the normal way of rendering traditional text.
   */
  readonly fillColorSchedule = new ColorScheduleInfo("Fill Color", [
    { time: 0, value: myRainbow.violet },
  ]);
  /**
   * The outline is stroked using this color.
   * See {@link outlineWidth} if you want to disable the outline.
   *
   * Note that the outline is stroked *before* it is filled.
   * That is the opposite of SVG.
   * I find the text is unreadable if you do it the other way.
   */
  readonly outlineColorSchedule = new ColorScheduleInfo("Outline Color", [
    { time: 0, value: myRainbow.orange },
  ]);
  /**
   * The outline is stroked using this lineWidth.
   * Set this to 0 if you want to disable the outline.
   *
   * Note that the outline is stroked *before* it is filled.
   * That is the opposite of SVG.
   * I find the text is unreadable if you do it the other way.
   */
  readonly outlineWidthSchedule = new NumberScheduleInfo("Outline Width", [
    { time: 0, value: 0 },
  ]);
  /**
   * This corresponds to "px" in the API.
   * However, these are our normal userspace units, not actually pixels.
   * The screen is typically 16×9.
   */
  readonly fontSizeSchedule = new NumberScheduleInfo("Font Size", [
    { time: 0, value: 0.5 },
  ]);
  /**
   * TODO make this a drop down.  (Constrained.)
   * We can read what is available at https://developer.mozilla.org/en-US/docs/Web/API/Document/fonts
   * That includes the family names, and the bold and italic options for the family.
   */
  readonly fontFamilySchedule = new StringScheduleInfo("Font Family", [
    { time: 0, value: "Life Savers" },
  ]);
  /**
   * The {@link positionSchedule} names a point.
   * Should that point refer to the left, center or right side of the text?
   */
  readonly textAlignSchedule = new SelectScheduleInfo("Align", "center", [
    "left",
    "center",
    "right",
  ]);
  /**
   * How does the text align with {@link positionSchedule} vertically?
   * https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/textBaseline
   */
  readonly textBaselineSchedule = new SelectScheduleInfo(
    "Baseline",
    "alphabetic",
    ["top", "hanging", "middle", "alphabetic", "ideographic", "bottom"],
  );
  /**
   * Notice that this is a tuple, not just an array.
   */
  readonly schedules = [
    this.textSchedule,
    this.positionSchedule,
    this.fillColorSchedule,
    this.outlineColorSchedule,
    this.outlineWidthSchedule,
    this.fontSizeSchedule,
    this.fontFamilySchedule,
    this.textAlignSchedule,
    this.textBaselineSchedule,
  ] as const;
  readonly description = "Traditional Text";
  readonly duration = 0;
  show({ context, timeInMs }: ShowOptions) {
    const text = this.textSchedule.at(timeInMs);
    const position = this.positionSchedule.at(timeInMs);
    const fillColor = this.fillColorSchedule.at(timeInMs);
    const outlineWidth = this.outlineWidthSchedule.at(timeInMs);
    const fontSize = this.fontSizeSchedule.at(timeInMs);
    const fontFamily = this.fontFamilySchedule.at(timeInMs);
    const fontString = `${fontSize}px ${fontFamily}`;
    context.font = fontString;
    context.textAlign = this.textAlignSchedule.at(timeInMs);
    context.textBaseline = this.textBaselineSchedule.at(timeInMs);
    if (outlineWidth > 0) {
      const outlineColor = this.outlineColorSchedule.at(timeInMs);
      context.lineWidth = outlineWidth;
      context.lineJoin = "miter";
      context.strokeStyle = outlineColor;
      context.strokeText(text, position.x, position.y);
    }
    context.fillStyle = fillColor;
    context.fillText(text, position.x, position.y);
  }
}

// Components do not have to be classes.
// They only have to implement Showable.
// Making this a class makes it easy for a programmer to access all of the schedules.
// These are like properties of an html element or a Delphi control.
// A programmer might want to read or change these at runtime.
// The Visual Editor can dynamically inspect the list of schedules.
// But a programmer shouldn't *have to* use the dynamic interface.
// Instead, properties have names, object.propertyName, along with types and JSDoc comments.
// This works whether you recently created a TraditionalTextComponent:
//     const sample = new TraditionalTextComponent();
//     const fontFamily = sample.fontFamilySchedule.at(0 /* timeInMs*/);
//     const x = sample.schedules[1].at(0).x;
// or you asked
//     if (fromDatabase instanceof TraditionalTextComponent) { … }
// because TraditionalTextComponent is a class.

/**
 * This is a very early prototype of a slide deck.
 * This is the Visual Editor's answer to MakeShowableInSeries.
 * A user can schedule animations one after the next.
 * In particular, if one gets shorter or longer or added or removed, all those after get moved automatically.
 *
 * Internally I can imagine a very normal looking list of start times, like any schedule.
 * But we only show the user the duration of each item, not the start time.
 * Maybe the user sees both, but it's clear that we are editing a list of durations.
 * Changing one duration does not affect any of the other durations.
 *
 * Should we add info for the children?
 * In particular, the slide deck is fully responsible for the duration that the child runs.
 * (I want to explore the option of children making requests for a certain amount of time, but for now I'm taking the simplest route, all info is prescribed down.)
 * It seems like we should tell each slide how much time it has.
 * Optional fields in ShowOptions could handle this.
 * Maybe the slide gets a field called `progress`, 0 to 1.
 * (or `slideProgress`)
 * Then the slide deck's schedule could include an easing function!
 * **I like this a lot**!
 *
 * I was originally going to limit this metaphor to only holding slides as direct descendants.
 * I'm holding off on that only because I have no easy way to enforce that.
 * Now I'm wondering if there is any reason to enforce that limit?
 * I thought it might be easier because I'd have an "add slide" button that only knew how to add slides.
 * But I already have an add anything button, so why would I want to build my own add slide button.
 * Maybe there could be some sort of SlideDeckChild interface.
 * It could help negotiate the requested time.
 *
 * Should this get its own Visual Editor screen?
 * We need a list of children, which we already get from the existing editor.
 * We need a numbers for the durations, which should be editable.
 *
 * You get a list of names, corresponding to the children.
 * When we display a list of children, we should already number them.
 *
 * Ideally the editor would include the name next to the part that you can edit, instead of a number, but that's not urgent.
 * Also, what happens if you delete a slide?
 * This can get complicated.
 * For now let's focus on the durations and just use a number for the value.
 */
class SlideDeckComponent implements Showable {
  readonly whichSlideSchedule = new NumberDurationScheduleInfo(
    "Which Slide",
    0,
  );
  readonly description = "Slide Deck";
  readonly duration = 0;
  readonly components = new Array<Showable>();
  readonly schedules = [this.whichSlideSchedule] as const;
  show(options: ShowOptions): void {
    const { timeInMs, context } = options;
    const { progress, value } = this.whichSlideSchedule.at(timeInMs);
    const slideProgress = progress;
    const whichSlide = value;
    const component = this.components![whichSlide];
    if (!component) {
      showError(context, `${whichSlide} ${slideProgress.toFixed(3)}`);
    } else {
      const slideOptions = { ...options, slideProgress };
      options.registerTransform?.(component, context.getTransform());
      component.show(slideOptions);
    }
  }
}

/**
 * A slide is a generic container, like `<g>` or `<div>`.
 *
 * See "## Miscellaneous Generic Component" in visual-editor.md for long term plans for this.
 * For now I support a very minimal transform property, and a border to help show off that transform.
 *
 * You should be able to add one of these anywhere.
 * A slide deck might require each direct child to be one of these.
 */
export function createSlideComponent(): Showable {
  const transformStringSchedule: Keyframe<string>[] = [
    { time: 0, value: "translate(1px, 1px) scale(0.5)" },
  ];
  const borderColorSchedule: Keyframe<string>[] = [{ time: 0, value: "blue" }];
  return {
    description: "Slide",
    duration: 0,
    components: [],
    schedules: [
      {
        type: "string",
        description: "Transform",
        schedule: transformStringSchedule,
      },
      {
        type: "color",
        description: "Border Color",
        schedule: borderColorSchedule,
      },
    ],
    show(options) {
      const { context, timeInMs } = options;
      const transformString = discreteKeyframes(
        timeInMs,
        transformStringSchedule,
      );
      let transform: DOMMatrixReadOnly | undefined;
      try {
        const originalTransform = context.getTransform();
        const transform = new DOMMatrixReadOnly(transformString);
        applyTransform(context, transform);
        context.lineJoin = "miter";
        context.lineWidth = errorFont.strokeWidth;
        const color = interpolateColors(timeInMs, borderColorSchedule);
        context.strokeStyle = color;
        context.strokeRect(0, 0, 16, 9);
        const tf = context.getTransform();
        this.components!.forEach((component) => {
          options.registerTransform?.(component, tf);
          component.show(options);
        });
        context.setTransform(originalTransform);
      } catch (ex) {
        if (transform) {
          // Unknown problem.
          // We might be in a weird state.
          throw ex;
        }
        // Report problem interpreting transform string but keep going.
        showError(context, "Invalid Transform String:\n" + transformString);
      }
    },
  };
}

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
function setTextFormatList(
  options: ShowOptions,
  textFormatList: readonly TextFormatComponent[],
) {
  return { ...options, [TEXT_FORMAT_LIST]: textFormatList };
}
/**
 * Use this to combine multiple formats into one paragraph.
 *
 * This contains a sequence of TextSpanComponent objects with the text to display.
 * And a sequence of TextFormatComponent objects with formatting instructions.
 * Each TextSpanComponent object points to a TextFormatComponent object using an index number.
 * Presumably a lot of formatting will be reused, like "normal" and bold.
 *
 * This is a prototype.
 * The basic functionality is there and works.
 * But the GUI needs some cleanup.
 * If nothing else it needs instructions.
 * Ideally it would be impossible to add a TextSpanComponent or a TextFormatComponent to anything but one of these components.
 * And these components should only be able to have two types of children:  TextSpanComponent or TextFormatComponent.
 *
 * Currently we print a warning on the screen for any errors.
 *
 * We can now have other children.
 * TextSpanComponent and TextFormatComponent have special meanings.
 * Any other children are drawn like normal.
 * These children are drawn before the TextSpanComponents are drawn.
 * Currently that doesn't do much.
 * But the plan is for descendants to have access to this component's formatters.
 */
export class MultiTextComponent implements Showable {
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
  readonly widthSchedule = new NumberScheduleInfo("Width", 7.5);
  readonly additionalLineHeightSchedule = new NumberScheduleInfo(
    "Additional Line Height",
    0,
  );
  readonly schedules = [
    this.positionSchedule,
    this.alignmentSchedule,
    this.widthSchedule,
    this.additionalLineHeightSchedule,
  ] as const;
  readonly description = "Multi Text";
  readonly duration = 0;
  readonly components: Showable[] = [];
  show(options: ShowOptions): void {
    const { context, timeInMs } = options;
    const sources = new Array<TextSpanComponent>();
    const newFormatters = new Array<TextFormatComponent>();
    const otherChildren = new Array<Showable>();
    this.components.forEach((child) => {
      if (child instanceof TextSpanComponent) {
        sources.push(child);
      } else if (child instanceof TextFormatComponent) {
        newFormatters.push(child);
      } else {
        otherChildren.push(child);
      }
    });
    const allFormatters = extractTextFormatList(options, newFormatters);
    const childOptions = setTextFormatList(options, allFormatters);
    otherChildren.forEach((child) => {
      child.show(childOptions);
    });
    const paragraphLayout = new ParagraphLayout(baseFont);
    const initializedFormatters = new Map<
      string,
      ReturnType<TextFormatComponent["freeze"]> | undefined
    >();
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
    const position = this.positionSchedule.at(timeInMs);
    const alignment = this.alignmentSchedule.at(timeInMs);
    const width = this.widthSchedule.at(timeInMs);
    const additionalLineHeight = this.additionalLineHeightSchedule.at(timeInMs);
    const aligned = paragraphLayout.align(
      width,
      alignment,
      additionalLineHeight,
    );
    const x =
      position.x -
      (alignment == "right" ? width : alignment == "center" ? width / 2 : 0);
    const y = position.y;
    aligned.pathShapeByTag().forEach((pathShape, callback) => {
      pathShape = pathShape.translate(x, y);
      (callback as (options: ShowOptions, pathShape: PathShape) => void)(
        options,
        pathShape,
      );
    });
  }
}

export class TextSpanComponent implements Showable {
  public contentSchedule = new StringScheduleInfo("Content", "");
  // TODO do not allow easing in styleSchedule.
  public styleSchedule = new StringScheduleInfo("Style", "");
  readonly schedules = [this.contentSchedule, this.styleSchedule] as const;
  readonly description = "Text Span";
  readonly duration = 0;
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

type CachedFont = {
  readonly font: Font;
  readonly size: number;
  readonly boldness: number;
  readonly obliqueness: number;
};

export class TextFormatComponent implements Showable {
  readonly nameScalar = new StringScalarInfo("Name", "");
  readonly scalars = [this.nameScalar] as const;
  readonly colorSchedule = new ColorScheduleInfo("Color", "#666");
  readonly sizeSchedule = new NumberScheduleInfo("Font Size", 1);
  readonly boldnessSchedule = new NumberScheduleInfo("Boldness", 1);
  readonly obliquenessSchedule = new NumberScheduleInfo("Obliqueness", 0);
  readonly schedules = [
    this.colorSchedule,
    this.sizeSchedule,
    this.boldnessSchedule,
    this.obliquenessSchedule,
  ] as const;
  readonly description = "Text Format";
  readonly duration = 0;
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
      context.stroke(pathShape.canvasPath);
    }
    function addText(content: string, paragraphLayout: ParagraphLayout): void {
      paragraphLayout.addText(content, font, drawText);
    }
    return addText;
  }
}

export function createTextComponent(
  initialColorSchedule?: Keyframe<string>[],
  initialRectSchedule?: Keyframe<ReadOnlyRect>[],
  initialTextSchedule?: Keyframe<string>[],
): Showable {
  const colorSchedule: Keyframe<string>[] = initialColorSchedule ?? [
    { time: 0, value: "#888" },
  ];
  const rectSchedule: Keyframe<ReadOnlyRect>[] = initialRectSchedule ?? [
    { time: 0, value: { x: 2, y: 2, width: 6, height: 4 } },
  ];
  const textSchedule: Keyframe<string>[] = initialTextSchedule ?? [
    { time: 0, value: "Type Here" },
  ];
  const sizeSchedule: Keyframe<number>[] = [{ time: 0, value: 1 }];
  const boldnessSchedule: Keyframe<number>[] = [{ time: 0, value: 1 }];
  const obliquenessSchedule: Keyframe<number>[] = [{ time: 0, value: 0 }];
  const alignmentChoices = ["left", "center", "right", "justify"] as const;
  type Alignment = (typeof alignmentChoices)[number];
  const alignmentSchedule: Keyframe<Alignment>[] = [{ time: 0, value: "left" }];
  let cachedFont: undefined | CachedFont;
  let cachedPath:
    | undefined
    | {
        readonly cachedFont: CachedFont;
        readonly width: number;
        readonly text: string;
        readonly alignment: Alignment;
        readonly path: Path2D;
      };
  return {
    description: "Text",
    duration: 0,
    schedules: [
      { description: "Color", type: "color", schedule: colorSchedule },
      { description: "Rect", type: "rectangle", schedule: rectSchedule },
      { description: "Text", type: "string", schedule: textSchedule },
      { description: "Size", type: "number", schedule: sizeSchedule },
      { description: "Boldness", type: "number", schedule: boldnessSchedule },
      {
        description: "Obliqueness",
        type: "number",
        schedule: obliquenessSchedule,
      },
      {
        description: "Alignment",
        type: "select",
        choices: alignmentChoices,
        schedule: alignmentSchedule,
      },
    ],
    show({ context, timeInMs }) {
      const color = interpolateColors(timeInMs, colorSchedule);
      const rect = interpolateRects(timeInMs, rectSchedule);
      const text = discreteKeyframes(timeInMs, textSchedule);
      const size = interpolateNumbers(timeInMs, sizeSchedule);
      const boldness = interpolateNumbers(timeInMs, boldnessSchedule);
      const obliqueness = interpolateNumbers(timeInMs, obliquenessSchedule);
      const alignment = discreteKeyframes(timeInMs, alignmentSchedule);
      context.strokeStyle = color;
      if (
        !cachedFont ||
        cachedFont.size != size ||
        cachedFont.boldness != boldness ||
        cachedFont.obliqueness != obliqueness
      ) {
        const font = makeLineFontRatio(size, boldness).oblique(obliqueness);
        cachedFont = { font, size, boldness, obliqueness };
      }
      if (
        !cachedPath ||
        cachedPath.cachedFont != cachedFont ||
        cachedPath.width != rect.width ||
        cachedPath.text != text ||
        cachedPath.alignment != alignment
      ) {
        const path = ParagraphLayout.singlePathShape({
          font: cachedFont.font,
          text,
          width: rect.width,
          alignment,
        }).canvasPath;
        cachedPath = { cachedFont, path, text, width: rect.width, alignment };
      }
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = cachedFont.font.strokeWidth;
      const matrix = context.getTransform();
      context.translate(rect.x, rect.y);
      context.stroke(cachedPath.path);
      context.setTransform(matrix);
    },
  };
}

/**
 * Standard registry component: a filled rectangle with an editable color and
 * position/size schedule.
 *
 * Pass pre-populated schedule arrays to seed an existing animation; omit them
 * to get a single-keyframe default suitable for a brand-new rectangle.
 */
export function createRectangleComponent(
  initialColorSchedule?: Keyframe<string>[],
  initialRectSchedule?: Keyframe<ReadOnlyRect>[],
): Showable {
  const colorSchedule: Keyframe<string>[] = initialColorSchedule ?? [
    { time: 0, value: "cyan" },
  ];
  const rectSchedule: Keyframe<ReadOnlyRect>[] = initialRectSchedule ?? [
    { time: 0, value: { x: 2, y: 2, width: 6, height: 4 } },
  ];

  return {
    description: "Rectangle",
    duration: 0,
    schedules: [
      { description: "Color", type: "color", schedule: colorSchedule },
      { description: "Rect", type: "rectangle", schedule: rectSchedule },
    ],
    show({ context, timeInMs }) {
      const color = interpolateColors(timeInMs, colorSchedule);
      const rect = interpolateRects(timeInMs, rectSchedule);
      context.fillStyle = color;
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
    },
  };
}

/**
 * Standard registry component: a Cartesian function graph with an editable
 * destination rect and view window.
 *
 * The function `f` is supplied at construction time (code, not data).
 * Everything visual — position, view range, colors, font — is an editable
 * schedule, so you can adjust the graph live in the editor without restarting.
 *
 * The y range is auto-computed from sampling `f` over the default x range
 * and stored as the initial keyframe values, ready to be overridden.
 */
/**
 * Standard registry component: draws a single image loaded from a URL.
 *
 * While the image is loading (or if the URL is empty), the destination
 * rectangle is left blank.  If the URL is non-empty but the load fails,
 * {@link SlowImage.showError} draws a red ✕ so the problem is obvious.
 *
 * The URL schedule is discrete — changing it mid-animation triggers a fresh
 * load.  The dest-rect schedule is interpolated so you can animate placement.
 */
export function createSingleImageComponent(initialUrl = ""): Showable {
  const urlSchedule: Keyframe<string>[] = [{ time: 0, value: initialUrl }];
  const destRectSchedule: Keyframe<ReadOnlyRect>[] = [
    { time: 0, value: { x: 1, y: 1, width: 14, height: 7 } },
  ];

  let trackedUrl = "";
  let image: SingleImage | null = null;

  return {
    description: "Static Image",
    duration: 0,
    schedules: [
      { description: "URL", type: "string", schedule: urlSchedule },
      {
        description: "Dest Rect",
        type: "rectangle",
        schedule: destRectSchedule,
      },
    ],
    show({ context, timeInMs }) {
      const url = discreteKeyframes(timeInMs, urlSchedule);
      const dest = interpolateRects(timeInMs, destRectSchedule);

      if (url !== trackedUrl) {
        trackedUrl = url;
        image = url ? new SingleImage(url) : null;
      }

      if (!image) return; // empty URL — leave the area blank
      if (!image.somethingIsAvailable) {
        SlowImage.showError(context, dest.x, dest.y, dest.width, dest.height);
        return;
      }

      // Fit the image inside dest, preserving aspect ratio (centered).
      const imgAspect = image.naturalWidth / image.naturalHeight;
      const destAspect = dest.width / dest.height;
      let drawW: number, drawH: number;
      if (imgAspect > destAspect) {
        drawW = dest.width;
        drawH = dest.width / imgAspect;
      } else {
        drawH = dest.height;
        drawW = dest.height * imgAspect;
      }
      const drawX = dest.x + (dest.width - drawW) / 2;
      const drawY = dest.y + (dest.height - drawH) / 2;
      context.drawImage(
        image.data as CanvasImageSource,
        drawX,
        drawY,
        drawW,
        drawH,
      );
    },
  };
}

export function createFunctionGraphComponent(
  f: (x: number) => number = Math.sin,
): Showable {
  const SAMPLE_COUNT = 300;
  const X_DEFAULT_MIN = -Math.PI * 2;
  const X_DEFAULT_MAX = Math.PI * 2;

  // Sample f to auto-range the y axis.
  const yValues: number[] = [];
  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const x =
      X_DEFAULT_MIN + ((X_DEFAULT_MAX - X_DEFAULT_MIN) * i) / SAMPLE_COUNT;
    yValues.push(f(x));
  }
  const yDataMin = Math.min(...yValues);
  const yDataMax = Math.max(...yValues);
  const yPad = Math.max((yDataMax - yDataMin) * 0.1, 0.1);

  const destRectSchedule: Keyframe<ReadOnlyRect>[] = [
    { time: 0, value: { x: 2, y: 2, width: 6, height: 4 } },
  ];
  const xMinSchedule: Keyframe<number>[] = [{ time: 0, value: X_DEFAULT_MIN }];
  const xMaxSchedule: Keyframe<number>[] = [{ time: 0, value: X_DEFAULT_MAX }];
  const yMinSchedule: Keyframe<number>[] = [
    { time: 0, value: yDataMin - yPad },
  ];
  const yMaxSchedule: Keyframe<number>[] = [
    { time: 0, value: yDataMax + yPad },
  ];
  const gridColorSchedule: Keyframe<string>[] = [
    { time: 0, value: "rgba(255,255,255,0.35)" },
  ];
  const gridLineWidthSchedule: Keyframe<number>[] = [{ time: 0, value: 0.02 }];
  const fontSchedule: Keyframe<string>[] = [
    { time: 0, value: "0.28px sans-serif" },
  ];
  const curveColorSchedule: Keyframe<string>[] = [
    { time: 0, value: "rgb(0,128,255)" },
  ];

  return {
    description: "Function Graph",
    duration: 0,
    schedules: [
      {
        description: "Dest Rect",
        type: "rectangle",
        schedule: destRectSchedule,
      },
      { description: "X Min", type: "number", schedule: xMinSchedule },
      { description: "X Max", type: "number", schedule: xMaxSchedule },
      { description: "Y Min", type: "number", schedule: yMinSchedule },
      { description: "Y Max", type: "number", schedule: yMaxSchedule },
      {
        description: "Grid Color",
        type: "string",
        schedule: gridColorSchedule,
      },
      {
        description: "Grid Line Width",
        type: "number",
        schedule: gridLineWidthSchedule,
      },
      { description: "Font", type: "string", schedule: fontSchedule },
      {
        description: "Curve Color",
        type: "color",
        schedule: curveColorSchedule,
      },
    ],
    show({ context, timeInMs }) {
      const destRect = interpolateRects(timeInMs, destRectSchedule);
      const xMin = interpolateNumbers(timeInMs, xMinSchedule);
      const xMax = interpolateNumbers(timeInMs, xMaxSchedule);
      const yMin = interpolateNumbers(timeInMs, yMinSchedule);
      const yMax = interpolateNumbers(timeInMs, yMaxSchedule);
      if (xMax <= xMin || yMax <= yMin) return;

      const gridColor = discreteKeyframes(timeInMs, gridColorSchedule);
      const gridLineWidth = interpolateNumbers(timeInMs, gridLineWidthSchedule);
      const font = discreteKeyframes(timeInMs, fontSchedule);
      const curveColor = interpolateColors(timeInMs, curveColorSchedule);

      const viewRect: ReadOnlyRect = {
        x: xMin,
        y: yMin,
        width: xMax - xMin,
        height: yMax - yMin,
      };

      drawGrid(context, {
        destRect,
        viewRect,
        color: gridColor,
        majorLineWidth: gridLineWidth,
        font,
      });

      // Use the same transform as drawGrid so the curve aligns with the grid.
      const xf = computeGridTransform(destRect, viewRect);
      if (!xf) return;
      const { toCanvasX, toCanvasY, effectiveRect } = xf;

      // Border — drawn around the actual letterboxed area.
      context.strokeStyle = gridColor;
      context.lineWidth = gridLineWidth * 1.5;
      context.setLineDash([]);
      context.lineCap = "butt";
      context.strokeRect(
        effectiveRect.x,
        effectiveRect.y,
        effectiveRect.width,
        effectiveRect.height,
      );

      // Function curve — clipped to effectiveRect.
      context.save();
      context.beginPath();
      context.rect(
        effectiveRect.x,
        effectiveRect.y,
        effectiveRect.width,
        effectiveRect.height,
      );
      context.clip();

      context.beginPath();
      for (let i = 0; i <= SAMPLE_COUNT; i++) {
        const mx = xMin + ((xMax - xMin) * i) / SAMPLE_COUNT;
        const cx = toCanvasX(mx);
        const cy = toCanvasY(f(mx));
        if (i === 0) context.moveTo(cx, cy);
        else context.lineTo(cx, cy);
      }
      context.strokeStyle = curveColor;
      context.lineWidth = 0.04;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();

      context.restore();
    },
  };
}

/** Registry of component factories available in the "Add" dropdown. */
export const componentRegistry = new Map<string, () => Showable>([
  ["Slide Deck", () => new SlideDeckComponent()],
  ["Slide", () => createSlideComponent()],
  ["Text", () => createTextComponent()],
  ["Traditional Text", () => new TraditionalTextComponent()],
  ["Rectangle", () => createRectangleComponent()],
  ["Function Graph (sin)", () => createFunctionGraphComponent()],
  ["Function Graph (x²)", () => createFunctionGraphComponent((x) => x * x)],
  ["Static Image", () => createSingleImageComponent()],
  ["Multi Text", () => new MultiTextComponent()],
  ["Text Span", () => new TextSpanComponent()],
  ["Text Format", () => new TextFormatComponent()],
]);

export type SerializedChild = {
  registryKey: string;
  schedules: SerializedSchedule[];
  scalars?: SerializedScalar[];
  components?: SerializedChild[];
};

/**
 * Rebuilds a component list from a serialized snapshot (e.g. a database entry
 * pasted directly into source code).  Each entry is created via its registry
 * factory, has its `registryKey` stamped on it, schedules restored via
 * `applySnapshot`, and nested components rebuilt recursively.  Entries whose
 * `registryKey` is not found in the registry are silently skipped.
 */
export function buildComponents(snapshot: SerializedChild[]): Showable[] {
  return snapshot.flatMap((sc) => {
    const factory = componentRegistry.get(sc.registryKey);
    if (!factory) return [];
    const child = factory();
    child.registryKey = sc.registryKey;
    if (child.scalars?.length && sc.scalars?.length) {
      applyScalarSnapshot(child.scalars, sc.scalars);
    }
    if (child.schedules?.length) applySnapshot(child.schedules, sc.schedules);
    if (child.components !== undefined && sc.components?.length) {
      child.components.push(...buildComponents(sc.components));
    }
    return [child];
  });
}
