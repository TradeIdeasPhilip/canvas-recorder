import {
  canSplitAt,
  CrossingChoice,
  crossesSplit,
  SoundLength,
} from "../src/slide-components/split-video-clip.ts";
import { VideoClipComponent } from "../src/slide-components/video-clip.ts";
import type { TranscriptWord } from "./transcript-align.ts";

/** Which pieces survive a split.  Keeping just one is how you trim a clip at the playhead. */
export const KEEP_CHOICES = ["both", "first", "second"] as const;
export type KeepChoice = (typeof KEEP_CHOICES)[number];

export type SplitChoice = {
  /** Where to split, in the clip's own time. */
  readonly atMs: number;
  readonly crossing: CrossingChoice;
  readonly keep: KeepChoice;
};

/** Where the last crossing choice is remembered.  Keep is deliberately not remembered:  it can delete things. */
const CROSSING_STORAGE_KEY = "splitDialog.crossing";

function readCrossing(): CrossingChoice {
  try {
    const stored = localStorage.getItem(CROSSING_STORAGE_KEY);
    if (stored === "split" || stored === "first" || stored === "second") {
      return stored;
    }
  } catch {
    // Storage can be unavailable.  Remembering is only a convenience.
  }
  return "split";
}

function writeCrossing(choice: CrossingChoice): void {
  try {
    localStorage.setItem(CROSSING_STORAGE_KEY, choice);
  } catch {
    // See readCrossing().
  }
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(3)} s`;
}

/**
 * Ask how to split `clip`.  Starts at `atMs`, normally the playhead.
 *
 * @returns The choices, or undefined if the user cancelled.
 */
export function askHowToSplit(options: {
  clip: VideoClipComponent;
  atMs: number;
  lengthOf: SoundLength;
}): Promise<SplitChoice | undefined> {
  const { clip, lengthOf } = options;

  const dialog = document.createElement("dialog");
  dialog.style.cssText = "min-width:30em;max-width:40em;padding:1em";

  const heading = document.createElement("h3");
  heading.style.margin = "0 0 0.2em 0";
  heading.textContent = "✂ Split Video Clip";
  const hint = document.createElement("div");
  hint.style.cssText =
    "margin-bottom:0.8em;font-size:0.85em;color:#555;font-style:italic";
  hint.textContent =
    `"${clip.userEditableDescription ?? clip.description}" is ${seconds(clip.duration)} long.  ` +
    "Right after a split, with both pieces kept, nothing looks or sounds different.";

  // MARK: Where
  const whereRow = document.createElement("label");
  whereRow.style.cssText = "display:block;margin-bottom:0.2em";
  whereRow.append("Split at ");
  const atInput = document.createElement("input");
  atInput.type = "number";
  atInput.step = "1";
  atInput.style.width = "8em";
  atInput.value = String(Math.round(options.atMs * 1000) / 1000);
  whereRow.append(atInput, " ms into this clip (the playhead)");
  const whereNote = document.createElement("div");
  whereNote.style.cssText = "font-size:0.85em;color:#555;margin-bottom:0.6em";

  // MARK: Choices
  function radioGroup<T extends string>(
    legendText: string,
    name: string,
    choices: readonly { value: T; label: string; title: string }[],
    initial: T,
  ) {
    const fieldset = document.createElement("fieldset");
    fieldset.style.cssText = "margin:0 0 0.6em 0";
    const legend = document.createElement("legend");
    legend.textContent = legendText;
    fieldset.append(legend);
    const inputs = choices.map(({ value, label, title }) => {
      const wrapper = document.createElement("label");
      wrapper.style.cssText = "margin-right:1em;white-space:nowrap";
      wrapper.title = title;
      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = value;
      input.checked = value === initial;
      wrapper.append(input, " ", label);
      fieldset.append(wrapper);
      return input;
    });
    const note = document.createElement("div");
    note.style.cssText = "font-size:0.85em;color:#555;margin-top:0.3em";
    fieldset.append(note);
    const value = () => (inputs.find((input) => input.checked)?.value ?? initial) as T;
    return { fieldset, inputs, note, value };
  }

  const crossing = radioGroup<CrossingChoice>(
    "Sound clips playing at the split",
    "splitCrossing",
    [
      {
        value: "split",
        label: "Split them",
        title: "Cut each one at the split.  Each piece gets its own half.",
      },
      {
        value: "first",
        label: "Attach to first",
        title: "Keep each one whole, on the first piece.  It plays past that piece's end.",
      },
      {
        value: "second",
        label: "Attach to second",
        title: "Keep each one whole, on the second piece.  It starts before that piece does.",
      },
    ],
    readCrossing(),
  );

  const keep = radioGroup<KeepChoice>(
    "Keep",
    "splitKeep",
    [
      { value: "both", label: "Both pieces", title: "An ordinary split." },
      {
        value: "first",
        label: "First only",
        title: "Trim the end of the clip at the split.  The second piece and its sounds are removed.",
      },
      {
        value: "second",
        label: "Second only",
        title: "Trim the start of the clip at the split.  The first piece and its sounds are removed.",
      },
    ],
    "both",
  );

  const preview = document.createElement("div");
  preview.style.cssText = "font-size:0.85em;line-height:1.4;margin-bottom:1em";

  const buttons = document.createElement("div");
  buttons.style.cssText = "display:flex;gap:0.5em;justify-content:flex-end";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "Split";
  buttons.append(cancelBtn, okBtn);

  dialog.append(
    heading,
    hint,
    whereRow,
    whereNote,
    crossing.fieldset,
    keep.fieldset,
    preview,
    buttons,
  );

  // MARK: Behavior
  function draw(): void {
    const atMs = atInput.valueAsNumber;
    const valid = !Number.isNaN(atMs) && canSplitAt(clip, atMs);
    okBtn.disabled = !valid;
    whereNote.textContent = valid
      ? ""
      : `Pick a point strictly inside the clip:  between 0 and ${Math.round(clip.duration)} ms.`;
    whereNote.style.color = valid ? "#555" : "#a06000";

    const crossingCount = valid
      ? clip.soundClips.filter((sound) => crossesSplit(sound, atMs, lengthOf)).length
      : 0;
    for (const input of crossing.inputs) input.disabled = crossingCount === 0;
    crossing.note.textContent =
      crossingCount === 0
        ? "No sound clips cross this point."
        : crossingCount === 1
          ? "1 sound clip crosses this point."
          : `${crossingCount} sound clips cross this point.  This applies to all of them.`;

    if (!valid) {
      preview.textContent = "";
      return;
    }
    const startFile = clip.startMsIntoClipScalar.value;
    const endFile = Math.max(startFile, clip.endMsIntoClipScalar.value);
    const atFile = clip.locationInClip(atMs);
    const kept = keep.value();
    const line = (name: string, from: number, to: number, length: number, gone: boolean) => {
      const div = document.createElement("div");
      div.textContent = `${name}:  ${seconds(length)} long, showing ${seconds(from)}–${seconds(to)} of the file${gone ? "  (removed)" : ""}`;
      if (gone) div.style.cssText = "color:#999;text-decoration:line-through";
      return div;
    };
    preview.replaceChildren(
      line("First", startFile, atFile, atMs, kept === "second"),
      line("Second", atFile, endFile, clip.duration - atMs, kept === "first"),
    );
  }
  atInput.addEventListener("input", draw);
  for (const input of [...crossing.inputs, ...keep.inputs]) {
    input.addEventListener("change", draw);
  }

  let result: SplitChoice | undefined;
  okBtn.addEventListener("click", () => {
    const atMs = atInput.valueAsNumber;
    if (Number.isNaN(atMs) || !canSplitAt(clip, atMs)) return;
    result = { atMs, crossing: crossing.value(), keep: keep.value() };
    writeCrossing(result.crossing);
    dialog.close();
  });
  cancelBtn.addEventListener("click", () => dialog.close());
  draw();

  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(result);
    });
    document.body.append(dialog);
    dialog.showModal();
    okBtn.focus();
  });
}

// MARK: Sound clips

export type SoundSplitChoice = {
  /** Where to split, in ms after the sound clip starts. */
  readonly atMs: number;
  readonly keep: KeepChoice;
};

/** Where "snap to the quiet moment between words" is remembered. */
const SNAP_STORAGE_KEY = "splitDialog.snapToWords";

function readSnap(): boolean {
  try {
    return localStorage.getItem(SNAP_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function writeSnap(snap: boolean): void {
  try {
    localStorage.setItem(SNAP_STORAGE_KEY, String(snap));
  } catch {
    // See readCrossing().
  }
}

/** A transcript word as the dialog shows it:  speech Whisper left out is in [brackets]. */
function quoted(word: TranscriptWord): string {
  return word.timing === "letters" ? `“[${word.text}]”` : `“${word.text}”`;
}

/**
 * Ask how to split a sound clip.  Starts at `atMs`, normally the playhead.
 *
 * With a transcript, the split can snap to the nearest quiet moment between
 * words, and the dialog names the words on each side, so it's easy to tell
 * you're cutting where you meant to.
 *
 * @returns The choices, or undefined if the user cancelled.
 */
export function askHowToSplitSound(options: {
  /** What to call the clip:  its notes, or its file. */
  label: string;
  /** How long the clip plays, or Infinity when its file hasn't been decoded yet. */
  lengthMs: number;
  /** Where to start, in ms after the clip starts. */
  atMs: number;
  /** Where in its file the clip starts. */
  startMsIntoClip: number;
  /** The file's transcript, once it's ready. */
  words?: readonly TranscriptWord[];
}): Promise<SoundSplitChoice | undefined> {
  const { lengthMs, startMsIntoClip, words } = options;

  const dialog = document.createElement("dialog");
  dialog.style.cssText = "min-width:30em;max-width:40em;padding:1em";

  const heading = document.createElement("h3");
  heading.style.margin = "0 0 0.2em 0";
  heading.textContent = "✂ Split Sound Clip";
  const hint = document.createElement("div");
  hint.style.cssText =
    "margin-bottom:0.8em;font-size:0.85em;color:#555;font-style:italic";
  hint.textContent =
    `"${options.label}"` +
    (Number.isFinite(lengthMs) ? ` plays for ${seconds(lengthMs)}.  ` : ".  ") +
    "Right after a split, with both pieces kept, nothing sounds different.";

  // MARK: Where
  const whereRow = document.createElement("label");
  whereRow.style.cssText = "display:block;margin-bottom:0.2em";
  whereRow.append("Split at ");
  const atInput = document.createElement("input");
  atInput.type = "number";
  atInput.step = "1";
  atInput.style.width = "8em";
  atInput.value = String(Math.round(options.atMs * 1000) / 1000);
  whereRow.append(atInput, " ms into this clip (the playhead)");

  const snapRow = document.createElement("label");
  snapRow.style.cssText = "display:block;margin-bottom:0.2em";
  const snapInput = document.createElement("input");
  snapInput.type = "checkbox";
  snapInput.checked = readSnap();
  snapRow.append(snapInput, " Snap to the nearest quiet moment between words");
  snapRow.title =
    "The same places a sound clip's edge snaps to on the timeline.  Needs the transcript.";
  snapRow.hidden = !words?.length;

  const whereNote = document.createElement("div");
  whereNote.style.cssText = "font-size:0.85em;color:#555;margin-bottom:0.6em";

  // MARK: Keep
  const keepFieldset = document.createElement("fieldset");
  keepFieldset.style.cssText = "margin:0 0 0.6em 0";
  const keepLegend = document.createElement("legend");
  keepLegend.textContent = "Keep";
  keepFieldset.append(keepLegend);
  const keepInputs = (
    [
      { value: "both", label: "Both pieces", title: "An ordinary split." },
      {
        value: "first",
        label: "First only",
        title: "Trim the end of the clip at the split.",
      },
      {
        value: "second",
        label: "Second only",
        title: "Trim the start of the clip at the split.",
      },
    ] as const
  ).map(({ value, label, title }) => {
    const wrapper = document.createElement("label");
    wrapper.style.cssText = "margin-right:1em;white-space:nowrap";
    wrapper.title = title;
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "soundSplitKeep";
    input.value = value;
    input.checked = value === "both";
    wrapper.append(input, " ", label);
    keepFieldset.append(wrapper);
    return input;
  });
  const keep = () =>
    (keepInputs.find((input) => input.checked)?.value ?? "both") as KeepChoice;

  const preview = document.createElement("div");
  preview.style.cssText = "font-size:0.85em;line-height:1.4;margin-bottom:1em";

  const buttons = document.createElement("div");
  buttons.style.cssText = "display:flex;gap:0.5em;justify-content:flex-end";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "Split";
  buttons.append(cancelBtn, okBtn);

  dialog.append(heading, hint, whereRow, snapRow, whereNote, keepFieldset, preview, buttons);

  // MARK: Behavior
  const inside = (atMs: number) => atMs > 0 && atMs < lengthMs;

  /** The quiet moment between words nearest `atMs`, inside the clip, or `atMs` itself. */
  function snapped(atMs: number): number {
    if (!snapInput.checked || !words?.length) return atMs;
    let best = atMs;
    let bestDistance = Infinity;
    for (const word of words) {
      for (const cut of [word.cutBeforeMs, word.cutAfterMs]) {
        const candidate = cut - startMsIntoClip;
        const distance = Math.abs(candidate - atMs);
        if (inside(candidate) && distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
    }
    return best;
  }

  /** Where the split is, after snapping, or undefined if it isn't usable. */
  function splitPoint(): number | undefined {
    const typed = atInput.valueAsNumber;
    if (Number.isNaN(typed)) return undefined;
    const atMs = snapped(typed);
    return inside(atMs) ? atMs : undefined;
  }

  /** The words on either side of `atMs`, from the transcript, for the note. */
  function aroundWords(atMs: number): string {
    if (!words?.length) return "";
    const fileMs = startMsIntoClip + atMs;
    const within = words.find((w) => w.startMs < fileMs && fileMs < w.endMs);
    if (within) return `  ⚠ That's in the middle of ${quoted(within)}.`;
    const before = words.findLast((w) => w.endMs <= fileMs);
    const after = words.find((w) => w.startMs >= fileMs);
    if (before && after) return `  Between ${quoted(before)} and ${quoted(after)}.`;
    if (after) return `  Before ${quoted(after)}.`;
    if (before) return `  After ${quoted(before)}.`;
    return "";
  }

  function draw(): void {
    const typed = atInput.valueAsNumber;
    const atMs = splitPoint();
    okBtn.disabled = atMs === undefined;
    if (atMs === undefined) {
      whereNote.textContent = Number.isFinite(lengthMs)
        ? `Pick a point strictly inside the clip:  between 0 and ${Math.round(lengthMs)} ms.`
        : "Pick a point after the start of the clip.";
      whereNote.style.color = "#a06000";
      preview.textContent = "";
      return;
    }
    const moved = Math.abs(atMs - typed) > 0.05;
    whereNote.textContent =
      (moved ? `Snapped to ${Math.round(atMs)} ms.` : "") + aroundWords(atMs);
    whereNote.style.color = whereNote.textContent.includes("⚠") ? "#a06000" : "#555";

    const kept = keep();
    const line = (name: string, from: number, to: number, gone: boolean) => {
      const div = document.createElement("div");
      const length = Number.isFinite(to - from) ? `${seconds(to - from)} long` : "to the end of the file";
      const fileTo = Number.isFinite(to) ? seconds(startMsIntoClip + to) : "the end";
      div.textContent = `${name}:  ${length}, playing ${seconds(startMsIntoClip + from)}–${fileTo} of the file${gone ? "  (removed)" : ""}`;
      if (gone) div.style.cssText = "color:#999;text-decoration:line-through";
      return div;
    };
    preview.replaceChildren(
      line("First", 0, atMs, kept === "second"),
      line("Second", atMs, lengthMs, kept === "first"),
    );
  }
  atInput.addEventListener("input", draw);
  snapInput.addEventListener("input", draw);
  for (const input of keepInputs) input.addEventListener("input", draw);

  let result: SoundSplitChoice | undefined;
  okBtn.addEventListener("click", () => {
    const atMs = splitPoint();
    if (atMs === undefined) return;
    result = { atMs, keep: keep() };
    if (words?.length) writeSnap(snapInput.checked);
    dialog.close();
  });
  cancelBtn.addEventListener("click", () => dialog.close());
  draw();

  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(result);
    });
    document.body.append(dialog);
    dialog.showModal();
    okBtn.focus();
  });
}
