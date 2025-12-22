import { assertNonNullable, sleep } from "phil-lib/misc.ts";
import { draw } from "../src/top.ts";
import { AnimationLoop, getById } from "phil-lib/client-misc.ts";
import "./style.css";

//document.body.append(magicWords());

const canvas = getById("main", HTMLCanvasElement);
const context = assertNonNullable(canvas.getContext("2d"));

/*
let offset = NaN;
new AnimationLoop((timeInMS: number) => {
  if (isNaN(offset)) {
    offset = timeInMS;
  }
  timeInMS -= offset;
  context.reset();
  draw(timeInMS, context);
});
*/

// This is a very efficient way to encode things.
// Puppeteer would make it more practical.
// You could save each chunk immediately, instead of saving them all in memory.
// And you could run without worrying about keeping the window visible.

const FPS = 60;
const TOTAL_FRAMES = 600; // 10 seconds

// Start timing
const startTime = performance.now();
let frameCount = 0;

// Create stream and recorder
const stream = canvas.captureStream(60); // Hint FPS, but we go faster
const recorder = new MediaRecorder(stream, {
  mimeType: "video/mp4;codecs=avc1.42E01E", // H.264 Main Profile (matches macOS)
  videoBitsPerSecond: 5000000, // 5Mbps — tune for quality/size

  //  mimeType: "video/mp4",

  //  mimeType: "video/webm;codecs=vp9", // Best browser support + quality
  // Optional: bitsPerSecond for more control (e.g., 5000000 for ~5Mbps)
});

const chunks: any[] = [];
recorder.ondataavailable = (event) => {
  if (event.data.size > 0) chunks.push(event.data);
};

const infoDiv = getById("info", HTMLDivElement);

recorder.onstop = () => {
  const elapsedSeconds = (performance.now() - startTime) / 1000;
  const blob = new Blob(chunks, { type: "video/mp4" });
  const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);

  infoDiv.innerHTML = `
    <strong>Recording complete!</strong><br>
    Frames: ${TOTAL_FRAMES}<br>
    Elapsed time: ${elapsedSeconds.toFixed(3)} seconds<br>
    File size: ${sizeMB} MB<br>
    <a href="${URL.createObjectURL(blob)}" download="canvas-recording.mp4">
      Download video (canvas-recording.mp4)
    </a>
  `;

  // Clean up
  stream.getTracks().forEach((track) => track.stop());
};

// Start recording (timeslice = 0 means "as much data as possible")
recorder.start();
recorder.requestData(); // Prime it

// Render all frames as fast as possible
async function renderNextFrame() {
  if (frameCount >= TOTAL_FRAMES) {
    recorder.stop();
    return;
  }

  const timeMs = (frameCount / FPS) * 1000;
  context.reset();
  draw(timeMs, context);

  /*
  if (frameCount >= 60 && frameCount < 120) {
    const endTime = Date.now() + 300;
    while (Date.now() < endTime) {}
  }
    */

  frameCount++;
  // Push frame to recorder immediately
  recorder.requestData();
  requestAnimationFrame(renderNextFrame); // Fastest browser loop
}

renderNextFrame();

// Pipe the output of this through
// ffmpeg -i canvas-recording.mp4 -c copy -bsf:v "setts=ts=STARTPTS+N/TB_OUT/60" output.mp4 to fix the timestamps
