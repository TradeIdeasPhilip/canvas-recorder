import { myRainbow } from "../glib/my-rainbow";
import { Command, LCommand, PathShape } from "../glib/path-shape";
import { Showable } from "../showable";
import { strokeColors } from "../stroke-colors";

const squarePathShape = new PathShape([
  new LCommand(0, 0, 1, 0),
  new LCommand(1, 0, 1, 1),
  new LCommand(1, 1, 0, 1),
  new LCommand(0, 1, 0, 0),
]);

const trianglePathShape = new PathShape([
  new LCommand(0.5, 0, 1, Math.sqrt(3) / 2),
  new LCommand(1, Math.sqrt(3) / 2, 0, Math.sqrt(3) / 2),
  new LCommand(0, Math.sqrt(3) / 2, 0.5, 0),
]);

const combinedPathShape = (() => {
  const combinedPathCommands = new Array<Command>();
  combinedPathCommands.push(...squarePathShape.commands);
  combinedPathCommands.push(
    ...squarePathShape.translate(1.5, 0).commands.slice(0, 3),
  );
  combinedPathCommands.push(
    ...trianglePathShape.translate(3, 0).commands.slice(0, 2),
  );
  combinedPathCommands.push(...trianglePathShape.translate(4.5, 0).commands);
  return new PathShape(combinedPathCommands).transform(
    new DOMMatrixReadOnly().scale(0.5),
  );
})();

const repeatedPathShape = (() => {
  const combinedPathCommands = new Array<Command>();
  /**
   * This makes the animation look better.
   */
  const reversed = trianglePathShape.reverse();
  for (let i = 0; i < 8; i++) {
    combinedPathCommands.push(...reversed.translate(i * 1.75, 0).commands);
  }
  return new PathShape(combinedPathCommands).transform(
    new DOMMatrixReadOnly().scale(0.5),
  );
})();

export const strokeColorsTest: Showable = {
  description: "test",
  duration: 60_000,
  show(options) {
    const { context, globalTime } = options;
    context.fillStyle = "darkblue";
    context.fillRect(0, 0, 16, 9);
    context.lineWidth = 0.2;

    const relativeOffset = globalTime / 5_000;

    // MARK: squarePathShape
    const squareColors = [...myRainbow, "black", "#888", "white"];
    context.lineCap = "butt";
    context.lineJoin = "bevel";
    strokeColors({
      context,
      pathShape: squarePathShape.translate(1, 1),
      colors: squareColors,
      relativeOffset,
    });
    context.lineJoin = "miter";
    strokeColors({
      context,
      pathShape: squarePathShape.translate(1, 2.5),
      colors: squareColors,
      relativeOffset,
    });
    context.lineJoin = "round";
    strokeColors({
      context,
      pathShape: squarePathShape.translate(1, 4),
      colors: squareColors,
      relativeOffset,
    });
    /*
    context.lineCap = "square";
    context.lineJoin = "bevel";
    strokeColors({
      context,
      pathShape: squarePathShape.translate(2.5, 1),
      colors: squareColors,
    });
    context.lineJoin = "miter";
    strokeColors({
      context,
      pathShape: squarePathShape.translate(2.5, 2.5),
      colors: squareColors,
    });
    context.lineJoin = "round";
    strokeColors({
      context,
      pathShape: squarePathShape.translate(2.5, 4),
      colors: squareColors,
    });
    context.lineCap = "round";
    context.lineJoin = "bevel";
    strokeColors({
      context,
      pathShape: squarePathShape.translate(4, 1),
      colors: squareColors,
    });
    context.lineJoin = "miter";
    strokeColors({
      context,
      pathShape: squarePathShape.translate(4, 2.5),
      colors: squareColors,
    });
    context.lineJoin = "round";
    strokeColors({
      context,
      pathShape: squarePathShape.translate(4, 4),
      colors: squareColors,
    });
    */

    // MARK: trianglePathShape
    const triangleColors = [...myRainbow];
    context.lineCap = "butt";
    context.lineJoin = "bevel";
    strokeColors({
      context,
      pathShape: trianglePathShape.translate(2 + 1, 1),
      colors: triangleColors,
      relativeOffset,
    });
    context.lineJoin = "miter";
    strokeColors({
      context,
      pathShape: trianglePathShape.translate(2 + 1, 2.5),
      colors: triangleColors,
      relativeOffset,
    });
    context.lineJoin = "round";
    strokeColors({
      context,
      pathShape: trianglePathShape.translate(2 + 1, 4),
      colors: triangleColors,
      relativeOffset,
    });

    // MARK: combinedPathShape
    context.lineWidth = 0.15;
    const combinedColors = myRainbow; // ["lightblue", "blue"];
    context.lineCap = "butt";
    context.lineJoin = "bevel";
    strokeColors({
      context,
      pathShape: combinedPathShape.translate(5, 1),
      colors: combinedColors,
      relativeOffset,
    });
    context.lineJoin = "miter";
    strokeColors({
      context,
      pathShape: combinedPathShape.translate(5, 2.5),
      colors: combinedColors,
      relativeOffset,
    });
    context.lineJoin = "round";
    strokeColors({
      context,
      pathShape: combinedPathShape.translate(5, 4),
      colors: combinedColors,
      relativeOffset,
    });
    context.lineCap = "square";
    context.lineJoin = "bevel";
    strokeColors({
      context,
      pathShape: combinedPathShape.translate(6 + 2.5, 1),
      colors: combinedColors,
      relativeOffset,
    });
    context.lineJoin = "miter";
    strokeColors({
      context,
      pathShape: combinedPathShape.translate(6 + 2.5, 2.5),
      colors: combinedColors,
      relativeOffset,
    });
    context.lineJoin = "round";
    strokeColors({
      context,
      pathShape: combinedPathShape.translate(6 + 2.5, 4),
      colors: combinedColors,
      relativeOffset,
    });
    context.lineCap = "round";
    context.lineJoin = "bevel";
    strokeColors({
      context,
      pathShape: combinedPathShape.translate(8 + 4, 1),
      colors: combinedColors,
      relativeOffset,
    });
    context.lineJoin = "miter";
    strokeColors({
      context,
      pathShape: combinedPathShape.translate(8 + 4, 2.5),
      colors: combinedColors,
      relativeOffset,
    });
    context.lineJoin = "round";
    strokeColors({
      context,
      pathShape: combinedPathShape.translate(8 + 4, 4),
      colors: combinedColors,
      relativeOffset,
    });

    // MARK: repeatedPathShape
    context.lineWidth = 0.15;
    const repeatedColors = myRainbow; //["red","pink"];
    context.lineJoin = "bevel";
    strokeColors({
      context,
      pathShape: repeatedPathShape.translate(7, 5.5),
      colors: repeatedColors,
      relativeOffset,
    });
    context.lineJoin = "miter";
    strokeColors({
      context,
      pathShape: repeatedPathShape.translate(7, 6.5),
      colors: repeatedColors,
      relativeOffset,
    });
    context.lineJoin = "round";
    strokeColors({
      context,
      pathShape: repeatedPathShape.translate(7, 7.5),
      colors: repeatedColors,
      relativeOffset,
    });
  },
};
