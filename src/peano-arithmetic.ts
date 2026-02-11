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
  easeOut,
  interpolateNumbers,
  Keyframes,
  timedKeyframes,
  Keyframe,
  interpolateColor,
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
    const brightness = (random() + random()) * 5;
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
    /*
    const gradient = context.createLinearGradient(3.5, 0, 12.5, 9);
    gradient.addColorStop(1, "#333");
    gradient.addColorStop(0, "black");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 16, 9);
    context.imageSmoothingEnabled = false;
    context.save();
    context.resetTransform();
    const scaleFactor = 4;
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
    */
    context.fillStyle = "black";
    context.fillRect(0, 0, 16, 9);
    for (let i = 0; i < 3; i++) {
      context.beginPath();
      context.moveTo(16, i * 3);
      context.lineTo(16, 9 + i * 3);
      context.lineTo(0, 9 + i * 3);
      context.closePath();
      const weight = 0.011 * (i + 1);
      //color(srgb-linear 0.033 0.033 0.033)
      context.fillStyle = `color(srgb-linear ${weight} ${weight} ${weight})`;
      context.fill();
    }
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
  //sceneList.add(showable);
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
  //sceneList.add(showable);
}
console.log(titleFont.strokeWidth);

function equals(): PathElement {
  return new MultiColorPathElement(undefined, {
    colors: ["red", "yellow", "orange"],
    sectionLength: 0.2,
  }).animateOffset(-1 / 1500);
}

