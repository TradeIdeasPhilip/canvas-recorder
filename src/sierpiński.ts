import {
  assertNonNullable,
  FULL_CIRCLE,
  initializedArray,
  makeBoundedLinear,
} from "phil-lib/misc";
import { transform } from "./glib/transforms";
import {
  addMargins,
  MakeShowableInParallel,
  MakeShowableInSeries,
  Showable,
} from "./showable";
import { ParagraphLayout } from "./glib/paragraph-layout";
import { LineFontMetrics, makeLineFont } from "./glib/line-font";
import { Command, LCommand, PathShape } from "./glib/path-shape";
import { fixCorners, matchShapes } from "./morph-animation";
import {
  ease,
  easeIn,
  interpolateNumbers,
  Keyframe,
  Keyframes,
  makePathShapeInterpolator,
} from "./interpolate";
import { myRainbow } from "./glib/my-rainbow";

const titleFont = makeLineFont(0.7);

class Map2<K1, K2, V> {
  readonly #map = new Map<K1, Map<K2, V>>();
  set(k1: K1, k2: K2, value: V) {
    let innerMap = this.#map.get(k1);
    if (!innerMap) {
      innerMap = new Map();
      this.#map.set(k1, innerMap);
    }
    innerMap.set(k2, value);
  }
  get(k1: K1, k2: K2): V | undefined {
    return this.#map.get(k1)?.get(k2);
  }
}

type Point = { readonly x: number; readonly y: number };

type Segment = {
  readonly from: Point;
  readonly to: Point;
  readonly depth: number;
};

class Triangle {
  static #paths: (readonly Segment[])[] = [
    [
      { x: 0, y: 0 },
      { x: 0.5, y: 1 },
      { x: -0.5, y: 1 },
    ].map((from, index, array): Segment => {
      const to = array[(index + 1) % array.length];
      return { to, from, depth: 0 };
    }),
  ];
  static #createNextPath() {
    function between(a: Point, b: Point): Point {
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    const originalPath = Triangle.#paths.at(-1)!;
    const nextPath = new Array<Segment>();
    originalPath.forEach((originalSegment) => {
      const middle = between(originalSegment.from, originalSegment.to);
      nextPath.push({
        from: originalSegment.from,
        to: middle,
        depth: originalSegment.depth,
      });
      if (originalSegment.to.y == originalSegment.from.y) {
        const originalHalfWidth = Math.abs(middle.x - originalSegment.from.x);
        const newHeight = originalHalfWidth;
        const newHalfWidth = originalHalfWidth / 2;
        const invertedBase = middle.y - newHeight;
        const left = middle.x - newHalfWidth;
        const right = middle.x + newHalfWidth;
        const topRight: Point = { x: right, y: invertedBase };
        const topLeft: Point = { x: left, y: invertedBase };
        const depth = originalSegment.depth + 1;
        nextPath.push(
          { from: middle, to: topRight, depth },
          { from: topRight, to: topLeft, depth },
          { from: topLeft, to: middle, depth },
        );
      }
      nextPath.push({
        from: middle,
        to: originalSegment.to,
        depth: originalSegment.depth,
      });
    });
    this.#paths.push(nextPath);
  }
  static minPaths(min: number) {
    while (this.#paths.length < min) {
      this.#createNextPath();
    }
  }
  static get paths(): readonly (readonly Segment[])[] {
    return this.#paths;
  }
  private constructor(_: never) {
    throw new Error("wtf");
  }
  /**
   *
   * @param depth 0 for a single triangle.
   * 1 For 3 triangles with an up-side-down triangle between them.
   */
  static alternatePaths(path: readonly Segment[]) {
    type Vertex = { point: Point; segments: Segment[] };
    const allVertices = new Map2<number, number, Vertex>();
    path.forEach((segment) => {
      function add(point: Point) {
        let vertex = allVertices.get(point.x, point.y);
        if (!vertex) {
          vertex = { point, segments: [] };
          allVertices.set(point.x, point.y, vertex);
        }
        vertex.segments.push(segment);
      }
      add(segment.from);
      add(segment.to);
    });
    class PathSoFar {
      #items: ReadonlyArray<{
        readonly segment: Segment;
        readonly forward: boolean;
      }>;
      private constructor(
        items: ReadonlyArray<{ segment: Segment; forward: boolean }>,
      ) {
        this.#items = items;
      }
      static start(segment: Segment) {
        return new this([{ segment, forward: true }]);
      }
      end() {
        const last = this.#items.at(-1)!;
        return last.forward ? last.segment.to : last.segment.from;
      }
      add(segment: Segment) {
        const { x, y } = this.end();
        let forward: boolean;
        if (segment.from.x == x && segment.from.y == y) {
          forward = true;
        } else if (segment.to.x == x && segment.to.y == y) {
          forward = false;
        } else {
          throw new Error("wtf");
        }
        return new PathSoFar([...this.#items, { segment, forward }]);
      }
      has(segment: Segment) {
        return (
          this.#items.findIndex((possible) => possible.segment === segment) >= 0
        );
      }
      *findAll(
        finalCount: number,
        available: Map2<number, number, Vertex>,
      ): Generator<PathSoFar, void, unknown> {
        if (this.#items.length == finalCount) {
          yield this;
        } else {
          const { x, y } = this.end();
          const vertex = assertNonNullable(available.get(x, y));
          for (const segment of vertex.segments) {
            if (!this.has(segment)) {
              yield* this.add(segment).findAll(finalCount, available);
            }
          }
        }
      }
    }
    const result = PathSoFar.start(path[0]).findAll(path.length, allVertices);
    return result;
  }
}
(window as any).Triangle = Triangle;

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
  static #createInverted(factor: number, startX: number, startY: number) {
    const width = this.width * factor;
    const height = this.height * factor;
    const top = startY - height;
    const left = startX - width / 2;
    const right = startX + width / 2;
    return new PathShape([
      new LCommand(startX, startY, left, top),
      new LCommand(left, top, right, top),
      new LCommand(right, top, startX, startY),
    ]);
  }
  static getMorphablePaths(n: number) {
    const result = new Array<{
      simpleFrom: PathShape;
      from: PathShape;
      to: PathShape;
    }>();
    const needToSplit = new Set<Command>();
    let simpleFrom = this.pathShape;
    needToSplit.add(simpleFrom.commands[1]);
    let factor = 1;
    while (result.length < n) {
      factor /= 2;
      const toCommands = new Array<Command>();
      const fromCommands = new Array<Command>();
      simpleFrom.commands.forEach((command) => {
        if (!needToSplit.has(command)) {
          toCommands.push(command);
          fromCommands.push(command);
        } else {
          const splitter = command.makeSplitter();
          const left = splitter.split(0, 0.5 * splitter.length);
          const right = splitter.split(0.5 * splitter.length, splitter.length);
          needToSplit.add(left);
          needToSplit.add(right);
          toCommands.push(left);
          fromCommands.push(left);
          {
            const startX = right.x0;
            const startY = right.y0;
            const additionalPath = this.#createInverted(factor, startX, startY);
            needToSplit.add(additionalPath.commands[1]);
            toCommands.push(...additionalPath.commands);
            const filler = new LCommand(startX, startY, startX, startY);
            fromCommands.push(filler, filler, filler);
          }
          toCommands.push(right);
          fromCommands.push(right);
        }
      });
      const from = new PathShape(fromCommands);
      const to = new PathShape(toCommands);
      result.push({ from, simpleFrom, to });
      simpleFrom = to;
    }
    return result;
  }
}

