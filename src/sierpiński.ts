import {
  assertNonNullable,
  count,
  FULL_CIRCLE,
  initializedArray,
  lerp,
  makeBoundedLinear,
  positiveModulo,
  sum,
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
import {
  Command,
  fromBezier,
  LCommand,
  PathShape,
  QCommand,
} from "./glib/path-shape";
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
import {
  FourierTerm,
  getAnimationRules,
  samplesFromPath,
  samplesToFourier,
} from "./peano-fourier/fourier-shared";
import { only } from "./utility";
import { Bezier } from "bezier-js";
import { fadeOut, slideLeft } from "./transitions";
import "./binary-search";
import { zipper } from "./zipper";

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

type Vertex = { point: Point; segments: Segment[] };

class PathSoFar {
  #items: ReadonlyArray<{
    readonly segment: Segment;
    readonly forward: boolean;
  }>;
  get items() {
    return this.#items;
  }
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
  weave(
    finalCount: number,
    available: Map2<number, number, Vertex>,
  ): PathSoFar {
    let pathSoFar: PathSoFar = this;
    while (pathSoFar.#items.length < finalCount) {
      const { x, y } = pathSoFar.end();
      const last = pathSoFar.#items.at(-1)!;
      const vertex = assertNonNullable(available.get(x, y));
      switch (vertex.segments.length) {
        case 2: {
          const nextSegment = only(
            vertex.segments.filter((segment): boolean => {
              return segment != last.segment;
            }),
          );
          pathSoFar = pathSoFar.add(nextSegment);
          break;
        }
        case 4: {
          /**
           *
           * @param segment Required to be part of `vertex`.
           * @returns Rounded to be an integer.
           * It is scaled so that {@link FULL_CIRCLE} → 6.
           */
          function angleFromVertex(segment: Segment): number {
            let segmentFinalX: number;
            let segmentFinalY: number;
            if (segment.from.x == x && segment.from.y == y) {
              segmentFinalX = segment.to.x;
              segmentFinalY = segment.to.y;
            } else if (segment.to.x == x && segment.to.y == y) {
              segmentFinalX = segment.from.x;
              segmentFinalY = segment.from.y;
            } else {
              throw new Error("wtf");
            }
            const inRadians = Math.atan2(segmentFinalY - y, segmentFinalX - x);
            const result = Math.round((inRadians / FULL_CIRCLE) * 6);
            return result;
          }
          const compareTo = angleFromVertex(last.segment);
          const nextSegment = only(
            vertex.segments.filter((segment) => {
              const outgoingAngle = angleFromVertex(segment);
              const difference = positiveModulo(outgoingAngle - compareTo, 6);
              return difference == 2 || difference == 4;
            }),
          );
          pathSoFar = pathSoFar.add(nextSegment);
          break;
        }
        default: {
          throw new Error("wtf");
        }
      }
    }
    return pathSoFar;
  }
}

// MARK: Triangle

/**
 * Use this to find the nodes and edges of an nth generation Sierpiński triangle.
 * And to find variations of that triangle.
 *
 * These triangles are a fixed size, shape, and positions.
 * See {@link Triangle.resizeToMax}() for options to transform the triangle.
 */
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
    const circleRadius = width / Math.sqrt(3);
    return { width, height, circleRadius, matrix };
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
        const depth = Triangle.#paths.length;
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
  static getAllVertices(path: readonly Segment[]) {
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
    return allVertices;
  }
  /**
   *
   * @returns An iterator listing every legal permutation of the given path.
   */
  static alternatePaths(path: readonly Segment[]) {
    const result = PathSoFar.start(path[0]).findAll(
      path.length,
      Triangle.getAllVertices(path),
    );
    return result;
  }
  static wovenPath(path: readonly Segment[]) {
    const result = PathSoFar.start(path[0]).weave(
      path.length,
      Triangle.getAllVertices(path),
    );
    return result;
  }
}
(window as any).Triangle = Triangle;

// MARK: MainTriangle

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
  /**
   *
   * @param n
   * @returns
   * @deprecated Basically replaced by RTriangle, which is more flexible.
   */
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

// MARK: RTriangle

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

/**
 * Make a partially transparent color from a base color.
 * Mostly I set the alpha to {@link FILL_ALPHA},
 * but I adjust that for some colors.
 * I make the apparent brightness of all colors in {@link myColors} the same.
 * @param originalColor The solid version of the color.
 * This function is aimed at {@link myRainbow} colors,
 * but it will work on any color.
 * @returns A partially transparent color.
 */
function addAlpha(originalColor: string) {
  const color = originalColor === myRainbow.yellow ? "yellow" : originalColor;
  const fillAlpha =
    originalColor === myRainbow.cssBlue || originalColor === myRainbow.violet
      ? 1.5 * FILL_ALPHA
      : FILL_ALPHA;
  return `rgb(from ${color} r g b / ${fillAlpha})`;
}

const fillColors = (() => {
  const withAlpha = myRainbow.map(addAlpha);
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
  result[10] = withAlpha[7]; // violet;
  return result;
})();

const sceneList = new MakeShowableInSeries("Scene List");

/**
 * Spread several clips out evenly.
 *
 * Create the same amount of space between each pair of clips.
 * Make them fit in a given range.
 * @param clips List of items to relocate.
 * These will remain in order.
 * @param options
 * * `startFrom` - Number of milliseconds between the start of the scene and when the first clip starts playing.
 * This can be negative to start playing before the previous scene ends.
 * The default is the incoming `startMsIntoScene` of the first element of `clips`.
 * * `endAt` - Number of milliseconds between the start of the scene and when the last clip finishes.
 * The default is the incoming end time of the last element of `clips`.
 * * `startWeight` - How much space to leave between `startFrom and the start of the first clip.
 * The space between each pair of adjacent clips is given a weight of 1.
 * The default is 0 space before the first clip.
 * * `endWeight` - How much space to leave between the end of the last clip and `endAt`.
 * The space between each pair of adjacent clips is given a weight of 1.
 * The default is 0 space after the last clip.
 * @returns `clips`, after the start times of the elements have been adjusted.
 */
