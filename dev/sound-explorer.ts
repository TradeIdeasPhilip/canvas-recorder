import { AnimationLoop, getById } from "phil-lib/client-misc";
import { assertNonNullable, makeLinear } from "phil-lib/misc";

export {};

const audioElement = getById("soundExplorer", HTMLAudioElement);
const canvas = getById("audioViewer", HTMLCanvasElement);
const context = assertNonNullable(canvas.getContext("2d"));

const audioContext = new AudioContext();

let soundData: Float32Array<ArrayBuffer> | undefined;

async function reloadAndRedraw() {
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
    soundData = newSoundData;
    redraw();
  }
}

/**
 * Cache the size of the canvas.
 * The height and width are measured in "real" or "device" pixels.
 * The canvas's internal buffer should use the exact same size.
 *
 * This might be overkill here.
 * I copied this from something that runs once per animation frame.
 * Requesting the size of an element is surprisingly expensive, relative to the framerate.
 */
let canvasSize: { readonly width: number; readonly height: number } | undefined;

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
    context.fillText("No Data.", canvas.width / 2, canvas.height / 2);
  } else if (soundData.length == 0||audioElement.duration==0){
    context.font = `${canvasSize.height}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("Empty file.", canvas.width / 2, canvas.height / 2);
  } else {
    const zoom=10;
   const progress= audioElement.currentTime / audioElement.duration;
    context.fillStyle="white"
    context.fillRect(0,0, progress*canvasSize.width*zoom, canvasSize.height)
    const startingInputIndex = 0;
    const endInputIndex = soundData.length/zoom;
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
    for (let x = 0; x < canvasSize.width; x++) {
      const start = xToInputIndex(x);
      const end = xToInputIndex(x + 1);
      if (end > start) {
        let sumOfSquares = 0;
        let maxValue = 0;
        for (let index = start; index < end; index++) {
          const sample = soundData[index];
          sumOfSquares += sample * sample;
          maxValue = Math.max(maxValue,Math.abs( sample))
        }
        /**
         * Range should be 0 to 1.
         */
        context.fillStyle="magenta";
        context.fillRect(x, canvasSize.height, 1, maxValue * -canvasSize.height);
        context.fillStyle="black";
        const value = Math.sqrt(sumOfSquares / (end - start));
        context.fillRect(x, canvasSize.height, 1, value * -canvasSize.height);
      }
    }
  }
}

const resizeObserver = new ResizeObserver((_entries) => {
  console.log("resize", new Date().toLocaleTimeString());
  canvasSize = undefined;
  redraw();
});
resizeObserver.observe(canvas, { box: "device-pixel-content-box" });
redraw();
reloadAndRedraw();

new AnimationLoop(() => {redraw()});

(window as any).PDS = { redraw };
