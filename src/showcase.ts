import {
  FULL_CIRCLE,
  initializedArray,
  lerp,
  makeLinear,
  Random,
  ReadOnlyRect,
} from "phil-lib/misc";
import { LineFontMetrics, makeLineFont } from "./glib/line-font";
import { ParagraphLayout, WordInPlace } from "./glib/paragraph-layout";
import {
  ease,
  easeAndBack,
  easeIn,
  easeOut,
  interpolateColor,
  interpolateNumbers,
  interpolatePoints,
  Keyframe,
  Keyframes,
} from "./interpolate";
import { Point } from "./glib/path-shape";
import {
  MakeShowableInParallel,
  MakeShowableInSeries,
  ScheduleInfo,
  Showable,
  ShowOptions,
} from "./showable";
import { applyTransform, transform } from "./glib/transforms";
import { computeGridTransform, drawGrid } from "./glib/grid";
import { myRainbow } from "./glib/my-rainbow";
import { strokeColors } from "./stroke-colors";
import { panAndZoom } from "./glib/transforms";
import { Font } from "./glib/letters-base";
import { makePolygon } from "./peano-fourier/fourier-shared";
import {
  LCommand,
  ParametricFunction,
  ParametricToPath,
  PathShape,
} from "./glib/path-shape";
import { PathShapeSplitter } from "./glib/path-shape-splitter";
import { FullFormatter, PathElement } from "./fancy-text";
import { fixCorners, matchShapes } from "./morph-animation";
import { blackBackground, distribute, only } from "./utility";
import { zipper } from "./zipper";
import { createSingleImageComponent } from "./slide-components";

// Some of my examples constantly change as I try new things.
// These are examples that will stick around, so I can easily see how I did something in the past.

// "Notice timeInMs vs globalTime.  " +
// "timeInMs starts at 0 when the Showable starts.  " +
// "addMargins() will freeze that value at the beginning and end.  " +
// "globalTime is the number of milliseconds from the start of the video.  " +
// "It never freezes (unless you pause the video).";

const titleFont = makeLineFont(0.7);
const margin = 0.25;

/**
 * Default display time for a static showcase slide (no internal animation).
 * Used as the duration for content items added to a MakeShowableInParallel
 * group that is itself placed in the top-level series.
 *
 * Reminder: duration=0 is fine *inside* a parallel group (the group's total
 * duration is the max of all children, so 0-duration children run for however
 * long the group lasts).  But every MakeShowableInParallel group that goes
 * into a series needs at least one child with a nonzero duration — otherwise
 * the series allocates zero time to it and the GUI hides it entirely.
 */
const DEFAULT_SLIDE_DURATION_MS = 10_000;

/**
 * Default pre-roll: how long to hold a slide before the main action begins.
 * Gives the viewer a moment to orient before anything moves.
 */
const DEFAULT_PRE_ROLL_MS = 1_500;

/**
 * Default post-roll: how long to hold a slide after the main action ends.
 * Gives the viewer a moment to absorb the final state before the cut.
 */
const DEFAULT_POST_ROLL_MS = 2_000;

const sceneList = new MakeShowableInSeries("Scene List");
{
  const scene = new MakeShowableInParallel("Simple Text & Layout");
  {
    const pathShape = ParagraphLayout.singlePathShape({
      text: scene.description,
      font: titleFont,
      alignment: "center",
      width: 16,
    });
    const path = pathShape.canvasPath;
    const showable: Showable = {
      description: scene.description,
      duration: 0,
      show({ context }) {
        {
          context.lineCap = "round";
          context.lineJoin = "round";
          context.lineWidth = 0.07;
          context.strokeStyle = "yellow";
          context.stroke(path);
        }
      },
    };
    scene.add(showable);
  }

  {
    const font = makeLineFont(0.25);
    const period = 50_000;
    const top = 1.5;
    const dynamicText =
      "Dynamic Text:  " +
      "ParagraphLayout lets you request a specific width for your text.  " +
      "The default is unlimited, and you can ask what the resulting width is.\n\n" +
      "These fonts are strokable paths, just like the graph of a function or the outline of a shape, so you can use the same tools and tricks to manipulate them.";
    const fixedText =
      "Make it Fit:  " +
      "PathShape.makeItFit() uses panAndZoom() to fit into a given rectangle.  " +
      "This is inspired by SVG's viewBox.  " +
      "It keeps the aspect ratio while resizing.";
    const fixedPathShape = ParagraphLayout.singlePathShape({
      font,
      text: fixedText,
      alignment: "justify",
      width: 8 - 2 * margin,
    });
    const completelyFixedText =
      "Or use panAndZoom() directly, then apply the resulting transformation matrix to the canvas or an SVG element.  " +
      "This will change everything, including the line width.  " +
      "This is especially useful for transforming an entire scene.";
    const completelyFixedPathShape = ParagraphLayout.singlePathShape({
      font,
      text: completelyFixedText,
      alignment: "justify",
      width: 8 - 2 * margin,
    });
    const completelyFixedPath = completelyFixedPathShape.canvasPath;
    const showable: Showable = {
      description: "Make it fit",
      duration: period,
      soundClips: distribute(
        [
          {
            // "Simple text and layout A"
            source: "./Showcase.FLAC",
            startMsIntoScene: 0,
            startMsIntoClip: 2713.25,
            lengthMs: 11641.89,
          },
          {
            // "Simple text and layout B"
            source: "./Showcase.FLAC",
            startMsIntoScene: 0,
            startMsIntoClip: 20693.57,
            lengthMs: 34317.6,
          },
        ],
        { startFrom: 0, endAt: period, startWeight: 1, endWeight: 1 },
      ),
      show({ context, timeInMs }) {
        const progress = easeAndBack(timeInMs / this.duration);
        const centerLine = 4 + 8 * progress;
        const dynamicPathShape = ParagraphLayout.singlePathShape({
          font,
          text: dynamicText,
          alignment: "justify",
          width: centerLine - 2 * margin,
        }).translate(margin, top);
        const dynamicPath = dynamicPathShape.canvasPath;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = font.strokeWidth;
        context.strokeStyle = "lime";
        context.stroke(dynamicPath);

        const rightSide: ReadOnlyRect = {
          x: centerLine + margin,
          y: top,
          width: 16 - centerLine - 2 * margin,
          height: 9 - top - margin,
        };
        const fixedPath = fixedPathShape.makeItFit(
          rightSide,
          "srcRect fits completely into destRect",
          0.5,
          0,
        ).canvasPath;
        context.strokeStyle = "orange";
        context.stroke(fixedPath);

        const originalTransform = context.getTransform();
        applyTransform(
          context,
          panAndZoom(
            completelyFixedPathShape.getBBoxRect(),
            rightSide,
            "srcRect fits completely into destRect",
            0.5,
            1,
          ),
        );
        context.strokeStyle = "red";
        context.stroke(completelyFixedPath);
        context.setTransform(originalTransform);
      },
    };
    scene.add(showable);
  }
  sceneList.add(scene.build());
}

