import {
  angleBetween,
  assertNonNullable,
  count,
  FULL_CIRCLE,
  makeBoundedLinear,
  makeLinear,
  positiveModulo,
  ReadOnlyRect,
  zip,
} from "phil-lib/misc";
import { ParagraphLayout } from "./glib/paragraph-layout";
import {
  addMargins,
  makeRepeater,
  MakeShowableInParallel,
  MakeShowableInSeries,
  Showable,
} from "./showable";
import {
  Command,
  LCommand,
  PathBuilder,
  PathShape,
  QCommand,
} from "./glib/path-shape";
import { Font } from "./glib/letters-base";
import {
  ALMOST_STRAIGHT,
  fixCorners,
  makeQCommand,
  matchShapes,
} from "./morph-animation";
import { blackBackground, BLUE } from "./utility";
import {
  ease,
  easeAndBack,
  interpolateColor,
  interpolateNumbers,
  Keyframes,
} from "./interpolate";
import { makeLineFont } from "./glib/line-font";
import { panAndZoom, transform } from "./glib/transforms";
import { createHandwriting } from "./glib/handwriting";
import { PathShapeSplitter } from "./glib/path-shape-splitter";

const cursive = Font.cursive(1.25);

function makeLayout(
  text: string,
  alignment: "left" | "center" | "right" = "center",
  font = cursive
) {
  const layout = new ParagraphLayout(font);
  layout.addText(text);
  const layoutResult = layout.align(Infinity, "center", 0.25);
  let shape = layoutResult.singlePathShape();
  if (alignment == "center") {
    shape = shape.translate(-layoutResult.width / 2, 0);
  } else if (alignment == "right") {
    shape = shape.translate(-layoutResult.width, 0);
  }
  return shape;
  //return fixCorners(shape);
}

//const before = makeLayout("5555");
//const after = makeLayout("777777777777777");
const before = makeLayout("Getting\nColorful");
const after = makeLayout("⭒~✧\n☆", "center", makeLineFont(1.25));

function dumpBigCorners(shape: PathShape) {
  console.log(
    shape.commands.flatMap((command, index, array) => {
      const nextCommand = array[index + 1];
      if (nextCommand === undefined) {
        return [];
      } else {
        const difference = angleBetween(
          command.outgoingAngle,
          nextCommand.incomingAngle
        );
        if (Math.abs(difference) < ALMOST_STRAIGHT) {
          return [];
        } else {
          return [difference];
        }
      }
    })
  );
}
//dumpBigCorners(before);
//dumpBigCorners(after);
//console.log(after);

const builder = new MakeShowableInParallel();

builder.addJustified(blackBackground);

const colors = [
  "rgb(255, 0, 0)",
  "rgb(255, 128, 0)",
  "rgb(255, 255, 0)",
  "rgb(0, 255, 0)",
  "rgb(0, 255, 255)",
  "rgb(0, 128, 255)",
  "rgb(0, 0, 255)",
  "rgb(128, 0, 255)",
  "rgb(255, 0, 255)",
];

function getColor(index: number) {
  return colors[index % colors.length];
}

function byLine(from: string, to: string) {
  function makeLayout(text: string) {
    const layout = new ParagraphLayout(cursive);
    layout.addText(text);
    const layoutResult = layout.align(Infinity, "center", 0.25);
    const Δx = -layoutResult.width / 2;
    const Δy = 0;
    const allCommands = new Map<number, Command[]>();
    for (const current of layoutResult.getAllLetters(Δx, Δy)) {
      let lineCommands = allCommands.get(current.baseline);
      if (lineCommands === undefined) {
        lineCommands = [];
        allCommands.set(current.baseline, lineCommands);
      }
      lineCommands.push(...current.translatedShape.commands);
    }
    const result = allCommands
      .values()
      .map((commands) => {
        return fixCorners(new PathShape(commands));
      })
      .toArray();
    return result;
  }
  const colors = ["red", "limegreen", " hwb(210 50% 0%)"];
  const fromLines = makeLayout(from);
  const toLines = makeLayout(to);
  if (colors.length != fromLines.length || colors.length != toLines.length) {
    throw new Error("wtf");
  }
  const interpolators = fromLines.map((fromShape, index) => {
    const toShape = toLines[index];
    return matchShapes(fromShape, toShape);
  });
  const main: Showable = {
    description: "byLine()",
    duration: 4500,
    show({ timeInMs, context }) {
      // const progress = easeIn(timeInMs / this.duration);
      const progress =
        -Math.cos((timeInMs / this.duration) * FULL_CIRCLE) / 2 + 0.5;
      const initialTransform = context.getTransform();
      context.lineCap = "round";
      context.lineJoin = "round";
      context.translate(8, 1);
      context.lineWidth = 0.12;
      for (const [color, interpolator] of zip(colors, interpolators)) {
        const completePath = interpolator(progress);
        context.strokeStyle = color;
        context.stroke(new Path2D(completePath.rawPath));
      }
      context.setTransform(initialTransform);
    },
  };
  return main;
}
if (false) {
  builder.add(
    makeRepeater(byLine("Merry\nChristmas\n2025", "Happy\nNew Year\n2026"), 3)
  );
}

