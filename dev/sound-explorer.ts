import "./style.css";

import { AnimationLoop, getById } from "phil-lib/client-misc";
import {
  assertFinite,
  assertNonNullable,
  LinearFunction,
  makeLinear,
} from "phil-lib/misc";
import { clickDragAndOnce, setupClickAndDrag } from "../src/click-and-drag";
import { myRainbow } from "../src/glib/my-rainbow";

// Bug / TODO:
// If you delete a row while you are trying to extend the corresponding clip,
// The chart GUI will still keep trying to extend the clip.
// Need to call the cleanup code on recycle.

// Bug / TODO:
// When I tried to select from the far left I managed to select a negative starting time.
// It appeared okay in the table, but when I tried to play it I got this:
//sound-explorer.ts:310 Uncaught RangeError: Failed to execute 'start' on 'AudioBufferSourceNode': The offset provided (-0.181363) is less than the minimum bound (0).
//    at RangePlaying.playTemporary (sound-explorer.ts:310:12)
//    at Clip.play (sound-explorer.ts:728:27)
//    at HTMLButtonElement.<anonymous> (sound-explorer.ts:694:14)
// Do a better job selecting!!!

// TODO:
// The esc key should get you out of extend mode.
// clickDragAndOnce should listen for esc, and that's another way to cancel.
// Maybe rename the out of bounds event to cancel,
// leave the cancel listeners in place,
// AND there's a TODO elsewhere to grab the mouse so the current out of bounds would not be needed any more.

// Bug / TODO:
// Play a selection from a play button in the table and the selection turns green.
// Click past the green part and that extends the green part.
// That is wrong!!
// Hitting the play in the <audio> seems to restore order.
// Hitting a play button in the table does NOT restore order.

// Bug / TODO:
// What happens if there is an error on load, so we never read the current state of the table?
// Do we ever save this busted state of the table?
// Certainly if I add something new while the table is empty, whatever should have been there will be gone forever.
// I've seen it just clear itself for no obvious reason.
// Mostly it works, but this has gotta get fixed.

// TODO:  Performance.
// At least 1/3 of our startup time comes from building the audio.
// Mostly from opening and decompressing the file over and over.
// Cache something!!!

// TODO:
// Add some sort of copy all to get everything from the table.
// Or maybe a div showing the same items as the table, always in sync, with the same backgrounds, but showing the copyable code.

type CanvasFillStyle = string | CanvasGradient | CanvasPattern;

function makeCandyStripe(
  firstColor: string,
  secondColor: string,
  widthInPixels: number,
): { canvas: CanvasFillStyle; css: string } {
  function makeCanvasPattern() {
    const tileSize = Math.ceil(widthInPixels * Math.sqrt(2) * devicePixelRatio);
    const tile = document.createElement("canvas");
    tile.width = tileSize;
    tile.height = tileSize;
    const tileContext = tile.getContext("2d")!;
    const quarter = tileSize / 4;
    tileContext.fillStyle = firstColor;
    tileContext.fillRect(
      -quarter,
      -quarter,
      tileSize + quarter,
      tileSize + quarter,
    );

    tileContext.fillStyle = secondColor;
    tileContext.beginPath();
    tileContext.moveTo(-quarter, 0);
    tileContext.lineTo(0, -quarter);
    tileContext.lineTo(quarter, 0);
    tileContext.lineTo(0, quarter);
    tileContext.closePath();
    tileContext.moveTo(tileSize - quarter, tileSize);
    tileContext.lineTo(tileSize, tileSize - quarter);
    tileContext.lineTo(tileSize + quarter, tileSize);
    tileContext.lineTo(tileSize, tileSize + quarter);
    tileContext.closePath();
    tileContext.moveTo(tileSize, -quarter);
    tileContext.lineTo(tileSize + quarter, 0);
    tileContext.lineTo(0, tileSize + quarter);
    tileContext.lineTo(-quarter, tileSize);
    tileContext.closePath();
    tileContext.fill();
    return assertNonNullable(tileContext.createPattern(tile, "repeat"));
  }

  const canvas = makeCanvasPattern();

  const css = `repeating-linear-gradient(135deg, ${firstColor} 0px, ${firstColor} ${widthInPixels}px, ${secondColor} ${widthInPixels}px, ${secondColor} ${widthInPixels * 2}px)`;

  return { canvas, css };
}