// ── Lissajous Curves ─────────────────────────────────────────────────────────
// Four display styles for the same curve, each in its own Showable.
// Related project: https://tradeideasphilip.github.io/random-svg-tests/parametric-path.html
// (https://github.com/TradeIdeasPhilip/random-svg-tests)
{
  /**
   * 3blue1brown / Manim color palette.
   * Source: https://github.com/3b1b/manim/blob/master/manimlib/utils/color_utils.py
   *
   * These colors are designed for math animations on a dark background,
   * as seen in 3blue1brown's YouTube channel and his Summer of Math Exposition (SoME) contest.
   */
  const threeB1B = {
    BLUE_E: "#1C758A",
    BLUE_D: "#29ABCA",
    BLUE: "#58C4DD",
    BLUE_B: "#9CDCEB",
    TEAL_E: "#49A88F",
    TEAL: "#5CD0B3",
    GREEN_E: "#699C52",
    GREEN: "#83C167",
    YELLOW_E: "#E8C11C",
    YELLOW: "#FFFF00",
    GOLD: "#C78D46",
    RED_E: "#CF5044",
    RED: "#FC6255",
    MAROON: "#C55F73",
    PURPLE: "#9A72AC",
    WHITE: "#FFFFFF",
    GREY: "#888888",
  };

  /**
   * Lissajous curve (3:2 frequency ratio) — the default example from
   * https://tradeideasphilip.github.io/random-svg-tests/parametric-path.html
   *
   * Parametric equations:
   *   x(t) = sin(3·2πt + π/2) = cos(6πt)
   *   y(t) = sin(4πt)
   * for t ∈ [0, 1] (one full period).
   */
  const lissajousF: ParametricFunction = (t) => {
    const angle = t * 2 * Math.PI;
    return {
      x: Math.sin(3 * angle + Math.PI / 2),
      y: Math.sin(2 * angle),
    };
  };

  // Build a high-quality path in math coordinates (x, y ∈ [−1, 1]).
  // ParametricToPath adaptively subdivides until the bezier approximation is tight.
  const lissajousPathMath = (() => {
    const p2p = new ParametricToPath(lissajousF);
    p2p.go();
    return p2p.pathShape;
  })();

  // Graph area on the 16×9 canvas.
  const GRAPH_RECT = { x: 1.5, y: 1.1, width: 13, height: 7.3 };
  // Math-space view: a square window around the unit square, with a small margin.
  const VIEW_RECT = { x: -1.25, y: -1.25, width: 2.5, height: 2.5 };

  // Coordinate transform shared between drawGrid() and PathShape.transform().
  // computeGridTransform() uses a y-flipped system (math y increases upward;
  // canvas y increases downward), so the DOMMatrix must negate scaleY.
  const { toCanvasX, toCanvasY } = computeGridTransform(GRAPH_RECT, VIEW_RECT)!;
  const mathScale = toCanvasX(1) - toCanvasX(0); // canvas units per math unit
  // DOMMatrix([a, b, c, d, e, f]) → x' = a·x + c·y + e, y' = b·x + d·y + f
  const canvasMatrix = new DOMMatrix([
    mathScale,
    0,
    0,
    -mathScale, // negative: flip y so math "up" maps to canvas "up"
    toCanvasX(0),
    toCanvasY(0),
  ]);

  // Lissajous path in canvas coordinates (used for drawing and for splitter).
  const canvasCurveShape = lissajousPathMath.transform(canvasMatrix);
  const canvasCurvePath = canvasCurveShape.canvasPath;
  const splitter = PathShapeSplitter.create(canvasCurveShape);

  const CURVE_LINE_WIDTH = 0.05;

  // Reusable: title + grid for all four scenes.
  function drawBackground(
    context: CanvasRenderingContext2D,
    titlePath: Path2D,
    titleColor: string,
  ) {
    drawGrid(context, { destRect: GRAPH_RECT, viewRect: VIEW_RECT });
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = titleFont.strokeWidth;
    context.strokeStyle = titleColor;
    context.stroke(titlePath);
  }

  function makeTitle(text: string) {
    return ParagraphLayout.singlePathShape({
      text,
      font: titleFont,
      alignment: "center",
      width: 16,
    }).canvasPath;
  }

  // ── Scene: Ridiculously Simple Fourier Decomposition ("A Better Square") ──
  // Formula: "A Better Square" from parametric-path.html.
  // https://tradeideasphilip.github.io/random-svg-tests/parametric-path.html
  {
    // Fourier coefficients for a square, computed via complex Fourier series.
    // Source: "Square with Easing" example at complex-fourier-series.html.
    // The first entry is a near-zero "seed" circle (amplitude 1/1000 of the real
    // first term) so the animation starts from a dot rather than a jump.
    // Most of these are pretty small and worth ignoring.
    const CIRCLES = [
      {
        frequency: 1,
        amplitude: 0.0006002108774487057,
        phase: -2.356194490192345,
      },
      {
        frequency: 1,
        amplitude: 0.6002108774487057,
        phase: -2.356194490192345,
      },
      {
        frequency: -3,
        amplitude: 0.12004217545570839,
        phase: -2.356194490192345,
      },
      {
        frequency: 5,
        amplitude: 0.017148882159337513,
        phase: 0.7853981633974483,
      },
      {
        frequency: -7,
        amplitude: 0.0057162939963831035,
        phase: -2.356194490192344,
      },
      {
        frequency: 9,
        amplitude: 0.0025983153910070288,
        phase: 0.7853981633974468,
      },
      {
        frequency: -11,
        amplitude: 0.0013990928373741655,
        phase: -2.356194490192343,
      },
      {
        frequency: 13,
        amplitude: 0.0008394556343162563,
        phase: 0.7853981633974426,
      },
      {
        frequency: -15,
        amplitude: 0.000543177105018045,
        phase: -2.3561944901923386,
      },
      {
        frequency: 17,
        amplitude: 0.00037164742117819677,
        phase: 0.7853981633974505,
      },
      {
        frequency: -19,
        amplitude: 0.0002654623706666915,
        phase: -2.3561944901923475,
      },
    ] as const;

    const preRollMs = 500;
    const postRollMs = 500;

    const soundClip = {
      source: "./Showcase.FLAC",
      startMsIntoScene: preRollMs,
      startMsIntoClip: 60355.13,
      lengthMs: 21577.15,
    };

    const SEGMENTS = 125;
    const SWEEP_MS = soundClip.lengthMs;
    const circleCountSchedule: Keyframe<number>[] = [
      { time: preRollMs, value: 1 },
      { time: preRollMs + SWEEP_MS / 3, value: 4 },
      { time: preRollMs + SWEEP_MS, value: 1 },
    ];

    // Fixed VIEW_RECT from the final animation state (input0 = 0.5, ~5½ circles).
    // The converging square has corners ≈ ±0.85; add margin.
    const SQUARE_VIEW_RECT = { x: -0.95, y: -0.95, width: 1.9, height: 1.9 };
    const squareXf = computeGridTransform(GRAPH_RECT, SQUARE_VIEW_RECT)!;
    const squareScale = squareXf.toCanvasX(1) - squareXf.toCanvasX(0);
    const squareMatrix = new DOMMatrix([
      squareScale,
      0,
      0,
      -squareScale,
      squareXf.toCanvasX(0),
      squareXf.toCanvasY(0),
    ]);

    const scene = new MakeShowableInParallel(
      "Ridiculously Simple Fourier Decomposition",
    );
    const squareTitleFont = makeLineFont(0.7 * 0.7); // 70% of normal; title is long
    const titlePath = ParagraphLayout.singlePathShape({
      text: scene.description,
      font: squareTitleFont,
      alignment: "center",
      width: 16,
    }).canvasPath;

    scene.add({
      description: "curve",
      duration: circleCountSchedule.at(-1)!.time + postRollMs,
      soundClips: [soundClip],
      show({ context, timeInMs }) {
        drawGrid(context, { destRect: GRAPH_RECT, viewRect: SQUARE_VIEW_RECT });
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = squareTitleFont.strokeWidth;
        context.strokeStyle = threeB1B.BLUE;
        context.stroke(titlePath);

        const numberOfCircles = interpolateNumbers(
          timeInMs,
          circleCountSchedule,
        );
        const circlesToConsider = Math.ceil(numberOfCircles);
        const attenuation = numberOfCircles - Math.floor(numberOfCircles);

        const squareF: ParametricFunction = (t) => {
          let x = 0,
            y = 0;
          for (let k = 0; k < circlesToConsider; k++) {
            const { frequency, amplitude, phase } = CIRCLES[k];
            const angle = 2 * Math.PI * frequency * t + phase;
            const factor =
              k === circlesToConsider - 1 && attenuation > 0 ? attenuation : 1;
            x += factor * amplitude * Math.cos(angle);
            y += factor * amplitude * Math.sin(angle);
          }
          return { x, y };
        };

        const squarePath = PathShape.parametric(squareF, SEGMENTS).transform(
          squareMatrix,
        ).canvasPath;

        context.lineWidth = CURVE_LINE_WIDTH;
        context.strokeStyle = threeB1B.BLUE;
        context.setLineDash([]);
        context.stroke(squarePath);
      },
    });
    sceneList.add(scene.build());
  }

  // ── Scene: tracing (draw then erase) — Heart Curve ♡ ────────────────────
  // Formula: x = 16·sin³θ,  y = 13·cosθ − 5·cos2θ − 2·cos3θ − cos4θ
  // https://tradeideasphilip.github.io/random-svg-tests/parametric-path.html
  {
    const DURATION = 6_000;

    // The formula title is long, so use a smaller font (adjust SCALE to taste).
    const HEART_TITLE_FONT_SCALE = 0.6; // fraction of the normal titleFont (0.7)
    const heartTitleFont = makeLineFont(0.7 * HEART_TITLE_FONT_SCALE);
    const scene = new MakeShowableInParallel(
      "16∙sin³(θ),   13∙cos(θ) - 5∙cos(2∙θ) - 2∙cos(3∙θ) - cos(4∙θ)",
    );
    const titlePath = ParagraphLayout.singlePathShape({
      text: scene.description,
      font: heartTitleFont,
      alignment: "center",
      width: 16,
    }).canvasPath;

    // Heart Curve ♡ parametric equations (math-convention y, not negated).
    // The canvasMatrix below flips y so it appears right-side up on screen.
    const heartF: ParametricFunction = (t) => {
      const angle = t * 2 * Math.PI;
      return {
        x: 16 * Math.sin(angle) ** 3,
        y:
          13 * Math.cos(angle) -
          5 * Math.cos(2 * angle) -
          2 * Math.cos(3 * angle) -
          Math.cos(4 * angle),
      };
    };
    const heartPathMath = (() => {
      const p2p = new ParametricToPath(heartF);
      p2p.go();
      return p2p.pathShape;
    })();

    // Natural bounds: x ∈ [−16, 16], y ∈ [−17, 13].  Square view with margin.
    const HEART_VIEW_RECT = { x: -18, y: -19, width: 36, height: 36 };
    const heartXf = computeGridTransform(GRAPH_RECT, HEART_VIEW_RECT)!;
    const heartScale = heartXf.toCanvasX(1) - heartXf.toCanvasX(0);
    const heartMatrix = new DOMMatrix([
      heartScale,
      0,
      0,
      -heartScale,
      heartXf.toCanvasX(0),
      heartXf.toCanvasY(0),
    ]);
    const heartCanvasShape = heartPathMath.transform(heartMatrix);

    scene.add({
      description: "tracing",
      duration: DURATION,
      soundClips: distribute(
        [
          {
            // "I love math."
            source: "./Showcase.FLAC",
            startMsIntoScene: 0,
            startMsIntoClip: 84664.52,
            lengthMs: 4245.4,
          },
        ],
        { startFrom: 0, endAt: DURATION },
      ),
      show({ context, timeInMs }) {
        // Grid + title (smaller font + strokeWidth to match).
        drawGrid(context, { destRect: GRAPH_RECT, viewRect: HEART_VIEW_RECT });
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = heartTitleFont.strokeWidth;
        context.strokeStyle = threeB1B.GREEN;
        context.stroke(titlePath);

        // Tracing animation: draw in, then erase from start.
        const p = timeInMs / DURATION;
        const fromP = p < 0.5 ? 0 : ease((p - 0.5) * 2);
        const toP = p < 0.5 ? ease(p * 2) : 1;
        if (toP > fromP) {
          const trimmed = PathShapeSplitter.trimProgress(
            heartCanvasShape,
            fromP,
            toP,
          );
          context.lineWidth = CURVE_LINE_WIDTH;
          context.strokeStyle = threeB1B.GREEN;
          context.setLineDash([]);
          context.stroke(trimmed.canvasPath);
        }
      },
    });
    sceneList.add(scene.build());
  }

  // ── Scene: #SoME5 Idea: Lissajous Spirals ───────────────────────────────
  {
    // x(t) = t·cos(2πt),  y(t) = t·sin(freqRatio·2πt)
    // freqRatio = 1 + input0 * 4,  t ∈ [0, 1]
    // Fixed VIEW_RECT from the final state (input0 = 1) so the viewport never jumps.
    const LISSAJOUS_SPIRAL_VIEW_RECT = {
      x: -1.15,
      y: -1.15,
      width: 2.3,
      height: 2.3,
    };
    const SEGMENTS = 225;
    const SWEEP_MS = 7_000;

    const spiralXf = computeGridTransform(
      GRAPH_RECT,
      LISSAJOUS_SPIRAL_VIEW_RECT,
    )!;
    const spiralScale = spiralXf.toCanvasX(1) - spiralXf.toCanvasX(0);
    const spiralMatrix = new DOMMatrix([
      spiralScale,
      0,
      0,
      -spiralScale,
      spiralXf.toCanvasX(0),
      spiralXf.toCanvasY(0),
    ]);

    const scene = new MakeShowableInParallel("#SoME5 Idea:  Lissajous Spirals");
    const titlePath = makeTitle(scene.description);
    scene.add({
      description: "spiral",
      duration: SWEEP_MS,
      soundClips: distribute(
        [
          {
            // "Easy to animate a parametric function."
            source: "./Showcase.FLAC",
            startMsIntoScene: 0,
            startMsIntoClip: 89377.88,
            lengthMs: 5523.96,
          },
        ],
        { startFrom: 0, endAt: SWEEP_MS },
      ),
      show({ context, timeInMs }) {
        drawBackground(context, titlePath, threeB1B.YELLOW_E);
        /**
         * The project I took this example from,
         * https://tradeideasphilip.github.io/random-svg-tests/parametric-path.html,
         * has sliders so you can explore things interactively *without* writing code.
         * `progress` replaces the slider.
         */
        const progress = timeInMs / this.duration;
        const freqRatio = 1 + progress * 4;
        const spiralF = (t: number) => ({
          x: t * Math.cos(2 * Math.PI * t),
          y: t * Math.sin(freqRatio * 2 * Math.PI * t),
        });
        const spiralPath = PathShape.parametric(spiralF, SEGMENTS).transform(
          spiralMatrix,
        ).canvasPath;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = CURVE_LINE_WIDTH;
        context.strokeStyle = threeB1B.YELLOW;
        context.setLineDash([]);
        context.stroke(spiralPath);
      },
    });
    sceneList.add(scene.build());
  }

  // ── Scene: arrow tracing the path ────────────────────────────────────────
  // Canvas analog of CSS offset-path.  PathShapeSplitter replaces motion-path,
  // positionAndAngleAt() gives exact position + tangent in one lookup.
  // Related: https://tradeideasphilip.github.io/random-svg-tests/parametric-path.html
  {
    const DURATION = 9_500;
    const scene = new MakeShowableInParallel("Lissajous Curves — arrow");
    const titlePath = makeTitle(scene.description);
    scene.add({
      description: "arrow",
      duration: DURATION,
      soundClips: distribute(
        [
          {
            // "another path example\n"
            source: "./Showcase.FLAC",
            startMsIntoScene: 0,
            startMsIntoClip: 107086.63,
            lengthMs: 8401.02,
          },
        ],
        { startFrom: 0, endAt: DURATION },
      ),
      show({ context, timeInMs }) {
        drawBackground(context, titlePath, threeB1B.RED);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = CURVE_LINE_WIDTH;

        // Ghost of the full curve at low opacity.
        context.save();
        context.globalAlpha = 0.25;
        context.strokeStyle = threeB1B.RED;
        context.setLineDash([]);
        context.stroke(canvasCurvePath);
        context.restore();

        // Growing trace from t=0 to current parameter.
        const progress = timeInMs / DURATION;
        const tracedShape = PathShapeSplitter.trimProgress(
          canvasCurveShape,
          0,
          progress,
        );
        context.strokeStyle = threeB1B.RED;
        context.setLineDash([]);
        context.stroke(tracedShape.canvasPath);

        // Arrowhead at current position, rotated to follow the tangent.
        const { x, y, angle } = splitter.positionAndAngleAt(
          progress * splitter.length,
        );
        const arrowSize = 0.28;
        context.save();
        context.translate(x, y);
        context.rotate(angle);
        context.beginPath();
        context.moveTo(arrowSize, 0);
        context.lineTo(-arrowSize * 0.55, arrowSize * 0.38);
        context.lineTo(-arrowSize * 0.55, -arrowSize * 0.38);
        context.closePath();
        context.fillStyle = threeB1B.RED;
        context.fill();
        context.restore();
      },
    });
    sceneList.add(scene.build());
  }

  // ── Scene: τ, π, and → following the path (CSS offset-path style) ────────
  // Formula: "Fourier square wave", numberOfCircles = 5 (fixed integer).
  // Because numberOfCircles is an exact integer, attenuation = 0 and the
  // partial-last-term factor disappears, leaving a clean sum of 5 sine waves.
  // Font, colors, and speeds copied from parametric-path.css.
  // https://github.com/TradeIdeasPhilip/random-svg-tests/blob/73fe4fe4fbe9e5dfa5dc937e3ea27940f42465d2/src/parametric-path.css#L76-L94
  {
    // The square wave is much wider than tall, so it needs its own view rect.
    // Note:  This is a very good aspect ratio.  It makes efficient use of the screen.
    const FOURIER_VIEW_RECT = { x: -2.8, y: -1.4, width: 5.6, height: 2.8 };
    const fourierXf = computeGridTransform(GRAPH_RECT, FOURIER_VIEW_RECT)!;
    const fourierScale = fourierXf.toCanvasX(1) - fourierXf.toCanvasX(0);
    const fourierMatrix = new DOMMatrix([
      fourierScale,
      0,
      0,
      -fourierScale,
      fourierXf.toCanvasX(0),
      fourierXf.toCanvasY(0),
    ]);

    // Fourier square wave, numberOfCircles = 5 (integer → no attenuation factor).
    const fourierF: ParametricFunction = (t) => {
      const baseAngle = 2 * Math.PI * 2.5 * t + Math.PI / 2; // 2.5 cycles
      let y = 0;
      for (let k = 0; k < 5; k++) {
        const n = 2 * k + 1; // odd harmonics: 1, 3, 5, 7, 9
        y += (4 / Math.PI / n) * Math.sin(n * baseAngle);
      }
      return { x: t * 5 - 2.5, y }; // x spans −2.5 to 2.5
    };
    const fourierPathMath = PathShape.glitchFreeParametric(fourierF, 150);
    const fourierCanvasShape = fourierPathMath.transform(fourierMatrix);
    const fourierCanvasPath = fourierCanvasShape.canvasPath;
    const fourierSplitter = PathShapeSplitter.create(fourierCanvasShape);

    const scene = new MakeShowableInParallel("offset-path CSS property");
    const titlePath = makeTitle(scene.description);

    // CSS: font-size: calc(var(--recommended-width) * 25px)
    // recommended-width = max(bBox.width, bBox.height) / 100 in path-coordinate units.
    const fourierBBox = fourierCanvasShape.getBBox();
    const recommendedWidth =
      Math.max(fourierBBox.x.size, fourierBBox.y.size) / 100;
    const labelFontSize = recommendedWidth * 25; // canvas units
    const LABEL_FONT = `${labelFontSize}px serif`;

    // CSS animation durations (ms per full loop) — unchanged from parametric-path.css.
    const TAU_PERIOD = 12_500;
    const PI_PERIOD = 25_000;
    /**
     * Half as fast as the example I took this from.
     * The arrow was rotating too fast originally.
     * It almost looked like flickering.
     */
    const ARROW_PERIOD = 20_967 * 2;

    // Draw background curve in a neutral color (CSS used stroke:black).
    scene.add({
      description: "curve",
      duration: 16875.04 + 500,
      soundClips: [
        {
          // "offset-path"
          source: "./Showcase.FLAC",
          startMsIntoScene: 0,
          startMsIntoClip: 119734.35,
          lengthMs: 16875.04,
        },
      ],
      show({ context }) {
        drawGrid(context, {
          destRect: GRAPH_RECT,
          viewRect: FOURIER_VIEW_RECT,
        });
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = titleFont.strokeWidth;
        context.strokeStyle = threeB1B.GREY;
        context.stroke(titlePath);
        context.lineWidth = CURVE_LINE_WIDTH;
        context.strokeStyle = threeB1B.GREY;
        context.setLineDash([]);
        context.stroke(fourierCanvasPath);
      },
    });

    // Helper: place text at a path position.
    // upright=true → offset-rotate:0deg (τ, π); upright=false → rotates with tangent (→).
    function drawMarker(
      context: CanvasRenderingContext2D,
      globalTime: number,
      period: number,
      char: string,
      color: string,
      upright: boolean,
    ) {
      const progress = (globalTime / period) % 1;
      const { x, y, angle } = fourierSplitter.positionAndAngleAt(
        progress * fourierSplitter.length,
      );
      context.save();
      context.font = LABEL_FONT;
      context.fillStyle = color;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.translate(x, y);
      if (!upright) context.rotate(angle);
      context.fillText(char, 0, 0);
      context.restore();
    }

    scene.add({
      description: "markers",
      duration: DEFAULT_SLIDE_DURATION_MS,
      show({ context, globalTime }) {
        // τ — brown, offset-rotate:0deg, 12500ms/loop
        drawMarker(context, globalTime, TAU_PERIOD, "τ", "brown", true);
        // π — teal, offset-rotate:0deg, 25000ms/loop
        drawMarker(context, globalTime, PI_PERIOD, "π", "rgb(0,113,139)", true);
        // → — pink, default offset-rotate (follows tangent), 20967ms/loop
        drawMarker(context, globalTime, ARROW_PERIOD, "→", "#eb90ee", false);
      },
    });

    sceneList.add(scene.build());
  }
}

// ── Flowers with N Petals ─────────────────────────────────────────────────────
// "Rounded Pentagram ⛤, Heptagram, etc." from parametric-path.html:
//   https://tradeideasphilip.github.io/random-svg-tests/parametric-path.html
// support.input(0) = 0.17787 (fixed), support.input(1) sweeps 0 → 1 over the animation.
// Filled with the "nonzero" winding rule; no stroke.
{
  const GRAPH_RECT = { x: 1.5, y: 1.1, width: 13, height: 7.3 };
  // Bounding box derived from the *final* animation state (input1 = 1, 10 trips).
  // The curve's maximum radius is r2 = 1.0, so a ±1.15 view with margin covers it.
  // This is fixed for the entire animation so the viewport never jumps.
  const VIEW_RECT = { x: -1.15, y: -1.15, width: 2.3, height: 2.3 };

  const { toCanvasX, toCanvasY } = computeGridTransform(GRAPH_RECT, VIEW_RECT)!;
  const mathScale = toCanvasX(1) - toCanvasX(0);
  const canvasMatrix = new DOMMatrix([
    mathScale,
    0,
    0,
    -mathScale,
    toCanvasX(0),
    toCanvasY(0),
  ]);

  const scene = new MakeShowableInParallel("Flowers with N Petals");
  const titlePath = ParagraphLayout.singlePathShape({
    text: scene.description,
    font: titleFont,
    alignment: "center",
    width: 16,
  }).canvasPath;

  // Fixed input — controls how "round" vs pointy the petals are.
  const INPUT_0 = 0.17787;
  const r1 = 0.5 * INPUT_0; // short radius of the reference ellipse
  const r2 = 1.0; // long radius

  const SEGMENTS = 153; // quality setting; default looked bad per author testing

  const SWEEP_MS = 7819.03 + 500;

  scene.add({
    description: "flower fill",
    duration: SWEEP_MS,
    soundClips: [
      {
        // "Fill a path, possibilities are unlimited."
        source: "./Showcase.FLAC",
        startMsIntoScene: 0,
        startMsIntoClip: 141667.94,
        lengthMs: 7819.03,
      },
    ],
    show({ context, timeInMs }) {
      drawGrid(context, { destRect: GRAPH_RECT, viewRect: VIEW_RECT });

      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = titleFont.strokeWidth;
      context.strokeStyle = myRainbow.magenta;
      context.stroke(titlePath);

      /**
       * The project I took this example from,
       * https://tradeideasphilip.github.io/random-svg-tests/parametric-path.html,
       * has sliders so you can explore things interactively *without* writing code.
       * `progress` replaces the slider.
       */
      const progress = easeIn(timeInMs / this.duration);
      const numberOfTrips = progress * 10;

      const flowerF: ParametricFunction = (t) => {
        const phase = Math.PI * t;
        const angle = t * 2 * Math.PI * numberOfTrips;
        const xEllipse = r1 * Math.cos(angle);
        const yEllipse = r2 * Math.sin(angle);
        return {
          x: xEllipse * Math.cos(phase) - yEllipse * Math.sin(phase),
          y: xEllipse * Math.sin(phase) + yEllipse * Math.cos(phase),
        };
      };

      const flowerCanvasPath = PathShape.parametric(
        flowerF,
        SEGMENTS,
      ).transform(canvasMatrix).canvasPath;

      context.fillStyle = myRainbow.magenta;
      context.fill(flowerCanvasPath, "nonzero");
    },
  });

  sceneList.add(scene.build());
}

