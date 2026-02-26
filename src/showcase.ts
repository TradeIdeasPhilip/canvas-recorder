import {
  FULL_CIRCLE,
  initializedArray,
  lerp,
  ReadOnlyRect,
  zip,
} from "phil-lib/misc";
import { LineFontMetrics, makeLineFont } from "./glib/line-font";
import { ParagraphLayout, WordInPlace } from "./glib/paragraph-layout";
import {
  ease,
  easeAndBack,
  easeIn,
  interpolateColor,
  interpolateNumbers,
  Keyframes,
} from "./interpolate";
import {
  MakeShowableInParallel,
  MakeShowableInSeries,
  Showable,
  ShowOptions,
} from "./showable";
import { applyTransform, transform } from "./glib/transforms";
import { myRainbow } from "./glib/my-rainbow";
import { strokeColors } from "./stroke-colors";
import { panAndZoom } from "./glib/transforms";
import { Font } from "./glib/letters-base";
import { makePolygon } from "./peano-fourier/fourier-shared";
import { fromBezier, PathShape } from "./glib/path-shape";
import { PathShapeSplitter } from "./glib/path-shape-splitter";
import { FullFormatter, PathElement } from "./fancy-text";
import { fixCorners, matchShapes } from "./morph-animation";

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
    const path = pathShape.canvasPath;
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
      "These fonts are strokable paths, just like the graph of a function or the outline of a shape, so you can use the same tools and tricks to manipulate them.";
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
    const completelyFixedPath = completelyFixedPathShape.canvasPath;
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
        const dynamicPath = dynamicPathShape.canvasPath;
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
        const fixedPath = fixedPathShape.makeItFit(
          rightSide,
          "srcRect fits completely into destRect",
          0.5,
          0,
        ).canvasPath;
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
    const titlePath = ParagraphLayout.singlePathShape({
      text: scene.description,
      font: titleFont,
      alignment: "center",
      width: 16,
    }).canvasPath;
    const futuraPath = ParagraphLayout.singlePathShape({
      text: "There are currently 3 fonts available.  This is Futura L at size 0.5.",
      font: Font.futuraL(0.5),
      alignment: "right",
      width: 16 - 2 * margin,
    }).translate(margin, 1.75).canvasPath;
    const drawCursive = (() => {
      const formatted = new FullFormatter(Font.cursive(0.5))
        .add("This is Cursive at size 0.5.  This works especially well with ")
        .add("the handwriting effect")
        .add(".")
        .align({
          alignment: "center",
          width: 16 - 2 * margin,
          left: margin,
          top: 4,
        });
      const fixedElements = formatted.pathElements;
      const handwritingElements = fixedElements.splice(1, 1);
      const handwriting = PathElement.handwriting(
        handwritingElements,
        2000,
        8000,
      );
      function drawCursive(options: ShowOptions) {
        fixedElements.forEach((element) => element.show(options));
        handwriting(options);
      }
      return drawCursive;
    })();
    // const cursivePath = ParagraphLayout.singlePathShape({
    //   text: "This is Cursive at size 0.5.  This works especially well with the handwriting effect.",
    //   font: Font.cursive(0.5),
    //   alignment: "center",
    //   width: 16 - 2 * margin,
    // }).translate(margin, 4).canvasPath;
    const showable: Showable = {
      description: "simple parts",
      duration: 0,
      show(options) {
        {
          const context = options.context;
          context.lineCap = "round";
          context.lineJoin = "round";
          context.lineWidth = 0.07;
          context.strokeStyle = "magenta";
          context.stroke(titlePath);
          context.lineWidth = 0.04;
          context.strokeStyle = "rgb(128, 0, 255)";
          context.stroke(futuraPath);
          context.strokeStyle = "rgb(0, 0, 255)";
          drawCursive(options);
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
        context.lineWidth = 0.04 + progress * 0.08;
        const path = ParagraphLayout.singlePathShape({
          text: "This is Line Font.  It has the most characters.  And it can adjust to different line thicknesses. ℕℤℚ",
          //text: "Don’t “Font.”  Mí ¿Cómo? ¡Azúcar! mamá él.  And it can Sierpiński; different: line thicknesses. ℕℤℚ",
          font: makeLineFont(new LineFontMetrics(0.5, context.lineWidth)),
          alignment: "left",
          width: 16 - 2 * margin,
        }).translate(margin, 6.25).canvasPath;
        context.strokeStyle = myRainbow.myBlue;
        context.stroke(path);
      },
    };
    scene.add(showable);
  }
  sceneList.add(scene.build());
}