class Color {
  readonly #index: number;
  private constructor(
    index: number,
    readonly canvas: CanvasFillStyle,
    readonly css: string,
  ) {
    this.#index = index;
  }
  toJSON() {
    return this.#index;
  }
  static #available = (() => {
    const result = new Map<number, Color>();
    myRainbow.forEach((color, index) => {
      result.set(index, new Color(index, color, color));
    });
    myRainbow.forEach((firstColor, firstColorIndex) => {
      for (
        let secondColorIndex = firstColorIndex + 1;
        secondColorIndex < myRainbow.length;
        secondColorIndex++
      ) {
        const secondColor = myRainbow[secondColorIndex];
        const index = result.size;
        /**
         * About 1em
         */
        const stripeWidth = 16;
        const { canvas, css } = makeCandyStripe(
          firstColor,
          secondColor,
          stripeWidth,
        );
        result.set(index, new Color(index, canvas, css));
      }
    });
    return result;
  })();
  static peekNextAvailable(): Color | undefined {
    const nextAvailableValue = this.#available.values().next();
    if (nextAvailableValue.done) {
      return undefined;
    } else {
      return nextAvailableValue.value;
    }
  }
  static takeNextAvailable(): Color | undefined {
    const nextAvailableEntry = this.#available.entries().next();
    if (nextAvailableEntry.done) {
      return undefined;
    } else {
      const [key, value] = nextAvailableEntry.value;
      this.#available.delete(key);
      return value;
    }
  }
  static recycle(color: Color) {
    if (this.#available.has(color.#index)) {
      throw new Error("duplicate");
    }
    this.#available.set(color.#index, color);
  }
  static takeFromJSON(serializedKey: number) {
    const result = this.#available.get(serializedKey);
    this.#available.delete(serializedKey);
    return result;
  }
}

/**
 * Load the audio into here, so the user has a standard UI for playing the track.
 */
const audioElement = getById("soundExplorer", HTMLAudioElement);

/**
 * This currently contains instructions.
 *
 * TODO make this live.
 * Show context sensitive help.
 */
const statusDiv = getById("soundStatus", HTMLDivElement);

/**
 * This is my custom chart.
 * It shows the mix and max levels of the samples over time.
 * You can interact with it by clicking and dragging and/or by using the <table> in
 * {@link ClipManager.samplesTable}.
 */
const canvas = getById("audioViewer", HTMLCanvasElement);
const context = assertNonNullable(canvas.getContext("2d"));

const audioContext = new AudioContext();

/**
 * What to draw in the chart.
 * More specifically, how much to zoom in.
 *
 */
let sourceRange: {
  readonly startIndex: number;
  readonly endIndex: number;
} = {
  startIndex: 0,
  endIndex: 0,
};
/**
 * What to draw in the chart.
 * More specifically, how much to zoom in.
 * @param startIndex First thing to show.  Measured in number of samples.
 * @param endIndex Last thing to show.  Measured in number of samples.
 */
function setSourceRange(startIndex: number, endIndex: number) {
  assertFinite(startIndex, endIndex);
  if (endIndex < startIndex) {
    throw new Error("wtf");
  }
  sourceRange = { startIndex, endIndex };
}
/**
 * This can be requested by different bits of code,
 * depending what's going on at the moment.
 *
 * If present, this requests a rectangle be drawn in the given color
 * and the given left and right positions.
 * It is always drawn in the bottom third of the display.
 *
 * We explicitly work with sample indexes.
 * In some cases the user can resize the window without this rectangle changing.
 * The redraw routine will update the scaling as required.
 */
let dragRectangle:
  | {
      readonly color: CanvasFillStyle;
      readonly leftIndex: number;
      readonly rightIndex: number;
    }
  | undefined;
function createNewClip(x0: number, x1: number) {
  // Dragging left to right creates a new row.
  const color = Color.takeNextAvailable();
  if (color === undefined) {
    return;
  }
  const startIndex = xToInputIndexContinuous(x0);
  const endIndex = xToInputIndexContinuous(x1);
  const clip = clipManager.createClip({ color, startIndex, endIndex });
}
/**
 * This class ensures that no more than one sound is playing at a time.
 * This class can report status used to draw the chart, e.g. where is the play head.
 */
