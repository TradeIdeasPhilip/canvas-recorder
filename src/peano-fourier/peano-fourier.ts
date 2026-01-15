import { createPeanoPath } from "./peano-shared";
import {
  createFourierAnimation,
  getAnimationRules,
  numberOfFourierSamples,
  samplesFromPath,
  samplesToFourier,
} from "./fourier-shared";
import { MakeShowableInParallel, Showable, ShowOptions } from "../showable";
import { blackBackground, BLUE } from "../utility";
import { easeOut, timedKeyframes } from "../interpolate";
import { FULL_CIRCLE, lerp } from "phil-lib/misc";

// This is the main event.
// Display 3 complete iterations of the peano curve.
// And for each one a fourier series trying to approximate it.

const builder = new MakeShowableInParallel();

builder.addJustified(blackBackground);

const SIZE = new DOMMatrix("translate(-2px, -2px) scale(4)");

function createExample(
  iteration: number,
  positionOfReferencePath: DOMMatrixReadOnly,
  livePathX: number,
  color: string,
  lineWidth: number,
  keyframes: readonly number[],
  livePathChanges?: (
    timeInMS: number,
    context: CanvasRenderingContext2D
  ) => void
) {
  // Active element: [data-pf] and #pf2-container
  const path = createPeanoPath(iteration).transform(SIZE);
  {
    const samples = samplesFromPath(path.rawPath, numberOfFourierSamples);
    const terms = samplesToFourier(samples);
    const animationRules = getAnimationRules(terms, keyframes);
    const { getInfo, duration } = createFourierAnimation(animationRules);
    function show({ context, timeInMs }: ShowOptions) {
      const { pathShape } = getInfo(timeInMs);
      const path = new Path2D(pathShape.rawPath);
      const originalTransform = context.getTransform();
      //context.transform(positionOfLivePath.a, positionOfLivePath.b, positionOfLivePath.c, positionOfLivePath.d, positionOfLivePath.e, positionOfLivePath.f)
      context.translate(livePathX, 6.5);
      context.lineJoin = "round";
      context.lineCap = "round";
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      livePathChanges?.(timeInMs, context);
      context.stroke(path);
      context.setTransform(originalTransform);
    }
    builder.addJustified({
      description: `live path #${iteration}`,
      duration,
      show,
    });
  }

  // Reference elements:  [data-pf-ideal]
  const referencePath = new Path2D(
    path.transform(positionOfReferencePath).rawPath
  );
  const referenceShowable: Showable = {
    description: `reference path #${iteration}`,
    duration: 0,
    show({ context }) {
      context.strokeStyle = color;
      context.lineWidth = lineWidth * 0.75;
      context.lineCap = "square";
      context.lineJoin = "miter";
      context.stroke(referencePath);
    },
  };
  builder.addJustified(referenceShowable);
}

const keyframes = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  22, 22, 24, 26, 28, 30, 32, 34, 38, 42, 46, 50, 54, 58, 62, 66, 70, 74, 78,
  82, 86, 90, 94, 98, 102, 106, 110, 114, 118, 122, 132, 142, 152, 162, 172,
  182, 192, 202, 225, 250, 275, 300, 325, 350, 375, 400, 425, 450, 475, 1022,
  1022,
];

createExample(
  1,
  new DOMMatrixReadOnly("translateX(3px) translateY(2px) scale(0.75)"),
  3,
  "red",
  0.06,
  keyframes
);
{
  const animationStartTime = 67500;
  const animationDuration = 8000;
  const transformKeyframes = [
    { time: animationStartTime, value: 0 },
    { time: animationStartTime + animationDuration / 4, value: 1 },
    { time: animationStartTime + (animationDuration * 3) / 4, value: 1 },
    { time: animationStartTime + animationDuration, value: 0 },
  ];
  function animateTransform(
    timeInMS: number,
    context: CanvasRenderingContext2D
  ): void {
    const relevant = timedKeyframes(timeInMS, transformKeyframes);
    if (relevant.single && relevant.value == 0) {
      // An optimization.
      // Most of the time we do nothing.
      return;
    }
    let progress: number;
    if (relevant.single) {
      progress = relevant.value;
    } else {
      progress = lerp(relevant.from, relevant.to, relevant.progress);
    }
    progress = easeOut(progress);
    context.translate(0, progress * -4.5);
    context.scale(lerp(1, 0.25, progress), lerp(1, 0.75, progress));
    context.rotate((FULL_CIRCLE / 4) * progress);
  }
  builder.addNotes(
    "⭐️ spin and translate",
    animationStartTime - animationDuration * 0.25,
    animationDuration * 1.5
  );
  createExample(
    2,
    new DOMMatrixReadOnly("translateX(8px) translateY(2px) scale(0.75)"),
    8,
    "white",
    0.04,
    keyframes,
    animateTransform
  );
}
createExample(
  3,
  new DOMMatrixReadOnly("translateX(13px) translateY(2px) scale(0.75)"),
  13,
  BLUE,
  0.02,
  keyframes
);

//const debuggerText = getById("peano-fourier-debugger", SVGTextElement);
//builder.add(createFourierTracker(debuggerText, keyframes));

/*
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
*/

export const peanoFourier: Showable = builder.build("Peano Fourier");