function createRocker(
  interpolator: (progress: number) => PathShape,
  description: string
) {
  const period = 5000;
  const base: Showable = {
    description,
    duration: period,
    show({ timeInMs, context }) {
      context.lineCap = "round";
      context.lineJoin = "round";
      const progress = easeAndBack(timeInMs / period);
      const completePath = interpolator(progress);
      function drawPaths(paths: readonly PathShape[]) {
        paths.forEach((path, index) => {
          const color = getColor(index);
          context.strokeStyle = color;
          context.stroke(new Path2D(path.rawPath));
        });
      }
      context.lineWidth = 0.18;
      drawPaths(
        completePath.commands.map((command) => new PathShape([command]))
      );
      context.lineWidth = 0.06;
      context.filter = "brightness(75%)";
      drawPaths(completePath.splitOnMove());
      context.filter = "none";
    },
  };
  return base;
}

if (false) {
  const baseTransform = new DOMMatrixReadOnly().translate(13, 0.5).scale(0.8);
  const fixedTransform = new DOMMatrixReadOnly()
    .translate(7.75, 0.5)
    .scale(0.8);
  builder.add(
    createRocker(
      matchShapes(
        before.transform(baseTransform),
        after.transform(baseTransform)
      ),
      "morphing"
    )
  );
  builder.add(
    createRocker(
      matchShapes(
        fixCursive(before).transform(fixedTransform),
        after.transform(fixedTransform)
      ),
      "morphing"
    )
  );
}

if (false) {
  /**
   * Assume the right 1/3 of the screen is covered by other videos.
   */
  const endScreen: ReadOnlyRect = {
    x: 1 / 3,
    y: 2 / 3,
    width: 10,
    height: 9 - 4 / 3,
  };
  const starPath = makeLayout("☆", "center", makeLineFont(3)).translate(
    endScreen.x + endScreen.width / 2,
    2
  );
  const eachOne = new MakeShowableInSeries();
  [
    "Thanks\nfor\nwatching!",
    "More\nto\ncome...",
    "Like\nshare\n&\nsubscribe.",
    "* * * * *",
  ].forEach((word) => {
    const originalPath = fixCursive(makeLayout(word));
    const originalBBox = originalPath.getBBox();
    const originalRect: ReadOnlyRect = {
      x: originalBBox.x.min,
      y: originalBBox.y.min,
      height: assertNonNullable(originalBBox.y.size),
      width: assertNonNullable(originalBBox.x.size),
    };
    const transform = panAndZoom(
      originalRect,
      endScreen,
      "srcRect fits completely into destRect",
      0.5,
      0.5
    );
    const finalPath = originalPath.transform(transform);
    const interpolator = matchShapes(starPath, finalPath);
    const rocker = createRocker(interpolator, `“${word}”`);
    eachOne.add(rocker);
  });
  builder.add(eachOne.build("flashing ☆ list"));
}

