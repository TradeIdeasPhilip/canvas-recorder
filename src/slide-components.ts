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
import { PathShape, Point } from "./glib/path-shape";

const errorFont = makeLineFont(1);

/**
 * Write text on the screen where it is big and easy to see, even without knowing what else is there.
 * @param context Where to draw.
 * @param text What to draw.
 * Can include " " and "\n" for optional and forced line breaks.
 */
export function showError(context: CanvasRenderingContext2D, text: string) {
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
 * TODO: font-feature-settings (e.g. "tnum" for tabular numbers) is NOT
 * supported in the Canvas 2D API.  The canvas ctx.font property only accepts
 * the CSS2-level font shorthand; OpenType feature settings have no canvas
 * equivalent.  A potential workaround for tabular numbers is drawing each
 * digit individually at a fixed advance width.
 *
 * Exported so that dev/canvas-recorder.ts can do instanceof checks to build
 * the component-specific Font Info panel.
 */
export class TraditionalTextComponent implements Showable {
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
   * "normal" or "italic".
   * Oblique is omitted: the Canvas 2D API essentially treats it as a synonym
   * for italic and ignores any angle specification, so there is no practical
   * difference for our purposes.
   */
  readonly fontStyleSchedule = new SelectScheduleInfo("Font Style", "normal", [
    "normal",
    "italic",
  ] as const);
  /**
   * CSS font-weight (100–900).  400 = Normal, 700 = Bold.
   * The Visual Editor shows a warning in the Font Info panel if the selected
   * weight is not available for the current font family.
   */
  readonly fontWeightSchedule = new NumberScheduleInfo("Font Weight", 400);
  /**
   * The font family name (e.g. "Life Savers", "Times New Roman").
   *
   * The {@link choices} array is populated asynchronously from
   * `document.fonts` once fonts have loaded, enabling the Visual Editor to
   * offer an autocomplete combo box.  Until then the field accepts free text.
   *
   * Note: `window.queryLocalFonts()` (an experimental API requiring a
   * permission grant) can expose additional installed fonts not in
   * `document.fonts`.  Merging the two lists is a future enhancement.
   */
  readonly fontFamilySchedule = (() => {
    const info = new StringScheduleInfo("Font Family", [
      { time: 0, value: "Life Savers" },
    ]);
    // `document` is unavailable in Node.js (record/cli-record.ts).
    if (typeof document !== "undefined") {
      document.fonts.ready.then(() => {
        const families = new Set<string>();
        for (const face of document.fonts) {
          // FontFace.family may be wrapped in quotes; strip them.
          families.add(face.family.replace(/^["']|["']$/g, "").trim());
        }
        info.choices = [...families].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" }),
        );
      });
    }
    info.useDialog = true;
    return info;
  })();
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
    this.fontStyleSchedule,
    this.fontWeightSchedule,
    this.fontFamilySchedule,
    this.textAlignSchedule,
    this.textBaselineSchedule,
  ] as const;
  readonly description = "Traditional Text";
  readonly duration = 0;
  constructor(
    initialValues: {
      text?: string | readonly Keyframe<string>[];
      position?: Point;
      fillColor?: string | readonly Keyframe<string>[];
      outlineColor?: string | readonly Keyframe<string>[];
      outlineWidth?: number | readonly Keyframe<number>[];
      fontSize?: number | readonly Keyframe<number>[];
      fontStyle?: Parameters<
        TraditionalTextComponent["fontStyleSchedule"]["set"]
      >[0];
      fontWeight?: number | readonly Keyframe<number>[];
      fontFamily?: string | readonly Keyframe<string>[];
      textAlign?: Parameters<
        TraditionalTextComponent["textAlignSchedule"]["set"]
      >[0];
      textBaseline?: Parameters<
        TraditionalTextComponent["textBaselineSchedule"]["set"]
      >[0];
    } = {},
  ) {
    if (initialValues.text !== undefined)
      this.textSchedule.set(initialValues.text);
    if (initialValues.position !== undefined)
      this.positionSchedule.set(initialValues.position);
    if (initialValues.fillColor !== undefined)
      this.fillColorSchedule.set(initialValues.fillColor);
    if (initialValues.outlineColor !== undefined)
      this.outlineColorSchedule.set(initialValues.outlineColor);
    if (initialValues.outlineWidth !== undefined)
      this.outlineWidthSchedule.set(initialValues.outlineWidth);
    if (initialValues.fontSize !== undefined)
      this.fontSizeSchedule.set(initialValues.fontSize);
    if (initialValues.fontStyle !== undefined)
      this.fontStyleSchedule.set(initialValues.fontStyle);
    if (initialValues.fontWeight !== undefined)
      this.fontWeightSchedule.set(initialValues.fontWeight);
    if (initialValues.fontFamily !== undefined)
      this.fontFamilySchedule.set(initialValues.fontFamily);
    if (initialValues.textAlign !== undefined)
      this.textAlignSchedule.set(initialValues.textAlign);
    if (initialValues.textBaseline !== undefined)
      this.textBaselineSchedule.set(initialValues.textBaseline);
  }
  show({ context, timeInMs }: ShowOptions) {
    const text = this.textSchedule.at(timeInMs);
    const position = this.positionSchedule.at(timeInMs);
    const fillColor = this.fillColorSchedule.at(timeInMs);
    const outlineWidth = this.outlineWidthSchedule.at(timeInMs);
    const fontSize = this.fontSizeSchedule.at(timeInMs);
    const fontStyle = this.fontStyleSchedule.at(timeInMs);
    const fontWeight = this.fontWeightSchedule.at(timeInMs);
    const fontFamily = this.fontFamilySchedule.at(timeInMs);
    // CSS font shorthand: [style] [weight] [size] [family]
    const fontString = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
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
export class SlideDeckComponent implements Showable {
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
 * Mathematical Bold Script capital letters A–J, used as placeholders in
 * {@link SlideComponent} transform templates.  String values only — ASCII
 * export name to avoid Rollup's non-Latin-1 truncation bug.
 */
export const TRANSFORM_PLACEHOLDERS = [
  "𝓐",
  "𝓑",
  "𝓒",
  "𝓓",
  "𝓔",
  "𝓕",
  "𝓖",
  "𝓗",
  "𝓘",
  "𝓙",
] as const;

/**
 * A slide is a generic container, like `<g>` or `<div>`.
 *
 * The transform is specified as a CSS transform string template.
 * Write placeholders like 𝓐 𝓑 𝓒 … in the template; each maps to an
 * animatable numeric schedule of the same name.  Example:
 *   "scale(𝓐) translate(𝓑px, 𝓒px)"
 *
 * Up to 10 placeholders (𝓐–𝓙) are available.  Unused schedules default
 * to 1 and can be ignored.
 *
 * Exported so dev/canvas-recorder.ts can use instanceof for the custom panel.
 */
export class SlideComponent implements Showable {
  readonly transformTemplate = new StringScalarInfo(
    "Transform Template",
    "scale(1)",
  );
  readonly scalars = [this.transformTemplate] as const;

  readonly placeA = new NumberScheduleInfo("𝓐", 1);
  readonly placeB = new NumberScheduleInfo("𝓑", 1);
  readonly placeC = new NumberScheduleInfo("𝓒", 1);
  readonly placeD = new NumberScheduleInfo("𝓓", 1);
  readonly placeE = new NumberScheduleInfo("𝓔", 1);
  readonly placeF = new NumberScheduleInfo("𝓕", 1);
  readonly placeG = new NumberScheduleInfo("𝓖", 1);
  readonly placeH = new NumberScheduleInfo("𝓗", 1);
  readonly placeI = new NumberScheduleInfo("𝓘", 1);
  readonly placeJ = new NumberScheduleInfo("𝓙", 1);

  protected schedulesInternal = [
    this.placeA,
    this.placeB,
    this.placeC,
    this.placeD,
    this.placeE,
    this.placeF,
    this.placeG,
    this.placeH,
    this.placeI,
    this.placeJ,
  ];

  readonly schedules: Showable["schedules"] = this.schedulesInternal;

  readonly description: string;
  readonly duration = 0;
  readonly components: Showable[] = [];
  constructor(
    initialValues: {
      description?: string;
      transformTemplate?: string;
      placeA?: number | readonly Keyframe<number>[];
      placeB?: number | readonly Keyframe<number>[];
      placeC?: number | readonly Keyframe<number>[];
      placeD?: number | readonly Keyframe<number>[];
      placeE?: number | readonly Keyframe<number>[];
      placeF?: number | readonly Keyframe<number>[];
      placeG?: number | readonly Keyframe<number>[];
      placeH?: number | readonly Keyframe<number>[];
      placeI?: number | readonly Keyframe<number>[];
      placeJ?: number | readonly Keyframe<number>[];
    } = {},
  ) {
     this.description = initialValues.description ?? "Slide";
    if (initialValues.transformTemplate !== undefined)
      this.transformTemplate.value = initialValues.transformTemplate;
    if (initialValues.placeA !== undefined)
      this.placeA.set(initialValues.placeA);
    if (initialValues.placeB !== undefined)
      this.placeB.set(initialValues.placeB);
    if (initialValues.placeC !== undefined)
      this.placeC.set(initialValues.placeC);
    if (initialValues.placeD !== undefined)
      this.placeD.set(initialValues.placeD);
    if (initialValues.placeE !== undefined)
      this.placeE.set(initialValues.placeE);
    if (initialValues.placeF !== undefined)
      this.placeF.set(initialValues.placeF);
    if (initialValues.placeG !== undefined)
      this.placeG.set(initialValues.placeG);
    if (initialValues.placeH !== undefined)
      this.placeH.set(initialValues.placeH);
    if (initialValues.placeI !== undefined)
      this.placeI.set(initialValues.placeI);
    if (initialValues.placeJ !== undefined)
      this.placeJ.set(initialValues.placeJ);
  }

  transformStringAt(timeInMs: number): string {
    const values = [
      this.placeA.at(timeInMs),
      this.placeB.at(timeInMs),
      this.placeC.at(timeInMs),
      this.placeD.at(timeInMs),
      this.placeE.at(timeInMs),
      this.placeF.at(timeInMs),
      this.placeG.at(timeInMs),
      this.placeH.at(timeInMs),
      this.placeI.at(timeInMs),
      this.placeJ.at(timeInMs),
    ];
    let result = this.transformTemplate.value;
    TRANSFORM_PLACEHOLDERS.forEach((ph, i) => {
      result = result.replaceAll(ph, String(values[i]));
    });
    return result;
  }

  show(options: ShowOptions): void {
    const { context, timeInMs } = options;
    const transformString = this.transformStringAt(timeInMs);
    const originalTransform = context.getTransform();
    let transformMatrix: undefined | DOMMatrixReadOnly;
    try {
      transformMatrix = new DOMMatrixReadOnly(transformString);
    } catch {
      showError(context, "Invalid Transform:\n" + transformString);
      return;
    }
    applyTransform(context, transformMatrix);
    const currentTransform = context.getTransform();
    this.components.forEach((component) => {
      options.registerTransform?.(component, currentTransform);
      component.show(options);
    });
    this.additionalDrawing(options);
    context.setTransform(originalTransform);
  }
  protected additionalDrawing(options: ShowOptions) {}
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
    this.components.push(span);
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
   * Remove all TextSpanComponent children.
   * Leave the TextFormatComponent children in place.
   */
  clearText() {
    const components = this.components;
    for (let index = components.length - 1; index >= 0; index--) {
      if (components[index] instanceof TextSpanComponent) {
        components.splice(index, 1);
      }
    }
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
  readonly schedules = [
    this.positionSchedule,
    this.alignmentSchedule,
    this.textBaselineSchedule,
    this.widthSchedule,
    this.additionalLineHeightSchedule,
  ] as const;
  readonly description = "Multi Text";
  readonly duration = 0;
  readonly components: Showable[] = [];
  constructor(
    initialValues: {
      position?: Point | readonly Keyframe<Point>[];
      alignment?: Parameters<MultiTextComponent["alignmentSchedule"]["set"]>[0];
      textBaseline?: Parameters<
        MultiTextComponent["textBaselineSchedule"]["set"]
      >[0];
      width?: number | readonly Keyframe<number>[];
      additionalLineHeight?: number | readonly Keyframe<number>[];
    } = {},
  ) {
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
    // Note:  paragraphLayout.align() has partial support for more.
    // Things like capital top or (normal text) baseline.
    // But that code seems to be in a state of flux at the moment.
    // TODO fix it.
    const baseline = this.textBaselineSchedule.at(timeInMs);
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
    const height = aligned.height;
    const y =
      position.y -
      (baseline == "bottom" ? height : baseline == "middle" ? height / 2 : 0);
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

type CachedFont = {
  readonly font: Font;
  readonly size: number;
  readonly boldness: number;
  readonly obliqueness: number;
};

export class TextFormatComponent implements Showable {
  readonly nameScalar = new StringScalarInfo("Name", "");
  readonly scalars = [this.nameScalar] as const;
  readonly colorSchedule: ColorScheduleInfo;
  readonly sizeSchedule = new NumberScheduleInfo("Font Size", 1);
  readonly boldnessSchedule = new NumberScheduleInfo("Boldness", 1);
  readonly obliquenessSchedule = new NumberScheduleInfo("Obliqueness", 0);
  readonly alphaSchedule = new NumberScheduleInfo("Alpha", 1);
  get schedules() {
    return [
      this.colorSchedule,
      this.sizeSchedule,
      this.boldnessSchedule,
      this.obliquenessSchedule,
      this.alphaSchedule,
    ] as const;
  }
  readonly description = "Text Format";
  readonly duration = 0;
  constructor(
    initialValues: {
      name?: string;
      color?: string | readonly Keyframe<string>[] | ColorScheduleInfo;
      size?: number | readonly Keyframe<number>[];
      boldness?: number | readonly Keyframe<number>[];
      obliqueness?: number | readonly Keyframe<number>[];
      alpha?: number | readonly Keyframe<number>[];
    } = {},
  ) {
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

export class TextComponent implements Showable {
  readonly description = "Text";
  readonly duration = 0;
  readonly colorSchedule = new ColorScheduleInfo("Color", "#888");
  readonly rectSchedule = new RectangleScheduleInfo("Rect", {
    x: 2,
    y: 2,
    width: 6,
    height: 4,
  });
  readonly textSchedule = new StringScheduleInfo("Text", "Type Here");
  readonly sizeSchedule = new NumberScheduleInfo("Size", 1);
  readonly boldnessSchedule = new NumberScheduleInfo("Boldness", 1);
  readonly obliquenessSchedule = new NumberScheduleInfo("Obliqueness", 0);
  readonly alignmentSchedule = new SelectScheduleInfo("Alignment", "left", [
    "left",
    "center",
    "right",
    "justify",
  ]);
  readonly schedules = [
    this.colorSchedule,
    this.rectSchedule,
    this.textSchedule,
    this.sizeSchedule,
    this.boldnessSchedule,
    this.obliquenessSchedule,
    this.alignmentSchedule,
  ] as const;
  constructor(
    initialValues: {
      color?: string | readonly Keyframe<string>[];
      rect?: ReadOnlyRect | readonly Keyframe<ReadOnlyRect>[];
      text?: string | readonly Keyframe<string>[];
      size?: number | readonly Keyframe<number>[];
      boldness?: number | readonly Keyframe<number>[];
      obliqueness?: number | readonly Keyframe<number>[];
      // I have mixed feelings on the complicated type definition.
      // It is exactly what it needs to be, and it avoids any duplicated code or namespace pollution.
      // But it is long and complicated.
      // Final thoughts:  It was only complicated the first time.
      // You could clone this any number of times with different classes and properties.
      alignmentSchedule?: Parameters<
        TextComponent["alignmentSchedule"]["set"]
      >[0];
    } = {},
  ) {
    if (initialValues.color !== undefined) {
      this.colorSchedule.set(initialValues.color);
    }
    if (initialValues.rect !== undefined) {
      this.rectSchedule.set(initialValues.rect);
    }
    if (initialValues.text !== undefined) {
      this.textSchedule.set(initialValues.text);
    }
    if (initialValues.size !== undefined) {
      this.sizeSchedule.set(initialValues.size);
    }
    if (initialValues.boldness !== undefined) {
      this.boldnessSchedule.set(initialValues.boldness);
    }
    if (initialValues.obliqueness !== undefined) {
      this.obliquenessSchedule.set(initialValues.obliqueness);
    }
    if (initialValues.alignmentSchedule !== undefined) {
      this.alignmentSchedule.set(initialValues.alignmentSchedule);
    }
  }
  #cachedFont: undefined | CachedFont;
  #cachedPath:
    | undefined
    | {
        readonly cachedFont: CachedFont;
        readonly width: number;
        readonly text: string;
        readonly alignment: TextComponent["alignmentSchedule"]["choices"][0];
        readonly path: Path2D;
      };
  show({ context, timeInMs }: ShowOptions) {
    const color = this.colorSchedule.at(timeInMs);
    const rect = this.rectSchedule.at(timeInMs);
    const text = this.textSchedule.at(timeInMs);
    const size = this.sizeSchedule.at(timeInMs);
    const boldness = this.boldnessSchedule.at(timeInMs);
    const obliqueness = this.obliquenessSchedule.at(timeInMs);
    const alignment = this.alignmentSchedule.at(timeInMs);
    context.strokeStyle = color;
    if (
      !this.#cachedFont ||
      this.#cachedFont.size != size ||
      this.#cachedFont.boldness != boldness ||
      this.#cachedFont.obliqueness != obliqueness
    ) {
      const font = makeLineFontRatio(size, boldness).oblique(obliqueness);
      this.#cachedFont = { font, size, boldness, obliqueness };
    }
    if (
      !this.#cachedPath ||
      this.#cachedPath.cachedFont != this.#cachedFont ||
      this.#cachedPath.width != rect.width ||
      this.#cachedPath.text != text ||
      this.#cachedPath.alignment != alignment
    ) {
      const path = ParagraphLayout.singlePathShape({
        font: this.#cachedFont.font,
        text,
        width: rect.width,
        alignment,
      }).canvasPath;
      const cachedFont = this.#cachedFont;
      this.#cachedPath = {
        cachedFont,
        path,
        text,
        width: rect.width,
        alignment,
      };
    }
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = this.#cachedFont.font.strokeWidth;
    const matrix = context.getTransform();
    context.translate(rect.x, rect.y);
    context.stroke(this.#cachedPath.path);
    context.setTransform(matrix);
  }
}

/**
 * Standard registry component: a filled rectangle with an editable color and
 * position/size schedule.
 */
export class RectangleComponent implements Showable {
  readonly colorSchedule = new ColorScheduleInfo("Color", "cyan");
  readonly rectSchedule = new RectangleScheduleInfo("Rect", {
    x: 2,
    y: 2,
    width: 6,
    height: 4,
  });
  readonly schedules = [this.colorSchedule, this.rectSchedule] as const;
  readonly description = "Rectangle";
  readonly duration = 0;
  constructor(
    initialValues: {
      color?: string | readonly Keyframe<string>[];
      rect?: ReadOnlyRect | readonly Keyframe<ReadOnlyRect>[];
    } = {},
  ) {
    if (initialValues.color !== undefined)
      this.colorSchedule.set(initialValues.color);
    if (initialValues.rect !== undefined)
      this.rectSchedule.set(initialValues.rect);
  }
  show({ context, timeInMs }: ShowOptions) {
    const color = this.colorSchedule.at(timeInMs);
    const rect = this.rectSchedule.at(timeInMs);
    context.fillStyle = color;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
}

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
export class SingleImageComponent implements Showable {
  readonly urlSchedule = new StringScheduleInfo("URL", "");
  readonly destRectSchedule = new RectangleScheduleInfo("Dest Rect", {
    x: 1,
    y: 1,
    width: 14,
    height: 7,
  });
  readonly schedules = [this.urlSchedule, this.destRectSchedule] as const;
  readonly description = "Static Image";
  readonly duration = 0;
  #trackedUrl = "";
  #image: SingleImage | null = null;
  constructor(
    initialValues: {
      url?: string | readonly Keyframe<string>[];
      destRect?: ReadOnlyRect | readonly Keyframe<ReadOnlyRect>[];
    } = {},
  ) {
    if (initialValues.url !== undefined)
      this.urlSchedule.set(initialValues.url);
    if (initialValues.destRect !== undefined)
      this.destRectSchedule.set(initialValues.destRect);
  }
  show({ context, timeInMs }: ShowOptions) {
    const url = this.urlSchedule.at(timeInMs);
    const dest = this.destRectSchedule.at(timeInMs);

    if (url !== this.#trackedUrl) {
      this.#trackedUrl = url;
      this.#image = url ? new SingleImage(url) : null;
    }

    if (!this.#image) return;
    if (!this.#image.somethingIsAvailable) {
      SlowImage.showError(context, dest.x, dest.y, dest.width, dest.height);
      return;
    }

    // Fit the image inside dest, preserving aspect ratio (centered).
    const imgAspect = this.#image.naturalWidth / this.#image.naturalHeight;
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
      this.#image.data as CanvasImageSource,
      drawX,
      drawY,
      drawW,
      drawH,
    );
  }
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
  ["Slide", () => new SlideComponent()],
  ["Text", () => new TextComponent()],
  ["Traditional Text", () => new TraditionalTextComponent()],
  ["Rectangle", () => new RectangleComponent()],
  ["Function Graph (sin)", () => createFunctionGraphComponent()],
  ["Function Graph (x²)", () => createFunctionGraphComponent((x) => x * x)],
  ["Static Image", () => new SingleImageComponent()],
  ["Multi Text", () => new MultiTextComponent()],
  ["Text Span", () => new TextSpanComponent()],
  ["Text Format", () => new TextFormatComponent()],
]);

export type SerializedChild = {
  registryKey: string;
  schedules: SerializedSchedule[];
  scalars?: SerializedScalar[];
  components?: SerializedChild[];
  userEditableDescription?: string;
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
    if (sc.userEditableDescription !== undefined)
      child.userEditableDescription = sc.userEditableDescription;
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

/**
 * Resolves when every family in `familyNames` is confirmed available — either
 * as a loaded web font in `document.fonts` or as a local system font from
 * `queryLocalFonts()`.
 *
 * Rejects with a user-readable message listing any missing families.
 *
 * Intended for the recording pipeline: await this before encoding a frame so
 * that text is never rendered with a silent fallback font.
 *
 * In a Node.js / CLI context (where `document` is absent) the promise
 * resolves immediately without checking anything.
 *
 * If `queryLocalFonts()` is unavailable or the user denies permission, the
 * check falls back to web fonts only — local fonts are simply not verified.
 */
export async function fontsAreAvailable(
  familyNames: readonly string[],
): Promise<void> {
  if (typeof document === "undefined") return;

  await document.fonts.ready;

  const known = new Set<string>();
  for (const face of document.fonts) {
    known.add(
      face.family
        .replace(/^["']|["']$/g, "")
        .trim()
        .toLowerCase(),
    );
  }

  if ("queryLocalFonts" in globalThis) {
    try {
      const local = await (
        globalThis as unknown as {
          queryLocalFonts: () => Promise<Array<{ family: string }>>;
        }
      ).queryLocalFonts();
      for (const f of local) known.add(f.family.trim().toLowerCase());
    } catch {
      // Permission denied or API unavailable — proceed with web fonts only.
    }
  }

  const missing = familyNames.filter(
    (name) => !known.has(name.trim().toLowerCase()),
  );
  if (missing.length > 0) {
    const list = missing.map((n) => `"${n}"`).join(", ");
    throw new Error(
      `Font${missing.length === 1 ? "" : "s"} not found: ${list}`,
    );
  }
}
