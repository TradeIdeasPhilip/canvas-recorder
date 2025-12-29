import { sum } from "phil-lib/misc";
import { DescriptionOfLetter, Font } from "./letters-base";
import { PathShape } from "./path-shape";

class WordInfo {
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly letters: readonly { x: number; description: DescriptionOfLetter }[];
  readonly spaceAfter: number;
  constructor(word: string, font: Font) {
    const letters = font.getWord(word);
    let x = 0;
    this.letters = letters.map((description) => {
      const result = { x, description };
      x += description.advance + font.kerning;
      return result;
    });
    const lastLetter = this.letters.at(-1);
    this.width = lastLetter ? lastLetter.x + lastLetter.description.advance : 0;
    this.top = font.top;
    this.bottom = font.bottom;
    let spaceCount = 0;
    [...word].forEach((char) => {
      if (char == " ") {
        spaceCount++;
      }
    });
    this.spaceAfter = spaceCount * font.spaceWidth + font.kerning;
  }
}

class LinkBreak {}

/**
 * This is a good way to use my strokable fonts.
 *
 * This layout is intended to be used with a lot of special effects, not just drawing on a canvas or SVG.
 * It returns a lot of detail about the layout.
 * In particular, it's easy to match parts of the input with parts of the path.
 * Maybe a few words are drawn in red and the rest in black.
 *
 * This is a successor to the TextLayout and Writer classes from random-svg-tests:
 * https://github.com/TradeIdeasPhilip/random-svg-tests/blob/6232bae17d7eb9550df86d635803c2a275c34f74/src/letters-more.ts#L12
 */