{
  const scene = new MakeShowableInParallel("Formatting Pieces of Text");
  {
    const pathShape = ParagraphLayout.singlePathShape({
      text: scene.description,
      font: titleFont,
      alignment: "center",
      width: 16,
    });
    const path = pathShape.canvasPath;
    const showable: Showable = {
      description: scene.description,
      duration: 0,
      show({ context }) {
        {
          context.lineCap = "round";
          context.lineJoin = "round";
          context.lineWidth = 0.07;
          context.strokeStyle = myRainbow.myBlue;
          context.stroke(path);
        }
      },
    };
    scene.add(showable);
  }
  {
    const baseFont = makeLineFont(0.5);
    const obliqueFont = baseFont.oblique();
    const cursiveFont = Font.cursive(0.5);
    const showable: Showable = {
      description: "action",
      duration: 20000,
      show({ context, timeInMs }) {
        const layout = new ParagraphLayout(baseFont);
        {
          const possible = "One, two, three.";
          const numberOfChars = Math.round(
            interpolateNumbers(timeInMs, [
              { time: this.duration / 8, value: 0, easeAfter: easeIn },
              { time: this.duration * 0.75, value: possible.length },
            ]),
          );

          layout.addText(possible.substring(0, numberOfChars));
          layout.addWord("| ", undefined, "cursor");
        }
        layout.addText("ParagraphLayout lets you format text: ");
        layout.addText("Bold", undefined, "bold");
        layout.addText(", ");
        layout.addText("oblique (italic)", obliqueFont, "oblique");
        layout.addText(", ");
        layout.addText("red", undefined, "red");
        layout.addText(", ");
        layout.addText("shaking", undefined, "shaking");
        layout.addText(", ");
        const rainbowWordInfo = layout.addText(
          "rainbow",
          undefined,
          "rainbow",
        )[0];
        layout.addText(", ");
        layout.addText("cursive, ", cursiveFont);
        layout.addText("BIG", titleFont);
        layout.addText(", ");
        layout.addText("redacted", undefined, "redacted");
        layout.addText(", ");
        layout.addText("handwriting", cursiveFont, "handwriting");
        layout.addText(", ");
        layout.addText("dashes", undefined, "dashes");
        layout.addText(", ");
        layout.addText("flashing", undefined, "flashing");
        layout.addText(", ");
        layout.addText("and more.");
        const layoutInfo = layout.align(15.5, "left", -0.1);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 0.04;
        context.strokeStyle = myRainbow.myBlue;
        const pathByTag = layoutInfo.pathShapeByTag();
        context.stroke(
          pathByTag.get(undefined)!.translate(0.25, 1.5).canvasPath,
        );
        if (timeInMs % 1000 > 500) {
          context.strokeStyle = "white";
          context.stroke(
            pathByTag.get("cursor")!.translate(0.25, 1.5).canvasPath,
          );
          context.strokeStyle = myRainbow.myBlue;
        }
        context.lineWidth = 0.08;
        context.stroke(pathByTag.get("bold")!.translate(0.25, 1.5).canvasPath);
        context.lineWidth = 0.04;
        context.stroke(
          pathByTag.get("oblique")!.translate(0.25, 1.5).canvasPath,
        );
        context.strokeStyle = "red";
        context.stroke(pathByTag.get("red")!.translate(0.25, 1.5).canvasPath);
        context.strokeStyle = myRainbow.myBlue;
        context.stroke(
          pathByTag
            .get("shaking")!
            .translate(0.25, 1.4 + Math.abs((timeInMs % 200) / 200 - 0.5) / 2)
            .canvasPath,
        );
        {
          const rainbowPathShape = pathByTag
            .get("rainbow")!
            .translate(0.25, 1.5);
          const rainbowBBox = rainbowPathShape.getBBox();
          const rainbow = context.createRadialGradient(
            rainbowBBox.x.mid,
            rainbowBBox.y.max,
            0,
            rainbowBBox.x.mid,
            rainbowBBox.y.max,
            (rainbowBBox.x.size / 2) * 1.1,
          );
          myRainbow
            .slice(0, 7)
            .reverse()
            .forEach((color, index, array) => {
              rainbow.addColorStop(index / (array.length - 1), color);
            });
          context.strokeStyle = rainbow;
          context.stroke(rainbowPathShape.canvasPath);
        }
        {
          //   const wordInfo=      layoutInfo.getAllLetters().find((wordInfo) => {wordInfo.word.wordInfo.tag=="redacted"})!;
          const bBox = pathByTag.get("redacted")!.getBBox();
          context.fillStyle = "blue";
          context.fillRect(
            bBox.x.min + 0.25,
            bBox.y.min + 1.5,
            bBox.x.size,
            bBox.y.size,
          );
        }
        context.strokeStyle = myRainbow.myBlue;
        {
          const basePath = pathByTag.get("handwriting")!.translate(0.25, 1.5);
          const progress = (timeInMs / this.duration) * 2;
          const pathShape = PathShapeSplitter.trimProgress(
            basePath,
            0,
            progress,
          );
          context.stroke(pathShape.canvasPath);
        }
        {
          const path = pathByTag.get("dashes")!.translate(0.25, 1.5).canvasPath;
          context.strokeStyle = "blue";
          context.stroke(path);
          context.strokeStyle = myRainbow.myBlue;
          context.setLineDash([0.1]);
          context.lineDashOffset = timeInMs / 5000;
          context.lineCap = "butt";
          context.stroke(path);
          context.lineCap = "round";
          context.setLineDash([]);
        }
        if (timeInMs % 1000 > 500) {
          context.stroke(
            pathByTag.get("flashing")!.translate(0.25, 1.5).canvasPath,
          );
        }
        {
          const fullPathShape = layoutInfo
            .singlePathShape()
            .translate(0.25, 5.4);
          context.stroke(fullPathShape.canvasPath);
        }
      },
    };
    scene.add(showable);
  }
  sceneList.add(scene.build());
}

