import { LCommand, PathShape } from "./glib/path-shape";

/**
 * If the entire shape is contained in a one x one square, how big is each individual segment.
 * @param iteration 1 for the simplest, not trivial version.  0 for the empty version.
 * @returns
 */
export function getSegmentLength(iteration: number) {
  /**
   * How many segments it takes to get across or down the entire path.
   * (The shape is a square, so both are the same.)
   */
  const length = 3 ** iteration - 1;
  // let length = 0;
  // for (let i = 0; i < iteration; i++) {
  //   length = 2 + 3 * length;
  // }
  return 1 / length;
}

/**
 *
 * @param iteration 1 for the simplest path, 3 vertical lines and two horizontal lines.
 * @returns The requested PathShape.  It is made exclusively of L commands.  And every L command is the same length.
 * The horizontal segments are all a single L command.
 * The verticals segments are all 2 or 5 L commands.
 */
export function createPeanoPath(iteration: number) {
  const segmentLength = getSegmentLength(iteration);
  function create(iteration: number, up: boolean, right: boolean) {
    if (iteration == 0) {
      return "";
    }
    const previous = iteration - 1;
    const vSegment = ` v ${segmentLength * (up ? -1 : 1)}`;
    const altVSegment = ` v ${segmentLength * (up ? 1 : -1)}`;
    const hSegment = ` h ${segmentLength * (right ? 1 : -1)}`;
    let result = "";
    result += create(previous, up, right);
    result += vSegment;
    result += create(previous, up, !right);
    result += vSegment;
    result += create(previous, up, right);
    result += hSegment;
    result += create(previous, !up, right);
    result += altVSegment;
    result += create(previous, !up, !right);
    result += altVSegment;
    result += create(previous, !up, right);
    result += hSegment;
    result += create(previous, up, right);
    result += vSegment;
    result += create(previous, up, !right);
    result += vSegment;
    result += create(previous, up, right);
    return result;
  }
  const fullString = "M 0 1" + create(iteration, true, true);
  /**
   * The original sequence of commands.
   * These were created in such a way that every one has the exact same length.
   * If you see one segment on the screen that is 5✕ as long as the shortest segment, it is actually made out of 5 commands in this list.
   */
  const verboseCommands = PathShape.fromString(fullString).commands;
  /**
   * Build a new list of commands that is equivalent to {@link verboseCommands} but shorter.
   * This is not strictly necessary, but it might help the Fourier process to have fewer segments.
   * You will need at least one sample per segment.
   * If you have unnecessary segments then you might have to take a lot more samples and the Fourier algorithm will take longer **for each frame**.
   *
   * That logic is not completely sound.
   * I was thinking about the biggest hilbert curve in https://youtu.be/L92xpvGKi4A?si=Gg4P_WXTeHm0WeGL.
   * I was using 1024 samples for all of my work, and that curve just barely fit.
   * To do a good job we probably don't want to push the limits; it's not unreasonable for a longer segment to have multiple samples inside of it.
   *
   * I did this mostly for curiosity.
   * The number of segments in the "verbose" column describes the length of the path.
   * The number of segments in the "terse" column describes the number of segments that go all the way from corner to corner.
   * | Iteration | verbose | terse |
   * | -------: | ------: | -------: |
   * | 0 | 0 | 0 |
   * | 1 | 8 | 5 |
   * | 2 | 80 | 41 |
   * | 3 | 728 | 365 |
   * | 4 | 6,560 | 3,281 |
   * | 5 | 59,048 | 29,525 |
   *
   * Peano curve 3 fits into our standard 1,024 samples with plenty of room to spare.
   * But we'd need to ask for *a lot* more samples to do the bare minimum for Peano curves 4 and 5.
   */
  const terseCommands = new Array<LCommand>();
  verboseCommands.forEach((command) => {
    // Any time we see two line commands in a row with identical angles, combine them.
    if (!(command instanceof LCommand)) {
      throw new Error("wtf");
    }
    const previous = terseCommands.at(-1);
    if (
      previous != undefined &&
      previous.outgoingAngle == command.incomingAngle
    ) {
      const combined = new LCommand(
        previous.x0,
        previous.y0,
        command.x,
        command.y
      );
      terseCommands.pop();
      terseCommands.push(combined);
    } else {
      // Add the command as is.
      terseCommands.push(command);
    }
  });
  const result = new PathShape(terseCommands);
  if (result.splitOnMove().length > 1) {
    throw new Error("wtf");
  }
  return result;
}
(window as any).createPeanoPath = createPeanoPath;
