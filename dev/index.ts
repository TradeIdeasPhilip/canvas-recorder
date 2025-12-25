import { assertNonNullable, sleep } from "phil-lib/misc.ts";
import { fourierIntro } from "../src/peano-fourier/fourier-intro.ts";
import { AnimationLoop, getById } from "phil-lib/client-misc.ts";
import "./style.css";

import {
  Output,
  StreamTarget,
  CanvasSource,
  Mp4OutputFormat,
} from "mediabunny";
import { peanoIterations } from "../src/peano-fourier/peano-iterations.ts";
import { peanoFourier } from "../src/peano-fourier/peano-fourier.ts";

const canvas = getById("main", HTMLCanvasElement);
const context = assertNonNullable(canvas.getContext("2d"));

const toShow = peanoFourier;

function showFrame(timeInMS: number, size: "live" | "4k" | "hd") {
  if (size == "live") {
    const clientRect = canvas.getClientRects()[0];
    canvas.width = Math.round(clientRect.width * devicePixelRatio);
    canvas.height = Math.round(clientRect.height * devicePixelRatio);
  } else if (size == "4k") {
    canvas.width = 3840;
    canvas.height = 2160;
  } else {
    canvas.width = 1920;
    canvas.height = 1080;
  }
  context.reset();
  context.scale(canvas.width / 16, canvas.height / 9);
  toShow.show(timeInMS, context);
}
(window as any).showFrame = showFrame;

let offset = NaN;
const animationLoop = new AnimationLoop((timeInMS: number) => {
  if (isNaN(offset)) {
    offset = timeInMS;
  }
  timeInMS -= offset;
  showFrame(timeInMS, "live");
});

const FPS = 60;

const infoDiv = getById("info", HTMLDivElement);
infoDiv.innerHTML = "Click 'Record and Save' to start...";

async function startRecording() {
  animationLoop.cancel();

  infoDiv.innerHTML = "Choose save location... (recording starts immediately)";

  // User picks file
  const fileHandle = await window.showSaveFilePicker({
    suggestedName: "canvas-recording.mp4",
    types: [
      {
        description: "WebM Video",
        accept: { "video/mp4": [".mp4"] },
      },
    ],
  });

  const writableStream = await fileHandle.createWritable();

  // Set up Mediabunny output (streaming to file)
  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new StreamTarget(writableStream, { chunked: true }), // Batch writes for speed
  });

  // Canvas source (VP9 for good quality/size on macOS)
  const videoSource = new CanvasSource(canvas, {
    codec: "hevc",
    bitrate: 8_000_000, // ~8Mbps — tune higher for better quality
  });

  output.addVideoTrack(videoSource, { frameRate: FPS });

  const startTime = performance.now();

  await output.start();
  infoDiv.innerHTML =
    "Recording in progress... (drawing frames as fast as possible)";

  const frameDuration = 1000 / FPS;

  // Offline loop: draw + push frames (faster than realtime)
  let frameNumber = 0;
  while (true) {
    const timeInMS = (frameNumber + 0.5) * frameDuration;
    if (timeInMS > toShow.duration) {
      break;
    }
    showFrame(timeInMS, "4k");
    // Push frame (timestamp/duration in seconds)
    const timestampSec = frameNumber / FPS;
    const durationSec = 1 / FPS;
    await videoSource.add(timestampSec, durationSec);
    frameNumber++;
  }

  await output.finalize(); // Finishes encoding + closes stream automatically

  const elapsedSeconds = (performance.now() - startTime) / 1000;

  infoDiv.innerHTML = `
    <strong>Recording complete!</strong><br>
    Frames: ${frameNumber}<br>
    Elapsed time: ${elapsedSeconds.toFixed(3)} seconds<br>
    File saved via File System Access API!
  `;
}

// Trigger with a button (user gesture required for showSaveFilePicker)
const button = document.createElement("button");
button.textContent = "Record and Save Video";
button.onclick = startRecording;
document.body.appendChild(button);
