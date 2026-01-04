import { Font } from "../glib/letters-base";
import {
  addMargins,
  MakeShowableInParallel,
  MakeShowableInSeries,
  Showable,
} from "../showable";
import { createHandwriting } from "../glib/handwriting";
import { ParagraphLayout } from "../glib/paragraph-layout";
import { LCommand, PathShape } from "../glib/path-shape";
import {
  assertFinite,
  initializedArray,
  lerp,
  makeLinear,
} from "phil-lib/misc";
import { createPeanoPath, getSegmentLength } from "./peano-shared";
import {
  easeOut,
  interpolateColors,
  makePathShapeInterpolator,
} from "../interpolate";
import { blackBackground, BLUE } from "../utility";

const font = Font.cursive(0.37);
function makeHandwritingForText(
  text: string,
  left: number,
  top: number,
  color: string
): Showable {
  const layout = new ParagraphLayout(font);
  const wordInfo = layout.addText(text);
  const laidOut = layout.align();
  const animator = laidOut.drawPartial(left, top); //❤️
  const duration = (2500 / 30) * ((text.length + 30) / 2);
  return {
    description: `${text} » handwriting`,
    duration,
    show(timeInMs, context) {
      context.strokeStyle = color;
      context.lineWidth = 0.045;
      context.lineCap = "round";
      context.lineJoin = "round";
      animator.drawTo((timeInMs / duration) * animator.totalLength, context);
    },
  };
}
const CHAPTER_TITLE_DELAY = 500;

const PEANO_HANDWRITING_TRANSFORM = new DOMMatrixReadOnly(
  "translate(8.5px, 1.5px) scale(7)"
);

function makeHandwritingForPeano(
  iteration: number,
  duration: number,
  color: string,
  lineWidth: number
): Showable {
  const shape = createPeanoPath(iteration).transform(
    PEANO_HANDWRITING_TRANSFORM
  );
  const handwriting = createHandwriting(shape);
  return {
    description: `Animate Peano curve #${iteration} as handwriting`,
    duration,
    show(timeInMs, context) {
      context.strokeStyle = color;
      context.lineWidth = lineWidth * 7;
      context.lineCap = "square";
      context.lineJoin = "miter";
      handwriting(timeInMs / duration, context);
    },
  };
}

/**
 * Create an animation morphing between one iteration of the Peano curve and another.
 * @param duration The total time in milliseconds.  This includes delay on both sides.
 * @param delay The time in milliseconds to display the initial state before starting to morph.
 * @param endDelay The time in milliseconds to hold the final state, after the morph, before hiding.
 * @param from Initial state.  `iteration == 1` is the smallest legal value.
 * @param to Final state.  `to.iteration` must be larger than `from.iteration`.
 * @param midColors Additional colors to use between from.color and to.color.
 * The default transition between red and var(--blue) (blue with a little green for brightness) got muddy in the middle.
 * Those two colors are almost complements, so middle state was very desaturated.
 * Now I explicitly put violet in between red and var(--blue).
 * That basically makes purple in between red and blue.
 * I picked that shade of violet because it kept the value of the color consistent through the transition.
 * @returns
 */
