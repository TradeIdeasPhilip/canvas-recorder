import { assertNonNullable, FULL_CIRCLE, zip } from "phil-lib/misc";
import { makeLineFont } from "./glib/line-font";
import { ParagraphLayout } from "./glib/paragraph-layout";
import { MakeShowableInParallel, Showable } from "./showable";
import { BLUE } from "./utility";
import { Command, LCommand, PathShape, QCommand } from "./glib/path-shape";
import { makePathShapeInterpolator } from "./interpolate";
import { Font } from "./glib/letters-base";

const font = Font.cursive(1); //makeLineFont(1);
function makeLayout(text: string) {
  const layout = new ParagraphLayout(font);
  layout.addText(text);
  const layoutResult = layout.align(0, "center");
  console.log([...layoutResult.getAllLetters()]);
  const paths = [
    ...layoutResult.getAllLetters().map(({ translatedShape }) => ({
      path: new Path2D(translatedShape.rawPath),
      pathShape: translatedShape,
    })),
  ];
  return paths;
}

const before = makeLayout("Philip");
const after = makeLayout("Felipe");

const builder = new MakeShowableInParallel();

// TODO move this somewhere better
builder.addJustified({
  description: "background",
  duration: 0,
  show(timeInMs, context) {
    context.fillStyle = "black";
    context.fillRect(0, 0, 16, 9);
  },
});

const colors = [
  "red",
  "rgb(255, 128, 0)",
  "yellow",
  "rgb(0, 255, 0)",
  BLUE,
  "rgb(128, 0, 255)",
];

builder.addJustified({
  description: "start",
  duration: 0,
  show(timeInMs, context) {
    const initialTransform = context.getTransform();
    context.lineWidth = 0.06;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.translate(3, 1);
    for (const [color, path] of zip(colors, before)) {
      context.strokeStyle = color;
      context.stroke(path.path);
    }
    context.translate(10, 0);
    for (const [color, path] of zip(colors, after)) {
      context.strokeStyle = color;
      context.stroke(path.path);
    }
    context.setTransform(initialTransform);
  },
});

function makeQCommand(command: Command): QCommand {
  if (command instanceof QCommand) {
    return command;
  } else if (command instanceof LCommand) {
    return QCommand.line4(command.x0, command.y0, command.x, command.y);
  } else {
    throw new Error("wtf");
  }
}

/**
 * Given two PathShape objects, return two more.
 * The new ones cover the exact same path.
 * However, they are split into commands that match up.
 * So you can interpolate from one path to the other.
 * @param a
 * @param b
 * @returns
 */