function distribute<T extends { startMsIntoScene: number; lengthMs: number }>(
  clips: T[],
  options: {
    startFrom?: number;
    endAt?: number;
    startWeight?: number;
    endWeight?: number;
  },
): T[] {
  if (clips.length == 0) {
    return clips;
  }
  const startFrom = options.startFrom ?? clips[0].startMsIntoScene;
  const endAt =
    options.endAt ??
    (() => {
      const { startMsIntoScene, lengthMs } = clips.at(-1)!;
      return startMsIntoScene + lengthMs;
    })();
  const timeAvailable = endAt - startFrom;
  const timeUsed = sum(clips.map(({ lengthMs }) => lengthMs));
  const timeToDistribute = timeAvailable - timeUsed;
  if (timeToDistribute < 0) {
    throw new Error("wtf");
  }
  /**
   * Distribute the extra space evenly over this many spaces.
   *
   * Between each pair of clips is exactly one space.
   * Before the first clip and after the last, that's configurable.
   * By default they get 0 spaces.
   * They can request a non-integer amount of space.
   */
  let numberOfSpaces = clips.length - 1;
  let { startWeight, endWeight } = options;
  if (numberOfSpaces == 0) {
    // The default values for startWeight and endWeight are (conceptually) tiny positive numbers.
    // Most of the time this is so close to 0 that it just gets rounds off to 0.
    // But if everything else is 0, then all of the weight is given to the one of these that was undefined.
    // If they are both undefined, then the weight is split evenly between them.
    if (startWeight === undefined) {
      if (endWeight === undefined) {
        startWeight = 0.5;
        endWeight = 0.5;
      } else {
        if (endWeight == 0) {
          startWeight = 1;
        } else {
          startWeight = 0;
        }
      }
    } else {
      if (endWeight === undefined) {
        if (startWeight == 0) {
          endWeight = 1;
        } else {
          endWeight = 0;
        }
      }
    }
  } else {
    startWeight ??= 0;
    endWeight ??= 0;
  }
  if (startWeight < 0 || endWeight < 0) {
    throw new Error("wtf");
  }
  numberOfSpaces += startWeight + endWeight;
  if (numberOfSpaces <= 0) {
    throw new Error("wtf");
  }
  const msPerSpace = timeToDistribute / numberOfSpaces;
  let start = startFrom + startWeight * msPerSpace;
  clips.forEach((clip) => {
    clip.startMsIntoScene = start;
    start += clip.lengthMs + msPerSpace;
  });
  return clips;
}