{
  const lineFont = makeLineFont(1);
  console.log("cursive", cursive.getAllLetters());
  console.log("lineFont", lineFont.getAllLetters());
  const availableSpace: ReadOnlyRect = {
    x: 1 / 2,
    y: 5.75,
    width: 15,
    height: 2.75,
  };
  const starPath = makeLayout("⭒", "center", makeLineFont(3)).makeItFit(
    availableSpace,
    "srcRect fits completely into destRect",
    0.5,
    0.5
  );
  const period = 5000;
  const easingKeyframes: Keyframes<number> = [
    { time: 0, value: 0 },
    { time: period * 0.125, value: 0, easeAfter: ease },
    { time: period * 0.5, value: 1 },
    { time: period * 0.625, value: 1, easeAfter: ease },
    { time: period, value: 0 },
  ];
  (window as any).xx = {
    period,
    easingKeyframes,
    go(timeInMs: number) {
      return interpolateNumbers(timeInMs % period, easingKeyframes);
    },
  };

  const eachOne = new MakeShowableInSeries();
  [
    { word: "ZZZzZZZzZZZ", font: cursive },
    { word: "The number of colored segments is now constant.", font: lineFont },
    { word: "This requires smaller adjustments over time.", font: cursive },
    { word: "← ↑ → ↓ ↔ ↕", font: lineFont },
  ].forEach(({ word, font }) => {
    const originalPath = makeLayout(word, "left", font);
    const finalPath = originalPath.makeItFit(
      availableSpace,
      "srcRect fits completely into destRect",
      0.5,
      0.5
    );
    const interpolator = matchShapes(starPath, finalPath);
    const rocker: Showable = {
      description: `“${word}”`,
      duration: period,
      show({ timeInMs, context, globalTime }) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.12;
        const progress = interpolateNumbers(timeInMs % period, easingKeyframes);
        const completePath = interpolator(progress);
        strokeColors({
          pathShape: completePath,
          context,
          repeatCount: 10,
          relativeOffset: globalTime / 4000,
        });
        /*
        completePath.splitOnMove().forEach((connectedPath) => {
          strokeColors({ pathShape: connectedPath, context });
        });
        */
        context.lineWidth = 0.03;
        context.strokeStyle = "#404040";
        context.stroke(new Path2D(completePath.rawPath));
      },
    };
    eachOne.add(rocker);
  });
  builder.add(eachOne.build("flashing ☆ list"));
}

if (false) {
  const eachOne = new MakeShowableInSeries();
  for (let length = 1; length <= 15; length++) {
    const after = makeLayout("7".repeat(length));
    const rocker = createRocker(matchShapes(before, after), `${length} × “7”`);
    eachOne.add(rocker);
  }
  builder.add(eachOne.build("growing list"));
}

{
  const square = "M 4.5,8 h -3.5 v -7 h 7 v 7 z";
  const finalPath = PathShape.fromRawString(square);
  //console.log(finalPath.rawPath);
  const initialPath = makeLayout("Square", "left").translate(1, 1);
  const interpolator = matchShapes(initialPath, finalPath);
  const showable: Showable = {
    duration: 5000,
    description: "square",
    show({ timeInMs, context }) {
      const progress = easeAndBack(timeInMs / this.duration);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 0.08;
      context.strokeStyle = BLUE;
      const shape = interpolator(progress);
      context.stroke(new Path2D(shape.rawPath));
    },
  };
  if (false) {
    builder.add(showable);
  }
}

{
  const futura = Font.futuraL(1.25);
  const lineFont = makeLineFont(1.25);
  const height = (9 - 3 * 0.5) / 2;
  const width = (height * 2) / Math.sqrt(3);
  //console.log({ height, width });
  const triangle = PathBuilder.M(0, height)
    .L(-width / 2, height)
    .L(0, 0)
    .L(width / 2, height)
    .L(0, height).pathShape;
  function drawSample(
    text: string,
    font: Font,
    x: number,
    y: number,
    color: string,
    lineWidth: number
  ) {
    const baseText = makeLayout(text, "center", font);
    const textBBox = baseText.getBBox();
    const transform = new DOMMatrix();
    transform.translateSelf(x, y);
    transform.scaleSelf(width / assertNonNullable(textBBox.x.size));
    const initialPath = baseText.transform(transform);
    const finalPath = triangle.translate(x, y);
    const interpolator = matchShapes(initialPath, finalPath);
    const showable: Showable = {
      duration: 6500,
      description: "square",
      show({ timeInMs, context }) {
        const progress = easeAndBack(timeInMs / this.duration);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = lineWidth;
        context.strokeStyle = color;
        const shape = interpolator(progress);
        context.stroke(new Path2D(shape.rawPath));
      },
    };
    builder.add(showable);
  }
  if (false) {
    drawSample("Triangle", cursive, 16 / 6, 0.5, "yellow", 0.08);
    drawSample("Equilateral Triangle", cursive, 16 / 6, 5, "yellow", 0.04);
    drawSample("Triangle", futura, 8, 0.5, "lime", 0.08);
    drawSample("Equilateral Triangle", futura, 8, 5, "lime", 0.04);
    drawSample("Triangle", lineFont, 16 * (5 / 6), 0.5, "cyan", 0.08);
    drawSample("Equilateral Triangle", lineFont, 16 * (5 / 6), 5, "cyan", 0.04);
  }
}