{
  const scene = new MakeShowableInParallel("Strokable Font List");
  {
    const titlePath = ParagraphLayout.singlePathShape({
      text: scene.description,
      font: titleFont,
      alignment: "center",
      width: 16,
    }).canvasPath;
    const futuraPath = ParagraphLayout.singlePathShape({
      text: "There are currently 3 fonts available.  This is Futura L at size 0.5.",
      font: Font.futuraL(0.5),
      alignment: "right",
      width: 16 - 2 * margin,
    }).translate(margin, 1.75).canvasPath;
    const drawCursive = (() => {
      const formatted = new FullFormatter(Font.cursive(0.5))
        .add("This is Cursive at size 0.5.  This works especially well with ")
        .add("the handwriting effect")
        .add(".")
        .align({
          alignment: "center",
          width: 16 - 2 * margin,
          left: margin,
          top: 4,
        });
      const fixedElements = formatted.pathElements;
      const handwritingElements = fixedElements.splice(1, 1);
      const handwriting = PathElement.handwriting(
        handwritingElements,
        2000,
        8000,
      );
      function drawCursive(options: ShowOptions) {
        fixedElements.forEach((element) => element.show(options));
        handwriting(options);
      }
      return drawCursive;
    })();
    // const cursivePath = ParagraphLayout.singlePathShape({
    //   text: "This is Cursive at size 0.5.  This works especially well with the handwriting effect.",
    //   font: Font.cursive(0.5),
    //   alignment: "center",
    //   width: 16 - 2 * margin,
    // }).translate(margin, 4).canvasPath;
    const showable: Showable = {
      description: "simple parts",
      duration: 0,
      show(options) {
        {
          const context = options.context;
          context.lineCap = "round";
          context.lineJoin = "round";
          context.lineWidth = 0.07;
          context.strokeStyle = "magenta";
          context.stroke(titlePath);
          context.lineWidth = 0.04;
          context.strokeStyle = "rgb(128, 0, 255)";
          context.stroke(futuraPath);
          context.strokeStyle = "rgb(0, 0, 255)";
          drawCursive(options);
        }
      },
    };
    scene.add(showable);
  }
  {
    const showable: Showable = {
      description: "Fonts part 1",
      duration: 15_000,
      soundClips: [
        {
          // "font part 1\n"
          source: "./Showcase.FLAC",
          startMsIntoScene: (15_000 - 11427.44) / 2,
          startMsIntoClip: 153390.63,
          lengthMs: 11427.44,
        },
      ],
      show({ context, timeInMs }) {
        const progress = easeAndBack(timeInMs / this.duration);
        context.lineWidth = 0.04 + progress * 0.08;
        const path = ParagraphLayout.singlePathShape({
          text: "This is Line Font.  It has the most characters.  And it can adjust to different line thicknesses. ℕℤℚ",
          //text: "Don’t “Font.”  Mí ¿Cómo? ¡Azúcar! mamá él.  And it can Sierpiński; different: line thicknesses. ℕℤℚ",
          font: makeLineFont(new LineFontMetrics(0.5, context.lineWidth)),
          alignment: "left",
          width: 16 - 2 * margin,
        }).translate(margin, 6.25).canvasPath;
        context.strokeStyle = myRainbow.myBlue;
        context.stroke(path);
      },
    };
    scene.add(showable);
  }
  sceneList.add(scene.build());
}

{
  const scene = new MakeShowableInParallel("Font Samples");

  const FONT_SIZE = 0.35;
  const PAN_START_MS = 500;
  const PAN_END_MS = 15_500;
  const SCENE_DURATION = PAN_END_MS + 500;
  const BOLD_FACTOR = 2;

  const FUTURA_COLOR = "rgb(128, 0, 255)";
  const CURSIVE_COLOR = "rgb(0, 0, 255)";
  const LINE_COLOR = myRainbow.myBlue;

  const futuraBase = Font.futuraL(FONT_SIZE);
  const futuraOblique = futuraBase.oblique();
  const cursiveBase = Font.cursive(FONT_SIZE);
  const cursiveOblique = cursiveBase.oblique();
  const lineBase = makeLineFont(FONT_SIZE);
  const lineOblique = lineBase.oblique();
  const lineBold = makeLineFont(
    new LineFontMetrics(FONT_SIZE, lineBase.strokeWidth * BOLD_FACTOR),
  );

  const rowDefs = [
    {
      font: futuraBase,
      label: "Futura L",
      color: FUTURA_COLOR,
      strokeWidth: futuraBase.strokeWidth,
      groupStart: false,
    },
    {
      font: futuraOblique,
      label: "italic",
      color: FUTURA_COLOR,
      strokeWidth: futuraBase.strokeWidth,
      groupStart: false,
    },
    {
      font: futuraBase,
      label: "bold",
      color: FUTURA_COLOR,
      strokeWidth: futuraBase.strokeWidth * BOLD_FACTOR,
      groupStart: false,
    },
    {
      font: cursiveBase,
      label: "Cursive",
      color: CURSIVE_COLOR,
      strokeWidth: cursiveBase.strokeWidth,
      groupStart: true,
    },
    {
      font: cursiveOblique,
      label: "italic",
      color: CURSIVE_COLOR,
      strokeWidth: cursiveBase.strokeWidth,
      groupStart: false,
    },
    {
      font: cursiveBase,
      label: "bold",
      color: CURSIVE_COLOR,
      strokeWidth: cursiveBase.strokeWidth * BOLD_FACTOR,
      groupStart: false,
    },
    {
      font: lineBase,
      label: "Line Font",
      color: LINE_COLOR,
      strokeWidth: lineBase.strokeWidth,
      groupStart: true,
    },
    {
      font: lineOblique,
      label: "italic",
      color: LINE_COLOR,
      strokeWidth: lineBase.strokeWidth,
      groupStart: false,
    },
    {
      font: lineBold,
      label: "bold",
      color: LINE_COLOR,
      strokeWidth: lineBold.strokeWidth,
      groupStart: false,
    },
  ];

  const titlePath = ParagraphLayout.singlePathShape({
    text: scene.description,
    font: titleFont,
    alignment: "center",
    width: 16,
  }).canvasPath;

  const LINE_GAP = 0.075;
  const GROUP_GAP = 0.5;

  let nextTop = titleFont.bottom + 0.6;
  const rowData: {
    path: Path2D;
    textWidth: number;
    color: string;
    strokeWidth: number;
  }[] = [];
  for (const def of rowDefs) {
    if (def.groupStart) {
      nextTop += GROUP_GAP;
    }
    const baseline = nextTop - def.font.top;
    const layout = new ParagraphLayout(def.font);
    layout.addText(def.label + " " + def.font.getAllLetters());
    const laidOut = layout.align(Infinity, "left");
    const path = laidOut.singlePathShape().translate(0, baseline).canvasPath;
    const textWidth = laidOut.width;
    nextTop = baseline + def.font.bottom + LINE_GAP;
    rowData.push({
      path,
      textWidth,
      color: def.color,
      strokeWidth: def.strokeWidth,
    });
  }

  const panSchedule: Keyframe<number>[] = [
    { time: PAN_START_MS, value: 0 },
    { time: PAN_END_MS, value: 1 },
  ];

  const showable: Showable = {
    description: scene.description,
    duration: SCENE_DURATION,
    soundClips: [
      {
        // "font part 2"
        source: "./Showcase.FLAC",
        startMsIntoScene: 1_500,
        startMsIntoClip: 167869.88,
        lengthMs: 7613.79,
      },
    ],
    show({ context, timeInMs }) {
      context.lineCap = "round";
      context.lineJoin = "round";

      context.lineWidth = titleFont.strokeWidth;
      context.strokeStyle = "white";
      context.stroke(titlePath);

      const panProgress = interpolateNumbers(timeInMs, panSchedule);

      context.save();
      context.beginPath();
      context.rect(0, 0, 16, 9);
      context.clip();

      for (const row of rowData) {
        const xOffset =
          margin + panProgress * (16 - 2 * margin - row.textWidth);
        context.lineWidth = row.strokeWidth;
        context.strokeStyle = row.color;
        context.save();
        context.translate(xOffset, 0);
        context.stroke(row.path);
        context.restore();
      }

      context.restore();
    },
  };

  scene.add(showable);
  sceneList.add(scene.build());
}

{
  const scene = new MakeShowableInParallel("Formatting Pieces of Text");
  {
    const pathShape = ParagraphLayout.singlePathShape({
      text: scene.description,
      font: titleFont,
      alignment: "center",
      width: 16,
    });
    const path = pathShape.canvasPath;
    const showable: Showable = {
      description: scene.description,
      duration: 0,
      show({ context }) {
        {
          context.lineCap = "round";
          context.lineJoin = "round";
          context.lineWidth = 0.07;
          context.strokeStyle = myRainbow.myBlue;
          context.stroke(path);
        }
      },
    };
    scene.add(showable);
  }
  {
    const baseFont = makeLineFont(0.5);
    const obliqueFont = baseFont.oblique();
    const cursiveFont = Font.cursive(0.5);
    const showable: Showable = {
      description: "action",
      duration: 20000,
      soundClips: [
        {
          // "Formatting Text"
          source: "./Showcase.FLAC",
          startMsIntoScene: 1000,
          startMsIntoClip: 180084.69,
          lengthMs: 18065.01,
        },
      ],
      show({ context, timeInMs }) {
        const layout = new ParagraphLayout(baseFont);
        {
          const possible = "One, two, three.";
          const numberOfChars = Math.round(
            interpolateNumbers(timeInMs, [
              { time: this.duration / 8, value: 0 },
              { time: this.duration * 0.75, value: possible.length },
            ]),
          );

          layout.addText(possible.substring(0, numberOfChars));
          layout.addWord("| ", undefined, "cursor");
        }
        layout.addText("ParagraphLayout lets you format text: ");
        layout.addText("Bold", undefined, "bold");
        layout.addText(", ");
        layout.addText("oblique (italic)", obliqueFont, "oblique");
        layout.addText(", ");
        layout.addText("red", undefined, "red");
        layout.addText(", ");
        layout.addText("shaking", undefined, "shaking");
        layout.addText(", ");
        const rainbowWordInfo = layout.addText(
          "rainbow",
          undefined,
          "rainbow",
        )[0];
        layout.addText(", ");
        layout.addText("cursive, ", cursiveFont);
        layout.addText("BIG", titleFont);
        layout.addText(", ");
        layout.addText("redacted", undefined, "redacted");
        layout.addText(", ");
        layout.addText("handwriting", cursiveFont, "handwriting");
        layout.addText(", ");
        layout.addText("dashes", undefined, "dashes");
        layout.addText(", ");
        layout.addText("flashing", undefined, "flashing");
        layout.addText(", ");
        layout.addText("and more.");
        const layoutInfo = layout.align(15.5, "left", -0.1);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.04;
        context.strokeStyle = myRainbow.myBlue;
        const pathByTag = layoutInfo.pathShapeByTag();
        context.stroke(
          pathByTag.get(undefined)!.translate(0.25, 1.5).canvasPath,
        );
        if (timeInMs % 1000 > 500) {
          context.strokeStyle = "white";
          context.stroke(
            pathByTag.get("cursor")!.translate(0.25, 1.5).canvasPath,
          );
          context.strokeStyle = myRainbow.myBlue;
        }
        context.lineWidth = 0.08;
        context.stroke(pathByTag.get("bold")!.translate(0.25, 1.5).canvasPath);
        context.lineWidth = 0.04;
        context.stroke(
          pathByTag.get("oblique")!.translate(0.25, 1.5).canvasPath,
        );
        context.strokeStyle = "red";
        context.stroke(pathByTag.get("red")!.translate(0.25, 1.5).canvasPath);
        context.strokeStyle = myRainbow.myBlue;
        context.stroke(
          pathByTag
            .get("shaking")!
            .translate(0.25, 1.4 + Math.abs((timeInMs % 200) / 200 - 0.5) / 2)
            .canvasPath,
        );
        {
          const rainbowPathShape = pathByTag
            .get("rainbow")!
            .translate(0.25, 1.5);
          const rainbowBBox = rainbowPathShape.getBBox();
          const rainbow = context.createRadialGradient(
            rainbowBBox.x.mid,
            rainbowBBox.y.max,
            0,
            rainbowBBox.x.mid,
            rainbowBBox.y.max,
            (rainbowBBox.x.size / 2) * 1.1,
          );
          myRainbow
            .slice(0, 7)
            .reverse()
            .forEach((color, index, array) => {
              rainbow.addColorStop(index / (array.length - 1), color);
            });
          context.strokeStyle = rainbow;
          context.stroke(rainbowPathShape.canvasPath);
        }
        {
          //   const wordInfo=      layoutInfo.getAllLetters().find((wordInfo) => {wordInfo.word.wordInfo.tag=="redacted"})!;
          const bBox = pathByTag.get("redacted")!.getBBox();
          context.fillStyle = "blue";
          context.fillRect(
            bBox.x.min + 0.25,
            bBox.y.min + 1.5,
            bBox.x.size,
            bBox.y.size,
          );
        }
        context.strokeStyle = myRainbow.myBlue;
        {
          const basePath = pathByTag.get("handwriting")!.translate(0.25, 1.5);
          const progress = (timeInMs / this.duration) * 2;
          const pathShape = PathShapeSplitter.trimProgress(
            basePath,
            0,
            progress,
          );
          context.stroke(pathShape.canvasPath);
        }
        {
          const path = pathByTag.get("dashes")!.translate(0.25, 1.5).canvasPath;
          context.strokeStyle = "blue";
          context.stroke(path);
          context.strokeStyle = myRainbow.myBlue;
          context.setLineDash([0.1]);
          context.lineDashOffset = timeInMs / 5000;
          context.lineCap = "butt";
          context.stroke(path);
          context.lineCap = "round";
          context.setLineDash([]);
        }
        if (timeInMs % 1000 > 500) {
          context.stroke(
            pathByTag.get("flashing")!.translate(0.25, 1.5).canvasPath,
          );
        }
        {
          const fullPathShape = layoutInfo
            .singlePathShape()
            .translate(0.25, 5.4);
          context.stroke(fullPathShape.canvasPath);
        }
      },
    };
    scene.add(showable);
  }
  sceneList.add(scene.build());
}

