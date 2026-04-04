import { AnimationLoop, getById } from "phil-lib/client-misc";
import {
  assertFinite,
  assertNonNullable,
  LinearFunction,
  makeLinear,
} from "phil-lib/misc";
import { clickDragAndOnce } from "../src/click-and-drag";
import { myRainbow } from "../src/glib/my-rainbow";

const audioElement = getById("soundExplorer", HTMLAudioElement);
const statusDiv = getById("soundStatus", HTMLDivElement);
const canvas = getById("audioViewer", HTMLCanvasElement);
const context = assertNonNullable(canvas.getContext("2d"));

const audioContext = new AudioContext();

let sourceRange: { readonly startIndex: number; readonly endIndex: number } = {
  startIndex: 0,
  endIndex: 0,
};
function setSourceRange(startIndex: number, endIndex: number) {
  needRedraw = true;
  assertFinite(startIndex, endIndex);
  sourceRange = { startIndex, endIndex };
}
(window as any).setSourceRange = setSourceRange;

const colorsAvailable = [...myRainbow];
function createNewClip(x0: number, x1: number) {
  // Dragging left to right creates a new row.
  const color = colorsAvailable.shift();
  if (color === undefined) {
    return;
  }
  const startIndex = xToInputIndexContinuous(x0);
  const endIndex = xToInputIndexContinuous(x1);
  const clip = clipManager.createClip({ color, startIndex, endIndex });
}
function playPixelRange(x0: number, x1: number) {
  if (x0 > x1) {
    [x0, x1] = [x1, x0];
  }
  const startSeconds = xToInputIndexContinuous(x0) / audioContext.sampleRate;
  const endSeconds = xToInputIndexContinuous(x1) / audioContext.sampleRate;
  const durationSeconds = endSeconds - startSeconds;
  const source = audioContext.createBufferSource();
  source.buffer = assertNonNullable(sourceBuffer);
  source.connect(audioContext.destination);
  source.start(audioContext.currentTime, startSeconds, durationSeconds);
  // TODO save `source` in case you want to abort the playback.
  console.log(source);
}
const clickAndDrag = clickDragAndOnce(canvas, {
  onClick(x, _y) {
    audioElement.currentTime =
      xToInputIndexContinuous(x) / audioContext.sampleRate;
    //   statusDiv.textContent = `${x} pixels, ${(x / canvas.width) * 100}%, index of sample: ${Math.round(xToInputIndexContinuous(x))}, ${xToInputIndexContinuous(x) / audioContext.sampleRate} seconds`;
  },
  onDrag(x0, _y0, x1, _y1, status) {
    if (status != "mouseup") {
      return;
    }
    if (x0 < x1) {
      // playClip(x0,x1);
      // Dragging left to right creates a new clip.
      createNewClip(x0, x1);
    } else {
      // Dragging right to left zooms in.
      const startIndex = Math.floor(xToInputIndexContinuous(x1));
      const endIndex = Math.ceil(xToInputIndexContinuous(x0));
      setSourceRange(startIndex, endIndex);
    }
    //statusDiv.textContent = `${x0} pixels, ${(x0 / canvas.width) * 100}%, index of sample: ${Math.round(xToInputIndexContinuous(x0))}, ${xToInputIndexContinuous(x0) / audioContext.sampleRate} seconds → ${x1} pixels, ${(x1 / canvas.width) * 100}% ${status}, index of sample: ${Math.round(xToInputIndexContinuous(x1))}, ${xToInputIndexContinuous(x1) / audioContext.sampleRate} seconds`;
  },
});

/**
 * We have to check some things directly in the animation frame,
 * like the position in sound file.
 *
 * Given a choice, though, the preferred thing is to set this variable to true.
 */
let needRedraw = true;

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
    const url = audioElement.src;
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
    needRedraw = true;
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

let audioTimeAtLastRedraw = audioElement.currentTime;

let inputIndexToX: LinearFunction = makeLinear(0, 0, 1, 1);
let xToInputIndexContinuous: LinearFunction = makeLinear(0, 0, 1, 1);

type FromClipManager = Parameters<typeof ClipManager.validate>[0];