/**
 * Recursive Triangle.
 * This creates n levels of sub-triangles.
 *
 * This allows you to animate the addition of new triangles.
 * Each triangle has its own schedule.
 * The default schedules are all empty,
 * so you need to create them before using the RTriangle.
 *
 * Graphics are set up for a specific purpose.
 * We draw one continuous path that can be filled.
 * And we draw a bunch of individual triangles to be stroked.
 * Those are grouped by depth.
 * Triangles at the same depth are stroked in the same color.
 */
class RTriangle {
  byDepth() {
    const result: RTriangle[][] = [];
    function add(item: RTriangle) {
      const depth = item.depth;
      while (result.length <= depth) {
        result.push([]);
      }
      result[depth].push(item);
      item.children.forEach((child) => {
        add(child);
      });
    }
    add(this);
    return result;
  }
  readonly schedule: Keyframe<number>[] = [];
  readonly children: readonly RTriangle[];
  #flatPartY(progress: number) {
    return (
      this.startAndEnd.y + (this.depth == 0 ? +1 : -1) * this.height * progress
    );
  }
  static standard(depthCount: number): RTriangle {
    return new RTriangle(
      MainTriangle.topCenter,
      MainTriangle.width / 2,
      MainTriangle.height,
      0,
      depthCount,
    );
  }
  constructor(
    readonly startAndEnd: Point,
    readonly halfWidth: number,
    readonly height: number,
    readonly depth: number,
    desiredDepth: number,
  ) {
    const children: RTriangle[] = [];
    const initializeChildren = (
      depth: number,
      left: number,
      right: number,
      flatPartY: number,
      halfWidth: number,
      height: number,
    ) => {
      if (depth >= desiredDepth) {
        // desiredDepth is like array.length:  depth >= 0 && depth < desiredDepth
        return;
      }
      const center = (left + right) / 2;
      initializeChildren(
        depth + 1,
        center,
        right,
        flatPartY,
        halfWidth / 2,
        height / 2,
      );
      const point: Point = { x: center, y: flatPartY };
      const child = new RTriangle(
        point,
        halfWidth,
        height,
        depth + 1,
        desiredDepth,
      );
      children.push(child);
      initializeChildren(
        depth + 1,
        left,
        center,
        flatPartY,
        halfWidth / 2,
        height / 2,
      );
    };
    const center = this.startAndEnd.x;
    initializeChildren(
      depth,
      center - halfWidth,
      center + halfWidth,
      this.#flatPartY(1),
      this.halfWidth / 2,
      this.height / 2,
    );
    this.children = children;
  }
  draw(timeInMs: number, all: CanvasPath, byDepth: readonly CanvasPath[]) {
    const progress = interpolateNumbers(timeInMs, this.schedule);
    if (progress <= 0) {
      return;
    }
    const startX = this.startAndEnd.x;
    const startY = this.startAndEnd.y;
    const farRight = startX + this.halfWidth * progress;
    const farLeft = startX - this.halfWidth * progress;
    const flatPartY = this.#flatPartY(progress);
    if (this.depth == 0) {
      all.moveTo(startX, startY);
    }
    all.lineTo(farRight, flatPartY);
    if (progress >= 1) {
      this.children.forEach((child) => {
        all.lineTo(child.startAndEnd.x, child.startAndEnd.y);
        child.draw(timeInMs, all, byDepth);
        all.lineTo(child.startAndEnd.x, child.startAndEnd.y);
      });
    }
    all.lineTo(farLeft, flatPartY);
    if (this.depth == 0) {
      all.closePath();
    }
    {
      const byDepthPath = byDepth[this.depth];
      byDepthPath.moveTo(startX, startY);
      byDepthPath.lineTo(farRight, flatPartY);
      byDepthPath.lineTo(farLeft, flatPartY);
      byDepthPath.closePath();
    }
  }
}
(window as any).RTriangle = RTriangle;

