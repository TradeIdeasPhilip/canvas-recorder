import { pick, sum, zip } from "phil-lib/misc";
import { Showable } from "./showable";

export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Modify an array by removing the designated items.
 *
 * This is similar to Array.filter() but
 * * The predicate is inverted and
 * * This function modifies the array in place instead of creating a new one.
 *
 * This walks through the array backwards.
 * That means that the `index` parameter to the predicate will always match the indices from before anything was deleted.
 * @param array To modify
 * @param shouldRemove This should return true to remove and item or false to keep it.
 */
export function removeIf<T>(
  array: Array<T>,
  shouldRemove: (value: T, index: number) => boolean,
) {
  for (let index = array.length - 1; index >= 0; index--) {
    if (shouldRemove(array[index], index)) {
      array.splice(index, 1);
    }
  }
}

// TODO copy this to phil-lib/client-misc.ts
// Right under download() which only works on strings.
// Or maybe join them.  The last argument could have type string|Blob.
export function downloadBlob(filename: string, blob: Blob) {
  const blobURL = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobURL;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(blobURL);
}

/**
 * Overwrites the destination array with the contents of a compatible source array.
 * Mutates the destination array in place.
 */
export function assign<D, S extends D>(dest: D[], src: readonly S[]): void {
  dest.length = 0; // Clears the destination array efficiently
  dest.push(...src); // Copies all elements from the source
}

export const blackBackground: Showable = {
  description: "background",
  /**
   * The intent is to use this in a MakeShowableInParallel.
   * It will run as long as it needs to.
   */
  duration: 0,
  show({ context }) {
    context.fillStyle = "black";
    context.fillRect(0, 0, 16, 9);
  },
};

/**
 * Like SQL's count().
 * It counts the number of inputs that are not nullable.
 * @param items Review each of these
 * @returns The number of `items` that were not nullable.
 */
export function countPresent(items: readonly unknown[]) {
  let result = 0;
  items.forEach((item) => {
    if (item !== undefined && item !== null) {
      result++;
    }
  });
  return result;
}

/**
 * Like {@link Array.map}(), but
 * 1. The callback function is given __two__ adjacent values each time.
 * 2. The callback function is called array.length **- 1** times.
 * @param array To walk over
 * @param f
 * @returns A collection of the results
 */
export function mapEachPair<T, U>(
  array: readonly T[],
  f: (a: T, b: T, indexOfFirst: number, array: readonly T[]) => U,
) {
  const result = new Array<U>();
  array.forEach((second, index) => {
    if (index != 0) {
      const first = array[index - 1];
      const u = f(first, second, index - 1, array);
      result.push(u);
    }
  });
  return result;
}

export function doTableLayout<
  T extends { readonly width: number; readonly height: number },
>(
  rows: ReadonlyArray<ReadonlyArray<T>>,
  options: {
    readonly top?: number;
    readonly left?: number;
    readonly rowGap?: number;
    readonly columnGap?: number;
  } = {},
) {
  const top = options.top ?? 0;
  const left = options.left ?? 0;
  const rowGap = options.rowGap ?? 0;
  const columnGap = options.columnGap ?? 0;
  const rowHeights = rows.map((row) =>
    Math.max(...row.map((cell) => cell.height)),
  );
  const columnWidths = new Array<number>();
  rows.forEach((row) => {
    row.forEach((cell, columnIndex) => {
      const previousValue = columnWidths.at(columnIndex) ?? -Infinity;
      columnWidths[columnIndex] = Math.max(previousValue, cell.width);
    });
  });
  let rowTop = top;
  const rowTops = rowHeights.map((rowHeight) => {
    const result = rowTop;
    rowTop += rowHeight + rowGap;
    return result;
  });
  let columnLeft = left;
  const columnLefts = columnWidths.map((columnWidth) => {
    const result = columnLeft;
    columnLeft += columnWidth + columnGap;
    return result;
  });
  const offsets = rows.map((row, rowIndex) => {
    const rowTop = rowTops[rowIndex];
    const rowHeight = rowHeights[rowIndex];
    return row.map((source, columnIndex) => {
      const columnLeft = columnLefts[columnIndex];
      const columnWidth = columnWidths[columnIndex];
      const dx = columnLeft + (columnWidth - source.width) / 2;
      const dy = rowTop + (rowHeight - source.height) / 2;
      return { dx, dy, source };
    });
  });
  return { offsets, columnLefts, columnWidths, rowTops, rowHeights };
}

