/**
 * Generates internals.md with documentation about project internals.
 *
 * Usage: npm run internals
 */

import { DOMMatrix, Path2D } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { convertCSS, deltaE, hex2oklab } from "colorizr";
import { myRainbow, myRainbowInfo } from "../src/glib/my-rainbow.ts";
import { zipper } from "../src/zipper.ts";
import { sum } from "phil-lib/misc";

// Shim must be set before any src/ modules load, since transforms.ts calls
// DOMMatrix at module initialization time and static imports are hoisted.
globalThis.DOMMatrix = DOMMatrix as any;
globalThis.DOMMatrixReadOnly = DOMMatrix as any;
globalThis.Path2D = Path2D as any;

const { makeLineFont } = await import("../src/glib/line-font.ts");
const { Font } = await import("../src/glib/letters-base.ts");

function buildTable(letters: string): string {
  let table = "| Code Point | Character |\n|---|---|\n";
  for (const char of letters) {
    const codePoint = char.codePointAt(0)!;
    const hex = `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
    table += `| ${hex} | ${char} |\n`;
  }
  return table;
}

const date = new Date().toLocaleString();

const lineFontTable = buildTable(makeLineFont(1).getAllLetters());
const futuraTable = buildTable(Font.futuraL(1).getAllLetters());
const cursiveTable = buildTable(Font.cursive(1).getAllLetters());

const colorInfo = (() => {
  const distances = myRainbow.map((color, index, array) => {
    const nextColor = array[(index + 1) % array.length];
    const distance = deltaE(color, nextColor);
    return distance;
  });
  console.log(distances);
  const totalDistance = sum(distances);
  console.log(totalDistance);
  let start = 0;
  let distanceTable = "| At | Color | Name |\n|---|---|---|\n";
  zipper([myRainbowInfo, distances]).forEach(([colorInfo, distance]) => {
    distanceTable += `| ${start.toFixed(4)} | ${colorInfo.color} | ${colorInfo.name} |\n`;
    const proportion = distance / totalDistance;
    start += proportion;
  });
  distanceTable += `| ${start.toFixed(4)} | ${myRainbow[0]} | ${myRainbowInfo[0].name} |\n`;
  const lightnesses = myRainbowInfo.map((colorInfo) => {
    return { ...colorInfo, lightness: hex2oklab(convertCSS(colorInfo.color,"hex")).l };
  });
  lightnesses.sort((a, b) => a.lightness - b.lightness);
  let lightnessTable = "| Lightness | Color | Name |\n|---|---|---|\n";
  lightnesses.forEach((colorInfo) => {
    lightnessTable += `|  ${colorInfo.lightness.toFixed(4)} | ${colorInfo.color} | ${colorInfo.name} |\n`;
  });
  return { distanceTable, lightnessTable };
})();

const content = `# Internals

This file was automatically generated on ${date}.

## Fonts

### lineFont

The following characters are currently available via \`makeLineFont()\`, the most popular font:

${lineFontTable}
### Futura L

The following characters are currently available via \`Font.futuraL()\`:

${futuraTable}
### Cursive

The following characters are currently available via \`Font.cursive()\`:

${cursiveTable}

## Colors

### Evenly Spaced

${colorInfo.distanceTable}

### Dark to Light

${colorInfo.lightnessTable}

`;

writeFileSync("internals.md", content);
console.log("internals.md generated.");