{
  const scene = new MakeShowableInParallel("Simple Animated Colors");
  {
    const titlePath = ParagraphLayout.singlePathShape({
      text: scene.description,
      font: titleFont,
      alignment: "center",
      width: 16,
    });
    const starPath = makePolygon(5, 1).makeItFit(
      { x: 0.5, y: 1.5, width: 3, height: 3 },
      "srcRect fits completely into destRect",
    );
    /**
     * Source:  https://commons.wikimedia.org/wiki/File:Silhouette_of_the_Statue_of_Liberty_in_New_York.svg
     */
    const statueOfLiberty =
      "M251.494,156.465l-17.211-0.931l13.955-1.396l0.464-4.185l-18.608-2.327l20.936-1.396     l3.256-1.86l-15.817-17.213l19.54,12.095l8.372-0.929l2.325-21.865l3.723,20.934l9.305,1.396l13.955-9.768l-10.699,13.488     l3.721,3.258l21.4-5.583l-19.54,9.77l0.932,2.325l25.585,2.791l-26.05,3.723l-0.932,8.372c0,0,2.792,10.235,2.792,13.955     c0,3.723-4.651,6.514-2.792,8.375c1.86,1.862,6.979,13.493,6.979,13.493s4.187,5.581,5.582,5.581     c1.396,0,8.839,9.305,10.699,17.211c1.86,7.91,3.256,14.886,6.048,17.213c2.789,2.327,7.442,4.654,7.907,6.512     c0.467,1.862,6.979,0,6.979,0l3.256-7.906l2.792,0.465v-4.188l25.12,15.817l-2.327,2.792l0.932,3.721l-6.048,8.374     c0,0,4.188,0.465,3.257,4.652c-0.93,4.187-4.652,9.303-4.652,9.303l-4.651,6.047c0,0-7.443,6.514-9.304,4.187     c-1.862-2.327-0.931,33.493-11.63,33.028s-6.047-1.394-6.047,1.862s6.976,62.336,5.115,64.663     c-1.859,2.325-5.582,4.185-5.582,4.185l1.862,11.63l-3.259,2.791c0,0,2.792,30.237,1.396,33.028     c-1.396,2.792-4.652-0.929-4.652,3.256c0,4.187-3.256,42.798,10.234,53.033c4.652,1.862,3.723,16.284,3.723,16.284     s7.443,0.464,6.048,3.721c-1.396,3.256-7.443,27.909,0.465,29.308c7.907,1.394,16.746,7.907,16.746,7.907l-0.929,14.887     l-0.932,6.514l-8.839,9.304l1.86,63.265l2.327,1.862l-3.256,1.396l3.256,39.076l4.651,13.025l6.979,7.908l1.396,10.701     l-5.118,5.58c0,0,5.118,8.839,0.932,15.817c-2.327,5.581,3.72,5.116,3.72,5.116l4.654,4.654v29.306h24.654l14.886,5.583     l0.465,26.516l59.547,1.396l18.608,7.907l0.929,33.495l-17.211,3.256H30.525v-43.728h85.598v-31.168h43.263l1.859-37.682     l8.839-2.325c0,0-4.651-8.374-3.258-12.097c1.398-3.721,0.932-8.839-0.465-10.699c-1.394-1.86-0.929-12.562-0.929-12.562     l4.651-2.789l9.771-18.608l2.324-39.076c0,0-5.116-0.467-1.396-6.047c3.723-5.583,2.327-61.872,2.327-61.872l-8.374-10.234     l-0.467-6.979l-1.858-17.213l10.232-0.93v2.327l1.862-3.258l5.116,0.467l2.327-11.166l-0.467-21.398c0,0,1.397-4.653,3.258-4.653     s3.256-14.42,3.256-14.42l7.908-0.467c0,0-3.256-1.859,0.464-5.583c3.723-3.72,6.515-3.72,6.515-3.72s10.699-16.747,6.979-26.052     c-3.723-9.304,0.929-13.491,0.929-13.491s-3.721-29.772,1.396-44.659c-0.464-4.651-3.256-8.372-3.256-8.372     s6.515-6.514,5.119-13.957c-1.398-7.445-0.932-15.815-0.932-17.211c0-1.398-2.791-12.562-0.932-18.609     c1.863-6.047-5.116-4.187-5.116-8.838c0-4.652,1.396-10.235,3.257-16.282c1.859-6.049,2.324-20.002,2.324-20.002     s-9.768,0.929-10.234-1.863c-0.465-2.792,4.189-26.516,12.562-34.891c4.651-6.976-1.396-15.351-4.188-19.538     c-2.789-4.188-5.116-6.979-2.789-13.026c2.325-6.047,3.254-14.886-0.467-15.351c-3.723-0.464-8.372-9.768-8.372-9.768     s-7.443-9.77-6.979-20.469c0.465-10.701,12.095-25.587,12.095-25.587s-6.512-22.793-6.048-42.796     c0.465-20.004-0.464-7.445-0.464-7.445s-5.583-7.441-3.723-11.164s1.86-7.443,1.86-7.443s-5.116-3.256-5.116-7.443     c0-4.187-1.396-10.234,0-11.63c1.396-1.396,3.72-6.048,3.72-6.048l-6.512-7.443c0,0-2.791-6.047-0.931-8.839     s9.77-2.792,9.77-2.792l-0.931-8.839c0,0-7.443,0.932-5.581-5.118c1.86-6.047,8.839-12.095,8.372-15.351     c-0.465-3.256,6.979,5.583,6.979,5.583l6.512-2.792l0.465,3.723c0,0-0.465,14.419-4.185,14.419c-3.723,0-1.396,6.512-1.396,6.512     l10.699,1.398l1.396,12.095l-9.768,2.327l-1.862,12.095c0,0,6.515,8.374,6.515,15.351c0,6.976-1.863,17.677,0.464,25.587     c2.327,7.907,8.839,29.772,6.512,38.145c-2.326,8.374,6.513,2.324,7.443,10.699c0.932,8.375,3.723,17.678,6.048,15.351     C246.842,176.003,254.285,162.977,251.494,156.465z";
    const statueOfLibertyPath = PathShape.fromRawString(
      statueOfLiberty,
    ).makeItFit(
      { x: 11.5, width: 4, y: 1.5, height: 7 },
      "srcRect fits completely into destRect",
    );

    const sineWaveBase = PathShape.parametric((progress) => {
      const x = lerp(-FULL_CIRCLE, FULL_CIRCLE, progress);
      // Negative sign because math graphs say +y is up and computer graphics say +y is down.
      const y = -Math.sin(x);
      return { x, y };
    }, 21).makeItFit(
      { x: 4, y: 1.5, height: 3, width: 8 },
      "srcRect fits completely into destRect",
    );

    const endsAndCorners: {
      pathShape: PathShape;
      colors: string[];
      lineCap: CanvasLineCap;
      lineJoin: CanvasLineJoin;
    }[] = [];
    {
      const height = 2;
      const halfWidth = height / Math.sqrt(3);
      const width = 2 * halfWidth;
      const left = 0.75;
      const right = 12.25;
      const top = 5.25;
      const bottom = 8.25;
      const pointingDown = new PathShape([
        new LCommand(0, top, halfWidth, top + height),
        new LCommand(halfWidth, top + height, width, top),
      ]);
      const pointingUp = new PathShape([
        new LCommand(0, bottom, halfWidth, bottom - height),
        new LCommand(halfWidth, bottom - height, width, bottom),
      ]);
      const getXOffset = makeLinear(0, left, 5, right - width);
      for (let i = 0; i < 6; i++) {
        const bottomRow = i % 2 == 0;
        const pathShape = (bottomRow ? pointingUp : pointingDown).translate(
          getXOffset(i),
          0,
        );
        const firstColor = bottomRow ? myRainbow.red : myRainbow.cssBlue;
        const lineCap: CanvasLineCap = bottomRow ? "square" : "round";
        const joinType = Math.floor(i / 2);
        let secondColor: string;
        let lineJoin: CanvasLineJoin;
        switch (joinType) {
          case 0: {
            secondColor = myRainbow.yellow;
            lineJoin = "round";
            break;
          }
          case 1: {
            secondColor = myRainbow.cyan;
            lineJoin = "bevel";
            break;
          }
          case 2: {
            secondColor = myRainbow.green;
            lineJoin = "miter";
            break;
          }
          default: {
            throw new Error("wtf");
          }
        }
        endsAndCorners.push({
          pathShape,
          colors: [firstColor, secondColor],
          lineCap,
          lineJoin,
        });
      }
    }

    const showable: Showable = {
      description: scene.description,
      duration: 16_000,
      soundClips: [
        {
          // "Stroke Colors"
          source: "./Showcase.FLAC",
          startMsIntoScene: 1_000,
          startMsIntoClip: 201834.92,
          lengthMs: 13526.17,
        },
      ],
      show({ context, timeInMs }) {
        const progress = timeInMs / this.duration;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.07;
        strokeColors({
          context,
          pathShape: titlePath,
          repeatCount: 3,
          relativeOffset: -progress * 3,
        });
        context.lineCap = "butt";
        strokeColors({
          context,
          pathShape: sineWaveBase,
          colors: ["rgb(0, 128, 255)", "rgb(0, 64, 255)", "rgb(0, 0, 255)"],
          sectionLength: 0.125,
          relativeOffset: -progress * 10,
        });
        context.strokeStyle = "pink";
        context.setLineDash([0.125]);
        ((context.lineDashOffset = (-progress * 10) / 3),
          context.stroke(sineWaveBase.translate(0, 1).canvasPath));
        context.setLineDash([]);
        context.lineCap = "round";
        context.lineJoin = "miter";
        strokeColors({
          context,
          pathShape: starPath,
          repeatCount: 2,
          relativeOffset: progress * 2,
        });
        context.lineWidth = 0.03;
        strokeColors({
          context,
          pathShape: statueOfLibertyPath,
          colors: ["#01413e", "#297d6f", "#8fd7c4", "#d7ffff"],
          sectionLength: 0.05,
          offset: progress * 3,
        });
        context.lineWidth = 0.4;
        endsAndCorners.forEach(
          ({ pathShape, colors, lineCap, lineJoin }, index, array) => {
            context.lineCap = lineCap;
            context.lineJoin = lineJoin;
            strokeColors({
              context,
              pathShape,
              colors,
              repeatCount: 5,
              relativeOffset: progress * -10 + index / array.length / 2,
            });
          },
        );
      },
    };
    scene.add(showable);
  }
  sceneList.add(scene.build());
}