/**
 * assume the path is a single connected path,
 * and it is a closed path
 * aimed at the start
 * break the first command into two halves.
 * move the first half to the end of the path
 * it will mostly look the same
 * but now it starts and ends in the middle of smooth piece.
 * It was starting and ending at a vertex.
 * All of the other vertices has mitered joints
 * but the start/end did not.
 * @param original
 * @returns
 */
function breakFirst(original: PathShape) {
  const newCommands = [...original.commands];
  const originalFirstCommand = newCommands.shift();
  if (!originalFirstCommand) {
    // Empty path.
    return original;
  }
  const pieces = originalFirstCommand.getBezier().split(0.5);
  const firstHalf = fromBezier(pieces.left);
  const secondHalf = fromBezier(pieces.right);
  newCommands.unshift(secondHalf);
  newCommands.push(firstHalf);
  return new PathShape(newCommands);
}

{
  const scene = new MakeShowableInParallel("Simple Animated Colors");
  {
    const titlePath = ParagraphLayout.singlePathShape({
      text: scene.description,
      font: titleFont,
      alignment: "center",
      width: 16,
    });
    const starPath = breakFirst(makePolygon(5, 1)).makeItFit(
      { x: 0.5, y: 1.5, width: 3, height: 3 },
      "srcRect fits completely into destRect",
    );
    /**
     * Source:  https://commons.wikimedia.org/wiki/File:Silhouette_of_the_Statue_of_Liberty_in_New_York.svg
     */
    const statueOfLiberty =
      "M251.494,156.465l-17.211-0.931l13.955-1.396l0.464-4.185l-18.608-2.327l20.936-1.396     l3.256-1.86l-15.817-17.213l19.54,12.095l8.372-0.929l2.325-21.865l3.723,20.934l9.305,1.396l13.955-9.768l-10.699,13.488     l3.721,3.258l21.4-5.583l-19.54,9.77l0.932,2.325l25.585,2.791l-26.05,3.723l-0.932,8.372c0,0,2.792,10.235,2.792,13.955     c0,3.723-4.651,6.514-2.792,8.375c1.86,1.862,6.979,13.493,6.979,13.493s4.187,5.581,5.582,5.581     c1.396,0,8.839,9.305,10.699,17.211c1.86,7.91,3.256,14.886,6.048,17.213c2.789,2.327,7.442,4.654,7.907,6.512     c0.467,1.862,6.979,0,6.979,0l3.256-7.906l2.792,0.465v-4.188l25.12,15.817l-2.327,2.792l0.932,3.721l-6.048,8.374     c0,0,4.188,0.465,3.257,4.652c-0.93,4.187-4.652,9.303-4.652,9.303l-4.651,6.047c0,0-7.443,6.514-9.304,4.187     c-1.862-2.327-0.931,33.493-11.63,33.028s-6.047-1.394-6.047,1.862s6.976,62.336,5.115,64.663     c-1.859,2.325-5.582,4.185-5.582,4.185l1.862,11.63l-3.259,2.791c0,0,2.792,30.237,1.396,33.028     c-1.396,2.792-4.652-0.929-4.652,3.256c0,4.187-3.256,42.798,10.234,53.033c4.652,1.862,3.723,16.284,3.723,16.284     s7.443,0.464,6.048,3.721c-1.396,3.256-7.443,27.909,0.465,29.308c7.907,1.394,16.746,7.907,16.746,7.907l-0.929,14.887     l-0.932,6.514l-8.839,9.304l1.86,63.265l2.327,1.862l-3.256,1.396l3.256,39.076l4.651,13.025l6.979,7.908l1.396,10.701     l-5.118,5.58c0,0,5.118,8.839,0.932,15.817c-2.327,5.581,3.72,5.116,3.72,5.116l4.654,4.654v29.306h24.654l14.886,5.583     l0.465,26.516l59.547,1.396l18.608,7.907l0.929,33.495l-17.211,3.256H30.525v-43.728h85.598v-31.168h43.263l1.859-37.682     l8.839-2.325c0,0-4.651-8.374-3.258-12.097c1.398-3.721,0.932-8.839-0.465-10.699c-1.394-1.86-0.929-12.562-0.929-12.562     l4.651-2.789l9.771-18.608l2.324-39.076c0,0-5.116-0.467-1.396-6.047c3.723-5.583,2.327-61.872,2.327-61.872l-8.374-10.234     l-0.467-6.979l-1.858-17.213l10.232-0.93v2.327l1.862-3.258l5.116,0.467l2.327-11.166l-0.467-21.398c0,0,1.397-4.653,3.258-4.653     s3.256-14.42,3.256-14.42l7.908-0.467c0,0-3.256-1.859,0.464-5.583c3.723-3.72,6.515-3.72,6.515-3.72s10.699-16.747,6.979-26.052     c-3.723-9.304,0.929-13.491,0.929-13.491s-3.721-29.772,1.396-44.659c-0.464-4.651-3.256-8.372-3.256-8.372     s6.515-6.514,5.119-13.957c-1.398-7.445-0.932-15.815-0.932-17.211c0-1.398-2.791-12.562-0.932-18.609     c1.863-6.047-5.116-4.187-5.116-8.838c0-4.652,1.396-10.235,3.257-16.282c1.859-6.049,2.324-20.002,2.324-20.002     s-9.768,0.929-10.234-1.863c-0.465-2.792,4.189-26.516,12.562-34.891c4.651-6.976-1.396-15.351-4.188-19.538     c-2.789-4.188-5.116-6.979-2.789-13.026c2.325-6.047,3.254-14.886-0.467-15.351c-3.723-0.464-8.372-9.768-8.372-9.768     s-7.443-9.77-6.979-20.469c0.465-10.701,12.095-25.587,12.095-25.587s-6.512-22.793-6.048-42.796     c0.465-20.004-0.464-7.445-0.464-7.445s-5.583-7.441-3.723-11.164s1.86-7.443,1.86-7.443s-5.116-3.256-5.116-7.443     c0-4.187-1.396-10.234,0-11.63c1.396-1.396,3.72-6.048,3.72-6.048l-6.512-7.443c0,0-2.791-6.047-0.931-8.839     s9.77-2.792,9.77-2.792l-0.931-8.839c0,0-7.443,0.932-5.581-5.118c1.86-6.047,8.839-12.095,8.372-15.351     c-0.465-3.256,6.979,5.583,6.979,5.583l6.512-2.792l0.465,3.723c0,0-0.465,14.419-4.185,14.419c-3.723,0-1.396,6.512-1.396,6.512     l10.699,1.398l1.396,12.095l-9.768,2.327l-1.862,12.095c0,0,6.515,8.374,6.515,15.351c0,6.976-1.863,17.677,0.464,25.587     c2.327,7.907,8.839,29.772,6.512,38.145c-2.326,8.374,6.513,2.324,7.443,10.699c0.932,8.375,3.723,17.678,6.048,15.351     C246.842,176.003,254.285,162.977,251.494,156.465z";
    const statueOfLibertyPath = PathShape.fromRawString(
      statueOfLiberty,
    ).makeItFit(
      { x: 11.5, width: 4, y: 1.5, height: 7 },
      "srcRect fits completely into destRect",
    );

    const sineWaveBase = PathShape.parametric((progress) => {
      const x = lerp(-FULL_CIRCLE, FULL_CIRCLE, progress);
      // Negative sign because math graphs say +y is up and computer graphics say +y is down.
      const y = -Math.sin(x);
      return { x, y };
    }, 21).makeItFit(
      { x: 4, y: 1.5, height: 3, width: 8 },
      "srcRect fits completely into destRect",
    );

    console.log(starPath.getBBox());
    const showable: Showable = {
      description: scene.description,
      duration: 20_000,
      show({ context, timeInMs }) {
        {
          const progress = timeInMs / this.duration;
          context.lineCap = "round";
          context.lineJoin = "round";
          context.lineWidth = 0.07;
          strokeColors({
            context,
            pathShape: titlePath,
            repeatCount: 3,
            relativeOffset: -progress * 3,
          });
          context.lineCap = "butt";
          strokeColors({
            context,
            pathShape: sineWaveBase,
            colors: ["rgb(0, 128, 255)", "rgb(0, 64, 255)", "rgb(0, 0, 255)"],
            sectionLength: 0.125,
            relativeOffset: -progress * 10,
          });
          context.strokeStyle = "pink";
          context.setLineDash([0.125]);
          ((context.lineDashOffset = (-progress * 10) / 3),
            context.stroke(sineWaveBase.translate(0, 1).canvasPath));
          context.setLineDash([]);
          context.lineCap = "round";
          context.lineJoin = "miter";
          strokeColors({
            context,
            pathShape: starPath,
            repeatCount: 2,
            relativeOffset: progress * 2,
          });
          context.lineWidth = 0.03;
          strokeColors({
            context,
            pathShape: statueOfLibertyPath,
            colors: ["#01413e", "#297d6f", "#8fd7c4", "#d7ffff"],
            sectionLength: 0.05,
            offset: progress * 3,
          });
        }
      },
    };
    scene.add(showable);
  }
  scene.reserve(20_000);
  sceneList.add(scene.build());
}