class Clip {
  #displayIndex(clipCount: number): string {
    return (clipCount / audioContext.sampleRate).toFixed(3);
  }
  #notify() {
    this.owner.notify();
  }
  #color = "";
  get color() {
    return this.#color;
  }
  set color(newValue) {
    if (newValue !== this.#color) {
      this.#row.style.backgroundColor = newValue;
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
  #notes = "";
  get notes() {
    return this.#notes;
  }
  #notesCell: HTMLTableCellElement;
  set notes(newValue) {
    if (newValue !== this.#notes) {
      this.#notesCell.textContent = this.#notes = newValue;
      this.#notify();
    }
  }
  readonly #row: HTMLTableRowElement;
  constructor(
    readonly owner: ClipManager,
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
      // TODO When the user updates that, call this.#notify()
      const buttonsCell = row.insertCell();
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
              thisClip.startIndex = xToInputIndexContinuous(x);
              // What if startIndex > endIndex?
              // That can cause trouble when you hit the play button.
              // Maybe update the instructions and stay in this mode?
              // TODO
            },
            onDrag: function (
              x0: number,
              _y0: number,
              x1: number,
              _y1: number,
              status: "mousemove" | "mouseup" | "mouseleave",
            ): void {
              // Restore help and mouse cursor
              if (status == "mouseup") {
                playPixelRange(x0, x1);
                addListener();
              }
            },
            onAbort: function (): void {
              // TODO cleanup
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
              thisClip.endIndex = xToInputIndexContinuous(x);
              // What if startIndex > endIndex?
              // That can cause trouble when you hit the play button.
              // Maybe update the instructions and stay in this mode?
              // TODO
            },
            onDrag: function (
              x0: number,
              _y0: number,
              x1: number,
              _y1: number,
              status: "mousemove" | "mouseup" | "mouseleave",
            ): void {
              // Restore help and mouse cursor
              if (status == "mouseup") {
                playPixelRange(x0, x1);
                addListener();
              }
            },
            onAbort: function (): void {
              // TODO clean up
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

      row.style.color = "black";
      // Now that we've created the GUI,
      // set the default properties here.
      // This will populate the GUI.
      this.color = "rgb(1, 141, 115)";
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
  readonly guid = crypto.randomUUID();
  play() {
    const startSeconds = this.startIndex / audioContext.sampleRate;
    const endSeconds = this.endIndex / audioContext.sampleRate;
    const durationSeconds = endSeconds - startSeconds;
    const source = audioContext.createBufferSource();
    source.buffer = assertNonNullable(sourceBuffer);
    source.connect(audioContext.destination);
    source.start(audioContext.currentTime, startSeconds, durationSeconds);
    // TODO save `source` in case you want to abort the playback.
    console.log(source);
  }
}

class ClipManager {
  private static readonly symbol: unique symbol = Symbol(
    "Valid Clip Constructor Request",
  );
  static validate(symbol: typeof this.symbol) {
    if (symbol !== this.symbol) {
      throw new Error("wtf");
    }
  }
  constructor(
    readonly samplesTable = getById("soundClips", HTMLTableElement),
  ) {}
  #clips = new Array<Clip>();
  get clips(): ReadonlyArray<Clip> {
    return this.#clips;
  }
  createClip(
    initialValues: {
      color?: string;
      startIndex?: number;
      endIndex?: number;
      notes?: string;
    } = {},
  ) {
    const result = new Clip(this, ClipManager.symbol);
    result.color = initialValues.color ?? result.color;
    result.startIndex = initialValues.startIndex ?? result.startIndex;
    result.endIndex = initialValues.endIndex ?? result.endIndex;
    result.notes = initialValues.notes ?? result.notes;
    this.#clips.push(result);
    this.notify();
    return result;
  }
  notify() {
    needRedraw = true;
    if (!this.#pushPending) {
      this.#pushPending = true;
      setTimeout(() => {
        this.#pushPending = false;
        this.#pushNow();
      }, 1);
    }
  }
  #pushPending = false;
  #pushNow() {}
  remove(clip: Clip) {
    const index = this.#clips.findIndex((atThisIndex) => atThisIndex == clip);
    if (index < 0) {
      throw new Error("not found");
    }
    this.notify();
    clip.remove(ClipManager.symbol);
    this.#clips.splice(index, 1);
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
    needRedraw = true;
  }
  //audioTimeAtLastRedraw = audioElement.currentTime
  const currentAudioTime = audioElement.currentTime;
  if (audioTimeAtLastRedraw == currentAudioTime && !needRedraw) {
    // No recent changes.  No need to redraw.
    return;
  }
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
    const indexFromAudio = audioElement.currentTime * audioContext.sampleRate;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ddd";
    context.fillRect(0, 0, inputIndexToX(indexFromAudio), canvasSize.height);
    clipManager.clips.forEach((clip) => {
      context.fillStyle = clip.color;
      const left = inputIndexToX(clip.startIndex);
      const right = inputIndexToX(clip.endIndex);
      const width = right - left;
      context.fillRect(left, 0, width, canvasSize!.height / 3);
    });
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
  // Cache this state.  Don't redraw again until one of these changes.
  needRedraw = false;
  audioTimeAtLastRedraw = currentAudioTime;
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

(window as any).PDS = { redraw };