/**
 * Spread several clips out evenly.
 *
 * Create the same amount of space between each pair of clips.
 * Make them fit in a given range.
 * @param clips List of items to relocate.
 * These will remain in order.
 * @param options
 * * `startFrom` - Number of milliseconds between the start of the scene and when the first clip starts playing.
 * This can be negative to start playing before the previous scene ends.
 * The default is the incoming `startMsIntoScene` of the first element of `clips`.
 * * `endAt` - Number of milliseconds between the start of the scene and when the last clip finishes.
 * The default is the incoming end time of the last element of `clips`.
 * * `startWeight` - How much space to leave between `startFrom and the start of the first clip.
 * The space between each pair of adjacent clips is given a weight of 1.
 * The default is 0 space before the first clip.
 * * `endWeight` - How much space to leave between the end of the last clip and `endAt`.
 * The space between each pair of adjacent clips is given a weight of 1.
 * The default is 0 space after the last clip.
 * @returns `clips`, after the start times of the elements have been adjusted.
 */
export function distribute<
  T extends { startMsIntoScene: number; lengthMs: number },
>(
  clips: T[],
  options: {
    startFrom?: number;
    endAt?: number;
    startWeight?: number;
    endWeight?: number;
  },
): T[] {
  if (clips.length == 0) {
    return clips;
  }
  const startFrom = options.startFrom ?? clips[0].startMsIntoScene;
  const endAt =
    options.endAt ??
    (() => {
      const { startMsIntoScene, lengthMs } = clips.at(-1)!;
      return startMsIntoScene + lengthMs;
    })();
  const timeAvailable = endAt - startFrom;
  const timeUsed = sum(clips.map(({ lengthMs }) => lengthMs));
  const timeToDistribute = timeAvailable - timeUsed;
  if (timeToDistribute < 0) {
    throw new Error("wtf");
  }
  /**
   * Distribute the extra space evenly over this many spaces.
   *
   * Between each pair of clips is exactly one space.
   * Before the first clip and after the last, that's configurable.
   * By default they get 0 spaces.
   * They can request a non-integer amount of space.
   */
  let numberOfSpaces = clips.length - 1;
  let { startWeight, endWeight } = options;
  if (numberOfSpaces == 0) {
    // The default values for startWeight and endWeight are (conceptually) tiny positive numbers.
    // Most of the time this is so close to 0 that it just gets rounds off to 0.
    // But if everything else is 0, then all of the weight is given to the one of these that was undefined.
    // If they are both undefined, then the weight is split evenly between them.
    if (startWeight === undefined) {
      if (endWeight === undefined) {
        startWeight = 0.5;
        endWeight = 0.5;
      } else {
        if (endWeight == 0) {
          startWeight = 1;
        } else {
          startWeight = 0;
        }
      }
    } else {
      if (endWeight === undefined) {
        if (startWeight == 0) {
          endWeight = 1;
        } else {
          endWeight = 0;
        }
      }
    }
  } else {
    startWeight ??= 0;
    endWeight ??= 0;
  }
  if (startWeight < 0 || endWeight < 0) {
    throw new Error("wtf");
  }
  numberOfSpaces += startWeight + endWeight;
  if (numberOfSpaces <= 0) {
    throw new Error("wtf");
  }
  const msPerSpace = timeToDistribute / numberOfSpaces;
  let start = startFrom + startWeight * msPerSpace;
  clips.forEach((clip) => {
    clip.startMsIntoScene = start;
    start += clip.lengthMs + msPerSpace;
  });
  return clips;
}

