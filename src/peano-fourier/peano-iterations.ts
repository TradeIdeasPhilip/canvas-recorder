import { getById } from "phil-lib/client-misc";
import { Font } from "./glib/letters-base";
import {
  addMargins,
  commonHider,
  MakeShowableInParallel,
  MakeShowableInSeries,
  Showable,
  wrapAnimation,
} from "./showable";
import { createHandwriting } from "./glib/handwriting";
import { ParagraphLayout } from "./glib/paragraph-layout";
import { LCommand, PathShape } from "./glib/path-shape";
import { assertFinite, initializedArray, makeLinear } from "phil-lib/misc";
import { createPeanoPath, getSegmentLength } from "./peano-shared";

const mainSVG = getById("peano-iterations", SVGGElement);
const font = Font.cursive(0.37);

function makeChapterTitle(title: string, className: string) {
  const delayBefore = 500;
  const duration = (2500 / 30) * ((title.length + 30) / 2);
  const delayAfter = 1000;
  const layout = new ParagraphLayout(font);
  const wordInfo = layout.addText(title);
  const laidOut = layout.align();
  const pathShape = laidOut.singlePathShape();
  const handwriting = createHandwriting(pathShape);
  mainSVG.append(handwriting.topElement);
  handwriting.topElement.classList.add(className);
  const showable = handwriting.makeShowable({
    duration,
    delayAfter,
    delayBefore,
  });
  return showable;
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
  from: { iteration: number; color: string; strokeWidth: string },
  to: { iteration: number; color: string; strokeWidth: string },
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
  const pathElement = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path"
  );
  const animation = wrapAnimation(
    pathElement,
    {
      strokeWidth: [from.strokeWidth, to.strokeWidth],
      stroke: [from.color, ...midColors, to.color],
      d: [fromPath.cssPath, toPath.cssPath],
    },
    duration - frozenBefore - frozenAfter,
    "ease-out"
  );
  pathElement.style.transform = "translate(0.5px, 1.5px) scale(7)";
  pathElement.style.strokeLinecap = "square";
  pathElement.style.fill = "none";
  pathElement.style.strokeWidth = "0.05";
  mainSVG.append(pathElement);
  return addMargins(animation, { frozenBefore, frozenAfter });
}
const state1 = { iteration: 1, color: "red", strokeWidth: "0.045" };
const state2 = {
  iteration: 2,
  color: "white",
  strokeWidth: "0.03",
};
const state3 = {
  iteration: 3,
  color: "var(--blue)",
  strokeWidth: "0.015",
};

const builder = new MakeShowableInParallel();
const inSeries = new MakeShowableInSeries();

{
  // Script:
  // One large copy of the first iteration drawing.
  // Draw it with the handwriting effect.
  // Leave it in place when finished, where the second and third iterations will cover it.
  const peano0Shape = createPeanoPath(1); //PathShape.fromString(peano0D);
  const peanoHandwriting = createHandwriting(peano0Shape);
  peanoHandwriting.topElement.id = "peano-1-main";
  mainSVG.append(peanoHandwriting.topElement);
  const peanoShowable = peanoHandwriting.makeShowable({ duration: 2000 });
  const chapterTitle = makeChapterTitle(
    "First iteration of Peano curve",
    "iteration-1-text"
  );
  builder.add(
    addMargins(chapterTitle, {
      hiddenBefore: inSeries.duration,
      frozenAfter: Infinity,
    }),
    0
  );
  builder.add(
    addMargins(peanoShowable, {
      hiddenBefore: inSeries.duration,
      frozenAfter: Infinity,
    }),
    0
  );
  inSeries.skip(Math.max(chapterTitle.duration, peanoShowable.duration) + 500);
}
{
  const peanoShape = createPeanoPath(2);
  const peanoHandwriting = createHandwriting(peanoShape);
  peanoHandwriting.topElement.id = "peano-2-main";
  mainSVG.append(peanoHandwriting.topElement);

  const duration = 6000;
  const peanoShowable = peanoHandwriting.makeShowable({ duration });

  const chapterTitle = makeChapterTitle("Second iteration", "iteration-2-text");
  builder.add(
    addMargins(chapterTitle, {
      hiddenBefore: inSeries.duration,
      frozenAfter: Infinity,
    }),
    0
  );
  builder.add(
    addMargins(peanoShowable, {
      hiddenBefore: inSeries.duration,
      frozenAfter: Infinity,
    }),
    0
  );

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
  const peanoShape = createPeanoPath(3);
  const peanoHandwriting = createHandwriting(peanoShape);
  peanoHandwriting.topElement.id = "peano-3-main";
  mainSVG.append(peanoHandwriting.topElement);
  const peanoShowable = peanoHandwriting.makeShowable({ duration: 18000 });

  const chapterTitle = makeChapterTitle("Third iteration", "iteration-3-text");
  builder.add(
    addMargins(chapterTitle, {
      hiddenBefore: inSeries.duration,
      frozenAfter: Infinity,
    }),
    0
  );
  builder.add(
    addMargins(peanoShowable, {
      hiddenBefore: inSeries.duration,
      frozenAfter: Infinity,
    }),
    0
  );

  const expander1 = createExpander(9000, 500, 1500, state2, state3);
  const expander2 = createExpander(9000, 1000, 1500, state1, state3);
  inSeries.add(expander1);
  inSeries.add(expander2);
}

builder.add(inSeries.build());

/**
 * This section of the video shows the first 3 iterations of the Peano curve and how each compares to the others.
 */
export const peanoIterations = commonHider(builder.build(), mainSVG);
