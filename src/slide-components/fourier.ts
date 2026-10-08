import { ReadOnlyRect } from "phil-lib/misc";
import { myRainbow } from "../glib/my-rainbow";
import { ParametricFunction, PathShape } from "../glib/path-shape";
import { panAndZoom } from "../glib/transforms";
import { Keyframe } from "../interpolate";
import {
  Complex,
  FourierTerm,
  getAnimationRules,
  makePolygon,
  numberOfFourierSamples,
  samplesFromParametric,
  samplesFromPath,
  samplesToFourier,
  termsToParametricFunction,
} from "../peano-fourier/fourier-shared";
import {
  ColorScheduleInfo,
  NumberScheduleInfo,
  RectangleScheduleInfo,
  SelectScheduleInfo,
  StringScheduleInfo,
} from "../schedule-helper";
import { ShowOptions } from "../showable";
import { DurationAgnosticComponent } from "./duration-agnostic";
import { showError } from "./show-error";

// MARK: Sources

/**
 * Something to decompose into a Fourier series.  Register these in
 * {@link FourierComponent.sources}.
 *
 * Three forms, the same ones fourier-shared.ts accepts:
 * * `path`:  a closed path to trace, as a PathShape or a path string.  The
 *   most convenient.
 * * `parametric`:  a closed curve, `t` from 0 to 1.
 * * `terms`:  terms someone already computed with samplesToFourier(), so the
 *   work isn't done twice when other code needs them too.
 *
 * Everything here must be **pure**:  the same input, the same answer, every
 * time.  The terms are computed once and cached, so anything outside the
 * function that could change its answer would be silently ignored.
 *
 * The origin matters.  Step 0 is a single dot at (0, 0), and the curve grows
 * from there.  recenter() in fourier-shared.ts moves a path's origin, e.g. to
 * the middle of its bounding box.
 */
export type FourierSource =
  | {
      readonly path: PathShape | string;
      /** A power of 2.  The default is 1024.  More samples, more detail and more terms. */
      readonly sampleCount?: number;
    }
  | {
      readonly parametric: ParametricFunction;
      /** A power of 2.  The default is 1024. */
      readonly sampleCount?: number;
    }
  | { readonly terms: readonly FourierTerm[] };

// MARK: Term groups

/**
 * The Term Groups field, parsed:  for each step, the terms it adds.
 *
 * Terms are numbered by size, 0 being the largest, the order
 * samplesToFourier() returns them in.
 */
export type TermGroups = {
  readonly groups: readonly (readonly number[])[];
  /** Pieces of the text that couldn't be read.  They're left out. */
  readonly errors: readonly string[];
  /** Things that work, but probably aren't what was meant. */
  readonly warnings: readonly string[];
};

/** A range like 0-99999 is a typo, not a request. */
const MAX_RANGE = 10_000;

/**
 * Read the Term Groups format:  numbers separated by spaces, a comma between
 * groups.  `5-9` is short for `5 6 7 8 9`.  Each group is one step.
 *
 * For example, `0, 1, 2 3, 4-9` is four steps:  add term 0, then term 1, then
 * terms 2 and 3 together, then terms 4 through 9 together.
 *
 * Pure.
 */
export function parseTermGroups(text: string): TermGroups {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (text.trim() === "") return { groups: [], errors, warnings };
  /** Where each term was first added, to report repeats. */
  const firstGroup = new Map<number, number>();
  const groups = text.split(",").map((piece, groupIndex) => {
    const groupNumber = groupIndex + 1;
    const group: number[] = [];
    const add = (term: number) => {
      const earlier = firstGroup.get(term);
      if (earlier === undefined) {
        firstGroup.set(term, groupNumber);
      } else {
        warnings.push(
          earlier === groupNumber
            ? `Term ${term} is in group ${groupNumber} twice.`
            : `Term ${term} is in group ${earlier} and again in group ${groupNumber}.  Terms are only ever added, so the second time does nothing.`,
        );
      }
      group.push(term);
    };
    const tokens = piece.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      warnings.push(`Group ${groupNumber} is empty, so that step adds nothing.`);
    }
    for (const token of tokens) {
      const single = /^\d+$/.exec(token);
      const range = /^(\d+)-(\d+)$/.exec(token);
      if (single) {
        add(Number(token));
      } else if (range) {
        const from = Number(range[1]);
        const to = Number(range[2]);
        if (to < from) {
          errors.push(`"${token}" runs backwards.  Try ${to}-${from}.`);
        } else if (to - from >= MAX_RANGE) {
          errors.push(`"${token}" is more than ${MAX_RANGE} terms.`);
        } else {
          for (let term = from; term <= to; term++) add(term);
        }
      } else {
        errors.push(`"${token}" isn't a term number or a range like 5-9.`);
      }
    }
    return group;
  });
  return { groups, errors, warnings };
}