class RangePlaying {
  private constructor() {
    audioElement.addEventListener("play", () => {
      this.stopTemporaries();
    });
  }
  /**
   * This might stick around after the clip is done playing.
   *
   * For one thing, there's no event to say that the clip is done playing.
   * If this object exists, it could refer to a sound that is playing or the last one to finish.
   *
   * Sometimes we want to leave this in place, even after we are done playing it.
   * When you do a quick swipe to do a play, you might want this to remain on the screen.
   * If you like what you heard you might want to use that to guide your next clicks.
   * (This paragraph describes a GUI that's coming soon and I don't know the details.)
   */
  #rangePlaying:
    | {
        realtimeStartSeconds: number;
        rangeStartSeconds: number;
        rangeEndSeconds: number;
        source: AudioBufferSourceNode;
      }
    | undefined;
  status(): {
    playing: "main" | "clip" | "none";
    secondsFromStart: number;
    subrange?: {
      realtimeStartSeconds: number;
      rangeStartSeconds: number;
      rangeEndSeconds: number;
    };
  } {
    // First check the <audio> element, the "main" source.
    let playing: "main" | "clip" | "none" = audioElement.paused
      ? "none"
      : "main";
    let secondsFromStart: number = audioElement.currentTime;
    // But if a temporary clip is playing, that overrides the <audio>
    if (this.#rangePlaying) {
      /**
       * How long the clip has been playing.
       *
       * There is no property analogous to HtmlAudioElement.currentTime, so I compute it myself.
       */
      const timePassed =
        audioContext.currentTime - this.#rangePlaying.realtimeStartSeconds;
      /**
       * Time relative to the *entire* contents of the <audio>.
       */
      const proposedSecondsFromStart =
        this.#rangePlaying.rangeStartSeconds + timePassed;
      if (proposedSecondsFromStart < this.#rangePlaying.rangeEndSeconds) {
        // The clip is still running.
        // There is no more direct way to request this info.
        // (Although there is an "ended" event, that doesn't seem any easier.)
        playing = "clip";
        secondsFromStart = proposedSecondsFromStart;
      }
    }
    return {
      playing,
      secondsFromStart,
      subrange: this.#rangePlaying
        ? {
            rangeStartSeconds: this.#rangePlaying.rangeStartSeconds,
            rangeEndSeconds: this.#rangePlaying.rangeEndSeconds,
            realtimeStartSeconds: this.#rangePlaying.realtimeStartSeconds,
          }
        : undefined,
    };
  }
  stopTemporaries() {
    if (this.#rangePlaying) {
      this.#rangePlaying.source.stop();
      this.#rangePlaying = undefined;
    }
  }
  stopAll() {
    this.stopTemporaries();
    audioElement.pause();
  }
  playTemporary(rangeStartSeconds: number, rangeEndSeconds: number) {
    this.stopAll();
    const durationSeconds = rangeEndSeconds - rangeStartSeconds;
    const source = audioContext.createBufferSource();
    source.buffer = assertNonNullable(sourceBuffer);
    source.connect(audioContext.destination);
    const realtimeStartSeconds = audioContext.currentTime;
    source.start(realtimeStartSeconds, rangeStartSeconds, durationSeconds);
    this.#rangePlaying = {
      rangeStartSeconds,
      rangeEndSeconds,
      realtimeStartSeconds,
      source,
    };
  }
  static readonly instance = new this();
}
/**
 * Start a temporary playback without creating a clip.
 * @param x0 Start, in canvas coordinates.
 * @param x1 End, in canvas coordinates.
 */
function playPixelRange(x0: number, x1: number) {
  if (x0 > x1) {
    [x0, x1] = [x1, x0];
  }
  const rangeStartSeconds =
    xToInputIndexContinuous(x0) / audioContext.sampleRate;
  const RangeEndSeconds = xToInputIndexContinuous(x1) / audioContext.sampleRate;
  RangePlaying.instance.playTemporary(rangeStartSeconds, RangeEndSeconds);
}
const clickAndDrag = clickDragAndOnce(canvas, {
  onClick(x, _y) {
    audioElement.currentTime =
      xToInputIndexContinuous(x) / audioContext.sampleRate;
    //   statusDiv.textContent = `${x} pixels, ${(x / canvas.width) * 100}%, index of sample: ${Math.round(xToInputIndexContinuous(x))}, ${xToInputIndexContinuous(x) / audioContext.sampleRate} seconds`;
  },
  onDrag(x0, _y0, x1, _y1, status) {
    // Ending
    if (status == "mouseup") {
      if (x0 < x1) {
        // Dragging left to right creates a new clip.
        createNewClip(x0, x1);
      } else {
        // Dragging right to left zooms in.
        const startIndex = Math.floor(xToInputIndexContinuous(x1));
        const endIndex = Math.ceil(xToInputIndexContinuous(x0));
        setSourceRange(startIndex, endIndex);
      }
    }
    canvas.style.cursor = "";
    dragRectangle = undefined;
  },
  onDragMove(x0, _y0, x1, _y1, status) {
    if (status == "click") {
      canvas.style.cursor = "";
      dragRectangle = undefined;
    } else if (x0 < x1) {
      // Dragging left to right creates a new clip.
      canvas.style.cursor = "e-resize";
      dragRectangle = {
        color: Color.peekNextAvailable()?.canvas ?? "silver",
        leftIndex: xToInputIndexContinuous(x0),
        rightIndex: xToInputIndexContinuous(x1),
      };
    } else {
      // Dragging right to left zooms in.
      canvas.style.cursor = "zoom-in";
      dragRectangle = {
        color: "silver",
        leftIndex: xToInputIndexContinuous(x1),
        rightIndex: xToInputIndexContinuous(x0),
      };
    }
  },
  onFreeMove(_x, _y) {},
});
function secondsToString(seconds: number) {
  // sampleRate is almost certainly 48,000hz.
  // So one sample is 0.00002083 seconds.
  return seconds.toFixed(5);
}
{
  function xToSeconds(x: number) {
    return xToInputIndexContinuous(x) / audioContext.sampleRate;
  }
  const selectionInfoDiv = getById("selectionInfo", HTMLDivElement);
  let previousDrag: { startSeconds: number; endSeconds: number } | undefined;
  function showCurrentState(currentSeconds: number, dragStartSeconds?: number) {
    let text: string;
    if (dragStartSeconds === undefined) {
      // Drag is NOT in progress.
      text = `${secondsToString(currentSeconds)} seconds.`;
    } else {
      // Show start and end
      text = `${secondsToString(dragStartSeconds)} to ${secondsToString(currentSeconds)} seconds, duration = ${secondsToString(currentSeconds - dragStartSeconds)}.`;
    }
    if (previousDrag) {
      text += `, previous drag was ${secondsToString(previousDrag.startSeconds)} to ${secondsToString(previousDrag.endSeconds)}, duration = ${secondsToString(previousDrag.endSeconds - previousDrag.startSeconds)}.`;
    }
    selectionInfoDiv.textContent = text;
  }
  setupClickAndDrag(
    canvas,
    {
      onClick: function (x: number, _y: number): void {
        console.warn("not expected, requested 0 tolerance");
        const timeInSeconds = xToSeconds(x);
        previousDrag = {
          startSeconds: timeInSeconds,
          endSeconds: timeInSeconds,
        };
        showCurrentState(timeInSeconds);
      },
      onDrag: function (
        x0: number,
        _y0: number,
        x1: number,
        _y1: number,
        _status: "mouseup" | "mouseleave",
      ): void {
        const startSeconds = xToSeconds(x0);
        const endSeconds = xToSeconds(x1);
        previousDrag = { startSeconds, endSeconds };
        // Don't show the start position.
        // That is already available in the "previous drag".
        // And this is the beginning of the phase where we are just doing moves,
        // the drag has finished.
        showCurrentState(endSeconds);
      },
      onDragMove: function (
        x0: number,
        _y0: number,
        x1: number,
        _y1: number,
        _status: "drag" | "click",
      ): void {
        const startSeconds = xToSeconds(x0);
        const endSeconds = xToSeconds(x1);
        showCurrentState(endSeconds, startSeconds);
      },
      onFreeMove: function (x: number, _y: number): void {
        const timeInSeconds = xToSeconds(x);
        showCurrentState(timeInSeconds);
      },
    },
    0,
  );
}

