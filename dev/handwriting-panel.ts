import {
  HANDWRITING_DIVISIONS,
  HandwritingDivision,
  HandwritingEffectComponent,
  HandwritingUnit,
  handwritingUnits,
} from "../src/slide-components/handwriting-effect.ts";
import { Keyframe } from "../src/interpolate.ts";
import { MultiTextComponent } from "../src/slide-components/multi-text.ts";
import { isTextEffect } from "../src/slide-components/text-effect.ts";
import { Showable } from "../src/showable.ts";
import { addName } from "./schedule-helpers.ts";

export type HandwritingPanelHooks = {
  /** Where the playhead is, in `owner`'s own time:  what its schedules see. */
  localTimeMs(owner: Showable): number;
  /** Keyframes were added to Progress by a button here.  Save, and rebuild the schedule editor to show them. */
  progressChanged(): void;
};

export type HandwritingPanel = {
  readonly element: HTMLElement;
  /** Lay the parent's text out again at the playhead and redraw the status. */
  refresh(): void;
};

const HELP =
  "Progress says how much of the text to write, counted in Divisions.  " +
  "0 draws nothing, 1 the first unit, 2 the first two, and so on; " +
  "in between, the pen moves through the next unit at a steady speed.  " +
  "Letters are visible characters only:  spaces take no time.  " +
  "Words are split as the layout splits them, and each Text Span starts a new word.  " +
  "Lines end at a \"\\n\", not at word wrap.  Total:  1 is the whole text.";

/** Singular, for "line 3"; plural, for "4 lines". */
const UNIT_NAMES: Record<HandwritingDivision, [string, string]> = {
  Letters: ["letter", "letters"],
  Words: ["word", "words"],
  Lines: ["line", "lines"],
  Spans: ["span", "spans"],
  Total: ["text", "text"],
};

/** Only for measuring:  the layout draws error messages on it, which no one sees. */
const scratchContext = document.createElement("canvas").getContext("2d")!;

function formatNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

/**
 * The "Handwriting" panel at the top of the schedule editor when a
 * {@link HandwritingEffectComponent} is selected:  how big each kind of unit
 * is in the parent's text, and whether Progress gets to the end.
 *
 * Everything is measured on the text at the playhead.  If the text itself is
 * animated, the counts can be different at other times.
 */
export function buildHandwritingPanel(
  component: HandwritingEffectComponent,
  hooks: HandwritingPanelHooks,
): HandwritingPanel {
  const panel = document.createElement("fieldset");
  panel.style.cssText = "border-color:#6a7fae;margin-bottom:0.4em";
  const legend = document.createElement("legend");
  legend.textContent = "Handwriting";
  const help = document.createElement("div");
  help.style.cssText = "font-size:0.85em;color:#555;line-height:1.35";
  help.textContent = HELP;
  const status = document.createElement("div");
  status.style.cssText = "margin-top:0.4em;font-size:0.9em;line-height:1.4";
  panel.append(legend, help, status);

  function line(text: string, color = ""): HTMLDivElement {
    const div = document.createElement("div");
    div.textContent = text;
    if (color) div.style.color = color;
    status.append(div);
    return div;
  }

  function refresh(): void {
    status.replaceChildren();
    const parent = (component as Showable).parent;
    if (!(parent instanceof MultiTextComponent)) {
      line(
        "⚠ This only works as a direct child of a Multi Text.  Anywhere else it draws an error message.",
        "#b00",
      );
      return;
    }
    const effectCount = parent.children.filter(({ child }) =>
      isTextEffect(child),
    ).length;
    if (effectCount > 1) {
      line(
        `⚠ This Multi Text has ${effectCount} text effects.  Only one is allowed, so none of them are used.`,
        "#b00",
      );
    }

    // Formats inherited from an outer Multi Text aren't visible from here, so
    // spans that use them are missing from these counts.
    const timeInMs = hooks.localTimeMs(parent);
    const placed = parent.layoutAt({
      context: scratchContext,
      timeInMs,
      globalTime: 0,
      playSpeed: 0,
      quality: "Low Power",
    });
    const letters = MultiTextComponent.effectLetters(placed);
    const words = placed.laidOut.words;
    const division = component.divisions;
    const allUnits = new Map(
      HANDWRITING_DIVISIONS.map((d) => [d, handwritingUnits(letters, d)]),
    );
    const units = allUnits.get(division)!;
    const count = units.length;
    const [singular, plural] = UNIT_NAMES[division];

    // The counts, with the one in use in bold.
    const counts = line(`At the playhead (${formatNumber(timeInMs)} ms):  `);
    HANDWRITING_DIVISIONS.forEach((d, index) => {
      if (index > 0) counts.append(" · ");
      const span = document.createElement("span");
      span.textContent = `${d} ${allUnits.get(d)!.length}`;
      if (d === division) span.style.fontWeight = "bold";
      counts.append(span);
    });

    if (count == 0) {
      line("⚠ There's no visible text to write at the playhead.", "#a06000");
      return;
    }

    const now = component.progressSchedule.at(timeInMs);
    line(
      division === "Total"
        ? `Progress here:  ${formatNumber(now)} of 1.`
        : `Progress here:  ${formatNumber(now)} of ${count} ${count == 1 ? singular : plural}.`,
    );

    const peak = Math.max(
      ...component.progressSchedule.schedule.map(({ value }) => value),
    );
    if (peak < count) {
      const goal =
        division === "Total"
          ? "1"
          : `${count}, the number of ${plural}`;
      line(
        `⚠ Progress never reaches ${goal}, so the text is never finished.  ` +
          `It peaks at ${formatNumber(peak)}, ${whereThePenIs(units, peak, division, words)}.`,
        "#a06000",
      );
      const fillBtn = document.createElement("button");
      fillBtn.type = "button";
      fillBtn.textContent = "Fill in the rest…";
      fillBtn.title =
        division === "Total"
          ? "Add keyframes after the last one, until Progress reaches 1."
          : `Add keyframes after the last one, one ${singular} at a time, until Progress reaches ${count}.`;
      fillBtn.style.marginTop = "0.2em";
      fillBtn.addEventListener("click", async () => {
        const added = await askToFillIn(component, count, division);
        if (added) hooks.progressChanged();
      });
      status.append(fillBtn);
    } else {
      line(`Progress reaches ${formatNumber(count)}, the end of the text  ✓`, "#070");
      if (peak > count) {
        line(
          `It goes up to ${formatNumber(peak)}.  Anything from ${count} up shows the finished text.`,
          "#555",
        );
      }
    }
  }

  refresh();
  return { element: panel, refresh };
}

