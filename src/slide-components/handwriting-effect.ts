// MARK: Handwriting Effect

import { Command, PathShape } from "../glib/path-shape";
import { PathShapeSplitter } from "../glib/path-shape-splitter";
import { Keyframe } from "../interpolate";
import { NumberScheduleInfo } from "../schedule-helper";
import { Scalar, ShowOptions } from "../showable";
import { showError } from "./show-error";
import { EffectLetter, TEXT_EFFECT, TextEffect } from "./text-effect";

/**
 * What one step of {@link HandwritingEffectComponent.progressSchedule} means.
 *
 * * `Letters` — one visible character.  A character with nothing to draw, like
 *   a space, is not a letter and takes no time.  Punctuation is a letter.
 * * `Words` — one word, as the layout splits them:  text up to and including
 *   the spaces after it.  A new Text Span always starts a new word, so "Hel" in
 *   one span and "lo" in the next count as two.
 * * `Lines` — one line, ended by a "\n".  Word wrap doesn't start a new line.
 *   Blank lines are skipped:  they have nothing to draw.
 * * `Spans` — one Text Span's text.  Spans with nothing to draw are skipped.
 * * `Total` — the whole text.  1 is the end.
 */
export const HANDWRITING_DIVISIONS = [
  "Letters",
  "Words",
  "Lines",
  "Spans",
  "Total",
] as const;

export type HandwritingDivision = (typeof HANDWRITING_DIVISIONS)[number];

/** One letter of a {@link HandwritingUnit}, measured. */
type MeasuredLetter = {
  readonly letter: EffectLetter;
  /** Where this letter starts, as a distance along its unit's pen path. */
  readonly start: number;
  /** The length of this letter's pen path.  0 for a dot. */
  readonly length: number;
};

/**
 * The letters that one step of Progress writes.  Never empty.
 */
export type HandwritingUnit = {
  readonly letters: readonly MeasuredLetter[];
  /**
   * The total length of the pen path.  The pen moves at a constant speed
   * within a unit, so this decides how far a fraction of a step gets.
   */
  readonly length: number;
};

/**
 * Which unit a letter belongs to.  Neighboring letters with the same key are
 * the same unit.
 */
function unitKey(
  letter: EffectLetter,
  index: number,
  division: HandwritingDivision,
): number {
  switch (division) {
    case "Letters":
      return index;
    case "Words":
      return letter.wordIndex;
    case "Lines":
      return letter.hardLineIndex;
    case "Spans":
      return letter.spanIndex;
    case "Total":
      return 0;
  }
}

/**
 * Group the visible letters into the units that Progress counts.
 *
 * Letters with nothing to draw are dropped first, so they never take time, and
 * a unit made only of them doesn't exist.
 */
export function handwritingUnits(
  letters: readonly EffectLetter[],
  division: HandwritingDivision,
): HandwritingUnit[] {
  const result: { letters: MeasuredLetter[]; length: number }[] = [];
  let previousKey: number | undefined;
  letters
    .filter((letter) => !letter.untranslatedShape.isEmpty)
    .forEach((letter, index) => {
      const key = unitKey(letter, index, division);
      if (key !== previousKey || result.length == 0) {
        result.push({ letters: [], length: 0 });
        previousKey = key;
      }
      const unit = result.at(-1)!;
      // The splitter is cached on the untranslated shape, which the font
      // reuses from frame to frame.  So this is cheap after the first frame.
      const length = PathShapeSplitter.create(letter.untranslatedShape).length;
      unit.letters.push({ letter, start: unit.length, length });
      unit.length += length;
    });
  return result;
}

/**
 * What to stroke, as described in {@link HandwritingEffectComponent}.
 * @param progress How many units to write.  Clamped to 0 … the number of units.
 * @returns The paths for each format, as {@link TextEffect} describes.
 */
