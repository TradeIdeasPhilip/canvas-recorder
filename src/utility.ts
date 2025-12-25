/**
 * This converts a linear timing to an eased timing.
 * This is similar to "ease" or "ease-in-out"
 * @param t A value between 0 and 1.
 * @returns A value between 0 and 1.
 */
export function ease(t: number): number {
  const angle = t * Math.PI;
  const cosine = Math.cos(angle);
  const result = (1 - cosine) / 2;
  return result;
}

/**
 * My favorite shade of blue.
 *
 * The normal css "blue", #0000FF, is way too dark for use on a black background.
 * This adds some green for a much brighter color.
 * Out of context I'd call this color blue.
 * And it looks good with css "red" and "white".
 */
export const BLUE = "#007fff";
