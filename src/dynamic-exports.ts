import { Showable } from "./showable.ts";
import { ArrayMap } from "./utility.ts";

/**
 * These are the entry points for various videos.
 * These are the natural place for a main program to reach into the code in this directory.
 * You have to explicity `create()` one of these objects so we can use dynamic import.
 * Many of these do a lot of work at startup, and you don't want to do that work for all videos, only the one you want.
 *
 * The keys map to http://localhost:5173/canvas-recorder.html?toShow= values in the web GUI.
 * (The first part of the URL may vary.)
 * The Node version expects this key on the command line.
 *
 * The `description` field for each entry can be used in a menu if no value is offered.
 * I.e. it's user-friendly English text.
 */
export const showableOptions = new ArrayMap<
  string,
  { create(): Promise<Showable>; description: string }
>();
showableOptions.add([
  [
    "showcase",
    {
      async create() {
        return (await import("../src/showcase.ts")).showcase;
      },
      description: "Ideas to copy and paste.",
    },
  ],
  [
    "sierpiński",
    {
      async create() {
        return (await import("../src/sierpiński.ts")).sierpińskiTop;
      },
      description:
        "Beautiful math, as seen here:  https://youtu.be/rEP1VevV3WI",
    },
  ],
  [
    "peano-fourier",
    {
      async create() {
        return (await import("../src/peano-fourier/peano-fourier.ts"))
          .peanoFourier;
      },
      description:
        "Fun with math, the last scene of: https://www.youtube.com/watch?v=Imc1w0xNb4E",
    },
  ],
  [
    "peano-arithmetic",
    {
      async create() {
        return (await import("../src/peano-arithmetic.ts")).peanoArithmetic;
      },
      description:
        "Make take on Peano arithmetic, as seen here:  https://youtu.be/4_Wiwai-gO8",
    },
  ],
  [
    "morph-test",
    {
      async create() {
        return (await import("../src/morph-test.ts")).morphTest;
      },
      description:
        "Morphing the Peano Curve, the first part of https://www.youtube.com/watch?v=Imc1w0xNb4E",
    },
  ],
  [
    "stroke-colors-test",
    {
      async create() {
        return (await import("../src/stroke-colors-test.ts")).strokeColorsTest;
      },
      description:
        "Demonstrating and testing strokeColors(), as seen here:  https://youtu.be/MxpNJ2k86U0",
    },
  ],
  [
    "shadow-test",
    {
      async create() {
        return (await import("../src/shadow-test.ts")).shadowTest;
      },
      description: "Halftone drop-shadow effect demo.",
    },
  ],
  [
    "lissajous",
    {
      async create() {
        return (await import("../src/lissajous.ts")).lissajous;
      },
      description: "Lissajous curve on a black background.",
    },
  ],
  [
    "alpha-test",
    {
      async create() {
        return (await import("../src/alpha-test.ts")).alphaTest;
      },
      description:
        "VP9 alpha channel test — 4 circles on transparent background.",
    },
  ],
]);