function matchShapes(a: PathShape, b: PathShape) {
  const aConnectedPieces = a.splitOnMove();
  const bConnectedPieces = b.splitOnMove();
  function makeSecondLonger(alreadyLong: PathShape[], makeLonger: PathShape[]) {
    function breakShapesIntoCommands() {
      let needToAdd = alreadyLong.length - makeLonger.length;
      let newTail = new Array<PathShape>();
      while (needToAdd > 0 && makeLonger.length > 0) {
        const last = makeLonger.pop()!;
        if (last.commands.length == 1) {
          newTail.unshift(last);
        } else if (needToAdd >= last.commands.length - 1) {
          // needToAdd = 2 , lastLength= 2 split it completely and split the next one.
          // needToAdd = 1 , lastLength= 2 split it completely
          last.commands.toReversed().forEach((command) => {
            newTail.unshift(new PathShape([command]));
          });
          needToAdd -= last.commands.length - 1;
        } else {
          // needToAdd = 1, lastLength = 3, split it partially
          const commands = [...last.commands];
          while (needToAdd > 0) {
            const command = assertNonNullable(commands.pop());
            newTail.unshift(new PathShape([command]));
            needToAdd--;
          }
          if (commands.length == 0) {
            throw new Error("wtf");
          }
          newTail.unshift(new PathShape(commands));
        }
      }
      makeLonger.push(...newTail);
      if (makeLonger.length > alreadyLong.length) {
        throw new Error("wtf");
      }
    }
    function breakCommandIntoMultipleCommands() {
      const needToAdd = alreadyLong.length - makeLonger.length;
      if (needToAdd < 0) {
        throw new Error("wtf");
      }
      if (needToAdd == 0) {
        return;
      }
      const originalCommands = makeLonger.pop()!.commands;
      if (originalCommands.length != 1) {
        throw new Error("wtf");
      }
      const command = makeQCommand(originalCommands[0]);
      const newCommands = command.multiSplit(needToAdd + 1);
      makeLonger.push(
        ...newCommands.map((newCommand) => new PathShape([newCommand]))
      );
      if (alreadyLong.length != makeLonger.length) {
        throw new Error("wtf");
      }
    }
    breakShapesIntoCommands();
    breakCommandIntoMultipleCommands();
  }
  if (aConnectedPieces.length > bConnectedPieces.length) {
    makeSecondLonger(aConnectedPieces, bConnectedPieces);
  } else if (bConnectedPieces.length > aConnectedPieces.length) {
    makeSecondLonger(bConnectedPieces, aConnectedPieces);
  }
  // We just got the paths all lined up.
  // (The nth path in list a will morph into the nth path in list b)
  // But which end of each one path should morph into which end of the other path.
  const bReorientedPieces = aConnectedPieces.map((pieceA, index) => {
    const pieceB = bConnectedPieces[index];
    const currentDistance =
      Math.hypot(pieceA.startX - pieceB.startX, pieceA.startY - pieceB.startY) +
      Math.hypot(pieceA.endX - pieceB.endX, pieceA.endY - pieceB.endY);
    const reversedDistance =
      Math.hypot(pieceA.startX - pieceB.endX, pieceA.startY - pieceB.endY) +
      Math.hypot(pieceA.endX - pieceB.startX, pieceA.endY - pieceB.startY);
    if (reversedDistance < currentDistance) {
      return pieceB.reverse();
    } else {
      return pieceB;
    }
  });

  // Now I need to make the individual command line up.
  // Each path will need the same number of commands as its corresponding path.
  // For simplicity I'm only using QCommands.
  const finalACommands = new Array<QCommand>();
  const finalBCommands = new Array<QCommand>();
  for (const [pathFromA, pathFromB] of zip(
    aConnectedPieces,
    bReorientedPieces
  )) {
    function addCommands(desiredLength: number, commands: QCommand[]) {
      const toSplit = commands.pop()!;
      commands.push(...toSplit.multiSplit(desiredLength - commands.length));
    }
    const newACommands = pathFromA.commands.map((command) =>
      makeQCommand(command)
    );
    const newBCommands = pathFromB.commands.map((command) =>
      makeQCommand(command)
    );
    if (newACommands.length < newBCommands.length) {
      addCommands(newBCommands.length, newACommands);
    } else if (newBCommands.length < newACommands.length) {
      addCommands(newACommands.length, newBCommands);
    }
    if (newACommands.length != newBCommands.length) {
      throw new Error("wtf");
    }
    finalACommands.push(...newACommands);
    finalBCommands.push(...newBCommands);
  }
  if (finalACommands.length != finalBCommands.length) {
    throw new Error("wtf");
  }
  return [new PathShape(finalACommands), new PathShape(finalBCommands)];
}
const interpolators = new Array<ReturnType<typeof makePathShapeInterpolator>>();
for (const originalShapes of zip(before, after)) {
  const matchedShapes = matchShapes(
    originalShapes[0].pathShape,
    originalShapes[1].pathShape
  );
  interpolators.push(
    makePathShapeInterpolator(matchedShapes[0], matchedShapes[1])
  );
}

{
  const period = 4000;
  const base: Showable = {
    description: "morphing",
    duration: period,
    show(timeInMs, context) {
      const initialTransform = context.getTransform();
      context.lineWidth = 0.06;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.translate(8, 1);
      const progress = -Math.cos((timeInMs / period) * FULL_CIRCLE) / 2 + 0.5;
      for (const [color, interpolator] of zip(colors, interpolators)) {
        context.strokeStyle = color;
        context.stroke(new Path2D(interpolator(progress).rawPath));
      }
      context.setTransform(initialTransform);
    },
  };
  builder.add(base);
}

export const morphTest = builder.build("Morph Test");
