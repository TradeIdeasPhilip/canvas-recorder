# Transcripts on the Timeline

**Status (10/6/2026):** Built and tested headlessly in Node; not yet tried in a browser.
The browser checks are listed under [Please check](#please-check).

Each sound clip on the timeline shows what's said in it, word by word.
Zoomed in, every word has a tick and a label, and dragging a clip's edge snaps to the quiet moments between words.
Zoomed out, the labels thin out to a sample, enough to tell clips apart.
It's internal, for editing; nothing here reaches the exported video.

Free and local:  open models (MIT / Apache) run in the browser, with no service, account or API key.

## Using it

* **🗣 Transcripts** above the timeline turns it on and off; it's remembered per browser.
  The line next to it shows what's being worked on.
* Transcripts are made **automatically**, one file at a time, starting with the files on screen.
  Each file is transcribed once and saved; after that it's instant.
* **Click a word** to select its clip and put the playhead just before the word.
  Hovering shades the word, from the quiet moment before it to the quiet moment after.
* **Drag a sound clip's edge** and it snaps to the quiet moments between words, with a blue guide line.
  Hold **Alt** to drag freely.
* A clip with no Notes is labelled with its first few words.
  **📝** on a sound clip's card replaces its Notes with everything the clip says.
* Console:
  * `await philDebug.transcribe(url, device)` transcribes one file from scratch, skipping the cache, and reports the time.
    `device` is `"webgpu"` or `"wasm"`; leave it out for the normal choice.
  * `philDebug.forgetTranscripts()` throws away every saved transcript.

## How it works

Per *source file*, not per clip.
A clip is a window into a file, so one transcript serves every clip cut from it, however it's trimmed, split or moved.

1. **Decode** the file to 16 kHz mono (`decodeAudioData` on a 16 kHz `OfflineAudioContext`).
2. **Words:**  Whisper (`onnx-community/whisper-base.en_timestamped`) gives the words and rough times.
   The audio goes in pieces of about a minute, split at quiet moments.
3. **Boundaries:**  wav2vec2 (`Xenova/wav2vec2-base-960h`) says which letter is being spoken in every 20 ms frame.
   CTC forced alignment, the method WhisperX uses, puts Whisper's words onto those frames.
   Numbers and a few symbols are spelled out first ("2" → TWO, "1981" → NINETEEN EIGHTY ONE, "+" → PLUS), since wav2vec2 only knows letters.
4. **Cut points:**  for each word, the quietest 10 ms just before it and just after it, within 200 ms of the word.
   Between two words close together, they're the same moment.

Files:

* `dev/transcript-align.ts`:  steps 3 and 4.  Pure functions, no models.
* `dev/transcribe-core.ts`:  steps 2 and 3, the models.  It runs in the browser and in Node alike; the Node tests ran this exact code.
* `dev/transcribe-worker.ts`:  a Web Worker around the core, so the page stays live.
  It tries WebGPU first and falls back to WASM.
* `dev/transcripts.ts`:  on the page.  The queue, decoding, the IndexedDB cache, status.
* `dev/timeline-display.ts`:  the word strip, hover, click to seek, snapping.
* `dev/canvas-recorder.ts`:  `soundClipBlock()` feeds each clip its words and snap points.

**Cache:**  IndexedDB database `canvas-recorder-transcripts`.
The key is the file's URL plus the server's fingerprint of its contents: the ETag, or else the size and modification time, from a HEAD request.
So a re-recorded file is transcribed again; a renamed one is too.
The plan said SHA-256 of the bytes, but the page reloads on every save, and hashing the 189 MB Galaga recording each time isn't worth it.
A server that sends neither header gets its files hashed.
`PIPELINE_VERSION` in `transcribe-core.ts` is part of the key:  bump it after changing the models or the alignment.

**Model weights** are cached by Transformers.js in the browser's Cache Storage after the first download.
ONNX Runtime's WebAssembly comes from jsdelivr, also cached.
So the first transcript needs the network; later ones don't.

## Measurements (Step 0)

All on this Mac, in Node, using the same Transformers.js 4.3.1 and ONNX Runtime the browser uses.
Node's WebGPU device runs the same ONNX Runtime WebGPU engine as Chrome.

**Whisper alone is not precise.**
On "Does 2 + 2 = 4.m4a" (81 s), Whisper's word starts were off by a median of 100 ms, up to 580 ms, against the aligned times.
Its words also run into each other and stretch across pauses:  "start." was given 2.04 s for a 0.28 s word in the Galaga recording.
The aligned boxes sit on the speech in the waveform; Whisper's drift late.

**Alignment works on real audio.**
157 of 157 words aligned on the voiceover.
At least 71 of 72 aligned on a minute of the Galaga recording, game sound and all.  (That was measured with the confidence bar described below, which only lowered the count.)

**8-bit models are enough.**
The 8-bit models download 172 MB in all, against 670 MB at full precision.
Their word starts match full precision within 40 ms for 153 of 155 words; the worst was 120 ms.
Whisper's text differed by 2 words in 157.

**Don't second-guess the alignment.**
I first kept Whisper's times wherever wav2vec2 was unsure.
Measured against full precision, that was worse than always trusting the alignment:  148 vs 153 of 155 within 40 ms.
An unsure word is still pinned between its neighbours; Whisper's time for it is late.
The confidence is kept on each word, for display if we ever want it.

**Word timestamps work on WebGPU.**
There was an open Transformers.js issue about that; with these versions the WebGPU output is identical to the CPU's.

**Speed**, whole pipeline, 8-bit models, after the first download:

| Device | Speed | 81 s voiceover | 7½ min Galaga recording (estimated) |
|---|---|---|---|
| Node CPU | 3.8× real time | 21 s | ~2 min |
| WebGPU | 2.3× real time | 35 s | ~3 min |
| Browser WASM | not measured | | |

WebGPU isn't faster than the CPU at these sizes.
Whisper writes one word at a time, which a GPU doesn't speed up much.
The full-precision WebGPU set is about twice as fast, for a 670 MB download.
To switch, change `DTYPE` in `transcribe-core.ts`, and bump `PIPELINE_VERSION`.

Not measured:  WASM in a real browser.
Without cross-origin isolation it runs on one thread, so expect it to be several times slower than the CPU numbers.
It's only the fallback when WebGPU isn't available.

## Please check

In a browser, on your Mac:

1. Open a video with voiceover, e.g. the Peano videos or Some 5, with 🗣 Transcripts on.
   The line next to the checkbox should show the download, then each file's progress.
   Then the words appear.
2. Zoom in and out:  the words should thin out, not overlap.
3. Click a word; the playhead should land just before it.
   Drag a clip edge near a word boundary; it should snap with a blue line, and Alt should turn that off.
4. Reload:  transcripts should appear at once, from the cache.
5. Optional, for this doc:  `await philDebug.transcribe("./Does 2 + 2 = 4.m4a")`, then the same with `"wasm"`.
   Note the two times here.

## Known limits

* **Invented words.**  Whisper sometimes invents words in silence or music ("Thanks for watching!").
  If that's a problem, drop words in near-silent stretches, or those with very low confidence.
* **Word ends run early.**  wav2vec2 marks where each letter starts, so a word's `endMs` misses the tail of its last sound.
  The cut points cover that; snapping uses them, not `endMs`.
* **English only.**  Both models are English-only.
* **Shared GPU.**  While a file is being transcribed, WebGPU shares the GPU with the canvas, so playback may stutter for a minute.
  Each file only pays this once.
* **Loaded models stay in memory** (a few hundred MB, in the worker) until the page reloads.

## If we come back

* Select a run of words and make a new clip from exactly those words.
* Search the transcript for a phrase.
* Show low-confidence words lighter.
* Use transcripts in Sound Explorer too.
* A setting for the faster model set, instead of editing `DTYPE`.
