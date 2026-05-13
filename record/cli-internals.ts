/**
 * Generates internals.md with documentation about project internals.
 *
 * Usage: npm run internals
 */

import { DOMMatrix, Path2D } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";

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

${cursiveTable}`;

writeFileSync("internals.md", content);
console.log("internals.md generated.");
