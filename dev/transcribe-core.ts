import type * as TransformersModule from "@huggingface/transformers";
import {
  alignWords,
  CtcEmissions,
  quietestMoment,
  RoughWord,
  TranscriptWord,
  withCutPoints,
} from "./transcript-align.ts";

/**
 * Turns audio into a word-by-word transcript with precise boundaries:
 * Whisper for the words, wav2vec2 for exactly when each one is said, and the
 * quietest moments around each word for cutting.
 *
 * Runs wherever Transformers.js does.  The browser runs it in a Web Worker
 * (transcribe-worker.ts); Node runs the same code for testing.  The library
 * is passed in rather than imported, so this file decides nothing about where
 * it runs.
 *
 * See development-plans/transcripts.md for the measurements behind these choices.
 */

type Transformers = typeof TransformersModule;

/** Both models want 16 kHz mono. */
export const SAMPLE_RATE = 16_000;

/**
 * Whisper base, English only, exported with the attention outputs that word
 * timestamps need.  wav2vec2 base, trained on 960 hours of read English.
 */
export const MODELS = {
  whisper: "onnx-community/whisper-base.en_timestamped",
  aligner: "Xenova/wav2vec2-base-960h",
} as const;

/**
 * 8-bit models:  172 MB to download in all, and they run on WebGPU, WASM and
 * Node's CPU.  Measured against full precision, word starts agree within
 * 40 ms for 153 of 155 words.  The full-precision set is about twice as fast
 * on WebGPU, but 670 MB.
 */
const DTYPE = "q8";

/**
 * Change this whenever the models, their settings or the alignment change.
 * Saved transcripts made by an older version are then made again.
 */
export const PIPELINE_VERSION = 1;

/** Where the models run.  `cpu` is Node only. */
export type Device = "webgpu" | "wasm" | "cpu";

export type TranscribeProgress = {
  readonly stage: "downloading models" | "transcribing" | "aligning";
  /** 0 to 1 within this stage. */
  readonly fraction: number;
};

/** Whisper handles audio in pieces about this long, split at quiet moments. */
const PIECE_MS = 60_000;
/** How far either side of each {@link PIECE_MS} mark to look for a quiet place to split. */
const PIECE_SEARCH_MS = 5_000;

/** wav2vec2 looks at the audio this much at a time, overlapping its neighbours by {@link ALIGNER_OVERLAP_FRAMES}. */
const ALIGNER_WINDOW_SAMPLES = 20 * SAMPLE_RATE;
/** Frames ignored at each inner edge of a wav2vec2 window, where it hears only half the context. */
const ALIGNER_OVERLAP_FRAMES = 50;
/** One wav2vec2 frame:  320 samples, 20 ms. */
const ALIGNER_HOP_SAMPLES = 320;

type Aligner = {
  readonly processor: Awaited<ReturnType<Transformers["AutoProcessor"]["from_pretrained"]>>;
  readonly model: Awaited<ReturnType<Transformers["AutoModelForCTC"]["from_pretrained"]>>;
  readonly vocabulary: ReadonlyMap<string, number>;
};

/**
 * Loads the models once, on first use, and keeps them for every file after.
 */
export class Transcriber {
  #whisper: ReturnType<Transcriber["loadWhisper"]> | undefined;
  #aligner: Promise<Aligner> | undefined;
  #onProgress: ((progress: TranscribeProgress) => void) | undefined;
  /** Download progress, file by file, so several files add up to one fraction. */
  readonly #downloads = new Map<string, { loaded: number; total: number }>();

  constructor(
    private readonly transformers: Transformers,
    readonly device: Device,
  ) {}

