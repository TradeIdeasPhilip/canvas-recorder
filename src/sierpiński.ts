import { FULL_CIRCLE, makeBoundedLinear } from "phil-lib/misc";
import { transform } from "./glib/transforms";
import {
  MakeShowableInParallel,
  MakeShowableInSeries,
  Showable,
} from "./showable";
import { ParagraphLayout } from "./glib/paragraph-layout";
import { LineFontMetrics, makeLineFont } from "./glib/line-font";
import { LCommand, PathShape } from "./glib/path-shape";
import { fixCorners, matchShapes } from "./morph-animation";
import { ease, interpolateNumbers, Keyframes } from "./interpolate";

const titleFont = makeLineFont(0.7);

class MainTriangle {
  private constructor(arg: never) {
    throw new Error("wtf");
  }
  static readonly top = 1;
  static readonly bottom = 8;
  static readonly height = this.bottom - this.top;
  static readonly width = (this.height * 2) / Math.sqrt(3);
  static readonly sideLength = this.width;
  static readonly center = 8;
  static readonly left = this.center - this.width / 2;
  static readonly right = this.center + this.width / 2;
  static readonly topCenter: {
    readonly x: number;
    readonly y: number;
  } = { x: this.center, y: this.top };
  static readonly bottomLeft: {
    readonly x: number;
    readonly y: number;
  } = { x: this.left, y: this.bottom };
  static readonly bottomRight: {
    readonly x: number;
    readonly y: number;
  } = { x: this.right, y: this.bottom };
  static readonly points: readonly {
    readonly x: number;
    readonly y: number;
  }[] = [this.topCenter, this.bottomLeft, this.bottomRight];
  static readonly pathShape = new PathShape(
    this.points.map((start, index, array) => {
      const end = array[(index + 1) % array.length];
      const command = new LCommand(start.x, start.y, end.x, end.y);
      return command;
    }),
  );
}

const sceneList = new MakeShowableInSeries("Scene List");

{
  const scene = new MakeShowableInSeries("Title");
  {
    const font = makeLineFont(new LineFontMetrics(2.5 /*, 0.07*/));
    const textPathShape = ParagraphLayout.singlePathShape({
      text: "Sierpiński",
      font: font,
      alignment: "center",
      width: 16,
    });
    const textPath = textPathShape.canvasPath;
    const trianglePath = MainTriangle.pathShape.canvasPath;
    (window as any).MainTriangle = MainTriangle;
    const FILL_ALPHA = 0.25;
    /**
     * Draw the words and the triangle together.
     */
    const bothEnds: Showable = {
      description: "Both Ends",
      duration: 5_000,
      show({ context }) {
        {
          context.lineCap = "round";
          context.lineJoin = "round";
          context.lineWidth = 0.07;
          context.strokeStyle = "yellow";
          context.stroke(textPath);
          context.strokeStyle = "orange";
          context.stroke(trianglePath);
          context.fillStyle = context.strokeStyle;
          context.globalAlpha = FILL_ALPHA;
          context.fill(trianglePath);
          context.globalAlpha = 1;
        }
      },
    };
    scene.add(bothEnds);

    const morpher = matchShapes(
      fixCorners(textPathShape),
      fixCorners(MainTriangle.pathShape),
    );
    const morphSchedule: Keyframes<number> = [
      { time: 1_500, value: 0, easeAfter: ease },
      { time: 5_500, value: 1 },
    ];
    /**
     * Change between the text and the triangle.
     */
    const morph: Showable = {
      duration: morphSchedule.at(-1)!.time,
      description: "morph",
      show(options) {
        const { context, timeInMs } = options;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.07;
        context.strokeStyle = "yellow";
        const progress = interpolateNumbers(timeInMs, morphSchedule);
        const pathShape = morpher(progress);
        context.stroke(pathShape.canvasPath);
      },
    };
    scene.add(morph);

    const timeToAlpha = makeBoundedLinear(0, 0, 1000, FILL_ALPHA);
    /**
     * Fill in the inside of the triangle.
     *
     * Do it gradually.
     * It was not possible when we had words because the shape wasn't closed yet.
     */
    const fillIn: Showable = {
      description: "fill in",
      duration: 3_000,
      show({ context, timeInMs }) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.07;
        context.fillStyle = context.strokeStyle = "yellow";
        context.globalAlpha = timeToAlpha(timeInMs);
        MainTriangle.pathShape.setCanvasPath(context);
        context.fill();
        context.globalAlpha = 1;
        context.stroke();
      },
    };
    scene.add(fillIn);
  }
  sceneList.add(scene.build());
}

const halftoneBackground: Showable = {
  description: "halftone background",
  /**
   * The intent is to use this in a MakeShowableInParallel.
   * It will run as long as it needs to.
   */
  duration: 0,
  show({ context }) {
    context.fillStyle = "black";
    context.fillRect(0, 0, 16, 9);
    {
      context.fillStyle = "color(srgb-linear 0.022 0.022 0.022)";
      const matrix = new DOMMatrixReadOnly()
        .translate(8, 4.5)
        .rotate(-60.6)
        .translate(-8, -4.5);
      context.beginPath();
      const period = 0.25;
      for (let x = period / 2; x < 16 + period; x += period) {
        for (let y = period / 2; y < 9 + period; y += period) {
          const transformed = transform(x, y, matrix);
          const value = (transformed.x - 8) / 8;
          if (value > 0) {
            const radius = ((Math.sqrt(value) * period) / 2) * Math.SQRT2;
            context.moveTo(x + radius, y);
            context.arc(x, y, radius, 0, FULL_CIRCLE);
          }
        }
      }
      context.fill();
    }
  },
};

const mainBuilder = new MakeShowableInParallel("Showcase");
mainBuilder.add(halftoneBackground);
mainBuilder.add(sceneList.build());

export const sierpińskiTop = mainBuilder.build();
