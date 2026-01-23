import { ReadOnlyRect } from "phil-lib/misc";
import { makeLineFont } from "../glib/line-font";
import { ParagraphLayout } from "../glib/paragraph-layout";
import { easeAndBack } from "../interpolate";
import {
  MakeShowableInParallel,
  MakeShowableInSeries,
  Showable,
} from "../showable";
import { applyTransform, blackBackground, BLUE } from "../utility";
import { panAndZoom } from "../glib/transforms";

// Some of my examples constantly change as I try new things.
// These are examples that will stick around, so I can easily see how I did something in the past.

const mainBuilder = new MakeShowableInParallel();
mainBuilder.add(blackBackground);

{
  const text = "Simple Text Examples";
  const pathShape = ParagraphLayout.singlePathShape({
    text,
    font: makeLineFont(0.7),
    alignment: "center",
    width: 16,
  });
  const path = new Path2D(pathShape.rawPath);
  const showable: Showable = {
    description: text,
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
  mainBuilder.add(showable);
}

{
  const font = makeLineFont(0.25);
  const period = 60_000;
  const margin = 0.125;
  const top = 1.25;
  const dynamicText =
    "Dynamic Text:  " +
    "Notice timeInMs vs globalTime.  " +
    "timeInMs starts at 0 when the Showable starts.  " +
    "addMargins() will freeze that value at the beginning and end.  " +
    "globalTime is the number of milliseconds from the start of the video.  " +
    "It never freezes (unless you pause the video).";
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
    "Or, use panAndZoom() and apply the resulting transformation matrix directly to the canvas's rendering context.  " +
    "This will change everything, including the line width.  " +
    "This is especially useful for transforming an entire scene.";
  const completelyFixedPathShape = ParagraphLayout.singlePathShape({
    font,
    text: completelyFixedText,
    alignment: "justify",
    width: 8 - 2 * margin,
  });
  const completelyFixedPath = new Path2D(completelyFixedPathShape.rawPath);
  const showable: Showable = {
    description: "Make it fit",
    duration: period,
    show({ context, globalTime }) {
      const progress = easeAndBack(globalTime / this.duration);
      const centerLine = 4 + 8 * progress;
      const dynamicPathShape = ParagraphLayout.singlePathShape({
        font,
        text: dynamicText,
        alignment: "justify",
        width: centerLine - 2 * margin,
      }).translate(margin, top);
      const dynamicPath = new Path2D(dynamicPathShape.rawPath);
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
      const fixedPath = new Path2D(
        fixedPathShape.makeItFit(
          rightSide,
          "srcRect fits completely into destRect",
          0.5,
          0,
        ).rawPath,
      );
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
  mainBuilder.add(showable);
}

export const showcase = mainBuilder.build("Showcase top");