{
  const title = ParagraphLayout.singlePathShape({
    font: titleFont,
    text: "Morphing Text",
    alignment: "center",
    width: 16,
  }).canvasPath;
  const font = makeLineFont(0.355);
  const leftLayout = new ParagraphLayout(font);
  // https://en.wikipedia.org/wiki/The_Lamb_(poem)
  const words1 = leftLayout.addText(`Little Lamb who made thee?
Dost thou know who made thee?
Gave thee life and bid thee feed
By the stream and o’er the mead;
Gave thee clothing of delight,
Softest clothing wooly bright;
Gave thee such a tender voice,
Making all the vales rejoice!`);
  const leftResult = leftLayout.align(undefined, "left");
  const rightLayout = new ParagraphLayout(font);
  // https://poets.org/poem/tyger
  const words2 = rightLayout.addText(`Tyger! Tyger! burning bright
In the forests of the night,
What immortal hand or eye
Could frame thy fearful symmetry?

In what distant deeps or skies
Burnt the fire of thine eyes?
On what wings dare he aspire?
What the hand, dare sieze the fire?`);
  //console.log(words1, words2);
  const rightResult = rightLayout.align(16 - margin, "right");
  const rightTextTop = 2;
  const rightTextLeft = 0;
  const leftTextTop =
    rightTextTop + (rightResult.height - leftResult.height) / 2;
  const leftTextLeft = margin;
  const leftPath = leftResult
    .singlePathShape()
    .translate(leftTextLeft, leftTextTop).canvasPath;
  const rightPath = rightResult
    .singlePathShape()
    .translate(rightTextLeft, rightTextTop).canvasPath;
  function makeWordList(
    layoutResult: typeof rightResult,
    left: number,
    top: number,
  ) {
    const map = new Map<WordInPlace, PathShape[]>();
    for (const letterInfo of layoutResult.getAllLetters(left, top)) {
      const word = letterInfo.word;
      let pathShapes = map.get(word);
      if (!pathShapes) {
        pathShapes = [];
        map.set(word, pathShapes);
      }
      pathShapes.push(letterInfo.translatedShape);
    }
    const result = Array.from(
      map.values(),
      (letterShapes) =>
        new PathShape(letterShapes.flatMap((pathShape) => pathShape.commands)),
    );
    return result;
  }
  const morphers = zip(
    makeWordList(leftResult, leftTextLeft, leftTextTop),
    makeWordList(rightResult, rightTextLeft, rightTextTop),
  )
    .map(([from, to]) => {
      return matchShapes(fixCorners(from), fixCorners(to));
    })
    .toArray();
  const fromColor = "#ffff80";
  const toColor = "red";
  const schedules = initializedArray(
    morphers.length,
    (index): Keyframes<number> => {
      const startTime = index * 1500 + 500;
      const endTime = startTime + 6000;
      return [
        { time: startTime, value: 0, easeAfter: ease },
        { time: endTime, value: 1 },
      ];
    },
  );
  const scene: Showable = {
    duration: schedules.at(-1)!.at(-1)!.time + 5000,
    description: "Morphing Text",
    show({ context, timeInMs }) {
      context.lineCap = "round";
      context.lineJoin = "round";

      context.strokeStyle = myRainbow.myBlue;
      context.lineWidth = titleFont.strokeWidth;
      context.stroke(title);

      context.strokeStyle = fromColor;
      context.lineWidth = font.strokeWidth;
      context.stroke(leftPath);
      //context.strokeStyle = toColor;
      //context.stroke(rightPath);

      zip(morphers, schedules).forEach(([makePath, schedule]) => {
        const progress = interpolateNumbers(timeInMs, schedule);
        if (progress <= 0) {
          return;
        }
        makePath(progress).setCanvasPath(context);
        if (progress < 1) {
          const lineWidth = context.lineWidth;
          context.lineWidth = lineWidth * 2.5;
          context.strokeStyle = "black";
          context.stroke();
          context.lineWidth = lineWidth;
        }
        context.strokeStyle = interpolateColor(progress, fromColor, toColor);
        context.stroke();
      });

      // Make the first word bounce back and forth.
      // This was an early prototype.
      // context.strokeStyle = "yellow";
      // const progress = easeAndBack((timeInMs / 5000) % 1);
      // context.stroke(morphers[0](progress).canvasPath);
    },
  };
  sceneList.add(scene);
}

