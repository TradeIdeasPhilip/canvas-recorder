import { Command, PathShape, Point } from "./path-shape";

/**
 * Lets you look up a specific point along a path, or split a path into smaller pieces.
 */
export class PathShapeSplitter {
  readonly whole: PathShape;
  /**
   * All inputs are relative to this.
   */
  readonly length: number;
  readonly #allCommandInfo: readonly {
    command: Command;
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
      const bezier = command.getBezier();
      const length = command.getLength();
      const end = start + length;
      const result = { command, start, length, end };
      start = end;
      return result;
    });
    this.length = start;
  }
  /**
   *
   * @param position
   * * 0 for the start.
   * * this.length for the end.
   * * Values are automatically clamped to this range.
   * @returns The point at the given position along this curve.
   */
  at(position: number): Point {
    position = Math.min(this.length, Math.max(0, position));
    const index = this.#findCommandAt(position);
    const info = this.#allCommandInfo[index];
    const progress = (position - info.start) / info.length;
    return info.command.at(progress);
  }
  /**
   * Create a subpath starting at from and ending at to.
   *
   * Inputs are clamped if they are out of range.
   * 0 is the start.
   * this.length is the end.
   *
   * If to <= from, this will return a path with a single point, the point at to.
   * @param from Start here.
   * @param to End here.
   * @returns
   */
  get(from: number, to: number) {
    from = Math.max(0, from);
    to = Math.min(this.length, to);
    if (from >= to) {
      to = from;
    }
    const fromIndex = this.#findCommandAt(from);
    const toIndex = this.#findCommandAt(to);
    if (fromIndex == toIndex) {
      const info = this.#allCommandInfo[fromIndex];
      const command = info.command.split1(from / this.length, to / this.length);
      return new PathShape([command]);
    } else {
      const commands = new Array<Command>();
      {
        // Handle first command
        const info = this.#allCommandInfo[fromIndex];
        const progress = (from - info.start) / info.length;
        if (progress <= 0) {
          // Keep the entire thing
          commands.push(info.command);
        } else if (progress >= 1) {
          // Skip the entire thing.
        } else {
          // Split it.
          commands.push(info.command.split1(progress, 1));
        }
      }
      // Copy the middle commands as is.
      for (let index = fromIndex + 1; index < toIndex; index++) {
        commands.push(this.#allCommandInfo[index].command);
      }
      {
        // Handle last command
        const info = this.#allCommandInfo[toIndex];
        const progress = (to - info.start) / info.length;
        if (progress >= 1) {
          // > 1 is possible because of round-off error.
          // Keep the entire thing
          commands.push(info.command);
        } else if (progress <= 0) {
          // Skip the entire thing.
        } else {
          // Split it.
          commands.push(info.command.split1(0, progress));
        }
      }
      return new PathShape(commands);
    }
  }
}

// TODO can I finally get rid of PathCaliper❓😀
