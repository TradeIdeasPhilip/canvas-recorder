import { initializedArray, LinearFunction, makeLinear } from "phil-lib/misc";
import { makeLineFont } from "./glib/line-font";
import { LaidOut, ParagraphLayout } from "./glib/paragraph-layout";
import { PathShape } from "./glib/path-shape";
import {
  MakeShowableInParallel,
  MakeShowableInSeries,
  Showable,
  ShowOptions,
} from "./showable";
import { myRainbow, strokeColors } from "./utility";
import { PathShapeSplitter } from "./glib/path-shape-splitter";
import {
  FullFormatter,
  MultiColorPathElement,
  PathElement,
} from "./fancy-text";

const sceneList = new MakeShowableInSeries("Scene List");
const mainBuilder = new MakeShowableInParallel("Showcase");

const background: Showable = {
  description: "background",
  /**
   * The intent is to use this in a MakeShowableInParallel.
   * It will run as long as it needs to.
   */
  duration: 0,
  show({ context }) {
    const gradient = context.createLinearGradient(3.5, 0, 12.5, 9);
    gradient.addColorStop(1, "#444");
    gradient.addColorStop(0, "black");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 16, 9);
  },
};

const titleFont = makeLineFont(0.8);
const margin = 0.3;
const width = 16 - 2 * margin;

function rainbowHighlight() {
  return new MultiColorPathElement(undefined, {
    sectionLength: 0.3,
  }).animateOffset(1 / 1000);
}