{
  const font = makeLineFont(0.75);
  const inOrder = new MakeShowableInSeries();
  function animateTransition(from: readonly string[], to: readonly string[]) {
    if (from.length != to.length) {
      throw new Error("wtf");
    }
    function makeShapes(pieces: readonly string[]) {
      const requestInfo = pieces.flatMap((letters, group) =>
        [...letters].flatMap((letter) => {
          if (!font.getChar(letter)) {
            return [];
          } else {
            return { letter, group };
          }
        })
      );
      const layout = new ParagraphLayout(font);
      layout.addText(pieces.join(""));
      const layoutResult = layout.align();
      const resultInfo = layoutResult
        .getAllLetters(-layoutResult.width / 2)
        .toArray();
      if (requestInfo.length != resultInfo.length) {
        throw new Error("wtf");
      }
      const commands = from.map(() => new Array<Command>());
      for (const [request, result] of zip(requestInfo, resultInfo)) {
        commands[request.group].push(...result.translatedShape.commands);
      }
      const result = commands.map((currentCommands) => {
        return fixCorners(new PathShape(currentCommands));
      });
      return result;
    }
    const fromShapes = makeShapes(from);
    const toShapes = makeShapes(to);
    if (fromShapes.length != toShapes.length) {
      throw new Error("wtf");
    }
    const interpolators = zip(fromShapes, toShapes)
      .map(([from, to]) => matchShapes(from, to))
      .toArray();
    const thisStep: Showable = {
      duration: 2000,
      description: "square",
      show({ timeInMs, context }) {
        const progress = timeInMs / this.duration;
        const originalTransform = context.getTransform();
        context.translate(8, 3);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.08;
        context.strokeStyle = "magenta";
        interpolators.forEach((interpolator) => {
          const shape = interpolator(progress);
          context.stroke(new Path2D(shape.rawPath));
        });
        context.setTransform(originalTransform);
      },
    };
    inOrder.add(
      addMargins(thisStep, { frozenBefore: 1000, frozenAfter: 1000 })
    );
  }
  animateTransition(
    ["(", "Total", " ÷ ", "Relevant", " + 1) × (", "Area", " - 3)"],
    ["(", "288", " ÷ ", "144", " + 1) × (", "4²", " - 3)"]
  );
  animateTransition(
    ["(", "288 ÷ 144", " + 1) × (", "4²", " - 3)"],
    ["(", "2", " + 1) × (", "16", " - 7)"]
  );
  animateTransition("(2 + 1)§ × §(16 - 7)".split("§"), "3§ × §9".split("§"));
  animateTransition(["3 × 9"], ["27"]);
  if (false) {
    builder.add(inOrder.build("algebra"));
  }
}

if (false) {
  //const font = makeLineFont(0.85);
  const font = Font.cursive(0.53);
  const initialString = "abcdefghijklmnopqrstuvwxyz";
  const finalString = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const initialLayout = new ParagraphLayout(font);
  const finalLayout = new ParagraphLayout(font);
  initialLayout.addText(initialString);
  finalLayout.addText(finalString);
  const initialLayoutResult = initialLayout.align();
  const finalLayoutResult = finalLayout.align();
  const initialLetterShapes = initialLayoutResult
    .getAllLetters(15 - initialLayoutResult.width, 1)
    .map(({ translatedShape }) => fixCorners(translatedShape));
  const finalLetterShapes = finalLayoutResult
    .getAllLetters(1, 1)
    .map(({ translatedShape }) => fixCorners(translatedShape));
  for (const [initialShape, finalShape, i] of zip(
    initialLetterShapes,
    finalLetterShapes,
    count()
  )) {
    const interpolator = matchShapes(initialShape, finalShape);
    const thisStep: Showable = {
      duration: 1200,
      description: `Sliding interpolator #${i}`,
      show({ timeInMs, context }) {
        const progress = ease(timeInMs / this.duration);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.08;
        context.strokeStyle = interpolateColor(
          progress,
          "#C0A0FF",
          "#9eff9eff"
        );
        const shape = interpolator(progress);
        context.stroke(new Path2D(shape.rawPath));
      },
    };
    const startTime = 500 * i;
    builder.add(
      addMargins(thisStep, { frozenBefore: startTime, frozenAfter: Infinity }),
      thisStep.duration + startTime
    );
  }
}

