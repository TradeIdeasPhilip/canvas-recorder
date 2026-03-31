import { getById } from "phil-lib/client-misc";
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

let canvasSize: { readonly width: number; readonly height: number } | undefined;

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
    context.font = `${canvasSize.height}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("No Data.", canvas.width / 2, canvas.height / 2);
  } else {
    const startingInputIndex = 12617;
    const makeHeight = makeLinear(
      -1,
      canvasSize.height / 2,
      1,
      -canvas.height / 2,
    );
    const yCenter = canvasSize.height / 2;
    const end = Math.min(soundData.length, canvasSize.width);
    for (let i = 0; i < end; i++) {
      const sample = soundData[i + startingInputIndex];
      context.fillRect(i, yCenter, 1, makeHeight(sample));
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