// MARK: Title Screen
{
  /*
  class Draw {
    readonly #items = new Array<{
      readonly pathShape: PathShape;
      readonly start: number;
      readonly length: number;
      readonly color: string | null;
    }>();
    readonly #getDistance: LinearFunction;
    constructor(
      x: number,
      y: number,
      layout: LaidOut,
      readonly colors: (string | null)[],
      readonly lineWidth: number,
      startTime: number,
      endTime: number,
    ) {
      const pieces = layout.pathShapeByTag();
      let start = 0;
      colors.forEach((color, index) => {
        const pathShape = pieces.get(index)!.translate(x, y);
        const length = pathShape.getLength();
        this.#items.push({ pathShape, start, length, color });
        start += length;
      });
      this.#getDistance = makeLinear(startTime, 0, endTime, start);
      if (pieces.size != colors.length) {
        console.error(pieces);
        throw new Error("wtf");
      }
    }
    draw({ context, globalTime, timeInMs }: ShowOptions) {
      const distance = this.#getDistance(timeInMs);
      this.#items.forEach((item) => {
        const relativeDistance = distance - item.start;
        if (relativeDistance > 0) {
          context.lineWidth = this.lineWidth;
          // TODO PathShapeSplitter is cached and meant to be reused.
          const pathShape = new PathShapeSplitter(item.pathShape).get(
            0,
            relativeDistance,
          );
          if (item.color !== null) {
            context.strokeStyle = item.color;
            context.stroke(pathShape.canvasPath);
          } else {
            strokeColors({
              context,
              pathShape,
              sectionLength: 0.3,
              offset: globalTime / 1000,
            });
          }
        }
      });
    }
  }
  */
  const lines: {
    pathElements: PathElement[];
    startMs: number;
    endMs: number;
  }[] = [];
  {
    const formatter = new FullFormatter(titleFont);
    formatter.add("My ", rainbowHighlight);
    formatter.add("take on Peano Arithmetic");
    const aligned = formatter.align({
      top: margin,
      left: margin,
      alignment: "center",
      width,
    });
    aligned.pathElements.forEach((pathElement) => {
      pathElement.commonSettings.strokeStyle = myRainbow.cssBlue;
      pathElement.commonSettings.lineWidth = 0.12;
    });
    lines.push({
      pathElements: aligned.pathElements,
      startMs: 100,
      endMs: 5100,
    });
    /*
    pieces.push(
      new Draw(
        margin,
        margin,
        paragraphLayout.align(width, "center"),
        [null, myRainbow.cssBlue],
        0.12,
        100,
        5100,
      ),
    );
    */
  }
  {
    const formatter = new FullFormatter(titleFont);
    formatter.add("How would you ");
    formatter.add("invent ", rainbowHighlight);
    formatter.add("numbers?");
    const aligned = formatter.align({
      top: margin + 2,
      left: margin,
      alignment: "center",
      width,
    });
    aligned.pathElements.forEach((pathElement) => {
      pathElement.commonSettings.strokeStyle = myRainbow.yellow;
      pathElement.commonSettings.lineWidth = 0.08;
    });
    lines.push({
      pathElements: aligned.pathElements,
      startMs: 12000,
      endMs: 17000,
    });
    /*
    pieces.push(
      new Draw(
        margin,
        2 + margin,
        paragraphLayout.align(width, "center"),
        [myRainbow.yellow, null, myRainbow.yellow],
        0.08,
        12000,
        17000,
      ),
    );
    */
  }
  {
    const formatter = new FullFormatter(titleFont);
    formatter.add("Can you ");
    formatter.add("prove ", rainbowHighlight);
    formatter.add("that 2 + 2 = 4?");
    const aligned = formatter.align({
      top: margin + 4,
      left: margin,
      alignment: "center",
      width,
    });
    aligned.pathElements.forEach((pathElement) => {
      pathElement.commonSettings.strokeStyle = myRainbow.orange;
      pathElement.commonSettings.lineWidth = 0.08;
    });
    lines.push({
      pathElements: aligned.pathElements,
      startMs: 24000,
      endMs: 29000,
    });
    /*
    pieces.push(
      new Draw(
        margin,
        4 + margin,
        paragraphLayout.align(width, "center"),
        [myRainbow.orange, null, myRainbow.orange],
        0.08,
        24000,
        29000,
      ),
    );
    */
  }
  {
    const formatter = new FullFormatter(titleFont);
    formatter.add("Are numbers made of something ");
    formatter.add("simpler", rainbowHighlight);
    formatter.add("?");
    const aligned = formatter.align({
      top: margin + 6,
      left: margin,
      alignment: "center",
      width,
      additionalLineHeight: -margin,
    });
    aligned.pathElements.forEach((pathElement) => {
      pathElement.commonSettings.strokeStyle = myRainbow.red;
      pathElement.commonSettings.lineWidth = 0.08;
    });
    lines.push({
      pathElements: aligned.pathElements,
      startMs: 36000,
      endMs: 41000,
    });
    /*
    pieces.push(
      new Draw(
        margin,
        6 + margin,
        paragraphLayout.align(width, "center", -margin),
        [myRainbow.red, null, myRainbow.red],
        0.08,
        36000,
        41000,
      ),
    );
    */
  }
  const handwriters = lines.map((lineInfo) => {
    return PathElement.handwriting(
      lineInfo.pathElements,
      lineInfo.startMs,
      lineInfo.endMs,
    );
  });
  const showable: Showable = {
    description: "Title Screen",
    duration: 50000,
    show(options) {
      {
        options.context.lineCap = "round";
        options.context.lineJoin = "round";
        handwriters.forEach((draw) => {
          draw(options);
        });
      }
    },
  };
  sceneList.add(showable);
}

