import {
  angleBetween,
  degreesPerRadian,
  initializedArray,
  polarToRectangular,
  positiveModulo,
  radiansPerDegree,
} from "phil-lib/misc";
import { PathShapeSplitter } from "./glib/path-shape-splitter";
import { countPresent } from "./utility";
import { myRainbow } from "./glib/my-rainbow";
import { LCommand, PathShape } from "./glib/path-shape";

// Bug / TODO
// Display a zero length path.
// I get nothing.
// I should get a circle or a square based on the linecap setting.
// This comes up in the standard fourier algorithm before we add any terms,
// or only the frequency=0 term, and you should see a point.

/**
 * Stroke the given path with a series of different colors.
 * @param options Several required and optional settings.
 * More details at {@link StrokeColorsOptions}.
 */
export function strokeColors(options: StrokeColorsOptions) {
  const lineCap = options.context.lineCap;
  const splitter = PathShapeSplitter.create(options.pathShape);
  if (splitter.length == 0) {
    // This is more than an optimization.
    // If you take this away an empty path will cause an exception.
    return;
  }
  const connectedSections = (() => {
    let offset = 0;
    return options.pathShape.splitOnMove().map((pathShape) => {
      const indexOfFirst = offset;
      offset += pathShape.commands.length;
      const indexOfLast = offset - 1;
      const firstCommand = pathShape.commands[0];
      const lastCommand = pathShape.commands.at(-1);
      const open = PathShape.needAnM(lastCommand, firstCommand);
      /*
      if (open) {
        starts.push({
          index: indexOfFirst,
          incomingAngle: firstCommand.incomingAngle,
          x: pathShape.startX,
          y: pathShape.startY,
        });
        ends.push({
          index: indexOfLast,
          outgoingAngle: lastCommand!.outgoingAngle,
          x: pathShape.endX,
          y: pathShape.endY,
        });
      }
      */
      return { indexOfFirst, indexOfLast, open };
    });
  })();
  const colorsToUse = options.colors ?? myRainbow;
  if (
    countPresent([
      options.sectionLength,
      options.repeatCount,
      options.colorCount,
    ]) > 1
  ) {
    throw new Error("wtf");
  }
  const sectionLength: number =
    options.sectionLength ??
    splitter.length /
      (options.colorCount ?? (options.repeatCount ?? 1) * colorsToUse.length);
  if (options.relativeOffset !== undefined && options.offset !== undefined) {
    throw new Error("wtf");
  }
  if (options.offset == undefined) {
    if (options.relativeOffset == undefined) {
      options.offset = 0;
    } else {
      options.offset =
        options.relativeOffset * sectionLength * colorsToUse.length;
    }
  }
  if (options.offset < 0) {
    options.offset = positiveModulo(
      options.offset,
      colorsToUse.length * sectionLength,
    );
  }
  let colorIndex = 0;
  let startPosition = -options.offset;
  const paths = initializedArray(colorsToUse.length, () => new Path2D());
  const fillablePaths = initializedArray(
    colorsToUse.length,
    () => new Path2D(),
  );
  const linecapRadius = options.context.lineWidth / 2;
  /**
   * Copy this for the *starting* point of each segment.
   * Copy this as-is for a segment that starts at (0,0) and moves in a direction of 0°.
   * Use the `transform` argument of Path2D.addPath() to set the actual position and direction of each lineCap.
   * Rotate this an extra ½ circle to draw the *end* of a segment.
   */
  const linecapArchetype = new Path2D();
  switch (lineCap) {
    case "square": {
      linecapArchetype.moveTo(0, 0);
      linecapArchetype.lineTo(0, -linecapRadius);
      linecapArchetype.lineTo(-linecapRadius, -linecapRadius);
      linecapArchetype.lineTo(-linecapRadius, linecapRadius);
      linecapArchetype.lineTo(0, linecapRadius);
      linecapArchetype.closePath();
      break;
    }
    case "round": {
      linecapArchetype.moveTo(0, -linecapRadius); // bottom point
      linecapArchetype.arc(
        0,
        0,
        linecapRadius, // center, radius
        -Math.PI / 2, // start angle: bottom (-90°)
        Math.PI / 2, // end angle: top (+90°)
        true,
      ); // counterclockwise = true semicircle
      linecapArchetype.lineTo(0, linecapRadius); // explicit top point (optional, but clean)
      linecapArchetype.lineTo(0, 0); // back to origin along diameter
      linecapArchetype.closePath(); // optional but good practice
      break;
    }
  }
  while (startPosition < splitter.length) {
    const endPosition = startPosition + sectionLength;
    if (endPosition > 0) {
      const details = {
        offset: NaN,
        startTrimmed: false,
        endTrimmed: false,
      };
      let singleColorSection = splitter.trim(
        startPosition,
        endPosition,
        details,
      );
      if (singleColorSection.commands.length > 0) {
        /**
         * options.pathShape.commands[indexOfFirstIncluded] is the first command that was included,
         * in whole or in part, in the trimmed selection.
         */
        const indexOfFirstIncluded = details.offset;
        /**
         * options.pathShape.commands[indexOfLastIncluded] is the last command that was included,
         * in whole or in part, in the trimmed selection.
         */
        const indexOfLastIncluded =
          indexOfFirstIncluded + singleColorSection.commands.length - 1;
        const indexOfFirstComplete = details.startTrimmed
          ? indexOfFirstIncluded + 1
          : indexOfFirstIncluded;
        const indexOfLastComplete = details.endTrimmed
          ? indexOfLastIncluded - 1
          : indexOfLastIncluded;

        // MARK: Add 0, 1 or 2 corners.
        {
          function addCorner(beforeIndex: number, previousAngle: number) {
            /**
             * Mostly aimed at round-off error.
             * Any small difference can be ignored.
             * **Bad Math**
             */
            const cutoff = radiansPerDegree / 2;
            const beforeCommand = singleColorSection.commands[beforeIndex];
            if (
              Math.abs(
                angleBetween(previousAngle, beforeCommand.incomingAngle),
              ) > cutoff
            ) {
              // The angle is big enough to care about.
              // Fix it.
              // Graft a small linear segment onto the front of the path.
              // The angle should match pc.outgoingAngle
              /**
               * The length should be a small fraction of a pixel,
               * too small to see directly,
               * but enough to tell the canvas to draw the linejoin for this corner.
               * **Bad Math**
               */
              const small = 0.0001;
              const offset = polarToRectangular(small, previousAngle);
              const x = beforeCommand.x0;
              const y = beforeCommand.y0;
              const x0 = x - offset.x;
              const y0 = y - offset.y;
              const newShortCommand = new LCommand(x0, y0, x, y);
              const newCommands = singleColorSection.commands.toSpliced(
                beforeIndex,
                0,
                newShortCommand,
              );
              singleColorSection = new PathShape(newCommands);
            }
          }
          // MARK: Last restart
          {
            // Look for the last M command in the trimmed section.
            // Look at the first command after that M.
            // Look for the largest connectedSections[?].indexOfFirst <= indexOfLastIncluded
            function findLastStart() {
              let begin = 0;
              let end = connectedSections.length;
              while (begin < end) {
                const middle = Math.floor((begin + end) / 2);
                const possible = connectedSections[middle];
                if (possible.indexOfFirst == indexOfLastIncluded) {
                  return possible;
                } else if (possible.indexOfFirst > indexOfLastIncluded) {
                  end = middle;
                } else {
                  begin = middle + 1;
                }
              }
              return connectedSections[begin - 1];
            }
            /**
             * This is the last connected section we could find that starts before the end of the trimmed path.
             */
            const connectedSection = findLastStart();
            if (connectedSection.indexOfFirst > indexOfFirstIncluded) {
              // There is at least one M after the start of the trimmed segment.
              // We will deal with the start after this.
              if (!connectedSection.open) {
                // We are looking at the start of a CLOSED loop.
                const endIsAlreadyPresent =
                  !details.endTrimmed &&
                  connectedSection.indexOfLast == indexOfFirstComplete;
                if (!endIsAlreadyPresent) {
                  /**
                   * `connectedSection.indexOfFirst` is relative to `options.pathShape.commands`.
                   * `localIndex` is relative to `singleColorSection.commands`.
                   */
                  const localIndex =
                    connectedSection.indexOfFirst - details.offset;
                  /**
                   * The angle of the piece that would have come right before this piece,
                   * after joining the end of the loop to the beginning,
                   * if we hadn't cut the end of the loop off.
                   */
                  const previousAngle =
                    options.pathShape.commands[connectedSection.indexOfLast]
                      .outgoingAngle;
                  addCorner(localIndex, previousAngle);
                }
              }
            }
          }
          // MARK: Initial segment
          if (!details.startTrimmed) {
            // The trimmed path starts at the beginning of one of the original commands.
            /**
             * This branch **only** looks at the first command.
             */
            const localIndex = 0;
            // Check to see if this command is the start of a connected section.
            // Look for a connected section that starts at exactly the beginning of the trimmed path.
            function findInitialRestart() {
              const desiredStartIndex = details.offset;
              let begin = 0;
              let end = connectedSections.length;
              while (begin < end) {
                const middle = Math.floor((begin + end) / 2);
                const possible = connectedSections[middle];
                if (possible.indexOfFirst == desiredStartIndex) {
                  return possible;
                } else if (possible.indexOfFirst > desiredStartIndex) {
                  end = middle;
                } else {
                  begin = middle + 1;
                }
              }
              // Not found
              return undefined;
            }
            const initialConnectedSection = findInitialRestart();
            if (initialConnectedSection) {
              // MARK: Initial restart
              if (!initialConnectedSection.open) {
                // The trimmed path starts at the start of a closed section.
                // Now check if the entire closed section is part of the trimmed path.
                if (initialConnectedSection.indexOfLast > indexOfLastComplete) {
                  // The end of this connected section has been trimmed.
                  // We need to add the corner ourselves.
                  /**
                   * The angle of the piece that would have come right before this piece,
                   * after joining the end of the loop to the beginning,
                   * if we hadn't cut the end of the loop off.
                   */
                  const previousAngle =
                    options.pathShape.commands[
                      initialConnectedSection.indexOfLast
                    ].outgoingAngle;
                  addCorner(localIndex, previousAngle);
                }
              }
            } else {
              // MARK: Previous segment
              /**
               * We broke the path between two commands.
               * `previousCommand` is the command immediately before the break.
               *
               * This command occurs immediately before the command we are about to display.
               * That must be the case, or `initialConnectedSection` would have been true and we would not have gotten here.
               */
              const previousCommand =
                options.pathShape.commands[details.offset - 1];
              if (!previousCommand) {
                debugger;
                console.error({ options, details });
              }
              addCorner(localIndex, previousCommand.outgoingAngle);
            }
          }
        }

        singleColorSection.appendCanvasPath(paths[colorIndex % paths.length]);
        const fillablePath = fillablePaths[colorIndex % paths.length];

        // MARK: Linecap
        {
          for (
            let connectedSectionIndex = 0;
            connectedSectionIndex < connectedSections.length;
            connectedSectionIndex++
          ) {
            const connectedSection = connectedSections[connectedSectionIndex];
            if (connectedSection.indexOfFirst > indexOfLastIncluded) {
              break;
            }
            if (connectedSection.open) {
              if (
                connectedSection.indexOfFirst >= indexOfFirstComplete &&
                connectedSection.indexOfFirst <= indexOfLastIncluded
              ) {
                const command =
                  options.pathShape.commands[connectedSection.indexOfFirst];
                fillablePath.addPath(
                  linecapArchetype,
                  new DOMMatrix()
                    .translateSelf(command.x0, command.y0)
                    .rotateSelf(command.incomingAngle * degreesPerRadian),
                );
              }
              if (
                connectedSection.indexOfLast >= indexOfFirstIncluded &&
                connectedSection.indexOfLast <= indexOfLastComplete
              ) {
                const command =
                  options.pathShape.commands[connectedSection.indexOfLast];
                fillablePath.addPath(
                  linecapArchetype,
                  new DOMMatrix()
                    .translateSelf(command.x, command.y)
                    .rotateSelf(command.outgoingAngle * degreesPerRadian + 180),
                );
              }
            }
          }
        }
      }
    }
    startPosition = endPosition;
    colorIndex++;
  }
  options.context.lineCap = "butt";
  for (let i = 0; i < paths.length; i++) {
    const color = colorsToUse[i];
    options.context.strokeStyle = color;
    const path = paths[i];
    options.context.stroke(path);
    options.context.fillStyle = color;
    const fillablePath = fillablePaths[i];
    options.context.fill(fillablePath);
  }
  options.context.lineCap = lineCap;
}