/**
 * Problems that only show up once the terms are known:  term numbers past the
 * end, and the frequency 0 term somewhere it can't animate.
 *
 * Pure.
 */
export function checkTermGroups(
  groups: readonly (readonly number[])[],
  terms: readonly FourierTerm[],
): string[] {
  const warnings: string[] = [];
  const missing = new Set<number>();
  for (const group of groups) {
    for (const term of group) if (term >= terms.length) missing.add(term);
  }
  if (missing.size) {
    const list = [...missing].sort((a, b) => a - b);
    const shown = list.length > 6 ? `${list.slice(0, 6).join(", ")}, …` : list.join(", ");
    warnings.push(
      `This source has ${terms.length} terms, numbered 0 to ${terms.length - 1}.  ` +
        `Left out:  ${shown}.`,
    );
  }
  // The frequency 0 term is the shape's center.  It has nothing to sweep, so
  // a step can't grow it in on its own, except as the very first step, which
  // has an animation of its own:  the dot moves to the center.
  groups.forEach((group, index) => {
    if (index === 0) return;
    const valid = group.filter((term) => term < terms.length);
    if (valid.length > 0 && valid.every((term) => terms[term].frequency === 0)) {
      warnings.push(
        `Group ${index + 1} is only the center (frequency 0), which can't animate on its own.  ` +
          `Put it in the first group, or with other terms.`,
      );
    }
  });
  return warnings;
}

/**
 * The terms in the order the groups add them, and the running totals
 * getAnimationRules() calls keyframes.  Term numbers past the end, and
 * repeats, are skipped.
 *
 * Within a group, a frequency 0 term goes last.  getAnimationRules() times
 * each step by the frequency of the first term it adds, and frequency 0 has
 * no timing to offer.
 *
 * Pure.
 */
export function orderTerms(
  terms: readonly FourierTerm[],
  groups: readonly (readonly number[])[],
): { terms: FourierTerm[]; keyframes: number[] } {
  const used = new Set<number>();
  const ordered: FourierTerm[] = [];
  const keyframes = [0];
  for (const group of groups) {
    const fresh = group.filter((term) => {
      if (term >= terms.length || used.has(term)) return false;
      used.add(term);
      return true;
    });
    const moving = fresh.filter((term) => terms[term].frequency !== 0);
    const center = fresh.filter((term) => terms[term].frequency === 0);
    for (const term of [...moving, ...center]) ordered.push(terms[term]);
    keyframes.push(ordered.length);
  }
  return { terms: ordered, keyframes };
}

/**
 * Does the Step schedule cover exactly the steps there are?  It should run
 * from 0 (a single dot) to the number of groups (the finished curve).
 * Negative values mean "hidden", so they're left out of this.
 *
 * Pure.
 */
export function checkStepRange(
  step: readonly Keyframe<number>[],
  groupCount: number,
): string[] {
  const shown = step.map(({ value }) => value).filter((value) => value >= 0);
  if (shown.length === 0) {
    return ["Step is never 0 or more, so nothing is ever drawn.  Negative means hidden."];
  }
  const warnings: string[] = [];
  const low = Math.min(...shown);
  const high = Math.max(...shown);
  if (low !== 0) {
    warnings.push(
      `Step starts at ${low}, not 0.  Fine if you mean to skip the first steps:  ` +
        `the first ${low} group${low === 1 ? " is" : "s are"} there from the start.`,
    );
  }
  if (high !== groupCount) {
    warnings.push(
      high < groupCount
        ? `Step only reaches ${high}, but there are ${groupCount} groups.`
        : `Step reaches ${high}, but there are only ${groupCount} groups, so it holds at ${groupCount}.`,
    );
  }
  return warnings;
}

// MARK: The component

/** The bounding box of some points. */
function boundsOf(samples: readonly Complex[]): ReadOnlyRect {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of samples) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Draws a curve built up from its Fourier series, one group of terms at a
 * time:  the standard demo from the Peano, Sierpiński and SoME videos, as a
 * component.
 *
 * * **Source** picks the curve, by name, from {@link FourierComponent.sources}.
 * * **Term Groups** says which terms each step adds.  See {@link parseTermGroups}.
 * * **Step** says how far along to be at each moment.  0 is a single dot, 1
 *   has the first group, and the number of groups is the finished curve.
 *   Fractions are the transition to the next step.  Negative hides it.
 * * **Dest Rect** is where the finished curve goes.  Earlier steps use the
 *   same scale and position, so they can wander outside it.
 * * **Fill Color** fills it, transparent by default.  Even-odd, so where
 *   the curve crosses itself the fill alternates.  It works on curves that
 *   don't close, too:  the fill closes them with a straight line.
 * * **Stroke Color** and **Line Width** stroke it, over the fill.
 * * Override {@link drawPath} to draw it differently, e.g. with strokeColors().
 *
 * The expensive parts are cached, one of each:  the terms for one source, and
 * the animation for one set of term groups.  Changing either throws its cache
 * away and starts over, which is fine as long as it's rare.
 */
