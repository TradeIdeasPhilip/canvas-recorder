import { Command, CommandSplitter, PathShape, Point } from "./path-shape";

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
    const splitter = new PathShapeSplitter(initial);
    return splitter.get(
      splitter.length * fromProgress,
      splitter.length * toProgress,
    );
  }
  static trim(initial: PathShape, from: number, to: number) {
    // TODO PathShapeSplitter objects were meant to be reused.  I could optimize this case better.
    const splitter = new PathShapeSplitter(initial);
    return splitter.get(from, to);
  }
  readonly whole: PathShape;
  /**
   * All inputs are relative to this.
   */
  readonly length: number;
  readonly #allCommandInfo: readonly {
    command: Command;
    splitter: CommandSplitter;
    start: number;
    length: number;
    end: number;
  }[];
  #findCommandAt(position: number): number {
    let low = 0;
    let high = this.#allCommandInfo.length - 1;

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
  constructor(path: string | PathShape) {
    if (typeof path === "string") {
      path = PathShape.fromRawString(path);
    }
    this.whole = path;
    let start = 0;
    this.#allCommandInfo = path.commands.map((command) => {
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
    this.length = start;
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
    distance = Math.min(this.length, Math.max(0, distance));
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
  get(fromDistance: number, toDistance: number) {
    fromDistance = Math.max(0, fromDistance);
    toDistance = Math.min(this.length, toDistance);
    if (fromDistance == 0 && toDistance == this.length) {
      return this.whole;
    }
    if (fromDistance >= toDistance) {
      toDistance = fromDistance;
    }
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
