import {
  checkStepRange,
  checkTermGroups,
  FourierComponent,
  parseTermGroups,
} from "../src/slide-components/fourier.ts";

// MARK: Ideas for later
//
// This panel explains Term Groups and Step and checks them as you type.  Later
// it could offer statistics and one-click ways to fill both fields.  The
// existing Fourier videos already do all of these by hand; here is everywhere
// they do more than write out an array literal, or measure something.  Nothing
// below is implemented yet.
//
// Building the list of terms (what Term Groups describes):
//
// * src/sierpiński.ts, "fourier again more artistically" (part6):  counts how
//   often each frequency appears across five shapes' terms, with the total and
//   each amplitude (frequencyCounter), sorts by total amplitude, then adds the 7
//   most important common frequencies one at a time, then up to 600 other terms
//   in one step, then the next 4 common frequencies one at a time, in reverse.
//   The only place the order isn't simply largest first.  A one-click "common
//   frequencies first", given several sources.
// * src/peano-fourier/peano-fourier.ts:  one term at a time up to 21, then
//   steps of 2, 4, 10 and 25, then everything (1022).  Repeated counts
//   (22, 22 and 1022, 1022) are deliberate pauses, i.e. empty groups.  A
//   one-click "accelerating chunks".
// * src/sierpiński.ts, part5 ("fourier of 5 2nd generation triangles"):  one
//   at a time to 20, then by 50s to 300 and 100s to 600.  "6 levels at once":
//   one at a time to 20, then by 2s, 5s, 25s, 100s and 1000s, to 4000.  Same
//   pattern.
// * src/peano-fourier/fourier-intro.ts:  three copies side by side, each
//   starting where the last one stopped ([2…12], [12…50], [50…1000]).  The
//   start of one is the end of another, and the Step schedule starts at 1 so
//   the first group is there from the start.
//
// Building the Step schedule (time → step):
//
// * src/peano-fourier/fourier-shared.ts, createFourierAnimation():  the
//   standard timing.  4000 ms per step, 500 ms pause between steps, none before
//   the first, 500 ms after the last.  Used by fourier-intro and peano-fourier.
// * src/sierpiński.ts, "6 levels at once" (fourierSchedule):  -1 (hidden) until
//   a start time, then 3500 ms per step and 500 ms pauses, with a disabled
//   special case that stops halfway through one step for 5 seconds.
// * src/sierpiński.ts, part5 and part6:  no pauses.  The step is
//   steps × time / duration, through easeIn() first in part5 so it speeds up,
//   and progress within each step goes through ease()
//   (scaleProgressWithinSegment).
// * src/some5/some5.ts, FourierStar and "Try New Items":  loops forever.
//   durationKeyframes() with relative durations 0.4, 0.35 and 0.25 over a 9 s
//   period of globalTime.
//
// Measurements worth showing:
//
// * fourier-shared.ts, getAnimationRules():  how detailed each step's path
//   is (8 × min(highest |frequency| so far, 110) + 7 segments), and how wide its
//   transition is (0.2 / |frequency| of the step's first new term).  Show the
//   highest frequency each group adds.
// * fourier-shared.ts, keepNonZeroTerms():  drops terms smaller than 1/10⁷ of
//   the total amplitude.  That's why a source has fewer terms than samples.
// * src/sierpiński.ts part6, the commented-out console.table():  for each
//   section, how many terms and their total amplitude.  Show that per group,
//   and how much of the total amplitude each step has reached.
// * src/sierpiński.ts part6, frequencyCounter:  which frequencies several
//   sources share, and how much of each.
// * fourier-shared.ts, cacheHealth (philDebug.cacheHealth):  hits and misses of
//   the per-t cache in termsToParametricFunction().
// * fourier-shared.ts, hasFixedContribution():  finds the frequency 0 term,
//   the center.  checkTermGroups() already warns when it's somewhere it can't
//   animate.

export type FourierPanel = {
  readonly element: HTMLElement;
  /** Re-read the fields and redraw the status.  Cheap after the first time. */
  refresh(): void;
};

const HELP =
  "Term Groups says which terms each step adds.  Terms are numbered by size, 0 the largest.  " +
  "Separate numbers with spaces and groups with commas; 5-9 means 5 6 7 8 9.  " +
  "Step 1 adds the first group, step 2 the second, and so on.  Terms are only ever added.  " +
  "Step:  0 is a single dot, the number of groups is the finished curve, fractions animate " +
  "between steps, and a negative value hides it.";

/**
 * The "Fourier" panel at the top of the schedule editor when a
 * {@link FourierComponent} is selected:  how Term Groups and Step work, and
 * whether the current values make sense.  Refreshed on every keystroke.
 */
export function buildFourierPanel(component: FourierComponent): FourierPanel {
  const panel = document.createElement("fieldset");
  panel.style.cssText = "border-color:#6a7fae;margin-bottom:0.4em";
  const legend = document.createElement("legend");
  legend.textContent = "Fourier";
  const help = document.createElement("div");
  help.style.cssText = "font-size:0.85em;color:#555;line-height:1.35";
  help.textContent = HELP;
  const status = document.createElement("div");
  status.style.cssText = "margin-top:0.4em;font-size:0.9em;line-height:1.4";
  panel.append(legend, help, status);

  function line(text: string, color = ""): void {
    const div = document.createElement("div");
    div.textContent = text;
    if (color) div.style.color = color;
    status.append(div);
  }

  function refresh(): void {
    status.replaceChildren();
    const keyframes = component.termGroupsSchedule.schedule;
    const groupCounts = new Set<number>();
    for (const keyframe of keyframes) {
      // Each Term Groups keyframe is checked against the source in effect then.
      const prefix = keyframes.length > 1 ? `At ${keyframe.time} ms:  ` : "";
      const parsed = parseTermGroups(keyframe.value);
      groupCounts.add(parsed.groups.length);
      const source = component.termsFor(component.sourceSchedule.at(keyframe.time));
      const termCount = parsed.groups.reduce((sum, group) => sum + group.length, 0);
      const problems = [...parsed.warnings];
      let summary = `${parsed.groups.length} group${parsed.groups.length === 1 ? "" : "s"}, ${termCount} term${termCount === 1 ? "" : "s"}`;
      if (typeof source === "string") {
        problems.push(source.replace("\n", " "));
      } else {
        summary += `, of ${source.terms.length} in this source`;
        problems.push(...checkTermGroups(parsed.groups, source.terms));
      }
      const clean = parsed.errors.length === 0 && problems.length === 0;
      line(`${prefix}${summary}${clean ? "  ✓" : ""}`, clean ? "#070" : "");
      for (const error of parsed.errors) line(`✗ ${error}`, "#b00");
      for (const problem of problems) line(`⚠ ${problem}`, "#a06000");
    }
    if (groupCounts.size === 1) {
      const [groupCount] = groupCounts;
      const stepProblems = checkStepRange(component.stepSchedule.schedule, groupCount);
      if (stepProblems.length === 0) {
        line(`Step runs from 0 to ${groupCount}  ✓`, "#070");
      }
      for (const problem of stepProblems) line(`⚠ ${problem}`, "#a06000");
    } else {
      line(
        "Term Groups changes over time, so Step can't be checked against one number of groups.",
        "#555",
      );
    }
  }

  refresh();
  return { element: panel, refresh };
}