{
  // Warning:  Something abut this effect doesn't work well under Safari.
  // Most things seem to work okay with Safari, just not this.
  // I use Chrome for most of my development and testing.
  const scene = new MakeShowableInParallel("Calligraphy Effect");

  const titleShape = ParagraphLayout.singlePathShape({
    text: scene.description,
    font: titleFont,
    alignment: "center",
    width: 16,
  });

  const starShape = makePolygon(5, 1).makeItFit(
    { x: 0.25, y: 1.3, width: 3.5, height: 2.5 },
    "srcRect fits completely into destRect",
  );

  /**
   * Source: https://commons.wikimedia.org/wiki/File:Silhouette_of_a_walking_man.svg
   * Same path as fourier-intro.ts.
   */
  const manWalkingString =
    "m 162.81052,281.96784 c -1.50718,-0.23517 -3.79154,-0.26875 -8.28226,-0.12173 -3.66887,-0.16163 -9.49434,0.84633 -12.0441,-1.41149 -1.1392,-1.03031 -1.63691,-3.7278 -1.02114,-5.53444 0.71948,-2.11092 0.87111,-3.02527 0.85162,-5.13557 -0.0303,-3.28067 -0.3112,-4.83217 -1.64779,-9.10101 -1.17123,-3.34241 -2.01346,-7.11879 -3.29157,-10.0612 -1.87435,-5.24418 -5.34593,-10.40828 -7.05512,-14.91199 -0.52397,-1.48957 -1.15806,-4.68711 -1.27419,-6.4253 -0.22587,-3.38074 -0.072,-12.01403 0.35351,-19.8272 l 0.11682,-2.14524 -2.4536,-2.47027 c -11.40415,-10.2362 -14.05433,-16.50329 -20.06829,-26.08935 -0.35437,0.80318 -2.3959,3.5913 -4.63291,6.32715 -5.406446,6.69102 -9.444342,12.73922 -14.170015,19.43716 -0.87943,1.24507 -1.05964,1.53909 -2.2311,3.64011 -2.54858,4.9182 -5.845936,5.69139 -8.69936,6.44804 -2.67995,0.70776 -3.9994,1.61383 -7.49319,5.14556 -4.177808,5.16969 -8.440746,9.61922 -13.02222,14.01954 -4.631287,4.94363 -10.368608,8.91571 -14.61408,14.2101 -0.95595,1.24975 -2.22788,3.66274 -3.14856,5.97321 -0.76279,1.91422 -0.96122,2.67756 -1.37764,5.29952 -0.89251,5.61979 -1.20613,7.20769 -2.0158,10.20613 -0.462386,1.8156 -0.967982,3.59658 -0.9732,5.45489 0.682387,0.62699 1.432024,1.41931 2.25029,1.69476 0.37127,0.12038 0.98411,0.39467 1.36187,0.60955 0.57055,0.32451 0.90594,0.4097 1.98073,0.50306 1.43738,0.12486 1.63933,0.19891 2.12894,0.78079 0.54877,0.65218 0.38252,1.2918 -0.5251,2.0202 -0.80622,0.64702 -1.30917,0.74967 -3.62978,0.74084 -1.84126,-0.007 -2.15073,-0.0396 -2.61251,-0.27519 -0.3998,-0.20397 -0.86079,-0.28253 -1.94711,-0.33187 -2.96544,-0.13466 -3.57996,-0.37497 -4.69528,-1.83599 -1.189177,-1.51945 -3.101593,-3.01709 -3.47807,-4.5505 -0.211212,-0.86027 0.280806,-5.17726 -0.24927,-7.1508 -0.530076,-1.97354 -1.70905,-5.30052 -2.32352,-6.5174 -0.5641,-1.11712 -0.67896,-1.25234 -1.95638,-2.30299 -1.92748,-1.58531 -2.57724,-2.50151 -2.76966,-3.90538 -0.03303,-1.79038 1.836985,-3.35366 3.17395,-4.19598 1.341567,-0.84263 2.72667,-1.84895 3.92144,-2.64511 7.108718,-5.18944 7.310481,-6.85325 15.40834,-18.77623 1.68355,-2.45894 2.60087,-4.06015 4.40092,-7.68202 3.689829,-7.19731 7.836088,-11.39659 13.87288,-14.82284 3.445829,-1.94466 4.781552,-3.91776 6.85901,-5.62635 1.926714,-1.3198 2.272277,-3.52527 3.42274,-5.3802 0.76165,-1.15444 1.6406,-2.51521 1.94638,-3.01334 1.488387,-3.62479 2.321259,-7.54135 3.69969,-11.39674 1.217033,-4.17834 3.26889,-8.08576 5.51568,-11.31125 1.892657,-2.91725 3.899602,-4.89169 5.03442,-7.63267 0.56133,-1.36282 1.08515,-3.34081 1.08515,-4.09762 0,-0.27786 -0.17818,-0.54913 -0.70195,-1.06874 -0.82539,-0.81881 -1.25888,-1.52467 -1.61983,-2.63757 -0.441008,-2.998 -0.537968,-6.38991 0.43476,-9.34254 0.66859,-2.00034 2.79829,-5.16472 5.19872,-7.72447 0.797949,-0.93121 1.605296,-1.975 2.32651,-2.77274 1.03059,-1.13689 1.21305,-1.41608 1.65687,-2.53528 0.545628,-1.31636 0.799652,-2.83479 0.90724,-4.14813 0.17592,-2.30779 0.69536,-5.33456 1.21513,-7.08051 0.58866,-1.97735 0.55332,-2.25855 -0.67511,-5.37077 -1.03531,-2.62294 -1.72156,-4.84412 -1.72156,-5.57214 0,-0.26044 -0.0361,-0.47353 -0.0803,-0.47353 -0.17368,0 -2.15432,1.88065 -2.31476,2.1979 -0.498356,3.23891 -0.992044,6.84365 -1.95798,9.60509 -0.19931,1.20951 -1.87164,5.70877 -2.95836,7.9592 -0.468145,1.08128 -1.341286,1.89136 -1.67433,3.04135 -0.735487,1.77618 -1.080371,3.47279 -1.53918,5.21457 -0.975397,4.72204 -1.323862,8.85188 -1.95649,13.00923 -0.263182,1.39262 -1.27556,4.18524 -2.2109,5.38781 -2.12211,3.51939 -5.426114,7.50361 -7.24391,10.546 -0.83734,1.47118 -1.46633,1.79999 -6.92701,3.62114 -0.67933,0.22656 -1.47869,0.46379 -1.77637,0.52717 -1.26622,0.26962 -3.7316,-0.58479 -5.07286,-1.75809 -0.717857,-0.74556 -1.787625,-0.85888 -2.60389,-1.44811 -1.103034,-1.22072 0.03208,-2.03368 0.93717,-1.80205 -1.001001,-0.56812 -2.464141,-1.23317 -2.81284,-2.28251 -0.02913,-1.95761 2.279282,-0.71611 2.98317,-0.57438 -0.576806,-0.76878 -2.060432,-1.36308 -1.21637,-2.47919 0.381,-0.38099 1.11168,-0.22652 2.09798,0.0727 0.35103,0.10648 1.09229,-0.004 1.64726,-0.003 1.40297,0.002 1.96264,-0.28429 3.36373,-1.7204 0.89787,-0.92031 1.15558,-1.27282 1.28823,-1.76206 0.26253,-0.96827 0.70296,-1.74594 1.68595,-2.97692 0.95775,-1.19936 1.5897,-1.78014 3.65188,-3.35618 l 1.24774,-0.95359 0.39859,-1.14795 c 0.51958,-1.49641 0.55208,-1.81672 0.69031,-6.80372 0.25546,-9.21572 0.46992,-11.59818 1.44538,-16.05664 0.28507,-1.30296 1.5068,-4.98679 2.24218,-6.76075 1.26378,-3.04862 2.65555,-7.14437 3.07051,-9.036 0.37281,-1.6995 0.78633,-2.63592 1.75112,-3.96544 1.14452,-1.57719 1.78011,-3.03003 3.72556,-8.515952 0.52784,-1.488444 2.27706,-5.21298 3.06908,-6.534876 1.08499,-1.810852 2.34866,-4.161195 2.56804,-4.776379 0.14695,-0.412081 0.24301,-1.392325 0.32489,-3.315369 0.0264,-3.56223 0.860108,-5.028193 1.81844,-8.239513 0.60785,-2.049119 1.0048,-2.804188 2.23025,-4.242364 1.424173,-1.539271 2.528344,-3.356861 4.1385,-4.714361 2.16068,-1.787432 2.10628,-1.724129 2.720695,-3.165859 1.00679,-2.116833 1.95043,-4.454431 2.61675,-6.421305 1.279,-3.79427 1.4516,-4.906508 1.0323,-6.652012 -0.37013,-1.540807 -0.50158,-2.578384 -0.63966,-5.048858 -0.0639,-1.144127 -0.23849,-2.801509 -0.38789,-3.683071 -0.33642,-1.985155 -0.37082,-4.989885 -0.0735,-6.417051 0.41889,-2.01049 1.47366,-3.989766 3.06243,-5.746672 1.90424,-1.933559 4.06008,-2.76992 6.16545,-3.537427 0.25193,-0.161971 2.18498,-0.623795 3.51039,-0.838666 1.97214,-0.319718 7.68476,0.03324 9.62142,0.594457 3.40606,0.858022 6.79893,3.368785 8.02679,6.200128 0.25683,0.377466 0.61546,2.410992 0.6236,3.535877 0.33835,2.255115 0.50898,4.160451 0.96931,6.382035 0.35888,1.704177 0.31479,2.114649 -0.32893,3.062558 l -0.55496,0.81722 c 0.15393,1.373601 0.30483,2.750292 0.50542,4.11611 0.24704,1.668021 0.24232,3.671457 -0.01,4.159027 -0.31494,0.682254 -0.2998,0.781521 -2.37441,0.781521 l -0.2168,0.863113 c -0.28393,1.130364 -0.48028,1.488802 -1.11154,2.029131 -0.47116,0.403299 -0.55855,0.262485 -0.55855,0.803429 0.0953,0.665317 -0.17476,1.001654 -0.6794,1.374447 -0.85546,0.63197 -1.03305,0.883764 -1.28411,1.820645 -0.5251,1.959526 -1.09668,3.159875 -1.67098,3.509125 -0.88077,0.535631 -2.73038,0.451048 -4.70663,-0.215236 -1.0389,-0.350262 -3.31191,-0.440427 -3.5555,-0.141039 -0.4394,0.801076 -0.78051,1.649671 -1.2326,2.450318 -0.85031,1.312682 -0.59634,3.131561 -0.65967,4.4517 0.44627,0.829409 0.83013,1.742997 1.02211,2.62154 0.28058,1.324805 0.95946,2.639649 2.21527,4.290476 4.29086,5.88878 8.73368,14.524004 7.01285,20.932324 -0.24231,1.473605 -0.21653,1.707965 0.33349,3.032459 1.73207,2.76085 0.90327,8.72975 -0.38656,12.69929 -0.14319,0.42905 -0.21064,0.82987 -0.14988,0.89071 1.24683,0.49064 2.66328,0.89663 3.84166,1.31365 4.05125,1.54281 7.53225,2.43795 11.24625,3.38267 4.53745,1.15585 8.64519,1.18966 9.77606,0.99911 1.14164,-0.19237 3.31666,-0.86789 6.28418,-1.01548 0,0 0.90932,-0.17971 1.43362,-0.0713 0.5243,0.10841 2.07698,0.87598 3.1734,1.06088 1.03718,0.16336 2.4579,0.57255 3.06037,0.88145 0.793,0.40658 2.06908,2.04975 2.27076,2.92399 0.29089,1.26093 0.0498,3.19557 -0.44987,3.61027 -0.27736,0.64963 -0.006,1.26885 -0.15708,2.0158 -0.143,0.66938 -0.69547,0.97461 -1.76454,0.9749 -0.69905,1.3e-4 -0.76025,0.0248 -0.88794,0.35774 -0.13981,0.547 6.9e-4,1.07754 -0.1253,1.60908 -0.1661,0.31037 -1.31947,0.85354 -2.06583,0.97289 -0.28255,0.0452 -0.61761,0.19695 -0.74458,0.33725 -0.28063,0.31008 -0.99896,0.62368 -1.42862,0.62368 -1.06773,-0.0984 -1.32365,-1.13032 -0.94585,-1.76638 0.2501,-0.40466 0.25362,-0.45224 0.056,-0.7539 -0.45002,-0.68681 -0.64382,-0.73008 -3.26938,-0.73008 -2.72286,0.12914 -5.10949,-0.49754 -7.65754,-0.65014 -0.84657,-1.3e-4 -2.40599,-0.82914 -3.56757,-1.89655 -0.36479,-0.33522 -1.10552,-0.53051 -2.7303,-0.71983 -3.40547,-0.40706 -6.24701,-0.7065 -9.55606,-1.15467 -3.58155,-0.48683 -7.3739,-0.78675 -7.50635,-0.59363 -0.0525,0.0766 -0.0956,0.69509 -0.0958,1.37441 0,2.13029 -0.43395,7.64323 -0.72262,9.18905 -0.26804,1.43533 -0.65799,2.85636 -1.04563,3.81034 -0.39814,0.97983 -0.63906,2.81407 -0.51803,3.94415 0.64956,2.97583 3.5486,5.56819 5.99664,9.82642 1.50462,2.0098 4.43981,7.17346 5.8089,10.21915 4.91409,10.93194 5.31931,12.05262 6.86361,18.98211 0.78964,3.54328 1.54383,6.12255 2.35703,8.06089 0.70876,1.68941 2.86562,5.8437 3.54385,6.82576 1.21938,1.76561 1.41642,2.60093 1.63782,6.94311 0.12495,2.45043 0.11623,3.05986 -0.0625,4.36907 -0.33645,2.46449 -0.25303,5.06807 0.23535,7.34489 0.61962,4.17892 1.06505,8.26005 1.75547,12.0976 0.7873,4.30254 1.0254,7.21107 1.19642,14.61484 0.10175,3.28361 0.10231,6.53137 0.72063,9.6916 0.61698,3.19558 0.81177,4.01083 1.27688,5.34414 1.46778,5.28066 3.94195,6.79937 5.07635,8.63864 0.8088,1.22766 1.43534,1.58957 3.94225,2.2772 2.86428,0.78564 2.69667,0.72364 4.51498,1.67007 0.90819,0.47272 1.81339,0.85704 2.01858,0.85704 0.20461,0 1.09171,0.15797 1.97132,0.35104 1.99493,0.4078 3.273,0.39254 5.26544,0.442 l 0.96225,-0.37892 c 0.52924,-0.20841 1.16724,-0.41603 1.41778,-0.46139 0.25562,-0.0463 0.87275,-0.39635 1.40622,-0.79768 1.19385,-0.89811 1.57582,-0.93545 2.27233,-0.22215 0.64132,0.65678 0.67215,1.39661 0.0937,2.25019 -0.21322,0.31468 -0.38896,0.7184 -0.39052,0.89717 -0.005,0.56099 -0.44694,1.09393 -1.27201,1.53369 -0.54134,0.28853 -0.93069,0.61832 -1.24272,1.05263 -0.3938,0.54816 -0.58159,0.67921 -1.40853,0.98299 -1.59308,0.58524 -1.89535,0.73639 -2.2773,1.13878 -1.25504,1.1053 -2.51166,1.08655 -3.88973,1.94372 -0.9354,0.59322 -1.50177,0.75247 -3.16686,0.89048 -1.78392,0.14787 -5.11191,0.13718 -6.11688,-0.0196 z";
  const manWalkingShape = PathShape.fromRawString(manWalkingString)
    .transform(new DOMMatrix("scale(0.025)"))
    .makeItFit(
      { x: 0.25, y: 4.1, width: 3.5, height: 4.7 },
      "srcRect fits completely into destRect",
    );

  const sineShape = PathShape.parametric((progress) => {
    const x = lerp(-FULL_CIRCLE, FULL_CIRCLE, progress);
    return { x, y: -Math.sin(x) };
  }, 21).makeItFit(
    { x: 4.5, y: 1.3, width: 11, height: 2.5 },
    "srcRect fits completely into destRect",
  );

  const cursiveFont = Font.cursive(0.55);
  const cursiveShape = (() => {
    const layout = new ParagraphLayout(cursiveFont);
    layout.addText("The quick brown fox jumps over the lazy dog.");
    return layout.align(11, "center").singlePathShape().translate(4.5, 5.5);
  })();

  const DURATION = 12_000;
  // Eccentricity: 1 = circular pen, >1 = elliptical (calligraphic).
  const eccentricitySchedule: Keyframe<number>[] = [
    { time: 0, value: 1, easeAfter: ease },
    { time: 3_000, value: 3, easeAfter: ease },
    { time: 6_000, value: 1, easeAfter: ease },
    { time: 9_000, value: 3, easeAfter: ease },
    { time: DURATION, value: 1 },
  ];
  // Angle in degrees: the orientation of the ellipse's major axis.
  const angleSchedule: Keyframe<number>[] = [
    { time: 0, value: -45 },
    { time: DURATION, value: 45 },
  ];

  const showable: Showable = {
    description: scene.description,
    duration: DURATION,
    soundClips: [
      {
        source: "./Showcase.FLAC",
        startMsIntoScene: 1000,
        startMsIntoClip: 229540.9,
        lengthMs: 10190.25,
      },
    ],
    schedules: [
      {
        description: "Eccentricity",
        type: "number",
        schedule: eccentricitySchedule,
      },
      {
        description: "Angle (degrees)",
        type: "number",
        schedule: angleSchedule,
      },
    ],
    show({ context, timeInMs }) {
      context.lineCap = "round";
      context.lineJoin = "round";

      const eccentricity = interpolateNumbers(timeInMs, eccentricitySchedule);
      const angleDeg = interpolateNumbers(timeInMs, angleSchedule);

      // T is applied to the canvas, stretching the circular pen tip into an ellipse.
      // TInv is the inverse transform applied to each path, so T(TInv(path)) = original
      // path positions — the shapes look correct but are drawn with an elliptical pen.
      // rotateSelf/scaleSelf take degrees; angleDeg is stored in degrees.
      const T = new DOMMatrix()
        .rotateSelf(angleDeg)
        .scaleSelf(eccentricity, 1)
        .rotateSelf(-angleDeg);
      const TInv = new DOMMatrix()
        .rotateSelf(angleDeg)
        .scaleSelf(1 / eccentricity, 1)
        .rotateSelf(-angleDeg);

      /**
       * Stroke the shape, but use an elliptical pen instead of the default circular pen.
       *
       * This is an interesting effect in its own.
       * But it's really just a straw man, an example of how you can insert all sorts of special effects into the drawing pipeline.
       * @param shape
       * @param lineWidth
       * @param color
       */
      const drawCalligraphy = (
        shape: PathShape,
        lineWidth: number,
        color: string,
      ) => {
        context.lineWidth = lineWidth;
        context.strokeStyle = color;
        const preTransformed = shape.transform(TInv).canvasPath;
        context.save();
        applyTransform(context, T);
        context.stroke(preTransformed);
        context.restore();
      };

      drawCalligraphy(titleShape, titleFont.strokeWidth, "white");
      drawCalligraphy(starShape, 0.07, myRainbow.violet);
      drawCalligraphy(manWalkingShape, 0.04, "white");
      drawCalligraphy(sineShape, 0.07, myRainbow.myBlue);
      drawCalligraphy(cursiveShape, 0.04, "gold");
    },
  };

  scene.add(showable);
  sceneList.add(scene.build());
}

{
  const scene = new MakeShowableInParallel("Function Graphing");

  // ── Change this one line to graph any ℝ→ℝ function. ─────────
  const f = (x: number) => Math.sin(x);
  // ─────────────────────────────────────────────────────────────

  const SAMPLE_COUNT = 300;
  const X_MIN = -FULL_CIRCLE; // -2π
  const X_MAX = FULL_CIRCLE; // +2π

  // Auto-range y by sampling f over [X_MIN, X_MAX].
  // This same bounding box drives both the grid and the coordinate mapping.
  const yValues: number[] = [];
  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    yValues.push(f(lerp(X_MIN, X_MAX, i / SAMPLE_COUNT)));
  }
  const yDataMin = Math.min(...yValues);
  const yDataMax = Math.max(...yValues);
  const yPad = Math.max((yDataMax - yDataMin) * 0.1, 0.1);
  const Y_MIN = yDataMin - yPad;
  const Y_MAX = yDataMax + yPad;

  // Graph rect: left margin for y-labels, bottom margin for x-labels.
  const GRAPH_RECT = { x: 1.2, y: 1.5, width: 14.55, height: 7.0 };
  const viewRect = {
    x: X_MIN,
    y: Y_MIN,
    width: X_MAX - X_MIN,
    height: Y_MAX - Y_MIN,
  };

  const titlePath = ParagraphLayout.singlePathShape({
    text: scene.description,
    font: titleFont,
    alignment: "center",
    width: 16,
  }).canvasPath;

  const showable: Showable = {
    description: scene.description,
    duration: 9265.35 + 1_500,
    soundClips: [
      {
        // "Type here."
        source: "./Showcase.FLAC",
        startMsIntoScene: 500,
        startMsIntoClip: 245743.13,
        lengthMs: 9265.35,
      },
    ],
    show({ context }) {
      context.lineCap = "round";
      context.lineJoin = "round";

      context.lineWidth = titleFont.strokeWidth;
      context.strokeStyle = "white";
      context.stroke(titlePath);

      drawGrid(context, { destRect: GRAPH_RECT, viewRect });

      // Use the same transform as drawGrid so the curve aligns with the grid.
      const { toCanvasX, toCanvasY, effectiveRect } = computeGridTransform(
        GRAPH_RECT,
        viewRect,
      )!;

      // Graph border — around the actual fitted area, not the full GRAPH_RECT.
      context.strokeStyle = "rgba(255,255,255,0.35)";
      context.lineWidth = 0.03;
      context.lineCap = "butt";
      context.setLineDash([]);
      context.strokeRect(
        effectiveRect.x,
        effectiveRect.y,
        effectiveRect.width,
        effectiveRect.height,
      );

      // Function curve — clipped to the fitted area.
      context.save();
      context.beginPath();
      context.rect(
        effectiveRect.x,
        effectiveRect.y,
        effectiveRect.width,
        effectiveRect.height,
      );
      context.clip();

      context.beginPath();
      for (let i = 0; i <= SAMPLE_COUNT; i++) {
        const mx = lerp(X_MIN, X_MAX, i / SAMPLE_COUNT);
        const cx = toCanvasX(mx);
        const cy = toCanvasY(f(mx));
        if (i === 0) context.moveTo(cx, cy);
        else context.lineTo(cx, cy);
      }
      context.strokeStyle = myRainbow.myBlue;
      context.lineWidth = 0.05;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();

      context.restore();
    },
  };

  scene.add(showable);
  sceneList.add(scene.build());
}

