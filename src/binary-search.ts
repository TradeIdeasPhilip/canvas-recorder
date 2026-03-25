import { count, initializedArray, Iterableify } from "phil-lib/misc";

// type Widen<K> = K extends number
//   ? number
//   : K extends bigint
//     ? bigint
//     : K extends string
//       ? string
//       : K;

// type Extractor<T, K> =
//   | keyof {
//       [P in keyof T as T[P] extends K ? P : never]: unknown;
//     }
//   | ((item: T) => K);

// /**
//  * For ease of use a lot of functions take in the same options for a key extractor.
//  * This function takes those options and converts them into a function.
//  * @param extractor A function, a field name, an index number, or undefined
//  * @returns Depending on the input this returns
//  * * The original function as is,
//  * * A function that will look up the given field name of an object.
//  * * A function that will look up the given index of an array.
//  * * Or `undefined` means that the item is the key, so we return the identity function.
//  */
// function makeExtractor<T, K extends number | bigint | string>(
//   extractor: Extractor<T, K> | undefined,
// ): (item: T) => K {
//   const result: (item: T) => K =
//     extractor === undefined
//       ? (item) => item as unknown as K
//       : typeof extractor === "function"
//         ? extractor
//         : (item) => (item as any)[extractor] as K;
//   return result;
// }

// /**
//  * Binary search helper — finds the rightmost index where (the key of array[i]) < searchKey.
//  * Returns -1 if no such index exists (i.e. array[0] >= searchKey or array is empty)
//  */
// export function findLastBefore<T, K extends number | bigint | string>(
//   array: readonly K[],
//   searchKey: K,
// ): number;
// export function findLastBefore<T, K extends number | bigint | string>(
//   array: readonly T[],
//   searchKey: K,
//   extractor: Extractor<T, Widen<K>>,
// ): number;
// export function findLastBefore<T, K extends number | bigint | string>(
//   array: readonly T[],
//   searchKey: K,
//   extractor?: Extractor<T, K>,
// ): number {
//   const getKey = makeExtractor(extractor);
//   let left = 0;
//   let right = array.length - 1;
//   let result = -1;

//   while (left <= right) {
//     const mid = left + Math.floor((right - left) / 2);
//     if (getKey(array[mid]) < searchKey) {
//       result = mid;
//       left = mid + 1;
//     } else {
//       right = mid - 1;
//     }
//   }

//   return result;
// }

// /**
//  * Binary search — finds the rightmost index where (the key of array[i]) <= searchKey
//  * Returns -1 if no such index exists (i.e. all elements > searchKey or array is empty)
//  */
// export function findLastBeforeOrMatch<T, K extends number | bigint | string>(
//   array: readonly K[],
//   searchKey: K,
// ): number;
// export function findLastBeforeOrMatch<T, K extends number | bigint | string>(
//   array: readonly T[],
//   searchKey: K,
//   extractor: Extractor<T, Widen<K>>,
// ): number;
// export function findLastBeforeOrMatch<T, K extends number | bigint | string>(
//   array: readonly T[],
//   searchKey: K,
//   extractor?: Extractor<T, K>,
// ): number {
//   const getKey = makeExtractor(extractor);
//   let left = 0;
//   let right = array.length - 1;
//   let result = -1;

//   while (left <= right) {
//     const mid = left + Math.floor((right - left) / 2);
//     if (getKey(array[mid]) <= searchKey) {
//       result = mid;
//       left = mid + 1;
//     } else {
//       right = mid - 1;
//     }
//   }

//   return result;
// }

// /**
//  * Returns the index of the **last** item whose key exactly equals searchKey,
//  * or -1 if no exact match exists.
//  */
// export function findLastMatch<T, K extends number | bigint | string>(
//   array: readonly T[],
//   searchKey: K,
//   extractor?: Extractor<T, K>,
// ): number {
//   const getKey = makeExtractor(extractor);
//   const idx = findLastBeforeOrMatch(array, searchKey, getKey);
//   if (idx === -1) return -1;
//   return getKey(array[idx]) == searchKey ? idx : -1;
// }

// /**
//  * Returns the index of the **first** item whose key exactly equals searchKey,
//  * or -1 if no exact match exists.
//  */
// export function findFirstMatch<T, K extends number | bigint | string>(
//   array: readonly T[],
//   searchKey: K,
//   extractor?: Extractor<T, K>,
// ): number {
//   const getKey = makeExtractor(extractor);
//   let left = 0;
//   let right = array.length - 1;
//   let result = -1;

//   while (left <= right) {
//     const mid = left + Math.floor((right - left) / 2);
//     const key = getKey(array[mid]);
//     if (key == searchKey) {
//       result = mid;
//       right = mid - 1; // keep looking left for earlier match
//     } else if (key < searchKey) {
//       left = mid + 1;
//     } else {
//       right = mid - 1;
//     }
//   }

