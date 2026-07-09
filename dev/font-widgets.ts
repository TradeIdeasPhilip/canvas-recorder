import { Keyframe } from "../src/interpolate.ts";
import { TraditionalTextComponent } from "../src/slide-components.ts";
import {
  _fetchLocalFonts,
  _findAlternativeFonts,
  _uncoveredGraphemes,
  FontFamilyData,
  formatWeightLabel,
  formatWeightSummary,
  getFontFamilyData,
  localFontStylesMap,
} from "./font-utils.ts";

_fetchLocalFonts();

/**
 * Build the Font Info panel shown at the top of the schedule editor when a
 * {@link TraditionalTextComponent} is selected.  Displays available styles and
 * weights for every family mentioned in the schedule, and warns when a
 * scheduled weight is not available for a given family.
 */
export function buildTraditionalTextPanel(
  component: TraditionalTextComponent,
): HTMLElement {
  const panel = document.createElement("fieldset");
  panel.style.cssText = "border-color:#4488cc;margin-bottom:0.4em";
  const legend = document.createElement("legend");
  legend.textContent = "Font Info";
  panel.append(legend);

  const scheduledFamilies = [
    ...new Set(
      component.fontFamilySchedule.schedule
        .map((kf) => kf.value)
        .filter(Boolean),
    ),
  ];
  const scheduledWeights = [
    ...new Set(component.fontWeightSchedule.schedule.map((kf) => kf.value)),
  ];
  const warnings: string[] = [];
  const allText = component.textSchedule.schedule
    .map((kf) => kf.value)
    .join("");
  const allUncovered = new Set<string>();

  if (scheduledFamilies.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No font family set.";
    panel.append(p);
    return panel;
  }

  for (const family of scheduledFamilies) {
    const block = document.createElement("div");
    block.style.cssText = "margin-bottom:0.4em";

    const nameEl = document.createElement("strong");
    nameEl.textContent = family;
    block.append(nameEl);

    const data: FontFamilyData = getFontFamilyData(family);
    const notFound =
      data.styles.size === 0 &&
      data.discreteWeights.length === 0 &&
      !data.weightRange;

    if (notFound) {
      const localStyles = localFontStylesMap.get(family);
      if (localStyles !== undefined) {
        // Local system font (from queryLocalFonts) — show raw style words,
        // skip weight warning (weights can't be inferred from style strings).
        const stylesEl = document.createElement("div");
        stylesEl.style.cssText = "padding-left:1em";
        stylesEl.textContent = `Styles: ${localStyles}`;
        block.append(stylesEl);
      } else {
        const note = document.createElement("div");
        note.style.cssText = "padding-left:1em;color:#888";
        note.textContent =
          "(not found in loaded fonts — may still render if installed)";
        block.append(note);
      }
    } else {
      const stylesEl = document.createElement("div");
      stylesEl.style.cssText = "padding-left:1em";
      stylesEl.textContent = `Styles: ${[...data.styles].sort().join(", ")}`;
      block.append(stylesEl);

      const weightsEl = document.createElement("div");
      weightsEl.style.cssText = "padding-left:1em";
      weightsEl.textContent = `Weights: ${formatWeightSummary(data)}`;
      block.append(weightsEl);

      // Warn when a scheduled weight is clearly out of range / not in the set.
      for (const w of scheduledWeights) {
        let unavailable = false;
        if (data.weightRange) {
          unavailable = w < data.weightRange.min || w > data.weightRange.max;
        } else if (data.discreteWeights.length) {
          unavailable = !data.discreteWeights.includes(w);
        }
        if (unavailable) {
          warnings.push(
            `Weight ${formatWeightLabel(w)} may not be available for "${family}" (${formatWeightSummary(data)})`,
          );
        }
      }
    }
    const uncovered = _uncoveredGraphemes(family, allText);
    for (const g of uncovered) allUncovered.add(g);
    if (uncovered.length > 0) {
      const coverEl = document.createElement("div");
      coverEl.style.cssText = "padding-left:1em;color:#cc8800";
      coverEl.textContent = `⚠ May use fallback for: ${uncovered.join(" ")}`;
      block.append(coverEl);
    }
    panel.append(block);
  }

  for (const msg of warnings) {
    const warnEl = document.createElement("div");
    warnEl.style.cssText = "color:#cc8800";
    warnEl.textContent = `⚠ ${msg}`;
    panel.append(warnEl);
  }

  if (allUncovered.size > 0) {
    const alts = _findAlternativeFonts([...allUncovered]);
    if (alts.length > 0) {
      const altEl = document.createElement("div");
      altEl.style.cssText = "margin-top:0.4em;color:#666;font-size:0.9em";
      altEl.textContent =
        "Web fonts covering all characters: " + alts.join(", ");
      panel.append(altEl);
    }
  }

  return panel;
}

