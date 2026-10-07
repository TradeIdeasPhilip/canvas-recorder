import { debugLog } from "../src/debug-log.ts";
import {
  Device,
  MODELS,
  PIPELINE_VERSION,
  SAMPLE_RATE,
  TranscribeProgress,
} from "./transcribe-core.ts";
import type { TranscriptWord } from "./transcript-align.ts";
import type { TranscribeReply, TranscribeRequest } from "./transcribe-worker.ts";

/**
 * Word-by-word transcripts of sound files, for the timeline.
 *
 * Everything is per *file*, not per sound clip:  a clip is a window into a
 * file, so one transcript serves every clip cut from it, however they're
 * trimmed, split or moved.
 *
 * Making a transcript takes a while (seconds per minute of audio), so it
 * happens in a Web Worker, one file at a time, and the result is cached in
 * IndexedDB.  The cache is keyed by the file's URL and the server's fingerprint
 * of its contents, so a re-recorded file gets a new transcript.
 *
 * See development-plans/transcripts.md.
 */

export type Transcript = {
  /** Times in ms from the start of the file. */
  readonly words: readonly TranscriptWord[];
  /** Where it was made, and how long it took:  for the record. */
  readonly device: string;
  readonly elapsedMs: number;
  readonly madeAt: number;
};

export type TranscriptStatus =
  | { readonly kind: "waiting" }
  | {
      readonly kind: "working";
      /** Undefined while reading and decoding the file. */
      readonly progress?: TranscribeProgress;
    }
  | { readonly kind: "ready"; readonly transcript: Transcript }
  | { readonly kind: "failed"; readonly message: string };

// MARK: On / off

const ENABLED_KEY = "transcripts.enabled";

/** Whether to make transcripts automatically.  Remembered per browser. */
export function transcriptsEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setTranscriptsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, String(enabled));
  } catch {
    // Remembering is only a convenience.
  }
  if (enabled) {
    void pump();
  } else {
    // Forget what was waiting; it's requested again as it's drawn.
    for (const [url, status] of statuses) {
      if (status.kind === "waiting") statuses.delete(url);
    }
    queue.length = 0;
  }
  changed();
}

// MARK: Status

const statuses = new Map<string, TranscriptStatus>();
const listeners = new Set<() => void>();
/** URLs waiting their turn, oldest first. */
const queue: string[] = [];
let running: string | undefined;

/** Called whenever any transcript's status changes, e.g. to redraw the timeline. */
export function onTranscriptsChange(listener: () => void): void {
  listeners.add(listener);
}

let changePending = false;
/** Tell the listeners, at most once per frame:  progress arrives often. */
function changed(): void {
  if (changePending) return;
  changePending = true;
  requestAnimationFrame(() => {
    changePending = false;
    for (const listener of listeners) listener();
  });
}

function setStatus(url: string, status: TranscriptStatus): void {
  statuses.set(url, status);
  changed();
}

/**
 * The transcript of the file at `url`, or how far along it is.
 *
 * Asking is what starts the work:  the first time a file is asked about, it
 * joins the queue (when transcripts are enabled).  So the files on screen are
 * the ones done first.  Returns undefined when transcripts are off and
 * nothing is known.
 */
export function transcriptStatus(url: string): TranscriptStatus | undefined {
  const known = statuses.get(url);
  if (known) return known;
  if (!transcriptsEnabled() || url === "") return undefined;
  const waiting: TranscriptStatus = { kind: "waiting" };
  statuses.set(url, waiting);
  queue.push(url);
  void pump();
  return waiting;
}

/** The finished transcript of `url`, if there is one.  Never starts any work. */
export function readyTranscript(url: string): Transcript | undefined {
  const status = statuses.get(url);
  return status?.kind === "ready" ? status.transcript : undefined;
}

/** One line for the header above the timeline. */
export function transcriptsSummary(): string {
  if (!transcriptsEnabled()) return "";
  const waiting = queue.length;
  const more = waiting ? ` · ${waiting} waiting` : "";
  if (running) {
    const status = statuses.get(running);
    const name = decodeURIComponent(running.split("/").pop() ?? running);
    const progress =
      status?.kind === "working" && status.progress
        ? `${status.progress.stage} ${Math.round(status.progress.fraction * 100)}%`
        : "reading the file";
    return `${name}: ${progress}${more}`;
  }
  const failed = [...statuses.values()].filter((s) => s.kind === "failed").length;
  return failed ? `${failed} failed (see the Debug Log)` : "";
}

/** A status worth showing on a sound clip, or undefined once its words are ready. */
export function statusText(status: TranscriptStatus): string | undefined {
  switch (status.kind) {
    case "waiting":
      return "transcript waiting…";
    case "working":
      return status.progress
        ? `${status.progress.stage}… ${Math.round(status.progress.fraction * 100)}%`
        : "reading the file…";
    case "failed":
      return `no transcript: ${status.message}`;
    case "ready":
      return undefined;
  }
}

