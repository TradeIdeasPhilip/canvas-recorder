import { makeLinear } from "phil-lib/misc";
import { Font } from "./glib/letters-base";
import { ParagraphLayout, WordInPlace } from "./glib/paragraph-layout";
import { Command, PathShape } from "./glib/path-shape";
import { ShowOptions } from "./showable";
import { strokeColors, StrokeColorsOptions } from "./utility";
import { PathShapeSplitter } from "./glib/path-shape-splitter";

type CommonSettings = Partial<
  Pick<
    CanvasRenderingContext2D,
    "fillStyle" | "strokeStyle" | "lineCap" | "lineJoin" | "lineWidth"
  >
>;
/**
 * A PathShape and some common settings for that PathShape.
 * Fully mutable.
 *
 */
export class PathElement {
  /**
   *
   * @param pathShape The shape you want to `stroke()` or `fill()`.
   * Explicitly **not** readonly.
   * @param commonSettings These are the settings that are used a lot.
   * By convention you don't have to save the value of any of these.
   *
   * `undefined` means that this object has no opinion on that property.
   * We will rely on the caller to make sure there is some meaningful value in there.
   *
   * Explicitly **not** readonly.
   */
  constructor(
    public commonSettings: CommonSettings = {},
    public pathShape: PathShape = PathShape.EMPTY,
    public tag?: unknown,
  ) {}
  setTag(newTag: unknown) {
    this.tag = newTag;
    return this;
  }
  setLineWidth(lineWidth: number | undefined) {
    this.commonSettings.lineWidth = lineWidth;
    return this;
  }
  /**
   * Copy settings from `requested` into `context`.
   * @param requested New settings to use.
   * @param context Where to put the settings.
   */
  static applySettings(
    requested: CommonSettings,
    context: CanvasRenderingContext2D,
  ) {
    if (requested.fillStyle !== undefined) {
      context.fillStyle = requested.fillStyle;
    }
    if (requested.strokeStyle !== undefined) {
      context.strokeStyle = requested.strokeStyle;
    }
    if (requested.lineCap !== undefined) {
      context.lineCap = requested.lineCap;
    }
    if (requested.lineJoin !== undefined) {
      context.lineJoin = requested.lineJoin;
    }
    if (requested.lineWidth !== undefined) {
      context.lineWidth = requested.lineWidth;
    }
  }
  /**
   * Copy settings from `this.requested` into `context`.
   * @param context Where to put the settings.
   */
  applySettings(context: CanvasRenderingContext2D) {
    PathElement.applySettings(this.commonSettings, context);
  }
  stroke(context: CanvasRenderingContext2D) {
    this.applySettings(context);
    this.pathShape.setCanvasPath(context);
    context.stroke();
  }
  fill(context: CanvasRenderingContext2D) {
    this.applySettings(context);
    this.pathShape.setCanvasPath(context);
    context.fill();
  }
  show(showOptions: ShowOptions) {
    this.stroke(showOptions.context);
  }
  static combine(pathElements: readonly (PathElement | PathShape)[]) {
    return new PathShape(
      pathElements.flatMap((element) => {
        const pathShape =
          element instanceof PathShape ? element : element.pathShape;
        return pathShape.commands;
      }),
    );
  }
  static handwriting(
    pathElements: PathElement[],
    startMs: number,
    endMs: number,
  ) {
    let start = 0;
    const items = pathElements.map((pathElement) => {
      const fullShape = pathElement.pathShape;
      const splitter = new PathShapeSplitter(fullShape);
      const length = splitter.length;
      const item = { fullShape, splitter, length, pathElement, start };
      start += length;
      return item;
    });
    const getDistance = makeLinear(startMs, 0, endMs, start);
    function drawHandwriting(showOptions: ShowOptions) {
      const distance = getDistance(showOptions.timeInMs);
      items.forEach((item) => {
        const relativeDistance = distance - item.start;
        if (relativeDistance > 0) {
          item.pathElement.pathShape = item.splitter.get(0, relativeDistance);
          item.pathElement.show(showOptions);
        }
      });
    }
    return drawHandwriting;
  }
}

