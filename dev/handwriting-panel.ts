import {
  HANDWRITING_DIVISIONS,
  HandwritingDivision,
  HandwritingEffectComponent,
  HandwritingUnit,
  handwritingUnits,
} from "../src/slide-components/handwriting-effect.ts";
import { MultiTextComponent } from "../src/slide-components/multi-text.ts";
import { isTextEffect } from "../src/slide-components/text-effect.ts";
import { Showable } from "../src/showable.ts";

export type HandwritingPanelHooks = {
  /** Where the playhead is, in `owner`'s own time:  what its schedules see. */
  localTimeMs(owner: Showable): number;
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