export class FourierComponent extends DurationAgnosticComponent {
  readonly registryKey = "Fourier";

  /**
   * The curves the Source field can choose from, by name.
   *
   * Register a source before constructing any component that should offer
   * it:  the Source field's choices are read when a component is created.  In
   * practice that means registering it at the top level of the file that
   * defines it.
   *
   * Registering is cheap.  Nothing is computed until a component draws it.
   *
   * @example
   * FourierComponent.sources.set("Walking Man", { path: manWalkingString });
   */
  static readonly sources = new Map<string, FourierSource>();

  readonly sourceSchedule: SelectScheduleInfo<string, string>;
  /** See {@link parseTermGroups} for the format. */
  readonly termGroupsSchedule = new StringScheduleInfo(
    "Term Groups",
    "0, 1, 2, 3, 4, 5-9, 10-19, 20-39",
  );
  /** -1 or less hides it, 0 is a dot, the number of groups is the finished curve. */
  readonly stepSchedule = new NumberScheduleInfo("Step", [
    { time: 0, value: 0 },
    { time: 16_000, value: 8 },
  ]);
  readonly destRectSchedule = new RectangleScheduleInfo("Dest Rect", {
    x: 4.5,
    y: 1,
    width: 7,
    height: 7,
  });
  /** Drawn first, under the stroke.  "transparent" skips filling. */
  readonly fillColorSchedule = new ColorScheduleInfo("Fill Color", "transparent");
  readonly strokeColorSchedule = new ColorScheduleInfo(
    "Stroke Color",
    myRainbow.myBlue,
  );
  readonly lineWidthSchedule = new NumberScheduleInfo("Line Width", 0.05);

  constructor(
    initialValues: {
      description?: string;
      source?: string;
      termGroups?: string | Keyframe<string>[];
      step?: number | Keyframe<number>[];
      destRect?: ReadOnlyRect | Keyframe<ReadOnlyRect>[];
      fillColor?: string | Keyframe<string>[];
      strokeColor?: string | Keyframe<string>[];
      lineWidth?: number | Keyframe<number>[];
      /** How long to ask the parent for.  The default covers the default Step schedule. */
      minDuration?: number;
    } = {},
  ) {
    super(initialValues.description ?? "Fourier");
    const names = [...FourierComponent.sources.keys()];
    this.sourceSchedule = new SelectScheduleInfo(
      "Source",
      initialValues.source ?? names[0] ?? "",
      names,
    );
    if (initialValues.termGroups !== undefined)
      this.termGroupsSchedule.set(initialValues.termGroups);
    if (initialValues.step !== undefined) this.stepSchedule.set(initialValues.step);
    if (initialValues.destRect !== undefined)
      this.destRectSchedule.set(initialValues.destRect);
    if (initialValues.fillColor !== undefined)
      this.fillColorSchedule.set(initialValues.fillColor);
    if (initialValues.strokeColor !== undefined)
      this.strokeColorSchedule.set(initialValues.strokeColor);
    if (initialValues.lineWidth !== undefined)
      this.lineWidthSchedule.set(initialValues.lineWidth);
    this.minDurationScalar.value = initialValues.minDuration ?? 16_000;
    this.schedules.push(
      this.sourceSchedule,
      this.termGroupsSchedule,
      this.stepSchedule,
      this.destRectSchedule,
      this.fillColorSchedule,
      this.strokeColorSchedule,
      this.lineWidthSchedule,
    );
  }

  // MARK: Caches

  /** The terms for one source.  Never more than one entry; see the class comment. */
  #termsCache:
    | {
        readonly name: string;
        readonly terms: readonly FourierTerm[];
        /** Where the finished curve is, in the source's own coordinates. */
        readonly bounds: ReadOnlyRect;
      }
    | undefined;

