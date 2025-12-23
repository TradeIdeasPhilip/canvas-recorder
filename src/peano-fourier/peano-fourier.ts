import { getById, querySelector, querySelectorAll } from "phil-lib/client-misc";
import { createPeanoPath } from "./peano-shared";
import {
  createFourierAnimation,
  createFourierTracker,
  getAnimationRules,
  numberOfFourierSamples,
  samplesFromPath,
  samplesToFourier,
  simpleDestination,
} from "./fourier-shared";
import {
  commonHider,
  MakeShowableInParallel,
  Showable,
  wrapAnimation,
} from "./showable";

// This is the main event.
// Display 3 complete iterations of the peano curve.
// And for each one a fourier series trying to approximate it.

const builder = new MakeShowableInParallel();

const SIZE = new DOMMatrix("translate(-2px, -2px) scale(4)");

function createExample(iteration: number, keyframes: readonly number[]) {
  const activeElement = querySelector(
    `[data-pf="${iteration}"]`,
    SVGPathElement
  );
  const destination = simpleDestination(activeElement);
  const path = createPeanoPath(iteration).transform(SIZE);
  const samples = samplesFromPath(path.rawPath, numberOfFourierSamples);
  const terms = samplesToFourier(samples);
  const animationRules = getAnimationRules(terms, keyframes);
  const showable = createFourierAnimation(destination, animationRules);
  builder.addJustified(showable);
  const referenceElement = querySelector(
    `[data-pf-ideal="${iteration}"]`,
    SVGPathElement
  );
  referenceElement.setAttribute("d", path.rawPath);
}

const keyframes = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  22, 22, 24, 26, 28, 30, 32, 34, 38, 42, 46, 50, 54, 58, 62, 66, 70, 74, 78,
  82, 86, 90, 94, 98, 102, 106, 110, 114, 118, 122, 132, 142, 152, 162, 172,
  182, 192, 202, 225, 250, 275, 300, 325, 350, 375, 400, 425, 450, 475, 1022,
  1022,
];

console.log(keyframes);

createExample(1, keyframes);
createExample(2, keyframes);
createExample(3, keyframes);

const debuggerText = getById("peano-fourier-debugger", SVGTextElement);
builder.add(createFourierTracker(debuggerText, keyframes));

const spinner = querySelector('[data-pf="2"]', SVGPathElement);
builder.addJustified(
  wrapAnimation(
    spinner,
    [
      {
        offset: 0,
        transform: "translateY(0) scaleY(1) scaleX(1) rotate(0)",
        easing: "ease-out",
      },
      {
        offset: 0.25,
        transform: "translateY(-4.5px) scaleY(0.75) scaleX(0.25) rotate(90deg)",
        easing: "linear",
      },
      {
        offset: 0.75,
        transform: "translateY(-4.5px) scaleY(0.75) scaleX(0.25) rotate(90deg)",
        easing: "ease-in",
      },
      {
        offset: 1,
        transform: "translateY(0) scaleY(1) scaleX(1) rotate(0)",
        easing: "linear",
      },
    ],
    8000
  ),
  67500
);

const topElement = getById("peano-fourier", SVGGElement);

export const peanoFourier: Showable = commonHider(builder.build(), topElement);