// MARK: Definition of = for ℕ
{
  function normal(): PathElement {
    return new PathElement({ strokeStyle: "red" });
  }
  const formatter = new FullFormatter(titleFont);
  formatter.add("Definition of ", normal);
  formatter.add("= ", equals);
  formatter.add("for ℕ\n\n", normal);
  const title = formatter.recentlyAdded;
  formatter.add("Zero ", zero);
  formatter.add("= ", equals().setTag("match ="));
  formatter.add("Zero\n", zero);
  const baseCase = formatter.recentlyAdded;
  formatter.add("x ", new PathElement({ strokeStyle: myRainbow.cyan }));
  formatter.add("= ", equals);
  formatter.add("y ", new PathElement({ strokeStyle: myRainbow.magenta }));
  formatter.add("→ PlusOne(", normal);
  formatter.add("x", new PathElement({ strokeStyle: myRainbow.cyan }));
  formatter.add(") ", normal);
  formatter.add("= ", equals().setTag("match ="));
  formatter.add("PlusOne(", normal);
  formatter.add("y", new PathElement({ strokeStyle: myRainbow.magenta }));
  formatter.add(")\n", normal);
  const inductiveStep = formatter.recentlyAdded;
  formatter.add("And nothing else.", normal);
  const andNothingElse = formatter.recentlyAdded;

  const formatted = formatter.align({
    width,
    top: margin,
    left: margin,
    alignment: "center",
  });

  const slideBaseCaseBy = (() => {
    const toMove = assertNonNullable(
      baseCase.find((element) => element.tag === "match ="),
    );
    const fromX = assertNonNullable(toMove.pathShape.startX);
    const toMatch = assertNonNullable(
      inductiveStep.find((element) => element.tag === "match ="),
    );
    const toX = assertNonNullable(toMatch.pathShape.startX);
    return toX - fromX;
  })();
  const baseAdjustmentSchedule: Keyframes<number> = [
    { time: 40000, value: 0, easeAfter: easeOut },
    { time: 42000, value: slideBaseCaseBy },
  ];
  const mainSlideSchedule: Keyframes<number> = [
    { time: 49000, value: 0, easeAfter: easeOut },
    { time: 54000, value: -1.9 },
  ];
  const mainZoomSchedule: Keyframes<number> = [
    { time: 49000, value: 1, easeAfter: easeOut },
    { time: 54000, value: 2 / 3 },
  ];

  const titleHandwriting = PathElement.handwriting(title, 2000, 7000);
  const baseCaseHandwriting = PathElement.handwriting(baseCase, 14660, 18000);
  const inductiveStepHandwriting = PathElement.handwriting(
    inductiveStep,
    26480,
    31160,
  );
  const andNothingElseHandwriting = PathElement.handwriting(
    andNothingElse,
    33500,
    36000,
  );

  const centerOfRules = (() => {
    const bBox = PathElement.combine(inductiveStep).getBBox();
    const result: { readonly x: number; readonly y: number } = {
      x: bBox.x.mid,
      y: bBox.y.mid,
    };
    return result;
  })();

  const allEqualValues = (() => {
    const formatter = new FullFormatter(makeLineFont(0.5));
    formatter.add("Zero ", zero);
    formatter.add("= ", equals);
    formatter.add("Zero\n", zero);
    const row0 = formatter.recentlyAdded;
    formatter.add("PlusOne(", normal);
    formatter.add("Zero", zero);
    formatter.add(") ", normal);
    formatter.add("= ", equals);
    formatter.add("PlusOne(", normal);
    formatter.add("Zero", zero);
    formatter.add(")\n", normal);
    const row1 = formatter.recentlyAdded;
    formatter.add("PlusOne(PlusOne(", normal);
    formatter.add("Zero", zero);
    formatter.add(")) ", normal);
    formatter.add("= ", equals);
    formatter.add("PlusOne(PlusOne(", normal);
    formatter.add("Zero", zero);
    formatter.add("))\n", normal);
    const row2 = formatter.recentlyAdded;
    const smallerFont = makeLineFont(0.36);
    formatter.add("PlusOne(PlusOne(PlusOne(", normal, smallerFont);
    formatter.add("Zero", zero, smallerFont);
    formatter.add("))) ", normal, smallerFont);
    formatter.add("= ", equals, smallerFont);
    formatter.add("PlusOne(PlusOne(PlusOne(", normal, smallerFont);
    formatter.add("Zero", zero, smallerFont);
    formatter.add(")))\n", normal, smallerFont);
    const row3 = formatter.recentlyAdded;
    formatter.align({
      width,
      alignment: "center",
      top: 5,
      left: margin,
      additionalLineHeight: 0.1,
    });
    const allHandwriting = [
      PathElement.handwriting(row0, 58100, 59540),
      PathElement.handwriting(row1, 59840, 61500),
      PathElement.handwriting(row2, 61910, 63660),
      PathElement.handwriting(row3, 64150, 65500),
    ];
    function allEqualValues(showOptions: ShowOptions) {
      if (showOptions.timeInMs < 72150) {
        allHandwriting.forEach((row) => {
          row(showOptions);
        });
      }
    }
    return allEqualValues;
  })();

  class HighlightPieces {
    constructor(
      before: PathShape,
      middle: readonly PathShape[],
      after: PathShape,
      readonly middleColor: string,
      readonly startTime: number,
      readonly fullTime: number,
      readonly endTime: number,
    ) {
      const beforeBBox = before.getBBox();
      const middleBBox = PathElement.combine(middle).getBBox();
      const afterBBox = after.getBBox();
      this.#top = Math.min(beforeBBox.y.min, middleBBox.y.min, afterBBox.y.min);
      this.#height =
        Math.max(beforeBBox.y.max, middleBBox.y.max, afterBBox.y.max) -
        this.#top;
      this.#x0 = beforeBBox.x.min;
      this.#x1 = (beforeBBox.x.max + middleBBox.x.min) / 2;
      this.#x2 = (middleBBox.x.max + afterBBox.x.min) / 2;
      this.#x3 = afterBBox.x.max;
      this.#xSchedule = makeBoundedLinear(
        startTime,
        this.#x0,
        fullTime,
        this.#x3,
      );
    }
    #top: number;
    #height: number;
    #x0: number;
    #x1: number;
    #x2: number;
    #x3: number;
    #xSchedule: LinearFunction;
    show({ context, timeInMs }: ShowOptions) {
      if (timeInMs < this.endTime) {
        const x = this.#xSchedule(timeInMs);
        if (x > this.#x0) {
          context.fillStyle = myRainbow.cssBlue;
          context.fillRect(this.#x0, this.#top, x - this.#x0, this.#height);
          if (x > this.#x1) {
            context.fillStyle = this.middleColor;
            context.fillRect(
              this.#x1,
              this.#top,
              Math.min(x, this.#x2) - this.#x1,
              this.#height,
            );
          }
        }
      }
    }
    static make(
      elements: readonly PathElement[],
      side: "left" | "right",
      startTime: number,
      fullTime: number,
      endTime: number,
    ) {
      const color = interpolateColor(
        0.25,
        side == "left" ? myRainbow.cyan : myRainbow.magenta,
        "black",
      );
      const firstIndex = elements.findIndex((pathElement) => {
        return pathElement.tag == `${side}-plus-one`;
      });
      if (firstIndex < 0) {
        throw new Error("wtf");
      }
      const lastIndex = elements.findIndex((pathElement) => {
        return pathElement.tag == `${side}-plus-one-end`;
      });
      if (lastIndex <= firstIndex + 1) {
        throw new Error("wtf");
      }
      const before = elements[firstIndex].pathShape;
      const middle = elements
        .slice(firstIndex + 1, lastIndex)
        .map((element) => element.pathShape);
      const after = elements[lastIndex].pathShape;
      return new this(
        before,
        middle,
        after,
        color,
        startTime,
        fullTime,
        endTime,
      );
    }
  }

  const doesTwoEqualThree = (() => {
    const formatter = new FullFormatter(makeLineFont(0.5));
    formatter.add("Does ", equals);
    formatter.add("Zero ", zero);
    formatter.add("= ", equals);
    formatter.add("PlusOne(", normal().setTag("right-plus-one"));
    formatter.add("Zero", zero);
    formatter.add(")", normal().setTag("right-plus-one-end"));
    formatter.add("?\n", equals);
    const row1 = formatter.recentlyAdded;
    formatter.add("Does ", equals);
    formatter.add("PlusOne(", normal().setTag("left-plus-one"));
    formatter.add("Zero", zero);
    formatter.add(") ", normal().setTag("left-plus-one-end"));
    formatter.add("= ", equals);
    formatter.add("PlusOne(", normal().setTag("right-plus-one"));
    formatter.add("PlusOne(", normal);
    formatter.add("Zero", zero);
    formatter.add(")", normal);
    formatter.add(")", normal().setTag("right-plus-one-end"));
    formatter.add("?\n", equals);
    const row2 = formatter.recentlyAdded;
    const smallerFont = makeLineFont(0.38);
    formatter.add("Does ", equals, smallerFont);
    formatter.add("PlusOne(", normal().setTag("left-plus-one"), smallerFont);
    formatter.add("PlusOne(", normal, smallerFont);
    formatter.add("Zero", zero, smallerFont);
    formatter.add(")", normal, smallerFont);
    formatter.add(") ", normal().setTag("left-plus-one-end"), smallerFont);
    formatter.add("= ", equals, smallerFont);
    formatter.add("PlusOne(", normal().setTag("right-plus-one"), smallerFont);
    formatter.add("PlusOne(PlusOne(", normal, smallerFont);
    formatter.add("Zero", zero, smallerFont);
    formatter.add("))", normal, smallerFont);
    formatter.add(")", normal().setTag("right-plus-one-end"), smallerFont);
    formatter.add("?\n", equals, smallerFont);
    const row3 = formatter.recentlyAdded;
    formatter.align({
      width,
      alignment: "center",
      top: 5.4,
      left: margin,
      additionalLineHeight: 0.1,
    });
    const allHandwriting = [
      PathElement.handwriting(row3, 74800, 76800),
      PathElement.handwriting(row2, 97800, 99000),
      PathElement.handwriting(row1, 117100, 118790),
    ];
    const allHighlighters = [
      HighlightPieces.make(row3, "left", 79300, 81650, 141480),
      HighlightPieces.make(row3, "right", 81650, 84000, 141480),
      HighlightPieces.make(row2, "left", 99000, 100095, 141480),
      HighlightPieces.make(row2, "right", 100095, 101190, 141480),
      HighlightPieces.make(row1, "right", 123000, 125000, 141480),
    ];

    function doesTwoEqualThree(showOptions: ShowOptions) {
      allHighlighters.forEach((highlighter) => {
        highlighter.show(showOptions);
      });
      if (showOptions.timeInMs < 141480) {
        allHandwriting.forEach((row) => {
          row(showOptions);
        });
      }
    }
    return doesTwoEqualThree;
  })();

  const showable: Showable = {
    description: "Definition of = for ℕ",
    // 3:13:35
    duration: (3 * 60 + 13) * 1000 + 35 * 10,
    show(showOptions) {
      const context = showOptions.context;
      const timeInMs = showOptions.timeInMs;
      context.lineWidth = 0.08;
      context.lineCap = "round";
      context.lineJoin = "round";
      titleHandwriting(showOptions);
      {
        const initialMatrix = context.getTransform();
        const slideBy = interpolateNumbers(timeInMs, mainSlideSchedule);
        const scaleBy = interpolateNumbers(timeInMs, mainZoomSchedule);
        context.translate(centerOfRules.x, centerOfRules.y + slideBy);
        context.scale(scaleBy, scaleBy);
        context.translate(-centerOfRules.x, -centerOfRules.y);
        inductiveStepHandwriting(showOptions);
        andNothingElseHandwriting(showOptions);
        context.translate(
          interpolateNumbers(timeInMs, baseAdjustmentSchedule),
          0,
        );
        baseCaseHandwriting(showOptions);
        context.setTransform(initialMatrix);
      }
      context.lineWidth /= 2;
      allEqualValues(showOptions);
      doesTwoEqualThree(showOptions);
    },
  };
  sceneList.add(showable);
}

mainBuilder.add(background);
mainBuilder.add(sceneList.build());

export const peanoArithmetic = mainBuilder.build();