let soundData: Float32Array<ArrayBuffer> | undefined;
let sourceBuffer: AudioBuffer | undefined;

/**
 * This can affect the display.
 * If we have data, continue to display that until we have something newer.
 * But if we don't have data, display "no data" or "Loading..." depending on this variable.
 *
 * reload() is an async function.
 * So it's possible that someone will call it while it is already running.
 * Is that a problem?
 */
let reloadInProgress = false;

async function reload() {
  if (reloadInProgress) {
    // This could and probably should be fixed.
    // Really, I don't even know if this is a problem.
    // This reminds me of a common pattern where the caller is a complicated piece of code that might make several requests within the same even handler.
    // So we cache redundant requests, and possibly throwing out requests that are obsolete before any work has started.
    throw new Error("reload() is not reentrant.");
  }
  reloadInProgress = true;
  let newSoundData: Float32Array<ArrayBuffer> | undefined;
  try {
    const url = assertNonNullable(audioElement.getAttribute("src")); //audioElement.src;
    const response = await fetch(url);
    const encodedSource = await response.arrayBuffer();
    sourceBuffer = await audioContext.decodeAudioData(encodedSource);
    if (sourceBuffer.numberOfChannels != 1) {
      console.warn(
        `Multiple channels are not supported.  Found ${sourceBuffer.numberOfChannels} channels in ${url}.`,
      );
    }
    newSoundData = sourceBuffer.getChannelData(0);
  } finally {
    reloadInProgress = false;
    soundData = newSoundData;
    sourceRange =
      soundData === undefined
        ? { startIndex: 0, endIndex: 0 }
        : {
            startIndex: 0,
            endIndex: soundData.length,
          };
  }
}

/**
 * Cache the size of the canvas.
 * The height and width are measured in "real" or "device" pixels.
 * The canvas's internal buffer should use the exact same size.
 *
 * Requesting the size of an element is surprisingly expensive, relative to the framerate.
 * This might be overkill outside of an animation loop.
 */
let canvasSize: { readonly width: number; readonly height: number } | undefined;

let inputIndexToX: LinearFunction = makeLinear(0, 0, 1, 1);
let xToInputIndexContinuous: LinearFunction = makeLinear(0, 0, 1, 1);

type FromClipManager = Parameters<typeof ClipManager.validate>[0];

