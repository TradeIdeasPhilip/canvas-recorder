import { ReadOnlyRect } from "phil-lib/misc";
import { Keyframe } from "./interpolate";
import {
  applyScalarSnapshot,
  applySnapshot,
  Scalar,
  SerializedScalar,
  SerializedSchedule,
  Showable,
  ShowableParent,
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
  ArrowScheduleInfo,
  ArrowValue,
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
import { BinaryInserter } from "./binary-search";

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
  readonly registryKey = "Traditional Text";
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
      // Most of the time you want miter.  If there is a sharp corner in
      // the filled version, there will be a corresponding corner in the
      // stroked version.  Where the filled version is smooth, lineJoin
      // is ignored and the stroked version is smooth.  Life Saves seems
      // buggy.  The filled version appears round everywhere, but the
      // stroked version had big pointy spikes.
      context.lineJoin = fontFamily == "Life Savers" ? "round" : "miter";
      context.strokeStyle = outlineColor;
      context.strokeText(text, position.x, position.y);
    }
    context.fillStyle = fillColor;
    context.fillText(text, position.x, position.y);
  }
}

// Strictly speaking, components do not have to be classes.
// They only have to implement Showable.
// However, if you plan to have children that the Visual Editor can add and remove,
// you almost certainly want to subclass ComponentWith*Duration or InParallelComponent,
// instead of starting from scratch.
// Also, making this a class makes it easy for a programmer to access all of the schedules.
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
 * What to do before a {@link Showable} is supposed to start or after it is supposed to end.
 * * "hide" = Don't show at all.
 * * "freeze" = Call show() with `timeInMs` set to 0 before or to `duration` after the item should be running.
 * * "live" = Call show() the values that might be less than 0 or greater than duration.
 *
 * This is aimed at specific containers, like {@link InParallelComponent}.
 * The general assumption is that `Showable` containers are only called with timeInMs between 0 and duration.
 */
export type AtEnd = "hide" | "freeze" | "live";

/**
 * These will be shared in {@link InParallelComponent.children}, so this type is assignable to the standard child record type.
 * This adds sourceIndex, which might be used internally.
 * The default implementation ignores it, but not all subclasses treat all of their subcomponents identically.
 */
type ParallelChildInfo = {
  readonly start: 0;
  readonly replaceable: boolean;
  readonly child: Showable;
  /**
   * Which index of the #fixedChildren or #replaceableChildren arrays was the source of this?
   *
   */
  readonly sourceIndex: number;
};

// TODO add minimum duration as a scalar.
/**
 * This Showable is a container for other Showable objects.
 * Multiple children can run at the same time.
 * The container's duration is the minimum required to allow all of its children to complete.
 *
 * This can take two types of children.
 * Fixed children are added by bespoke TypeScript code, and presumably never changed.
 * Replaceable children are controlled by the Visual Editor.
 *
 * This is a newer version of {@link MakeShowableInSeries}.
 * That version assumed that the contents and durations were fixed.
 */
