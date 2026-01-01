import {
  angleBetween,
  assertNonNullable,
  FULL_CIRCLE,
  NON_BREAKING_SPACE,
  radiansPerDegree,
  zip,
} from "phil-lib/misc";
import { makeLineFont } from "./glib/line-font";
import { ParagraphLayout } from "./glib/paragraph-layout";
import { MakeShowableInParallel, Showable } from "./showable";
import { Command, LCommand, PathShape, QCommand } from "./glib/path-shape";
import {
  makePathShapeInterpolator,
  qCommandInterpolation,
} from "./interpolate";
import { Font } from "./glib/letters-base";

/**
 * If the angle between two pieces is less than 1/2°, so we'll call it good enough.
 */
const ALMOST_STRAIGHT = radiansPerDegree / 2;

const vertexCommands = new WeakSet<Command>();

/**
 * Convert to QCommand.
 * * QCommand inputs are returned as is.
 * * LCommand inputs are converted to QCommands.
 * * Any other input will cause an exception.
 * @param command Start from this
 * @returns A QCommand that looks like the input command.
 * @throws A CCommand would be a bad input and will cause a _runtime_ error.
 */
function makeQCommand(command: Command): QCommand {
  if (command instanceof QCommand) {
    return command;
  } else if (command instanceof LCommand) {
    return QCommand.line4(command.x0, command.y0, command.x, command.y);
  } else {
    throw new Error("wtf");
  }
}

const font = Font.cursive(1); //makeLineFont(1);
function fixCorners(path: PathShape) {
  const result = new Array<Command>();
  path.commands.forEach((command, index, array) => {
    result.push(command);
    const nextCommand = array[index + 1];
    if (nextCommand === undefined) {
      return;
    }
    if (PathShape.needAnM(command, nextCommand)) {
      return;
    }
    const difference = angleBetween(
      command.outgoingAngle,
      nextCommand.incomingAngle
    );
    if (!isFinite(difference)) {
      return;
    }
    if (Math.abs(difference) < ALMOST_STRAIGHT) {
      return;
    }
    const vertexCommand = QCommand.controlPoints(
      command.x,
      command.y,
      command.x,
      command.y,
      command.x,
      command.y
    );
    vertexCommands.add(vertexCommand);
    result.push(vertexCommand);
  });
  for (let i = 1; i < result.length - 1; i++) {
    // For every command except the first and last...
    if (vertexCommands.has(result[i-1]) && vertexCommands.has(result[i-1])) {
      // If the previous and next commands are both vertices
      // Then split this command into two equal pieces.
      result.splice(i, 1, ...makeQCommand(result[i]).split(0.5));
    }
  }
  return new PathShape(result);
}

function makeLayout(text: string) {
  const layout = new ParagraphLayout(font);
  layout.addText(text);
  const layoutResult = layout.align(0, "center");
  return fixCorners(layoutResult.singlePathShape());
}

