/**
 * Headless recording pipeline.
 *
 * Renders a Showable frame-by-frame using @napi-rs/canvas, pipes raw RGBA to
 * ffmpeg, and encodes to ProRes 4444 (.mov) with an alpha channel.
 *
 * Usage:   npm run record -- <videoKey>
 * Example: npm run record -- alpha-test
 */

import { createCanvas } from "@napi-rs/canvas";
import { spawn } from "node:child_process";
import type { Showable } from "../src/showable.ts";

// ---------------------------------------------------------------------------
// Video registry — mirrors showableOptions in dev/canvas-recorder.ts.
// Add new entries here as needed.
// ---------------------------------------------------------------------------
const showableOptions = new Map<string, () => Promise<Showable>>([
  ["alpha-test", async () => (await import("../src/alpha-test.ts")).alphaTest],
  ["lissajous",  async () => (await import("../src/lissajous.ts")).lissajous],
]);

// ---------------------------------------------------------------------------
// Parse command-line argument
// ---------------------------------------------------------------------------
const key = process.argv[2];
if (!key) {
  console.error("Usage: npm run record -- <videoKey>");
  console.error("Available:", [...showableOptions.keys()].join(", "));
  process.exit(1);
}
const factory = showableOptions.get(key);
if (!factory) {
  console.error(`Unknown video: "${key}"`);
  console.error("Available:", [...showableOptions.keys()].join(", "));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load the showable
// ---------------------------------------------------------------------------
console.log(`Loading "${key}"...`);
const showable = await factory();

const WIDTH  = 3840;
const HEIGHT = 2160;
const FPS    = 60;
const TOTAL_FRAMES = Math.ceil((showable.duration / 1000) * FPS);
const OUTPUT_FILE  = `${key}.mov`;

console.log(`${TOTAL_FRAMES} frames  →  ${OUTPUT_FILE}`);

// ---------------------------------------------------------------------------
// Spawn ffmpeg: raw RGBA in → ProRes 4444 with alpha out
// ---------------------------------------------------------------------------
const ffmpeg = spawn(
  "ffmpeg",
  [
    "-y",
    // Input: raw RGBA video from stdin
    "-f", "rawvideo", "-pix_fmt", "rgba",
    "-s", `${WIDTH}x${HEIGHT}`,
    "-r", String(FPS),
    "-i", "pipe:0",
    // Output: ProRes 4444 (lower-bitrate 4444 variant, not 4444 XQ)
    "-c:v", "prores_ks",
    "-profile:v", "4444",
    "-pix_fmt", "yuva444p10le",
    "-an",           // no audio track
    OUTPUT_FILE,
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);

ffmpeg.on("error", (err) => {
  console.error("\nFailed to start ffmpeg:", err.message);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
const canvas  = createCanvas(WIDTH, HEIGHT);
const ctx     = canvas.getContext("2d");
const context = ctx as unknown as CanvasRenderingContext2D;

const startTime = Date.now();

for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
  const timeInMs = (frame / FPS) * 1000;

  // Mirror the web harness: clear canvas, then apply the 16×9 scale transform.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.setTransform(WIDTH / 16, 0, 0, HEIGHT / 9, 0, 0);

  showable.show({ timeInMs, context, globalTime: timeInMs });

  // getImageData always operates in canvas (pixel) coordinates.
  const { data } = ctx.getImageData(0, 0, WIDTH, HEIGHT);

  // Write frame; respect backpressure.
  const ok = ffmpeg.stdin!.write(Buffer.from(data));
  if (!ok) {
    await new Promise<void>((resolve) => ffmpeg.stdin!.once("drain", resolve));
  }

  const elapsed = (Date.now() - startTime) / 1000;
  const fps = (frame + 1) / elapsed;
  process.stdout.write(
    `\rFrame ${frame + 1}/${TOTAL_FRAMES}  ${fps.toFixed(1)} fps  ${elapsed.toFixed(0)}s elapsed`,
  );
}

// ---------------------------------------------------------------------------
// Finish
// ---------------------------------------------------------------------------
ffmpeg.stdin!.end();
await new Promise<void>((resolve) => ffmpeg.on("close", resolve));

const elapsed = (Date.now() - startTime) / 1000;
console.log(
  `\nDone!  ${(TOTAL_FRAMES / FPS / elapsed).toFixed(2)}× realtime  →  ${OUTPUT_FILE}`,
);