export class InParallelComponent implements Showable, ShowableParent {
  protected showChild(info: {
    child: Showable;
    replaceable: boolean;
    index: number;
    sourceIndex: number;
    options: ShowOptions;
  }) {
    info.child.show(info.options);
  }
  show(options: ShowOptions): void {
    const children = this.#fromCache().children;
    children.forEach(({ child, replaceable, sourceIndex }, index) => {
      this.showChild({ child, replaceable, index, sourceIndex, options });
    });
  }
  // Interesting.  I had to add this specific way of referencing the base class's type,
  // otherwise the documentation comments on the fields of this object do not get copied.
  readonly replaceableComponents: NonNullable<
    Showable["replaceableComponents"]
  >;
  constructor(readonly description: string) {
    const get = (): Showable[] => [...this.#replaceableChildren];
    const replace = (newItems: readonly Showable[]) => {
      this.#replaceableChildren.forEach((child) => {
        this.#unparent(child);
      });
      this.#replaceableChildren.length = 0;
      newItems.forEach((child) => {
        this.#setParent(child);
        this.#replaceableChildren.push(child);
      });
    };
    const push = (...newItems: Showable[]): void => {
      // There are more efficient ways to do this, but this work work for now.
      // (Lets get the interface down right before trying to optimize!)
      const items = get();
      items.push(...newItems);
      replace(items);
    };
    this.replaceableComponents = { get, replace, push };
  }
  readonly #replaceableChildren = new Array<Showable>();
  #cached:
    | { duration: number; children: readonly ParallelChildInfo[] }
    | undefined;
  #fromCache() {
    if (!this.#cached) {
      const children = new Array<ParallelChildInfo>();
      let replaceableChildrenHaveBeenInserted = false;
      const checkReplaceableChildren = () => {
        if (!replaceableChildrenHaveBeenInserted) {
          this.#replaceableChildren.forEach((child, index) => {
            children.push({
              start: 0,
              replaceable: true,
              child,
              sourceIndex: index,
            });
          });
          replaceableChildrenHaveBeenInserted = true;
        }
      };
      this.#fixedChildren.array.forEach(({ zOrder, child }, index) => {
        if (zOrder >= 0) {
          checkReplaceableChildren();
        }
        children.push({
          start: 0,
          replaceable: false,
          child,
          sourceIndex: index,
        });
      });
      checkReplaceableChildren();
      const duration = this.recomputeDuration(children);
      this.#cached = { children, duration };
    }
    return this.#cached;
  }
  /**
   * This is called while rebuilding the cache.
   * The output of this method will be cached as the new Showable.duration for this object.
   *
   * The default is the max of all children.
   * Override this method if you need a different duration.
   *
   * This method is called whenever the cache is filled.
   * Any time a child's schedule changes or the list of children changes, the cache is invalidated.
   * The cache is used by both the Visual Editor and this.show().
   * You can override this method if you have other work that needs to be done at the same time.
   * You can call the original version of the method if you want to use the default duration.
   * @param children What will be available from the cache as soon as we finish rebuilding the cache.
   * (The output of recomputeDuration will also be added to the cache, so the cache is in the process of being updated, so please don't try to read from the cache at this time.)
   * @returns The new duration to save for anyone who requests it.
   */
  protected recomputeDuration(children: readonly ParallelChildInfo[]) {
    let duration = 0;
    children.forEach(({ child }) => {
      duration = Math.max(duration, child.duration);
    });
    return duration;
  }
  get children(): NonNullable<Showable["children"]> {
    return this.#fromCache().children;
  }
  get duration(): number {
    return this.#fromCache().duration;
  }
  #fixedChildren = new BinaryInserter<{
    child: Showable;
    zOrder: number;
  }>((record) => record.zOrder);
  /**
   *
   * @param child The child to add.
   * @param padding If this is undefined, add the child directly without creating a wrapper.
   * Otherwise create a PaddingComponent as a wrapper around the child, and that wrapper will be a child of this object.
   * This parameter contains instructions for the PaddingComponent constructor.
   * This can be `{}` to create a PaddingComponent with all of the defaults.
   * @param zOrder Where to insert this.
   * The replaceable components are all drawn immediately before zOrder=0.
   * The default z order will be one more than that of the last fixed child already present,
   * effectively pushing to the end of the list.
   * If there are no replaceable components yet the default z order will be 0,
   * immediately after the replaceable components.
   * @throws A child can only have one parent at a time.
   * It is an error to try to add a child that already has a parent.
   */
  addFixed(
    child: Showable,
    padding?: Omit<
      ConstructorParameters<typeof PaddingComponent>[0],
      "registryKey"
    >,
    zOrder?: number,
  ) {
    if (zOrder === undefined) {
      const last = this.#fixedChildren.array.at(-1);
      if (last) {
        zOrder = last.zOrder + 1;
      } else {
        zOrder = 0;
      }
    }
    if (padding) {
      const paddingComponent = new PaddingComponent(padding);
      paddingComponent.addFixed(child);
      child = paddingComponent;
    }
    this.#setParent(child);
    this.#fixedChildren.push({ child, zOrder });
    this.scheduleHasChanged();
  }
  #setParent(child: Showable) {
    if (child.parent) {
      throw new Error("Child already has a parent.");
    }
    child.parent = this;
  }
  #unparent(child: Showable) {
    if (child.parent != this) {
      console.error({
        actualParent: child.parent,
        expectedParent: this,
        child,
      });
      throw new Error("wtf");
    }
    child.parent = undefined;
  }
  scheduleHasChanged() {
    this.#cached = undefined;
    this.parent?.scheduleHasChanged();
  }
  parent?: ShowableParent | undefined;
}