const FILL_ALPHA = 0.25;

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

{
  const scene = new MakeShowableInSeries("expanding");
  MainTriangle.getMorphablePaths(5).forEach((pathShapes, index) => {
    const morpher = makePathShapeInterpolator(pathShapes.from, pathShapes.to);
    const showable: Showable = {
      description: `expanding: ${index} - ${index + 1}`,
      duration: 4_000,
      show({ context, timeInMs }) {
        const progress = easeIn(timeInMs / this.duration);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.07;
        context.fillStyle = context.strokeStyle = "yellow";
        morpher(progress).setCanvasPath(context);
        context.globalAlpha = FILL_ALPHA;
        context.fill();
        context.globalAlpha = 1;
        context.stroke();
      },
    };
    scene.add(addMargins(showable, { frozenBefore: 500, frozenAfter: 1000 }));
  });
  sceneList.add(scene.build());
}

// Show a triangle with i levels of recursion.
// Animate the individual triangles.
// Make them each grow out of a point, one at a time.
// Color them based on depth
for (let i = 4; i < 6; i++) {
  const duration = 20000;
  const triangle = RTriangle.standard(i);
  const depthFirst = triangle.byDepth().flat(1);
  depthFirst.forEach((triangle, index, array) => {
    const period = duration / array.length;
    triangle.schedule.push(
      { time: period * (index + 0.1), value: 0 },
      { time: period * (index + 0.9), value: 1 },
    );
  });
  const scene: Showable = {
    description: `RTriangle.standard(${i})`,
    duration,
    show({ context, timeInMs }) {
      const baseColorIndex = 2;
      context.fillStyle = myRainbow.violet;
      context.globalAlpha = FILL_ALPHA;
      context.beginPath();
      const byDepth = initializedArray(i + 1, () => new Path2D());
      triangle.draw(timeInMs, context, byDepth);
      context.fill();
      context.globalAlpha = 1;
      context.lineCap = "round";
      context.lineJoin = "round";
      //for (let index = byDepth.length - 1; index >= 0; index--) {
      for (let index = 0; index < byDepth.length; index++) {
        context.lineWidth = 0.01 * (6 - index);
        context.strokeStyle =
          myRainbow[(baseColorIndex + 5 - index) % myRainbow.length];
        context.stroke(byDepth[index]);
      }
    },
  };
  sceneList.add(scene);
}

const halftoneBackgroundPath = (() => {
  // This is slow!!!
  // This takes 4.16ms.
  // That would be 1/4 of our total budget of each frame.
  // After I moved this code here, so it's only run once,
  // each frame started taking a total of only 0.047ms
  // I was interpolating between different generations of the triangle.
  const result = new Path2D();
  const matrix = new DOMMatrixReadOnly()
    .translate(8, 4.5)
    .rotate(-60.6)
    .translate(-8, -4.5);
  const period = 0.25;
  for (let x = period / 2; x < 16 + period; x += period) {
    for (let y = period / 2; y < 9 + period; y += period) {
      const transformed = transform(x, y, matrix);
      const value = (transformed.x - 8) / 8;
      if (value > 0) {
        const radius = ((Math.sqrt(value) * period) / 2) * Math.SQRT2;
        result.moveTo(x + radius, y);
        result.arc(x, y, radius, 0, FULL_CIRCLE);
      }
    }
  }
  return result;
})();

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
      context.fill(halftoneBackgroundPath);
    }
  },
};

const mainBuilder = new MakeShowableInParallel("Sierpiński");
mainBuilder.add(halftoneBackground);
mainBuilder.add(sceneList.build());

export const sierpińskiTop = mainBuilder.build();