  /**
   * The Fourier terms of the source called `name`, largest first, or why
   * there aren't any.
   */
  termsFor(
    name: string,
  ): { readonly terms: readonly FourierTerm[]; readonly bounds: ReadOnlyRect } | string {
    if (this.#termsCache?.name === name) return this.#termsCache;
    const source = FourierComponent.sources.get(name);
    if (!source) return `Unknown Fourier source:\n"${name}"`;
    let terms: readonly FourierTerm[];
    let samples: Complex[];
    if ("terms" in source) {
      terms = source.terms;
      // The curve all the terms add up to, to find where it is.
      const all = termsToParametricFunction(terms, terms.length);
      samples = Array.from({ length: numberOfFourierSamples }, (_, i) => {
        const { x, y } = all(i / numberOfFourierSamples);
        return [x, y];
      });
    } else {
      samples =
        "path" in source
          ? samplesFromPath(source.path, source.sampleCount)
          : samplesFromParametric(source.parametric, source.sampleCount);
      terms = samplesToFourier(samples);
    }
    this.#termsCache = { name, terms, bounds: boundsOf(samples) };
    return this.#termsCache;
  }

  /** The animation for one source and one set of term groups.  Never more than one entry. */
  #animationCache:
    | {
        readonly name: string;
        readonly termGroups: string;
        /** One per step:  progress 0 to 1 in, the curve out. */
        readonly rules: readonly ((progress: number) => PathShape)[];
        readonly bounds: ReadOnlyRect;
      }
    | undefined;

  #animationFor(name: string, termGroups: string) {
    const cached = this.#animationCache;
    if (cached?.name === name && cached.termGroups === termGroups) return cached;
    const source = this.termsFor(name);
    if (typeof source === "string") return source;
    const { groups } = parseTermGroups(termGroups);
    const ordered = orderTerms(source.terms, groups);
    const rules =
      ordered.keyframes.length < 2 ? [] : getAnimationRules(ordered.terms, ordered.keyframes);
    this.#animationCache = { name, termGroups, rules, bounds: source.bounds };
    return this.#animationCache;
  }

  // MARK: Drawing

  /**
   * The curve to draw at this moment, placed in the Dest Rect, or undefined
   * when Step says it's hidden.  A string explains a problem.
   */
  pathAt(timeInMs: number): PathShape | string | undefined {
    const step = this.stepSchedule.at(timeInMs);
    if (!(step >= 0)) return undefined;
    const animation = this.#animationFor(
      this.sourceSchedule.at(timeInMs),
      this.termGroupsSchedule.at(timeInMs),
    );
    if (typeof animation === "string") return animation;
    const { rules, bounds } = animation;
    if (rules.length === 0) return undefined;
    const index = Math.min(Math.floor(step), rules.length - 1);
    const progress = Math.min(1, step - index);
    const fit = panAndZoom(bounds, this.destRectSchedule.at(timeInMs), "meet");
    return rules[index](progress).transform(fit);
  }

  override show(options: ShowOptions): void {
    super.show(options);
    const path = this.pathAt(options.timeInMs);
    if (typeof path === "string") {
      showError(options.context, path);
    } else if (path) {
      this.drawPath(options, path);
    }
  }

  /**
   * Draw the curve:  fill, then stroke.  It's already in place, in canvas
   * coordinates, so the line width isn't affected by the curve's scale.
   *
   * Override this to draw it differently, e.g. stroked with strokeColors()
   * like the Sierpiński video.
   */
  protected drawPath(options: ShowOptions, pathShape: PathShape): void {
    const { context, timeInMs } = options;
    const path = pathShape.canvasPath;
    const fill = this.fillColorSchedule.at(timeInMs);
    if (fill !== "transparent") {
      context.fillStyle = fill;
      // Even-odd, as in the Sierpiński video:  where the curve crosses
      // itself, the fill alternates instead of piling up.
      context.fill(path, "evenodd");
    }
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = this.lineWidthSchedule.at(timeInMs);
    context.strokeStyle = this.strokeColorSchedule.at(timeInMs);
    context.stroke(path);
  }
}

// MARK: Built-in sources

// Cheap to create:  nothing is computed until a component draws one.

FourierComponent.sources.set("Star", {
  path: makePolygon(5, 1, undefined, 0).transform(new DOMMatrix().rotate(-90)),
});
FourierComponent.sources.set("Square", {
  path: "M -1,-1 L 1,-1 L 1,1 L -1,1 Z",
});
FourierComponent.sources.set("Heart", {
  // The classic heart curve, flipped so it's right side up on screen.
  parametric: (t) => {
    const θ = 2 * Math.PI * t;
    return {
      x: 16 * Math.sin(θ) ** 3,
      y: -(13 * Math.cos(θ) - 5 * Math.cos(2 * θ) - 2 * Math.cos(3 * θ) - Math.cos(4 * θ)),
    };
  },
});
