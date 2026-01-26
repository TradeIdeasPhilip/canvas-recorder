import { PathShape } from "./path-shape";

/**
 * Draw a shape (often text) by tracing out the path.
 * @param fromTime When to start displaying things.
 * @param toTime When everything should be on the screen.
 * @param pathShapes What to display.
 * @returns A function used to draw the path.
 * The function's first input: progress.
 * 0 Draws nothing.
 * 1 Draws the whole thing.
 */
export function createHandwriting(
  ...pathShapes: PathShape[]
): (progress: number, context: CanvasRenderingContext2D) => void {
  let start = 0.0001;
  const allConnectedShapes = pathShapes.flatMap((pathShape) =>
    pathShape.splitOnMove(),
  );
  const allShapeInfo = allConnectedShapes.map((shape) => {
    const length = shape.getLength();
    const end = start + length;
    const path = shape.canvasPath;
    const result = { path, start, length, end };
    start = end;
    return result;
  });
  const totalLength = start;
  function drawTo(progress: number, context: CanvasRenderingContext2D) {
    const length = progress * totalLength;
    for (const shapeInfo of allShapeInfo) {
      if (length <= shapeInfo.start) {
        break;
      }
      if (length >= shapeInfo.end) {
        context.setLineDash([]);
      } else {
        context.setLineDash([length - shapeInfo.start, totalLength]);
      }
      context.stroke(shapeInfo.path);
    }
    context.setLineDash([]);
  }
  return drawTo;
}
