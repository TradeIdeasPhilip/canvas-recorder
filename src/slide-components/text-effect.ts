// MARK: Text Effects

import { PathShape } from "../glib/path-shape";
import { Showable, ShowOptions } from "../showable";

/**
 * A {@link MultiTextComponent} child with this key changes how the text is
 * stroked.  Handwriting is the first one; wavy or drunken lines would be others.
 *
 * Only *direct* children of a Multi Text count, and only one at a time.  A second
 * one is reported on screen with `showError()`, and the text is drawn as if
 * neither were there.
 *
 * The effect runs right after layout.  Auto sizing, margins and anchoring have
 * already been decided from the complete text, so an effect that leaves pieces
 * out doesn't make the rest of the text move.
 *
 * See {@link TextEffect}.
 */
export const TEXT_EFFECT = Symbol("Text Effect");

/**
 * One letter of a {@link MultiTextComponent}'s laid out text, as a
 * {@link TextEffect} sees it.  Effects get these in reading order.
 *
 * Every character the font knows is included, even one with nothing to draw.
 * Check `untranslatedShape.isEmpty` to skip those.
 */
export type EffectLetter = {
  /**
   * The letter in place, in the paragraph's own coordinates, ready to stroke.
   */
  readonly shape: PathShape;
  /**
   * The letter before it was moved into place.
   *
   * Fonts are cached, so this is usually the same object from one frame to the
   * next:  a good key for a cache.  `PathShapeSplitter.create()` already caches
   * on it.
   */
  readonly untranslatedShape: PathShape;
  /** `shape` is `untranslatedShape.translate(x, baseline)`. */
  readonly x: number;
  /** `shape` is `untranslatedShape.translate(x, baseline)`. */
  readonly baseline: number;
  /**
   * The format that draws this letter.  Use it as the key in the map the effect
   * returns.
   */
  readonly tag: unknown;
  /**
   * Which word, counting from 0 in reading order.  This is the layout's idea of
   * a word:  a run of characters up to and including the spaces after it.  Each
   * Text Span starts new words, so "Hel" in one span and "lo" in the next are
   * two words.
   */
  readonly wordIndex: number;
  /**
   * Which line, counting only hard breaks ("\n"), not word wrap.  Blank lines
   * still count, so this can skip numbers.
   */
  readonly hardLineIndex: number;
  /**
   * Which Text Span this letter came from, counting from 0 among the Multi
   * Text's spans.  Spans added in TypeScript with `addText()` come after the
   * Text Span children.
   */
  readonly spanIndex: number;
};

/**
 * A {@link Showable} that a {@link MultiTextComponent} uses to change how its
 * text is stroked.  See {@link TEXT_EFFECT}.
 */
export type TextEffect = Showable & {
  /**
   * @param letters Every letter, in reading order.
   * @param options The Multi Text's own options, so `timeInMs` is the Multi
   * Text's local time.
   * @returns What to stroke, grouped by {@link EffectLetter.tag}.  This
   * replaces `laidOut.pathShapeByTag()`.  Each path is stroked by its tag's
   * format, in the order of this map, so later entries are drawn on top.  Leave
   * a tag out to draw nothing in that format.
   */
  [TEXT_EFFECT](
    letters: readonly EffectLetter[],
    options: ShowOptions,
  ): Map<unknown, PathShape>;
};

export function isTextEffect(showable: Showable): showable is TextEffect {
  return TEXT_EFFECT in showable;
}
