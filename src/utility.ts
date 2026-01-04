import { Showable } from "./showable";

/**
 * My favorite shade of blue.
 *
 * The normal css "blue", #0000FF, is way too dark for use on a black background.
 * This adds some green for a much brighter color.
 * Out of context I'd call this color blue.
 * And it looks good with css "red" and "white".
 */
export const BLUE = "#007fff";

export const blackBackground: Showable = {
  description: "background",
  duration: 0,
  show(timeInMs, context) {
    context.fillStyle = "black";
    context.fillRect(0, 0, 16, 9);
  },
};