export class ParagraphLayout {
  readonly #items: (WordInfo | LinkBreak)[] = [];
  constructor(readonly font: Font) {}
  /**
   * Skip the word breaking algorithm and add an individual word.
   * See addText() for a higher level way to do this.
   * @param word To display.
   * @param font
   * @returns This `WordInfo` directly contains some layout information about the word.
   * When the complete layout is produced, it will return these same objects.
   * You can use these objects to trace parts of the combined result back to this call.
   */
  addWord(word: string, font = this.font): WordInfo {
    // TODO what if word contains spaces?  These should be treated like non-breaking spaces.
    const result = new WordInfo(word, font);
    this.#items.push(result);
    return result;
  }
  /**
   * Add text to be formatted.
   * @param text What to display.
   * " " and "\n" have their normal special meanings.
   * All other characters are displayed as is.
   * @param font
   * @returns These `WordInfo` directly contain some layout information about the individual words in your `text`.
   * When the complete layout is produced, it will return these same objects.
   * You can use these objects to trace parts of the combined result back to this call.
   */
  addText(text: string, font = this.font): WordInfo[] {
    const result: WordInfo[] = [];
    for (const match of text.matchAll(/(\n)|([^ \n]*(( +)|$|(?=\n)))/gms)) {
      const word = match[0];
      if (word[0] == "\n") {
        for (let i = 0; i < word.length; i++) {
          this.addLineBreak();
        }
      } else if (word != "") {
        result.push(this.addWord(word, font));
      }
    }
    return result;
  }
  /**
   * Force a line break here.
   *
   * Like hitting shift-enter in some programs, this will move you to the start of the next line without starting a new paragraph.
   */
  addLineBreak() {
    this.#items.push(new LinkBreak());
  }
  /**
   * Finish the layout.
   * @param width At what point to automatically word wrap.
   * This defaults to Infinity which does no automatic word wrapping.
   * That will give you one long line unless you use a "\n" or an explicit call to `addLineBreak()`.
   * @param alignment
   * @returns A detailed description of where to draw each path.
   */
  align(
    width = Infinity,
    alignment: "left" | "center" | "right" | "justify" = "left"
  ) {
    const lines: WordInfo[][] = [[]];
    const hardLineBreakAt = new Set<number>();
    let x = 0;
    this.#items.forEach((item) => {
      if (item instanceof WordInfo) {
        if (x > 0 && x + item.width > width) {
          x = 0;
          lines.push([]);
        }
        x += item.width + item.spaceAfter;
        lines.at(-1)!.push(item);
      } else {
        const currentLineIndex = lines.length - 1;
        hardLineBreakAt.add(currentLineIndex);
        x = 0;
        lines.push([]);
      }
    });
    // Remove any blank lines from the bottom.
    while (lines.length > 0) {
      if (lines.at(-1)!.length == 0) {
        lines.pop();
      } else {
        break;
      }
    }
    let y = 0;
    const allRowMetrics = new Array<{
      top: number;
      baseline: number;
      bottom: number;
      minWidth: number;
    }>();
    lines.forEach((line) => {
      if (line.length == 0) {
        const top = y;
        const baseline = top - this.font.top;
        const bottom = baseline + this.font.bottom;
        const minWidth = 0;
        allRowMetrics.push({ top, baseline, bottom, minWidth });
        y = bottom;
      } else {
        const top = y;
        const baseline =
          top - Math.min(...line.map((wordInfo) => wordInfo.top));
        const bottom =
          baseline + Math.max(...line.map((wordInfo) => wordInfo.bottom));
        const minWidth =
          sum(line.map((wordInfo) => wordInfo.width + wordInfo.spaceAfter)) -
          line.at(-1)!.spaceAfter;
        allRowMetrics.push({ top, baseline, bottom, minWidth });
        y = bottom;
      }
    });
    const words = new Array<{
      x: number;
      baseline: number;
      wordInfo: WordInfo;
    }>();
    if (width == Infinity) {
      width = Math.max(...allRowMetrics.map(({ minWidth }) => minWidth));
    }
    lines.forEach((line, index) => {
      const rowMetrics = allRowMetrics[index];
      const baseline = rowMetrics.baseline;
      function center() {
        let x = (width - rowMetrics.minWidth) / 2;
        line.forEach((wordInfo) => {
          words.push({ x, baseline, wordInfo });
          x += wordInfo.width + wordInfo.spaceAfter;
        });
      }
      function left() {
        let x = 0;
        line.forEach((wordInfo) => {
          words.push({ x, baseline, wordInfo });
          x += wordInfo.width + wordInfo.spaceAfter;
        });
      }
      function right() {
        let x = width - rowMetrics.minWidth;
        line.forEach((wordInfo) => {
          words.push({ x, baseline, wordInfo });
          x += wordInfo.width + wordInfo.spaceAfter;
        });
      }
      function justify() {
        const padding = (width - rowMetrics.minWidth) / (line.length - 1);
        let x = 0;
        line.forEach((wordInfo) => {
          words.push({ x, baseline, wordInfo });
          x += wordInfo.width + wordInfo.spaceAfter + padding;
        });
      }
      switch (alignment) {
        case "center": {
          center();
          break;
        }
        case "left": {
          left();
          break;
        }
        case "right": {
          right();
          break;
        }
        case "justify": {
          const lastLine = index == lines.length - 1;
          if (lastLine || hardLineBreakAt.has(index)) {
            left();
          } else {
            justify();
          }
          break;
        }
        default: {
          throw new Error("wtf");
        }
      }
    });
    function* getAllLetters(left = 0, top = 0) {
      for (const word of words) {
        for (const letter of word.wordInfo.letters) {
          const x = left + word.x + letter.x;
          const baseline = top + word.baseline;
          yield {
            x,
            baseline,
            letter: letter.description,
            translatedShape: letter.description.shape.translate(x, baseline),
            word,
          };
        }
      }
    }
    /**
     * This will stroke **all** of the text
     *
     * Be sure to set the `strokeStyle` and `lineWidth` of the context before calling this.
     * @param context Where to draw.
     * @param left Where to start drawing.  The default of 0 leaves no margin.
     * @param top Where to start drawing.  The default of 0 leaves no margin.
     */
    function drawAll(context: CanvasRenderingContext2D, left = 0, top = 0) {
      context.lineCap = "round";
      context.lineJoin = "round";
      for (const info of getAllLetters(left, top)) {
        const path = new Path2D(info.translatedShape.rawPath);
        context.stroke(path);
      }
    }
    /**
     * Create a function that will let you draw the animation at a given state.
     * @param left Where to start drawing.  The default of 0 leaves no margin.
     * @param top Where to start drawing.  The default of 0 leaves no margin.
     * @returns
     */
    function drawPartial(left = 0, top = 0) {
      // See createHandwriting in handwriting.ts.
      // TODO use that to implement this.
      let start = 0;
      //const shapesToAnimate = getAllLetters(left, top).map(({translatedShape}) => translatedShape);
      const allShapeInfo = [...getAllLetters(left, top)]
        .flatMap(({ translatedShape }) => translatedShape.splitOnMove())
        .map((shape) => {
          const length = shape.getLength();
          const end = start + length;
          const path = new Path2D(shape.rawPath);
          const result = { path, start, length, end };
          start = end;
          return result;
        });
      const totalLength = start;
      function drawTo(length: number, context: CanvasRenderingContext2D) {
        // TODO This doesn't work perfectly.
        // It's like PathShape.getLength() doesn't match perfectly with the canvas's idea of the path length.
        // TODO fix it!  It jumps a little but generally works.
        // Q commands are much worse than L commands, but they both fail.
        context.lineCap = "round";
        context.lineJoin = "round";
        for (const shapeInfo of allShapeInfo) {
          if (length <= shapeInfo.start) {
            break;
          }
          if (length >= shapeInfo.end) {
            context.setLineDash([]);
          } else {
            context.setLineDash([length - shapeInfo.start, totalLength]);
          }
          context.stroke(shapeInfo.path);
        }
        context.setLineDash([]);
      }
      return { totalLength, drawTo };
    }
    function singlePathShape() {
      const allCommands = [...getAllLetters()].flatMap(
        ({ translatedShape }) => translatedShape.commands
      );
      return new PathShape(allCommands);
    }
    const height = allRowMetrics.at(-1)?.bottom ?? 0;
    return {
      height,
      width,
      words,
      allRowMetrics,
      getAllLetters,
      drawAll,
      drawPartial,
      singlePathShape,
    };
  }
}
