import {
  angleBetween,
  assertNonNullable,
  FULL_CIRCLE,
  zip,
} from "phil-lib/misc";
import { ParagraphLayout } from "./glib/paragraph-layout";
import {
  makeRepeater,
  MakeShowableInParallel,
  MakeShowableInSeries,
  Showable,
} from "./showable";
import { Command, PathBuilder, PathShape } from "./glib/path-shape";
import { Font } from "./glib/letters-base";
import { ALMOST_STRAIGHT, fixCorners, matchShapes } from "./morph-animation";
import { blackBackground, BLUE } from "./utility";
import { easeAndBack } from "./interpolate";

const font = Font.cursive(1.25); //makeLineFont(1);

function makeLayout(
  text: string,
  alignment: "left" | "center" | "right" = "center"
) {
  const layout = new ParagraphLayout(font);
  layout.font;
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
    const layout = new ParagraphLayout(font);
    layout.font;
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
  const height = (9 - 3 * 0.5) / 2;
  const width = (height * 2) / Math.sqrt(3);
  console.log({ height, width });
  const triangle = PathBuilder.M(0, height)
    .L(-width / 2, height)
    .L(0, 0)
    .L(width / 2, height)
    .L(0, height).pathShape;
  const baseText = makeLayout("Triangle");
  const textBBox = baseText.getBBox();
  const transform = new DOMMatrix();
  transform.translateSelf(16 / 6, 0.5);
  transform.scaleSelf(width / assertNonNullable(textBBox.x.size));
  const initialPath = baseText.transform(transform);
  const finalPath = triangle.translate(16 / 6, 0.5);
  const interpolator = matchShapes(initialPath, finalPath);
  const showable: Showable = {
    duration: 5000,
    description: "square",
    show(timeInMs, context) {
      const progress = easeAndBack(timeInMs / this.duration);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 0.08;
      context.strokeStyle = "lime";
      const shape = interpolator(progress);
      context.stroke(new Path2D(shape.rawPath));
    },
  };
  if (true) {
    builder.add(showable);
  }
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