function createExpander(
  duration: number,
  frozenBefore: number,
  frozenAfter: number,
  from: { iteration: number; color: string; strokeWidth: number },
  to: { iteration: number; color: string; strokeWidth: number },
  midColors: string[] = []
): Showable {
  assertFinite(from.iteration, to.iteration);
  if (
    !Number.isSafeInteger(from.iteration) ||
    !Number.isSafeInteger(to.iteration) ||
    from.iteration < 1 ||
    to.iteration <= from.iteration
  ) {
    throw new Error("wtf");
  }
  /**
   * This is the number of _spaces between_ the vertical lines in the "from" curve.
   *
   * The vertical lines will have indices between 0 and this, inclusive.
   * Divide an index by this to get an x position, a value between 0 and 1 inclusive.
   *
   * This is the width of the curve, measured in the number of segments needed to go straight across.
   *
   * This is also the height of the curve, which always fits in a square.
   * That is less obvious because you never see a single vertical segment.
   * They always appear in groups of 2 or 5.
   */
  const fromCountVertical = Math.round(1 / getSegmentLength(from.iteration));
  /**
   * This is the number of _spaces between_ the vertical lines in the "to" curve.
   *
   * The vertical lines will have indices between 0 and this, inclusive.
   * Divide an index by this to get an x position, a value between 0 and 1 inclusive.
   */
  const toCountVertical = Math.round(1 / getSegmentLength(to.iteration));
  /**
   * How many different vertical line positions in the "to" curve are matched to each vertical line position in the "from curve".
   *
   * Probably a power of 3.
   */
  const inEachVerticalGroup = (toCountVertical + 1) / (fromCountVertical + 1);
  if (!Number.isSafeInteger(inEachVerticalGroup)) {
    throw new Error("wtf");
  }
  /**
   * The input says which vertical line we are discussing in the "to" curve.
   * This is a value between 0 and fromCountVertical, inclusive.
   *
   * The output is a number between 0 and 1, inclusive.
   * This is the position to draw the line in the "from" curve.
   */
  const fromX = initializedArray(toCountVertical + 1, (toIndex) => {
    const fromIndex = Math.floor(toIndex / inEachVerticalGroup);
    const x = fromIndex / fromCountVertical;
    return x;
  });
  /**
   * How many copies of the simplest (iteration= 1) version of the curve are included in the "from" curve.
   * Across _or_ down, __not__ area!
   *
   * Note that there is a small connector _between_ each of the simple versions.
   */
  const numberOfCopies = (fromCountVertical + 1) / 3;
  const fromY: number[] = [];
  for (let i = 0; i < numberOfCopies; i++) {
    const fromSectionBottom = i * 3;
    const fromSectionTop = fromSectionBottom + 2;
    const toSectionPeriod = (toCountVertical + 1) / numberOfCopies;
    const toSectionBottom = i * toSectionPeriod;
    const toSectionSize = toSectionPeriod - 1;
    const toSectionTop = toSectionBottom + toSectionSize;
    const getY = makeLinear(
      toSectionBottom,
      fromSectionBottom / fromCountVertical,
      toSectionTop,
      fromSectionTop / fromCountVertical
    );
    for (let j = 0; j <= toSectionSize; j++) {
      fromY.push(getY(toSectionBottom + j));
    }
  }
  //return { fromX, fromY };
  const toPath = createPeanoPath(to.iteration);
  const fromPath = new PathShape(
    toPath.commands.map((command) => {
      function translateX(x: number) {
        const index = Math.round(x * toCountVertical);
        return fromX[index];
      }
      function translateY(y: number) {
        const index = Math.round(y * toCountVertical);
        return fromY[index];
      }
      return new LCommand(
        translateX(command.x0),
        translateY(command.y0),
        translateX(command.x),
        translateY(command.y)
      );
    })
  );
  const baseDuration = duration - frozenBefore - frozenAfter;
  const colors = [from.color, ...midColors, to.color];
  const makePathShape = makePathShapeInterpolator(fromPath, toPath);
  const animation: Showable = {
    description: `Expander ${from.iteration} - ${to.iteration}`,
    duration: baseDuration,
    show(timeInMs, context) {
      const progress = easeOut(timeInMs / baseDuration);
      const strokeWidth = lerp(from.strokeWidth, to.strokeWidth, progress);
      const color = interpolateColors(progress, colors);
      const pathShape = makePathShape(progress);
      const originalTransform = context.getTransform();
      context.translate(0.5, 1.5);
      context.scale(7, 7);
      context.lineCap = "square";
      context.lineJoin = "miter";
      context.lineWidth = strokeWidth;
      context.strokeStyle = color;
      const path = new Path2D(pathShape.rawPath);
      context.stroke(path);
      context.setTransform(originalTransform);
    },
  };

  return addMargins(animation, { frozenBefore, frozenAfter });
}
const state1 = { iteration: 1, color: "red", strokeWidth: 0.045 };
const state2 = {
  iteration: 2,
  color: "white",
  strokeWidth: 0.03,
};
const state3 = {
  iteration: 3,
  color: BLUE,
  strokeWidth: 0.015,
};

const builder = new MakeShowableInParallel();
const inSeries = new MakeShowableInSeries();

builder.addJustified(blackBackground);

{
  // Script:
  // One large copy of the first iteration drawing.
  // Draw it with the handwriting effect.
  // Leave it in place when finished, where the second and third iterations will cover it.
  const peanoShowable = makeHandwritingForPeano(1, 2000, "red", 0.045);
  const chapterTitle = makeHandwritingForText(
    "First iteration of Peano curve",
    0.5,
    0.375,
    "red"
  );

  builder.addJustified(chapterTitle, CHAPTER_TITLE_DELAY + inSeries.duration);
  builder.addJustified(peanoShowable, inSeries.duration);
  inSeries.skip(Math.max(chapterTitle.duration, peanoShowable.duration) + 500);
}
{
  const duration = 6000;
  const peanoShowable = makeHandwritingForPeano(2, duration, "white", 0.03);

  const chapterTitle = makeHandwritingForText(
    "Second iteration",
    7.9375,
    0.375,
    "white"
  );
  builder.addJustified(chapterTitle, CHAPTER_TITLE_DELAY + inSeries.duration);
  builder.addJustified(peanoShowable, inSeries.duration);
  const initialPause = 500;
  const finalPause = 1000;
  const expander = createExpander(
    duration,
    initialPause,
    finalPause,
    state1,
    state2
  );

  inSeries.add(expander);
}

{
  const peanoShowable = makeHandwritingForPeano(3, 18000, BLUE, 0.015);
  const chapterTitle = makeHandwritingForText(
    "Third iteration",
    12,
    0.375,
    BLUE
  );
  builder.addJustified(chapterTitle, CHAPTER_TITLE_DELAY + inSeries.duration);
  builder.addJustified(peanoShowable, inSeries.duration);

  const expander1 = createExpander(9000, 500, 1500, state2, state3);
  const expander2 = createExpander(9000, 1000, 1500, state1, state3);
  inSeries.add(expander1);
  inSeries.add(expander2);
}

builder.add(inSeries.build("in series"));

/**
 * This section of the video shows the first 3 iterations of the Peano curve and how each compares to the others.
 */
export const peanoIterations = builder.build("Peano Iterations");
