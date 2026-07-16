import { ease, easeIn, easeOut } from "../src/interpolate.ts";
import { easeName } from "../src/snapshot.ts";
import { ScalarInfo, ScheduleInfo, Showable } from "../src/showable.ts";
import { openColorPickerDialog } from "./color-picker.ts";
import { setSwatchColor } from "./color-utils.ts";

/** Assigns a random name to unnamed form elements to suppress Chrome warnings. */
export function addName<T extends { name: string }>(element: T): T {
  element.name = crypto.randomUUID();
  return element;
}

export function buildNumericInput(
  value: number,
  onChange: (n: number) => void,
): HTMLInputElement {
  const input = addName(document.createElement("input"));
  input.type = "number";
  input.value = String(value);
  input.step = "0.1";
  input.style.width = "5em";
  input.addEventListener("input", () => {
    if (!isNaN(input.valueAsNumber)) onChange(input.valueAsNumber);
  });
  return input;
}

export function buildEaseSelect(keyframe: {
  easeAfter?: (t: number) => number;
}): HTMLSelectElement {
  const select = addName(document.createElement("select"));
  for (const label of ["linear", "ease", "easeIn", "easeOut", "hold"]) {
    const opt = document.createElement("option");
    opt.value = opt.textContent = label;
    select.append(opt);
  }
  const fn = keyframe.easeAfter;
  select.value = !fn
    ? "linear"
    : fn === ease
      ? "ease"
      : fn === easeIn
        ? "easeIn"
        : fn === easeOut
          ? "easeOut"
          : "hold";
  select.addEventListener("change", () => {
    switch (select.value) {
      case "linear":
        keyframe.easeAfter = undefined;
        break;
      case "ease":
        keyframe.easeAfter = ease;
        break;
      case "easeIn":
        keyframe.easeAfter = easeIn;
        break;
      case "easeOut":
        keyframe.easeAfter = easeOut;
        break;
      case "hold":
        keyframe.easeAfter = (t) => (t < 1 ? 0 : 1);
        break;
    }
  });
  return select;
}

export function scheduleToTypeScript(
  info: ScheduleInfo,
  showableDescription: string,
): string {
  function easeSuffix(fn: ((t: number) => number) | undefined): string {
    const name = easeName(fn);
    if (!name) return "";
    if (name === "hold") return ", easeAfter: (t) => (t < 1 ? 0 : 1)";
    return `, easeAfter: ${name}`;
  }

  function formatValue(value: unknown): string {
    if (
      info.type === "color" ||
      info.type === "string" ||
      info.type === "select"
    ) {
      return JSON.stringify(value as string);
    } else if (info.type === "number") {
      return String(value as number);
    } else if (info.type === "point") {
      const v = value as { x: number; y: number };
      return `{ x: ${v.x}, y: ${v.y} }`;
    } else {
      const v = value as { x: number; y: number; width: number; height: number };
      return `{ x: ${v.x}, y: ${v.y}, width: ${v.width}, height: ${v.height} }`;
    }
  }

  const rows = info.schedule.map(
    (kf) =>
      `  { time: ${kf.time}, value: ${formatValue(kf.value)}${easeSuffix(kf.easeAfter)} },`,
  );
  const header = [
    `// Showable.description: ${JSON.stringify(showableDescription)}`,
    `// Schedule name: ${JSON.stringify(info.description)}`,
  ].join("\n");
  return `${header}\n[\n${rows.join("\n")}\n]`;
}

export function easeFromName(
  name: string | undefined,
): ((t: number) => number) | undefined {
  if (name === "ease") return ease;
  if (name === "easeIn") return easeIn;
  if (name === "easeOut") return easeOut;
  if (name === "hold") return (t: number) => (t < 1 ? 0 : 1);
  return undefined;
}

export function validateKfValue(
  value: unknown,
  type: ScheduleInfo["type"],
): boolean {
  switch (type) {
    case "number":
      return typeof value === "number";
    case "color":
    case "string":
    case "select":
      return typeof value === "string";
    case "point": {
      if (typeof value !== "object" || value === null) return false;
      const v = value as Record<string, unknown>;
      return typeof v.x === "number" && typeof v.y === "number";
    }
    case "rectangle": {
      if (typeof value !== "object" || value === null) return false;
      const v = value as Record<string, unknown>;
      return (
        typeof v.x === "number" &&
        typeof v.y === "number" &&
        typeof v.width === "number" &&
        typeof v.height === "number"
      );
    }
    case "arrow": {
      if (typeof value !== "object" || value === null) return false;
      const v = value as Record<string, unknown>;
      const isPoint = (p: unknown): boolean =>
        typeof p === "object" && p !== null && typeof (p as Record<string, unknown>).x === "number" && typeof (p as Record<string, unknown>).y === "number";
      return isPoint(v.flat) && isPoint(v.pointy);
    }
  }
}

