import {
  canSplitAt,
  CrossingChoice,
  crossesSplit,
  SoundLength,
} from "../src/slide-components/split-video-clip.ts";
import { VideoClipComponent } from "../src/slide-components/video-clip.ts";

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