/**
 * A PaddingComponent does two major things:
 * * It requests extra time before and after its primary component is scheduled.
 * * It decides what to show before and after the primary component is scheduled.
 *
 * The primary component is the subcomponent with the lowest z order.
 * I.e. the first subcomponent.
 * I chose that because it was simple.
 * If necessary we can add an option to select a specific subcomponent to be the primary component regardless of the z order.
 *
 * Other subcomponents are "callouts".
 * The requested duration of a callout is ignored.
 * All callouts start at the same time as the primary component.
 * So it the primary component gets rescheduled, all of its children move with it.
 *
 * The PaddingComponent's parent might call show() at times before 0 or after the duration of the primary component and the callout.
 * The PaddingComponent can be configured to handle these cases in different ways, for the primary component.
 * However, the PaddingComponent will pass all show() requests on to the callouts without modifications.
 * It is up to the individual subcomponents to deal with out of bounds timeInMs values.
 *
 * Most components, like rectangles and arrows, will show themselves any time they are called regardless of timeInMs.
 * There are two easy ways to modify this.
 * * You can alter the item to be off screen or transparent at certain times.
 *   Schedules work just fine with times that are out of bounds.
 * * You can wrap the subcomponent in its own PaddingComponent.
 *   That can easily hide or hold the component outside of its normally scheduled time.
 *   And you can use the initialTime property to change the start time relative to the primary component.
 *   `initialTime` can be positive or negative.
 *
 * PaddingComponent is often used with {@link InParallelComponent}.
 * The latter is responsible for an entire scene.
 * The former makes each element of the scene appear and disappear at the right time.
 */
export class PaddingComponent extends InParallelComponent {
  readonly registryKey: string = "Padding";
  constructor(initialValues: {
    initialTime?: number;
    extraTime?: number;
    showBefore?: AtEnd;
    showAfter?: AtEnd;
    description?: string;
    registryKey?: string;
  }) {
    super(initialValues.description ?? "Padding");
    if (initialValues.initialTime !== undefined) {
      this.initialTimeScalar.value = initialValues.initialTime;
    }
    if (initialValues.extraTime !== undefined) {
      this.extraTimeScalar.value = initialValues.extraTime;
    }
    if (initialValues.showBefore !== undefined) {
      this.showBeforeScalar.value = initialValues.showBefore;
    }
    if (initialValues.showAfter !== undefined) {
      this.showAfterScalar.value = initialValues.showAfter;
    }
    if (initialValues.registryKey !== undefined) {
      // If you are subclassing PaddingComponent
      // or you are adding fixed subcomponents to an object,
      // then you need to create a new registry key.
      // Otherwise, keep the default.
      // TODO Does it ever make sense for someone to change the registry key to undefined?
      this.registryKey = initialValues.registryKey;
    }
  }
  readonly initialTimeScalar: Scalar<"number"> = {
    description: "Initial Time",
    type: "number",
    value: 0,
  };
  readonly extraTimeScalar: Scalar<"number"> = {
    description: "Extra Time",
    type: "number",
    value: 0,
  };
  /**
   * See {@link AtEnd} for the meanings of these choices.
   */
  readonly showBeforeScalar: Scalar<"select"> = {
    description: "Show Before",
    type: "select",
    choices: ["hide", "freeze", "live"],
    value: "hide",
  };
  /**
   * See {@link AtEnd} for the meanings of these choices.
   */
  readonly showAfterScalar: Scalar<"select"> = {
    description: "Show After",
    type: "select",
    choices: ["hide", "freeze", "live"],
    value: "freeze",
  };
  scalars = [
    this.initialTimeScalar,
    this.extraTimeScalar,
    this.showBeforeScalar,
    this.showAfterScalar,
  ] as const;
  protected override showChild(info: {
    child: Showable;
    replaceable: boolean;
    index: number;
    sourceIndex: number;
    options: ShowOptions;
  }) {
    const primary = info.index == 0;
    const initialTime = this.initialTimeScalar.value;
    let timeInMs = info.options.timeInMs - initialTime;
    if (timeInMs < 0) {
      const before = primary ? this.showBeforeScalar.value : "live";
      switch (before) {
        case "hide": {
          return;
        }
        case "freeze": {
          timeInMs = 0;
        }
        // case "live": leave it alone.  Let the child deal with the out of bounds time.
      }
    } else if (timeInMs > info.child.duration) {
      const after = primary ? this.showAfterScalar.value : "live";
      switch (after) {
        case "hide": {
          return;
        }
        case "freeze": {
          timeInMs = info.child.duration;
        }
        // case "live": leave it alone.  Let the child deal with the out of bounds time.
      }
    }
    info.child.show({ ...info.options, timeInMs });
  }
}