class Clip {
  #displayIndex(clipCount: number): string {
    return secondsToString(clipCount / audioContext.sampleRate);
  }
  #notify() {
    this.owner.notify();
  }
  #color!: Color;
  get color() {
    return this.#color;
  }
  set color(newValue) {
    if (newValue !== this.#color) {
      this.#color = newValue;
      this.#row.style.background = newValue.css;
      this.#notify();
    }
    this.#color = newValue;
  }
  #startIndex = -Infinity;
  get startIndex() {
    return this.#startIndex;
  }
  #startTimeCell: HTMLTableCellElement;
  #durationCell: HTMLTableCellElement;
  set startIndex(newValue) {
    if (newValue !== this.#startIndex) {
      this.#startIndex = newValue;
      this.#notify();
      this.#startTimeCell.textContent = this.#displayIndex(this.#startIndex);
      this.#durationCell.textContent = this.#displayIndex(
        this.endIndex - this.startIndex,
      );
    }
  }
  #endIndex = -Infinity;
  get endIndex() {
    return this.#endIndex;
  }
  #endTimeCell: HTMLTableCellElement;
  set endIndex(newValue) {
    if (newValue !== this.#endIndex) {
      this.#endIndex = newValue;
      this.#notify();
      this.#endTimeCell.textContent = this.#displayIndex(this.#endIndex);
      this.#durationCell.textContent = this.#displayIndex(
        this.endIndex - this.startIndex,
      );
    }
  }
  #notesCell: HTMLTableCellElement;
  get notes() {
    return this.#notesCell.textContent ?? "";
  }
  set notes(newValue) {
    if (newValue !== this.notes) {
      this.#notesCell.textContent = newValue;
      this.#notify();
    }
  }
  readonly #row: HTMLTableRowElement;
  constructor(
    readonly owner: ClipManager,
    color: Color,
    onlyClipManagerIsAllowedToCallThisConstructor: FromClipManager,
  ) {
    ClipManager.validate(onlyClipManagerIsAllowedToCallThisConstructor);
    {
      const row = (this.#row = this.owner.samplesTable.insertRow(1));
      this.#startTimeCell = row.insertCell();
      this.#endTimeCell = row.insertCell();
      this.#durationCell = row.insertCell();
      this.#notesCell = row.insertCell();
      this.#notesCell.contentEditable = "plaintext-only";
      this.#notesCell.addEventListener("input", () => this.#notify());
      const buttonsCell = row.insertCell();
      // So you can copy and paste from the table.
      // You'll get the words and numbers, but not the buttons.
      // The buttons would never work but would still appear in the clipboard.
      buttonsCell.style.userSelect = "none";
      const recycleButton = document.createElement("button");
      recycleButton.textContent = "🗑️"; //♻
      buttonsCell.appendChild(recycleButton);
      recycleButton.addEventListener("click", () => {
        this.remove();
      });
      const resizeLeftButton = document.createElement("button");
      resizeLeftButton.textContent = "⇤";
      //canvas.style.cursor="TODO"
      // TODO update the help / instructions
      buttonsCell.appendChild(resizeLeftButton);
      resizeLeftButton.addEventListener("click", () => {
        //canvas.style.cursor="TODO"
        // TODO update the help / instructions
        const thisClip: Clip = this;
        function addListener() {
          clickAndDrag.listenOnce({
            onClick: function (x: number, _y: number): void {
              const proposedStartIndex = xToInputIndexContinuous(x);
              if (thisClip.endIndex > proposedStartIndex) {
                thisClip.startIndex = proposedStartIndex;
              }
              // Restore help TODO
              dragRectangle = undefined;
              canvas.style.cursor = "";
            },
            onDrag: function (
              x0: number,
              _y0: number,
              x1: number,
              y1: number,
              status: "mousemove" | "mouseup" | "mouseleave",
            ): void {
              // Restore help TODO
              canvas.style.cursor = "";
              if (status == "mouseup") {
                playPixelRange(x0, x1);
                addListener();
              }
              this.onFreeMove(x1, y1);
            },
            onDragMove(x0, _y0, x1, _y1, status) {
              // Dragging the cursor while trying to select an endpoint means to play the dragged selection.
              if (status == "click") {
                canvas.style.cursor = "";
                dragRectangle = undefined;
              } else {
                if (x0 < x1) {
                  canvas.style.cursor = "e-resize";
                } else {
                  canvas.style.cursor = "w-resize";
                  // Make x0 < x1
                  [x0, x1] = [x1, x0];
                }
                dragRectangle = {
                  color: "darkgreen",
                  leftIndex: xToInputIndexContinuous(x0),
                  rightIndex: xToInputIndexContinuous(x1),
                };
              }
            },
            onAbort: function (): void {
              // Restore help TODO
              canvas.style.cursor = "";
              dragRectangle = undefined;
            },
            onFreeMove(x, y) {
              const proposedStartIndex = xToInputIndexContinuous(x);
              const fixedEndIndex = thisClip.endIndex;
              if (fixedEndIndex > proposedStartIndex) {
                dragRectangle = {
                  color: thisClip.color.canvas,
                  leftIndex: proposedStartIndex,
                  rightIndex: fixedEndIndex,
                };
                canvas.style.cursor = "w-resize";
              } else {
                dragRectangle = undefined;
                canvas.style.cursor = "not-allowed";
              }
            },
          });
        }
        addListener();
      });
      const resizeRightButton = document.createElement("button");
      resizeRightButton.textContent = "⇥";
      buttonsCell.appendChild(resizeRightButton);
      resizeRightButton.addEventListener("click", () => {
        //canvas.style.cursor="TODO"
        // TODO update the help / instructions
        const thisClip: Clip = this;
        function addListener() {
          clickAndDrag.listenOnce({
            onClick: function (x: number, _y: number): void {
              const proposedEndIndex = xToInputIndexContinuous(x);
              if (proposedEndIndex > thisClip.startIndex) {
                thisClip.endIndex = xToInputIndexContinuous(x);
              }
              // Restore help TODO
              dragRectangle = undefined;
              canvas.style.cursor = "";
            },
            onDrag: function (
              x0: number,
              _y0: number,
              x1: number,
              y1: number,
              status: "mousemove" | "mouseup" | "mouseleave",
            ): void {
              // Restore help TODO
              canvas.style.cursor = "";
              if (status == "mouseup") {
                playPixelRange(x0, x1);
                addListener();
              }
              this.onFreeMove(x1, y1);
            },
            onDragMove(x0, _y0, x1, _y1, status) {
              // Dragging the cursor while trying to select an endpoint means to play the dragged selection.
              if (status == "click") {
                canvas.style.cursor = "";
                dragRectangle = undefined;
              } else {
                if (x0 < x1) {
                  canvas.style.cursor = "e-resize";
                } else {
                  canvas.style.cursor = "w-resize";
                  // Make x0 < x1
                  [x0, x1] = [x1, x0];
                }
                dragRectangle = {
                  color: "darkgreen",
                  leftIndex: xToInputIndexContinuous(x0),
                  rightIndex: xToInputIndexContinuous(x1),
                };
              }
            },
            onAbort: function (): void {
              // Restore help TODO
              canvas.style.cursor = "";
              dragRectangle = undefined;
            },
            onFreeMove(x, y) {
              const fixedStartIndex = thisClip.startIndex;
              const proposedEndIndex = xToInputIndexContinuous(x);
              if (proposedEndIndex > fixedStartIndex) {
                dragRectangle = {
                  color: thisClip.color.canvas,
                  leftIndex: fixedStartIndex,
                  rightIndex: proposedEndIndex,
                };
                canvas.style.cursor = "e-resize";
              } else {
                dragRectangle = undefined;
                canvas.style.cursor = "not-allowed";
              }
            },
          });
        }
        addListener();
      });

      const zoomButton = document.createElement("button");
      zoomButton.textContent = "🔎";
      buttonsCell.appendChild(zoomButton);
      zoomButton.addEventListener("click", () => {
        setSourceRange(this.startIndex, this.endIndex);
      });
      const playButton = document.createElement("button");
      playButton.textContent = "▶️";
      buttonsCell.appendChild(playButton);
      playButton.addEventListener("click", () => {
        this.play();
      });
      const copyButton = document.createElement("button");
      copyButton.textContent = "📋";
      buttonsCell.appendChild(copyButton);
      copyButton.addEventListener("click", () => {
        const code = `{
  // ${JSON.stringify(this.notes)}
  source: ${JSON.stringify(clipManager.key)},
  startMsIntoScene: 0,
  startMsIntoClip: ${((this.startIndex / audioContext.sampleRate) * 1000).toFixed(2)},
  lengthMs: ${(((this.endIndex - this.startIndex) / audioContext.sampleRate) * 1000).toFixed(2)},
},
`;
        navigator.clipboard.writeText(code);
      });

      row.style.color = "black";
      row.classList.add("white-glow");
      // Now that we've created the GUI,
      // set the default properties here.
      // This will populate the GUI.
      this.color = color;
      this.notes = "Type here.";
      this.startIndex = 0;
      this.endIndex = 0;
    }
  }
  /**
   * If anyone but the {@link ClipManager} calls this, pass the request on to the clip manager.
   */
  remove(): void;
  /**
   * Remove the entry in the GUI.
   * @param fromClipManager Set this if called from the clip manager.
   */
  remove(fromClipManager: FromClipManager): void;
  remove(fromClipManager?: FromClipManager) {
    if (fromClipManager === undefined) {
      this.owner.remove(this);
    } else {
      ClipManager.validate(fromClipManager);
      this.#row.remove();
    }
  }
  play() {
    const startSeconds = this.startIndex / audioContext.sampleRate;
    const endSeconds = this.endIndex / audioContext.sampleRate;
    RangePlaying.instance.playTemporary(startSeconds, endSeconds);
  }
}