/**
 * Opens a full-screen font picker dialog.
 *
 * Merges families from the schedule's pre-built `choices` list (document.fonts)
 * with any additional families returned by window.queryLocalFonts() (experimental,
 * permission-gated).  Rows are filtered live as the user types a search string.
 *
 * Clicking a row immediately writes to `strKf.value` and dispatches a bubbling
 * "input" event from `cell` so the schedule editor's Font Info panel refreshes.
 *
 * The initial value (before the dialog opened) is always pinned as the first row
 * so the user can revert by clicking it.  There is no explicit cancel button.
 */
export async function openFontPickerDialog(
  strKf: Keyframe<string>,
  choices: readonly string[],
  cell: HTMLElement,
): Promise<void> {
  const allFamilies = new Set<string>(choices);
  if ("queryLocalFonts" in window) {
    try {
      const localFonts = (await (
        window as unknown as {
          queryLocalFonts: () => Promise<Array<{ family: string }>>;
        }
      ).queryLocalFonts()) as Array<{ family: string }>;
      for (const f of localFonts) allFamilies.add(f.family);
    } catch (e) {
      console.warn("queryLocalFonts():", e);
    }
  }
  const sortedFamilies = [...allFamilies].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );

  const initialFont = strKf.value;
  let currentFont = strKf.value;

  // Cover the right column so the canvas stays fully visible.
  const rightCol = document.getElementById("right-col");
  const rect = rightCol?.getBoundingClientRect();

  const dialog = document.createElement("dialog");
  if (rect) {
    dialog.style.cssText = [
      `position:fixed`,
      `margin:0`,
      `padding:0`,
      `left:${rect.left}px`,
      `top:${rect.top}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      `max-width:none`,
      `max-height:none`,
      `border:none`,
      `border-left:2px solid #999`,
      `display:flex`,
      `flex-direction:column`,
      `box-shadow:-4px 0 16px rgba(0,0,0,0.2)`,
      `z-index:9999`,
      `overflow:hidden`,
    ].join(";");
  } else {
    dialog.style.cssText =
      "width:min(60em,90vw);height:80vh;display:flex;flex-direction:column;padding:0;border:1px solid #999;overflow:hidden;z-index:9999";
  }

  // ── Top controls ────────────────────────────────────────────────────────────
  const controls = document.createElement("div");
  controls.style.cssText =
    "display:flex;gap:0.5em;padding:0.5em;background:#f4f4f4;border-bottom:1px solid #ccc;flex-shrink:0;align-items:center";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search fonts…";
  searchInput.style.cssText = "flex:1;min-width:0";
  const searchLabel = document.createElement("label");
  searchLabel.textContent = "Search: ";
  searchLabel.append(searchInput);

  const sampleInput = document.createElement("input");
  sampleInput.type = "text";
  sampleInput.value = "Clean Simple Design 1234567890";
  sampleInput.style.cssText = "flex:2;min-width:0";
  const sampleLabel = document.createElement("label");
  sampleLabel.textContent = "Sample: ";
  sampleLabel.append(sampleInput);

  controls.append(searchLabel, " ", sampleLabel);

  // ── Font list table ──────────────────────────────────────────────────────────
  const tableContainer = document.createElement("div");
  tableContainer.style.cssText =
    "overflow-y:auto;flex:1;border-bottom:1px solid #ccc";

  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse";
  const tbody = table.createTBody();
  tableContainer.append(table);

  // ── Bottom bar ───────────────────────────────────────────────────────────────
  const bottom = document.createElement("div");
  bottom.style.cssText =
    "padding:0.4em 0.6em;background:#f4f4f4;flex-shrink:0;text-align:right";
  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "OK";
  okBtn.addEventListener("click", () => dialog.close());
  bottom.append(okBtn);

  dialog.append(controls, tableContainer, bottom);
  document.body.append(dialog);

  function pickFont(family: string) {
    currentFont = family;
    strKf.value = family;
    cell.dispatchEvent(new Event("input", { bubbles: true }));
    buildRows();
  }

  function addRow(family: string, sampleText: string, badge?: string) {
    const tr = document.createElement("tr");
    tr.dataset.family = family;
    const isSelected = family === currentFont;
    tr.style.cssText = `cursor:pointer;border-bottom:1px solid #eee;background:${isSelected ? "#bee6ff" : badge ? "#f5f5f5" : ""}`;
    tr.addEventListener("mouseover", () => {
      if (family !== currentFont) tr.style.background = "#e8f4ff";
    });
    tr.addEventListener("mouseout", () => {
      tr.style.background =
        family === currentFont ? "#bee6ff" : badge ? "#f5f5f5" : "";
    });
    tr.addEventListener("click", () => pickFont(family));
    if (isSelected) tr.dataset.selected = "";

    const sampleCell = tr.insertCell();
    sampleCell.style.cssText = "padding:0.25em 0.6em;font-size:1.3em";
    sampleCell.style.fontFamily = family;
    sampleCell.textContent = sampleText;

    const nameCell = tr.insertCell();
    nameCell.style.cssText =
      "padding:0.25em 0.6em;font-size:0.85em;white-space:nowrap;color:#444";
    nameCell.textContent = family;
    if (badge) {
      const b = document.createElement("span");
      b.style.cssText = "margin-left:0.4em;color:#999;font-size:0.8em";
      b.textContent = badge;
      nameCell.append(b);
    }

    tbody.append(tr);
  }

  function buildRows() {
    const sampleText = sampleInput.value || "ABC def 0123456789";
    const terms = searchInput.value
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const matched =
      terms.length === 0
        ? sortedFamilies
        : sortedFamilies.filter((f) =>
            terms.every((t) => f.toLowerCase().includes(t)),
          );

    tbody.replaceChildren();

    // Row 0: initial (pinned)
    addRow(initialFont, sampleText, "(initial)");

    // Row 1: current selection if not initial and not in search results
    if (currentFont !== initialFont && !matched.includes(currentFont)) {
      addRow(currentFont, sampleText, "(current)");
    }

    for (const family of matched) {
      addRow(family, sampleText);
    }

    tbody
      .querySelector<HTMLTableRowElement>("[data-selected]")
      ?.scrollIntoView({
        block: "nearest",
      });
  }

  searchInput.addEventListener("input", buildRows);
  sampleInput.addEventListener("input", buildRows);

  dialog.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const rows = [...tbody.rows];
    const selectedIndex = rows.findIndex((r) => "selected" in r.dataset);
    const next = rows[selectedIndex + (e.key === "ArrowDown" ? 1 : -1)];
    if (next?.dataset.family) pickFont(next.dataset.family);
  });

  // Escape closes the non-modal dialog (showModal() handles this automatically;
  // show() does not, so we wire it up manually).
  function onEscape(e: KeyboardEvent) {
    if (e.key === "Escape") dialog.close();
  }
  document.addEventListener("keydown", onEscape);

  buildRows();
  dialog.showModal();
  searchInput.focus();

  dialog.addEventListener("close", () => {
    document.removeEventListener("keydown", onEscape);
    dialog.remove();
  });
}
