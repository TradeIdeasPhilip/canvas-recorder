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
  "rgba", // Input from skia-canvas
  "-s",
  `${WIDTH}x${HEIGHT}`,
  "-r",
  `${FPS}`, // Input rate (matches your -framerate)
  "-i",
  "pipe:0",

  "-c:v",
  "hevc_videotoolbox",
  "-q:v",
  "30",
  "-profile:v",
  "main10",
  "-pix_fmt",
  "yuv420p10le", // Explicit 10-bit output
  "-colorspace",
  "bt709",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
  "-color_range",
  "tv",
  "-tag:v",
  "hvc1",
  "-movflags",
  "+faststart+write_colr",

  "-r",
  `${FPS}`, // Output rate (matches your final -r)
  "output.mp4",
]);

for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
  const timeMs = (frame / FPS) * 1000;
  ctx.reset();
  draw(timeMs, ctx as any); // your pure function

  const buffer = await canvas.toBuffer("raw"); // RGBA Uint8Array
  //const buffer = await canvas.toBuffer("raw",{colorType:"rgb"});
  //const buffer = await canvas.toBuffer("jpeg");
  //const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT)
  ffmpeg.stdin.write(Buffer.from(buffer));
  process.stdout.write(`\rFrame ${frame + 1}/${TOTAL_FRAMES}`);
}

ffmpeg.stdin.end();
ffmpeg.on("close", () => {
  const elapsed = (Date.now() - startTime) / 1000;
  console.log(
    `\nDone! TOTAL_FRAMES = ${TOTAL_FRAMES}, elapsed = ${elapsed} seconds`
  );
});