function fixCursive(input: PathShape, fudgeFactor = 0.0001) {
  function closeEnough(a: number, b: number) {
    return Math.abs(a - b) < fudgeFactor;
  }
  const output = new Array<PathShape>();
  const endPointsByY = new Map<number, number[]>();
  function getEndPoints(y: number) {
    let result = endPointsByY.get(y);
    if (result === undefined) {
      result = [];
      endPointsByY.set(y, result);
    }
    return result;
  }
  for (const connectedPath of input.splitOnMove()) {
    const possibleMerge = getEndPoints(connectedPath.startY);
    let takenCareOf = false;
    for (const index of possibleMerge) {
      const previous = output[index];
      if (closeEnough(previous.endX!, connectedPath.startX)) {
        const joinedCommands = [
          ...previous.commands,
          ...connectedPath.commands,
        ];
        const beforeBreak = joinedCommands[previous.commands.length - 1];
        const afterBreak = makeQCommand(
          joinedCommands[previous.commands.length]
        );
        const replacement = QCommand.controlPoints(
          beforeBreak.x,
          beforeBreak.y,
          afterBreak.x1,
          afterBreak.y1,
          afterBreak.x,
          afterBreak.y
        );
        joinedCommands[previous.commands.length] = replacement;
        const combinedPath = new PathShape(joinedCommands);
        output[index] = combinedPath;
        takenCareOf = true;
      }
    }
    if (!takenCareOf) {
      getEndPoints(connectedPath.endY).push(output.length);
      output.push(connectedPath);
    }
  }
  return new PathShape(
    output.flatMap((pathShape) => {
      return pathShape.commands;
    })
  );
}

function strokeColors(options: {
  pathShape: PathShape;
  context: CanvasRenderingContext2D;
  colors?: ReadonlyArray<string>;
  offset?: number;
  relativeOffset?: number;
  sectionLength?: number;
  repeatCount?: number;
}) {
  const splitter = new PathShapeSplitter(options.pathShape);
  options.colors ??= colors;
  if (
    options.sectionLength !== undefined &&
    options.repeatCount !== undefined
  ) {
    throw new Error("wtf");
  }
  if (options.sectionLength === undefined) {
    options.sectionLength =
      splitter.length / (options.repeatCount ?? 1) / options.colors.length;
  }
  if (options.relativeOffset !== undefined && options.offset !== undefined) {
    throw new Error("wtf");
  }
  if (options.offset == undefined) {
    if (options.relativeOffset == undefined) {
      options.offset = 0;
    } else {
      options.offset =
        options.relativeOffset * options.sectionLength * options.colors.length;
    }
  }
  if (options.offset < 0) {
    options.offset = positiveModulo(
      options.offset,
      options.colors.length * options.sectionLength
    );
  }
  let colorIndex = 0;
  let startPosition = -options.offset;
  while (startPosition < splitter.length) {
    const endPosition = startPosition + options.sectionLength;
    const section = splitter.get(startPosition, endPosition);
    const color = options.colors[colorIndex % options.colors.length];
    options.context.strokeStyle = color;
    options.context.stroke(new Path2D(section.rawPath));
    startPosition = endPosition;
    colorIndex++;
  }
}