const before = makeLayout("4");
const after = makeLayout("4");

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
dumpBigCorners(before);
dumpBigCorners(after);
console.log(after);

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
builder.addJustified({
  description: "start",
  duration: 0,
  show(timeInMs, context) {
    const initialTransform = context.getTransform();
    context.lineWidth = 0.06;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.translate(8, 1);
    //before.splitOnMove().map((path, index) => {
    before.commands.map((command, index) => {
      const path = new PathShape([command]);
      const color = getColor(index);
      context.strokeStyle = color;
      context.stroke(new Path2D(path.rawPath));
    });
    context.translate(0, 5);
    //after.splitOnMove().map((path, index) => {
    after.commands.map((command, index) => {
      const path = new PathShape([command]);
      const color = getColor(index);
      context.strokeStyle = color;
      context.stroke(new Path2D(path.rawPath));
    });
    context.setTransform(initialTransform);
  },
});

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
    // TODO Start by looking for opportunities to break at corners.
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
    // insert new point commands here and record them and spit any command between two points.
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
    // This would be a good place to do the following:
    // TODO look for any corners that overlap in the source and destination.
    // If they are both at the same index, remove the special treatment.
    // Remove the special point command.
    finalACommands.push(...newACommands);
    finalBCommands.push(...newBCommands);
  }
  if (finalACommands.length != finalBCommands.length) {
    throw new Error("wtf");
  }
  const aCorners = new Array<number>();
  const bCorners = new Array<number>();
  finalACommands.forEach((command, index) => {
    if (vertexCommands.has(command)) {
      aCorners.push(index);
    }
  });
  finalBCommands.forEach((command, index) => {
    if (vertexCommands.has(command)) {
      bCorners.push(index);
    }
  });
  function makeRoundedCorners(
    commands: readonly QCommand[],
    corners: readonly number[],
    progress: number
  ): QCommand[] {
    const result = [...commands];
    corners.forEach((indexOfCorner) => {
      const indexBeforeCorner = indexOfCorner - 1;
      const beforeCornerOriginal = commands[indexBeforeCorner];
      const indexAfterCorner = indexOfCorner + 1;
      const afterCornerOriginal = commands[indexAfterCorner];
      const toRemove = (1 - progress) / 2;
      const beforeCorner = beforeCornerOriginal.split(1 - toRemove)[0];
      const afterCorner = afterCornerOriginal.split(toRemove)[1];
      const corner = QCommand.controlPoints(
        beforeCorner.x,
        beforeCorner.y,
        beforeCornerOriginal.x,
        beforeCornerOriginal.y,
        afterCorner.x0,
        afterCorner.y0
      );
      result[indexBeforeCorner] = beforeCorner;
      result[indexOfCorner] = corner;
      result[indexAfterCorner] = afterCorner;
    });
    return result;
  }
  function interpolate(progress: number) {
    const from = makeRoundedCorners(finalACommands, aCorners,1- progress);
    const to = makeRoundedCorners(finalBCommands, bCorners,  progress);
    const result = qCommandInterpolation(from, to, progress);
    //return new PathShape(to);
    return new PathShape(result);
  }
  return interpolate;
}
const interpolator = matchShapes(before, after);

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
      context.translate(8, 3.5);
      const progress = -Math.cos((timeInMs / period) * FULL_CIRCLE) / 2 + 0.5;
      const paths = interpolator(progress).commands.map(command=>new PathShape([command]));
      paths.forEach((path, index) => {
        const color = getColor(index);
        context.strokeStyle = color;
        context.stroke(new Path2D(path.rawPath));
      });
      context.setTransform(initialTransform);
    },
  };
  builder.add(base);
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

/**
 * Need an improvement to the interpolator.
 * To handle corners.
 * Instead of directly interpolating between the two initial shapes...
 * Interpolate shape a against a less curvy version of itself.
 * To get rid of the corners gradually and smoothly.
 * Same with b.
 * Then interpolate between those last two results.
 *
 * To smothenify a path:
 * At each corner add a new
 *
 * Notice the meeting point when deciding which items are the same lenght as which items.
 * That might be t= 1/2.
 * But we can tweak that any which way.
 * Maybe the from case gets smoothened very quickly, completing before t = 1/2
 * And the to case gets unsmoothened very quickly at the very end, starting after t= 1/2
 *
 * Should the final size of the new smooth peice be small always,
 * just enough not to be an obvious corner?
 * I.e. the same for all corners?
 * Maybe it's bigger for sharper corners.
 * So if something is barely a corner, almost nothing happens to it.
 * I.e. if a round off error or even a sloppy artist made something almost but not quite perfect,
 * any corrective action we gave would be almost imperceptible.
 * The easy option is to make the end state where the two lines adjacent to the corner each end at half their original length.
 * If a single command is between two corners, both ends will approach the middle,
 * and the original line will be gone at the end.
 */

/**
 * What if I just add a QCommand with all three control points to the same point?
 * Add one of these to each hard corner.
 *
 * Then hope for the best.
 * If, by luck, a corner in the initial and final paths line up perfectly,
 * Then the corner is preserved through the entire animation.
 * Otherwise, the initial point QCommand should grow into the final shape.
 * During the animation the point should only affect the position and size of the command.
 * The command will always look like a scaled, translated version of the non-point end.
 *
 * Would that work?
 * It seems like I just created two corners in place of one.
 * I'm not setting the angles of anything with that point-command.
 */