  #downloadProgress = (info: unknown) => {
    const { status, file, loaded, total } = info as {
      status?: string;
      file?: string;
      loaded?: number;
      total?: number;
    };
    if (status !== "progress" || !file || !total) return;
    this.#downloads.set(file, { loaded: loaded ?? 0, total });
    let sumLoaded = 0;
    let sumTotal = 0;
    for (const d of this.#downloads.values()) {
      sumLoaded += d.loaded;
      sumTotal += d.total;
    }
    this.#onProgress?.({ stage: "downloading models", fraction: sumLoaded / sumTotal });
  };

  private loadWhisper() {
    return this.transformers.pipeline("automatic-speech-recognition", MODELS.whisper, {
      device: this.device,
      dtype: DTYPE,
      progress_callback: this.#downloadProgress,
    });
  }

  #loadAligner(): Promise<Aligner> {
    const { AutoProcessor, AutoModelForCTC, AutoTokenizer } = this.transformers;
    const options = { progress_callback: this.#downloadProgress };
    return Promise.all([
      AutoProcessor.from_pretrained(MODELS.aligner, options),
      AutoModelForCTC.from_pretrained(MODELS.aligner, {
        ...options,
        device: this.device,
        dtype: DTYPE,
      }),
      AutoTokenizer.from_pretrained(MODELS.aligner, options),
    ]).then(([processor, model, tokenizer]) => {
      // A Map in Transformers.js 4, a plain object in 3.
      const raw = tokenizer.get_vocab() as Map<string, number> | Record<string, number>;
      const vocabulary = raw instanceof Map ? raw : new Map(Object.entries(raw));
      return { processor, model, vocabulary };
    });
  }

  /**
   * The transcript of `samples`, 16 kHz mono.  Times are in ms from the start.
   */
  async transcribe(
    samples: Float32Array,
    onProgress?: (progress: TranscribeProgress) => void,
  ): Promise<TranscriptWord[]> {
    this.#onProgress = onProgress;
    try {
      const rough = await this.#whisperWords(samples, onProgress);
      const emissions = await this.#letterProbabilities(samples, onProgress);
      return withCutPoints(rough, alignWords(rough, emissions), samples, SAMPLE_RATE);
    } finally {
      this.#onProgress = undefined;
    }
  }

  // MARK: Whisper

  /** Whisper's words, with its rough times. */
  async #whisperWords(
    samples: Float32Array,
    onProgress?: (progress: TranscribeProgress) => void,
  ): Promise<RoughWord[]> {
    this.#whisper ??= this.loadWhisper();
    const asr = await this.#whisper;
    const boundaries = pieceBoundaries(samples);
    const words: RoughWord[] = [];
    for (let i = 0; i + 1 < boundaries.length; i++) {
      onProgress?.({ stage: "transcribing", fraction: boundaries[i] / samples.length });
      const piece = samples.subarray(boundaries[i], boundaries[i + 1]);
      const offsetMs = (boundaries[i] / SAMPLE_RATE) * 1000;
      const pieceMs = (piece.length / SAMPLE_RATE) * 1000;
      const result = (await asr(piece, {
        return_timestamps: "word",
        chunk_length_s: 30,
      })) as { chunks?: { text: string; timestamp: [number, number | null] }[] };
      for (const { text, timestamp } of result.chunks ?? []) {
        const startMs = timestamp[0] * 1000;
        // Whisper sometimes leaves the last word open-ended.
        const endMs = timestamp[1] === null ? pieceMs : timestamp[1] * 1000;
        if (text.trim() === "") continue;
        words.push({ text, startMs: offsetMs + startMs, endMs: offsetMs + endMs });
      }
    }
    return words;
  }

  // MARK: wav2vec2

  /** wav2vec2's letter probabilities for every 20 ms frame of `samples`. */
  async #letterProbabilities(
    samples: Float32Array,
    onProgress?: (progress: TranscribeProgress) => void,
  ): Promise<CtcEmissions> {
    this.#aligner ??= this.#loadAligner();
    const { processor, model, vocabulary } = await this.#aligner;
    const frameCount = Math.floor(samples.length / ALIGNER_HOP_SAMPLES);
    const step = ALIGNER_WINDOW_SAMPLES - 2 * ALIGNER_OVERLAP_FRAMES * ALIGNER_HOP_SAMPLES;
    let vocabularySize = 0;
    let logProbs = new Float32Array(0);
    /** Frames filled in so far, from the start. */
    let written = 0;
    for (let offset = 0; written < frameCount; offset += step) {
      onProgress?.({ stage: "aligning", fraction: offset / samples.length });
      const window = samples.subarray(offset, offset + ALIGNER_WINDOW_SAMPLES);
      const isLast = offset + ALIGNER_WINDOW_SAMPLES >= samples.length;
      const { logits } = await model(await processor(window));
      const [, frames, size] = logits.dims as number[];
      if (vocabularySize === 0) {
        vocabularySize = size;
        logProbs = new Float32Array(frameCount * size);
      }
      const data = logits.data as Float32Array;
      const base = offset / ALIGNER_HOP_SAMPLES;
      // Keep the middle of each window; the edges are only there for context.
      const from = Math.max(offset === 0 ? 0 : ALIGNER_OVERLAP_FRAMES, written - base);
      const to = isLast ? frames : frames - ALIGNER_OVERLAP_FRAMES;
      for (let k = from; k < to && base + k < frameCount; k++) {
        logSoftmax(data, k * size, size, logProbs, (base + k) * size);
        written = base + k + 1;
      }
      if (isLast) break;
    }
    const tokenOf = (letter: string) => vocabulary.get(letter);
    return {
      logProbs,
      vocabularySize,
      frameCount: written,
      frameMs: (ALIGNER_HOP_SAMPLES / SAMPLE_RATE) * 1000,
      blank: vocabulary.get("<pad>") ?? 0,
      wordSeparator: vocabulary.get("|"),
      tokenOf,
    };
  }
}

/** Log probabilities from raw scores, one frame at a time, without overflow. */
function logSoftmax(
  source: Float32Array,
  sourceOffset: number,
  size: number,
  destination: Float32Array,
  destinationOffset: number,
): void {
  let max = -Infinity;
  for (let v = 0; v < size; v++) max = Math.max(max, source[sourceOffset + v]);
  let sum = 0;
  for (let v = 0; v < size; v++) sum += Math.exp(source[sourceOffset + v] - max);
  const logSum = max + Math.log(sum);
  for (let v = 0; v < size; v++) {
    destination[destinationOffset + v] = source[sourceOffset + v] - logSum;
  }
}

/**
 * Where to split long audio for Whisper:  about every {@link PIECE_MS}, at the
 * quietest moment nearby, so a split almost never lands inside a word.
 *
 * @returns Sample indices, from 0 to `samples.length` inclusive.
 */
export function pieceBoundaries(samples: Float32Array): number[] {
  const totalMs = (samples.length / SAMPLE_RATE) * 1000;
  const boundaries = [0];
  for (let target = PIECE_MS; target < totalMs - PIECE_MS / 2; target += PIECE_MS) {
    const cutMs = quietestMoment(
      samples,
      SAMPLE_RATE,
      target - PIECE_SEARCH_MS,
      target + PIECE_SEARCH_MS,
    );
    boundaries.push(Math.round((cutMs / 1000) * SAMPLE_RATE));
  }
  boundaries.push(samples.length);
  return boundaries;
}