/**
 * This is a convenient base class for any component that wants to have children.
 * It takes care of the interfaces and implementation of having children.
 *
 * The duration is an input.
 * The constructor takes an initial value and it can be changed with setDuration();
 * See {@link ComponentWithFixedDuration} if you want the duration to be immutable.
 *
 * A subclass override show() and call super.show() whenever it is time to display the children.
 * Or override showChild() to make changes to the way we display specific children or to mix other operation in between showing various children.
 */
export class ComponentWithLiveDuration extends InParallelComponent {
  #requestedDuration: number;
  setDuration(newDuration: number) {
    // It is explicitly assumed that a component can clamp this value into range.
    newDuration = Math.max(0, newDuration);
    if (newDuration != this.#requestedDuration) {
      this.#requestedDuration = newDuration;
      this.scheduleHasChanged();
    }
  }
  protected recomputeDuration(children: readonly ParallelChildInfo[]) {
    return this.#requestedDuration;
  }
  constructor(description: string, duration: number) {
    super(description);
    this.#requestedDuration = duration;
  }
}

/**
 * This is a convenient base class for any component that wants to have children.
 * It takes care of the interfaces and implementation of having children.
 *
 * The duration is immutable.
 * The constructor takes an initial value and it can never change;
 * See {@link ComponentWithLiveDuration} if you want to change the duration in the Visual Editor.
 *
 * A subclass override show() and call super.show() whenever it is time to display the children.
 * Or override showChild() to make changes to the way we display specific children or to mix other operation in between showing various children.
 */
