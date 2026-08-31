import { makeLineFont } from "../glib/line-font";
import { ParagraphLayout } from "../glib/paragraph-layout";

const errorFont = makeLineFont(1);

/**
 * Write text on the screen where it is big and easy to see, even without knowing what else is there.
 * @param context Where to draw.
 * @param text What to draw.
 * Can include " " and "\n" for optional and forced line breaks.
 */
export function showError(context: CanvasRenderingContext2D, text: string) {
  const font = errorFont;
  const path = ParagraphLayout.singlePathShape({
    font,
    text,
    alignment: "center",
    width: 15.5,
  }).canvasPath;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = font.strokeWidth * 3;
  context.strokeStyle = "white";
  context.stroke(path);
  context.lineWidth = font.strokeWidth;
  context.strokeStyle = "red";
  context.stroke(path);
}