export function handwritingPaths(
  letters: readonly EffectLetter[],
  division: HandwritingDivision,
  progress: number,
): Map<unknown, PathShape> {
  const units = handwritingUnits(letters, division);
  progress = Math.min(units.length, Math.max(0, progress));
  // Reading order, so each tag is first added in the same order as
  // pathShapeByTag() would, and the formats stack the same way.
  const commandsByTag = new Map<unknown, Command[]>();
  function add(tag: unknown, commands: readonly Command[]) {
    commandsByTag.getOrInsertComputed(tag, () => []).push(...commands);
  }
  const complete = Math.floor(progress);
  for (let i = 0; i < complete; i++) {
    for (const { letter } of units[i].letters) {
      add(letter.tag, letter.shape.commands);
    }
  }
  const fraction = progress - complete;
  // At exactly 0, or at any whole number, the next unit hasn't started.  Don't
  // trim it to nothing:  a zero length path with round caps draws a dot.
  if (fraction > 0) {
    const unit = units[complete];
    const cut = fraction * unit.length;
    for (const { letter, start, length } of unit.letters) {
      // A unit that is nothing but dots has no length to grow along.  Show it
      // as soon as it starts.
      const reached = start < cut || unit.length == 0;
      if (!reached) {
        break;
      }
      if (start + length <= cut) {
        add(letter.tag, letter.shape.commands);
      } else {
        const partial = PathShapeSplitter.create(letter.untranslatedShape)
          .trim(0, cut - start)
          .translate(letter.x, letter.baseline);
        add(letter.tag, partial.commands);
      }
    }
  }
  const result = new Map<unknown, PathShape>();
  commandsByTag.forEach((commands, tag) => {
    result.set(tag, new PathShape(commands));
  });
  return result;
}

/**
 * Put this directly inside a Multi Text to write the text out a little at a
 * time, as if by hand.
 *
 * {@link progressSchedule} says how much to write, counted in
 * {@link divisionsScalar}'s units.  0 draws nothing, 1 draws the first unit,
 * 2 the first two, and so on.  In between, the pen moves at a constant speed
 * through the next unit.
 *
 * The text is sized and placed as if it were all there, so it doesn't move or
 * resize as it's written.
 */
export class HandwritingEffectComponent implements TextEffect {
  readonly registryKey = "Handwriting Effect";
  /** What one step of Progress means.  See {@link HANDWRITING_DIVISIONS}. */
  readonly divisionsScalar: Scalar<"select"> = {
    description: "Divisions",
    type: "select",
    choices: HANDWRITING_DIVISIONS,
    value: "Total",
  };
  readonly scalars = [this.divisionsScalar] as const;
  /**
   * How many units of text to draw.  Fractions draw part of the next unit.
   * Clamped to 0 … the number of units.
   */
  readonly progressSchedule = new NumberScheduleInfo("Progress", [
    { time: 0, value: 0 },
    { time: 3000, value: 1 },
  ]);
  readonly schedules = [this.progressSchedule] as const;
  readonly description = "Handwriting Effect";
  readonly duration = 0;
  constructor(
    initialValues: {
      divisions?: HandwritingDivision;
      progress?: number | readonly Keyframe<number>[];
    } = {},
  ) {
    if (initialValues.divisions !== undefined)
      this.divisionsScalar.value = initialValues.divisions;
    if (initialValues.progress !== undefined)
      this.progressSchedule.set(initialValues.progress);
  }
  /** {@link divisionsScalar}, or `Total` if it holds something unexpected. */
  get divisions(): HandwritingDivision {
    const value = this.divisionsScalar.value;
    return (HANDWRITING_DIVISIONS as readonly string[]).includes(value)
      ? (value as HandwritingDivision)
      : "Total";
  }
  show(options: ShowOptions): void {
    // A Multi Text calls [TEXT_EFFECT]() instead.
    showError(
      options.context,
      "Handwriting Effect\nshould be a child of\nMulti Text",
    );
  }
  [TEXT_EFFECT](
    letters: readonly EffectLetter[],
    options: ShowOptions,
  ): Map<unknown, PathShape> {
    return handwritingPaths(
      letters,
      this.divisions,
      this.progressSchedule.at(options.timeInMs),
    );
  }
}
