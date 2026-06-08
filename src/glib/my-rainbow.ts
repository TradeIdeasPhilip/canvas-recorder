type MyRainbow = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
] & {
  /**
   * Standard css red.  Full intensity.
   */
  readonly red: string;
  /**
   * Full intensity.
   *
   * Slightly different from css orange.
   */
  readonly orange: string;
  /**
   * A slightly darkened version of standard css yellow.
   *
   * You don't need the brightness on a black background.
   * And this makes things easier to read on a white background.
   */
  readonly yellow: string;
  /**
   * A slightly darkened version of standard css green.
   *
   * When you see the rainbow colors together, this makes them all look close to the same brightness.
   */
  readonly green: string;
  /**
   * A slightly darkened version of standard css cyan.
   *
   * When you see the rainbow colors together, this makes them all look close to the same brightness.
   */
  readonly cyan: string;
  /**
   * My favorite shade of blue.
   * A little bit on the green side of blue, full intensity.
   *
   * Known in older code as `BLUE`.
   * The normal css "blue", #0000FF, is way too dark for use on a black background.
   * This adds some green for a much brighter color.
   * Out of context I'd call this color blue.
   * And it looks good with css "red" and "white".
   * #ff0000 #ffffff #007fff
   */
  readonly myBlue: string;
  /**
   * Similar to standard css blue, but a little brighter and easier to read on a black background.
   *
   * To my eye this looks like the exact same shade as css blue.
   * I adjusted the numbers to keep that shade.
   * This is still a lot darker than `myBlue`, which is good because it keeps those colors distinct.
   */
  readonly cssBlue: string;
  /**
   * A dark, bluish shade of purple.  Full intensity.
   *
   * I can't find any good match with standard color names.
   * css violet is in the same general family.
   */
  readonly violet: string;
  /**
   * Standard css magenta.  Full intensity.
   */
  readonly magenta: string;
};

/**
 * These colors are all bright and distinct and all look good against a black or white background.
 * I hand picked these.
 *
 * Source:  https://tradeideasphilip.github.io/random-svg-tests/colors.html ,
 * https://github.com/TradeIdeasPhilip/random-svg-tests/commit/89a047a44b85186c940e004607f8dcb44b69fe42
 *
 * If you want readable black text on a colorful background, consider mixing these with white.
 * [Example](https://github.com/TradeIdeasPhilip/canvas-recorder/blob/b1a502e6bf2897d0c431aeef2322effde38bc934/dev/sound-explorer.ts#L128)
 */
export const myRainbow = (function () {
  const result = [
    "rgb(255, 0, 0)",
    "rgb(255, 128, 0)",
    "#d8d800",
    "#0e0",
    "#00d8d8",
    "rgb(0, 128, 255)",
    "rgb(32, 64, 255)",
    "rgb(128, 0, 255)",
    "rgb(255, 0, 255)",
  ] as any;
  result.red = result[0];
  result.orange = result[1];
  result.yellow = result[2];
  result.green = result[3];
  result.cyan = result[4];
  result.myBlue = result[5];
  result.cssBlue = result[6];
  result.violet = result[7];
  result.magenta = result[8];
  return result as MyRainbow;
})();

/**
 * Same colors as myRainbow, different format.
 */
export const myRainbowInfo: { name: string; color: string; desc: string }[] = [
  {
    name: "red",
    color: myRainbow.red,
    desc: "Standard CSS red. Full intensity.",
  },
  {
    name: "orange",
    color: myRainbow.orange,
    desc: "Full intensity. Slightly different from CSS orange.",
  },
  {
    name: "yellow",
    color: myRainbow.yellow,
    desc: "Slightly darkened from CSS yellow. Easier to read on a white background.",
  },
  {
    name: "green",
    color: myRainbow.green,
    desc: "Slightly darkened from CSS green. Looks about the same brightness as the other rainbow colors.",
  },
  {
    name: "cyan",
    color: myRainbow.cyan,
    desc: "Slightly darkened from CSS cyan. Looks about the same brightness as the other rainbow colors.",
  },
  {
    name: "myBlue",
    color: myRainbow.myBlue,
    desc: "My favorite shade of blue — a little green-leaning, full intensity. CSS blue (#0000FF) is too dark; this is much brighter. Looks good with red and white.",
  },
  {
    name: "cssBlue",
    color: myRainbow.cssBlue,
    desc: "Similar to standard CSS blue, slightly brighter. Distinctly darker than myBlue, which keeps the two colors separate.",
  },
  {
    name: "violet",
    color: myRainbow.violet,
    desc: "A dark, bluish shade of purple. Full intensity. CSS violet is in the same general family.",
  },
  {
    name: "magenta",
    color: myRainbow.magenta,
    desc: "Standard CSS magenta. Full intensity.",
  },
];
