import { SoundClip } from "../src/showable.ts";
import { MODELS, PIPELINE_VERSION } from "./transcribe-core.ts";
import { type TranscriptWord, wordFlag } from "./transcript-align.ts";
import type { Transcript } from "./transcripts.ts";

/**
 * A transcript saved as JSON, for reading and searching outside the editor,
 * by a person or by another program.  It's meant for finding what to cut:  a
 * fluffed line, a repeated word, a "do that again".
 *
 * The whole file's transcript is saved, with the one clip it was saved from
 * described at the top.
 */

/** Everything about the clip that the file itself doesn't know. */
export type ClipContext = {
  readonly clip: SoundClip;
  /** The component the clip belongs to. */
  readonly ownerName: string;
  /** When the clip starts, in video time. */
  readonly startsInVideoMs: number;
  /** How long it plays, if known yet. */
  readonly lengthMs: number | undefined;
};

/** One decimal place of a millisecond is plenty, and keeps the file readable. */
const ms = (n: number) => Math.round(n * 10) / 10;

/** Whisper's words as they are; speech it left out in [brackets]. */
function asText(words: readonly TranscriptWord[]): string {
  return words.map((w) => (w.timing === "letters" ? `[${w.text}]` : w.text)).join(" ");
}

/**
 * The JSON text to save.  Each word is on its own line, so the file reads
 * well and diffs and greps by word.
 */
export function transcriptJson(transcript: Transcript, context: ClipContext): string {
  const { clip } = context;
  const fromMs = clip.startMsIntoClip ?? 0;
  const toMs = context.lengthMs === undefined ? undefined : fromMs + context.lengthMs;
  const inClip = (w: TranscriptWord) =>
    w.endMs > fromMs && (toMs === undefined || w.startMs < toMs);
  const clipWords = transcript.words.filter(inClip);
  const first = clipWords.length ? transcript.words.indexOf(clipWords[0]) : undefined;
  const last = clipWords.length
    ? transcript.words.indexOf(clipWords[clipWords.length - 1])
    : undefined;

  const header = {
    about: [
      "A word-by-word transcript of one sound file, saved from the canvas-recorder Visual Editor.",
      "Every time is in milliseconds from the start of the FILE.  For video time:  " +
        "clip.startsInVideoMs + (time - clip.playsFileFromMs).",
      "timing:  'aligned' is Whisper's word, timed by a letter model (wav2vec2).  " +
        "'whisper' kept Whisper's rougher times.  'letters' is speech Whisper LEFT OUT " +
        "(repeats, false starts, ums), found by the letter model; its text is spelled by sound.",
      "heard:  what the letter model heard on its own between cutBeforeMs and cutAfterMs, spelled by sound.  " +
        "When it disagrees with text, or is empty, that's worth a listen:  Whisper tidies, the letter model doesn't.",
      "confidence:  0 to 1, how well the audio matched the letters.  Low means noise, mumbling, or a word that wasn't said.",
      "cutBeforeMs / cutAfterMs:  the quietest moment just before and after the word:  the best places to cut.",
      "flag:  only on words worth an editor's attention.  'left out' (timing 'letters') is almost always a mistake:  " +
        "a repeat, a false start, an um.  'doubtful' means the letter model heard nothing there, or something else.",
    ],
    file: clip.source,
    clip: {
      owner: context.ownerName,
      notes: clip.notes,
      startsInVideoMs: ms(context.startsInVideoMs),
      playsFileFromMs: ms(fromMs),
      playsFileToMs: toMs === undefined ? null : ms(toMs),
      firstWordIndex: first ?? null,
      lastWordIndex: last ?? null,
      text: asText(clipWords),
    },
    transcript: {
      madeAt: new Date(transcript.madeAt).toISOString(),
      device: transcript.device,
      pipelineVersion: PIPELINE_VERSION,
      models: MODELS,
      wordCount: transcript.words.length,
      recoveredCount: transcript.words.filter((w) => w.timing === "letters").length,
      doubtfulCount: transcript.words.filter((w) => wordFlag(w) === "doubtful").length,
      text: asText(transcript.words),
    },
    words: "@@WORDS@@",
  };
  const wordLines = transcript.words.map((w, index) =>
    JSON.stringify({
      index,
      text: w.text,
      startMs: ms(w.startMs),
      endMs: ms(w.endMs),
      cutBeforeMs: ms(w.cutBeforeMs),
      cutAfterMs: ms(w.cutAfterMs),
      timing: w.timing,
      confidence: Math.round(w.confidence * 1000) / 1000,
      heard: w.heard,
      // Only on flagged words:  JSON leaves out undefined.
      flag: wordFlag(w),
      inClip: inClip(w),
    }),
  );
  return JSON.stringify(header, null, 2).replace(
    '"@@WORDS@@"',
    wordLines.length ? `[\n    ${wordLines.join(",\n    ")}\n  ]` : "[]",
  );
}

/** A file name for the saved transcript:  the sound file's name, with `.transcript.json`. */
export function transcriptFileName(source: string): string {
  const name = decodeURIComponent(source.split("/").pop() ?? "sound") || "sound";
  return name.replace(/\.[^.]*$/, "") + ".transcript.json";
}