type MultiColorConfig = Omit<StrokeColorsOptions, "pathShape" | "context">;

export class MultiColorPathElement extends PathElement {
  constructor(
    commonSettings: CommonSettings = {},
    public multiColorConfig: MultiColorConfig = {},
    pathShape: PathShape = PathShape.EMPTY,
  ) {
    super(commonSettings, pathShape);
  }
  animator(showOptions: ShowOptions) {}
  show(showOptions: ShowOptions): void {
    this.animator(showOptions);
    this.applySettings(showOptions.context);
    strokeColors({
      ...this.multiColorConfig,
      context: showOptions.context,
      pathShape: this.pathShape,
    });
  }
  /**
   * In userspace units / millisecond.
   *
   * Multiply this by `globalTime` to get the current `offset`.
   * @param offsetRatio
   */
  animateOffset(offsetRatio: number) {
    this.animator = (showOptions: ShowOptions) => {
      this.multiColorConfig.offset = showOptions.globalTime * offsetRatio;
    };
    return this;
  }
  /**
   * In cycles / millisecond.
   *
   * Multiply this by `globalTime` to get the current `relativeOffset`.
   * @param offsetRatio
   */
  animateRelativeOffset(offsetRatio: number) {
    this.animator = (showOptions: ShowOptions) => {
      this.multiColorConfig.relativeOffset =
        showOptions.globalTime * offsetRatio;
    };
    return this;
  }
}

export class FullFormatter {
  #paragraphLayout: ParagraphLayout;
  #inProgress: {
    pathElement: PathElement;
    commands: Command[];
    words: Set<WordInPlace>;
  }[] = [];
  get font(): Font {
    return this.#paragraphLayout.font;
  }
  constructor(font: Font) {
    this.#paragraphLayout = new ParagraphLayout(font);
  }
  #recentlyAdded = new Array<PathElement>();
  get recentlyAdded() {
    const result = this.#recentlyAdded;
    this.#recentlyAdded = [];
    return result;
  }
  add(
    text: string,
    pathElement: PathElement | (() => PathElement) = new PathElement(),
    font?: Font,
  ) {
    if (!(pathElement instanceof PathElement)) {
      pathElement = pathElement();
    }
    this.#paragraphLayout.addText(text, font, this.#inProgress.length);
    this.#inProgress.push({ pathElement, commands: [], words: new Set() });
    this.#recentlyAdded.push(pathElement);
    return this;
  }
  align(
    options: {
      width?: number;
      alignment?: "left" | "center" | "right" | "justify";
      additionalLineHeight?: number;
      top?: number;
      bottom?: number;
      left?: number;
    } = {},
  ) {
    if (options.top !== undefined && options.bottom !== undefined) {
      throw new Error("At most one of top and bottom may be specified.");
    }
    const laidOut = this.#paragraphLayout.align(
      options.width,
      options.alignment,
      options.additionalLineHeight,
    );
    if (options.top === undefined && options.bottom !== undefined) {
      options.top = options.bottom - laidOut.height;
    }
    laidOut
      .getAllLetters(options.left ?? 0, options.top ?? 0)
      .forEach((letterInfo) => {
        const info = this.#inProgress[letterInfo.word.wordInfo.tag as number];
        info.commands.push(...letterInfo.translatedShape.commands);
        info.words.add(letterInfo.word);
      });
    const pathElements = new Array<PathElement>();
    const words = new Array<Set<WordInPlace>>();
    this.#inProgress.map((inProgress) => {
      const pathShape = new PathShape(inProgress.commands);
      const pathElement = inProgress.pathElement;
      pathElement.pathShape = pathShape;
      pathElements.push(pathElement);
      words.push(inProgress.words);
    });
    return {
      pathElements,
      words,
      laidOut,
      height: laidOut.height,
      width: laidOut.width,
    };
  }
}

export type FancyLayout = ReturnType<
  InstanceType<typeof FullFormatter>["align"]
>;
