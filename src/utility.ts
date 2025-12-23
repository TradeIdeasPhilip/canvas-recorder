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
