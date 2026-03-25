import { initializedArray } from "phil-lib/misc";
import { zipper } from "./zipper";

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
