// How to play Galaga, using https://archive.org/details/arcade_20pacgal#
// as the reference recording to clip from.

import { Showable } from "./showable";
import { InParallelComponent } from "./slide-components/in-parallel";
import { InSeriesComponent } from "./slide-components/in-series";
import { RectangleComponent } from "./slide-components/rectangle";
import {
  MultiTextComponent,
  TextFormatComponent,
} from "./slide-components/multi-text";
import { SlideComponent } from "./slide-components/slide-component";

// Matches lissajous.ts's letterbox convention: a 16x10-aspect screen
// recording, pillarboxed into the 16x9 canvas, leaves a narrow strip on
// each side.  Nothing here depends on that exact number yet -- it's just a
// reasonable starting guess for where the letterbox placeholders live.
const SIDE_WIDTH = 0.8;

/**
 * Placeholder letterbox content: the word "Galaga", read bottom-to-top, in
 * the narrow strip on one side of the main video.  Will probably be
 * replaced once real letterbox animations exist -- not worth overthinking.
 */
function makeLetterboxLabel(x: number, description: string): SlideComponent {
  const format = new TextFormatComponent({ name: "", color: "white", size: 1.2 });
  const text = new MultiTextComponent({
    position: { x: 0, y: 0 },
    alignment: "center",
    textBaseline: "middle",
    width: 7,
  });
  text.addFixed({ child: format });
  text.addText("", "Galaga");
  const slide = new SlideComponent({
    description,
    // rotate(-90deg): local +x (the text's normal left-to-right reading
    // direction) maps to global -y (straight up), so the word reads
    // bottom-to-top -- makes better use of a narrow vertical strip than
    // sideways horizontal text would.
    transformTemplate: `translate(${x}px, 4.5px) rotate(-90deg)`,
  });
  slide.addFixed({ child: text });
  return slide;
}

const root = new InParallelComponent("Galaga");

root.addFixed({
  child: new RectangleComponent({
    description: "Background",
    color: "black",
    rect: { x: 0, y: 0, width: 16, height: 9 },
  }),
});

root.addFixed({
  child: makeLetterboxLabel(SIDE_WIDTH / 2, "Letterbox (Left)"),
});
root.addFixed({
  child: makeLetterboxLabel(16 - SIDE_WIDTH / 2, "Letterbox (Right)"),
});

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