// MARK: Title
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
    (window as any).MainTriangle = MainTriangle;

    const morpher = matchShapes(
      fixCorners(textPathShape),
      fixCorners(MainTriangle.pathShape),
    );
    const morphSchedule: Keyframes<number> = [
      { time: 1_000, value: 0, easeAfter: ease },
      { time: 3_000, value: 1 },
    ];

    /**
     * Change between the text and the triangle.
     */
    const morph: Showable = {
      soundClips: [
        ...distribute(
          [
            {
              source: "./Sierpinski part 1.m4a",
              startMsIntoScene: NaN,
              startMsIntoClip: 0,
              lengthMs: 3.15716 * 1000,
            },
            {
              source: "./Sierpinski part 1.m4a",
              startMsIntoScene: NaN,
              startMsIntoClip: 4.01334 * 1000,
              lengthMs: 6.52837 * 1000,
            },
            {
              source: "./Sierpinski part 1.m4a",
              startMsIntoScene: NaN,
              startMsIntoClip: 12.09353 * 1000,
              lengthMs: 2.19396 * 1000,
            },
            {
              source: "./Sierpinski part 1.m4a",
              startMsIntoScene: NaN,
              startMsIntoClip: 15.57176 * 1000,
              lengthMs: 2.24747 * 1000,
            },
          ],
          { startFrom: 1000, endAt: 23000 },
        ),
        {
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: 25500,
          startMsIntoClip: 18900,
          lengthMs: 32.35474 * 1000,
        },
        {
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: (0 * 60 + 59) * 1000,
          startMsIntoClip: 55.41209 * 1000,
          lengthMs: 2.30309 * 1000,
        },
        {
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: (1 * 60 + 4) * 1000,
          startMsIntoClip: 58.4846 * 1000,
          lengthMs: 2.41249 * 1000,
        },
        {
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: (1 * 60 + 9) * 1000,
          startMsIntoClip: 61.99367 * 1000,
          lengthMs: 6.21399 * 1000,
        },
        {
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: 76134,
          startMsIntoClip: 69.31211 * 1000,
          lengthMs: 4.1385 * 1000,
        },
        {
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: 83000,
          startMsIntoClip: 75115.71,
          lengthMs: 3684.82,
        },
      ],
      duration: morphSchedule.at(-1)!.time,
      description: "morph",
      show(options) {
        const { context, timeInMs } = options;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.07;
        context.strokeStyle = myRainbow.violet;
        const progress = interpolateNumbers(timeInMs, morphSchedule);
        const pathShape = morpher(progress);
        context.stroke(pathShape.canvasPath);
      },
    };
    scene.add(morph);

    const timeToAlpha = makeBoundedLinear(0, 0, 1000, FILL_ALPHA * 2);
    /**
     * Fill in the inside of the triangle.
     *
     * Do it gradually.
     * It was not possible when we had words because the shape wasn't closed yet.
     */
    const fillIn: Showable = {
      description: "fill in",
      duration: 1_500,
      show({ context, timeInMs }) {
        context.lineCap = "round";
        context.lineJoin = "miter";
        context.lineWidth = 0.07;
        context.fillStyle = context.strokeStyle = myRainbow.violet;
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

const recursiveTriangles = (() => {
  // Show a triangle with i levels of recursion.
  // Animate the individual triangles.
  // Make them each grow out of a point, one at a time.
  // Color them based on depth
  const level = 5;
  const growEndTime = 20_000;
  const shrinkStartTime = 25_000;
  const shrinkEndTime = 29_000;
  const triangle = RTriangle.standard(level);
  const byDepth = triangle.byDepth();
  const depthFirst = byDepth.flat(1);
  depthFirst.forEach((triangle, index, array) => {
    //
    /**
     * Start with the first triangle fully formed.
     * Spread the time evenly between the remaining triangles.
     */
    const period = growEndTime / (array.length - 1);
    triangle.schedule.push(
      { time: period * (index - 1 + 0.0), value: 0 },
      { time: period * (index - 1 + 0.8), value: 1 },
    );
  });
  byDepth.forEach((atThisDepth, depth, array) => {
    const keep = 2;
    if (depth >= 2) {
      const totalTime = shrinkEndTime - shrinkStartTime;
      const period = totalTime / (array.length - keep);
      const startTime =
        shrinkStartTime + period * (array.length - keep - depth);
      const endTime = startTime + period * 0.99;
      atThisDepth.forEach((triangle) => {
        triangle.schedule.push(
          { time: startTime, value: 1 },
          { time: endTime, value: 0 },
        );
      });
    }
  });
  const scene: Showable = {
    description: `RTriangle.standard(${level})`,
    duration: shrinkEndTime + 1000,
    show({ context, timeInMs }) {
      const baseColorIndex = 2;
      context.fillStyle = myRainbow.violet;
      context.globalAlpha = FILL_ALPHA * 2;
      context.beginPath();
      const byDepth = initializedArray(level + 1, () => new Path2D());
      const tweakedTime =
        timeInMs <= growEndTime
          ? easeIn(timeInMs / growEndTime) * growEndTime
          : timeInMs;
      triangle.draw(
        tweakedTime, //easeIn(timeInMs / this.duration) * this.duration,
        context,
        byDepth,
      );
      context.fill();
      context.globalAlpha = 1;
      context.lineCap = "round";
      context.lineJoin = "miter";
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
  return { scene };
})();

/**
 *
 * @param originalPathShape Add corners to this.
 * @param amountOfCurve What portion of each segment to replace with a curve.
 * Each end will get this, so it must be less than 0.5.
 * 0.5 would mean there's nothing but a curve with no straight part.
 * 0 would mean no change, still a sharp corner.
 * @returns A function that will take in a progress value and return a PathShape.
 * If the input is 0 or less, the function will return the original PathShape.
 * If the input is 1 or more, the function will return a version of the PathShape with completely rounded corners.
 * If the input is in between, the result will be interpolated.
 */
function makeCornerRounder(
  originalPathShape: PathShape,
  amountOfCurve = 1 / 3,
) {
  if (amountOfCurve <= 0 || amountOfCurve >= 0.5) {
    throw new Error("wtf");
  }
  /**
   * Each of the original line segments will get broken into three parts.
   * `smallerCommands` will contain the middle third of each line segment.
   */
  const smallerCommands = originalPathShape.commands.map((command) => {
    const splitter = command.makeSplitter();
    const smallerCommand = splitter.split(
      splitter.length * amountOfCurve,
      splitter.length * (1 - amountOfCurve),
    );
    return smallerCommand;
  });
  /**
   * These commands retain the sharp corners of the original input.
   * The `smallerCommands` are connected with additional line segments.
   * These show off the mitered nature of the triangles.
   */
  const mitered = new Array<Command>();
  /**
   * These commands follow the same basic path, but with no sharp corners.
   * Each adjacent pair of `smallerCommands` are connected with a parabola.
   * I break each of those parabolas into two equal pieces.
   * I do this to match the two line segments in `mitered` that this curve will be replacing.
   */
  const rounded = new Array<Command>();
  smallerCommands.forEach((smallerCommand, index) => {
    const previousSmallerCommand = smallerCommands.at(index - 1)!;
    const originalCommand = originalPathShape.commands[index];
    /**
     * Connect the two `smallerCommands` with a parabola so there are no corners.
     */
    const fullCurve = new Bezier(
      previousSmallerCommand.x,
      previousSmallerCommand.y,
      originalCommand.x0,
      originalCommand.y0,
      smallerCommand.x0,
      smallerCommand.y0,
    );
    const halves = fullCurve.split(0.5);
    /**
     * To match the line segment immediately before the corner.
     */
    const firstRoundCommand = fromBezier(halves.left);
    /**
     * To match the line segment immediately after the corner.
     */
    const secondRoundCommand = fromBezier(halves.right);
    if (
      !(
        firstRoundCommand instanceof QCommand &&
        secondRoundCommand instanceof QCommand
      )
    ) {
      throw new Error("wtf");
    }
    const firstMiteredCommand = QCommand.controlPoints(
      firstRoundCommand.x0,
      firstRoundCommand.y0,
      firstRoundCommand.x1,
      firstRoundCommand.y1,
      originalCommand.x0,
      originalCommand.y0,
    );
    const secondMiteredCommand = QCommand.controlPoints(
      originalCommand.x0,
      originalCommand.y0,
      secondRoundCommand.x1,
      secondRoundCommand.y1,
      secondRoundCommand.x,
      secondRoundCommand.y,
    );
    mitered.push(firstMiteredCommand, secondMiteredCommand, smallerCommand);
    rounded.push(firstRoundCommand, secondRoundCommand, smallerCommand);
  });
  /**
   * Start at the top of the triangle, just like the original.
   * The previous scene shows the original paths, and we don't want the colors to jump when we switch scenes.
   */
  mitered.push(mitered.shift()!);
  rounded.push(rounded.shift()!);
  /**
   * 0 for the mitered version, 1 for the rounded version.
   * Interpolate in between.
   */
  const interpolator = makePathShapeInterpolator(
    new PathShape(mitered),
    new PathShape(rounded),
  );
  return interpolator;
}

function scaleProgressWithinSegment(progress: number) {
  return ease(Math.min(1, Math.max(0, progress)));
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
      return zipper([across, xOffset])
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
    const pathShapes = zipper([paths, locations])
      .map(([basePath, point]) => {
        return new PathShape(basePath.getCommands()).transform(
          triangleSize.matrix,
        );
      })
      .toArray();
    const scene: Showable = {
      description: "Permutations",
      duration: 4_000,
      show(options) {
        const { context } = options;
        context.lineCap = "round";
        context.lineJoin = "miter";
        context.lineWidth = 0.05;
        const originalTransform = context.getTransform();
        zipper([pathShapes, locations, fillColors]).forEach(
          ([pathShape, location, fillColor]) => {
            context.translate(location.x, location.y);
            animateRainbow(pathShape, fillColor, options);
            context.setTransform(originalTransform);
          },
        );
      },
    };
    sceneList.add(slideLeft(recursiveTriangles.scene, scene, 1500));
    sceneList.add(scene);
    return { pathShapes, locations, yOffset, yPeriod, xPeriod, triangleSize };
  })();
  /**
   * Round the corners.
   *
   * Do it slowly over time.
   */
  const part2 = (() => {
    const interpolators = part1.pathShapes.map((pathShape) =>
      makeCornerRounder(pathShape),
    );
    const schedules: readonly Keyframe<number>[][] = interpolators.map(
      (_, index): Keyframe<number>[] => {
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
      duration: schedules.at(-1)!.at(-1)!.time + 1000,
      description: "Make rounded corners",
      show(options) {
        const { context, timeInMs } = options;
        context.lineCap = "round";
        context.lineJoin = "miter";
        context.lineWidth = 0.05;
        const originalTransform = context.getTransform();
        zipper([interpolators, part1.locations, schedules, fillColors]).forEach(
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
      { time: 9000, value: 0, easeAfter: easeIn },
      { time: 10000, value: 1 },
      { time: 14000, value: 1, easeAfter: easeOut },
      { time: 15000, value: 0 },
    ];
    const outgoingAlpha = 0.333;
    const topAlphaSchedule: Keyframes<number> = [
      { time: 15000, value: 1, easeAfter: ease },
      { time: 17000, value: outgoingAlpha },
    ];
    const bottomRotationSchedule: Keyframes<number> = [
      { time: 17_000, value: 0, easeAfter: easeIn },
      { time: 18_000, value: 1 },
      { time: 20_000, value: 1, easeAfter: easeOut },
      { time: 21_000, value: 0 },
    ];
    const bottomAlphaSchedule: Keyframes<number> = [
      { time: 21_000, value: 1, easeAfter: ease },
      { time: 23_000, value: outgoingAlpha },
    ];
    const leftAlphaSchedule: Keyframes<number> = [
      { time: 27000, value: 1, easeAfter: easeOut },
      { time: 29_000, value: outgoingAlpha },
    ];
    const showable: Showable = {
      description: "Move to correct position",
      duration: 32_000,
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
        const rotationCenterHeight = part1.triangleSize.circleRadius;
        zipper([
          finalLocations,
          part2.interpolators,
          descriptions,
          part1.locations,
          fillColors,
        ]).forEach(
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
    //console.log({ finalLocations, winners, outgoingAlpha });
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
    const duration = 7000;
    const qqq = zipper([part3.winners, finalLocations]);
    const winners = new Map(qqq);
    const scene: Showable = {
      description: "move and hide small triangles",
      duration,
      soundClips: [
        {
          startMsIntoScene: 0,
          startMsIntoClip: 80201,
          source: "./Sierpinski part 1.m4a",
          lengthMs: 5_076,
        },
      ],
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
    const winnerInfo: readonly { strokeStyle: string; circleCenter: Point }[] =
      [
        { strokeStyle: myRainbow.red, circleCenter: { x: 9 / 4, y: 9 / 4 } },
        {
          strokeStyle: myRainbow.yellow,
          circleCenter: { x: 16 / 6, y: (9 * 3) / 4 },
        },
        {
          strokeStyle: myRainbow.green,
          circleCenter: { x: 16 / 2, y: (9 * 3) / 4 },
        },
        {
          strokeStyle: myRainbow.cssBlue,
          circleCenter: { x: (16 * 5) / 6, y: (9 * 3) / 4 },
        },
        {
          strokeStyle: myRainbow.violet,
          circleCenter: { x: 16 - 9 / 4, y: 9 / 4 },
        },
      ];
    const fourierInstances = zipper([part3.winners, finalLocations, winnerInfo])
      .map(
        ([externalIndex, referenceLocation, { strokeStyle, circleCenter }]) => {
          const interpolator = part2.interpolators[externalIndex];
          const fillStyle = fillColors[externalIndex];
          return {
            referenceLocation,
            circleCenter,
            strokeStyle,
            fillStyle,
            interpolator,
          };
        },
      )
      .toArray();
    return { fourierInstances };
  })();
  const part5 = (() => {
    const keyframes = [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      50,
      100,
      150,
      200,
      250,
      300,
      400,
      500,
      600, //,700,800,900,1023
      //  21, 22, 22, 24, 26, 28, 30, 32, 34, 38, 42, 46, 50, 54, 58, 62, 66, 70,
      //      74, 78, 82, 86, 90, 94, 98, 102, 106, 110, 114, 118, 122, 132, 142, 152,
      //    162, 172, 182, 192, 202, 225, 250, 275, 300, 325, 350, 375, 400, 425, 450,
      // 475,
      // 1022, 1022,
    ];
    const allTerms: (readonly FourierTerm[])[] = [];
    const livePathMakers = part4.fourierInstances.map((info) => {
      /**
       * This is the original version of the triangle with sharp corners.
       *
       * I'm removing the 0 length segments.
       * I added these because they will grow in the rounded corners animation.
       * I'm afraid they will break `samplesFromPath()`.
       * samplesFromPath() went out of its way to give weight to small segments.
       */
      const simplePath = new PathShape(
        info
          .interpolator(0)
          .commands.filter(
            (command) => command.x != command.x0 || command.y != command.y0,
          ),
      );
      //console.log(simplePath.rawPath, info.interpolator(0).rawPath)
      /**
       * Try to draw this in the center of the reference image.
       * It will start there and quickly move to the right place.
       */
      const translatedPath = simplePath.translate(
        info.circleCenter.x - info.referenceLocation.x,
        info.circleCenter.y -
          info.referenceLocation.y -
          2 * part1.triangleSize.circleRadius,
      );
      const samples = samplesFromPath(translatedPath);
      const terms: readonly FourierTerm[] = samplesToFourier(samples);
      allTerms.push(terms);
      const livePathMaker = getAnimationRules(terms, keyframes);
      return livePathMaker;
    });
    const scene: Showable = {
      description: "fourier of 5 2nd generation triangles",
      duration: 60_000 - 4_500,
      soundClips: [
        ...distribute(
          [
            {
              source: "./Sierpinski part 1.m4a",
              startMsIntoScene: 0,
              startMsIntoClip: 87507.24,
              lengthMs: 2178.65,
            },
            {
              source: "./Sierpinski part 1.m4a",
              startMsIntoScene: 0,
              startMsIntoClip: 90174.98,
              lengthMs: 2617.59,
            },
            {
              source: "./Sierpinski part 1.m4a",
              startMsIntoScene: 0,
              startMsIntoClip: 93109.49,
              lengthMs: 1734.03,
            },
          ],
          {
            startFrom: 0,
            endAt: 118772 - 101500 - 2955.49,
            startWeight: 0.5,
            endWeight: 1.5,
          },
        ),

        {
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: 118772 - 101500 - 2955.49,
          startMsIntoClip: 96642.99,
          lengthMs: 2955.49,
        },
        {
          // "I love the yellow and green at this stage"
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: 22000,
          startMsIntoClip: 100735.01,
          lengthMs: 2787.64,
        },
        {
          // "The blue one is getting so round"
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: 27000,
          startMsIntoClip: 104544.78,
          lengthMs: 2090.73,
        },
        {
          // "Yellow and green are pretty close to done"
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: 31_000,
          startMsIntoClip: 107936.4,
          lengthMs: 2555.33,
        },
        {
          // "Red's the slowest, but it's moving"
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: 34_000,
          startMsIntoClip: 112954.15,
          lengthMs: 2834.1,
        },
        {
          // "I'm about to speed this up in a moment"
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: 40_000,
          startMsIntoClip: 117507.28,
          lengthMs: 2137.19,
        },
        {
          // "It takes a whole lot of small terms to bring out the corners."
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: 45_000,
          startMsIntoClip: 120689.84,
          lengthMs: 6.14503 * 1000,
        },
      ],
      show(options) {
        const { context, timeInMs } = options;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.05;
        const originalMatrix = context.getTransform();
        zipper([part4.fourierInstances, livePathMakers]).forEach(
          ([info, livePathMaker]) => {
            const pathShape = info.interpolator(1);
            context.translate(
              info.referenceLocation.x,
              info.referenceLocation.y,
            );
            animateRainbow(pathShape, info.fillStyle, options);
            context.translate(0, part1.triangleSize.circleRadius);
            context.fillStyle = info.fillStyle;
            context.strokeStyle = info.strokeStyle;
            //    context.translate(info.circleCenter.x, info.circleCenter.y);
            const progress = easeIn(timeInMs / this.duration);
            const whichSegment = livePathMaker.length * progress;
            const segmentIndex = Math.min(
              livePathMaker.length - 1,
              Math.floor(whichSegment),
            );
            const progressWithinSegment = scaleProgressWithinSegment(
              whichSegment - segmentIndex,
            );
            const livePathShape = livePathMaker[segmentIndex](
              progressWithinSegment,
            );
            livePathShape.setCanvasPath(context);
            context.fill("evenodd");
            context.stroke();
            context.setTransform(originalMatrix);
          },
        );
      },
    };
    sceneList.add(scene);
    return { allTerms };
  })();
  const part6 = (() => {
    const importantFourierTerms: FourierTerm[][] = part5.allTerms.map((terms) =>
      terms.toSorted((a, b) => b.amplitude - a.amplitude).splice(0, 20),
    );
    const livePathMakers = (() => {
      const frequencyCounter = new Map<
        number,
        {
          frequency: number;
          count: number;
          totalAmplitude: number;
          amplitudes: number[];
        }
      >();
      part5.allTerms.flat().forEach((term) => {
        let accumulator = frequencyCounter.get(term.frequency);
        if (!accumulator) {
          accumulator = {
            frequency: term.frequency,
            count: 0,
            totalAmplitude: 0,
            amplitudes: [],
          };
          frequencyCounter.set(term.frequency, accumulator);
        }
        accumulator.count++;
        accumulator.totalAmplitude += term.amplitude;
        accumulator.amplitudes.push(term.amplitude);
      });
      const interestingCommonFrequencies = frequencyCounter
        .values()
        .toArray()
        //.sort((a, b) => Math.min(...b.amplitudes) - Math.min(...a.amplitudes));
        .sort((a, b) => b.totalAmplitude - a.totalAmplitude);
      const startWith = interestingCommonFrequencies.slice(0, 7);
      const endWith = interestingCommonFrequencies.slice(7, 11).reverse();
      //console.log({ startWith, endWith });
      const terms = part5.allTerms.map((originalTerms) => {
        const termsAvailable = originalTerms.slice();
        const initialTerms = new Array<FourierTerm>();
        startWith.forEach(({ frequency }) => {
          const index = termsAvailable.findIndex(
            (term) => term.frequency == frequency,
          );
          if (index >= 0) {
            initialTerms.push(only(termsAvailable.splice(index, 1)));
          }
        });
        const finalTerms = new Array<FourierTerm>();
        endWith.forEach(({ frequency }) => {
          const index = termsAvailable.findIndex(
            (term) => term.frequency == frequency,
          );
          if (index >= 0) {
            finalTerms.push(only(termsAvailable.splice(index, 1)));
          }
        });
        const intermediateTerms = termsAvailable.splice(
          0,
          600 - initialTerms.length - finalTerms.length,
        );
        return { initialTerms, intermediateTerms, finalTerms };
      });
      /*
      console.log(terms);
      console.table(
        terms.map((info) => ({
          initialCount: info.initialTerms.length,
          initialAmplitude: sum(
            info.initialTerms.map((term) => term.amplitude),
          ),
          intermediateCount: info.intermediateTerms.length,
          intermediateAmplitude: sum(
            info.intermediateTerms.map((term) => term.amplitude),
          ),
          finalCount: info.finalTerms.length,
          finalAmplitude: sum(info.finalTerms.map((term) => term.amplitude)),
        })),
      );
      */
      const combinedTerms = terms.map(
        ({ initialTerms, intermediateTerms, finalTerms }) => [
          ...initialTerms,
          ...intermediateTerms,
          ...finalTerms,
        ],
      );
      const keyframes = new Array<number>();
      {
        const { initialTerms, intermediateTerms, finalTerms } = terms[0];
        keyframes.push(...count(0, initialTerms.length + 1));
        const restartAfter = initialTerms.length + intermediateTerms.length;
        keyframes.push(
          ...count(restartAfter, restartAfter + finalTerms.length + 1),
        );
        //console.log(keyframes);
      }
      const livePathMakers = combinedTerms.map((terms) =>
        getAnimationRules(terms, keyframes),
      );
      return livePathMakers;
    })();
    const scene: Showable = {
      description: "fourier again more artistically",
      duration: 60_000,
      soundClips: [
        ...distribute(
          [
            {
              // "Okay, that was good but I want to do something slightly different next time.\n"
              source: "./Sierpinski part 1.m4a",
              startMsIntoScene: -780,
              startMsIntoClip: 128459.49,
              lengthMs: 5307.5,
            },
            {
              // "I want to add the terms in a different order."
              source: "./Sierpinski part 1.m4a",
              startMsIntoScene: 5000,
              startMsIntoClip: 134723.91,
              lengthMs: 2562.83,
            },
            {
              // "Lets start with some familiar curves."
              source: "./Sierpinski part 1.m4a",
              startMsIntoScene:
                192230 -
                159000 -
                2512.53 -
                3000 -
                (182.3292 - 175.1285) * 1000 -
                3000,
              // desired start 175.1285, current start: 182.3292
              startMsIntoClip: 137876.57,
              lengthMs: 2512.53,
            },
          ],
          {},
        ),
        // beginning of scene: 154.5000
        ...distribute(
          [
            {
              // "But then I'm gonna add all the smaller terms."
              source: "./Sierpinski part 1.m4a",
              startMsIntoScene: (177.8471 - 154.5) * 1000,
              startMsIntoClip: 141790.32,
              lengthMs: 3382.25,
            },
            {
              // "So we can see the sharp corners sooner."
              source: "./Sierpinski part 1.m4a",
              startMsIntoScene: 0,
              startMsIntoClip: 145403.81,
              lengthMs: 2244.47,
            },
            {
              // "I had to add 600 terms to get sharp corners."
              source: "./Sierpinski part 1.m4a",
              startMsIntoScene: 0,
              startMsIntoClip: 148355.79,
              lengthMs: 3317.92,
            },
            {
              // "There they are."
              source: "./Sierpinski part 1.m4a",
              startMsIntoScene: (190.9595 - 154.5) * 1000,
              startMsIntoClip: 152527.58,
              lengthMs: 902.67,
            },
          ],
          { startWeight: 1 },
        ),
        ...distribute(
          [
            {
              // "You can clearly see how each Fourier version follows it's expected path."
              source: "./Sierpinski part 1.m4a",
              startMsIntoScene: 0,
              startMsIntoClip: 159236.61,
              lengthMs: 5269.64,
            },
            {
              // "The yellow one reminds me of a medieval helmet."
              source: "./Sierpinski part 1.m4a",
              startMsIntoScene: (199.1207 - 154.5) * 1000,
              startMsIntoClip: 155040.42,
              lengthMs: 2659.21,
            },
          ],
          {
            startFrom: (199.1207 - 154.5) * 1000 - 2000 - 3000,
            endAt: 60_000,
            startWeight: 0,
            endWeight: 2,
          },
        ),
      ],
      show(options) {
        const { context, timeInMs } = options;

        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.05;
        const originalMatrix = context.getTransform();
        zipper([part4.fourierInstances, livePathMakers]).forEach(
          ([info, livePathMaker]) => {
            const pathShape = info.interpolator(1);
            context.translate(
              info.referenceLocation.x,
              info.referenceLocation.y,
            );
            animateRainbow(pathShape, info.fillStyle, options);
            context.translate(0, part1.triangleSize.circleRadius);
            //   context.setTransform(originalMatrix);
            //    context.translate(info.circleCenter.x, info.circleCenter.y);
            context.fillStyle = info.fillStyle;
            context.strokeStyle = info.strokeStyle;
            const progress = timeInMs / this.duration;
            const whichSegment = livePathMaker.length * progress;
            const segmentIndex = Math.min(
              livePathMaker.length - 1,
              Math.floor(whichSegment),
            );
            const progressWithinSegment = scaleProgressWithinSegment(
              whichSegment - segmentIndex,
            );
            const livePathShape = livePathMaker[segmentIndex](
              progressWithinSegment,
            );
            livePathShape.setCanvasPath(context);
            context.fill("evenodd");
            context.stroke();
            context.setTransform(originalMatrix);
          },
        );
      },
    };
    sceneList.add(addMargins(scene, { frozenBefore: 500, frozenAfter: 4500 }));
    sceneList.add({
      ...fadeOut(scene, 2000),
      soundClips: [
        {
          // "Are you ready for something bigger."
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: 0,
          startMsIntoClip: 177115.83,
          lengthMs: 1651.05,
        },
      ],
    });
  })();
}

// MARK: Reference for 6
{
  const growEndTime = 15_000;
  /**
   * Lines on the triangle get different colors based on how deep the recursion.
   */
  const strokeColorByDepth: readonly string[] = [
    myRainbow.violet,
    myRainbow.myBlue,
    myRainbow.green,
    myRainbow.yellow,
    myRainbow.orange,
    myRainbow.red,
  ];
  /**
   * Very tight margins.
   * We can fit 3 across by 2 down with little space left over.
   */
  const triangleSize = Triangle.resizeToMax(9 / 2, 5);
  /**
   * Across, then down, just like English text.
   */
  const locations = (() => {
    class Location {
      readonly first: Point;
      readonly second: Point;
      readonly secondZoom: number;
      readonly schedule: Keyframe<number>[] = [{ time: 0, value: 0 }];
      constructor(
        firstX: number,
        firstY: number,
        secondX: number,
        secondY: number,
        secondZoom: number,
      ) {
        this.first = { x: firstX, y: firstY };
        this.second = { x: secondX, y: secondY };
        this.secondZoom = secondZoom;
      }
      doTransform(options: ShowOptions) {
        const progress = interpolateNumbers(options.timeInMs, this.schedule);
        const x = lerp(this.first.x, this.second.x, progress);
        const y = lerp(this.first.y, this.second.y, progress);
        const zoom = lerp(1, this.secondZoom, progress);
        const context = options.context;
        context.translate(x, y);
        context.scale(zoom, zoom);
      }
    }
    const x0 = 16 / 6;
    const x1 = 16 * (3 / 6);
    const x2 = 16 * (5 / 6);
    const yMargin = (9 - triangleSize.height * 2) / 3;
    const y0 = yMargin;
    const y1 = y0 + triangleSize.height + yMargin;
    const smallX0 = 16 / 12;
    const smallX1 = 16 * (3 / 12);
    const smallY0 = yMargin;
    const smallY1 = triangleSize.height / 2 + yMargin;
    const bigX = 16 * (2 / 3);
    const bigY = yMargin;
    const result: readonly Location[] = [
      new Location(x0, y0, smallX0, smallY0, 0.45),
      new Location(x1, y0, smallX1, smallY0, 0.45),
      new Location(x2, y0, smallX1, smallY1, 0.45),
      new Location(x0, y1, smallX0, smallY1, 0.45),
      new Location(x1, y1, x0, y1, 1),
      new Location(x2, y1, bigX, bigY, 2),
    ];
    result[0].schedule.push(
      { time: 97_500, value: 0, easeAfter: easeOut },
      { time: 99_750, value: 1 },
    );
    result[1].schedule.push(
      { time: 98_250, value: 0, easeAfter: easeOut },
      { time: 100_500, value: 1 },
    );
    result[2].schedule.push(
      { time: 99_000, value: 0, easeAfter: easeOut },
      { time: 101_250, value: 1 },
    );
    result[3].schedule.push(
      { time: 99_075, value: 0, easeAfter: easeOut },
      { time: 101_325, value: 1 },
    );
    result[4].schedule.push(
      {
        time: 99_825,
        value: 0,
        easeAfter: easeOut,
      },
      { time: 102_075, value: 1 },
    );
    result[5].schedule.push(
      {
        time: 100_575,
        value: 0,
        easeAfter: easeOut,
      },
      { time: 102_825, value: 1 },
    );
    return result;
  })();
  const triangles = initializedArray(strokeColorByDepth.length, (level) => {
    /**
     * For the introduction.
     */
    const triangle = new RTriangle(
      { x: 0, y: 0 },
      triangleSize.width / 2,
      triangleSize.height,
      0,
      level,
    );
    triangle.byDepth().forEach((atThisDepth, depth) => {
      const period = growEndTime / strokeColorByDepth.length;
      const startTime = period * (depth + 0.1);
      const endTime = period * (depth + 0.9);
      atThisDepth.forEach((triangle) => {
        triangle.schedule.push(
          { time: startTime, value: 0, easeAfter: easeIn },
          { time: endTime, value: 1 },
        );
      });
    });
    const transformSchedule: Keyframe<number>[] = [];
    /**
     * Use this palette used to stroke this triangle.
     * The innermost color is always red.
     * The outermost color depends on the level.
     */
    const availableColors = strokeColorByDepth.slice(-1 - level);
    // MARK: Correct path
    const originalPath = Triangle.getPath(level);
    const path = Triangle.wovenPath(originalPath);
    /**
     * This is the exact PathShape that we plan to do a fourier transform of.
     * We also use this for the rounded corners reference animation,
     * to show exactly what we will be doing a fourier transform of.
     * This is different from the path we used in the animation that introduced the triangles.
     */
    const wovenPathShape = new PathShape(path.getCommands()).transform(
      triangleSize.matrix,
    );
    /**
     * This will be fed to the `colors` option of the `strokeColors()` function.
     */
    const strokeColorsColors = path.items.map(
      ({ segment }) => availableColors[segment.depth],
    );
    const cornerRounder = makeCornerRounder(wovenPathShape, 0.45);
    const wovenAnimationSchedule: Keyframe<number>[] = [];
    return {
      triangle,
      level,
      availableColors,
      fillColor: addAlpha(availableColors[0]),
      transformSchedule,
      location: locations[level],
      wovenPathShape,
      cornerRounder,
      wovenAnimationSchedule,
      strokeColorsColors,
    };
  });
  {
    /**
     * How long in milliseconds do we wait in the woven state before starting to round the corners.
     *
     * The two types of animation are *almost* seamless.
     * Ideally we could switch between them any time between when the action of the first animation ends and when the action of the second animation starts.
     */
    const silentSwitchTime = 500;
    triangles.forEach(
      ({ wovenAnimationSchedule, transformSchedule }, index) => {
        /**
         * When will the corners first change from completely normal to just slightly rounded.
         */
        let wovenAnimationStart: number = (254 - 221) * 1000;
        /**
         * If this is undefined, the corners will remain rounded until the end.
         */
        let startRestoringCorners: undefined | number;
        /**
         * When will the reference triangle first start shrinking and moving out of the way.
         */
        let transformStartTime: number;
        let transformDuration = 2_000;
        switch (index) {
          case 0: {
            wovenAnimationStart = (231 - 221) * 1000;
            startRestoringCorners = (276.5 - 221) * 1000;
            transformStartTime = (239 - 221) * 1000;
            break;
          }
          case 1: {
            wovenAnimationStart = (236 - 221) * 1000;
            startRestoringCorners = (280 - 221) * 1000;
            transformStartTime = (249 - 221) * 1000;
            break;
          }
          case 2: {
            wovenAnimationStart = (247 - 221) * 1000;
            startRestoringCorners = (298 - 221) * 1000;
            transformStartTime = (256 - 221) * 1000;
            break;
          }
          case 3: {
            transformStartTime = (261 - 221 - 3) * 1000;
            transformDuration = 3000;
            break;
          }
          case 4: {
            transformStartTime = (262 - 221 - 3) * 1000;
            transformDuration = 3000;
            break;
          }
          case 5: {
            transformStartTime = (263 - 221 - 3) * 1000;
            transformDuration = 3000;
            break;
          }
          default: {
            throw new Error("wtf");
          }
        }
        let wovenAnimationEnd = wovenAnimationStart + 5000;
        wovenAnimationSchedule.push(
          { time: wovenAnimationStart - silentSwitchTime - 1, value: -1 },
          { time: wovenAnimationStart - silentSwitchTime, value: 0 },
          { time: wovenAnimationStart, value: 0, easeAfter: easeIn },
          { time: wovenAnimationEnd, value: 1 },
        );
        if (startRestoringCorners !== undefined) {
          const back = startRestoringCorners + 6000;
          wovenAnimationSchedule.push(
            { time: startRestoringCorners, value: 1 },
            { time: back, value: 0 },
          );
        }
        let transformEndTime = transformStartTime + transformDuration;
        transformSchedule.push(
          { time: transformStartTime, value: 0, easeAfter: easeOut },
          { time: transformEndTime, value: 1 },
        );
      },
    );
  }
  const fourierKeyframes = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    22, 24, 26, 28, 30, 35, 40, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275,
    300, 400, 500, 600, 700, 800, 900, 1000, 2000, 3000, 4000,
  ];
  const fourierSchedule: Keyframes<number> = (() => {
    const startTime = 43_907;
    const runTime = 3500;
    const pauseTime = 500;
    let time = startTime;
    const result = new Array<Keyframe<number>>();
    result.push({ time: -1, value: -1 });
    for (let index = 0; index < fourierKeyframes.length - 2; index++) {
      result.push({ time, value: index });
      if (index == -2) {
        // Special case.  Stop half way through to discuss for 5 seconds.
        const value = 0.5;
        time += runTime / 2;
        result.push({ time, value });
        time += 5_000;
        result.push({ time, value });
        time += runTime / 2;
      } else {
        time += runTime;
      }
      result.push({ time, value: index + 1 });
      time += pauseTime;
    }
    return result;
  })();
  const fourierInstances = triangles.map((triangle) => {
    triangle.fillColor;
    const samples = samplesFromPath(triangle.wovenPathShape, 1024 * 4);
    const terms: readonly FourierTerm[] = samplesToFourier(samples);
    const livePathMaker = getAnimationRules(terms, fourierKeyframes);
    return {
      livePathMaker,
      location: triangle.location,
      strokeColorsColors: triangle.strokeColorsColors,
      fillColor: triangle.fillColor,
    };
  });
  const scene: Showable = {
    description: `6 levels at once`,
    duration: fourierSchedule.at(-1)!.time + 5000,
    soundClips: [
      {
        // "It's time for another channel favorite."
        source: "./Sierpinski part 1.m4a",
        startMsIntoScene: 2000,
        startMsIntoClip: 179689.26,
        lengthMs: 2032.7,
      },
      {
        // "Fourier vs recursive fractals."
        source: "./Sierpinski part 1.m4a",
        startMsIntoScene: (228 - 221.0) * 1000,
        startMsIntoClip: 182493.12,
        lengthMs: 2847.31,
      },

      {
        // "That first triangle is simple... turn 120°"
        source: "./Sierpinski part 1.m4a",
        startMsIntoScene: (232.5 - 221) * 1000,
        startMsIntoClip: 185710.86,
        lengthMs: 30872.54,
      },
      {
        // "You ready for this?"
        source: "./Sierpinski part 1.m4a",
        startMsIntoScene: (269 - 221) * 1000,
        startMsIntoClip: 218229.94,
        lengthMs: 1749.44,
      },
      ...distribute(
        [
          {
            // "The first two take form almost immediately."
            source: "./Sierpinski part 1.m4a",
            startMsIntoScene: (276 - 221) * 1000 - 3013.38,
            startMsIntoClip: 237515.34,
            lengthMs: 3013.38,
          },
          {
            // "The bigger ones all look similar.  We don't have enough detail to distinguish between them, yet."
            source: "./Sierpinski part 1.m4a",
            startMsIntoScene: 0,
            startMsIntoClip: 243092.27,
            lengthMs: 5382.57,
          },
          {
            // "Hey, hearts!"
            source: "./Sierpinski part 1.m4a",
            startMsIntoScene: (287 - 221) * 1000,
            startMsIntoClip: 253828.63,
            lengthMs: 1122.57,
          },
        ],
        {},
      ),
      {
        // "And the third one is almost done."
        source: "./Sierpinski part 1.m4a",
        startMsIntoScene: (292.613 - 221) * 1000 - 1640.68,
        startMsIntoClip: 256534.31,
        lengthMs: 1640.68,
      },
      {
        // "All of part 2"
        source: "./Sierpinski part 2.m4a",
        startMsIntoScene: 281.87928 * 1000 - 221 * 1000 + 16149.93,
        startMsIntoClip: 16149.93,
        lengthMs: 158059.33,
      },

      /*
{
  // "For the longest tme I was afraid to fill these shapes because they are not closed... stained glass vibe."
  source: "./Sierpinski part 1.m4a",
  startMsIntoScene: 0,
  startMsIntoClip: 221677.37,
  lengthMs: 13180.97,
},
        {
          // "As always theres a link to my source code in the description, below"
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: 0,
          startMsIntoClip: 166319.81,
          lengthMs: 4893.88,
        },
        {
          // "See how the magic's done."
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: 0,
          startMsIntoClip: 172203.45,
          lengthMs: 1335.11,
        },
        {
          // "Make your own magic."
          source: "./Sierpinski part 1.m4a",
          startMsIntoScene: 0,
          startMsIntoClip: 173569.14,
          lengthMs: 1121.08,
        },
        */
    ],
    show(options) {
      const { context, timeInMs } = options;
      context.lineCap = "round";
      context.lineJoin = "miter";
      const originalMatrix = context.getTransform();
      // MARK: 6 × Reference
      triangles.forEach(
        (
          {
            fillColor,
            level,
            availableColors,
            triangle,
            transformSchedule,
            location,
            cornerRounder,
            wovenAnimationSchedule,
            strokeColorsColors,
          },
          triangleIndex,
        ) => {
          // Each triangle's top center vertex is at 0,0.
          // Move it to the location reserved for it.
          location.doTransform(options);
          /**
           * Move the reference triangle from the center of the reserved space to the top left corner of the space.
           */
          const transformProgress = interpolateNumbers(
            timeInMs,
            transformSchedule,
          );
          if (transformProgress) {
            context.translate(
              1.95 * transformProgress,
              0.4 * transformProgress,
            );
            const scale = lerp(1, 0.25, transformProgress);
            context.scale(scale, scale);
          }
          context.fillStyle = fillColor;
          context.lineWidth = 0.01 * (6 - triangleIndex);
          const wovenAnimationProgress = interpolateNumbers(
            timeInMs,
            wovenAnimationSchedule,
          );
          if (wovenAnimationProgress >= 0) {
            // show off the rounded corners
            const pathShape = cornerRounder(wovenAnimationProgress);
            context.fill(pathShape.canvasPath, "evenodd");
            strokeColors({ context, pathShape, colors: strokeColorsColors });
          } else {
            // Show inner triangles appearing and disappearing.
            context.beginPath();
            const byDepth = initializedArray(level + 1, () => new Path2D());
            triangle.draw(timeInMs, context, byDepth);
            context.fill();
            for (let index = 0; index < byDepth.length; index++) {
              //context.lineWidth = 0.01 * (6 - index);
              context.strokeStyle = availableColors[index];
              context.stroke(byDepth[index]);
            }
          }
          context.setTransform(originalMatrix);
        },
      );
      // MARK: 6 × Fourier
      const segment = interpolateNumbers(timeInMs, fourierSchedule);
      if (segment >= 0) {
        // Note:  Time 0 shows a single point.
        // Times before 0 show nothing.
        const segmentIndex = Math.floor(segment);
        const progressWithinSegment = segment - segmentIndex;
        fourierInstances.forEach((fourierInfo, index, array) => {
          const livePathShape = fourierInfo.livePathMaker[segmentIndex](
            progressWithinSegment,
          );
          // Each triangle's top center vertex is at 0,0.
          // Move it to the location reserved for it.
          fourierInfo.location.doTransform(options);
          livePathShape.setCanvasPath(context);
          context.fillStyle = fourierInfo.fillColor;
          context.fill("evenodd");
          context.lineWidth = 0.03;
          strokeColors({
            context,
            pathShape: livePathShape,
            colors: fourierInfo.strokeColorsColors,
          });
          context.setTransform(originalMatrix);
          if (false && index == array.length - 1) {
            // Write info about the current status on the screen.
            // Only for debug, not for production.
            // Verdana is one of the few web safe fonts with equal sized digit widths.
            // (Tahoma is close, but in an animation you can see things wiggle.)
            context.font = "0.5px Verdana";
            context.fillStyle = "white";
            context.textBaseline = "top";
            context.fillText(
              `${segmentIndex} ${progressWithinSegment.toFixed(3)}: ${fourierKeyframes[segmentIndex]} → ${fourierKeyframes[segmentIndex + 1]}`,
              0.25,
              0.25,
            );
          }
        });
      }
    },
  };
  sceneList.add(scene);
}

// MARK:  Halftone Background

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
      const value = (transformed.x - 8) / 12;
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
