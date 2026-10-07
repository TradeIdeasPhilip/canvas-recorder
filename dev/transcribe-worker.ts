// The Web Worker that makes transcripts, so the page stays responsive while
// the models run.  Started by transcripts.ts; it does nothing on its own.

import * as transformers from "@huggingface/transformers";
import {
  Device,
  Transcriber,
  TranscribeProgress,
} from "./transcribe-core.ts";
import type { TranscriptWord } from "./transcript-align.ts";

export type TranscribeRequest = {
  readonly id: number;
  /** 16 kHz mono. */
  readonly samples: Float32Array;
  /** Force one device, e.g. to compare speeds.  Normally WebGPU, falling back to WASM. */
  readonly device?: Device;
};

export type TranscribeReply =
  | {
      readonly id: number;
      readonly kind: "progress";
      readonly progress: TranscribeProgress;
      readonly device: Device;
    }
  | {
      readonly id: number;
      readonly kind: "done";
      readonly words: TranscriptWord[];
      readonly device: Device;
      readonly elapsedMs: number;
    }
  | { readonly id: number; readonly kind: "error"; readonly message: string };

// Models come from the Hugging Face hub, never from this site.
transformers.env.allowLocalModels = false;

const transcribers = new Map<Device, Transcriber>();
/** Once WebGPU has failed here, don't keep paying to find that out again. */
let webGpuFailed = false;

function post(reply: TranscribeReply): void {
  (globalThis as unknown as { postMessage(message: unknown): void }).postMessage(reply);
}

function devicesToTry(forced?: Device): Device[] {
  if (forced) return [forced];
  return "gpu" in navigator && !webGpuFailed ? ["webgpu", "wasm"] : ["wasm"];
}

/** One job at a time:  model sessions don't take overlapping runs. */
let queue = Promise.resolve();

globalThis.addEventListener("message", (event) => {
  const request = (event as MessageEvent<TranscribeRequest>).data;
  queue = queue.then(() => handle(request));
});

async function handle({ id, samples, device: forced }: TranscribeRequest): Promise<void> {
  let lastError: unknown;
  for (const device of devicesToTry(forced)) {
    try {
      let transcriber = transcribers.get(device);
      if (!transcriber) {
        transcriber = new Transcriber(transformers, device);
        transcribers.set(device, transcriber);
      }
      const start = performance.now();
      const words = await transcriber.transcribe(samples, (progress) =>
        post({ id, kind: "progress", progress, device }),
      );
      post({ id, kind: "done", words, device, elapsedMs: performance.now() - start });
      return;
    } catch (error) {
      lastError = error;
      transcribers.delete(device);
      if (device === "webgpu") webGpuFailed = true;
      console.warn(`Transcription on ${device} failed; trying the next device.`, error);
    }
  }
  post({ id, kind: "error", message: String(lastError) });
}
