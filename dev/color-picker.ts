import { myRainbow, myRainbowInfo } from "../src/glib/my-rainbow.ts";
import {
  addToRecentColors,
  fmtHex,
  fmtHsl,
  fmtHwb,
  fmtRgb,
  hslToRgb,
  hwbToRgb,
  parseCssColorToRgba,
  recentColors,
  RGBA,
  rgbToHsl,
  rgbToHwb,
  setSwatchColor,
} from "./color-utils.ts";

async function openColorPickerDialog(
  colorRef: { value: string },
  cell: HTMLElement,
): Promise<void> {
  const initialCss = colorRef.value;
  const initialRgba: RGBA = parseCssColorToRgba(initialCss) ?? {
    r: 128,
    g: 128,
    b: 128,
    a: 1,
  };
  let currentRgba: RGBA = { ...initialRgba };

  const rightCol = document.getElementById("right-col");
  const rcRect = rightCol?.getBoundingClientRect();
  const dialog = document.createElement("dialog");
  if (rcRect) {
    dialog.style.cssText = [
      `position:fixed`,
      `margin:0`,
      `padding:0`,
      `left:${rcRect.left}px`,
      `top:${rcRect.top}px`,
      `width:${rcRect.width}px`,
      `height:${rcRect.height}px`,
      `max-width:none`,
      `max-height:none`,
      `border:none`,
      `border-left:2px solid #999`,
      `display:flex`,
      `flex-direction:column`,
      `box-shadow:-4px 0 16px rgba(0,0,0,0.2)`,
      `z-index:9999`,
      `overflow:hidden`,
      `background:#fff`,
    ].join(";");
  } else {
    dialog.style.cssText =
      "width:30em;max-height:80vh;display:flex;flex-direction:column;padding:0;overflow:hidden;z-index:9999;background:#fff";
  }

  // ── Swatch + display ────────────────────────────────────────────────────────
  const swatchRow = document.createElement("div");
  swatchRow.style.cssText =
    "display:flex;align-items:stretch;flex-shrink:0;border-bottom:1px solid #ddd";

  const swatchEl = document.createElement("div");
  swatchEl.style.cssText = "width:5em;flex-shrink:0";

  const displayDiv = document.createElement("div");
  displayDiv.style.cssText =
    "flex:1;padding:0.3em 0.6em;font-size:0.82em;font-family:monospace;" +
    "display:flex;flex-direction:column;justify-content:center;gap:0.1em;background:#f8f8f8";

  const hexDisplay = document.createElement("span");
  const rgbDisplay = document.createElement("span");
  displayDiv.append(hexDisplay, rgbDisplay);
  swatchRow.append(swatchEl, displayDiv);

  // ── Tab bar ─────────────────────────────────────────────────────────────────
  const tabBar = document.createElement("div");
  tabBar.style.cssText =
    "display:flex;flex-wrap:wrap;background:#eee;border-bottom:1px solid #ccc;flex-shrink:0";

  // ── Tab content ─────────────────────────────────────────────────────────────
  const tabContent = document.createElement("div");
  tabContent.style.cssText = "flex:1;overflow-y:auto;padding:0.6em";

  // ── Bottom bar ──────────────────────────────────────────────────────────────
  const bottomBar = document.createElement("div");
  bottomBar.style.cssText =
    "display:flex;justify-content:space-between;padding:0.4em 0.6em;" +
    "background:#f4f4f4;flex-shrink:0;border-top:1px solid #ccc";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "OK";
  bottomBar.append(cancelBtn, okBtn);

  dialog.append(swatchRow, tabBar, tabContent, bottomBar);
  document.body.append(dialog);

  // ── Apply ───────────────────────────────────────────────────────────────────
  function applyColor(rgba: RGBA, css: string) {
    currentRgba = rgba;
    colorRef.value = css;
    cell.dispatchEvent(new Event("input", { bubbles: true }));
    setSwatchColor(swatchEl, css);
    hexDisplay.textContent = fmtHex(rgba.r, rgba.g, rgba.b, rgba.a);
    rgbDisplay.textContent = fmtRgb(rgba.r, rgba.g, rgba.b, rgba.a);
  }

  // Seed display without dispatching
  setSwatchColor(swatchEl, initialCss);
  hexDisplay.textContent = fmtHex(
    initialRgba.r,
    initialRgba.g,
    initialRgba.b,
    initialRgba.a,
  );
  rgbDisplay.textContent = fmtRgb(
    initialRgba.r,
    initialRgba.g,
    initialRgba.b,
    initialRgba.a,
  );

  // ── Slider helper ───────────────────────────────────────────────────────────
  function makeSliderRow(
    label: string,
    min: number,
    max: number,
    initial: number,
    onChange: (v: number) => void,
  ): HTMLElement {
    const row = document.createElement("div");
    row.style.cssText =
      "display:grid;grid-template-columns:5.5em 1fr 3em;align-items:center;" +
      "gap:0.4em;margin-bottom:0.5em";
    const lbl = document.createElement("span");
    lbl.textContent = label;
    lbl.style.cssText = "font-size:0.85em;text-align:right";
    const slider = document.createElement("input");
    slider.name = crypto.randomUUID();
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = "1";
    slider.value = String(Math.round(initial));
    slider.style.width = "100%";
    const valLbl = document.createElement("span");
    valLbl.textContent = String(Math.round(initial));
    valLbl.style.cssText =
      "font-size:0.8em;font-family:monospace;text-align:right";
    slider.addEventListener("input", () => {
      valLbl.textContent = slider.value;
      onChange(slider.valueAsNumber);
    });
    row.append(lbl, slider, valLbl);
    return row;
  }

  // ── Tab builders ────────────────────────────────────────────────────────────
  function buildStringTab(): HTMLElement {
    const div = document.createElement("div");
    const input = document.createElement("input");
    input.type = "text";
    input.value = colorRef.value;
    input.style.cssText =
      "width:100%;box-sizing:border-box;font-family:monospace;font-size:0.9em;margin-bottom:0.4em";
    const status = document.createElement("div");
    status.style.cssText = "font-size:0.85em;margin-bottom:0.4em";
    const preview = document.createElement("div");
    preview.style.cssText =
      "height:2em;border:1px solid #ccc;border-radius:2px";
    function validate() {
      const rgba = parseCssColorToRgba(input.value);
      if (rgba) {
        status.textContent = "✓ Valid";
        status.style.color = "green";
        preview.style.backgroundColor = input.value;
        applyColor(rgba, input.value);
      } else {
        status.textContent = "✗ Invalid color";
        status.style.color = "red";
      }
    }
    input.addEventListener("input", validate);
    validate();
    div.append(input, status, preview);
    return div;
  }

  function buildSwatchGrid(colors: readonly string[]): HTMLElement {
    if (colors.length === 0) {
      const msg = document.createElement("p");
      msg.style.color = "#888";
      msg.textContent = "None yet.";
      return msg;
    }
    const grid = document.createElement("div");
    grid.style.cssText = "display:flex;flex-wrap:wrap;gap:0.35em";
    for (const css of colors) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = css;
      btn.style.cssText =
        "width:2.4em;height:2.4em;border-radius:3px;cursor:pointer;" +
        "border:2px solid transparent;flex-shrink:0";
      btn.style.backgroundColor = css;
      if (css === colorRef.value) btn.style.borderColor = "#333";
      btn.addEventListener("click", () => {
        const rgba = parseCssColorToRgba(css) ?? currentRgba;
        applyColor(rgba, css);
        grid
          .querySelectorAll<HTMLButtonElement>("button")
          .forEach((b) => (b.style.borderColor = "transparent"));
        btn.style.borderColor = "#333";
      });
      grid.append(btn);
    }
    return grid;
  }

  function buildRgbTab(): HTMLElement {
    const div = document.createElement("div");
    let { r, g, b } = currentRgba;
    let ca = Math.round(currentRgba.a * 100);
    const extraDisplay = document.createElement("div");
    extraDisplay.style.cssText =
      "font-family:monospace;font-size:0.8em;color:#555;margin-top:0.4em";
    function update() {
      applyColor({ r, g, b, a: ca / 100 }, fmtRgb(r, g, b, ca / 100));
      extraDisplay.textContent = fmtHex(r, g, b, ca / 100);
    }
    div.append(
      makeSliderRow("Red", 0, 255, r, (v) => {
        r = v;
        update();
      }),
      makeSliderRow("Green", 0, 255, g, (v) => {
        g = v;
        update();
      }),
      makeSliderRow("Blue", 0, 255, b, (v) => {
        b = v;
        update();
      }),
      makeSliderRow("Alpha %", 0, 100, ca, (v) => {
        ca = v;
        update();
      }),
      extraDisplay,
    );
    extraDisplay.textContent = fmtHex(r, g, b, currentRgba.a);
    return div;
  }

  function buildHwbTab(): HTMLElement {
    const div = document.createElement("div");
    let [h, w, bk] = rgbToHwb(currentRgba.r, currentRgba.g, currentRgba.b);
    let ca = Math.round(currentRgba.a * 100);
    const extraDisplay = document.createElement("div");
    extraDisplay.style.cssText =
      "font-family:monospace;font-size:0.8em;color:#555;margin-top:0.4em";
    function update() {
      const [r, g, b] = hwbToRgb(h, w, bk);
      const a = ca / 100;
      applyColor({ r, g, b, a }, fmtHwb(h, w, bk, a));
      extraDisplay.textContent = fmtHex(r, g, b, a) + "  " + fmtRgb(r, g, b, a);
    }
    div.append(
      makeSliderRow("Hue°", 0, 360, h, (v) => {
        h = v;
        update();
      }),
      makeSliderRow("White %", 0, 100, w, (v) => {
        w = v;
        update();
      }),
      makeSliderRow("Black %", 0, 100, bk, (v) => {
        bk = v;
        update();
      }),
      makeSliderRow("Alpha %", 0, 100, ca, (v) => {
        ca = v;
        update();
      }),
      extraDisplay,
    );
    const [r0, g0, b0] = hwbToRgb(h, w, bk);
    extraDisplay.textContent =
      fmtHex(r0, g0, b0, currentRgba.a) +
      "  " +
      fmtRgb(r0, g0, b0, currentRgba.a);
    return div;
  }

  function buildHslTab(): HTMLElement {
    const div = document.createElement("div");
    let [h, s, l] = rgbToHsl(currentRgba.r, currentRgba.g, currentRgba.b);
    let ca = Math.round(currentRgba.a * 100);
    const extraDisplay = document.createElement("div");
    extraDisplay.style.cssText =
      "font-family:monospace;font-size:0.8em;color:#555;margin-top:0.4em";
    function update() {
      const [r, g, b] = hslToRgb(h, s, l);
      const a = ca / 100;
      applyColor({ r, g, b, a }, fmtHsl(h, s, l, a));
      extraDisplay.textContent = fmtHex(r, g, b, a) + "  " + fmtRgb(r, g, b, a);
    }
    div.append(
      makeSliderRow("Hue°", 0, 360, h, (v) => {
        h = v;
        update();
      }),
      makeSliderRow("Sat %", 0, 100, s, (v) => {
        s = v;
        update();
      }),
      makeSliderRow("Light %", 0, 100, l, (v) => {
        l = v;
        update();
      }),
      makeSliderRow("Alpha %", 0, 100, ca, (v) => {
        ca = v;
        update();
      }),
      extraDisplay,
    );
    const [r0, g0, b0] = hslToRgb(h, s, l);
    extraDisplay.textContent =
      fmtHex(r0, g0, b0, currentRgba.a) +
      "  " +
      fmtRgb(r0, g0, b0, currentRgba.a);
    return div;
  }

  function buildRainbowTab(): HTMLElement {
    const container = document.createElement("div");
    container.append(buildSwatchGrid([...myRainbow]));

    const header = document.createElement("p");
    header.style.cssText =
      "margin:0.7em 0 0.4em;font-size:0.82em;color:#444;font-style:italic";
    header.textContent =
      "These colors are all bright and distinct and all look good against a black or white background.";
    container.append(header);

    for (const { name, color, desc } of myRainbowInfo) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:baseline;gap:0.35em;margin-bottom:0.2em;font-size:0.82em";

      const dot = document.createElement("span");
      dot.style.cssText =
        `width:0.85em;height:0.85em;border-radius:2px;` +
        `background:${color};flex-shrink:0;display:inline-block;position:relative;top:0.1em`;

      const nameEl = document.createElement("strong");
      nameEl.style.cssText = "white-space:nowrap";
      nameEl.textContent = name + " —";

      const descEl = document.createElement("span");
      descEl.style.cssText = "color:#555;flex:1;min-width:0";
      descEl.textContent = desc;

      row.append(dot, nameEl, descEl);
      container.append(row);
    }
    return container;
  }

  // ── Tab switching ───────────────────────────────────────────────────────────
  type TabName = "String" | "Recent" | "Rainbow" | "RGB" | "HWB" | "HSL";
  const TAB_BUILDERS: Record<TabName, () => HTMLElement> = {
    String: buildStringTab,
    Recent: buildRecentTab,
    Rainbow: buildRainbowTab,
    RGB: buildRgbTab,
    HWB: buildHwbTab,
    HSL: buildHslTab,
  };

  function buildRecentTab() {
    return buildSwatchGrid(recentColors);
  }

  const tabBtns = new Map<TabName, HTMLButtonElement>();
  for (const name of Object.keys(TAB_BUILDERS) as TabName[]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = name;
    btn.style.cssText =
      "padding:0.3em 0.6em;border:none;background:transparent;cursor:pointer;" +
      "border-bottom:2px solid transparent";
    btn.addEventListener("click", () => showTab(name));
    tabBar.append(btn);
    tabBtns.set(name, btn);
  }

  function showTab(name: TabName) {
    tabContent.replaceChildren(TAB_BUILDERS[name]());
    tabBtns.forEach((btn, n) => {
      btn.style.fontWeight = n === name ? "bold" : "";
      btn.style.borderBottomColor = n === name ? "#333" : "transparent";
    });
  }

  showTab("RGB");

  // ── Close logic ─────────────────────────────────────────────────────────────
  let committed = false;

  okBtn.addEventListener("click", () => {
    committed = true;
    dialog.close();
  });
  cancelBtn.addEventListener("click", () => dialog.close());

  dialog.addEventListener("close", () => {
    addToRecentColors(colorRef.value);
    if (!committed) {
      colorRef.value = initialCss;
      cell.dispatchEvent(new Event("input", { bubbles: true }));
    }
    dialog.remove();
  });

  dialog.showModal();
}

export { openColorPickerDialog };