if (true) {
  function slidingColors(
    description: string,
    pathShape: PathShape,
    colors: readonly string[],
    speed = 0.001242 / 2.5
  ) {
    const fullPath = new Path2D(pathShape.rawPath);
    const sectionLength = 0.23;
    const duration = (sectionLength * colors.length) / speed;
    const toShow: Showable = {
      description,
      duration,
      show({ globalTime, context }) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.12;
        strokeColors({
          pathShape,
          context,
          colors,
          sectionLength,
          offset: globalTime * speed,
        });
        context.lineWidth = 0.04;
        context.strokeStyle = "#404040";
        context.stroke(fullPath);
      },
    };
    builder.add(makeRepeater(toShow, 1));
  }
  const font = makeLineFont(1);
  slidingColors(
    "Hot",
    ParagraphLayout.singlePathShape({
      font,
      text: "Hot",
    }).translate(1, 0.5),
    ["rgb(255, 0, 0)", "rgb(255, 128, 0)", "rgb(255, 255, 0)"]
  );
  slidingColors(
    "Cool",
    ParagraphLayout.singlePathShape({
      font,
      text: "Cool",
    }).translate(4, 0.5),
    ["rgb(0, 255, 255)", "rgb(0, 128, 255)", "rgb(0, 0, 255)"]
  );
  slidingColors(
    "Purple",
    ParagraphLayout.singlePathShape({
      font,
      text: "Purple",
    }).translate(7, 0.5),
    ["rgb(128, 0, 255)", "rgb(255, 0, 255)"]
  );
  slidingColors(
    "cga 0",
    ParagraphLayout.singlePathShape({
      font,
      text: "cga 0",
    }).translate(12, 0.5),
    ["lime", "red", "yellow"]
  );
  slidingColors(
    "cga 1",
    ParagraphLayout.singlePathShape({
      font,
      text: "cga 1",
    }).translate(0.5, 2),
    ["cyan", "magenta", "white"]
  );
  slidingColors(
    "Rainbow",
    ParagraphLayout.singlePathShape({
      font,
      text: "Rainbow",
    }).translate(4.25, 2),
    colors
  );
  slidingColors(
    "Grayscale",
    ParagraphLayout.singlePathShape({
      font,
      text: "Grayscale",
    }).translate(9.75, 2),
    [
      "#b0b0b0",
      "#808080",
      "#404040",
      "#808080",
      "#b0b0b0",
      "#d0d0d0",
      "#ffffff",
      "#d0d0d0",
      "#b0b0b0",
    ]
  );
  slidingColors(
    "Fast",
    ParagraphLayout.singlePathShape({
      font,
      text: "Fast",
    }).translate(1, 3.75),
    colors,
    0.001242
  );
  slidingColors(
    "Slow",
    ParagraphLayout.singlePathShape({
      font,
      text: "Slow",
    }).translate(4.5, 3.75),
    colors,
    0.001242 / 10
  );
  slidingColors(
    "Dashes",
    ParagraphLayout.singlePathShape({
      font,
      text: "Dashes",
    }).translate(7.75, 3.75),
    ["white", "transparent"]
  );
  slidingColors(
    "Green",
    ParagraphLayout.singlePathShape({
      font,
      text: "Green",
    }).translate(12, 3.75),
    ["green", "limegreen", "lime"]
  );
}

if (false) {
  const margin = 0.5;
  const availableSpace = {
    x: margin,
    y: margin + 5,
    width: 16 - margin * 2,
    height: 9 - margin * 2,
  };
  function makeShape(text: string, font: Font) {
    const layout = new ParagraphLayout(font);
    layout.addText(text);
    const layoutResult = layout.align();
    const originalShape = layoutResult.singlePathShape();
    const originalBBox = originalShape.getBBox();
    const originalRect: ReadOnlyRect = {
      x: originalBBox.x.min,
      y: originalBBox.y.min,
      height: assertNonNullable(originalBBox.y.size),
      width: assertNonNullable(originalBBox.x.size),
    };
    const makeItFit = panAndZoom(
      originalRect,
      availableSpace,
      "srcRect fits completely into destRect",
      0,
      0
    );
    const bottom = transform(0, originalBBox.y.max, makeItFit).y;
    availableSpace.y = bottom + margin;
    availableSpace.height = 9 - margin / 2 - availableSpace.y;
    const finalShape = originalShape.transform(makeItFit);
    return finalShape;
  }
  function buildOne(font: Font) {
    const duration = 10000;
    const initialShape = makeShape(
      "I'’m just putting in my ten thousand (10,000) hours.",
      font
    );
    const splitter = new PathShapeSplitter(initialShape);
    const layers = colors.map((color, index, array) => {
      const startTime = (duration / array.length) * index;
      const endTime = (duration / array.length) * (index + 1);
      const finalPathStart = (splitter.length / 2 / array.length) * index;
      const finalPathEnd = splitter.length - finalPathStart;
      const pathStart = makeBoundedLinear(
        startTime,
        0,
        endTime,
        finalPathStart
      );
      const pathEnd = makeBoundedLinear(startTime, 0, endTime, finalPathEnd);
      return { color, pathStart, pathEnd };
    });
    const toShow: Showable = {
      description: "Multi Color Handwriting",
      duration,
      show({ timeInMs, context }) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.05;
        layers.forEach((layer) => {
          const to = layer.pathEnd(timeInMs);
          if (to > 0) {
            const from = layer.pathStart(timeInMs);
            const path = splitter.get(from, to);
            context.strokeStyle = layer.color;
            context.stroke(new Path2D(path.rawPath));
          }
        });
      },
    };
    builder.addJustified(toShow);
  }
  buildOne(cursive);
  buildOne(makeLineFont(1));
  buildOne(Font.futuraL(1));
}

