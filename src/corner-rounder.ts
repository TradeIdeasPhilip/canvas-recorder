/**
 * Extracted from sierpiński.ts so that showcase.ts can import it without
 * creating a static dependency on sierpiński.ts.
 *
 * Background: When showcase.ts imported makeCornerRounder directly from
 * sierpiński.ts, Rollup treated sierpiński.ts as a shared chunk rather than a
 * standalone dynamic entry.  In that mode Rollup only exports what static
 * importers need (makeCornerRounder), and tree-shakes out the main video export
 * (sierpińskiTop), causing the page to crash at runtime with `toShow` undefined.
 *
 * Keeping this file in the lib chunk (see vite.config.js) ensures the function
 * is available to both showcase.ts and sierpiński.ts without pulling the latter
 * into any static-import chain.
 */
import { Bezier } from "bezier-js";
import {
  Command,
  fromBezier,
  PathShape,
  QCommand,
} from "./glib/path-shape";
import { makePathShapeInterpolator } from "./interpolate";

/**
 * Returns an interpolator function `(progress: number) => PathShape`.
 *
 * At `progress = 0` the result looks like the original path with mitered (pointed) corners.
 * At `progress = 1` the corners are fully rounded.
 * Values in between are smoothly interpolated.
 *
 * `amountOfCurve` controls how much of each edge is replaced by a curve.
 * Must be in the open interval (0, 0.5); default is 1/3.
 *
 * If the input is 0 or less, or 0.5 or more, an error is thrown.
 * If the input is 1 or more, the function will return a version of the PathShape with completely rounded corners.
 * If the input is in between, the result will be interpolated.
 */
export function makeCornerRounder(
  originalPathShape: PathShape,
  amountOfCurve = 1 / 3,
) {
  if (amountOfCurve <= 0 || amountOfCurve >= 0.5) {
    throw new Error("wtf");
  }
  /**
   * Each of the original line segments will get broken into three parts.
   * `smallerCommands` will contain the middle third of each line segment.
   */
  const smallerCommands = originalPathShape.commands.map((command) => {
    const splitter = command.makeSplitter();
    const smallerCommand = splitter.split(
      splitter.length * amountOfCurve,
      splitter.length * (1 - amountOfCurve),
    );
    return smallerCommand;
  });
  /**
   * These commands retain the sharp corners of the original input.
   * The `smallerCommands` are connected with additional line segments.
   * These show off the mitered nature of the triangles.
   */
  const mitered = new Array<Command>();
  /**
   * These commands follow the same basic path, but with no sharp corners.
   * Each adjacent pair of `smallerCommands` are connected with a parabola.
   * I break each of those parabolas into two equal pieces.
   * I do this to match the two line segments in `mitered` that this curve will be replacing.
   */
  const rounded = new Array<Command>();
  smallerCommands.forEach((smallerCommand, index) => {
    const previousSmallerCommand = smallerCommands.at(index - 1)!;
    const originalCommand = originalPathShape.commands[index];
    /**
     * Connect the two `smallerCommands` with a parabola so there are no corners.
     */
    const fullCurve = new Bezier(
      previousSmallerCommand.x,
      previousSmallerCommand.y,
      originalCommand.x0,
      originalCommand.y0,
      smallerCommand.x0,
      smallerCommand.y0,
    );
    const halves = fullCurve.split(0.5);
    /**
     * To match the line segment immediately before the corner.
     */
    const firstRoundCommand = fromBezier(halves.left);
    /**
     * To match the line segment immediately after the corner.
     */
    const secondRoundCommand = fromBezier(halves.right);
    if (
      !(
        firstRoundCommand instanceof QCommand &&
        secondRoundCommand instanceof QCommand
      )
    ) {
      throw new Error("wtf");
    }
    const firstMiteredCommand = QCommand.controlPoints(
      firstRoundCommand.x0,
      firstRoundCommand.y0,
      firstRoundCommand.x1,
      firstRoundCommand.y1,
      originalCommand.x0,
      originalCommand.y0,
    );
    const secondMiteredCommand = QCommand.controlPoints(
      originalCommand.x0,
      originalCommand.y0,
      secondRoundCommand.x1,
      secondRoundCommand.y1,
      secondRoundCommand.x,
      secondRoundCommand.y,
    );
    mitered.push(firstMiteredCommand, secondMiteredCommand, smallerCommand);
    rounded.push(firstRoundCommand, secondRoundCommand, smallerCommand);
  });
  /**
   * Start at the top of the triangle, just like the original.
   * The previous scene shows the original paths, and we don't want the colors to jump when we switch scenes.
   */
  mitered.push(mitered.shift()!);
  rounded.push(rounded.shift()!);
  /**
   * 0 for the mitered version, 1 for the rounded version.
   * Interpolate in between.
   */
  const interpolator = makePathShapeInterpolator(
    new PathShape(mitered),
    new PathShape(rounded),
  );
  return interpolator;
}