/**
 * A list of all of the clips.
 * This is the official source.
 *
 * This appears on the screen in a table.
 *
 * This will be synchronized with persistent storage.
 */
class ClipManager {
  private static readonly symbol: unique symbol = Symbol(
    "Valid Clip Constructor Request",
  );
  static validate(symbol: typeof this.symbol) {
    if (symbol !== this.symbol) {
      throw new Error("wtf");
    }
  }
  /**
   * Each audio file will be associated with its own set of clips.
   *
   * This is the exact name that appears in the html file, e.g. "./Sierpinski part 1.m4a"
   * `audioElement.src` gave me something ugly:  "http://localhost:5173/Sierpin%CC%81ski%20part%201.m4a".
   *
   * TODO should I also replace audioElement.src elsewhere in this file?
   * Should they both use the same constant?
   * This eventually needs to be configurable and will change in both places.
   */
  readonly key = assertNonNullable(audioElement.getAttribute("src"));
  /**
   *
   * @param samplesTable Where to interact with the user.
   * One row per clip.
   */
  constructor(readonly samplesTable = getById("soundClips", HTMLTableElement)) {
    this.#loadFromStorage();
    window.addEventListener("storage", (storageEvent) => {
      if (storageEvent.key == this.key) {
        this.#loadFromStorage();
        console.log("update from another window", new Date().toLocaleString());
      } else if (storageEvent.key === null) {
        // This seems like the safest option.
        console.log("Ignoring delete-all request.");
      } else {
        console.log(`Ignoring update for “${storageEvent.key}”`);
      }
    });
  }
  #clips = new Array<Clip>();
  get clips(): ReadonlyArray<Clip> {
    return this.#clips;
  }
  createClip(initialValues: {
    color: Color;
    startIndex?: number;
    endIndex?: number;
    notes?: string;
  }) {
    const result = new Clip(this, initialValues.color, ClipManager.symbol);
    result.startIndex = initialValues.startIndex ?? result.startIndex;
    result.endIndex = initialValues.endIndex ?? result.endIndex;
    result.notes = initialValues.notes ?? result.notes;
    this.#clips.push(result);
    this.notify();
    return result;
  }
  notify() {
    if (!this.#pushPending) {
      this.#pushPending = true;
      setTimeout(() => {
        this.#pushPending = false;
        this.#pushNow();
      }, 1);
    }
  }
  #pushPending = false;
  #pushNow() {
    // Push to persistent storage.
    localStorage.setItem(this.key, this.dumpToJSON());
  }
  #loadFromStorage() {
    const saved = localStorage.getItem(this.key);
    if (saved !== null) {
      this.reloadFromJSON(saved);
    }
  }
  remove(clip: Clip) {
    const index = this.#clips.findIndex((atThisIndex) => atThisIndex == clip);
    if (index < 0) {
      throw new Error("not found");
    }
    this.notify();
    clip.remove(ClipManager.symbol);
    this.#clips.splice(index, 1);
    Color.recycle(clip.color);
  }
  dumpToJSON(space?: string | number): string {
    return JSON.stringify(
      this.clips,
      ["color", "startIndex", "endIndex", "notes"],
      space,
    );
  }
  reloadFromJSON(json: string) {
    const fromJSON = JSON.parse(json);
    if (!(fromJSON instanceof Array)) {
      throw new Error("wtf");
    }
    fromJSON.forEach((value) => {
      if (typeof value.color !== "number") {
        throw new Error("wtf");
      }
      if (typeof value.startIndex !== "number") {
        throw new Error("wtf");
      }
      if (typeof value.endIndex !== "number") {
        throw new Error("wtf");
      }
      assertFinite(value.color, value.startIndex, value.endIndex);
      if (typeof value.notes !== "string") {
        throw new Error("wtf");
      }
    });
    [...this.clips].forEach((clip) => clip.remove());
    fromJSON.forEach((value) => {
      const color = Color.takeFromJSON(value.color);
      if (!color) {
        console.error("Can't find color", value);
      } else {
        this.createClip({
          color,
          startIndex: value.startIndex,
          endIndex: value.endIndex,
          notes: value.notes,
        });
      }
    });
  }
}
const clipManager = new ClipManager();

