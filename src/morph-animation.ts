import { angleBetween, radiansPerDegree, zip } from "phil-lib/misc";
import { Command, QCommand, LCommand, PathShape } from "./glib/path-shape";
import { qCommandInterpolation } from "./interpolate";

/**
 * If the angle between two pieces is less than 1/2°, so we'll call it good enough.
 */
export const ALMOST_STRAIGHT = radiansPerDegree / 2;
export const vertexCommands = new WeakSet<Command>();
/**
 * Convert to QCommand.
 * * QCommand inputs are returned as is.
 * * LCommand inputs are converted to QCommands.
 * * Any other input will cause an exception.
 * @param command Start from this
 * @returns A QCommand that looks like the input command.
 * @throws A CCommand would be a bad input and will cause a _runtime_ error.
 */
export function makeQCommand(command: Command): QCommand {
  if (command instanceof QCommand) {
    return command;
  } else if (command instanceof LCommand) {
    return QCommand.line4(command.x0, command.y0, command.x, command.y);
  } else {
    throw new Error("wtf");
  }
}

export function fixCorners(path: PathShape) {
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
    if (
      vertexCommands.has(result[i - 1]) &&
      vertexCommands.has(result[i + 1])
    ) {
      // If the previous and next commands are both vertices
      // Then split this command into two equal pieces.
      result.splice(i, 1, ...makeQCommand(result[i]).split(0.5));
    }
  }
  return new PathShape(result);
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
export function matchShapes(a: PathShape, b: PathShape) {
  const aConnectedPieces = a.splitOnMove();
  const bConnectedPieces = b.splitOnMove();
  function makeSecondLonger(
    alreadyLong: readonly PathShape[],
    makeLonger: PathShape[]
  ) {
    /**
     * This is an ideal first step because it typically looks better.
     *
     * But also because corners have that special item in them that
     * should be removed if we break at a corner.  If we didn't
     * remove the corners first, breakShapesIntoCommands() would have
     * to think about that.
     */
    function breakAtCorners() {
      let newTail = new Array<PathShape>();
      while (alreadyLong.length > makeLonger.length + newTail.length) {
        const last = makeLonger.pop();
        if (last === undefined) {
          break;
        }
        const vertexIndex = last.commands.findLastIndex((command) =>
          vertexCommands.has(command)
        );
        if (vertexIndex < 0) {
          // No corners in this path.
          // Try the next one.
          newTail.unshift(last);
        } else {
          const commands = [...last.commands];
          const commandsAfterCorner = commands.splice(
            vertexIndex + 1,
            Infinity
          );
          const vertex = commands.pop();
          if (!vertexCommands.has(vertex!)) {
            throw new Error("wtf");
          }
          const pathBeforeCorner = new PathShape(commands);
          const pathAfterCorner = new PathShape(commandsAfterCorner);
          makeLonger.push(pathBeforeCorner);
          newTail.unshift(pathAfterCorner);
        }
      }
      makeLonger.push(...newTail);
      if (makeLonger.length > alreadyLong.length) {
        throw new Error("wtf");
      }
    }
    function breakPathShapesIntoCommands() {
      let needToAdd = alreadyLong.length - makeLonger.length;
      if (needToAdd < 1) {
        return;
      }
      const pathShapeInfo = makeLonger.map((pathShape, index) => {
        const length = pathShape.getLength();
        const maxPieces = pathShape.commands.length;
        return {
          pathShape,
          length,
          currentCount: 1,
          maxPieces,
          originalIndex: index,
          priority: maxPieces > 1 ? length : -Infinity,
        };
      });
      pathShapeInfo.sort((a, b) => {
        return a.priority - b.priority;
      });
      while (needToAdd > 0 && pathShapeInfo.at(-1)!.priority > 0) {
        const toSplit = pathShapeInfo.pop()!;
        toSplit.currentCount++;
        if (toSplit.currentCount == toSplit.maxPieces) {
          toSplit.priority = -Infinity;
        } else {
          toSplit.priority = toSplit.length / toSplit.currentCount;
        }
        needToAdd--;

        {
          // Insert addTo back into the list.
          // Use binary search to find the right location.
          let start = 0;
          let end = pathShapeInfo.length;
          while (start < end) {
            const middle = ((start + end) / 2) | 0;
            if (pathShapeInfo[middle].priority < toSplit.priority) {
              // We're looking at things that are too small.
              // Look at the bigger half of what's remaining.
              start = middle + 1;
            } else {
              // We're looking at things that are too big.
              // Look at the smaller half of what's remaining.
              end = middle;
            }
          }
          pathShapeInfo.splice(end, 0, toSplit);
        }
      }
      pathShapeInfo.sort((a, b) => a.originalIndex - b.originalIndex);
      makeLonger.length = 0;
      pathShapeInfo.forEach((info) => {
        if (info.currentCount == 1) {
          makeLonger.push(info.pathShape);
        } else {
          const commands = [...info.pathShape.commands];
          for (
            let desiredCount = info.currentCount;
            desiredCount > 0;
            desiredCount--
          ) {
            const nextCommandCount = Math.round(commands.length / desiredCount);
            if (nextCommandCount <= 0) {
              throw new Error("wtf");
            }
            const nextCommands = commands.splice(0, nextCommandCount);
            const nextPathShape = new PathShape(nextCommands);
            makeLonger.push(nextPathShape);
          }
          if (commands.length > 0) {
            throw new Error("wtf");
          }
        }
      });
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
      console.log("multiSplit() #1");
      const newCommands = command.multiSplit(needToAdd + 1);
      makeLonger.push(
        ...newCommands.map((newCommand) => new PathShape([newCommand]))
      );
      if (alreadyLong.length != makeLonger.length) {
        throw new Error("wtf");
      }
    }
    breakAtCorners();
    breakPathShapesIntoCommands();
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
      // Strange.  This code doesn't see to be working.
      // Lots of things were flipping around.
      // When I disabled the next line, it actually worked better.
      return pieceB; //.reverse();
    } else {
      return pieceB;
    }
  });

  // Now I need to make the individual commands line up.
  // Each path will need the same number of commands as its corresponding path.
  // For simplicity I'm only using QCommands.
  const finalACommands = new Array<QCommand>();
  const finalBCommands = new Array<QCommand>();
  for (const [pathFromA, pathFromB] of zip(
    aConnectedPieces,
    bReorientedPieces
  )) {
    function addCommands(desiredLength: number, commands: QCommand[]) {
      const commandInfo = commands.map((command, index, array) => {
        let length: number;
        if (vertexCommands.has(command)) {
          length = -Infinity;
        } else {
          length = command.getLength();
          if (
            vertexCommands.has(array[index - 1]) ||
            vertexCommands.has(array[index + 1])
          ) {
            length /= 10;
          }
        }
        return {
          command,
          totalLength: length,
          currentLength: length,
          count: 1,
          originalIndex: index,
        };
      });
      commandInfo.sort((a, b) => a.currentLength - b.currentLength);
      let needToCreate = desiredLength - commands.length;
      while (needToCreate > 0) {
        const addTo = commandInfo.pop()!;
        addTo.count++;
        addTo.currentLength = addTo.totalLength / addTo.count;
        needToCreate--;
        {
          // Insert addTo back into the list.
          // Use binary search to find the right location.
          let start = 0;
          let end = commandInfo.length;
          while (start < end) {
            const middle = ((start + end) / 2) | 0;
            if (commandInfo[middle].currentLength < addTo.currentLength) {
              // We're looking at things that are too small.
              // Look at the bigger half of what's remaining.
              start = middle + 1;
            } else {
              // We're looking at things that are too big.
              // Look at the smaller half of what's remaining.
              end = middle;
            }
          }
          commandInfo.splice(end, 0, addTo);
        }
      }
      commandInfo.sort((a, b) => a.originalIndex - b.originalIndex);
      commands.length = 0;
      commandInfo.forEach((info) => {
        if (info.count == 1) {
          commands.push(info.command);
        } else {
          commands.push(...info.command.multiSplit(info.count));
        }
      });
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
    // Look for any corners that overlap in the source and destination.
    // If they are both at the same index, remove the special point command.
    // This will completely remove the special treatment.
    // (Not 100%  We still break some commands into two commands, like in the
    // "4" where one command had a corner on both ends.)
    for (let index = newACommands.length - 1; index >= 0; index--) {
      if (
        vertexCommands.has(newACommands[index]) &&
        vertexCommands.has(newBCommands[index])
      ) {
        newACommands.splice(index, 1);
        newBCommands.splice(index, 1);
      }
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
  /**
   *
   * @param commands
   * @param corners
   * @param progress 0 Means no rounding.  1 Means max rounding.
   * @returns
   */
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
      /**
       * Initially remove nothing.
       * Keep everything.
       * Start with the given image, unmodified.
       *
       * As progress increases to 50%,
       * r
       */
      const toRemove = Math.min(1 - progress, 0.5);
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
    const from = makeRoundedCorners(finalACommands, aCorners, 1 - progress);
    const to = makeRoundedCorners(finalBCommands, bCorners, progress);
    const result = qCommandInterpolation(from, to, progress);
    //return new PathShape(to);
    return new PathShape(result);
  }
  return interpolate;
}
