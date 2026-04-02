import { AnimationLoop, getById } from "phil-lib/client-misc";
import {
  assertFinite,
  assertNonNullable,
  LinearFunction,
  makeLinear,
} from "phil-lib/misc";
import { clickDragAndOnce } from "../src/click-and-drag";
import { myRainbow } from "../src/glib/my-rainbow";

export {};

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

const clips: {
  color: string;
  startIndex: number;
  endIndex: number;
  notes: string;
  row: HTMLTableRowElement;
}[] = [];

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
    clips.forEach((clip) => {
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

const sssss = (() => {
  const samplesTable = getById("soundClips", HTMLTableElement);
  const colorsAvailable = [...myRainbow];
  function playClip(x0: number, x1: number) {
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
  function createNewClip(x0: number, x1: number) {
    // Dragging left to right creates a new row.
    const color = colorsAvailable.shift();
    if (color === undefined) {
      return;
    }
    const row = samplesTable.insertRow(1);
    const startTimeCell = row.insertCell();
    const endTimeCell = row.insertCell();
    const durationCell = row.insertCell();
    const notesCell = row.insertCell();
    const buttonsCell = row.insertCell();
    row.style.backgroundColor = color;
    row.style.color = "black";
    const startIndex = xToInputIndexContinuous(x0);
    const startSeconds = startIndex / audioContext.sampleRate;
    const endIndex = xToInputIndexContinuous(x1);
    const endSeconds = endIndex / audioContext.sampleRate;
    startTimeCell.textContent = startSeconds.toFixed(3);
    endTimeCell.textContent = endSeconds.toFixed(3);
    durationCell.textContent = (endSeconds - startSeconds).toFixed(3);
    notesCell.textContent = "Type here.";
    notesCell.contentEditable = "plaintext-only";
    const recycleButton = document.createElement("button");
    recycleButton.textContent = "🗑️"; //♻
    buttonsCell.appendChild(recycleButton);
    const resizeLeftButton = document.createElement("button");
    resizeLeftButton.textContent = "⇤";
    buttonsCell.appendChild(resizeLeftButton);
    const resizeRightButton = document.createElement("button");
    resizeRightButton.textContent = "⇥";
    buttonsCell.appendChild(resizeRightButton);
    const zoomButton = document.createElement("button");
    zoomButton.textContent = "🔎";
    buttonsCell.appendChild(zoomButton);
    const playButton = document.createElement("button");
    playButton.textContent = "▶️";
    buttonsCell.appendChild(playButton);
    const clipInfo: (typeof clips)[number] = {
      color,
      startIndex,
      endIndex,
      row,
      notes: "TODO",
    };
    clips.push(clipInfo);
    needRedraw = true;
    recycleButton.addEventListener("click", (event) => {
      row.remove();
      const index = clips.findIndex((clip) => clip == clipInfo);
      if (index < 0) {
        throw new Error("wtf");
      }
      clips.splice(index, 1);
      colorsAvailable.push(color);
    });
    playButton.addEventListener("click", (event) => {
      playClip(x0, x1);
    });
    zoomButton.addEventListener("click", () => {
      setSourceRange(startIndex, endIndex);
      //         const startIndex = Math.floor(xToInputIndexContinuous(x1));
      //  const endIndex = Math.ceil(xToInputIndexContinuous(x0));
    });
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
    alert("TODO");
  });
}

(window as any).PDS = { redraw };