{
  const scene = new MakeShowableInParallel(
    "Dots, Dashes, and the PathSplitter",
  );
  {
    const pathShape = ParagraphLayout.singlePathShape({
      text: scene.description,
      font: titleFont,
      alignment: "center",
      width: 16,
    });
    const path = pathShape.canvasPath;
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
  scene.reserve(20_000);
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

export const showcase = mainBuilder.build();

//[{"top":-0.625,"bottom":0.25,"width":1.2625,"letters":[{"x":0,"description":{"advance":0.25,"fontMetrics":{"fontSize":0.5,"strokeWidth":0.05}}},{"x":0.375,"description":{"advance":0.25,"fontMetrics":{"fontSize":0.5,"strokeWidth":0.05}}},{"x":0.75,"description":{"advance":0,"fontMetrics":{"fontSize":0.5,"strokeWidth":0.05}}},{"x":0.875,"description":{"advance":0.2625,"fontMetrics":{"fontSize":0.5,"strokeWidth":0.05}}},{"x":1.2625,"description":{"advance":0,"fontMetrics":{"fontSize":0.5,"strokeWidth":0.05}}}],"spaceAfter":0.3}]
//[{"top":-0.625,"bottom":0.25,"width":1.2625,"letters":[{"x":0,"description":{"advance":0.25,"fontMetrics":{"fontSize":0.5,"strokeWidth":0.05}}},{"x":0.375,"description":{"advance":0.25,"fontMetrics":{"fontSize":0.5,"strokeWidth":0.05}}},{"x":0.75,"description":{"advance":0,"fontMetrics":{"fontSize":0.5,"strokeWidth":0.05}}},{"x":0.875,"description":{"advance":0.2625,"fontMetrics":{"fontSize":0.5,"strokeWidth":0.05}}},{"x":1.2625,"description":{"advance":0,"fontMetrics":{"fontSize":0.5,"strokeWidth":0.05}}}],"spaceAfter":0.3}]