// MARK: The queue

async function pump(): Promise<void> {
  if (running || !transcriptsEnabled()) return;
  const url = queue.shift();
  if (url === undefined) return;
  running = url;
  try {
    setStatus(url, { kind: "working" });
    const transcript = await transcriptFor(url, (progress) =>
      setStatus(url, { kind: "working", progress }),
    );
    setStatus(url, { kind: "ready", transcript });
  } catch (error) {
    const message = String(error).replace(/^Error:\s*/, "");
    setStatus(url, { kind: "failed", message });
    debugLog("transcripts", `Couldn't transcribe "${url}": ${message}`);
  } finally {
    running = undefined;
    void pump();
  }
}

/** From the cache, or made now and cached. */
async function transcriptFor(
  url: string,
  onProgress: (progress: TranscribeProgress) => void,
): Promise<Transcript> {
  const key = await cacheKey(url);
  const cached = await readCache(key);
  if (cached) return cached;
  const transcript = await makeTranscript(url, onProgress);
  await writeCache(key, url, transcript);
  return transcript;
}

/**
 * Transcribe `url` from scratch, skipping the cache, and say how long it took.
 * For measuring:  `philDebug.transcribe(url, "wasm")` compares devices.
 */
export async function makeTranscript(
  url: string,
  onProgress?: (progress: TranscribeProgress) => void,
  device?: Device,
): Promise<Transcript> {
  const samples = await decode(url);
  const reply = await runWorker(samples, onProgress, device);
  return {
    words: reply.words,
    device: reply.device,
    elapsedMs: reply.elapsedMs,
    madeAt: Date.now(),
  };
}

// MARK: Audio

/** The file at `url` as 16 kHz mono, the way the models want it. */
async function decode(url: string): Promise<Float32Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  // decodeAudioData resamples to its context's rate, which does the 16 kHz part.
  const context = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const audio = await context.decodeAudioData(await response.arrayBuffer());
  if (audio.numberOfChannels === 1) return audio.getChannelData(0).slice();
  const mono = new Float32Array(audio.length);
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const data = audio.getChannelData(channel);
    for (let i = 0; i < mono.length; i++) mono[i] += data[i] / audio.numberOfChannels;
  }
  return mono;
}

// MARK: The worker

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<
  number,
  {
    resolve: (reply: Extract<TranscribeReply, { kind: "done" }>) => void;
    reject: (error: Error) => void;
    onProgress?: (progress: TranscribeProgress) => void;
  }
>();

function runWorker(
  samples: Float32Array,
  onProgress?: (progress: TranscribeProgress) => void,
  device?: Device,
): Promise<Extract<TranscribeReply, { kind: "done" }>> {
  if (!worker) {
    worker = new Worker(new URL("./transcribe-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event: MessageEvent<TranscribeReply>) => {
      const reply = event.data;
      const job = pending.get(reply.id);
      if (!job) return;
      if (reply.kind === "progress") {
        job.onProgress?.(reply.progress);
      } else if (reply.kind === "done") {
        pending.delete(reply.id);
        job.resolve(reply);
      } else {
        pending.delete(reply.id);
        job.reject(new Error(reply.message));
      }
    });
    worker.addEventListener("error", (event) => {
      for (const job of pending.values()) job.reject(new Error(event.message));
      pending.clear();
      worker = undefined;
    });
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    const request: TranscribeRequest = { id, samples, device };
    worker!.postMessage(request, [samples.buffer]);
  });
}

// MARK: The cache

const DB_NAME = "canvas-recorder-transcripts";
const STORE = "transcripts";

type CacheRecord = Transcript & { readonly key: string; readonly url: string };

/**
 * Which transcript belongs to this file, as it is now.
 *
 * A HEAD request is enough:  the server's ETag, or its size and modification
 * time, change whenever the file does.  Reading the whole file to hash it
 * would cost real time on every page load, and the page reloads on every
 * save.  Only a server that sends none of those headers gets its files hashed.
 */
async function cacheKey(url: string): Promise<string> {
  const absolute = new URL(url, location.href).href;
  const prefix = `${PIPELINE_VERSION}|${MODELS.whisper}|${absolute}|`;
  const head = await fetch(url, { method: "HEAD", cache: "no-cache" });
  const etag = head.headers.get("etag");
  const modified = head.headers.get("last-modified");
  const length = head.headers.get("content-length");
  if (etag) return prefix + etag;
  if (modified && length) return `${prefix}${modified} ${length}`;
  const bytes = await (await fetch(url)).arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return prefix + Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

let dbPromise: Promise<IDBDatabase> | undefined;
function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function readCache(key: string): Promise<Transcript | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as CacheRecord | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function writeCache(key: string, url: string, transcript: Transcript): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put({ ...transcript, key, url } satisfies CacheRecord);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/** Throw away every saved transcript, so they're all made again.  For the console. */
export async function forgetTranscripts(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  statuses.clear();
  changed();
}