/**
 * Update the display to match {@link soundData}.
 *
 * The might be called because of a resize,
 * because the data changed,
 * because the user selected a different range, etc.
 */
function redraw() {
  if (!canvasSize) {
    // getClientRects forces a layout step.
    // The cost was about 0.2ms / frame
    // At 60 fps that's about 1.2% of our entire time.
    const clientRect = canvas.getClientRects()[0];
    const width = Math.round(clientRect.width * devicePixelRatio);
    const height = Math.round(clientRect.height * devicePixelRatio);
    canvasSize = { height, width };
    canvas.width = width;
    canvas.height = height;
  }
  const playbackStatus = RangePlaying.instance.status();
  const currentAudioTime = playbackStatus.secondsFromStart;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!soundData) {
    // em's don't work well here.
    context.font = `${canvasSize.height}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    // TODO, please:  A mode where it says "Loading."
    // That could go with a wrapper around reloadAndRedraw() to deal with reentrant calls.
    // I.e. we need to keep track of if a call is in progress in both cases.
    // The latter seems like a nicety, but the former is really annoying me.
    context.fillText(
      reloadInProgress ? "Loading..." : "No Data.",
      canvas.width / 2,
      canvas.height / 2,
    );
  } else if (soundData.length == 0 || audioElement.duration == 0) {
    context.font = `${canvasSize.height}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("Empty file.", canvas.width / 2, canvas.height / 2);
  } else {
    const chartHeight = canvasSize.height;
    const startingInputIndex = sourceRange.startIndex;
    const endInputIndex = sourceRange.endIndex;
    const startingX = 0;
    const endX = canvasSize.width;
    xToInputIndexContinuous = makeLinear(
      startingX,
      startingInputIndex,
      endX,
      endInputIndex,
    );
    function xToInputIndex(x: number) {
      return xToInputIndexContinuous(x) | 0;
    }
    inputIndexToX = makeLinear(
      startingInputIndex,
      startingX,
      endInputIndex,
      endX,
    );
    const sampleValueToY = makeLinear(1, 0, -1, chartHeight);
    const indexFromAudio = currentAudioTime * audioContext.sampleRate;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#eee";
    const currentAudioX = inputIndexToX(indexFromAudio);
    context.fillRect(0, 0, currentAudioX, canvasSize.height);
    if (playbackStatus.subrange) {
      const subrangeFirstX = inputIndexToX(
        playbackStatus.subrange.rangeStartSeconds * audioContext.sampleRate,
      );
      const subrangeLastX = inputIndexToX(
        playbackStatus.subrange.rangeEndSeconds * audioContext.sampleRate,
      );
      context.fillStyle = "#dfd";
      context.fillRect(
        subrangeFirstX,
        0,
        subrangeLastX - subrangeFirstX,
        canvasSize.height,
      );
      if (currentAudioX > subrangeFirstX) {
        context.fillStyle = "#cec";
        context.fillRect(
          subrangeFirstX,
          0,
          currentAudioX - subrangeFirstX,
          canvasSize.height,
        );
      }
    }
    clipManager.clips.forEach((clip) => {
      context.fillStyle = clip.color.canvas;
      const left = inputIndexToX(clip.startIndex);
      const right = inputIndexToX(clip.endIndex);
      const width = right - left;
      context.fillRect(left, 0, width, canvasSize!.height / 3);
    });
    if (dragRectangle) {
      context.fillStyle = dragRectangle.color;
      const left = inputIndexToX(dragRectangle.leftIndex);
      const right = inputIndexToX(dragRectangle.rightIndex);
      const width = right - left;
      context.fillRect(
        left,
        (canvasSize.height * 2) / 3,
        width,
        canvasSize.height,
      );
    }
    for (let x = 0; x < canvasSize.width; x++) {
      const start = xToInputIndex(x);
      const end = xToInputIndex(x + 1);
      if (end > start) {
        let maxValue = -Infinity;
        let minValue = Infinity;
        for (let index = start; index < end; index++) {
          const sample = soundData[index];
          maxValue = Math.max(maxValue, sample);
          minValue = Math.min(minValue, sample);
        }
        /**
         * Range should be 0 to 1.
         */
        context.fillStyle = "black";
        /**
         * The largest sample value corresponds to the smallest y value,
         * i.e. the top of the rectangle.
         */
        const top = sampleValueToY(maxValue);
        /**
         * The smallest sample value corresponds to the largest y value,
         * i.e. the bottom of the rectangle.
         */
        const bottom = sampleValueToY(minValue);
        /**
         * A *positive* number,
         * meaning that we go *down* from the starting point.
         */
        const height = bottom - top;
        context.fillRect(x, top, 1, height);
      }
    }
  }
}

