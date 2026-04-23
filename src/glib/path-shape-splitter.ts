import { Command, CommandSplitter, PathShape, Point } from "./path-shape";

/**
 * Used internally.
 *
 * If you create a PathShapeSplitter for a PathShape,
 * we cache the result,
 * and the next time you ask for a splitter for that shape it will reuse the one we already made.
 */
const CACHE = Symbol();

/**
 * Used internally.
 *
 * If you create a PathShapeSplitter for a PathShape,
 * we cache the result,
 * and the next time you ask for a splitter for that shape it will reuse the one we already made.
 */
type Cache = PathShape & { [CACHE]?: PathShapeSplitter };

/**
 * Lets you look up a specific point along a path, or split a path into smaller pieces.
 */
export class PathShapeSplitter {
  static trimProgress(
    initial: PathShape,
    fromProgress: number,
    toProgress: number,
  ) {
    // TODO PathShapeSplitter objects were meant to be reused.  I could optimize this case better.
    const splitter = PathShapeSplitter.create(initial);
    return splitter.trim(
      splitter.length * fromProgress,
      splitter.length * toProgress,
    );
  }
  static trim(initial: PathShape, from: number, to: number) {
    // TODO PathShapeSplitter objects were meant to be reused.  I could optimize this case better.
    const splitter = PathShapeSplitter.create(initial);
    return splitter.trim(from, to);
  }

