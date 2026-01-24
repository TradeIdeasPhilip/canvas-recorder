import { ReadOnlyRect } from "phil-lib/misc";
import { LineFontMetrics, makeLineFont } from "../glib/line-font";
import { ParagraphLayout } from "../glib/paragraph-layout";
import { easeAndBack } from "../interpolate";
import {
  MakeShowableInParallel,
  MakeShowableInSeries,
  Showable,
} from "../showable";
import { applyTransform, blackBackground, BLUE } from "../utility";
import { panAndZoom } from "../glib/transforms";
import { Font } from "../glib/letters-base";

// Some of my examples constantly change as I try new things.
// These are examples that will stick around, so I can easily see how I did something in the past.

// "Notice timeInMs vs globalTime.  " +
// "timeInMs starts at 0 when the Showable starts.  " +
// "addMargins() will freeze that value at the beginning and end.  " +
// "globalTime is the number of milliseconds from the start of the video.  " +
// "It never freezes (unless you pause the video).";

const titleFont = makeLineFont(0.7);
const margin = 0.25;

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
    const path = new Path2D(pathShape.rawPath);
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
    const period = 60_000;
    const top = 1.5;
    const dynamicText =
      "Dynamic Text:  " +
      "ParagraphLayout lets you request a specific width for your text.  " +
      "The default is unlimited, and you can ask what the resulting width is.\n\n" +
      "These fonts are strokable paths, just like the graph of a function, so you can use the same tools and tricks to manipulate them.";
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
    const completelyFixedPath = new Path2D(completelyFixedPathShape.rawPath);
    const showable: Showable = {
      description: "Make it fit",
      duration: period,
      show({ context, timeInMs }) {
        const progress = easeAndBack(timeInMs / this.duration);
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
    scene.add(showable);
  }
  sceneList.add(scene.build());
}
{
  const scene = new MakeShowableInParallel("Strokable Font List");
  {
    const titlePath = new Path2D(
      ParagraphLayout.singlePathShape({
        text: scene.description,
        font: titleFont,
        alignment: "center",
        width: 16,
      }).rawPath,
    );
    const futuraPath = new Path2D(
      ParagraphLayout.singlePathShape({
        text: "There are currently 3 fonts available.  This is Futura L at size 0.5.",
        font: Font.futuraL(0.5),
        alignment: "right",
        width: 16 - 2 * margin,
      }).translate(margin, 1.5).rawPath,
    );
    const cursivePath = new Path2D(
      ParagraphLayout.singlePathShape({
        text: "This is Cursive at size 0.5.  This works especially well with the handwriting effect.",
        font: Font.cursive(0.5),
        alignment: "center",
        width: 16 - 2 * margin,
      }).translate(margin, 3.25).rawPath,
    );
    const showable: Showable = {
      description: "simple parts",
      duration: 0,
      show({ context }) {
        {
          context.lineCap = "round";
          context.lineJoin = "round";
          context.lineWidth = 0.07;
          context.strokeStyle = "magenta";
          context.stroke(titlePath);
          context.lineWidth = 0.04;
          context.strokeStyle = "rgb(128, 0, 255)";
          context.stroke(futuraPath);
          context.strokeStyle = "rgb(0, 0, 255)";
          context.stroke(cursivePath);
        }
      },
    };
    scene.add(showable);
  }
  {
    const showable: Showable = {
      description: "Line Font",
      duration: 30_000,
      show({ context, timeInMs }) {
        const progress = easeAndBack(timeInMs / this.duration);
        context.lineWidth = 0.04 + progress * 0.06;
        const path = new Path2D(
          ParagraphLayout.singlePathShape({
            text: "This is Line Font.  It has the most characters.  And it can adjust to different line thicknesses.",
            font: makeLineFont(new LineFontMetrics(0.5, context.lineWidth)),
            alignment: "left",
            width: 16 - 2 * margin,
          }).translate(margin, 5.5).rawPath,
        );
        context.strokeStyle = BLUE;
        context.stroke(path);
      },
    };
    scene.add(showable);
  }
  sceneList.add(scene.build());
}

const mainBuilder = new MakeShowableInParallel("Showcase");
mainBuilder.add(blackBackground);
mainBuilder.add(sceneList.build());

export const showcase = mainBuilder.build();
