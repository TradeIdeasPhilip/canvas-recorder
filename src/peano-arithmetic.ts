import {
  assertNonNullable,
  FULL_CIRCLE,
  initializedArray,
  LinearFunction,
  makeBoundedLinear,
  makeLinear,
  Random,
} from "phil-lib/misc";
import { makeLineFont } from "./glib/line-font";
import { LaidOut, ParagraphLayout } from "./glib/paragraph-layout";
import { PathShape } from "./glib/path-shape";
import {
  MakeShowableInParallel,
  MakeShowableInSeries,
  Showable,
  ShowOptions,
} from "./showable";
import { mapEachPair, myRainbow, strokeColors } from "./utility";
import { PathShapeSplitter } from "./glib/path-shape-splitter";
import {
  FullFormatter,
  MultiColorPathElement,
  PathElement,
} from "./fancy-text";
import { fixCorners, matchShapes } from "./morph-animation";
import {
  DiscreteKeyframe,
  discreteKeyframes,
  timedKeyframes,
} from "./interpolate";

const sceneList = new MakeShowableInSeries("Scene List");
const mainBuilder = new MakeShowableInParallel("Peano arithmetic");

/**
 * A little bit of noise or grain.
 *
 * This makes the gradient look a little better.
 */
const backgroundPattern = document.createElement("canvas");
{
  const random = Random.fromString("Pattern 2026");
  backgroundPattern.width = 512;
  backgroundPattern.height = 512;
  const imageData = new ImageData(512, 512);
  let index = 0;
  for (let pixel = 0; pixel < 512 * 512; pixel++) {
    const brightness = (random() + random()) * 3;
    imageData.data[index++] = brightness;
    imageData.data[index++] = brightness;
    imageData.data[index++] = brightness;
    imageData.data[index++] = 255;
  }
  backgroundPattern.getContext("2d")!.putImageData(imageData, 0, 0);
}

const background: Showable = {
  description: "background",
  /**
   * The intent is to use this in a MakeShowableInParallel.
   * It will run as long as it needs to.
   */
  duration: 0,
  show({ context }) {
    const gradient = context.createLinearGradient(3.5, 0, 12.5, 9);
    gradient.addColorStop(1, "#333");
    gradient.addColorStop(0, "black");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 16, 9);

    context.imageSmoothingEnabled = false;
    context.save();
    context.resetTransform();
    const scaleFactor = 2;
    context.scale(scaleFactor, scaleFactor);
    context.fillStyle = assertNonNullable(
      context.createPattern(backgroundPattern, "repeat"),
    );
    context.globalCompositeOperation = "lighter";
    context.fillRect(
      0,
      0,
      context.canvas.width / scaleFactor,
      context.canvas.height / scaleFactor,
    );
    context.restore();
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
      startMs: 1200,
      endMs: 3500,
    });
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
      startMs: 7000,
      endMs: 9000,
    });
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
      startMs: 11000,
      endMs: 13000,
    });
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
      startMs: 21000,
      endMs: 23000,
    });
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
    duration: 31000,
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

