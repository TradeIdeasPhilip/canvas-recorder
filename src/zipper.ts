import { count, Iterableify } from "phil-lib/misc";

// This should eventually move to phil-lib.

// This is a slightly more powerful version of zip().
// zip(a, b, c,...) => zipper([], [a, b, c, ...])
// I'm thinking about making a single variadic function.
// So this new functionality can be named zip() without breaking old code.

type X = any[] extends [number] ? true : false;
type Y = any[] extends any[] ? true : false;

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
 * These can run longer.
 */
export function* zipper<T extends Array<any>, U extends Array<any> = []>(
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

function testZipper() {
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
    const result1 = zipper([
      [10, 20, 30],
      ["a", "b", "c"],
    ]).toArray();
    const result2 = zipper(
      [
        [15, 25, 35],
        ["A", "B", "C"],
      ],
      [count()],
    ).toArray();
    console.log("success", result1, result2);
  } catch (reason: unknown) {
    console.error("unexpected error", reason);
  }
}
