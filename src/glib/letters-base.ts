import { assertClass, assertFinite, pickAny } from "phil-lib/misc";
import { PathShape } from "./path-shape";

import futuraLBase from "./Futura L.json";
import cursiveBase from "./Cursive.json";

/**
 * This is an older idea.
 * New code mostly focuses on the Font object, which now includes a lot of this information.
 */
export type FontMetrics = {
  /**
   * The height of a capital M.  1em in css.
   *
   * `mHeight` is often but not necessarily the requested font size.
   */
  readonly mHeight: number;
  /**
   * Put this much space between adjacent characters.
   */
  readonly defaultKerning: number;
  /**
   * The font reserves the space between `top` and `bottom` for itself.
   */
  readonly top: number;
  /**
   * The font reserves the space between `top` and `bottom` for itself.
   */
  readonly bottom: number;
  /**
   * The y coordinate for the top of most capital letters.
   */
  readonly capitalTop: number;
  /**
   * The expected stroke width.
   */
  readonly strokeWidth: number;
  /**
   * The recommended width for a normal space.
   */
  readonly spaceWidth: number;
  // baseLine is now frozen at 0!!!!!
};

export type DescriptionOfLetter = {
  readonly shape: PathShape;
  readonly advance: number;
};

/**
 * This describes a strokable font in my own format.
 *
 * Almost all modern fonts are drawn by filling a path.
 * I'm interested in fonts that are drawn by stroking them.
 * Those allow for to all sorts of special effects, including:
 * https://tradeideasphilip.github.io/random-svg-tests/letters.html
 */
export class Font {
  constructor(
    /**
     * Everything between `top` and `bottom` is reserved for our text.
     * `top` is typically negative because the baseline is always 0.
     */
    readonly top: number,
    /**
     * Everything between `top` and `bottom` is reserved for our text.
     * This is relative to the baseline which is always 0.
     */
    readonly bottom: number,
    /**
     * How wide is the space character?
     *
     * The layout will typically use this information to set a minimum width,
     * rather than trying to draw the space like a normal letter.
     */
    readonly spaceWidth: number,
    /**
     * The recommended strokeWidth or lineWidth to use when stroking this font.
     * You can use any width you want.
     * (You don't even need to stroke the line at all; I've had good luck using css motion-path with these letters!)
     * But some fonts were built for a a specific size.
     * Look at the capital K.
     * Some fonts make the | and the < barely touch, which is only possible if you use a specific line width.
     */
    readonly strokeWidth: number,
    /**
     * The default amount of space to add after each letter.
     *
     * This can be adjusted but it should not be ignored.
     */
    readonly kerning: number,
    /**
     * The height of a capital letter M.
     * `1em` in css.
     *
     * When requesting a font in a particular size, the `mHeight` is that size.
     * Not always, but that's how I'm using it.
     */
    readonly mHeight: number,
    /**
     * A map from characters to DescriptionOfLetter objects.
     * More precisely, enough information to create our own initialized map.
     */
    letters: Iterable<readonly [string, DescriptionOfLetter]>
  ) {
    this.#letters = new Map(letters);
  }
  getWord(word: string): DescriptionOfLetter[] {
    // This could add special things, like kerning or ligatures.
    // That's not far off.  I had to manually tweak some of the cursive letters based on what came before them!
    const result: DescriptionOfLetter[] = [];
    for (const char of word) {
      const descriptionOfLetter = this.getChar(char);
      if (descriptionOfLetter) {
        result.push(descriptionOfLetter);
      }
    }
    return result;
  }
  #letters: Map<string, DescriptionOfLetter>;
  getChar(char: string): DescriptionOfLetter | undefined {
    return this.#letters.get(char);
  }
  static fromJSON(input: any): Font {
    if (typeof input === "string") {
      input = JSON.parse(input);
    }
    const top: number = input.top;
    const bottom: number = input.bottom;
    const spaceWidth: number = input.spaceWidth;
    const strokeWidth: number = input.strokeWidth;
    const kerning: number = input.kerning;
    const mHeight: number = input.mHeight;
    assertFinite(top, bottom, spaceWidth, strokeWidth, kerning, mHeight);
    const font = new this(
      top,
      bottom,
      spaceWidth,
      strokeWidth,
      kerning,
      mHeight,
      []
    );
    const letters = assertClass(input.letters, Array<any>);
    letters.forEach((letter) => {
      const key: string = letter.key;
      const advance: number = letter.advance;
      const d: string = letter.d;
      assertFinite(advance);
      if (typeof key !== "string" || typeof d !== "string") {
        console.error("Expecting {key,advance,d}, found", letter);
        throw new Error("wtf");
      }
      const descriptionOfLetter: DescriptionOfLetter = {
        shape: PathShape.fromString(d),
        advance,
      };
      font.#letters.set(key, descriptionOfLetter);
    });
    return font;
  }
  resize(newSize: number): Font {
    const ratio = newSize / this.mHeight;
    if (ratio == 1) {
      return this;
    }
    const result = new Font(
      ratio * this.top,
      ratio * this.bottom,
      ratio * this.spaceWidth,
      ratio * this.strokeWidth,
      ratio * this.kerning,
      newSize,
      []
    );
    const matrix = new DOMMatrix();
    matrix.scaleSelf(ratio);
    this.#letters.forEach((originalLetter, key) => {
      const newLetter: DescriptionOfLetter = {
        advance: ratio * originalLetter.advance,
        shape: originalLetter.shape.transform(matrix),
      };
      result.#letters.set(key, newLetter);
    });
    return result;
  }
  static cursive(size: number): Font {
    const base = this.fromJSON(cursiveBase);
    const result = base.resize(size);
    return result;
  }
  static futuraL(size: number): Font {
    const base = this.fromJSON(futuraLBase);
    const result = base.resize(size);
    return result;
  }
}