export type StrokeColorsOptions = {
  /** Stroke this path. */
  readonly pathShape: PathShape;
  /** Draw everything here. */
  readonly context: CanvasRenderingContext2D;
  /**
   * A list of CSS color strings to use when stroking the path.
   */
  readonly colors?: ReadonlyArray<string>;
  /**
   * How far ahead to jump in the colors.
   * This is measured in userspace units, same as pathShape.getLength().
   * A small, positive number means to make the first section a little bit smaller,
   * move all of the other sections forward to fill in the gap,
   * and make the last section larger and/or add a new section at the end.
   * As if you added a small section to the beginning of the curve, and later covered it up.
   * Larger number and negative numbers will work.
   *
   * For example, consider a line segment going from left to right.
   * Animate this property so it slowly grows.
   * The colored segments will slowly move to the left.
   *
   * At most one of offset and relative offset may be set.
   * If neither is set, the default is offset=0.
   */
  offset?: number;
  /**
   * This is an alternative to setting the offset.
   * 0 and small positive and negative values work as with offset.
   * But the scale is different.
   * A value of 1 means to rotate once all the way through the colors.
   * Jumping directly between 0 and 1 will have no visible effect.
   * Gradually animating the change between 0 and 1 will cause the colors to move one complete cycle.
   *
   * If the length of the path is changing over time,
   * I often find it's better to use relativeOffset and offset.
   */
  relativeOffset?: number;
  /**
   * sectionLength says how far to go before changing colors.
   * It is measured in userspace units, just like pathShape.getLength().
   *
   * At most one of sectionLength, repeatCount and colorCount can be used.
   * Setting none of these is the same as setting repeatCount to 1.
   */
  sectionLength?: number;
  /**
   * repeatCount says how many times to display the entire list of colors.
   *
   * At most one of sectionLength, repeatCount and colorCount can be used.
   * Setting none of these is the same as setting repeatCount to 1.
   */
  repeatCount?: number;
  /**
   * colorCount says how many different colored segments to draw.
   * If offset == 0 (and round off error is not a problem) then you will have exactly colorCount sections.
   * Otherwise the first and last segments might be smaller,
   * adding up to single segment.
   *
   * At most one of sectionLength, repeatCount and colorCount can be used.
   * Setting none of these is the same as setting repeatCount to 1.
   */
  colorCount?: number;
};