if (false) {
  function createAnimation(
    path: PathShape,
    description: string,
    color: string
  ) {
    const bBox = path.getBBox();
    const lineCommand = new LCommand(
      bBox.x.min,
      bBox.y.max,
      bBox.x.max,
      bBox.y.max
    );
    const linePath = new PathShape([lineCommand]);
    const interpolator = matchShapes(path, linePath);
    const toShow: Showable = {
      description,
      duration: 3000,
      show({ timeInMs, context }) {
        const progress = easeAndBack(timeInMs / this.duration);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.05;
        context.strokeStyle = color;
        const path = interpolator(progress);
        context.stroke(new Path2D(path.rawPath));
      },
    };
    builder.add(toShow);
  }
  const layout = new ParagraphLayout(cursive);
  layout.addText("abcdefghijklmnopqrstuvwxyz");
  const layoutResult = layout.align();
  const fixedPath = fixCursive(
    layoutResult
      .singlePathShape()
      .transform(new DOMMatrixReadOnly("translate(0.25px, 4.75px) scale(0.35)"))
  );
  const basePath = layoutResult
    .singlePathShape()
    .transform(new DOMMatrixReadOnly("translate(8.25px, 4.75px) scale(0.35)"));
  createAnimation(fixedPath, "fixed to straight line", "lightblue");
  createAnimation(basePath, "base to straight line", "pink");
}

if (false) {
  function makeAnimation(completePath: PathShape, color: string) {
    const handwriting = createHandwriting(completePath);
    const toShow: Showable = {
      description: "Is W Connected?",
      duration: 10000,
      show({ timeInMs, context }) {
        const progress = timeInMs / this.duration;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.03;
        context.strokeStyle = color;
        handwriting(progress, context);
      },
    };
    builder.add(
      makeRepeater(
        addMargins(toShow, { hiddenBefore: 500, frozenAfter: 1000 }),
        1
      )
    );
  }
  {
    const layout = new ParagraphLayout(cursive);
    layout.addText("ijxijx Philip");
    const layoutResult = layout.align();
    const fixedTransform = new DOMMatrixReadOnly()
      .translate(0.5, 0.2)
      .scale(0.5);
    const fixedPath = fixCursive(layoutResult.singlePathShape()).transform(
      fixedTransform
    );
    makeAnimation(fixedPath, "blue");
    const baseTransform = new DOMMatrixReadOnly()
      .translate(0.5, 1.25)
      .scale(0.5);
    const basePath = layoutResult.singlePathShape().transform(baseTransform);
    makeAnimation(basePath, "red");
  }
  {
    const layout = new ParagraphLayout(cursive);
    layout.addText("iissssjjjxxxxtttt");
    const layoutResult = layout.align();
    const fixedTransform = new DOMMatrixReadOnly()
      .translate(0.5, 2.35)
      .scale(0.5);
    const fixedPath = fixCursive(layoutResult.singlePathShape()).transform(
      fixedTransform
    );
    makeAnimation(fixedPath, "blue");
    const baseTransform = new DOMMatrixReadOnly()
      .translate(0.5, 3.35)
      .scale(0.5);
    const basePath = layoutResult.singlePathShape().transform(baseTransform);
    makeAnimation(basePath, "red");
  }
}

//builder.reserve(Infinity);
export const morphTest = builder.build("Morph Test");

/**
 * Need to convert to parametric functions.
 * Each time we jump or hit a corner we create a new parametric function
 * and we string them together, each with its own duration.
 *
 * What happens if we create a new series of parametric functions that is a weighted average of the before and after case?
 * Initially it's all the before case.
 * At the end it's all the after case.
 * Will the result be any different from doing it the way we are doing it?
 *
 * What if we move the first part of the curve first, like in the fourier examples?
 *
 * In either case, can we do a smooth transition between the end points and the parametric parts?
 * Maybe we never show the original end points, only the parametric parts?
 */