{
  const title = ParagraphLayout.singlePathShape({
    font: titleFont,
    text: "Morphing Text",
    alignment: "center",
    width: 16,
  }).canvasPath;
  const font = makeLineFont(0.355);
  const leftLayout = new ParagraphLayout(font);
  // https://en.wikipedia.org/wiki/The_Lamb_(poem)
  const words1 = leftLayout.addText(`Little Lamb who made thee?
Dost thou know who made thee?
Gave thee life and bid thee feed
By the stream and o’er the mead;
Gave thee clothing of delight,
Softest clothing wooly bright;
Gave thee such a tender voice,
Making all the vales rejoice!`);
  const leftResult = leftLayout.align(undefined, "left");
  const rightLayout = new ParagraphLayout(font);
  // https://poets.org/poem/tyger
  const words2 = rightLayout.addText(`Tyger! Tyger! burning bright
In the forests of the night,
What immortal hand or eye
Could frame thy fearful symmetry?

In what distant deeps or skies
Burnt the fire of thine eyes?
On what wings dare he aspire?
What the hand, dare sieze the fire?`);
  //console.log(words1, words2);
  const rightResult = rightLayout.align(16 - margin, "right");
  const rightTextTop = 2;
  const rightTextLeft = 0;
  const leftTextTop =
    rightTextTop + (rightResult.height - leftResult.height) / 2;
  const leftTextLeft = margin;
  const leftPath = leftResult
    .singlePathShape()
    .translate(leftTextLeft, leftTextTop).canvasPath;
  const rightPath = rightResult
    .singlePathShape()
    .translate(rightTextLeft, rightTextTop).canvasPath;
  function makeWordList(
    layoutResult: typeof rightResult,
    left: number,
    top: number,
  ) {
    const map = new Map<WordInPlace, PathShape[]>();
    for (const letterInfo of layoutResult.getAllLetters(left, top)) {
      const word = letterInfo.word;
      let pathShapes = map.get(word);
      if (!pathShapes) {
        pathShapes = [];
        map.set(word, pathShapes);
      }
      pathShapes.push(letterInfo.translatedShape);
    }
    const result = Array.from(
      map.values(),
      (letterShapes) =>
        new PathShape(letterShapes.flatMap((pathShape) => pathShape.commands)),
    );
    return result;
  }
  const morphers = zipper([
    makeWordList(leftResult, leftTextLeft, leftTextTop),
    makeWordList(rightResult, rightTextLeft, rightTextTop),
  ])
    .map(([from, to]) => {
      return matchShapes(fixCorners(from), fixCorners(to));
    })
    .toArray();
  const fromColor = "#ffff80";
  const toColor = "red";
  const schedules = initializedArray(
    morphers.length,
    (index): Keyframes<number> => {
      const startTime = index * 800 + 500;
      const endTime = startTime + 4000;
      return [
        { time: startTime, value: 0, easeAfter: ease },
        { time: endTime, value: 1 },
      ];
    },
  );
  const scene: Showable = {
    duration: schedules.at(-1)!.at(-1)!.time + 2000,
    description: "Morphing Text",
    soundClips: distribute(
      [
        {
          // "morphing part 1"
          source: "./Showcase.FLAC",
          startMsIntoScene: 0,
          startMsIntoClip: 269231.88,
          lengthMs: 5760.29,
        },
        {
          // "Morphing part 2"
          source: "./Showcase.FLAC",
          startMsIntoScene: 0,
          startMsIntoClip: 276070.54,
          lengthMs: 3282.29,
        },
        {
          // "Morphing part 3"
          source: "./Showcase.FLAC",
          startMsIntoScene: 0,
          startMsIntoClip: 280159.63,
          lengthMs: 1609.15,
        },
        {
          // "Morphing part 4"
          source: "./Showcase.FLAC",
          startMsIntoScene: 0,
          startMsIntoClip: 282223.1,
          lengthMs: 3902.81,
        },
        {
          // "morphing part 5"
          source: "./Showcase.FLAC",
          startMsIntoScene: 0,
          startMsIntoClip: 288234.79,
          lengthMs: 6769.46,
        },
      ],
      { startFrom: 250, endAt: schedules.at(-1)!.at(-1)!.time },
    ),
    show({ context, timeInMs }) {
      context.lineCap = "round";
      context.lineJoin = "round";

      context.strokeStyle = myRainbow.myBlue;
      context.lineWidth = titleFont.strokeWidth;
      context.stroke(title);

      context.strokeStyle = fromColor;
      context.lineWidth = font.strokeWidth;
      context.stroke(leftPath);
      //context.strokeStyle = toColor;
      //context.stroke(rightPath);

      zipper([morphers, schedules]).forEach(([makePath, schedule]) => {
        const progress = interpolateNumbers(timeInMs, schedule);
        if (progress <= 0) {
          return;
        }
        makePath(progress).setCanvasPath(context);
        if (progress < 1) {
          const lineWidth = context.lineWidth;
          context.lineWidth = lineWidth * 2.5;
          context.strokeStyle = "black";
          context.stroke();
          context.lineWidth = lineWidth;
        }
        context.strokeStyle = interpolateColor(progress, fromColor, toColor);
        context.stroke();
      });

      // Make the first word bounce back and forth.
      // This was an early prototype.
      // context.strokeStyle = "yellow";
      // const progress = easeAndBack((timeInMs / 5000) % 1);
      // context.stroke(morphers[0](progress).canvasPath);
    },
  };
  sceneList.add(scene);
}

{
  const scene = new MakeShowableInParallel(
    "Dots, Dashes, and the PathSplitter",
  );
  {
    const pathShape = ParagraphLayout.singlePathShape({
      text: scene.description,
      font: titleFont,
      alignment: "center",
      width: 16,
    });
    const path = pathShape.canvasPath;
    const showable: Showable = {
      description: scene.description,
      duration: 0,
      show({ context }) {
        {
          context.lineCap = "round";
          context.lineJoin = "round";
          context.lineWidth = 0.07;
          context.strokeStyle = "yellow";
          context.stroke(path);
        }
      },
    };
    scene.add(showable);
  }
  {
    // ── Fonts ─────────────────────────────────────────────────────────────
    const codeFont = makeLineFont(0.28);
    const loveFont = makeLineFont(0.9); // "title sized or larger" for LOVE ♡

    // ── Dot/dash patterns: 5 examples cycling through with transitions ─────
    const HOLD_MS = 3_000;
    const TRANS_MS = 1_000;
    const patterns: { draw: number; gap: number }[] = [
      { draw: 0, gap: 2 }, // "ideal" dotted line
      { draw: 0, gap: 3 }, // bigger gap
      { draw: 1, gap: 3 }, // rounded rectangles
      { draw: 1, gap: 1 }, // barely touching
      { draw: 1, gap: 0.5 }, // overlapping
    ];
    const drawFactorSchedule: Keyframe<number>[] = [];
    const gapFactorSchedule: Keyframe<number>[] = [];
    {
      let t = 0;
      patterns.forEach((p, i) => {
        if (i === 0) {
          drawFactorSchedule.push({ time: t, value: p.draw });
          gapFactorSchedule.push({ time: t, value: p.gap });
        }
        t += HOLD_MS;
        if (i < patterns.length - 1) {
          const next = patterns[i + 1];
          drawFactorSchedule.push({ time: t, value: p.draw, easeAfter: ease });
          gapFactorSchedule.push({ time: t, value: p.gap, easeAfter: ease });
          t += TRANS_MS;
          drawFactorSchedule.push({ time: t, value: next.draw });
          gapFactorSchedule.push({ time: t, value: next.gap });
        }
      });
    }
    /**
     * Audio length plus 500 ms padding on each side.
     */
    const TOTAL_DURATION = 28096.35 + 1000;

    // ── Handwriting schedule (loops for the full slide duration) ──────────
    const PAUSE_MS = 500; // brief pause before and after each write
    const ANIM_MS = 4_000; // time to write "LOVE ♡" once
    const LOOP_MS = PAUSE_MS + ANIM_MS + PAUSE_MS;
    const handwritingSchedule: Keyframe<number>[] = [];
    for (let t = 0; t < TOTAL_DURATION; t += LOOP_MS) {
      handwritingSchedule.push({
        time: t + PAUSE_MS,
        value: 0,
        easeAfter: ease,
      });
      handwritingSchedule.push({ time: t + PAUSE_MS + ANIM_MS, value: 1 });
      const cycleEnd = t + LOOP_MS;
      if (cycleEnd < TOTAL_DURATION) {
        // Hold at 1 until 1 ms before the next cycle, then jump to 0.
        handwritingSchedule.push({ time: cycleEnd - 1, value: 1 });
        handwritingSchedule.push({ time: cycleEnd, value: 0 });
      }
    }

    // ── Layout constants ──────────────────────────────────────────────────
    const TITLE_Y = 1.3; // approx bottom of title text
    const LEFT_X = 0.25;
    const DIVIDER_X = 7.25; // vertical center divider
    const RIGHT_X = 7.5;
    const LEFT_COL_W = 6.75; // left column content width
    const RIGHT_COL_W = 8.0; // right column content width (to canvas edge)
    const LEFT_DIV_Y = 5.0; // horizontal divider splitting the left demos
    // Left-side LOVE ♡ positions (translate top-of-text, i.e. y=0 of PathShape)
    const LOVE_Y_TOP = 2.95;
    const LOVE_Y_BOT = 6.75;
    // Right-side section positions
    const CODE_Y = TITLE_Y + 0.05;
    const ROUND_LABEL_Y = 2.85;
    const ROUND_DEMO_TOP = 3.4;
    const ROUND_DEMO_BOT = 4.75;
    const SQUARE_LABEL_Y = 4.9;
    const SQUARE_DEMO_TOP = 5.45;
    const SQUARE_DEMO_BOT = 6.8;
    const BUTT_LABEL_Y = 6.95;
    const BUTT_DEMO_TOP = 7.5;
    const BUTT_DEMO_BOT = 8.85;
    const BASE_LINE_WIDTH = 0.04;

    // ── Left-side text: "LOVE ♡" ───────────────────────────────────────────
    // PathShape (not Path2D) so we can pass it to PathShapeSplitter.create().
    const lovePath = ParagraphLayout.singlePathShape({
      text: "LOVE ♡",
      font: loveFont,
      alignment: "center",
      width: LEFT_COL_W,
    });
    const loveSplitter = PathShapeSplitter.create(lovePath);
    // The longest moveTo-separated segment — used as the setLineDash draw value.
    // setLineDash() restarts the dash phase at each moveTo(), so animating
    // lineDashOffset reveals/hides ALL strokes simultaneously (not left-to-right).
    // PathShapeSplitter measures the whole path continuously, giving true
    // left-to-right handwriting.  The side-by-side shows this difference.
    const longestSegmentLength = Math.max(
      ...lovePath.splitOnMove().map((seg) => seg.getLength()),
    );

    // ── Pre-computed static canvas paths ─────────────────────────────────
    const loveSetLineDashPath = lovePath.translate(
      LEFT_X,
      LOVE_Y_TOP,
    ).canvasPath;
    const leftHeaderTopPath = ParagraphLayout.singlePathShape({
      text: "Using setLineDash() & lineDashOffset:",
      font: codeFont,
      alignment: "left",
      width: LEFT_COL_W,
    }).translate(LEFT_X, TITLE_Y + 0.05).canvasPath;
    const leftHeaderBotPath = ParagraphLayout.singlePathShape({
      text: "Using PathShapeSplitter.trim():",
      font: codeFont,
      alignment: "left",
      width: LEFT_COL_W,
    }).translate(LEFT_X, LEFT_DIV_Y + 0.08).canvasPath;
    // trim(0, 0) draws a dot at the start rather than nothing.
    // In the Outline Slide Template, the guard `if (localProgress <= 0) return;`
    // prevents this initial dot.  Here we skip the guard to keep the code simple.
    const roundLabelPath = ParagraphLayout.singlePathShape({
      text: "lineCap: round \u2014 dash lengths exclude the cap radius",
      font: codeFont,
      alignment: "left",
      width: RIGHT_COL_W,
    }).translate(RIGHT_X, ROUND_LABEL_Y).canvasPath;
    const squareLabelPath = ParagraphLayout.singlePathShape({
      text: "lineCap: square \u2014 caps extend half a lineWidth past each end",
      font: codeFont,
      alignment: "left",
      width: RIGHT_COL_W,
    }).translate(RIGHT_X, SQUARE_LABEL_Y).canvasPath;
    const buttLabelPath = ParagraphLayout.singlePathShape({
      text: "lineCap: butt \u2014 no cap is added beyond each endpoint",
      font: codeFont,
      alignment: "left",
      width: RIGHT_COL_W,
    }).translate(RIGHT_X, BUTT_LABEL_Y).canvasPath;

    const showable: Showable = {
      description: "Dashes demo",
      duration: TOTAL_DURATION,
      soundClips: [
        {
          // "Dots, dashes and the PathShapeSplitter"
          source: "./Showcase.FLAC",
          startMsIntoScene: 500,
          startMsIntoClip: 302224.0,
          lengthMs: 28096.35,
        },
      ],
      schedules: [
        {
          description: "Draw Length Factor",
          type: "number",
          schedule: drawFactorSchedule,
        },
        {
          description: "Gap Length Factor",
          type: "number",
          schedule: gapFactorSchedule,
        },
      ],
      show({ context, timeInMs }) {
        const drawFactor = interpolateNumbers(timeInMs, drawFactorSchedule);
        const gapFactor = interpolateNumbers(timeInMs, gapFactorSchedule);
        const handwriting = interpolateNumbers(timeInMs, handwritingSchedule);

        context.lineCap = "round";
        context.lineJoin = "round";

        // ── Dividers ──────────────────────────────────────────────────────
        context.lineWidth = 0.02;
        context.strokeStyle = "rgba(255,255,255,0.2)";
        context.setLineDash([0.1, 0.1]);
        context.lineCap = "butt";
        context.beginPath();
        context.moveTo(DIVIDER_X, TITLE_Y);
        context.lineTo(DIVIDER_X, 9);
        context.stroke();
        context.beginPath();
        context.moveTo(LEFT_X, LEFT_DIV_Y);
        context.lineTo(DIVIDER_X - 0.1, LEFT_DIV_Y);
        context.stroke();
        context.setLineDash([]);
        context.lineCap = "round";

        // ── LEFT TOP: setLineDash + lineDashOffset ────────────────────────
        // lineDashOffset from longestSegmentLength → 0 (gap phase → draw phase).
        // Because setLineDash restarts at each moveTo(), all strokes reveal
        // simultaneously — the demo shows this limitation.
        //
        // Note:  setLineDash() restarts at each moveTo().
        const dashOffset = longestSegmentLength * (1 - handwriting);
        {
          context.lineWidth = codeFont.strokeWidth;
          context.strokeStyle = "rgba(255,255,255,0.5)";
          context.stroke(leftHeaderTopPath);

          // Live values
          const liveCodePath = ParagraphLayout.singlePathShape({
            text:
              `context.setLineDash([${longestSegmentLength.toFixed(2)}]);\n` +
              `context.lineDashOffset = ${dashOffset.toFixed(2)};`,
            font: codeFont,
            alignment: "left",
            width: RIGHT_COL_W,
          }).translate(LEFT_X, TITLE_Y + 0.55).canvasPath;
          context.strokeStyle = myRainbow.myBlue;
          context.stroke(liveCodePath);

          context.lineWidth = loveFont.strokeWidth;
          context.strokeStyle = "lime";
          context.setLineDash([longestSegmentLength]);
          context.lineDashOffset = dashOffset;
          context.stroke(loveSetLineDashPath);
          context.setLineDash([]);
        }

        // ── LEFT BOTTOM: PathShapeSplitter ────────────────────────────────
        {
          const trimLength = handwriting * loveSplitter.length;

          context.lineWidth = codeFont.strokeWidth;
          context.strokeStyle = "rgba(255,255,255,0.5)";
          context.stroke(leftHeaderBotPath);

          const liveCodePath = ParagraphLayout.singlePathShape({
            text:
              `splitter.trim(0, ${trimLength.toFixed(2)});\n` +
              `// splitter.length = ${loveSplitter.length.toFixed(2)}`,
            font: codeFont,
            alignment: "left",
            width: LEFT_COL_W,
          }).translate(LEFT_X, LEFT_DIV_Y + 0.58).canvasPath;
          context.strokeStyle = myRainbow.myBlue;
          context.stroke(liveCodePath);

          // trim() works on the untranslated lovePath — apply the same
          // translation via a canvas transform rather than PathShape.translate().
          const trimmed = loveSplitter.trim(0, trimLength);
          context.lineWidth = loveFont.strokeWidth;
          context.strokeStyle = "lime";
          context.save();
          context.translate(LEFT_X, LOVE_Y_BOT);
          context.stroke(trimmed.canvasPath);
          context.restore();
        }

        // ── RIGHT: lineCap comparison with animated dash pattern ──────────
        // The dash lengths do NOT include the size of the lineCap.
        // Setting drawLength=0 gives circles (round), squares (square), or
        // nothing (butt).  Three diagonal lines per section show the effect
        // at lineWidths of 1×, 3×, and 9× BASE_LINE_WIDTH.
        {
          // Live code display
          const liveCodePath = ParagraphLayout.singlePathShape({
            text:
              `const drawLength = lineWidth * ${drawFactor.toFixed(2)};\n` +
              `const gapLength = lineWidth * ${gapFactor.toFixed(2)};\n` +
              `context.setLineDash([drawLength, gapLength]);`,
            font: codeFont,
            alignment: "left",
            width: Infinity,
          }).translate(RIGHT_X, CODE_Y).canvasPath;
          context.lineWidth = codeFont.strokeWidth;
          context.strokeStyle = myRainbow.myBlue;
          context.stroke(liveCodePath);

          context.lineWidth = codeFont.strokeWidth;
          context.strokeStyle = "rgba(255,255,255,0.5)";
          context.stroke(roundLabelPath);
          context.stroke(squareLabelPath);
          context.stroke(buttLabelPath);

          // Helper: draw three diagonal lines in a demo box.
          // Line 1 (1× width): (left, bot) → (center, top)
          // Line 2 (3× width): (left+w/4, bot) → (center+w/4, top)
          // Line 3 (9× width): (center, bot) → (right, top)
          const drawDiagonals = (demoTop: number, demoBot: number) => {
            const left = RIGHT_X;
            const right = RIGHT_X + RIGHT_COL_W;
            const center = (left + right) / 2;
            const w = right - left;
            for (const scale of [1, 3, 9]) {
              const lw = BASE_LINE_WIDTH * scale;
              context.lineWidth = lw;
              context.setLineDash([lw * drawFactor, lw * gapFactor]);
              context.beginPath();
              if (scale === 1) {
                context.moveTo(left, demoBot);
                context.lineTo(center, demoTop);
              } else if (scale === 3) {
                context.moveTo(left + w / 4, demoBot);
                context.lineTo(center + w / 4, demoTop);
              } else {
                context.moveTo(center, demoBot);
                context.lineTo(right, demoTop);
              }
              context.stroke();
            }
            context.setLineDash([]);
          };

          // Slowly move each dot or dash up and to the right.
          context.lineDashOffset = -timeInMs / 5000;

          context.strokeStyle = myRainbow.orange;
          context.lineCap = "round";
          drawDiagonals(ROUND_DEMO_TOP, ROUND_DEMO_BOT);

          context.strokeStyle = myRainbow.cyan;
          context.lineCap = "square";
          drawDiagonals(SQUARE_DEMO_TOP, SQUARE_DEMO_BOT);

          context.strokeStyle = myRainbow.green;
          context.lineCap = "butt";
          drawDiagonals(BUTT_DEMO_TOP, BUTT_DEMO_BOT);

          // Clean up:
          context.lineDashOffset = 0;
          context.setLineDash([]);
        }
      },
    };
    scene.add(showable);
  }
  sceneList.add(scene.build());
}