  readonly #allCommandInfo: readonly {
    command: Command;
    splitter: CommandSplitter;
    start: number;
    length: number;
    end: number;
  }[];
  /**
   * Where does this path start relative to the data in #allCommandInfo?
   *
   * When we build #allCommandInfo from scratch, we set #offset to 0.
   *
   * If we trim a path and start 1 unit in, and we reuse #allCommandInfo that was created for the original path, #offset is 1.
   *
   * #offset will never be negative.
   */
  readonly #offset: number;
  readonly #startIndex: number;
  /**
   * The largest index of a valid command.
   *
   * Never array.length, often array.length - 1.
   */
  readonly #endIndex: number;
  /**
   *
   * @param position Assume this.#offset has already been fixed and position will be directly to comparable to this.#allCommandInfo.
   * @returns
   */
  #findCommandAt(position: number): number {
    let low = this.#startIndex;
    let high = this.#endIndex;

    while (low <= high) {
      const mid = Math.floor(low + (high - low) / 2);
      const item = this.#allCommandInfo[mid];

      if (position < item.start) {
        // Target is before this item's range
        high = mid - 1;
      } else if (
        position >= item.end &&
        mid < this.#allCommandInfo.length - 1
      ) {
        // Target is after this item's range
        // The `mid < length - 1` check ensures we don't skip the last item if time == end
        low = mid + 1;
      } else {
        // Match found: item.start <= time < item.end
        // OR time is at the very final boundary (time == lastItem.end)
        return mid;
      }
    }

    return -1;
  }

  /**
   *
   * @param whole The original path that we are splitting.
   * @param length
   * All inputs are relative to this.
   *
   * "distance" is on the same scale as length.
   * "progress" means 0 ... 1.
   * "bezier parameter" also means 0 - 1, but the mapping between progress and bezier parameter is **not** linear.
   * progress and distance are linear.
   * @param allCommandInfo
   * @param offset
   * Where does this path start relative to the data in #allCommandInfo?
   *
   * When we build #allCommandInfo from scratch, we set #offset to 0.
   *
   * If we trim a path and start 1 unit in, and we reuse #allCommandInfo that was created for the original path, #offset is 1.
   *
   * offset should never be negative.
   * @param startIndex The first relevant index in this.#allCommandInfo.
   * @param endIndex The last relevant index in this.#allCommandInfo.
   * This must be a valid index, i.e. less than this.#allCommandInfo.length.
   */
  private constructor(
    readonly whole: PathShape,
    readonly length: number,
    allCommandInfo: readonly {
      command: Command;
      splitter: CommandSplitter;
      start: number;
      length: number;
      end: number;
    }[],
    offset: number,
    startIndex: number,
    endIndex: number,
  ) {
    this.#allCommandInfo = allCommandInfo;
    this.#offset = offset;
    this.#startIndex = startIndex;
    this.#endIndex = endIndex - 1;
    // This was designed for a second construction option.
    // You can create a splitter for a subpath without
    // starting from scratch.  You can reuse the bulk of
    // the data created in create(), saving time and memory.
    // I thought we were going to need that.
    // But after adding simple caching in create(),
    // this second type of constructor seems unnecessary.
  }

  static create(path: string | PathShape): PathShapeSplitter {
    if (typeof path === "string") {
      path = PathShape.fromRawString(path);
    }
    const cache: Cache = path;
    if (cache[CACHE] instanceof PathShapeSplitter) {
      //console.log("⭐️")
      return cache[CACHE];
    }
    let start = 0;
    const allCommandInfo = path.commands.map((command) => {
      const length = command.getLength();
      const end = start + length;
      const result = {
        command,
        splitter: command.makeSplitter(),
        start,
        length,
        end,
      };
      start = end;
      return result;
    });
    const result = new this(
      path,
      start,
      allCommandInfo,
      0,
      0,
      allCommandInfo.length,
    );
    cache[CACHE] = result;
    return result;
  }

  /**
   *
   * @param distance
   * * 0 for the start.
   * * this.length for the end.
   * * Values are automatically clamped to this range.
   * @returns The point at the given position along this curve.
   */
  at(distance: number): Point {
    distance = Math.min(this.length, Math.max(0, distance)) + this.#offset;
    const index = this.#findCommandAt(distance);
    const info = this.#allCommandInfo[index];
    const relativeToCommand = distance - info.start;
    return info.splitter.at(relativeToCommand);
  }
  /**
   * Return the position and tangent angle at the given distance along this curve.
   * Combines `at()` and `angleAt()` in a single command lookup.
   *
   * The angle is in radians: 0 points right, π/2 points down
   * (canvas y increases downward).  Under the y-flipped coordinate transform
   * used by `computeGridTransform`, this corresponds to the mathematical
   * direction of travel along the curve.
   *
   * @param distance
   * * 0 for the start.
   * * this.length for the end.
   * * Values are automatically clamped to this range.
   */
  positionAndAngleAt(distance: number): Point & { angle: number } {
    distance = Math.min(this.length, Math.max(0, distance)) + this.#offset;
    const index = this.#findCommandAt(distance);
    const info = this.#allCommandInfo[index];
    const relativeToCommand = distance - info.start;
    const pos = info.splitter.at(relativeToCommand);
    const angle = info.splitter.angleAt(relativeToCommand);
    return { x: pos.x, y: pos.y, angle };
  }
  /**
   * Create a subpath starting at from and ending at to.
   *
   * Inputs are clamped if they are out of range.
   * 0 is the start.
   * this.length is the end.
   * @param fromDistance Start here.
   * @param toDistance End here.
   * @param details This allows you to capture some details about how the result was created.
   * The default value of `undefined` means don't share these details.
   * @param tooSmall If a proposed cut is within this distance of the start of a command,
   * move the cut to the start of this command.
   * Sometimes those tiny segments can cause problems, especially when the distance is close to Number.EPSILON.
   * I've had segments that looked real to my code, literally dx=Number.EPSILON and dy=Number.EPSILON, but they disappeared when I handed them to the canvas.
   *
   * Also, if I have 9 colors spread around an equilateral triangle, I expect each segment to have exactly 3 colors.
   * When they don't, I assume that's because of round off error.
   *
   * Common problem:
   * I want the corners of my equilateral triangle to respect linejoin.
   * But I might be breaking the triangle right at a corner, Right where linejoin should apply.
   * I would need to detect that case and deal with it manually.
   * Now imagine that the trim algorithm tries to cut **very close** to the start of a command.
   * It leaves just a tiny sliver of a command at the beginning, before the command you might think would be at the beginning.
   * My algorithm sees the sliver and assumes that the canvas will draw the corner.
   * The canvas sees a zero length path (after rounding from doubles to floats to run on the GPU) and ignores it and does not draw the corner.
   *
   * *Hopefully* This number will be too small to notice directly (much smaller than a pixel) but large enough that the canvas can correctly read the angle of the resulting segment.
   * Remember I generally assume that my canvas has been transformed and I have no idea what a pixel is.
   * (I don't even want to believe pixels are real.)
   * So this is something of a wild guess.
   * **Bad Math**
   * @returns Creates a new path, as requested.
   *
   * This will return the original path, rather than creating a new path identical to that path.
   *
   * If you request a very tiny slice, The resulting path might or might not be empty.
   * Details of the implementation are in flux.
   *
   * If to < from, this will return an empty path with no commands.
   * This is a recent change.
   *
   * If to == from you will probably get a zero length path with a single command.
   * But see my notes about very short paths.
   * Details are uncertain and in flux.
   */
  trim(
    fromDistance: number,
    toDistance: number,
    details?: { offset: number; startTrimmed: boolean; endTrimmed: boolean },
    tooSmall = 0.0001,
  ) {
    fromDistance = Math.max(0, fromDistance);
    toDistance = Math.min(this.length, toDistance);
    if (fromDistance == 0 && toDistance == this.length) {
      return this.whole;
    }
    if (fromDistance > toDistance) {
      // This used to return a zero length path with one command.
      // Now it returns an empty path with no commands.
      // I'm curious if anyone used to old answer.
      debugger;
      return PathShape.EMPTY;
    }
    toDistance += this.#offset;
    fromDistance += this.#offset;
    const fromIndex = this.#findCommandAt(fromDistance);
    const toIndex = this.#findCommandAt(toDistance);
    if (fromIndex == toIndex) {
      const info = this.#allCommandInfo[fromIndex];
      let localFromDistance = fromDistance - info.start;
      if (localFromDistance < tooSmall) {
        localFromDistance = 0;
      }
      let localToDistance = toDistance - info.start;
      if (localToDistance > info.length - tooSmall) {
        localToDistance = info.length;
      }
      const command = info.splitter.split(localFromDistance, localToDistance);
      if (details) {
        details.offset = fromIndex;
        details.startTrimmed = localFromDistance > 0;
        details.endTrimmed = localToDistance < info.length;
        // Each command,
        //   what command came right before it?
        //   Maybe nothing, in which case we'd already tag it for a starting linecap.
        //   Maybe the command right before it in the list, which would be the default.
        //   Or maybe this is the first command in a loop, and the previous command is the last command in the loop.
        //   We can look for those at the same time as we look for the linecap and we can store those commands in a map.
        // Each time we create a new section of the original path:
        //   If we start in the middle of a command, do nothing special.
        //   If there is no previous command, do nothing special.
        //   If the previous command's outgoing angle is the same as the first command's incoming angle, do nothing special.
        //   Otherwise there is a corner right where we are splitting this thing and we need to create it ourselves.
        //   Add a prefix, a very small line segment pointing in the right direction to create the corner, but far less than one pixel long.
      }
      return new PathShape([command]);
    } else {
      const commands = new Array<Command>();
      {
        // Handle first command
        const info = this.#allCommandInfo[fromIndex];
        const localDistance = fromDistance - info.start;
        if (localDistance <= tooSmall) {
          // Keep the entire thing
          commands.push(info.command);
          if (details) {
            details.offset = fromIndex;
            details.startTrimmed = false;
          }
        } else if (localDistance >= info.length - tooSmall) {
          // Skip the entire thing.
          // console.warn("⁉️ skipping the first item ⁉️");
          if (details) {
            details.offset = fromIndex + 1;
            details.startTrimmed = false;
          }
        } else {
          // Split it.
          commands.push(info.splitter.split(localDistance, info.length));
          if (details) {
            details.offset = fromIndex;
            details.startTrimmed = true;
          }
        }
      }
      // Copy the middle commands as is.
      for (let index = fromIndex + 1; index < toIndex; index++) {
        commands.push(this.#allCommandInfo[index].command);
      }
      {
        // Handle last command
        const info = this.#allCommandInfo[toIndex];
        const localDistance = toDistance - info.start;
        if (localDistance >= info.length - tooSmall) {
          // > 1 is possible because of round-off error.
          // Keep the entire thing
          commands.push(info.command);
          if (details) {
            details.endTrimmed = false;
          }
        } else if (localDistance <= tooSmall) {
          // Skip the entire thing.
          if (details) {
            details.endTrimmed = false;
          }
        } else {
          // Split it.
          commands.push(info.splitter.split(0, localDistance));
          if (details) {
            details.endTrimmed = true;
          }
        }
      }
      return new PathShape(commands);
    }
  }
}
