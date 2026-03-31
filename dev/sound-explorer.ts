import { AnimationLoop, getById } from "phil-lib/client-misc";
import { assertFinite, assertNonNullable, makeLinear } from "phil-lib/misc";

export {};

const audioElement = getById("soundExplorer", HTMLAudioElement);
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
    const sourceBuffer = await audioContext.decodeAudioData(encodedSource);
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
      reloadInProgress ? "Loading" : "No Data.",
      canvas.width / 2,
      canvas.height / 2,
    );
  } else if (soundData.length == 0 || audioElement.duration == 0) {
    context.font = `${canvasSize.height}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("Empty file.", canvas.width / 2, canvas.height / 2);
  } else {
    const triangleHeight = canvasSize.height / 20;
    const triangleBase = (triangleHeight * 2) / Math.sqrt(3);
    const clientHeight = canvasSize.height - triangleHeight;
    const zoom = 10;
    context.beginPath();
    context.moveTo(canvasSize.width / 2, clientHeight);
    context.lineTo((canvasSize.width - triangleBase) / 2, canvasSize.height);
    context.lineTo((canvasSize.width + triangleBase) / 2, canvasSize.height);
    context.closePath();
    context.fillStyle = "lime";
    context.fill();
    const startingInputIndex = sourceRange.startIndex;
    const endInputIndex = sourceRange.endIndex;
    const startingX = 0;
    const endX = canvasSize.width;
    const xToInputIndexHelper = makeLinear(
      startingX,
      startingInputIndex,
      endX,
      endInputIndex,
    );
    function xToInputIndex(x: number) {
      return xToInputIndexHelper(x) | 0;
    }
    const inputIndexToX = makeLinear(
      startingInputIndex,
      startingX,
      endInputIndex,
      endX,
    );
    const indexFromAudio = audioElement.currentTime * audioContext.sampleRate;
    context.fillStyle = "white";
    context.fillRect(0, 0, inputIndexToX(indexFromAudio), canvasSize.height);
    for (let x = 0; x < canvasSize.width; x++) {
      const start = xToInputIndex(x);
      const end = xToInputIndex(x + 1);
      if (end > start) {
        let sumOfSquares = 0;
        let maxValue = 0;
        for (let index = start; index < end; index++) {
          const sample = soundData[index];
          sumOfSquares += sample * sample;
          maxValue = Math.max(maxValue, Math.abs(sample));
        }
        /**
         * Range should be 0 to 1.
         */
        context.fillStyle = "magenta";
        context.fillRect(x, clientHeight, 1, maxValue * -clientHeight);
        context.fillStyle = "black";
        const value = Math.sqrt(sumOfSquares / (end - start));
        context.fillRect(x, clientHeight, 1, value * -clientHeight);
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
  redraw();
});
resizeObserver.observe(canvas, { box: "device-pixel-content-box" });
redraw();
reload();

new AnimationLoop(() => {
  redraw();
});

(window as any).PDS = { redraw };
