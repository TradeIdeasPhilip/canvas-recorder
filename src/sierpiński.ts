import {
  assertNonNullable,
  FULL_CIRCLE,
  initializedArray,
  lerp,
  makeBoundedLinear,
  zip,
} from "phil-lib/misc";
import { transform } from "./glib/transforms";
import {
  addMargins,
  MakeShowableInParallel,
  MakeShowableInSeries,
  Showable,
  ShowOptions,
} from "./showable";
import { ParagraphLayout } from "./glib/paragraph-layout";
import { LineFontMetrics, makeLineFont } from "./glib/line-font";
import { Command, LCommand, PathShape, QCommand } from "./glib/path-shape";
import { fixCorners, matchShapes } from "./morph-animation";
import {
  ease,
  easeIn,
  easeOut,
  interpolateNumbers,
  Keyframe,
  Keyframes,
  makePathShapeInterpolator,
} from "./interpolate";
import { myRainbow } from "./glib/my-rainbow";
import { strokeColors } from "./stroke-colors";

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
  /**
   * Internally all items are 1×1.
   * This will give you a new matrix that will resize the triangles.
   * The result will have the correct aspect ratio for an equilateral triangle.
   * The result will be as big as possible, respecting the given limits and the aspect ratio.
   * I.e. it will completely fit inside the given width and height.
   * @param maxHeight The resulting width will be limited to this.
   * @param maxWidth The resulting height will be limited to this.
   * @returns A new Matrix
   */
  static resizeToMax(maxHeight: number, maxWidth: number) {
    const impliedWidth = (maxHeight / MainTriangle.height) * MainTriangle.width;
    let height: number;
    let width: number;
    if (impliedWidth < maxWidth) {
      height = maxHeight;
      width = impliedWidth;
    } else {
      width = maxWidth;
      height = (width / MainTriangle.width) * MainTriangle.height;
    }
    const matrix = new DOMMatrix().scale(width, height);
    return { width, height, matrix };
  }
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
  /**
   *
   * @param index Which path.
   * 0 For the simplest path, a single triangle.
   * @returns
   */
  static getPath(index: number) {
    this.minPaths(index + 1);
    return this.paths[index];
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
      getCommands() {
        return this.#items.map(({ segment, forward }) => {
          if (forward) {
            return new LCommand(
              segment.from.x,
              segment.from.y,
              segment.to.x,
              segment.to.y,
            );
          } else {
            return new LCommand(
              segment.to.x,
              segment.to.y,
              segment.from.x,
              segment.from.y,
            );
          }
        });
      }
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

const fillColors = (() => {
  const withAlpha = myRainbow.map(
    (originalColor) => `rgb(from ${originalColor} r g b / ${FILL_ALPHA})`,
  );
  const result = initializedArray(
    16,
    (index) => withAlpha[index % withAlpha.length],
  );
  /**
   * These are the items that will remain at the end, in order.
   * Match these entries to the first five colors,
   * which look good together in this order.
   * red yellow green blue magenta
   */
  const winners = [1, 0, 2, 7, 10];
  result[1] = withAlpha[0]; // red;
  result[0] = withAlpha[2]; // yellow;
  result[2] = withAlpha[3]; // green;
  result[7] = withAlpha[6]; // blue;
  result[10] = withAlpha[8]; // magenta;
  return result;
})();

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