{
  // φ = 1 + 1/(1 + 1/(1 + 1/(1 + ...)))  — all integers are 1.
  // Static and super simple.
  const scene = new MakeShowableInParallel("φ as a Continued Fraction");
  {
    const path = ParagraphLayout.singlePathShape({
      text: scene.description,
      font: titleFont,
      alignment: "center",
      width: 16,
    }).canvasPath;
    scene.add({
      description: scene.description,
      duration: 1000,
      soundClips: [
        {
          // "Continued fractions, 2 slides worth"
          source: "./Showcase.FLAC",
          startMsIntoScene: 500,
          startMsIntoClip: 333882.46,
          lengthMs: 3655.75,
        },
      ],
      show({ context }) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.07;
        context.strokeStyle = "yellow";
        context.stroke(path);
      },
    });
  }
  {
    // Staircase layout for: φ = 1 + 1/(1 + 1/(1 + 1/(1 + ...)))
    // Every integer in the continued fraction is 1, so all labels are "1 +".
    // Indentation per level is uniform and tighter than the π version.
    const mathFont = makeLineFont(0.4);
    const lh = 1.75 * 0.4;
    const barGap = 0.12;
    const sw = mathFont.strokeWidth;
    const numTop0 = 1.95;
    const bar0y = numTop0 + lh + barGap;
    const row1y = bar0y + barGap;
    const bar1y = row1y + lh + barGap;
    const row2y = bar1y + barGap;
    const bar2y = row2y + lh + barGap;
    const row3y = bar2y + barGap;
    const bar3y = row3y + lh + barGap;
    const row4y = bar3y + barGap;
    const bar4y = row4y + lh + barGap;
    const RIGHT = 15.3;
    const x0 = 0.5; // "φ = 1 +"
    const bx0 = 2.6; // bar 0 left  (after "φ = 1 +")
    const bx1 = 3.4; // bar 1 left  (after "1 +")
    const bx2 = 4.2; // bar 2 left  (after "1 +")
    const bx3 = 5.0; // bar 3 left  (after "1 +")
    const STEP = bx1 - bx0; // uniform indent per level
    const phiLabelPath = ParagraphLayout.singlePathShape({
      text: "φ = 1 +",
      font: mathFont,
      alignment: "left",
      width: bx0 - x0,
    }).translate(x0, bar0y - lh / 2).canvasPath;
    // "1" numerator centered over [barLeft, RIGHT]
    const numPath = (barLeft: number, topY: number): Path2D =>
      ParagraphLayout.singlePathShape({
        text: "1",
        font: mathFont,
        alignment: "center",
        width: RIGHT - barLeft,
      }).translate(barLeft, topY).canvasPath;
    const num0Path = numPath(bx0, numTop0);
    const num1Path = numPath(bx1, row1y);
    const num2Path = numPath(bx2, row2y);
    const num3Path = numPath(bx3, row3y);
    // "1 +" integer label centered vertically at its own bar
    const onePlusPath = (barLeft: number, barY: number): Path2D =>
      ParagraphLayout.singlePathShape({
        text: "1 +",
        font: mathFont,
        alignment: "left",
        width: STEP,
      }).translate(barLeft, barY - lh / 2).canvasPath;
    const label1Path = onePlusPath(bx0, bar1y);
    const label2Path = onePlusPath(bx1, bar2y);
    const label3Path = onePlusPath(bx2, bar3y);
    const labelEndPath = ParagraphLayout.singlePathShape({
      text: "1 + ...",
      font: mathFont,
      alignment: "left",
      width: RIGHT - bx3,
    }).translate(bx3, bar4y - lh / 2).canvasPath;
    scene.add({
      description: "continued fraction",
      duration: 1_500,
      show({ context }) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = sw;
        context.strokeStyle = myRainbow.cyan;
        context.stroke(phiLabelPath);
        context.stroke(num0Path);
        context.stroke(label1Path);
        context.stroke(num1Path);
        context.stroke(label2Path);
        context.stroke(num2Path);
        context.stroke(label3Path);
        context.stroke(num3Path);
        context.stroke(labelEndPath);
        context.lineCap = "butt";
        for (const [bx, by] of [
          [bx0, bar0y],
          [bx1, bar1y],
          [bx2, bar2y],
          [bx3, bar3y],
        ] as [number, number][]) {
          context.beginPath();
          context.moveTo(bx, by);
          context.lineTo(RIGHT, by);
          context.stroke();
        }
      },
    });
  }
  sceneList.add(scene.build());
}

{
  const scene = new MakeShowableInParallel("π as a Continued Fraction");
  {
    const path = ParagraphLayout.singlePathShape({
      text: scene.description,
      font: titleFont,
      alignment: "center",
      width: 16,
    }).canvasPath;
    scene.add({
      description: scene.description,
      duration: 0,
      show({ context }) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.07;
        context.strokeStyle = "yellow";
        context.stroke(path);
      },
    });
  }
  {
    // Staircase layout for: π = 3 + 1/(7 + 1/(15 + 1/(1 + 1/292)))
    //
    // Each row contains the integer label "[n] +" and the numerator "1"
    // for the next level, side by side.  A fraction bar is drawn below each
    // row, starting where that row's label ends, spanning to the right edge.
    //
    // Row 0 is special: only the numerator "1" appears (no integer label).
    // "π = 3 +" sits to the LEFT of the overall structure, vertically
    // centered at bar-0 height.

    const mathFont = makeLineFont(0.4);
    const lh = 1.75 * 0.4; // line height = 0.7
    const barGap = 0.12; // space above and below each bar
    const sw = mathFont.strokeWidth; // 0.04

    // ── Y positions (computed top-down) ────────────────────────────────────
    const numTop0 = 1.95;
    const bar0y = numTop0 + lh + barGap; // 2.77
    const row1y = bar0y + barGap; // 2.89  ("7 + …")
    const bar1y = row1y + lh + barGap; // 3.71
    const row2y = bar1y + barGap; // 3.83  ("15 + …")
    const bar2y = row2y + lh + barGap; // 4.65
    const row3y = bar2y + barGap; // 4.77  ("1 + …")
    const bar3y = row3y + lh + barGap; // 5.59
    const row4y = bar3y + barGap; // 5.71
    const bar4y = row4y + lh + barGap; // 6.53  (hypothetical next bar)

    // ── X positions ────────────────────────────────────────────────────────
    // Each bar starts just after its integer label; the next label starts
    // at the same x so it appears directly below the bar's left edge.
    const RIGHT = 15.3;
    const x0 = 0.5; // "π = 3 +"
    const bx0 = 2.6; // bar 0 left  (after "π = 3 +")
    const bx1 = 3.5; // bar 1 left  (after "7 +")
    const bx2 = 4.7; // bar 2 left  (after "15 +")
    const bx3 = 5.6; // bar 3 left  (after "1 +")

    // ── Pre-computed paths ──────────────────────────────────────────────────
    // "π = 3 +" — centered vertically at bar 0
    const piLabelPath = ParagraphLayout.singlePathShape({
      text: "π = 3 +",
      font: mathFont,
      alignment: "left",
      width: bx0 - x0,
    }).translate(x0, bar0y - lh / 2).canvasPath;

    // Helper: "1" numerator centered over [barLeft, RIGHT] at given top-y
    // num1Shape returns a PathShape so num3 can be combined into the morph target
    const num1Shape = (barLeft: number, topY: number): PathShape =>
      ParagraphLayout.singlePathShape({
        text: "1",
        font: mathFont,
        alignment: "center",
        width: RIGHT - barLeft,
      }).translate(barLeft, topY);

    const num0Path = num1Shape(bx0, numTop0).canvasPath;
    const num1aPath = num1Shape(bx1, row1y).canvasPath;
    const num2Path = num1Shape(bx2, row2y).canvasPath;
    const num3Shape = num1Shape(bx3, row3y); // PathShape — part of morph target

    // Integer labels — each is centered vertically AT its own bar (same
    // relationship as "π = 3 +" is centered at bar0y).  The "1" numerators
    // above each bar stay at row_y; the labels shift down by lh/2 + barGap
    // so the bar passes through their vertical midpoint.
    const label7Path = ParagraphLayout.singlePathShape({
      text: "7 +",
      font: mathFont,
      alignment: "left",
      width: bx1 - bx0,
    }).translate(bx0, bar1y - lh / 2).canvasPath;

    const label15Path = ParagraphLayout.singlePathShape({
      text: "15 +",
      font: mathFont,
      alignment: "left",
      width: bx2 - bx1,
    }).translate(bx1, bar2y - lh / 2).canvasPath;

    const label1Path = ParagraphLayout.singlePathShape({
      text: "1 +",
      font: mathFont,
      alignment: "left",
      width: bx3 - bx2,
    }).translate(bx2, bar3y - lh / 2).canvasPath;

    // ── Morph: "..." → "1" + bar3 line + "292 + ..." ───────────────────────
    // Initial state ends one level short with "..." as the last item.
    // The animation expands it into the real next staircase level.
    const TOTAL_DURATION = 3.65572 * 1000;
    const MORPH_START_MS = 900;
    const MORPH_MS = TOTAL_DURATION - 2 * MORPH_START_MS;

    const morphSchedule: Keyframe<number>[] = [
      { time: MORPH_START_MS, value: 0, easeAfter: ease },
      { time: MORPH_START_MS + MORPH_MS, value: 1 },
    ];

    const dotsShape = ParagraphLayout.singlePathShape({
      text: "...",
      font: mathFont,
      alignment: "left",
      width: RIGHT - bx3,
    }).translate(bx3, bar3y - lh / 2); // same line as "1 +" → reads as "1 + ..."

    const label292Shape = ParagraphLayout.singlePathShape({
      text: "292 + ...",
      font: mathFont,
      alignment: "left",
      width: RIGHT - bx3,
    }).translate(bx3, bar4y - lh / 2);

    const bar3Shape = new PathShape([new LCommand(bx3, bar3y, RIGHT, bar3y)]);

    // Combine "1" numerator + bar3 line + "292 + ..." into one morph target
    const finalShape = new PathShape([
      ...num3Shape.commands,
      ...bar3Shape.commands,
      ...label292Shape.commands,
    ]);

    const morpher = matchShapes(fixCorners(dotsShape), fixCorners(finalShape));

    scene.add({
      description: "continued fraction",
      duration: TOTAL_DURATION,
      show({ context, timeInMs }) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = sw;
        context.strokeStyle = myRainbow.cyan;

        // Static text
        context.stroke(piLabelPath);
        context.stroke(num0Path);
        context.stroke(label7Path);
        context.stroke(num1aPath);
        context.stroke(label15Path);
        context.stroke(num2Path);
        context.stroke(label1Path);

        // Morphing element: "..." → "1" + bar3 + "292 + ..."
        const progress = interpolateNumbers(timeInMs, morphSchedule);
        context.stroke(morpher(progress).canvasPath);

        // Fraction bars (bar3 is part of the morph, so only bars 0–2 here)
        context.lineCap = "butt";
        context.lineWidth = sw;
        for (const [bx, by] of [
          [bx0, bar0y],
          [bx1, bar1y],
          [bx2, bar2y],
        ] as [number, number][]) {
          context.beginPath();
          context.moveTo(bx, by);
          context.lineTo(RIGHT, by);
          context.stroke();
        }
      },
    });
  }
  sceneList.add(scene.build());
}