/**
 * Describe where the pen is when Progress is `value`, for a warning.
 * @param value Less than the number of units.
 */
function whereThePenIs(
  units: readonly HandwritingUnit[],
  value: number,
  division: HandwritingDivision,
  words: readonly { readonly wordInfo: { readonly text: string } }[],
): string {
  if (value <= 0) {
    return "where nothing is drawn";
  }
  const [singular] = UNIT_NAMES[division];
  const wordText = (wordIndex: number) =>
    `“${words[wordIndex].wordInfo.text.trim()}”`;
  const complete = Math.floor(value);
  const fraction = value - complete;
  if (fraction == 0) {
    const last = units[complete - 1].letters.at(-1)!.letter;
    return `at the end of ${singular} ${complete}, after ${wordText(last.wordIndex)}`;
  }
  // The same rule handwritingPaths() uses to decide which letters are reached.
  const unit = units[complete];
  const cut = fraction * unit.length;
  const reached = unit.letters.filter(
    ({ start }) => start < cut || unit.length == 0,
  );
  const last = reached.at(-1)!.letter;
  const where =
    division === "Total" ? "" : `partway through ${singular} ${complete + 1}, `;
  return `where the pen is ${where}in ${wordText(last.wordIndex)}`;
}

// MARK: Fill in the rest

/** The dialog's last answers, so a second use starts where the first left off.  Until a reload. */
let lastTransitionMs = 500;
let lastHoldMs = 1000;

/**
 * The keyframes that take Progress from where its schedule ends up to
 * `count`, one whole number at a time:  a transition up to each whole number,
 * then a hold.
 *
 * Every whole number gets two keyframes, the arrival and the end of the hold,
 * the last one included.  If the schedule ends by arriving at a whole number,
 * that number's hold comes first.
 *
 * Each new transition copies the easing of the last transition already in the
 * schedule.  That easing belongs to the keyframe where a transition starts, so
 * {@link FillIn.lastEase} says what to give the existing last keyframe.
 */
export function fillInKeyframes(
  schedule: readonly Keyframe<number>[],
  count: number,
  transitionMs: number,
  holdMs: number,
): FillIn {
  const sorted = [...schedule].sort((a, b) => a.time - b.time);
  const last = sorted.at(-1)!;
  const beforeLast = sorted.at(-2);
  let ease: Keyframe<number>["easeAfter"];
  for (let i = sorted.length - 2; i >= 0; i--) {
    if (sorted[i + 1].value > sorted[i].value) {
      ease = sorted[i].easeAfter;
      break;
    }
  }
  /** A keyframe where a transition starts, if `startsTransition`. */
  const keyframe = (
    time: number,
    value: number,
    startsTransition: boolean,
  ): Keyframe<number> =>
    startsTransition && ease ? { time, value, easeAfter: ease } : { time, value };
  const added: Keyframe<number>[] = [];
  let time = last.time;
  let lastEase = ease;
  if (Number.isInteger(last.value) && beforeLast?.value !== last.value) {
    time += holdMs;
    added.push(keyframe(time, last.value, true));
    // The existing last keyframe now starts a hold, where easing does nothing.
    lastEase = last.easeAfter;
  }
  for (let value = Math.floor(last.value) + 1; value <= count; value++) {
    time += transitionMs;
    added.push(keyframe(time, value, false));
    time += holdMs;
    added.push(keyframe(time, value, value < count));
  }
  return { added, lastEase };
}