//   return result;
// }

// /**
//  * Returns the smallest index i such that getKey(array[i]) > searchKey,
//  * or array.length if no such element exists.
//  */
// // Direct keys — no extractor, searchKey can be literal
// export function findFirstAfter<K extends number | bigint | string>(
//   array: readonly K[],
//   searchKey: K,
// ): number;

// // Objects — extractor required, widen searchKey so K stays broad
// export function findFirstAfter<T, K extends number | bigint | string>(
//   array: readonly T[],
//   searchKey: K,
//   extractor: Extractor<T, Widen<K>>,
// ): number;

// // Implementation (widest)
// export function findFirstAfter<T, K extends number | bigint | string>(
//   array: readonly T[],
//   searchKey: K,
//   extractor?: Extractor<T, K>,
// ): number {
//   const getKey = makeExtractor(extractor);
//   let left = 0;
//   let right = array.length - 1;
//   let result = array.length;

//   while (left <= right) {
//     const mid = left + Math.floor((right - left) / 2);
//     if (getKey(array[mid]) > searchKey) {
//       result = mid;
//       right = mid - 1;
//     } else {
//       left = mid + 1;
//     }
//   }

//   return result;
// }

// /**
//  * Returns the smallest index i such that getKey(array[i]) >= searchKey,
//  * or array.length if no such element exists.
//  *
//  * Examples:
//  *   [10,20,30], 20          → 1
//  *   [10,10,20,20,30,30], 20 → 2  (first 20)
//  *   [10,10,20,20,30,30], 15 → 2
//  *   [2,4,6], 8              → 3
//  *   [2,4,6], 1              → 0
//  *   [], 8                   → 0
//  */
// export function findFirstAfterOrMatch<T, K extends number | bigint | string>(
//   array: readonly T[],
//   searchKey: K,
//   extractor?: Extractor<T, K>,
// ): number {
//   const getKey = makeExtractor(extractor);
//   let left = 0;
//   let right = array.length - 1;
//   let result = array.length;

//   while (left <= right) {
//     const mid = left + Math.floor((right - left) / 2);
//     if (getKey(array[mid]) >= searchKey) {
//       result = mid;
//       right = mid - 1;
//     } else {
//       left = mid + 1;
//     }
//   }

//   return result;
// }

// function test() {
//   /**
//    * 0...6
//    */
//   const numberKeys = initializedArray(7, (n) => n);
//   const numberValues = [1, 3, 3, 3, 5];
//   const bigIntKeys = numberKeys.map((number) => BigInt(number));
//   const bigIntValues = numberValues.map((number) => BigInt(number));
//   const stringKeys = numberKeys.map((number) =>
//     String.fromCharCode(number + 65),
//   );
//   const stringValues = numberValues.map((number) =>
//     String.fromCharCode(number + 65),
//   );
//   console.log({
//     numberKeys,
//     numberValues,
//     bigIntKeys,
//     bigIntValues,
//     stringKeys,
//     stringValues,
//   });

//   const functions = new Map([
//     [findLastBefore, [-1, -1, 0, 0, 3, 3, 4]],
//     [findLastBeforeOrMatch, [-1, 0, 0, 3, 3, 4, 4]],
//     [findLastMatch, [-1, 0, -1, 3, -1, 4, -1]],
//     [findFirstMatch, [-1, 0, -1, 1, -1, 4, -1]],
//     [findFirstAfter, [0, 1, 1, 4, 4, 5, 5]],
//     [findFirstAfterOrMatch, [0, 0, 1, 1, 4, 4, 5]],
//   ]);
//   functions.entries().forEach(([toCall, expectedResults]) => {
//     console.log(toCall.name);
//     const results = zip(numberKeys, expectedResults)
//       .map(([searchKey, expectedIndex]) => {
//         const index = toCall(numberValues, searchKey);
//         if (index != expectedIndex) {
//           throw new Error("test failed");
//         }
//         const value: number | undefined = numberValues[index];
//         return { searchKey, value, index };
//       })
//       .toArray();
//     console.table(results);
//     const r1 = zip(bigIntKeys, expectedResults)
//       .map(([searchKey, expectedIndex]) => {
//         const index = toCall(bigIntValues, searchKey);
//         if (index != expectedIndex) {
//           throw new Error("test failed");
//         }
//         const value: BigInt | undefined = bigIntValues[index];
//         return { searchKey, value, index };
//       })
//       .toArray();
//     console.table(r1);
//     const r2 = zip(stringKeys, expectedResults)
//       .map(([searchKey, expectedIndex]) => {
//         const index = toCall(stringValues, searchKey);
//         if (index != expectedIndex) {
//           throw new Error("test failed");
//         }
//         const value: string | undefined = stringValues[index];
//         return { searchKey, value, index };
//       })
//       .toArray();
//     console.table(r2);
//   });
// }

// test();

type Key = number | BigInt;