{
  const scene = new MakeShowableInParallel("Easing Functions");
  {
    const titlePath = ParagraphLayout.singlePathShape({
      text: scene.description,
      font: titleFont,
      alignment: "center",
      width: 16,
    }).canvasPath;
    const showable: Showable = {
      description: scene.description,
      duration: 0,
      soundClips: [
        {
          // "Easing functions."
          source: "./Showcase.FLAC",
          startMsIntoScene: 1000,
          startMsIntoClip: 359807.25,
          lengthMs: 33041.25,
        },
      ],
      show({ context }) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.07;
        context.strokeStyle = myRainbow.violet;
        context.stroke(titlePath);
      },
    };
    scene.add(showable);
  }
  {
    const REPEAT_COUNT = 3;
    const HOLD_MS = 1_000;
    const RACE_MS = 10_000;
    const CYCLE_MS = HOLD_MS + RACE_MS + HOLD_MS;

    // 2-entry schedule: holds at 0 before t=HOLD_MS, linear to 1, holds at 1 after
    const rawProgressSchedule: Keyframe<number>[] = [
      { time: HOLD_MS, value: 0 },
      { time: HOLD_MS + RACE_MS, value: 1 },
    ];

    // interpolateNumbers() row uses its own schedule — overshoots and comes back
    const customSchedule: Keyframe<number>[] = [
      { time: HOLD_MS, value: 0 },
      { time: HOLD_MS + RACE_MS * 0.45, value: 1.35, easeAfter: easeOut },
      { time: HOLD_MS + RACE_MS * 0.7, value: 0.6, easeAfter: easeIn },
      { time: HOLD_MS + RACE_MS, value: 1 },
    ];

    type Row = {
      label: string;
      color: string;
      progress: (raw: number, cycleTime: number) => number;
    };

    const labelFont = makeLineFont(0.28);
    const numFont = makeLineFont(0.28);

    const TITLE_H = 1.0;
    const LANE_COUNT = 6;
    const LANE_H = (9 - TITLE_H) / LANE_COUNT;
    const CIRCLE_R = 0.32;
    const LEFT_MARGIN = 0.25;
    const MIN_TRACK_GAP = 1.0;

    // x is the editable track boundary; y is ignored
    const trackLeftSchedule: Keyframe<Point>[] = [
      { time: 0, value: { x: 4.075, y: 4.5 } },
    ];
    const trackRightSchedule: Keyframe<Point>[] = [
      { time: 0, value: { x: 14.6, y: 4.5 } },
    ];

    const colors = [
      myRainbow.yellow,
      myRainbow.orange,
      myRainbow.red,
      myRainbow.green,
      myRainbow.cyan,
      myRainbow.myBlue,
    ];

    const rows: Row[] = [
      {
        label: "linear",
        color: colors[0],
        progress: (raw) => raw,
      },
      {
        label: "easeIn(t)",
        color: colors[1],
        progress: (raw) => easeIn(raw),
      },
      {
        label: "ease(t)",
        color: colors[2],
        progress: (raw) => ease(raw),
      },
      {
        label: "easeOut(t)",
        color: colors[3],
        progress: (raw) => easeOut(raw),
      },
      {
        label: "easeAndBack(t)",
        color: colors[4],
        progress: (raw) => easeAndBack(raw),
      },
      {
        label: "interpolateNumbers()",
        color: colors[5],
        progress: (_raw, cycleTime) =>
          interpolateNumbers(cycleTime, customSchedule),
      },
    ];

    const showable: Showable = {
      description: "Easing race",
      duration: REPEAT_COUNT * CYCLE_MS,
      schedules: [
        {
          description: "Start Line",
          type: "point",
          schedule: trackLeftSchedule,
        },
        {
          description: "Finish Line",
          type: "point",
          schedule: trackRightSchedule,
        },
      ],
      show({ context, timeInMs }) {
        const cycleTime = timeInMs % CYCLE_MS;
        const raw = interpolateNumbers(cycleTime, rawProgressSchedule);

        // Read editable track boundaries; clamp so they can't cross
        const rawLeft = interpolatePoints(0, trackLeftSchedule).x;
        const rawRight = interpolatePoints(0, trackRightSchedule).x;
        const trackLeft = Math.min(rawLeft, rawRight - MIN_TRACK_GAP);
        const trackRight = Math.max(rawRight, rawLeft + MIN_TRACK_GAP);
        const trackW = trackRight - trackLeft;

        // Lane dividers
        context.strokeStyle = "rgba(255,255,255,0.08)";
        context.lineWidth = 0.02;
        for (let i = 0; i <= LANE_COUNT; i++) {
          const y = TITLE_H + i * LANE_H;
          context.beginPath();
          context.moveTo(0, y);
          context.lineTo(16, y);
          context.stroke();
        }

        // Start and finish lines
        context.strokeStyle = "rgba(255,255,255,0.25)";
        context.lineWidth = 0.03;
        context.setLineDash([0.1, 0.1]);
        context.beginPath();
        context.moveTo(trackLeft, TITLE_H);
        context.lineTo(trackLeft, 9);
        context.stroke();
        context.beginPath();
        context.moveTo(trackRight, TITLE_H);
        context.lineTo(trackRight, 9);
        context.stroke();
        context.setLineDash([]);

        context.lineCap = "round";
        context.lineJoin = "round";

        // Labels — recomputed each frame so they reflow with trackLeft
        context.lineWidth = labelFont.strokeWidth;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const cy = TITLE_H + (i + 0.5) * LANE_H;
          const labelPath = ParagraphLayout.singlePathShape({
            text: row.label,
            font: labelFont,
            alignment: "right",
            width: trackLeft - LEFT_MARGIN - 0.1,
          }).translate(LEFT_MARGIN, cy - labelFont.mHeight / 2).canvasPath;
          context.strokeStyle = row.color;
          context.stroke(labelPath);
        }

        // Racers + live numbers
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const cy = TITLE_H + (i + 0.5) * LANE_H;
          const p = row.progress(raw, cycleTime);
          const cx = trackLeft + p * trackW;

          // Circle
          context.beginPath();
          context.arc(cx, cy, CIRCLE_R, 0, Math.PI * 2);
          context.fillStyle = row.color;
          context.fill();

          // Live number — left edge hugs the finish line
          const numText = p.toFixed(3);
          const numPath = ParagraphLayout.singlePathShape({
            text: numText,
            font: numFont,
            alignment: "left",
            width: 2,
          }).translate(trackRight + 0.08, cy - numFont.mHeight / 2).canvasPath;
          context.lineWidth = numFont.strokeWidth;
          context.strokeStyle = row.color;
          context.stroke(numPath);
        }
      },
    };
    scene.add(showable);
  }
  sceneList.add(scene.build());
}

{
  const scene = new MakeShowableInParallel("Outline Slide Template");

  const LEFT_MARGIN = 0.5;
  const RIGHT_MARGIN = 0.4;
  const BULLET_GAP = 0.18; // extra vertical gap between consecutive bullets

  /**
   * Formatting for each outline level.
   * Level 0 is the top-level bullet, level 2 is the most indented.
   * `indent` is added to LEFT_MARGIN.
   * `bullet` is prepended to the text; use characters known to exist in the line font.
   */
  const outlineFormatByLevel: readonly {
    readonly font: Font;
    readonly indent: number;
    readonly bullet: string;
  }[] = [
    { font: makeLineFont(0.44), indent: 0.0, bullet: "• " },
    { font: makeLineFont(0.33), indent: 0.9, bullet: "- " },
    { font: makeLineFont(0.25), indent: 1.8, bullet: "* " },
  ];

  const bulletContent: readonly {
    level: number;
    text: string;
    timeAfterMs?: number;
  }[] = [
    { level: 0, text: "Canvas Recorder Features" },
    {
      level: 1,
      text: "Strokable vector fonts: line, Futura L, cursive",
      timeAfterMs: 500,
    },
    { level: 1, text: "Keyframe-based animation schedules" },
    {
      level: 2,
      text: "Per-segment easing: ease, easeIn, easeOut, easeAndBack",
    },
    {
      level: 2,
      text: "Custom keyframes with per-segment easing",
      timeAfterMs: 5000,
    },
    { level: 0, text: "Development Tools" },
    { level: 1, text: "Live preview with play/pause and chapter navigation" },
    { level: 1, text: "Schedule editor with drag handles" },
    { level: 2, text: "Editable per-object keyframe data" },
  ];

  let startTime = 500;
  const handwritingSchedule: Keyframe<number>[] = [];
  bulletContent.forEach((content, index) => {
    handwritingSchedule.push({ time: startTime, value: index });
    const drawDuration = 750;
    startTime += drawDuration;
    handwritingSchedule.push({ time: startTime, value: index + 1 });
    const pauseAfter = content.timeAfterMs ?? 1000;
    startTime += pauseAfter;
  });

  // Title — align(16, "center") places the text centered on the 16-wide canvas.
  // No translation needed: font.top = -1.25*mHeight so the first baseline lands at
  // +1.25*mHeight, putting letter tops at +0.25*mHeight (just inside the canvas edge).
  const titleLaidOut = (() => {
    const layout = new ParagraphLayout(titleFont);
    layout.addText(scene.description);
    return layout.align(16, "center");
  })();
  const titlePath = titleLaidOut.singlePathShape().canvasPath;

  // Pre-compute bullet paths — static slide, no per-frame recalculation needed.
  // y tracks the top edge of each bullet block; y += laidOut.height advances past it.
  let y = titleLaidOut.height + 0.2;
  const bulletPaths: { splitter: PathShapeSplitter; level: number }[] = [];
  for (const { level, text } of bulletContent) {
    const fmt = outlineFormatByLevel[level];
    const x = LEFT_MARGIN + fmt.indent;
    const availableWidth = 16 - x - RIGHT_MARGIN;
    const layout = new ParagraphLayout(fmt.font);
    layout.addText(fmt.bullet + text);
    const laidOut = layout.align(availableWidth, "left");
    bulletPaths.push({
      splitter: PathShapeSplitter.create(
        laidOut.singlePathShape().translate(x, y),
      ),
      level,
    });
    y += laidOut.height + BULLET_GAP;
  }

  const levelColors = ["white", "#cccccc", "#aaaaaa"] as const;

  const showable: Showable = {
    description: "Outline slide",
    duration: handwritingSchedule.at(-1)!.time + DEFAULT_POST_ROLL_MS,
    soundClips: [
      {
        // "Outline / Powerpoint"
        source: "./Showcase.FLAC",
        startMsIntoScene: 1_000,
        startMsIntoClip: 397519.29,
        lengthMs: 19133.17,
      },
    ],
    show({ context, timeInMs }) {
      context.lineCap = "round";
      context.lineJoin = "round";

      context.lineWidth = titleFont.strokeWidth;
      context.strokeStyle = myRainbow.violet;
      context.stroke(titlePath);

      const totalProgress = interpolateNumbers(timeInMs, handwritingSchedule);
      //      for (const { path, level } of bulletPaths) {
      bulletPaths.forEach(({ splitter, level }, index) => {
        const localProgress = totalProgress - index;
        if (localProgress <= 0) {
          // This is more than an optimization.
          // If you call Splitter.trim() and request a zero length segment you will get a single point.
          // In this context, every line would be a point, instead of completely blank, before we started to display it.
          return;
        }
        const fmt = outlineFormatByLevel[level];
        context.lineWidth = fmt.font.strokeWidth;
        context.strokeStyle = levelColors[level];
        const pathShape = splitter.trim(0, localProgress * splitter.length);
        context.stroke(pathShape.canvasPath);
      });
    },
  };

  scene.add(showable);
  sceneList.add(scene.build());
}

// Example of Vite's static asset handling.
// https://vite.dev/guide/assets
import imageUrl from "./Philip Smolen.jpeg";

{
  /**
   * Draw four images.
   */
  const description = '<img src="...">';
  const pathShape = ParagraphLayout.singlePathShape({
    text: description,
    font: titleFont,
    alignment: "center",
    width: 16,
  });
  const boundingBox = pathShape.getBBox();
  const path = pathShape.canvasPath;
  const schedules: ScheduleInfo[] = [];
  const components = new Map<string, Showable>();
  components.set("Peano", createSingleImageComponent("./Giuseppe_Peano.jpg"));
  components.set("Philip", createSingleImageComponent(imageUrl));
  components.set(
    "Pi Creature",
    createSingleImageComponent(
      "https://store.dftba.com/cdn/shop/files/3b1b-piplushieplump-site-2.jpg",
    ),
  );
  components.set(
    "Fourier",
    createSingleImageComponent("./Fourier2_-_restoration1.jpg"),
  );
  components.forEach((component, name) => {
    const original = only(
      component.schedules!.filter(
        (originalSchedule) => originalSchedule.type == "rectangle",
      ),
    );
    const visible: ScheduleInfo = { ...original, description: name };
    schedules.push(visible);
  });
  const middleRectangle: ReadOnlyRect = {
    x: 4.672377558479532,
    y: 1.473364400584795,
    width: 6.690880847953214,
    height: 6.861111111111109,
  };
  const smallRectangles: readonly ReadOnlyRect[] = [
    { x: 1, y: 1, width: 2.2007492690058483, height: 2.389117324561403 },
    {
      x: 0.7563048245614037,
      y: 5.650356359649122,
      width: 2.5989583333333326,
      height: 2.4562774122807016,
    },
    {
      x: 12.436403508771932,
      y: 0.9299616228070178,
      width: 2.3993055555555527,
      height: 3.285727339181287,
    },
    {
      x: 12.18704312865497,
      y: 5.207145467836257,
      width: 2.927448830409356,
      height: 3.1443713450292394,
    },
  ];
  let startTime = DEFAULT_PRE_ROLL_MS;
  zipper([schedules, smallRectangles]).forEach(
    ([scheduleInfo, smallRectangle]) => {
      if (scheduleInfo.type != "rectangle") {
        throw new Error("wtf");
      }
      const schedule = scheduleInfo.schedule;
      schedule.length = 0;
      schedule.push({
        time: startTime,
        value: smallRectangle,
        easeAfter: ease,
      });
      schedule.push({ time: startTime + 1000, value: middleRectangle });
      schedule.push({
        time: startTime + 6000,
        value: middleRectangle,
        easeAfter: ease,
      });
      schedule.push({ time: startTime + 7000, value: smallRectangle });
      startTime += 6000;
    },
  );
  const scene: Showable = {
    description,
    schedules,
    duration: schedules.at(-1)!.schedule.at(-1)!.time + DEFAULT_POST_ROLL_MS,
    soundClips: [
      {
        // "Type here."
        source: "./Showcase.FLAC",
        startMsIntoScene: 0,
        startMsIntoClip: 420417.42,
        lengthMs: 27618.77,
      },
    ],
    show(options) {
      components.forEach((component) => component.show(options));
      const context = options.context;
      const gradient = context.createLinearGradient(
        boundingBox.x.min,
        boundingBox.y.max,
        boundingBox.x.max,
        boundingBox.y.max,
      );
      myRainbow.forEach((color, index, array) => {
        gradient.addColorStop(index / (array.length - 1), color);
      });
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = titleFont.strokeWidth;
      context.strokeStyle = gradient;
      context.stroke(path);
    },
  };
  sceneList.add(scene);
}

// ── Pixel Perfect Freaky Dot Patterns ────────────────────────────────────────
// NOT READY FOR PRIME TIME
// Multiple Issues.  Doesn't look right.  Takes way too much CPU.
//
// Three Path2D layers of randomly-placed ellipses, built once at load time.
// Two layers oscillate with tiny sine-wave rotations around a user-editable
// center point.  Inspired by the SVG "dalmatian filter" experiments but
// vector-accurate and free of GPU-memory blowup.
// https://youtu.be/iOYEg6xP9jg?si=eAqzZdsbjsJE6q13
// https://youtu.be/cGEIfy_wQ2Y?si=BQQpKzpysi--zz73
{
  // ── Dot geometry (built once) ──
  const rng = Random.create("[42,17,99,7]");
  const DOT_COUNT = 1200; // per layer
  const MARGIN = 0.5; // extend beyond canvas edges to hide gaps during rotation

  function buildLayer(): Path2D {
    const path = new Path2D();
    for (let i = 0; i < DOT_COUNT; i++) {
      const cx = rng() * (16 + 2 * MARGIN) - MARGIN;
      const cy = rng() * (9 + 2 * MARGIN) - MARGIN;
      const rx = 0.04 + rng() * 0.07; // 0.04 – 0.11
      const ry = 0.04 + rng() * 0.07;
      const rot = rng() * Math.PI;
      path.ellipse(cx, cy, rx, ry, rot, 0, FULL_CIRCLE);
    }
    return path;
  }

  const fixedLayer = buildLayer();
  const rotLayer1 = buildLayer();
  const rotLayer2 = buildLayer();

  // ── Oscillator parameters (matching the original SVG version) ──
  // extreme1 and extreme2 are in degrees; converted to radians here.
  function makeOscillator(
    extreme1Deg: number,
    extreme2Deg: number,
    periodMs: number,
  ) {
    const center = ((extreme1Deg + extreme2Deg) / 2) * (Math.PI / 180);
    const amplitude =
      (extreme1Deg - (extreme1Deg + extreme2Deg) / 2) * (Math.PI / 180);
    return (globalTime: number) =>
      Math.sin((globalTime / periodMs) * FULL_CIRCLE) * amplitude + center;
  }
  const osc1 = makeOscillator(0.5, 1.5, 15_000); // +0.5° ↔ +1.5°
  const osc2 = makeOscillator(-0.5, -1.5, 13_081); // -0.5° ↔ -1.5°

  // ── Schedule: rotation center (user-editable) ──
  const rotCenterSchedule: Keyframe<Point>[] = [
    { time: 0, value: { x: 8, y: 4.5 } }, // canvas center by default
  ];

  const titlePath = ParagraphLayout.singlePathShape({
    text: "Pixel Perfect Freaky Dot Patterns",
    font: titleFont,
    alignment: "center",
    width: 16,
  }).canvasPath;

  const freakyDots: Showable = {
    description: "Pixel Perfect Freaky Dot Patterns",
    duration: DEFAULT_SLIDE_DURATION_MS,
    schedules: [
      {
        description: "Rotation Center",
        type: "point",
        schedule: rotCenterSchedule,
      },
    ],
    show({ context, globalTime, timeInMs }) {
      // Background
      context.fillStyle = "black";
      context.fillRect(0, 0, 16, 9);

      // Title
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = titleFont.strokeWidth;
      context.strokeStyle = "white";
      context.stroke(titlePath);

      const center = interpolatePoints(timeInMs, rotCenterSchedule);

      // Helper: apply a rotation around `center`, fill a layer, restore.
      function fillRotated(layer: Path2D, angle: number, style: string) {
        context.save();
        context.translate(center.x, center.y);
        context.rotate(angle);
        context.translate(-center.x, -center.y);
        context.fillStyle = style;
        context.fill(layer);
        context.restore();
      }

      // Fixed layer (no rotation)
      context.fillStyle = "rgba(255,255,255,0.45)";
      context.fill(fixedLayer);

      // Oscillating layers
      fillRotated(rotLayer1, osc1(globalTime), "rgba(255,255,255,0.30)");
      fillRotated(rotLayer2, osc2(globalTime), "rgba(255,255,255,0.20)");
    },
  };
  //sceneList.add(freakyDots);
}

const mainBuilder = new MakeShowableInParallel("Showcase");
mainBuilder.add(blackBackground);
mainBuilder.add(sceneList.build());

export const showcase = mainBuilder.build();