export type FillIn = {
  /** New keyframes, in order, all after the existing last one. */
  readonly added: readonly Keyframe<number>[];
  /** The `easeAfter` the existing last keyframe should have. */
  readonly lastEase: Keyframe<number>["easeAfter"];
};

/**
 * Ask for the transition and hold times, then add the keyframes
 * {@link fillInKeyframes} describes to Progress.
 * @returns True if keyframes were added, false if the user cancelled.
 */
function askToFillIn(
  component: HandwritingEffectComponent,
  count: number,
  division: HandwritingDivision,
): Promise<boolean> {
  const schedule = component.progressSchedule.schedule;
  const [singular] = UNIT_NAMES[division];
  const startValue = [...schedule].sort((a, b) => a.time - b.time).at(-1)!
    .value;

  const dialog = document.createElement("dialog");
  dialog.style.cssText = "min-width:26em;max-width:36em;padding:1em";
  const heading = document.createElement("h3");
  heading.style.margin = "0 0 0.4em 0";
  heading.textContent = "Fill in the rest";
  const hint = document.createElement("div");
  hint.style.cssText = "margin-bottom:0.8em;font-size:0.85em;color:#555;font-style:italic";
  hint.textContent =
    `Progress ends at ${formatNumber(startValue)}.  ` +
    (division === "Total"
      ? "Add keyframes after the last one, until it reaches 1."
      : `Add keyframes after the last one, one ${singular} at a time, until it reaches ${count}.`) +
    "  Each whole number gets two keyframes:  one when it arrives, and one when its hold ends.";

  function numberRow(text: string, initial: number, title: string) {
    const row = document.createElement("label");
    row.style.cssText = "display:block;margin-bottom:0.4em";
    row.title = title;
    const input = addName(document.createElement("input"));
    input.type = "number";
    input.min = "0";
    input.step = "any";
    input.style.width = "7em";
    input.value = String(initial);
    row.append(`${text} `, input, " ms");
    return { row, input };
  }
  const transition = numberRow(
    "Transition",
    lastTransitionMs,
    `How long it takes to write each ${singular}.`,
  );
  const hold = numberRow(
    "Hold",
    lastHoldMs,
    `How long to wait after each ${singular} is finished.`,
  );

  const preview = document.createElement("div");
  preview.style.cssText = "font-size:0.85em;line-height:1.4;margin:0.4em 0 1em";

  const buttons = document.createElement("div");
  buttons.style.cssText = "display:flex;gap:0.5em;justify-content:flex-end";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "Add keyframes";
  buttons.append(cancelBtn, okBtn);
  dialog.append(heading, hint, transition.row, hold.row, preview, buttons);

  /** The new keyframes for what's typed now, or undefined if it isn't valid. */
  function plan(): FillIn | undefined {
    const transitionMs = transition.input.valueAsNumber;
    const holdMs = hold.input.valueAsNumber;
    if (!(transitionMs >= 0) || !(holdMs >= 0)) return undefined;
    return fillInKeyframes(schedule, count, transitionMs, holdMs);
  }
  function draw(): void {
    const result = plan();
    okBtn.disabled = !result;
    if (!result) {
      preview.textContent = "Times must be numbers, 0 or more.";
      preview.style.color = "#a06000";
      return;
    }
    const { added } = result;
    preview.style.color = "";
    preview.textContent = `Adds ${added.length} keyframes, from ${formatNumber(added[0].time)} ms to ${formatNumber(added.at(-1)!.time)} ms.`;
  }
  transition.input.addEventListener("input", draw);
  hold.input.addEventListener("input", draw);
  draw();

  let applied = false;
  okBtn.addEventListener("click", () => {
    const result = plan();
    if (!result) return;
    lastTransitionMs = transition.input.valueAsNumber;
    lastHoldMs = hold.input.valueAsNumber;
    const sorted = [...schedule].sort((a, b) => a.time - b.time);
    const last = sorted.at(-1)!;
    if (result.lastEase) {
      last.easeAfter = result.lastEase;
    } else {
      delete last.easeAfter;
    }
    // Sorted first, so the new keyframes, which all come later, can simply go on the end.
    schedule.splice(0, schedule.length, ...sorted, ...result.added);
    applied = true;
    dialog.close();
  });
  cancelBtn.addEventListener("click", () => dialog.close());

  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(applied);
    });
    document.body.append(dialog);
    dialog.showModal();
    okBtn.focus();
  });
}
