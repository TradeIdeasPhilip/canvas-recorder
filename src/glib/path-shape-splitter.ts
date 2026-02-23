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
   * Create a subpath starting at from and ending at to.
   *
   * Inputs are clamped if they are out of range.
   * 0 is the start.
   * this.length is the end.
   *
   * If to <= from, this will return a path with a single point, the point at to.
   * @param fromDistance Start here.
   * @param toDistance End here.
   * @returns
   */
  trim(fromDistance: number, toDistance: number) {
    fromDistance = Math.max(0, fromDistance);
    toDistance = Math.min(this.length, toDistance);
    if (fromDistance == 0 && toDistance == this.length) {
      return this.whole;
    }
    if (fromDistance >= toDistance) {
      toDistance = fromDistance;
    }
    toDistance += this.#offset;
    fromDistance += this.#offset;
    const fromIndex = this.#findCommandAt(fromDistance);
    const toIndex = this.#findCommandAt(toDistance);
    if (fromIndex == toIndex) {
      const info = this.#allCommandInfo[fromIndex];
      const command = info.splitter.split(
        fromDistance - info.start,
        toDistance - info.start,
      );
      return new PathShape([command]);
    } else {
      const commands = new Array<Command>();
      {
        // Handle first command
        const info = this.#allCommandInfo[fromIndex];
        const localDistance = fromDistance - info.start;
        if (localDistance <= 0) {
          // Keep the entire thing
          commands.push(info.command);
        } else if (localDistance >= info.length) {
          // Skip the entire thing.
        } else {
          // Split it.
          commands.push(info.splitter.split(localDistance, info.length));
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
        if (localDistance >= info.length) {
          // > 1 is possible because of round-off error.
          // Keep the entire thing
          commands.push(info.command);
        } else if (localDistance <= 0) {
          // Skip the entire thing.
        } else {
          // Split it.
          commands.push(info.splitter.split(0, localDistance));
        }
      }
      return new PathShape(commands);
    }
  }
}