/**
 * Very similar tp the standard Map in functionality.
 * The big difference is that this uses a simple array, not a hash table.
 *
 * For large enough Maps a hash table will be faster.
 * For small sets, this will be fine, possibly even faster.
 *
 * One big advantage of this version is that you can define your own equals operation.
 * The default is ===.
 *
 * Not all methods have been implemented yet.
 * But there's no reason the remaining items can't be added as needed.
 */
export class ArrayMap<Key, Value> {
  #equals: (a: Key, b: Key) => boolean;
  #keys = new Array<Key>();
  #values = new Array<Value>();
  constructor(equals?: (a: Key, b: Key) => boolean) {
    this.#equals = equals ?? ((a: Key, b: Key) => a === b);
  }
  /**
   * Add multiple items at once.
   *
   * `map.add([[k1,v1],[k2,v2],[k3,v3]]) is equivalent to `map.set(k1,v1).set(k2,v2).set(k3,v3)`.
   * Add()'s input is set up to match the standard Map constructor's input.
   *
   * The bulk of this class uses the same interface as Map, but the constructor is a little different.
   * @param items To insert.
   * @returns `this`, for chaining.
   */
  add(items: [Key, Value][]): this {
    items.forEach(([key, value]) => {
      this.set(key, value);
    });
    return this;
  }
  /**
   *
   * @param key Look for a key that #equals this key.
   * @returns -1 if not found, other an index into #keys and #values.
   */
  #getIndex(key: Key) {
    return this.#keys.findIndex((itemKey) => this.#equals(key, itemKey));
  }
  has(key: Key): boolean {
    return this.#getIndex(key) > -1;
  }
  get(key: Key): Value | undefined {
    return this.#values[this.#getIndex(key)];
  }
  /**
   * If the key is new, the key value pair is added to the end of the list.
   *
   * If the key matches an existing key, the order of the list will remain the same.
   * (Only affects iterators, not {@link get}() or {@link has}().)
   * The new value will replace the old value.
   * It is unspecified whether we keep the new or old key.
   * @param key
   * @param value
   * @returns `this`, for chaining.
   */
  set(key: Key, value: Value): this {
    const previousIndex = this.#getIndex(key);
    if (previousIndex < 0) {
      this.#keys.push(key);
      this.#values.push(value);
    } else {
      this.#values[previousIndex] = value;
    }
    return this;
  }
  clear(): void {
    this.#keys.length = 0;
    this.#values.length = 0;
  }
  /**
   * Remove the given key.
   * @param key Search for this.
   * @returns `true` if an entry in this object has been removed successfully. `false` if the key is not found in this object
   */
  delete(key: Key): boolean {
    const previousIndex = this.#getIndex(key);
    if (previousIndex < 0) {
      return false;
    } else {
      this.#keys.splice(previousIndex, 1);
      this.#values.splice(previousIndex, 1);
      return true;
    }
  }
  keys(): IteratorObject<Key> {
    return this.#keys[Symbol.iterator]();
  }
  values(): IteratorObject<Value> {
    return this.#values[Symbol.iterator]();
  }
  entries(): IteratorObject<[Key, Value]> {
    return zip(this.#keys, this.#values);
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  get size() {
    return this.#keys.length;
  }
  // TODO add getOrInsert(), getOrInsertComputed() and forEach()
}

/**
 * This is an easy way to expose things to the console, mostly aimed at debugging.
 *
 * This limits the pollution of then global namespace.
 * And it makes it easier to find debug stuff from the console.
 * Put it all in one place.
 *
 * This is mostly aimed at the browser.
 * It does not cause any problems in tsx (node).
 * This replaces `(window as any).something = something`, which does not work in node.
 */
export const philDebug: Record<string, any> = {};
(globalThis as any).philDebug = philDebug;

/**
 *
 * @param x1
 * @param y1
 * @param x2
 * @param y2
 * @param x
 * @returns
 */
export function lerp5(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
): number {
  const slope = (y2 - y1) / (x2 - x1);
  return (x - x1) * slope + y1;
}

// MARK: Random

// Copied from phil-lib 1.8.1 (misc.ts) to fix its console noise here first.
// Copy it back to phil-lib once it has been tested.  Everything in this
// project uses this copy, not phil-lib's.

/**
 * This is a drop in replacement for `window.random()`.
 * You can also ask for the current seed, for us in a call to
 * or Random.create(), Random.fromString() or Random.seedIsValid().
 */
export type RandomFunction = {
  readonly currentSeed: string;
  (): number;
};

/**
 * This provides a random number generator that can be seeded.
 * `Math.rand()` cannot be seeded.  Using a seed will allow
 * me to repeat things in the debugger when my program acts
 * strange.
 */
export class Random {
  private constructor() {
    throw new Error("wtf");
  }
  /**
   * Creates a new random number generator using the sfc32 algorithm.
   *
   * sfc32 (Simple Fast Counter) is part of the [PractRand](http://pracrand.sourceforge.net/)
   * random number testing suite (which it passes of course).
   * sfc32 has a 128-bit state and is very fast in JS.
   *
   * [Source](https://stackoverflow.com/a/47593316/971955)
   * @param a A 32 bit integer.  The 1st part of the seed.
   * @param b A 32 bit integer.  The 2nd part of the seed.
   * @param c A 32 bit integer.  The 3rd part of the seed.
   * @param d A 32 bit integer.  The 4th part of the seed.
   * @returns A function that will act a lot like `Math.rand()`, but it starts from the given seed.
   */
  private static sfc32(
    a: number,
    b: number,
    c: number,
    d: number
  ): RandomFunction {
    function random() {
      a |= 0;
      b |= 0;
      c |= 0;
      d |= 0;
      let t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    }
    const result = random as RandomFunction;
    Object.defineProperty(result, "currentSeed", {
      get() {
        return JSON.stringify([a, b, c, d]);
      },
    });
    return result;
  }
  static #nextSeedInt = 42;
  /**
   * Returns true if this was a valid seed created by
   * `RandomFunction.currentSeed` or Random.newSeed().
   * @param seed The string to test
   * @returns True if this was a saved seed value.
   */
  static seedIsValid(seed: string): boolean {
    try {
      this.create(seed);
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Create a new instance of a random number generator.
   *
   * Also consider `Random.fromString()` which is slightly newer.
   * This only works with seeds that have been created and saved by
   * this class.  `Random.fromString()` can turn any string into a
   * seed.
   * @param seed The result from a previous call to `Random.newSeed()`.
   * By default this will create a new seed.
   * Either way the seed will be sent to the JavaScript console.
   *
   * Typical use:  Use the default until you want to repeat something.
   * Then copy the last seed from the log and use here.
   * @returns A function that can be used as a drop in replacement for `Math.random()`.
   * @throws If the seed is invalid this will `throw` an `Error`.
   */
  static create(seed = this.newSeed()): RandomFunction {
    console.info(seed);
    // The following line throws a lot of exceptions, by design.
    // If you checked "pause on caught exceptions", and you are here,
    // just hit resume.
    const seedObject: unknown = JSON.parse(seed);
    if (!(seedObject instanceof Array)) {
      throw new Error("invalid input");
    }
    if (seedObject.length != 4) {
      throw new Error("invalid input");
    }
    const [a, b, c, d] = seedObject;
    if (
      !(
        typeof a == "number" &&
        typeof b == "number" &&
        typeof c == "number" &&
        typeof d == "number"
      )
    ) {
      throw new Error("invalid input");
    }
    return this.sfc32(a, b, c, d);
  }
  /**
   *
   * @returns A new seed value appropriate for use in a call to `Random.create()`.
   * This will be reasonably random.
   *
   * The seed is intended to be opaque, a magic cookie.
   * It's something that's easy to copy and paste.
   * Don't try to parse or create one of these.
   */
  static newSeed() {
    const ints: number[] = [];
    ints.push(Date.now() | 0);
    ints.push(this.#nextSeedInt++ | 0);
    ints.push((Math.random() * 2 ** 31) | 0);
    ints.push((performance.now() * 10000) | 0);
    const seed = JSON.stringify(ints);
    return seed;
  }
  /**
   * Create a new random number generator based on a string.
   * The result will be repeatable.
   * I.e. the same input will always lead the the same random number generator.
   * @param s Any string is acceptable.
   * This can include random things like "try again 27".
   *
   * And it can include special things like "[1,2,3,4]" which are generated by this library.
   * randomNumberGenerator.currentSeed() will return a seed that can be used to clone the random number generator in its current state.
   * @returns A new random number generator.
   */
  static fromString(s: string): RandomFunction {
    try {
      return this.create(s);
    } catch {
      return this.create(this.anyStringToSeed(s));
    }
  }
  /**
   *
   * @param input Any string is valid.
   * Reasonable inputs include "My game", "My game 32", "My game 33", "在你用中文测试过之前你还没有测试过它。".
   * I.e. you might just add or change one character, and you want to maximize the resulting change.
   */
  static anyStringToSeed(input: string): string {
    function rotateLeft32(value: number, shift: number): number {
      return ((value << shift) | (value >>> (32 - shift))) >>> 0;
    }
    const ints = [0x9e3779b9, 0x243f6a88, 0x85a308d3, 0x13198a2e];
    const data = new TextEncoder().encode(input);
    data.forEach((byte) => {
      ints[0] ^= byte;
      ints[0] = rotateLeft32(ints[0], 3);
      ints[1] ^= byte;
      ints[1] = rotateLeft32(ints[1], 5);
      ints[2] ^= byte;
      ints[2] = rotateLeft32(ints[2], 7);
      ints[3] ^= byte;
      ints[3] = rotateLeft32(ints[3], 11);
    });
    // Final mixing step
    ints[0] ^= rotateLeft32(ints[1], 7);
    ints[1] ^= rotateLeft32(ints[2], 11);
    ints[2] ^= rotateLeft32(ints[3], 13);
    ints[3] ^= rotateLeft32(ints[0], 17);
    return JSON.stringify(ints);
  }
  static test() {
    const maxGenerators = 10;
    const iterationsPerCycle = 20;
    const generators = [this.create()];
    while (generators.length <= maxGenerators) {
      for (let iteration = 0; iteration < iterationsPerCycle; iteration++) {
        const results = generators.map((generator) => generator());
        for (let i = 1; i < results.length; i++) {
          if (results[i] !== results[0]) {
            debugger;
            throw new Error("wtf");
          }
        }
      }
      const currentSeed = pick(generators).currentSeed;
      generators.forEach((generator) => {
        if (generator.currentSeed != currentSeed) {
          debugger;
          throw new Error("wtf");
        }
      });
      generators.push(this.create(currentSeed)!);
    }
  }
  // MARK: Self test

  /**
   * Checks this class against phil-lib 1.8.1, the version it was copied from.
   * Two kinds of check:
   * * **Quiet:**  only `create()` with no seed should write to the console,
   *   because only then is there a seed worth recording.
   * * **Repeatable:**  the same seed must give the same numbers, forever.  The
   *   expected values below were recorded from phil-lib 1.8.1.  Never change
   *   them; if a test fails, the code is wrong.
   *
   * Prints each case, then a summary.  Failures go to `console.error`.
   */
  static selfTest(): void {
    const problems: string[] = [];
    /** Run `action`, and count what it writes to the console.  It still gets written. */
    function countMessages(action: () => void): number {
      const methods = ["log", "info", "debug", "warn", "error"] as const;
      const originals = methods.map((method) => console[method]);
      let count = 0;
      methods.forEach((method, index) => {
        console[method] = (...args: unknown[]) => {
          count++;
          originals[index].apply(console, args);
        };
      });
      try {
        action();
      } finally {
        methods.forEach((method, index) => (console[method] = originals[index]));
      }
      return count;
    }
    function expectMessages(name: string, expected: number, action: () => void) {
      const count = countMessages(action);
      if (count !== expected) {
        problems.push(`${name} wrote ${count} console message${count === 1 ? "" : "s"}, expected ${expected}.`);
      }
    }
    function expectSame(name: string, actual: unknown, expected: unknown) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        problems.push(`${name}:  got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}.`);
      }
    }
    const draw = (random: () => number, count: number) =>
      Array.from({ length: count }, () => random());

    // MARK: Quiet
    console.log("Random case 1.  This should record the seed.");
    expectMessages("Random.create()", 1, () => Random.create());
    console.log("Random case 2.  This should run silently.");
    expectMessages('Random.create("[1,2,3,4]")', 0, () => Random.create("[1,2,3,4]"));
    console.log("Random case 3.  This should also run silently.");
    expectMessages('Random.fromString("Random case 3")', 0, () =>
      Random.fromString("Random case 3"),
    );
    console.log("Random case 4.  Random.seedIsValid(), also silent.");
    expectMessages('Random.seedIsValid("hello")', 0, () => Random.seedIsValid("hello"));

    // MARK: Repeatable
    // Everything below is checked silently, so it must not print anything either.
    expectMessages("the repeatability checks", 0, () => {
      const fromSeed = Random.create("[42,17,99,7]");
      expectSame('Random.create("[42,17,99,7]")', draw(fromSeed, 5), [
        1.5366822481155396e-8, 2.1327286958694458e-7, 0.435058941366151,
        0.7251853088382632, 0.7317605882417411,
      ]);
      expectSame("its currentSeed after 5", fromSeed.currentSeed, "[1892747913,1308741698,295958450,12]");
      // Used by makePolygon() in fourier-shared.ts, so it's in finished videos.
      expectSame('Random.fromString("My seed 2025")', draw(Random.fromString("My seed 2025"), 5), [
        0.9786544013768435, 0.7879613474942744, 0.050264536403119564,
        0.07471863739192486, 0.040992809226736426,
      ]);
      expectSame('Random.anyStringToSeed("My seed 2025")', Random.anyStringToSeed("My seed 2025"),
        "[-1446261746,783903852,-1683271991,570679246]");
      expectSame("Random.anyStringToSeed(Chinese)",
        Random.anyStringToSeed("在你用中文测试过之前你还没有测试过它。"),
        "[-978814459,-622026031,56408694,127018260]");
      // A string that is already a seed is used as is.
      expectSame('Random.fromString("[1,2,3,4]")', draw(Random.fromString("[1,2,3,4]"), 3), [
        1.6298145055770874e-9, 7.916241884231567e-9, 0.01318361610174179,
      ]);
      for (const [seed, valid] of [
        ["[1,2,3,4]", true],
        ["hello", false],
        ["[1,2,3]", false],
        ['["a",2,3,4]', false],
        // Odd, but phil-lib 1.8.1 accepts it, so keep accepting it.
        ["[1.5,2,3,4]", true],
      ] as const) {
        expectSame(`Random.seedIsValid(${JSON.stringify(seed)})`, Random.seedIsValid(seed), valid);
      }
      // A clone made from currentSeed carries on exactly where the original is.
      const original = Random.create("[5,6,7,8]");
      draw(original, 7);
      const clone = Random.create(original.currentSeed);
      expectSame("a clone from currentSeed", draw(clone, 5), draw(original, 5));
    });

    if (problems.length === 0) {
      console.log("Random done:  all passed.");
    } else {
      console.error(`Random done:  ${problems.length} problem${problems.length === 1 ? "" : "s"}.\n  ${problems.join("\n  ")}`);
    }
  }
}

Random.selfTest();
