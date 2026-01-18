import { Showable } from "./showable";

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
  show({ context }) {
    context.fillStyle = "black";
    context.fillRect(0, 0, 16, 9);
  },
};