// MARK: All 16 permutations
{
  function animateRainbow(
    pathShape: PathShape,
    fillStyle: string,
    options: ShowOptions,
  ) {
    const { context } = options;
    context.fillStyle = fillStyle;
    context.fill(pathShape.canvasPath, "evenodd");
    strokeColors({
      pathShape,
      context: options.context,
      relativeOffset: -options.globalTime / 15000,
    });
  }
  /**
   * Display all 16 ways around a 2nd generation Sierpiński triangle.
   *
   * Focus on the original triangle shape.
   * Use a slow {@link strokeColors}() animation to highlight the path.
   */
  const part1 = (() => {
    const yOffset = 0.5;
    const yPeriod = 9 / 3;
    const xPeriod = 16 / 6;
    const paths = Triangle.alternatePaths(Triangle.getPath(1)).toArray();
    const locations = ((): readonly Point[] => {
      const xOffset = [xPeriod, xPeriod / 2, xPeriod];
      const across = [5, 6, 5];
      return zip(across, xOffset)
        .flatMap(([across, xOffset], yIndex) => {
          return initializedArray(across, (xIndex) => {
            return {
              x: xOffset + xPeriod * xIndex,
              y: yOffset + yPeriod * yIndex,
            };
          });
        })
        .toArray();
    })();
    const triangleSize = Triangle.resizeToMax(2.5, 2.25);
    const pathShapes = zip(paths, locations)
      .map(([basePath, point]) => {
        return new PathShape(basePath.getCommands()).transform(
          triangleSize.matrix,
        );
      })
      .toArray();
    console.log({ triangleSize, paths, locations, pathShapes });
    const scene: Showable = {
      description: "Permutations",
      duration: 10_000,
      show(options) {
        const { context } = options;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.05;
        const originalTransform = context.getTransform();
        zip(pathShapes, locations, fillColors).forEach(
          ([pathShape, location, fillColor]) => {
            context.translate(location.x, location.y);
            animateRainbow(pathShape, fillColor, options);
            context.setTransform(originalTransform);
          },
        );
      },
    };
    sceneList.add(scene);
    return { pathShapes, locations, yOffset, yPeriod, xPeriod, triangleSize };
  })();
  /**
   * Round the corners.
   *
   * Do it slowly over time.
   */
  const part2 = (() => {
    const interpolators = part1.pathShapes.map((originalPathShape) => {
      const smallerCommands = originalPathShape.commands.map((command) => {
        const splitter = command.makeSplitter();
        const smallerCommand = splitter.split(
          splitter.length / 3,
          2 * (splitter.length / 3),
        );
        return smallerCommand;
      });
      const mitered = new Array<Command>();
      const rounded = new Array<Command>();
      smallerCommands.forEach((currentCommand, index, array) => {
        const previousCommand = array.at(index - 1)!;
        const originalCommand = originalPathShape.commands[index];
        mitered.push(
          QCommand.controlPoints(
            originalCommand.x0,
            originalCommand.y0,
            originalCommand.x0,
            originalCommand.y0,
            originalCommand.x0,
            originalCommand.y0,
          ),
          originalCommand,
        );
        rounded.push(
          QCommand.controlPoints(
            previousCommand.x,
            previousCommand.y,
            originalCommand.x0,
            originalCommand.y0,
            currentCommand.x0,
            currentCommand.y0,
          ),
          currentCommand,
        );
      });
      const interpolator = makePathShapeInterpolator(
        new PathShape(mitered),
        new PathShape(rounded),
      );
      return interpolator;
    });
    const schedules: readonly Keyframe<number>[][] = interpolators.map(
      (_, index, array): Keyframe<number>[] => {
        const firstOffset = 1000;
        const timeBetween = 1000;
        const timeToComplete = 2500;
        const startTime = firstOffset + index * timeBetween;
        return [
          { time: startTime, value: 0, easeAfter: easeOut },
          { time: startTime + timeToComplete, value: 1 },
        ];
      },
    );
    const showable: Showable = {
      duration: schedules.at(-1)!.at(-1)!.time + 7000,
      description: "Make rounded corners",
      show(options) {
        const { context, timeInMs } = options;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.05;
        const originalTransform = context.getTransform();
        zip(interpolators, part1.locations, schedules, fillColors).forEach(
          ([interpolator, location, schedule, fillColor]) => {
            context.translate(location.x, location.y);
            const progress = interpolateNumbers(timeInMs, schedule);
            const pathShape = interpolator(progress);
            animateRainbow(pathShape, fillColor, options);
            context.setTransform(originalTransform);
          },
        );
      },
    };
    sceneList.add(showable);
    return { interpolators };
  })();
  /**
   * Rearrange the pictures with the rounded corners.
   * Highlight the items that differ only by a rotation or a flip.
   */
  const part3 = (() => {
    // | means that one of the lines is straight and the other goes near it.
    // c means that that both lines are curved but they do not cross.
    // x means that the two lines cross.
    // The three characters in a row describe the right side of the triangle,
    // the bottom side, then the left side.
    // This chart shows the way we've originally laid things out,
    // the way they came out of the depth first search.
    //   |c|  |cx  |x|  |xc  ||x
    // ||c  xc|  xcx  x||  x|c  xxx
    //   xxc  cx|  c||  c|x  cxx
    const descriptions: ({
      column: number;
      row: number;
      key: string;
      index: number;
    } & (
      | { duplicate: false }
      | { duplicate: true; fromIndex: number; relationship: "⇔" | "↻" | "↺" }
    ))[] = [
      { column: 5, row: 1, key: "xxx", index: 10, duplicate: false },
      { column: 2, row: 1, key: "|c|", index: 0, duplicate: false },
      { column: 1, row: 1, key: "|cx", index: 1, duplicate: false },
      { column: 3, row: 1, key: "|x|", index: 2, duplicate: false },
      { column: 4, row: 1, key: "xcx", index: 7, duplicate: false },
      {
        column: 0,
        row: 0,
        key: "|xc",
        index: 3,
        duplicate: true,
        fromIndex: 1,
        relationship: "⇔",
      },
      {
        column: 3,
        row: 0,
        key: "||x",
        index: 4,
        duplicate: true,
        fromIndex: 2,
        relationship: "↻",
      },
      {
        column: 2,
        row: 0,
        key: "||c",
        index: 5,
        duplicate: true,
        fromIndex: 0,
        relationship: "↻",
      },
      {
        column: 0,
        row: 1,
        key: "xc|",
        index: 6,
        duplicate: true,
        fromIndex: 3,
        relationship: "↺",
      },
      {
        column: 3,
        row: 2,
        key: "x||",
        index: 8,
        duplicate: true,
        fromIndex: 2,
        relationship: "↺",
      },
      {
        column: 1,
        row: 0,
        key: "x|c",
        index: 9,
        duplicate: true,
        fromIndex: 1,
        relationship: "↻",
      },
      {
        column: 4,
        row: 0,
        key: "xxc",
        index: 11,
        duplicate: true,
        fromIndex: 7,
        relationship: "↻",
      },
      {
        column: 1,
        row: 2,
        key: "cx|",
        index: 12,
        duplicate: true,
        fromIndex: 1,
        relationship: "↺",
      },
      {
        column: 2,
        row: 2,
        key: "c||",
        index: 13,
        duplicate: true,
        fromIndex: 0,
        relationship: "↺",
      },
      {
        column: 0,
        row: 2,
        key: "c|x",
        index: 14,
        duplicate: true,
        fromIndex: 3,
        relationship: "↻",
      },
      {
        column: 4,
        row: 2,
        key: "cxx",
        index: 15,
        duplicate: true,
        fromIndex: 7,
        relationship: "↺",
      },
    ];
    descriptions.sort((a, b) => a.index - b.index);
    const finalLocations: readonly Point[] = descriptions.map(
      ({ column, row }) => {
        const x = (column + 0.5) * part1.xPeriod;
        const y = part1.yOffset + row * part1.yPeriod;
        return { x, y };
      },
    );
    const translationSchedule: Keyframes<number> = [
      { time: 1000, value: 0, easeAfter: ease },
      { time: 2500, value: 1 },
    ];
    const topRotationSchedule: Keyframes<number> = [
      { time: 4000, value: 0, easeAfter: easeIn },
      { time: 5000, value: 1 },
      { time: 9000, value: 1, easeAfter: easeOut },
      { time: 10000, value: 0 },
    ];
    const outgoingAlpha = 0.333;
    const topAlphaSchedule: Keyframes<number> = [
      { time: 10000, value: 1, easeAfter: ease },
      { time: 12000, value: outgoingAlpha },
    ];
    const bottomRotationSchedule: Keyframes<number> = [
      { time: 4000 + 8_000, value: 0, easeAfter: easeIn },
      { time: 5000 + 8_000, value: 1 },
      { time: 9000 + 8_000, value: 1, easeAfter: easeOut },
      { time: 10000 + 8_000, value: 0 },
    ];
    const bottomAlphaSchedule: Keyframes<number> = [
      { time: 10000 + 8_000, value: 1, easeAfter: ease },
      { time: 12000 + 8_000, value: outgoingAlpha },
    ];
    const leftAlphaSchedule: Keyframes<number> = [
      { time: 22000, value: 1, easeAfter: easeOut },
      { time: 24_000, value: outgoingAlpha },
    ];
    const showable: Showable = {
      description: "Move to correct position",
      duration: 25_000,
      show(options) {
        const { context, timeInMs } = options;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.05;
        const originalMatrix = context.getTransform();
        const translationProgress = interpolateNumbers(
          timeInMs,
          translationSchedule,
        );
        const rotationCenterHeight = part1.triangleSize.width / Math.sqrt(3);
        zip(
          finalLocations,
          part2.interpolators,
          descriptions,
          part1.locations,
          fillColors,
        ).forEach(
          ([
            finalLocation,
            interpolator,
            description,
            previousLocation,
            fillColor,
          ]) => {
            const x = lerp(
              previousLocation.x,
              finalLocation.x,
              translationProgress,
            );
            const y = lerp(
              previousLocation.y,
              finalLocation.y,
              translationProgress,
            );
            context.translate(x, y);
            if (description.row == 0) {
              const alpha = interpolateNumbers(timeInMs, topAlphaSchedule);
              context.globalAlpha = alpha;
              const rotationAngle =
                (-FULL_CIRCLE / 3) *
                interpolateNumbers(timeInMs, topRotationSchedule);
              context.translate(0, rotationCenterHeight);
              context.rotate(rotationAngle);
              context.translate(0, -rotationCenterHeight);
            } else if (description.row == 2) {
              const alpha = interpolateNumbers(timeInMs, bottomAlphaSchedule);
              context.globalAlpha = alpha;
              const rotationAngle =
                (FULL_CIRCLE / 3) *
                interpolateNumbers(timeInMs, bottomRotationSchedule);
              context.translate(0, rotationCenterHeight);
              context.rotate(rotationAngle);
              context.translate(0, -rotationCenterHeight);
            } else if (description.column == 0) {
              const alpha = interpolateNumbers(timeInMs, leftAlphaSchedule);
              context.globalAlpha = alpha;
            }
            animateRainbow(interpolator(1), fillColor, options);
            context.setTransform(originalMatrix);
            context.globalAlpha = 1;
          },
        );
      },
    };
    sceneList.add(showable);
    const winners = descriptions
      .filter((description) => {
        return description.row == 1 && description.column > 0;
      })
      .sort((a, b) => {
        return a.column - b.column;
      })
      .map((description) => {
        return description.index;
      });
    console.log({ finalLocations, winners, outgoingAlpha });
    return { finalLocations, winners, outgoingAlpha };
  })();
  /**
   * Move the 5 interesting triangles into the top center.
   * To make room for 5 Fourier animations.
   *
   * Make the other triangles fade out.
   *
   * Start from the tableau where I highlighted the rotations and mirror images.
   */
  const part4 = (() => {
    const finalLocations: readonly Point[] = (() => {
      const left = 9 / 2;
      const right = 16 - left;
      const { height, width } = part1.triangleSize;
      const leftColumnX = left + 0.2 + width / 2;
      const rightColumnX = right - 0.2 - width / 2;
      const topRowY = 0.2;
      const bottomRowY = 0.4 + part1.triangleSize.height;
      return [
        { x: leftColumnX, y: topRowY },
        { x: leftColumnX, y: bottomRowY },
        { x: (left + right) / 2, y: (topRowY + bottomRowY) / 2 },
        { x: rightColumnX, y: bottomRowY },
        { x: rightColumnX, y: topRowY },
      ];
    })();
    const alphaSchedule: Keyframes<number> = [
      { time: 500, value: part3.outgoingAlpha },
      { time: 3000, value: 0 },
    ];
    const movementSchedule: Keyframes<number> = [
      { time: 1000, value: 0, easeAfter: easeIn },
      { time: 3000, value: 1 },
    ];
    const duration = 10000;
    const winners = new Map(zip(part3.winners, finalLocations));
    const scene: Showable = {
      description: "move and hide small triangles",
      duration,
      show(options) {
        const { context, timeInMs } = options;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.05;
        const originalMatrix = context.getTransform();
        part2.interpolators.forEach((interpolator, index) => {
          function drawAt(x: number, y: number) {
            const pathShape = interpolator(1);
            context.translate(x, y);
            animateRainbow(pathShape, fillColors[index], options);
            context.setTransform(originalMatrix);
          }
          const finalLocation = winners.get(index);
          if (finalLocation) {
            const initialLocation = part3.finalLocations[index];
            const progress = interpolateNumbers(timeInMs, movementSchedule);
            const x = lerp(initialLocation.x, finalLocation.x, progress);
            const y = lerp(initialLocation.y, finalLocation.y, progress);
            drawAt(x, y);
          } else {
            const alpha = interpolateNumbers(timeInMs, alphaSchedule);
            if (alpha > 0) {
              context.globalAlpha = alpha;
              const location = part3.finalLocations[index];
              drawAt(location.x, location.y);
              context.globalAlpha = 1;
            }
          }
        });
      },
    };
    sceneList.add(scene);
    return "TODO" as const;
  })();
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
