import "./style.css";

import { AnimationLoop, getById } from "phil-lib/client-misc";
import {
  assertFinite,
  assertNonNullable,
  LinearFunction,
  makeLinear,
} from "phil-lib/misc";
import {
  clickDragAndOnce,
  setupClickAndDrag,
  type ClickDragAndOnceListener,
} from "../src/click-and-drag";
import { myRainbow } from "../src/glib/my-rainbow";
import { interpolateColor } from "../src/interpolate";

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
    /**
     * Make colors similar to {@link myRainbow} but add some white.
     * Make it *much* easier to read black text on these colors.
     *
     * If you're not looking at them side by side, you might not notice the difference.
     */
    const lightColors: readonly string[] = myRainbow.map((base) =>
      interpolateColor(0.36, base, "white"),
    );
    lightColors.forEach((color, index) => {
      result.set(index, new Color(index, color, color));
    });
    lightColors.forEach((firstColor, firstColorIndex) => {
      for (
        let secondColorIndex = firstColorIndex + 1;
        secondColorIndex < lightColors.length;
        secondColorIndex++
      ) {
        const secondColor = lightColors[secondColorIndex];
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

const soundFileSuggestions = [
  "./Sierpinski part 1.m4a",
  "./Sierpinski part 2.m4a",
];

/**
 * Reads the `?src=` query param. If missing, replaces the page with a
 * combo-box selection form and throws to halt module execution.
 * Returns the URL string when present.
 */
function resolveSoundUrl(): string {
  const raw = new URLSearchParams(location.search).get("src");
  if (raw) {
    return raw;
  }

  const h1 = document.createElement("h1");
  h1.textContent = "Open a sound file";

  const datalist = document.createElement("datalist");
  datalist.id = "soundSuggestions";
  for (const suggestion of soundFileSuggestions) {
    const option = document.createElement("option");
    option.value = suggestion;
    datalist.append(option);
  }

  const input = document.createElement("input");
  input.setAttribute("list", "soundSuggestions");
  input.type = "text";
  input.size = 60;
  input.placeholder = "Enter URL or choose from list";
  input.autofocus = true;

  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Open";

  const form = document.createElement("form");
  form.append(input, " ", button, datalist);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (value) {
      const dest = new URL(location.href);
      dest.searchParams.set("src", value);
      location.href = dest.href;
    }
  });

  document.body.replaceChildren(h1, form);
  throw new Error("Showing sound file selection.");
}

const soundUrl = resolveSoundUrl();

/**
 * Load the audio into here, so the user has a standard UI for playing the track.
 */
const audioElement = getById("soundExplorer", HTMLAudioElement);
audioElement.src = soundUrl;

/**
 * This currently contains instructions.
 *
 * TODO make this live.
 * Show context sensitive help.
 */
const statusDiv = getById("soundStatus", HTMLDivElement);
const helpDefault =
  "Drag right → to create a new clip. Drag ← left to zoom. Click to sync the player.";
const helpExtend =
  "Click to set the new endpoint. Or drag to audition a range without adding a clip. Press Escape to cancel.";
const helpDragPlay = "Release to play what you've selected.";
statusDiv.textContent = helpDefault;

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
  if (!clipManager) return; // audio not ready yet
  // Dragging left to right creates a new row.
  const color = Color.takeNextAvailable();
  if (color === undefined) {
    return;
  }
  const startIndex = Math.floor(xToInputIndexContinuous(x0));
  const endIndex = Math.ceil(xToInputIndexContinuous(x1));
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
  onDrag(x0, _y0, x1, _y1) {
    if (x0 < x1) {
      // Dragging left to right creates a new clip.
      createNewClip(x0, x1);
    } else {
      // Dragging right to left zooms in.
      const startIndex = Math.floor(xToInputIndexContinuous(x1));
      const endIndex = Math.ceil(xToInputIndexContinuous(x0));
      setSourceRange(startIndex, endIndex);
    }
    canvas.style.cursor = "";
    dragRectangle = undefined;
  },
  cancel() {
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
      cancel() {},
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

async function loadAudio(): Promise<void> {
  if (reloadInProgress) {
    throw new Error("loadAudio() is not reentrant.");
  }
  reloadInProgress = true;
  try {
    let response: Response;
    try {
      response = await fetch(soundUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (soundUrl.startsWith("file://")) {
        throw new Error(
          "File URLs (file://) are blocked by the browser's security policy. " +
            "Use a local development server such as Vite instead.",
        );
      }
      if (/cors|cross.origin/i.test(msg)) {
        throw new Error(
          "Cross-origin request blocked — the server does not permit access " +
            "from this page (CORS policy).",
        );
      }
      throw new Error(
        "Network error — check your internet connection and try again.",
      );
    }
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("File not found (404) — check the URL for typos.");
      }
      throw new Error(
        `Server returned an error: ${response.status} ${response.statusText}`,
      );
    }
    const encodedSource = await response.arrayBuffer();
    let buffer: AudioBuffer;
    try {
      buffer = await audioContext.decodeAudioData(encodedSource);
    } catch (e) {
      throw new Error(
        "Failed to decode the audio — the file may be corrupted or in an unsupported format.",
      );
    }
    if (buffer.numberOfChannels != 1) {
      console.warn(
        `Multiple channels are not supported.  Found ${buffer.numberOfChannels} channels in ${soundUrl}.`,
      );
    }
    sourceBuffer = buffer;
    soundData = buffer.getChannelData(0);
    sourceRange = { startIndex: 0, endIndex: soundData.length };
  } finally {
    reloadInProgress = false;
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
      // Tracks whichever extend listener (⇤ or ⇥) is currently registered so
      // the recycle button can cancel it if the row is deleted mid-extend.
      let activeExtendListener: ClickDragAndOnceListener | undefined;
      const recycleButton = document.createElement("button");
      recycleButton.textContent = "🗑️"; //♻
      buttonsCell.appendChild(recycleButton);
      recycleButton.addEventListener("click", () => {
        if (activeExtendListener)
          clickAndDrag.cancelIfActive(activeExtendListener);
        this.remove();
      });
      const resizeLeftButton = document.createElement("button");
      resizeLeftButton.textContent = "⇤";
      buttonsCell.appendChild(resizeLeftButton);
      resizeLeftButton.addEventListener("click", () => {
        const thisClip: Clip = this;
        function addListener() {
          statusDiv.textContent = helpExtend;
          const listener: ClickDragAndOnceListener = {
            onClick: function (x: number, _y: number): void {
              const proposedStartIndex = xToInputIndexContinuous(x);
              if (thisClip.endIndex > proposedStartIndex) {
                thisClip.startIndex = proposedStartIndex;
              }
              dragRectangle = undefined;
              canvas.style.cursor = "";
              statusDiv.textContent = helpDefault;
            },
            onDrag: function (
              x0: number,
              _y0: number,
              x1: number,
              y1: number,
            ): void {
              canvas.style.cursor = "";
              playPixelRange(x0, x1);
              addListener();
              this.onFreeMove(x1, y1);
            },
            cancel: function (): void {
              canvas.style.cursor = "";
              dragRectangle = undefined;
              statusDiv.textContent = helpDefault;
            },
            onDragMove(x0, _y0, x1, _y1, status) {
              if (status == "click") {
                canvas.style.cursor = "";
                dragRectangle = undefined;
                statusDiv.textContent = helpExtend;
              } else {
                statusDiv.textContent = helpDragPlay;
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
              canvas.style.cursor = "";
              dragRectangle = undefined;
              statusDiv.textContent = helpDefault;
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
          };
          activeExtendListener = listener;
          clickAndDrag.listenOnce(listener);
        }
        addListener();
      });
      const resizeRightButton = document.createElement("button");
      resizeRightButton.textContent = "⇥";
      buttonsCell.appendChild(resizeRightButton);
      resizeRightButton.addEventListener("click", () => {
        const thisClip: Clip = this;
        function addListener() {
          statusDiv.textContent = helpExtend;
          const listener: ClickDragAndOnceListener = {
            onClick: function (x: number, _y: number): void {
              const proposedEndIndex = xToInputIndexContinuous(x);
              if (proposedEndIndex > thisClip.startIndex) {
                thisClip.endIndex = xToInputIndexContinuous(x);
              }
              dragRectangle = undefined;
              canvas.style.cursor = "";
              statusDiv.textContent = helpDefault;
            },
            onDrag: function (
              x0: number,
              _y0: number,
              x1: number,
              y1: number,
            ): void {
              canvas.style.cursor = "";
              playPixelRange(x0, x1);
              addListener();
              this.onFreeMove(x1, y1);
            },
            cancel: function (): void {
              canvas.style.cursor = "";
              dragRectangle = undefined;
              statusDiv.textContent = helpDefault;
            },
            onDragMove(x0, _y0, x1, _y1, status) {
              if (status == "click") {
                canvas.style.cursor = "";
                dragRectangle = undefined;
                statusDiv.textContent = helpExtend;
              } else {
                statusDiv.textContent = helpDragPlay;
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
              canvas.style.cursor = "";
              dragRectangle = undefined;
              statusDiv.textContent = helpDefault;
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
          };
          activeExtendListener = listener;
          clickAndDrag.listenOnce(listener);
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
   */
  readonly key = soundUrl;
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
let clipManager!: ClipManager;

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
    // Background color:
    // If there is a subrange selected, it will be drawn in green.
    // Parts of the subrange that come before the current play position
    // (i.e. already played) are a slightly darker shade of green and
    // parts of the subrange that come after the play position (i.e.
    // to be played soon) are a slightly lighter shade of green.
    // Outside of the subrange, anything before the play position is light
    // gray, anything after is white.
    //
    // The difference between the lighter part of the background and the darker part
    // indicate where the play head is.
    // The effect looks good and works well.
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
      if (currentAudioX > subrangeFirstX && playbackStatus.playing === "clip") {
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

/**
 * Replaces the page with a user-friendly error message and a link back to the
 * file-selection menu. Typed `never` because it always throws, which tells
 * TypeScript that code after a call here is unreachable (nothing is saved).
 */
function showErrorPage(message: string): never {
  const h1 = document.createElement("h1");
  h1.textContent = "Failed to load audio";

  const urlP = document.createElement("p");
  urlP.textContent = `URL: ${soundUrl}`;

  const errorP = document.createElement("p");
  errorP.style.color = "red";
  errorP.textContent = message;

  const menuDest = new URL(location.href);
  menuDest.searchParams.delete("src");
  const a = document.createElement("a");
  a.href = menuDest.href;
  a.textContent = "← Choose a different file";
  const backP = document.createElement("p");
  backP.append(a);

  document.body.replaceChildren(h1, urlP, errorP, backP);
  throw new Error("Showing audio load error page.");
}

(async () => {
  try {
    await loadAudio();
  } catch (e) {
    showErrorPage(e instanceof Error ? e.message : String(e));
  }
  clipManager = new ClipManager();
  new AnimationLoop(() => {
    redraw();
  });
  (window as any).PDS = { redraw, setSourceRange, clipManager, Color };
})();

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
    if (!soundData) {
      return;
    }
    const size = sourceRange.endIndex - sourceRange.startIndex;
    const center =
      RangePlaying.instance.status().secondsFromStart * audioContext.sampleRate;
    let newStart = Math.max(0, Math.round(center - size / 2));
    let newEnd = newStart + size;
    if (newEnd > soundData.length) {
      newEnd = soundData.length;
      newStart = newEnd - size;
    }
    setSourceRange(newStart, newEnd);
  });
}