// MARK: ℕ by Induction
{
  const titlePathShape = ParagraphLayout.singlePathShape({
    font: titleFont,
    text: "ℕ - Natural Numbers",
    width,
    alignment: "center",
  }).translate(margin, margin);
  const numberPathShapes = (() => {
    const font = makeLineFont(0.5);
    const paragraphLayout = new ParagraphLayout(font);
    const value = 21;
    for (let i = value; i > 0; i--) {
      paragraphLayout.addText("PlusOne(", undefined, i);
    }
    paragraphLayout.addText("Zero", undefined, 0);
    for (let i = 1; i <= value; i++) {
      paragraphLayout.addText(")", undefined, i);
    }
    const laidOut = paragraphLayout.align(width, "center");
    const byTag = laidOut.pathShapeByTag();
    const result = initializedArray(value + 1, (n) =>
      byTag.get(n)!.translate(margin, 3),
    );
    return result;
  })();
  const showable: Showable = {
    description: "ℕ by Induction",
    duration: 20000,
    show({ context, globalTime, timeInMs }) {
      context.lineWidth = 0.08;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = myRainbow.magenta;
      context.stroke(titlePathShape.canvasPath);
      strokeColors({
        context,
        pathShape: numberPathShapes[0],
        colors: [
          "#b0b0b0",
          "#808080",
          "#404040",
          "#808080",
          "#b0b0b0",
          "#d0d0d0",
          "#ffffff",
          "#d0d0d0",
          "#b0b0b0",
        ],
        sectionLength: 0.125,
        offset: -globalTime / 1000,
      });
      for (
        let i = 1;
        i < Math.floor((numberPathShapes.length / this.duration) * timeInMs);
        i++
      ) {
        context.strokeStyle = myRainbow[i % myRainbow.length];
        context.stroke(numberPathShapes[i].canvasPath);
      }
      //const maxCount = du
    },
  };
  sceneList.add(showable);
}
console.log(titleFont.strokeWidth);

// MARK: Definition of = for ℕ
{
  //type DrawPiece =  (pathShape:PathShape);
  class Draw {
    readonly #items = new Array<{
      readonly pathShape: PathShape;
      readonly start: number;
      readonly length: number;
      readonly color: string | null;
    }>();
    readonly #getDistance: LinearFunction;
    constructor(
      x: number,
      y: number,
      layout: LaidOut,
      readonly colors: (string | null)[],
      readonly lineWidth: number,
      startTime: number,
      endTime: number,
    ) {
      const pieces = layout.pathShapeByTag();
      let start = 0;
      colors.forEach((color, index) => {
        const pathShape = pieces.get(index)!.translate(x, y);
        const length = pathShape.getLength();
        this.#items.push({ pathShape, start, length, color });
        start += length;
      });
      this.#getDistance = makeLinear(startTime, 0, endTime, start);
      if (pieces.size != colors.length) {
        console.error(pieces);
        throw new Error("wtf");
      }
    }
    draw({ context, globalTime, timeInMs }: ShowOptions) {
      const distance = this.#getDistance(timeInMs);
      this.#items.forEach((item) => {
        const relativeDistance = distance - item.start;
        if (relativeDistance > 0) {
          context.lineWidth = this.lineWidth;
          // TODO PathShapeSplitter is cached and meant to be reused.
          const pathShape = new PathShapeSplitter(item.pathShape).get(
            0,
            relativeDistance,
          );
          if (item.color !== null) {
            context.strokeStyle = item.color;
            context.stroke(pathShape.canvasPath);
          } else {
            strokeColors({
              context,
              pathShape,
              sectionLength: 0.3,
              offset: globalTime / 1000,
            });
          }
        }
      });
    }
  }
  const titlePathShape = ParagraphLayout.singlePathShape({
    font: titleFont,
    text:
      "Definition of = for ℕ\n\n" +
      "Zero = Zero\n" +
      "x = y → PlusOne(x) = PlusOne(y)\n" +
      "And nothing else.",
    width,
    alignment: "center",
  }).translate(margin, margin);
  const showable: Showable = {
    description: "Definition of = for ℕ",
    duration: 20000,
    show({ context, globalTime, timeInMs }) {
      context.lineWidth = 0.08;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = myRainbow.red;
      context.stroke(titlePathShape.canvasPath);
    },
  };
  sceneList.add(showable);
}

mainBuilder.add(background);
mainBuilder.add(sceneList.build());

export const peanoArithmetic = mainBuilder.build();