export class BinarySearcher<T> {
  /**
   *
   * @param array The array to search.
   * @param getKey Given an entry in this array as input, this will extract and return the key used for sorting.
   */
  constructor(
    public readonly array: readonly T[],
    protected readonly getKey: (record: T) => Key,
  ) {}
  /**
   *
   * @param array An array of numbers.
   * @returns A new `BinarySearcher` that uses the array values as their own keys.
   */
  static simple<T extends Key>(array: readonly T[]) {
    return new this(array, (x) => x);
  }
  /**
   *
   * @param array An array of objects.
   * @param fieldName The name of the field of these objects to sort on.
   * The field must be of type number or BigInt.
   * @returns A new `BinarySearcher` that uses the given field name to extract key values.
   */
  // static keyField<
  //   FieldName extends string,
  //   T extends T[FieldName] extends Key ? any : never,
  // >(array: readonly T[], fieldName: FieldName) {
  //   return new this(array, (record) => record[fieldName]);
  // }
  static keyField<
    T,
    FieldName extends keyof {
      [P in keyof T as T[P] extends Key ? P : never]: unknown;
    },
  >(array: readonly T[], fieldName: FieldName) {
    return new this(array, (record) => record[fieldName] as Key);
  }
  /**
   * Finds the rightmost index where (the key of array[i]) < searchKey.
   * Returns -1 if no such index exists (i.e. the key of array[0] >= searchKey or array is empty)
   */
  lastBefore(searchKey: Key): number {
    const { array, getKey } = this;
    let left = 0;
    let right = array.length - 1;
    let result = -1;
    while (left <= right) {
      const mid = left + Math.floor((right - left) / 2);
      if (getKey(array[mid]) < searchKey) {
        result = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return result;
  }
  /**
   * Binary search — finds the rightmost index where (the key of array[i]) <= searchKey
   * Returns -1 if no such index exists (i.e. all elements > searchKey or array is empty)
   */
  lastBeforeOrMatch(searchKey: Key): number {
    const { array, getKey } = this;
    let left = 0;
    let right = array.length - 1;
    let result = -1;
    while (left <= right) {
      const mid = left + Math.floor((right - left) / 2);
      if (getKey(array[mid]) <= searchKey) {
        result = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return result;
  }
  /**
   * Returns the index of the **last** item whose key exactly equals searchKey,
   * or -1 if no exact match exists.
   */
  lastMatch(searchKey: Key): number {
    const idx = this.lastBeforeOrMatch(searchKey);
    if (idx === -1) return -1;
    const { array, getKey } = this;
    return getKey(array[idx]) == searchKey ? idx : -1;
  }
  /**
   * Returns the index of the **first** item whose key exactly equals searchKey,
   * or -1 if no exact match exists.
   */
  firstMatch(searchKey: Key): number {
    const { array, getKey } = this;
    let left = 0;
    let right = array.length - 1;
    let result = -1;
    while (left <= right) {
      const mid = left + Math.floor((right - left) / 2);
      const key = getKey(array[mid]);
      if (key == searchKey) {
        result = mid;
        right = mid - 1; // keep looking left for earlier match
      } else if (key < searchKey) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return result;
  }
  /**
   * Returns the smallest index i such that getKey(array[i]) > searchKey,
   * or array.length if no such element exists.
   */
  firstAfter(searchKey: Key): number {
    const { array, getKey } = this;
    let left = 0;
    let right = array.length - 1;
    let result = array.length;
    while (left <= right) {
      const mid = left + Math.floor((right - left) / 2);
      if (getKey(array[mid]) > searchKey) {
        result = mid;
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    return result;
  }
  /**
   * Returns the smallest index i such that getKey(array[i]) >= searchKey,
   * or array.length if no such element exists.
   *
   * Examples:
   *   [10,20,30], 20          → 1
   *   [10,10,20,20,30,30], 20 → 2  (first 20)
   *   [10,10,20,20,30,30], 15 → 2
   *   [2,4,6], 8              → 3
   *   [2,4,6], 1              → 0
   *   [], 8                   → 0
   */
  firstAfterOrMatch(searchKey: Key): number {
    const { array, getKey } = this;
    let left = 0;
    let right = array.length - 1;
    let result = array.length;
    while (left <= right) {
      const mid = left + Math.floor((right - left) / 2);
      if (getKey(array[mid]) >= searchKey) {
        result = mid;
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    return result;
  }
  /**
   * Iterate over the elements of this array.
   * Start from the very first occurrence of the key.
   * If the key is not present, start at the first item that should follow the key.
   *
   * Each iteration will yield an object with the following properties.
   * * `index`: the index into the original array.  This will increment each time through.
   * * `value`: the value found at that index in the array.
   * * `source`: `this` object.  Corresponds to the `array` property in `foreach()`.
   * * `stop`: a function that will stop this iterator.
   *
   * This uses the obvious implementation, storing the current index and comparing that to the array length each time.
   * If you delete the current element from the array, or similar, that can cause the iterator to "act funny."
   * If you need to delete the current element, consider {@link iterateBackwardFrom} or {@link iterateBackwardFromBefore}.
   * Appending to the end of the array will never cause a problem; iterators can continue reading indefinitely.
   * @param key Start here.
   */
  *iterateFrom(key: Key) {
    const array = this.array;
    let stopEarly = false;
    for (
      let index = this.firstAfterOrMatch(key);
      index < array.length && !stopEarly;
      index++
    ) {
      const value = array[index];
      const source: BinarySearcher<T> = this;
      function stop() {
        stopEarly = true;
      }
      yield { index, value, source, stop };
    }
  }
  /**
   * Iterate over the elements of this array.
   * Start at the first item that should follow the key.
   *
   * Each iteration will yield an object with the following properties.
   * * `index`: the index into the original array.  This will increment each time through.
   * * `value`: the value found at that index in the array.
   * * `source`: `this` object.  Corresponds to the `array` property in `foreach()`.
   * * `stop`: a function that will stop this iterator.
   *
   * This uses the obvious implementation, storing the current index and comparing that to the array length each time.
   * If you delete the current element from the array, or similar, that can cause the iterator to "act funny."
   * If you need to delete the current element, consider {@link iterateBackwardFrom} or {@link iterateBackwardFromBefore}.
   * Appending to the end of the array will never cause a problem; iterators can continue reading indefinitely.
   * @param key Start here.
   */
  *iterateFromAfter(key: Key) {
    const array = this.array;
    let stopEarly = false;
    for (
      let index = this.firstAfter(key);
      index < array.length && !stopEarly;
      index++
    ) {
      const value = array[index];
      const source: BinarySearcher<T> = this;
      function stop() {
        stopEarly = true;
      }
      yield { index, value, source, stop };
    }
  }
  /**
   * Iterate over the elements of this array.
   * Start from the very last occurrence of the key.
   * If the key is not present, start at the first item that should come before the key.
   *
   * Each iteration will yield an object with the following properties.
   * * `index`: the index into the original array.  This will **decrease** each time through.
   * * `value`: the value found at that index in the array.
   * * `source`: `this` object.  Corresponds to the `array` property in `foreach()`.
   * * `stop`: a function that will stop this iterator.
   *
   * This uses the obvious implementation, storing the current index.
   * It is perfectly acceptable to delete the current element of the array from this iterator.
   * Inserting or deleting elements **before** the current element could cause things to act funny but the current index and after are fair game.
   * @param key Start here.
   */
  *iterateBackwardFrom(key: Key) {
    const array = this.array;
    let stopEarly = false;
    for (
      let index = this.lastBeforeOrMatch(key);
      index >= 0 && !stopEarly;
      index--
    ) {
      const value = array[index];
      const source: BinarySearcher<T> = this;
      function stop() {
        stopEarly = true;
      }
      yield { index, value, source, stop };
    }
  }
  /**
   * Iterate over the elements of this array.
   * Start at the last item that should come before the key.
   *
   * Each iteration will yield an object with the following properties.
   * * `index`: the index into the original array.  This will **decrease** each time through.
   * * `value`: the value found at that index in the array.
   * * `source`: `this` object.  Corresponds to the `array` property in `foreach()`.
   * * `stop`: a function that will stop this iterator.
   *
   * This uses the obvious implementation, storing the current index.
   * It is perfectly acceptable to delete the current element of the array from this iterator.
   * Inserting or deleting elements **before** the current element could cause things to act funny but the current index and after are fair game.
   * @param key Start here.
   */
  *iterateBackwardFromBefore(key: Key) {
    const array = this.array;
    let stopEarly = false;
    for (let index = this.lastBefore(key); index >= 0 && !stopEarly; index--) {
      const value = array[index];
      const source: BinarySearcher<T> = this;
      function stop() {
        stopEarly = true;
      }
      yield { index, value, source, stop };
    }
  }
  static test() {
    /**
     * 0...6
     */
    const searchKeys = initializedArray(7, (n) => n);
    const values = [1, 3, 3, 3, 5];
    const searcher = BinarySearcher.simple(values);
    /**
     * Method name → expected output.
     */
    const functions = new Map([
      ["lastBefore", [-1, -1, 0, 0, 3, 3, 4]],
      ["lastBeforeOrMatch", [-1, 0, 0, 3, 3, 4, 4]],
      ["lastMatch", [-1, 0, -1, 3, -1, 4, -1]],
      ["firstMatch", [-1, 0, -1, 1, -1, 4, -1]],
      ["firstAfter", [0, 1, 1, 4, 4, 5, 5]],
      ["firstAfterOrMatch", [0, 0, 1, 1, 4, 4, 5]],
    ] as const);
    functions.entries().forEach(([toCall, expectedResults]) => {
      console.log(toCall);
      const results = zipper([searchKeys, expectedResults])
        .map(([searchKey, expectedIndex]) => {
          const index = searcher[toCall](searchKey);
          if (index != expectedIndex) {
            throw new Error("test failed");
          }
          const value: number | undefined = values[index];
          return { searchKey, value, index };
        })
        .toArray();
      console.table(results);
    });

    {
      /**
       * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Generator
       */
      const generator = BinarySearcher.keyField(
        [
          { key: 1, value: "one" },
          { key: 2, value: "two" },
          { key: 3, value: "three" },
          { key: 4, value: "four" },
          { key: 5, value: "five" },
        ],
        "key",
      ).iterateFrom(2);
      const iteratorStopResult = generator
        .map(({ value, stop }) => {
          if (value.key >= 3) {
            stop();
          }
          return value.value;
        })
        .toArray();
      const expectedResult = ["two", "three"];
      if (
        zipper([expectedResult, iteratorStopResult]).some(([a, b]) => {
          return a != b;
        })
      ) {
        console.error({ iteratorStopResult, expectedResult });
        throw new Error("wtf");
      }
    }
  }
}

export class BinaryInserter<T> extends BinarySearcher<T> {
  constructor(
    getKey: (record: T) => Key,
    private writableArray: T[] = [],
  ) {
    super(writableArray, getKey);
  }
  static simple<T extends Key>(writableArray: T[]) {
    return new this((x) => x, writableArray);
  }
  static keyField<
    T,
    FieldName extends keyof {
      [P in keyof T as T[P] extends Key ? P : never]: unknown;
    },
  >(writableArray: T[], fieldName: FieldName) {
    return new this((record) => record[fieldName] as Key, writableArray);
  }
  push(...items: T[]) {
    const { getKey, writableArray } = this;
    items.forEach((item) => {
      const key = getKey(item);
      const lastBeforeOrMatch = this.lastBeforeOrMatch(key);
      const insertPos = lastBeforeOrMatch + 1;
      writableArray.splice(insertPos, 0, item);
    });
  }
  unshift(...items: T[]) {
    const { getKey, writableArray } = this;
    items.forEach((item) => {
      const key = getKey(item);
      const lastBefore = this.lastBefore(key);
      const insertPos = lastBefore + 1;
      writableArray.splice(insertPos, 0, item);
    });
  }
  static test() {
    const myArray = [
      { key: 1, value: "a" },
      { key: 3, value: "c" },
      { key: 3, value: "d" },
      { key: 3, value: "e" },
      { key: 5, value: "g" },
    ];
    const tester = this.keyField(myArray, "key");
    tester.push({ key: 3, value: "F" });
    tester.unshift({ key: 3, value: "B" });
    tester.push({ key: -3, value: "@" }, { key: 23, value: "H" });
    const summary = myArray.map((row) => row.value).join("");
    console.log(summary);
    if (summary != "@aBcdeFgH") {
      throw new Error("test failed");
    }
    console.log(tester.firstAfter(4));
  }
}

(window as any).BinarySearcher = BinarySearcher;
(window as any).BinaryInserter = BinaryInserter;
//BinarySearcher.test();
//BinaryInserter.test();

//function test(...args: [...number[], "marker", ...number[]]): void;
function test(...args: ["marker", ...number[]]): void;
function test(...args: [number, "marker", ...number[]]): void;
function test(...args: [number, number, "marker", ...number[]]): void;
// @ts-expect-error: This is what I actually want, but TypeScript says "A rest element cannot follow another rest element. ts1265".
function test(...args: [...number[], "marker", ...number[]]): void;
function test(...args: number[]): void;
function test(...args: (number | "marker")[]) {
  //args.forEach(...)
}

// I want this to compile:
test(1, 2, 3, 4, 5, "marker", 6, 7, 8, 8);
// And I want this to fail:
test(1, 2, 3, 4, 5, "marker", 6, "marker", 7, 8, 8);

function test1(a: number, b: string): void;
function test1(a: string, b: number): void;
function test1(a: number | string, b: number | string): void {}

// function testFromGrok(...args: [...number[], "marker", ...number[]]): void {
//   // Runtime enforcement that "marker" appears **exactly once**
//   const markerCount = args.filter((x) => x === "marker").length;
//   if (markerCount !== 1) {
//     throw new Error(`Expected exactly one "marker", but got ${markerCount}`);
//   }

//   // Your real implementation here
//   console.log("Valid call:", args);
// }

//type Recursive = []|[number,string,...Recursive]
const sample = [1, "one", 2, "two", 3, "three", 4, "four", 5, "five"] as const;

type Test<T> = T extends readonly []
  ? "yes"
  : T extends readonly [number, string, ...infer U]
    ? Test<U>
    : "no";

// These all work.  When I hover over No*, I see that the type is "no".
type Yes1 = Test<typeof sample>;
type Yes2 = Test<[number, string]>;
type Yes3 = Test<[1, "one"]>;
type No4 = Test<"what?">;
type No5 = Test<[1, "one", 1]>;
type No6 = Test<[1, "one"]>;
type Si7 = Test<[]> extends "yes" ? "sí" : "no";
type Never7 = Test<[]> extends "yes" ? "sí" : never;

type Test1<T> = Test<T> extends "yes" ? T : never;

// @ts-expect-error: It would be nice if this worked but Typescript complained about a recursive definition.
function f1<T extends Test1<T>>(...args: T[]) {}

// @ts-expect-error: 'infer' declarations are only permitted in the 'extends' clause of a conditional type.ts(1338)
function f2<T extends Test1<infer U>>(...args: U[]) {}

function f3(): void;
function f3(...args: [number, string]): void;
function f3(...args: [number, string, number, string]): void;
function f3(...args: [number, string, number, string, number, string]): void;
function f3(
  ...args: [number, string, number, string, number, string, number, string]
): void;
// And continue forever.  Any number of pairs of number,string.
function f3(...args: (number | string)[]) {
  if (args.length % 2 != 0) {
    throw new Error("Arguments should come in pairs!");
  }
  args.forEach((arg, index) => {
    const expected = index % 2 == 0 ? "number" : "string";
    if (typeof arg !== expected) {
      debugger;
      throw new Error("invalid argument type");
    }
  });
  if (args.length > 1000) {
    console.log("You win!!!");
  }
}

// type AlternatingNumberString<T extends readonly unknown[]> =
//   T extends readonly []
//     ? true
//     : T extends readonly [number, string, ...infer Rest]
//       ? AlternatingNumberString<Rest>
//       : false;

// // Helper to turn the boolean into a proper constraint
// type IsAlternatingNumberString<T extends readonly unknown[]> =
//   AlternatingNumberString<T> extends true ? T : never;

type AlternatingNumberString<T extends readonly unknown[]> =
  T extends readonly []
    ? true
    : T extends readonly [number, string, ...infer Rest]
      ? AlternatingNumberString<Rest>
      : `Error: Arguments must strictly alternate number → string. Got invalid shape at position ${T["length"]}`;

type IsAlternatingNumberString<T extends readonly unknown[]> =
  AlternatingNumberString<T> extends true ? T : AlternatingNumberString<T>;

function f<T extends readonly unknown[]>(
  ...args: T & IsAlternatingNumberString<T>
): void {
  // runtime check (optional but recommended)
  if (args.length % 2 !== 0) {
    throw new Error("Arguments should come in pairs!");
  }

  for (let i = 0; i < args.length; i += 2) {
    if (typeof args[i] !== "number" || typeof args[i + 1] !== "string") {
      throw new Error(
        "Arguments must alternate: number, string, number, string...",
      );
    }
  }

  console.log("Valid call with", args.length / 2, "pairs");
}

f();
// old error message
// @ts-ignore: Argument of type '[number, string, string, number]' is not assignable to parameter of type 'never'.ts(2345)
//f(1, "s", "s", 2);
f(1, "s", 2, "q", 3, "3");
// new error message
// @ts-ignore: f(...args: [number, string, number, string, number] & "Error: Arguments must strictly alternate number → string. Got invalid shape at position 1"): void
//f(1, "s", 3, "q", 4);

type ZeroOrOneMarkers<T extends readonly ("marker" | number)[]> = T extends
  | readonly number[]
  | readonly ["marker", ...number[]]
  ? true
  : T extends readonly [number, ...infer Rest extends ("marker" | number)[]]
    ? ZeroOrOneMarkers<Rest>
    : `Error: Expecting number[] or [...number[], "marker", ...number[]].`;

type HasZeroOrOneMarkers<T extends readonly ("marker" | number)[]> =
  ZeroOrOneMarkers<T> extends true ? T : ZeroOrOneMarkers<T>;

function markerTest<T extends readonly ("marker" | number)[]>(
  ...args: T & HasZeroOrOneMarkers<T>
) {}

// Idea:  Explicitly list some simpler options.
// So the auto complete will have more to work with.
// Other than that, these new declarations are all redundant.
// This is imperfect but it works.
// If I type a double quote, VS Code will suggest "marker".
// The documentation of `args` is *never* shown, so don't use it.
// VS Code will show the main part of the documentation,
// but it switches between the two versions at unpredictable and unhelpful times,
// so put the same documentation in both places.
/**
 * Provide a list of numbers with 0 or 1 instances of the string `"marker"`.
 * @param args
 */
function markerTest1(...args: [...number[], "marker"]): void;
/**
 * Provide a list of numbers with 0 or 1 instances of the string `"marker"`.
 * @param args
 */
function markerTest1<T extends readonly ("marker" | number)[]>(
  ...args: T & HasZeroOrOneMarkers<T>
): void;
function markerTest1<T extends readonly ("marker" | number)[]>(
  ...args: T & HasZeroOrOneMarkers<T>
) {}

// markerTest2 is just like markerTest1, with one improvement.
// Now, when I hit ctrl-space VS Code puts "marker" at the top of it's list of suggestions.
// In markerTest2 I didn't get that suggestion unless and until I hit the quote key.
type MarkerTest2<T extends readonly ("marker" | number)[]> =
  | [...number[], "marker"]
  | (T & HasZeroOrOneMarkers<T>);
/**
 * Provide a list of numbers with 0 or 1 instances of the string `"marker"`.
 */
function markerTest2<T extends readonly ("marker" | number)[]>(
  ...args: MarkerTest2<T>
) {}

// No better than Test2.
// Same general result, but takes more code.
type MarkerTest3<T extends readonly ("marker" | number)[]> =
  | number[]
  | ["marker", ...number[]]
  | [number, "marker", ...number[]]
  | [number, number, "marker", ...number[]]
  | [number, number, number, "marker", ...number[]]
  | (T & HasZeroOrOneMarkers<T>);
/**
 * Provide a list of numbers with 0 or 1 instances of the string `"marker"`.
 */
function markerTest3<T extends readonly ("marker" | number)[]>(
  ...args: MarkerTest3<T>
) {}

// No improvement.
// This does not cover all cases, but it's an interesting test.
type MarkerTest4 =
  | number[]
  | ["marker", ...number[]]
  | [number, "marker", ...number[]]
  | [number, number, "marker", ...number[]]
  | [number, number, number, "marker", ...number[]];
/**
 * Provide a list of numbers with 0 or 1 instances of the string `"marker"`.
 */
function markerTest4<T extends readonly ("marker" | number)[]>(
  ...args: MarkerTest4
) {}

// Similar to MarkerTest4 but more verbose and that's bad.
// Better to say "MarkerTest4" in the pop up documentation than the entire list.
// But, there is an improvement.
// If I type ctrl-space, markerTest5 will only suggest "marker" when it makes sense.
// I.e. never more than once.
// markerTest4() and markerTest3() both suggest "marker" any time I hit ctrl-space.
// They all report the error, but only markerTest4() and markerTest3() suggest the error.
// I'm talking about right after and open parenthesis or a comma;
// All three will suggest "marker" after an open quote.
function markerTest5<T extends readonly ("marker" | number)[]>(
  ...args:
    | number[]
    | ["marker", ...number[]]
    | [number, "marker", ...number[]]
    | [number, number, "marker", ...number[]]
    | [number, number, number, "marker", ...number[]]
) {}

markerTest(1, 2, 3, 4, 5, "marker", 6, 7, 8, 8);
// @ts-expect-error:  And I want this to fail:
markerTest(1, 2, 3, 4, 5, "marker", 6, "marker", 7, 8, 8);
markerTest(1, 2, 3, "marker");
markerTest(1, 2, 3);

markerTest1(1, 2, 3, "marker", 3, 3, 4, 5);
markerTest1(1, 2, "marker");
markerTest1(1, 2);
markerTest1();

markerTest2("marker", 1, 2, 3);
// @ts-expect-error:  And I want this to fail:
markerTest2("marker", "marker");
markerTest2("marker");

markerTest3(1, 2, "marker");

markerTest4("marker");
markerTest5(1, 2, "marker", 3);

type QQQ = [number] extends [] ? "yes" : "no";

//type SSS<MaxCount extends number, T>=T extends 0?[]:(SSS<MaxCount-1,T>);
type RRR<count, T extends unknown[]> = count extends T["length"]
  ? "done"
  : "recurse";
type r4 = RRR<4, [number, number, number, number]>;

/**
 * Given a `MaxLength` and `ItemType`, return a tuple requiring between 0 and `MaxLength` instances of `ItemType`.
 *
 * RepeatUpTo<2, number> = [] | [number] | [number, number]
 */
type RepeatUpTo<
  MaxLength,
  ItemType,
  NextTupleType extends ItemType[] = [],
  UnionSoFar = never,
> = MaxLength extends NextTupleType["length"]
  ? UnionSoFar | NextTupleType
  : RepeatUpTo<
      MaxLength,
      ItemType,
      [ItemType, ...NextTupleType],
      NextTupleType | UnionSoFar
    >;
type RR0 = RepeatUpTo<0, number>;
type RR1 = RepeatUpTo<1, number>;
type RR2 = RepeatUpTo<2, number>;
type RR4 = RepeatUpTo<4, number>;
type RR8 = RepeatUpTo<8, number>;

function markerTest6<MaxPreCount extends number = 5>(
  ...args:
    | number[]
    | [...RepeatUpTo<MaxPreCount, number>, "marker", ...number[]]
) {}

// Type instantiation is excessively deep and possibly infinite.ts(2589)
//markerTest6(6,7,8, "marker", 9, );

type RepeatExactly<
  MaxLength,
  ItemType = number,
  NextTupleType extends ItemType[] = [],
> = MaxLength extends NextTupleType["length"]
  ? NextTupleType
  : RepeatExactly<MaxLength, ItemType, [ItemType, ...NextTupleType]>;

type RE0 = RepeatExactly<0, null>;
type RE1 = RepeatExactly<1, null>;
type RE2 = RepeatExactly<2, null>;
type RE4 = RepeatExactly<4, null>;
type RE8 = RepeatExactly<8, null>;
type RE16 = RepeatExactly<16, null>;

function markerTest7<BeforeCount = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7>(
  ...args: number[] | [...RepeatExactly<BeforeCount>, "marker", ...number[]]
) {}

markerTest7(13, 12, 12, "marker", 23, 34);
markerTest7(13, 12, 12, 4, 5, 6, 7, "marker", 23, 34);

function markerTest8(values: number[], additionalValues?: number[]) {}
markerTest8([1, 2, 4], [3]);

type X = never | number;
//type StackOverflow<T> = 1 extends number? StackOverflow<T | [T]>:[];

/**
 * Given a list of iterables, make a single iterable.
 * The resulting iterable will yield a series of arrays.
 * The first entry in the output will contain the first entry in each of the inputs.
 * The nth entry in the output will contain the nth entry in each of the inputs.
 * This will stop iterating when the first of the inputs runs out of data.
 *
 * Notice the two sets of inputs.
 * When we stop we check to make sure that *all* of `mustFinish` are out of data.
 * We are effectively asserting that all of those inputs have the same number of elements.
 * In practice I often zip two or more arrays with the assumption they all match.
 *
 * The inputs in `support` can end with those in `mustFinish` or they can continue.
 * A common use of this is the `count()` function.
 * With the default arguments it will count from 0 to infinity.
 * This is useful in a `for(of)` loop, to match the `index` argument of `forEach()` or `map()`.
 *
 * ```
 *   for (const [rowHeader, rowBody, i] of zipper([sharedStuff.rowHeaders, thisTable.rowBodies], [count()])) {
 *     ...
 *   }
 * ```
 *
 * or
 *
 * ```
 *   zipper([sharedStuff.rowHeaders, thisTable.rowBodies]).forEach(([rowHeader,rowBody], i) => {
 *     ...
 *   }
 * ```
 * @param mustFinish Any number of iterables.
 * If any of the iterables still has data when we stop, we throw an `Error`.
 * @param support Any number of iterables.
 */
function* zipper<T extends Array<any>, U extends Array<any>>(
  mustFinish: Iterableify<T>,
  support: Iterableify<U> = [] as Iterableify<U>,
): Generator<[...T, ...U]> {
  // Get iterators for all of the iterables.
  const iterators = [...mustFinish, ...support].map((i) =>
    i[Symbol.iterator](),
  );
  while (true) {
    // Advance all of the iterators.
    const results = iterators.map((i) => i.next());

    // If any of the iterators are done, we should stop.
    if (results.some(({ done }) => done)) {
      if (results.slice(0, mustFinish.length).some(({ done }) => !done)) {
        //console.error(results, mustFinish.length);
        throw new Error("wtf");
      }
      break;
    }

    // We can assert the yield type, since we know none
    // of the iterators are done.
    yield results.map(({ value }) => value) as [...T, ...U];
  }
}

try {
  const result = zipper([new Map().entries(), [1, 2, 3]], []).toArray();
  console.error("should have thrown but returned:", result);
} catch (reason: unknown) {
  console.log("threw as expected", reason);
}
try {
  const result = zipper(
    [
      [15, 25],
      ["A", "B", "C"],
    ],
    [count()],
  ).toArray();
  console.error("should have thrown but returned:", result);
} catch (reason: unknown) {
  console.log("threw as expected", reason);
}
try {
  const result = zipper(
    [
      [15, 25, 35],
      ["A", "B"],
    ],
    [count()],
  ).toArray();
  console.error("should have thrown but returned:", result);
} catch (reason: unknown) {
  console.log("threw as expected", reason);
}
try {
  const result = zipper(
    [
      [15, 25, 35],
      ["A", "B", "C"],
    ],
    [count(0, 1)],
  ).toArray();
  console.error("should have thrown but returned:", result);
} catch (reason: unknown) {
  console.log("threw as expected", reason);
}
try {
  const result = [
    zipper([
      [10, 20, 30],
      ["a", "b", "c"],
    ]).toArray(),
  ];
  result.push(
    zipper(
      [
        [15, 25, 35],
        ["A", "B", "C"],
      ],
      [count()],
    ).toArray(),
  );
  console.log("success", result);
} catch (reason: unknown) {
  console.error("unexpected error", reason);
}