const resizeObserver = new ResizeObserver((_entries) => {
  console.log("resize", new Date().toLocaleTimeString());
  canvasSize = undefined;
});
resizeObserver.observe(canvas, { box: "device-pixel-content-box" });
reload();

new AnimationLoop(() => {
  redraw();
});

{
  getById("zoomOut", HTMLButtonElement).addEventListener("click", () => {
    if (!soundData) {
      return;
    }
    const center = (sourceRange.endIndex + sourceRange.startIndex) / 2;
    const originalSize = sourceRange.endIndex - sourceRange.startIndex;
    const newSize = Math.min(originalSize * 2, soundData.length);
    let newStart = Math.max(0, Math.floor(center - newSize / 2));
    let newEnd = newStart + newSize;
    if (newEnd > soundData.length) {
      newStart -= newEnd - soundData.length;
      newEnd = soundData.length;
    }
    setSourceRange(newStart, newEnd);
  });
  getById("panLeft", HTMLButtonElement).addEventListener("click", () => {
    if (!soundData) {
      return;
    }
    const size = sourceRange.endIndex - sourceRange.startIndex;
    const move = size * -0.9;
    const newStart = Math.max(0, sourceRange.startIndex + move);
    const newEnd = newStart + size;
    setSourceRange(newStart, newEnd);
  });
  getById("panRight", HTMLButtonElement).addEventListener("click", () => {
    if (!soundData) {
      return;
    }
    const size = sourceRange.endIndex - sourceRange.startIndex;
    const move = size * +0.9;
    const newEnd = Math.min(soundData.length, sourceRange.endIndex + move);
    const newStart = newEnd - size;
    setSourceRange(newStart, newEnd);
  });
  getById("recenter", HTMLButtonElement).addEventListener("click", () => {
    alert("TODO");
  });
}

// For interactive debugging.
(window as any).PDS = { redraw, setSourceRange, clipManager, Color };
