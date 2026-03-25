export {};

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
