import {
  degreesPerRadian,
  initializedArray,
  positiveModulo,
} from "phil-lib/misc";
import { PathShapeSplitter } from "./glib/path-shape-splitter";
import { countPresent } from "./utility";
import { myRainbow } from "./glib/my-rainbow";
import { PathShape } from "./glib/path-shape";

export function strokeColorsOriginal(options: StrokeColorsOptions) {
  const splitter = PathShapeSplitter.create(options.pathShape);
  if (splitter.length == 0) {
    // This is more than an optimization.
    // If you take this away an empty path will cause an exception.
    return;
  }
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
  while (startPosition < splitter.length) {
    const endPosition = startPosition + sectionLength;
    const section = splitter.trim(startPosition, endPosition);
    const color = colorsToUse[colorIndex % colorsToUse.length];
    options.context.strokeStyle = color;
    section.setCanvasPath(options.context);
    options.context.stroke();
    startPosition = endPosition;
    colorIndex++;
  }
}
export function strokeColors(options: StrokeColorsOptions) {
  const lineCap = options.context.lineCap;
  const splitter = PathShapeSplitter.create(options.pathShape);
  if (splitter.length == 0) {
    // This is more than an optimization.
    // If you take this away an empty path will cause an exception.
    return;
  }
  const starts: {
    readonly distance: number;
    readonly incomingAngle: number;
    readonly x: number;
    readonly y: number;
  }[] = [];
  const ends: {
    readonly distance: number;
    readonly outgoingAngle: number;
    readonly x: number;
    readonly y: number;
  }[] = [];
  if (lineCap != "butt") {
    let start = 0;
    options.pathShape.splitOnMove().forEach((pathShape) => {
      const end = start + pathShape.getLength();
      const firstCommand = pathShape.commands[0];
      const lastCommand = pathShape.commands.at(-1);
      const open = true; //PathShape.needAnM(lastCommand, firstCommand);

      // This is ugly.  We don't really handle closed loops very well.
      // The ending probably won't be closed after we turn the path into dashes.
      // I manually fixed that in an example with some triangles, where I broke the first
      // command into two pieces and moved the first half to the far end of the list.
      //
      // This should work well enough with round lineCap, but not square or butt
      //
      // TODO can I fix this?  Maybe the same trick as before, splitting the first item.
      if (open) {
        starts.push({
          distance: start,
          incomingAngle: firstCommand.incomingAngle,
          x: pathShape.startX,
          y: pathShape.startY,
        });
        ends.push({
          distance: end,
          outgoingAngle: lastCommand!.outgoingAngle,
          x: pathShape.endX,
          y: pathShape.endY,
        });
      }
      start = end;
    });
  }
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
      const section = splitter.trim(startPosition, endPosition);
      const path = paths[colorIndex % paths.length];
      section.appendCanvasPath(path);
      const fillablePath = fillablePaths[colorIndex % paths.length];
      for (let index = 0; index < starts.length; index++) {
        const { distance } = starts[index];
        if (distance >= endPosition) {
          break;
        }
        if (distance < startPosition) {
          continue;
        }
        const { incomingAngle, x, y } = starts[index];
        fillablePath.addPath(
          linecapArchetype,
          new DOMMatrix()
            .translateSelf(x, y)
            .rotateSelf(incomingAngle * degreesPerRadian),
        );
      }

      for (let index = 0; index < ends.length; index++) {
        const { distance } = ends[index];
        if (distance >= endPosition) {
          break;
        }
        if (distance < startPosition) {
          continue;
        }
        const { outgoingAngle, x, y } = ends[index];
        fillablePath.addPath(
          linecapArchetype,
          new DOMMatrix()
            .translateSelf(x, y)
            .rotateSelf(outgoingAngle * degreesPerRadian + 180),
        );
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
