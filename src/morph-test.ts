import {
  angleBetween,
  assertNonNullable,
  count,
  FULL_CIRCLE,
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
import { Command, LCommand, PathBuilder, PathShape } from "./glib/path-shape";
import { Font } from "./glib/letters-base";
import { ALMOST_STRAIGHT, fixCorners, matchShapes } from "./morph-animation";
import { blackBackground, BLUE } from "./utility";
import { ease, easeAndBack, interpolateColor } from "./interpolate";
import { makeLineFont } from "./glib/line-font";
import { panAndZoom } from "./glib/transforms";

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
  return fixCorners(shape);
}

//const before = makeLayout("5555");
//const after = makeLayout("777777777777777");
const before = makeLayout("Merry\nChristmas\n2025");
const after = makeLayout("Happy\nNew Year\n2026");

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
    show(timeInMs, context) {
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
  const period = 4500;
  const base: Showable = {
    description,
    duration: period,
    show(timeInMs, context) {
      const initialTransform = context.getTransform();
      context.lineCap = "round";
      context.lineJoin = "round";
      context.translate(8, 1);
      const progress = easeAndBack(timeInMs / period);
      const completePath = interpolator(progress);
      function drawPaths(paths: readonly PathShape[]) {
        paths.forEach((path, index) => {
          const color = getColor(index);
          context.strokeStyle = color;
          context.stroke(new Path2D(path.rawPath));
        });
      }
      context.lineWidth = 0.12;
      drawPaths(
        completePath.commands.map((command) => new PathShape([command]))
      );
      context.lineWidth = 0.04;
      context.filter = "brightness(75%)";
      drawPaths(completePath.splitOnMove());
      context.filter = "none";
      context.setTransform(initialTransform);
    },
  };
  return base;
}
if (false) {
  builder.add(createRocker(matchShapes(before, after), "morphing"));
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
  console.log(finalPath.rawPath);
  const initialPath = makeLayout("Square", "left").translate(1, 1);
  const interpolator = matchShapes(initialPath, finalPath);
  const showable: Showable = {
    duration: 5000,
    description: "square",
    show(timeInMs, context) {
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
  console.log({ height, width });
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
      show(timeInMs, context) {
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
      show(timeInMs, context) {
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
      show(timeInMs, context) {
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

{
  function makeShape(text: string) {
    const layout = new ParagraphLayout(cursive);
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
    const margin = 0.125;
    const fullScreen: ReadOnlyRect = {
      x: margin,
      y: margin,
      width: 16 - margin * 2,
      height: 9 - margin * 2,
    };
    const transform = panAndZoom(
      originalRect,
      fullScreen,
      "srcRect fits completely into destRect",
      0,
      1
    );
    const finalShape = originalShape.transform(transform);
    return finalShape;
  }
  const finalShape = makeShape("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  const toStroke = finalShape.splitOnMove().map((pathShape) => {
    return new Path2D(pathShape.rawPath);
  });
  const toShow: Showable = {
    description: "Are the letters connected?",
    duration: 0,
    show(timeInMs, context) {
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 0.04;
      toStroke.forEach((path, index) => {
        const color = colors[index % colors.length];
        context.strokeStyle = color;
        context.stroke(path);
      });
    },
  };
  builder.addJustified(toShow);
}

{
  const layout = new ParagraphLayout(cursive);
    layout.addText("Keep it simple!");
    const layoutResult = layout.align();
    const transform = new DOMMatrixReadOnly("translate(1px, 4.5px) scale(0.5)");
    const textPath = layoutResult.singlePathShape().transform(transform);
  const bBox = textPath.getBBox();
  const lineCommand = new LCommand(bBox.x.min, bBox.y.max, bBox.x.max, bBox.y.max);
  const linePath = new PathShape([lineCommand]);
  const interpolator = matchShapes(textPath,linePath);
    const toShow: Showable = {
    description: "Underline to text",
    duration: 5000,
    show(timeInMs, context) {
      const progress = easeAndBack(timeInMs / this.duration);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 0.08;
        context.strokeStyle = "pink";
        const path = interpolator(progress);
        context.stroke(new Path2D( path.rawPath));
    },
  };
  builder.addJustified(toShow);

}

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