export class ComponentWithFixedDuration extends InParallelComponent {
 readonly #requestedDuration: number;
  protected recomputeDuration(children: readonly ParallelChildInfo[]) {
    return this.#requestedDuration;
  }
  constructor(description: string, duration: number) {
    super(description);
    this.#requestedDuration = duration;
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
export class SlideComponent extends InParallelComponent {
  readonly registryKey = "Slide";
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

  /**
   * This is a mutable version of Show.schedules.
   * Changes here are automatically reflected in this.schedules.
   */
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

  // TODO It would not be a bad idea to add registryKey as an optional input to the constructor.
  // As done and documented elsewhere, that goes with the fixed components idea.
  // The typescript code might want to add a few fixed components rather than creating a whole new class.
  // We got the fixed components for free when we inherited from InParallelComponent
  // And if someone uses that feature, then they should at a minimum disable registryKey.
  // Right?  Maybe there's a better way to exclude this from the serialization process.
  // Maybe overkill.  We have an example but it's never been used.

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
    super(initialValues.description ?? "Slide");
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
  // TODO do we really need show() and showChild()?
  // The base show was so simple, it was easier just to copy and modify it.
  override show(options: ShowOptions): void {
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
    this.children.forEach(({ child }) => {
      options.registerTransform?.(child, currentTransform);
      child.show(options);
    });
    context.setTransform(originalTransform);
  }
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
export class MultiTextComponent extends InParallelComponent {
  readonly registryKey = "Multi Text";
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
    this.replaceableComponents.push(span);
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
   * Only affects replaceable children (for simplicity).
   */
  clearText() {
    const toKeep = this.replaceableComponents
      .get()
      .filter((component) => !(component instanceof TextSpanComponent));
    this.replaceableComponents.replace(toKeep);
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
    super("Multi Text");
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
    this.children.forEach(({ child }) => {
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
  readonly registryKey = "Text";
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
  readonly registryKey = "Rectangle";
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
 * Standard registry component: a directed arrow with a rectangular shaft and
 * filled triangular head.  Uses a single filled {@link Path2D} so partially
 * transparent colors don't double-blend where the head overlaps the shaft.
 *
 * Both endpoints are {@link PointScheduleInfo} schedules, so the Visual Editor
 * renders them as draggable circles directly on the canvas.
 */
export class ArrowComponent implements Showable {
  readonly registryKey = "Arrow";
  readonly description = "Arrow";
  readonly duration = 0;

  readonly arrowSchedule = new ArrowScheduleInfo("Location", {
    flat: { x: 2, y: 4.5 },
    pointy: { x: 12, y: 4.5 },
  });
  readonly widthSchedule = new NumberScheduleInfo("Width", 0.5);
  readonly colorSchedule = new ColorScheduleInfo("Color", "#555");

  readonly schedules = [
    this.arrowSchedule,
    this.widthSchedule,
    this.colorSchedule,
  ] as const;

  constructor(
    initialValues: {
      arrow?: ArrowValue | readonly Keyframe<ArrowValue>[];
      width?: number | readonly Keyframe<number>[];
      color?: string | readonly Keyframe<string>[];
    } = {},
  ) {
    if (initialValues.arrow !== undefined)
      this.arrowSchedule.set(initialValues.arrow);
    if (initialValues.width !== undefined)
      this.widthSchedule.set(initialValues.width);
    if (initialValues.color !== undefined)
      this.colorSchedule.set(initialValues.color);
  }

  static show(options: {
    context: CanvasRenderingContext2D;
    flat: Point;
    tip: Point;
    width: number;
    color: string;
  }) {
    const { color, context, flat, tip, width } = options;

    const dx = tip.x - flat.x;
    const dy = tip.y - flat.y;
    const length = Math.hypot(dx, dy);
    // **Bad Math**
    if (length < 1e-9) return;

    // Unit vector along arrow, and 90°-CCW perpendicular.
    const ux = dx / length;
    const uy = dy / length;
    const px = -uy;
    const py = ux;

    const halfWidth = width / 2;

    // Arrowhead geometry (Google Slides style concave chevron).
    // Scale the head down proportionally when the arrow is shorter than the desired head length.
    const headScale = Math.min(1, length / (width * 6.5));
    // Notch: where the shaft ends and the arrowhead begins.  ±hw wide, 4.8w back from tip.
    const notchBack = width * 4.8 * headScale;
    // Wing tips: the outermost corners.  ±2.4w wide, 6.5w back from tip.
    const wingBack = width * 6.5 * headScale;
    const wingHW = width * 2.4 * headScale;

    // Positions along the arrow axis.
    const notchX = tip.x - ux * notchBack;
    const notchY = tip.y - uy * notchBack;
    const wingX = tip.x - ux * wingBack;
    const wingY = tip.y - uy * wingBack;

    const path = new Path2D();
    path.moveTo(flat.x + px * halfWidth, flat.y + py * halfWidth);
    path.lineTo(notchX + px * halfWidth, notchY + py * halfWidth);
    path.lineTo(wingX + px * wingHW, wingY + py * wingHW);
    path.lineTo(tip.x, tip.y);
    path.lineTo(wingX - px * wingHW, wingY - py * wingHW);
    path.lineTo(notchX - px * halfWidth, notchY - py * halfWidth);
    path.lineTo(flat.x - px * halfWidth, flat.y - py * halfWidth);
    path.closePath();

    context.fillStyle = color;
    context.fill(path);
  }

  show({ context, timeInMs }: ShowOptions) {
    const { flat, pointy } = this.arrowSchedule.at(timeInMs);
    const width = this.widthSchedule.at(timeInMs);
    const color = this.colorSchedule.at(timeInMs);
    ArrowComponent.show({ context, flat, tip: pointy, width, color });
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
  readonly registryKey = "Static Image";
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

export class FunctionGraphComponent implements Showable {
  /**
   * Register a named function here so it can be selected via the "Function Name"
   * schedule in the visual editor.  Call this from your video's TypeScript file
   * before the component is rendered.
   *
   * @example
   * FunctionGraphComponent.functions.set("sin", Math.sin);
   * FunctionGraphComponent.functions.set("x²", x => x * x);
   */
  static readonly functions = new Map<string, (x: number) => number>();

  readonly registryKey = "Function Graph";
  readonly description = "Function Graph";
  readonly duration = 0;

  readonly functionNameSchedule = new StringScheduleInfo(
    "Function Name",
    "sin",
  );
  readonly destRectSchedule = new RectangleScheduleInfo("Dest Rect", {
    x: 2,
    y: 2,
    width: 6,
    height: 4,
  });
  readonly xMinSchedule = new NumberScheduleInfo("X Min", -Math.PI * 2);
  readonly xMaxSchedule = new NumberScheduleInfo("X Max", Math.PI * 2);
  readonly yMinSchedule = new NumberScheduleInfo("Y Min", -1.5);
  readonly yMaxSchedule = new NumberScheduleInfo("Y Max", 1.5);
  readonly gridColorSchedule = new StringScheduleInfo(
    "Grid Color",
    "rgba(255,255,255,0.35)",
  );
  readonly gridLineWidthSchedule = new NumberScheduleInfo(
    "Grid Line Width",
    0.02,
  );
  readonly fontSchedule = new StringScheduleInfo("Font", "0.28px sans-serif");
  readonly curveColorSchedule = new ColorScheduleInfo(
    "Curve Color",
    "rgb(0,128,255)",
  );

  readonly schedules = [
    this.functionNameSchedule,
    this.destRectSchedule,
    this.xMinSchedule,
    this.xMaxSchedule,
    this.yMinSchedule,
    this.yMaxSchedule,
    this.gridColorSchedule,
    this.gridLineWidthSchedule,
    this.fontSchedule,
    this.curveColorSchedule,
  ] as const;

  show({ context, timeInMs }: ShowOptions): void {
    const functionName = this.functionNameSchedule.at(timeInMs);
    const f = FunctionGraphComponent.functions.get(functionName);
    if (!f) {
      showError(context, `Unknown function:\n"${functionName}"`);
      return;
    }

    const destRect = this.destRectSchedule.at(timeInMs);
    const xMin = this.xMinSchedule.at(timeInMs);
    const xMax = this.xMaxSchedule.at(timeInMs);
    const yMin = this.yMinSchedule.at(timeInMs);
    const yMax = this.yMaxSchedule.at(timeInMs);
    if (xMax <= xMin || yMax <= yMin) return;

    const gridColor = this.gridColorSchedule.at(timeInMs);
    const gridLineWidth = this.gridLineWidthSchedule.at(timeInMs);
    const font = this.fontSchedule.at(timeInMs);
    const curveColor = this.curveColorSchedule.at(timeInMs);

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

    const SAMPLE_COUNT = 300;
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
  }
}

/** Registry of component factories available in the "Add" dropdown. */
export const componentRegistry = new Map<string, () => Showable>([
  ["Slide", (): Showable => new SlideComponent()],
  ["Text", () => new TextComponent()],
  ["Traditional Text", () => new TraditionalTextComponent()],
  ["Rectangle", () => new RectangleComponent()],
  ["Arrow", () => new ArrowComponent()],
  ["Function Graph", () => new FunctionGraphComponent()],
  ["Static Image", () => new SingleImageComponent()],
  ["Multi Text", (): Showable => new MultiTextComponent()],
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
    // TODO setDuration
    // TO fixedComponents
    if (child.schedules?.length) applySnapshot(child.schedules, sc.schedules);
    if (child.replaceableComponents !== undefined && sc.components?.length) {
      child.replaceableComponents.push(...buildComponents(sc.components));
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
