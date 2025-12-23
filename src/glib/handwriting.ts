import { makeLinear } from "phil-lib/misc";
import { Showable } from "../showable";
import { PathShape } from "./path-shape";

type Handwriting = {
  /**
   * A new <g> element containing your animation.
   * Attach this to an SVG to view it.
   */
  topElement: SVGGElement;
  /**
   * All of the SVG path elements that were created.
   *
   * This array and the input to createHandwritingGroup() are connected.
   * The path elements in the first index of this array came from the first PathShape in the input.
   * The path elements in the nth index of this array came from the nth PathShape in the input.
   *
   * This can be useful when you want to style different parts of the output differently.
   * Maybe one word in a paragraph layout should be stroked in red, while the rest are stroked in black.
   *
   * These are also available as children of the `topElement`, which can be an easy way to style all of the text.
   */
  allPaths: SVGPathElement[][];
  /**
   * Show the requested state of the animation.
   * @param progress 0.0 for the beginning, nothing visible.
   * 1.0 for the end, everything visible.
   * Values in between are interpolated.
   * Values are automatically clamped to be withing range.
   */
  show(progress: number): void;
  /**
   * The total length of the path, in userspace units.
   * You might want to make the animation run for time proportional to the length of the path.
   * So the imaginary pencil in each animation would move at the same speed.
   */
  totalLength: number;
  makeShowable(options: {
    duration: number;
    delayBefore?: number;
    delayAfter?: number;
  }): Showable;
};

/**
 * Draw a shape (often text) by tracing out the outline.
 * @param fromTime When to start displaying things.
 * @param toTime When everything should be on the screen.
 * @param pathShapes What to display.
 * @returns An object used to operate the animation.
 */
export function createHandwriting(...pathShapes: PathShape[]): Handwriting {
  const topElement = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "g"
  );
  topElement.classList.add("handwriting");
  const allPaths: SVGPathElement[][] = [];
  let soFar = 0.01;
  pathShapes.forEach((pathShape) => {
    const paths = new Array<SVGPathElement>();
    const pieces = pathShape.splitOnMove();
    pieces.forEach((piece) => {
      const element = piece.makeElement();
      paths.push(element);
      topElement.appendChild(element);
      const before = soFar;
      const length = piece.getLength();
      const after = before + length;
      soFar = after;
      element.style.setProperty("--offset", before.toString());
      element.style.setProperty("--length", length.toString());
    });
    allPaths.push(paths);
  });
  const totalLength = soFar;
  function show(progress: number) {
    const position = progress * totalLength;
    topElement.style.setProperty("--total-position", position.toString());
  }
  function makeShowable(options: {
    delayBefore?: number;
    duration: number;
    delayAfter?: number;
  }): Showable {
    const duration = options.duration;
    const delayBefore = options.delayBefore ?? 0;
    const delayAfter = options.delayAfter ?? 0;
    const timeToPosition = makeLinear(
      delayBefore,
      0,
      delayBefore + duration,
      totalLength
    );
    return {
      show(time: number) {
        const position = timeToPosition(time);
        topElement.style.setProperty("--total-position", position.toString());
      },
      hide() {
        topElement.style.setProperty("--total-position", "-1");
      },
      duration: delayBefore + duration + delayAfter,
    };
  }
  return { topElement, allPaths, show, totalLength, makeShowable };
}