function zero(): PathElement {
  return new MultiColorPathElement(undefined, {
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
  }).animateOffset(-1 / 1000);
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
  /*
  const morphingNumbersXX = (() => {
    const font = makeLineFont(1.5);
    function make(text: string): PathShape {
      const layout = new ParagraphLayout(font);
      layout.addText(text);
      const result = layout
        .align(3, "center")
        .singlePathShape()
        .translate(13, 6.5);
      return result;
    }
    const base = make("?").reverse();
    return initializedArray(21, (n) => {
      let number = make(n.toString());
      if (n == 1 || n == 2 || n == 3 || n == 5 || n == 7) {
        number = number.reverse();
      }
      number = fixCorners(number);
      return matchShapes(base, number);
    });
  })();
  */
  const getTitleLength = makeBoundedLinear(
    50,
    0,
    2500,
    titlePathShape.getLength(),
  );
  function makeOscillator(
    startMs: number,
    endMs: number,
    approximateFrequency: number,
    startAndEndValue: number,
    extremeValue: number,
  ) {
    const requestedCycleCount = (endMs - startMs) / approximateFrequency;
    const cycleCount = Math.max(1, Math.round(requestedCycleCount));
    const timeToAngle = makeLinear(startMs, 0, endMs, cycleCount * FULL_CIRCLE);
    const trigToFinal = makeLinear(1, startAndEndValue, -1, extremeValue);
    function oscillator(timeInMs: number) {
      if (timeInMs < startMs || timeInMs > endMs) {
        return undefined;
      } else {
        return trigToFinal(Math.cos(timeToAngle(timeInMs)));
      }
    }
    return oscillator;
  }
  const titleOscillator1 = makeOscillator(35000, 44000, 1000, 1.3, 4);
  const titleOscillator2 = makeOscillator(75170, 81350, 1000, 1.3, 4);
  function title({ context, timeInMs }: ShowOptions): void {
    const length = getTitleLength(timeInMs);
    if (length <= 0) {
      return;
    }
    // TODO performance one time yada yada
    const pathShape = new PathShapeSplitter(titlePathShape).get(0, length);
    const path = pathShape.canvasPath;
    const glowFactor = titleOscillator1(timeInMs) ?? titleOscillator2(timeInMs);

    if (glowFactor !== undefined) {
      const baseWidth = context.lineWidth;
      context.lineWidth = baseWidth * glowFactor;
      context.strokeStyle = myRainbow.magenta;
      context.globalAlpha = 0.33;
      context.stroke(path);
      context.lineWidth = baseWidth * 1.3;
      context.strokeStyle = "black";
      context.globalAlpha = 1;
      context.stroke(path);
      context.lineWidth = baseWidth;
    }
    context.strokeStyle = myRainbow.magenta;
    context.stroke(path);
  }

  const duration = 162.218667 * 1000;

  const numberToShowKeyframes: DiscreteKeyframe<number>[] = [
    { time: 0, value: -1 },
    { time: 4413.8, value: 0 },
    { time: 5640, value: 1 },
    { time: 6447, value: 2 },
    { time: 7500, value: 3 },
    { time: 8800, value: 4 },
    { time: 9850, value: 5 },
    { time: 10900, value: 6 },
    { time: 11950, value: 7 },
    { time: 13000, value: 8 },
    { time: 14050, value: 9 },
    { time: 15000, value: -1 },
    { time: 17000, value: 0 },
    { time: 53000, value: 1 },
    { time: 101450, value: 2 },
    { time: 115500, value: 3 },
    { time: 118000, value: 4 },
    // up to 21 .  22 would have started at 2:42.17
    // = 162170.
  ];
  //console.log(numberToShowKeyframes)
  {
    const lastManualEntry = numberToShowKeyframes.at(-1)!;
    const endBeforeValue = 22;
    const valueToTime = makeLinear(
      lastManualEntry.value,
      lastManualEntry.time,
      endBeforeValue,
      duration,
    );
    for (
      let value = lastManualEntry.value + 1;
      value < endBeforeValue;
      value++
    ) {
      numberToShowKeyframes.push({ time: valueToTime(value), value });
    }
  }
  // 17710 Start the handwriting drawing of 0 from nothing.
  // 18420 "You know what zero means" show the complete "0"
  // 20750-22750 Morph it to a ?
  //
  //
  // 57260 Start morphing from "?" to "1".
  // 59000 Finishing morphing and hold "1"
  // 63650 Start morphing back to "?"
  // 65650 Finish morphing back to "?" and hold

  // 104180 Start morphing "?" to "2"
  // 106180 Finish morphing to "2" and hold
  // 108640 Start morphing "2" to "?" and hold
  // 110640 Finish morphing back to "?" and hold
  const drawMorphingNumber = (() => {
    const font = makeLineFont(1.5);
    function make(text: string): PathShape {
      const layout = new ParagraphLayout(font);
      layout.addText(text);
      const result = layout
        .align(3, "center")
        .singlePathShape()
        .translate(13, 6.5);
      return result;
    }
    const questionMark = make("?");
    const numberPathShapes = initializedArray(22, (n) => make(n.toString()));
    const morphingNumbersTimeline = [
      { time: 0, value: PathShape.EMPTY },
      { time: 17710, value: PathShape.EMPTY, reverseAfter: false },
      { time: 18750, value: numberPathShapes[0] },
      { time: 20750, value: numberPathShapes[0] },
      { time: 22750, value: questionMark },
      { time: 57260, value: questionMark },
      { time: 59000, value: numberPathShapes[1] },
      { time: 63650, value: numberPathShapes[1] },
      { time: 65650, value: questionMark },
      { time: 104180, value: questionMark },
      { time: 106180, value: numberPathShapes[2] },
      { time: 108640, value: numberPathShapes[2] },
      { time: 111585, value: questionMark },
      { time: 114420, value: questionMark, reverseAfter: true },
      { time: 116420, value: numberPathShapes[3] },
      { time: 117500, value: numberPathShapes[3] },
      { time: 118500, value: numberPathShapes[4] },
    ];
    let expecting4s = 2;
    numberToShowKeyframes.forEach((peanoKeyframe, peanoIndex) => {
      if (expecting4s > 0) {
        if (peanoKeyframe.value == 4) {
          expecting4s--;
        }
      } else {
        const previousValue = numberToShowKeyframes[peanoIndex - 1].value;
        morphingNumbersTimeline.push({
          time: peanoKeyframe.time - 250,
          value: assertNonNullable(numberPathShapes[previousValue]),
        });
        const nextValue = peanoKeyframe.value;
        morphingNumbersTimeline.push({
          time: peanoKeyframe.time + 250,
          value: assertNonNullable(numberPathShapes[nextValue]),
        });
      }
    });
    const animators = mapEachPair(
      morphingNumbersTimeline,
      (a, b): ((progress: number) => PathShape) => {
        if (a.value == b.value) {
          return () => a.value;
        } else if (a.value.isEmpty) {
          const splitter = new PathShapeSplitter(b.value);
          return (progress: number) => {
            if (progress <= 0) {
              return PathShape.EMPTY;
            } else {
              return splitter.get(0, progress * splitter.length);
            }
          };
        } else {
          const aValue = a.reverseAfter ? a.value.reverse() : a.value;
          const doMorph = matchShapes(fixCorners(aValue), fixCorners(b.value));
          return doMorph;
        }
      },
    );
    function show(showOptions: ShowOptions) {
      const script = timedKeyframes(
        showOptions.timeInMs,
        morphingNumbersTimeline,
      );
      const pathShape = script.single
        ? script.value
        : animators[script.index](script.progress);
      showOptions.context.strokeStyle = "white";
      showOptions.context.stroke(pathShape.canvasPath);
    }
    return show;
  })();
  const zeroElement = zero();
  zeroElement.pathShape = numberPathShapes[0];
  const showable: Showable = {
    description: "ℕ by Induction",
    duration,
    show(options) {
      const context = options.context;
      context.lineWidth = 0.08;
      context.lineCap = "round";
      context.lineJoin = "round";
      //context.strokeStyle = myRainbow.magenta;
      //context.stroke(titlePathShape.canvasPath);
      title(options);
      const numberToShow = discreteKeyframes(
        options.timeInMs,
        numberToShowKeyframes,
      );
      if (numberToShow >= 0) {
        zeroElement.show(options);
      }
      for (let i = 1; i <= numberToShow; i++) {
        context.strokeStyle = myRainbow[i % myRainbow.length];
        context.stroke(numberPathShapes[i].canvasPath);
      }
      /*
      {
        const each = this.duration / morphingNumbers.length;
        const relative = options.timeInMs / each;
        const index = Math.floor(relative);
        const progress = easeAndBack(relative - index);
        context.strokeStyle = "white";
        context.stroke(morphingNumbers[index]?.(progress).canvasPath);
      }
      */
      drawMorphingNumber(options);
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
