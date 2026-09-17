// How to play Galaga, using https://archive.org/details/arcade_20pacgal#
// as the reference recording to clip from.

import { ReadOnlyRect } from "phil-lib/misc";
import { panAndZoom, transformRect } from "./glib/transforms";
import { Showable, ShowOptions } from "./showable";
import { InParallelComponent } from "./slide-components/in-parallel";
import { InSeriesComponent } from "./slide-components/in-series";
import {
  MultiTextComponent,
  TextFormatComponent,
} from "./slide-components/multi-text";
import { RectangleComponent } from "./slide-components/rectangle";
import { SlideComponent } from "./slide-components/slide-component";

// MARK: Fitting Text Into a Rectangle

/**
 * {@link transformRect}() maps two opposite corners and subtracts, so a
 * rotation can hand back a negative width or height.
 * This describes the same area using positive numbers, which is what
 * {@link panAndZoom}() expects.
 *
 * This is exact for quarter turns, which is all we use it for.
 */
function normalizeRect(rect: ReadOnlyRect): ReadOnlyRect {
  return {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

/**
 * Scale and center a {@link MultiTextComponent} so it fits `destRect`,
 * optionally turning it a quarter turn first.
 * Making something fit comes up constantly; this is the short version.
 *
 * Why this has to be a component, rather than a transform we compute once:
 * text can't be measured until it has been laid out, layout happens inside
 * show(), and the inputs (the text itself, the format, the wrap width) can all
 * change over time.
 * So each frame show() measures the text, converts that to a transform, and
 * hands the transform to {@link SlideComponent} to apply.
 */
class FittedText extends SlideComponent {
  readonly #destRect: ReadOnlyRect;
  readonly #text: MultiTextComponent;
  readonly #rotation: DOMMatrixReadOnly;
  /**
   * Written by show(), read back by {@link transformStringAt}().
   * show() is the only place that gets the `ShowOptions` measuring needs, and
   * transformStringAt() is where the base class asks for the answer.
   */
  #transform = "scale(1)";

  constructor({
    description,
    destRect,
    text,
    rotationDegrees = 0,
  }: {
    description: string;
    destRect: ReadOnlyRect;
    text: MultiTextComponent;
    /** Positive turns clockwise on screen.  -90 makes the text read bottom to top. */
    rotationDegrees?: number;
  }) {
    super({ description });
    this.#destRect = destRect;
    this.#text = text;
    this.#rotation = new DOMMatrix().rotate(rotationDegrees);
    this.addFixed({ child: text });

    // Taken over.  We compute the transform, so the Visual Editor shouldn't
    // offer -- or save -- the knobs that feed SlideComponent's own transform.
    // Alpha is untouched, so it stays.
    this.hideScalar(this.transformTemplate);
    [
      this.placeA,
      this.placeB,
      this.placeC,
      this.placeD,
      this.placeE,
      this.placeF,
      this.placeG,
      this.placeH,
      this.placeI,
      this.placeJ,
    ].forEach((schedule) => this.hideSchedule(schedule));
    // Same idea one level down:  Position and Baseline only slide the text
    // around inside a box we immediately re-fit, so they can't do anything
    // here.  Alignment and Width survive -- they decide where the lines break,
    // which changes the shape of the box and so does matter.
    text.hideSchedule(text.positionSchedule);
    text.hideSchedule(text.textBaselineSchedule);
  }

  override show(options: ShowOptions): void {
    this.#transform = this.#fitTransform(options);
    super.show(options);
  }

  override transformStringAt(): string {
    return this.#transform;
  }

  /** A transform taking the text's own coordinates to {@link destRect}. */
  #fitTransform(options: ShowOptions): string {
    const { laidOut, offset } = this.#text.layoutAt(options);
    // The paragraph's own box, moved to wherever MultiTextComponent is going
    // to draw it.  Two things this box is not.  `width` is the *wrap* width,
    // not the width of the ink, so a short line brings the paragraph's empty
    // space along with it; centered text doesn't care, because that space is
    // then symmetric, but left or right aligned text will sit off center
    // unless you set the text's Width to something close to the real text.
    // And the stroke isn't included, because a round cap paints about half a
    // stroke width past the path on every side.  Hence the margin in destRect.
    const box = {
      x: offset.x,
      y: offset.y,
      width: laidOut.width,
      height: laidOut.height,
    };
    if (!(box.width > 0 && box.height > 0)) {
      // No text at this time.  Nothing to fit, and panAndZoom() would divide by 0.
      return "scale(1)";
    }
    const turned = normalizeRect(transformRect(box, this.#rotation));
    const fit = panAndZoom(turned, this.#destRect, "meet");
    // Right to left:  turn the text, then move the turned text into place.
    return fit.multiply(this.#rotation).toString();
  }
}

// MARK: Galaga

/**
 * The narrow strips to the left and right of a 16:10 recording pillarboxed
 * into our 16:9 canvas.
 */
const SIDE_WIDTH = 0.8;

/**
 * Keeps the letterbox text off the edges of its strip.
 * This is also what covers the stroke width, which the measured box does not
 * include.
 */
const STRIP_MARGIN = 0.08;

/**
 * Placeholder letterbox content:  the word "Galaga", reading bottom to top,
 * filling the strip on one side of the video.
 *
 * Note that the font size is not set anywhere.
 * {@link FittedText} rescales whatever it measures, so there is no magic
 * number here to keep in sync with the size of the strip.
 */
function letterboxLabel(description: string, x: number): FittedText {
  const text = new MultiTextComponent({ alignment: "center" });
  text.addFixed({
    child: new TextFormatComponent({ name: "", color: "white" }),
  });
  text.addText("", "Galaga");
  return new FittedText({
    description,
    destRect: {
      x: x + STRIP_MARGIN,
      y: STRIP_MARGIN,
      width: SIDE_WIDTH - 2 * STRIP_MARGIN,
      height: 9 - 2 * STRIP_MARGIN,
    },
    rotationDegrees: -90,
    text,
  });
}

const root = new InParallelComponent("Galaga");

root.addFixed({
  child: new RectangleComponent({
    description: "Background",
    color: "black",
    rect: { x: 0, y: 0, width: 16, height: 9 },
  }),
});

root.addFixed({ child: letterboxLabel("Letterbox (Left)", 0) });
root.addFixed({ child: letterboxLabel("Letterbox (Right)", 16 - SIDE_WIDTH) });

/**
 * The main timeline -- like CapCut's primary track.  Deposit each video
 * clip (and anything else that should play in sequence) here.
 *
 * This starts empty, so `root.duration` starts at 0.  That's fine: the
 * chapter-list builder in dev/canvas-recorder.ts (see `dump()`) always adds
 * the root itself to the list regardless of its duration -- the duration=0
 * filter only prunes *children* from being separately selectable, which is
 * exactly what we want for the background and letterbox above (they don't
 * have their own section of the timeline). Once a clip lands here,
 * `timeline.duration` (and so `root.duration`) becomes nonzero, and the
 * clips inside it become individually selectable chapters.
 */
const timeline = new InSeriesComponent({ description: "Timeline" });
root.addFixed({ child: timeline });

export const galaga: Showable = root;