/** Parse the "JSON with comments" produced by {@link scheduleToTypeScript}. */
export function parseScheduleFromClipboard(
  text: string,
  type: ScheduleInfo["type"],
):
  | { time: number; value: unknown; easeAfter?: (t: number) => number }[]
  | null {
  try {
    let cleaned = text
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    // hold arrow function → quoted string before other replacements touch it
    cleaned = cleaned.replace(
      /easeAfter\s*:\s*\(t\)\s*=>\s*\(t\s*<\s*1\s*\?\s*0\s*:\s*1\)/g,
      '"easeAfter":"hold"',
    );
    // bare easeAfter identifier → quoted string
    cleaned = cleaned.replace(
      /easeAfter\s*:\s*(ease(?:In|Out)?)/g,
      '"easeAfter":"$1"',
    );
    // quote any remaining unquoted object keys
    cleaned = cleaned.replace(
      /\b(time|value|easeAfter|x|y|width|height)\s*:/g,
      '"$1":',
    );
    // remove trailing commas before } or ]
    cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");
    const parsed: unknown = JSON.parse(cleaned);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const result: {
      time: number;
      value: unknown;
      easeAfter?: (t: number) => number;
    }[] = [];
    for (const raw of parsed) {
      if (typeof raw !== "object" || raw === null) return null;
      const r = raw as Record<string, unknown>;
      if (typeof r.time !== "number") return null;
      if (!validateKfValue(r.value, type)) return null;
      const easeStr = r.easeAfter;
      if (easeStr !== undefined && typeof easeStr !== "string") return null;
      const kf: {
        time: number;
        value: unknown;
        easeAfter?: (t: number) => number;
      } = { time: r.time, value: r.value };
      const fn = easeFromName(
        typeof easeStr === "string" ? easeStr : undefined,
      );
      if (fn) kf.easeAfter = fn;
      result.push(kf);
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Build a fieldset for a single {@link ScalarInfo} property.
 *
 * @param onUpdate - Called after any value change so the caller can notify the
 *   visual canvas overlay (e.g. `activeRootComponentEditor?.update(s, i)`).
 */
export function buildScalarSection(
  info: ScalarInfo,
  selectable: Showable,
  onUpdate?: (s: Showable, i: ScalarInfo | ScheduleInfo) => void,
): HTMLElement {
  const section = document.createElement("fieldset");
  section.style.cssText = "margin-bottom:0.4em";
  const legend = document.createElement("legend");
  legend.textContent = info.description;
  section.append(legend);

  if (info.type === "string") {
    const input = document.createElement("textarea");
    input.rows = 1;
    input.value = info.value;
    input.style.cssText = "width:100%;box-sizing:border-box;resize:vertical";
    input.addEventListener("input", () => {
      info.value = input.value;
    });
    section.append(input);
  } else if (info.type === "color") {
    const swatchBtn = document.createElement("button");
    swatchBtn.type = "button";
    swatchBtn.title = info.value;
    swatchBtn.style.cssText =
      "width:2.5em;height:1.8em;border:1px solid #999;cursor:pointer;border-radius:2px";
    setSwatchColor(swatchBtn, info.value);
    swatchBtn.addEventListener("click", () =>
      openColorPickerDialog(info, section),
    );
    section.addEventListener("input", () => {
      setSwatchColor(swatchBtn, info.value);
      swatchBtn.title = info.value;
    });
    section.append(swatchBtn);
  } else if (info.type === "number") {
    const input = document.createElement("input");
    input.type = "number";
    input.value = String(info.value);
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      if (isFinite(v)) info.value = v;
    });
    section.append(input);
  } else if (info.type === "select") {
    const sel = document.createElement("select");
    for (const choice of info.choices) {
      const opt = document.createElement("option");
      opt.value = opt.textContent = choice;
      if (choice === info.value) opt.selected = true;
      sel.append(opt);
    }
    sel.addEventListener("change", () => {
      info.value = sel.value;
    });
    section.append(sel);
  } else if (info.type === "point") {
    for (const axis of ["x", "y"] as const) {
      const label = document.createElement("label");
      label.textContent = `${axis}: `;
      const input = document.createElement("input");
      input.type = "number";
      input.value = String(info.value[axis]);
      input.style.width = "6em";
      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        if (isFinite(v)) info.value = { ...info.value, [axis]: v };
      });
      label.append(input);
      section.append(label, " ");
    }
  } else {
    // rectangle
    for (const field of ["x", "y", "width", "height"] as const) {
      const label = document.createElement("label");
      label.textContent = `${field}: `;
      const input = document.createElement("input");
      input.type = "number";
      input.value = String((info.value as Record<string, number>)[field]);
      input.style.width = "5em";
      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        if (isFinite(v)) info.value = { ...info.value, [field]: v };
      });
      label.append(input);
      section.append(label, " ");
    }
  }
  section.addEventListener("input", () => {
    onUpdate?.(selectable, info);
  });
  return section;
}
