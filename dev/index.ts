import { assertNonNullable } from "phil-lib/misc.ts";
import { draw } from "../src/top.ts";
import { getById } from "phil-lib/client-misc.ts";
import "./style.css";

import { Output, WebMOutputFormat, StreamTarget, CanvasSource, Mp4OutputFormat } from 'mediabunny';

const canvas = getById("main", HTMLCanvasElement);
const context = assertNonNullable(canvas.getContext("2d"));

const FPS = 60;
const TOTAL_FRAMES = 600;  // 10 seconds @ 60fps

const infoDiv = getById("info", HTMLDivElement);
infoDiv.innerHTML = "Click 'Record and Save' to start...";

async function startRecording() {
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
    target: new StreamTarget(writableStream, { chunked: true }),  // Batch writes for speed
  });

  // Canvas source (VP9 for good quality/size on macOS)
  const videoSource = new CanvasSource(canvas, {
    codec: 'hevc',
    bitrate: 8_000_000,  // ~8Mbps — tune higher for better quality
  });

  output.addVideoTrack(videoSource, { frameRate: FPS });

  const startTime = performance.now();

  await output.start();
  infoDiv.innerHTML = "Recording in progress... (drawing frames as fast as possible)";

  // Offline loop: draw + push frames (faster than realtime)
  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    const timeMs = (frame / FPS) * 1000;
    context.reset();
    draw(timeMs, context);

    // Push frame (timestamp/duration in seconds)
    const timestampSec = frame / FPS;
    const durationSec = 1 / FPS;
    videoSource.add(timestampSec, durationSec);
  }

  await output.finalize();  // Finishes encoding + closes stream automatically

  const elapsedSeconds = (performance.now() - startTime) / 1000;

  infoDiv.innerHTML = `
    <strong>Recording complete!</strong><br>
    Frames: ${TOTAL_FRAMES}<br>
    Elapsed time: ${elapsedSeconds.toFixed(3)} seconds (faster than realtime)<br>
    File saved via File System Access API!
  `;
}

// Trigger with a button (user gesture required for showSaveFilePicker)
const button = document.createElement("button");
button.textContent = "Record and Save Video";
button.onclick = startRecording;
document.body.appendChild(button);