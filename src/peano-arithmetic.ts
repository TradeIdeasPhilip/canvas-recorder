import { LinearFunction, makeBoundedLinear, makeLinear } from "phil-lib/misc";
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

{
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
  const pieces = new Array<Draw>();
  const margin = 0.3;
  const width = 16 - 2 * margin;
  {
    const paragraphLayout = new ParagraphLayout(titleFont);
    paragraphLayout.addText("My ", undefined, 0);
    paragraphLayout.addText("take on Peano Arithmetic", undefined, 1);
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
  }
  {
    const paragraphLayout = new ParagraphLayout(titleFont);
    paragraphLayout.addText("How would you ", undefined, 0);
    paragraphLayout.addText("invent ", undefined, 1);
    paragraphLayout.addText("numbers?", undefined, 2);
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
  }
  {
    const paragraphLayout = new ParagraphLayout(titleFont);
    paragraphLayout.addText("Can you ", undefined, 0);
    paragraphLayout.addText("prove ", undefined, 1);
    paragraphLayout.addText("that 2 + 2 = 4?", undefined, 2);
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
  }
  {
    const paragraphLayout = new ParagraphLayout(titleFont);
    paragraphLayout.addText("Are numbers made of something ", undefined, 0);
    paragraphLayout.addText("simpler", undefined, 1);
    paragraphLayout.addText("?", undefined, 2);
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
  }
  /*
  const titlePathShape = ParagraphLayout.singlePathShape({
    text: "My take on Peano Arithmetic",
    font: titleFont,
    alignment: "center",
    width,
  }).translate(margin, margin);
  const q1PathShape = ParagraphLayout.singlePathShape({
    text: "How would you invent numbers?",
    font: titleFont,
    alignment: "center",
    width,
  }).translate(margin, 2 + margin);
  const q2PathShape = ParagraphLayout.singlePathShape({
    text: "Can you prove that 2 + 2 = 4?",
    font: titleFont,
    alignment: "center",
    width,
  }).translate(margin, 4 + margin);
  const q3PathShape = ParagraphLayout.singlePathShape({
    text: "Are numbers made of something simpler?",
    font: titleFont,
    alignment: "center",
    width,
    additionalLineHeight: -margin,
  }).translate(margin, 6 + margin);
  */
  const showable: Showable = {
    description: "Title Screen",
    duration: 50000,
    show(options) {
      {
        options.context.lineCap = "round";
        options.context.lineJoin = "round";
        pieces.forEach((draw) => {
          draw.draw(options);
        });
        /*
        context.lineWidth = 0.09;
        context.strokeStyle = myRainbow.cssBlue;
        context.stroke(titlePathShape.canvasPath);

        context.lineWidth = 0.06;
        context.strokeStyle = myRainbow.yellow;
        context.stroke(q1PathShape.canvasPath);

        context.lineWidth = 0.06;
        context.strokeStyle = myRainbow.orange;
        context.stroke(q2PathShape.canvasPath);

        context.lineWidth = 0.06;
        context.strokeStyle = myRainbow.red;
        context.stroke(q3PathShape.canvasPath);
        */
      }
    },
  };
  sceneList.add(showable);
}

mainBuilder.add(background);
mainBuilder.add(sceneList.build());

export const peanoArithmetic = mainBuilder.build();
