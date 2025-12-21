import { Canvas } from "skia-canvas";
import { spawn } from "child_process";
import { draw } from "../src/top.ts";

const startTime = Date.now();

const WIDTH = 3840;
const HEIGHT = 2160;
const FPS = 60;
const DURATION_SEC = 10;
const TOTAL_FRAMES = DURATION_SEC * FPS;

const canvas = new Canvas(WIDTH, HEIGHT);
// TODO draw() should accept the smaller class.
const ctx = canvas.getContext("2d");

const ffmpeg = spawn("ffmpeg", [
  "-y",
  "-f",
  "rawvideo",
  "-pix_fmt",
  "rgba",
  "-s",
  `${WIDTH}x${HEIGHT}`,
  "-r",
  `${FPS}`,
  "-i",
  "pipe:0",
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "14", // or lower for higher quality
  "-pix_fmt",
  "yuv420p",
  "output.mp4",
]);

for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
  const timeMs = (frame / FPS) * 1000;
  draw(timeMs, ctx as any); // your pure function

  const buffer = await canvas.toBuffer("raw"); // RGBA Uint8Array
  ffmpeg.stdin.write(Buffer.from(buffer));
  process.stdout.write(`\rFrame ${frame + 1}/${TOTAL_FRAMES}`);
}

ffmpeg.stdin.end();
ffmpeg.on("close", () => {
  const elapsed = (Date.now() - startTime)/1000;
  console.log(`\nDone! TOTAL_FRAMES = ${TOTAL_FRAMES}, elapsed = ${elapsed} seconds`);
});
