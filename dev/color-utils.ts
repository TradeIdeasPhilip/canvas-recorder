export type RGBA = { r: number; g: number; b: number; a: number };

/**
 * Paints `el` as a color swatch.  A checkerboard background sits behind the
 * color so that any alpha transparency is clearly visible.
 */
export function setSwatchColor(el: HTMLElement, css: string): void {
  el.style.backgroundImage = [
    `linear-gradient(${css},${css})`,
    "linear-gradient(45deg,#bbb 25%,transparent 25%)",
    "linear-gradient(-45deg,#bbb 25%,transparent 25%)",
    "linear-gradient(45deg,transparent 75%,#bbb 75%)",
    "linear-gradient(-45deg,transparent 75%,#bbb 75%)",
  ].join(",");
  el.style.backgroundSize = "auto,8px 8px,8px 8px,8px 8px,8px 8px";
  el.style.backgroundPosition = "0 0,0 0,0 4px,4px -4px,-4px 0";
  el.style.backgroundColor = "#fff";
}

// Hidden div for CSS color validation / parsing via getComputedStyle.
const _parseColorDiv = document.createElement("div");
_parseColorDiv.style.cssText =
  "position:fixed;top:-100px;left:-100px;width:1px;height:1px;visibility:hidden";
document.documentElement.append(_parseColorDiv);

/**
 * Validate a CSS color string and convert it to RGBA.
 *
 * Uses CSS Relative Color Syntax (`rgb(from X r g b / alpha)`) to normalize any
 * valid CSS color — including Color Level 4 formats like lab(), oklch(), color-mix(),
 * etc. — to `color(srgb r g b / alpha)`, which Chrome always returns from
 * getComputedStyle for this construct. The inline-style assignment acts as the
 * validity gate: if the browser rejects the input, the style stays empty → null.
 */
export function parseCssColorToRgba(css: string): RGBA | null {
  _parseColorDiv.style.backgroundColor = "";
  _parseColorDiv.style.backgroundColor = `rgb(from ${css} r g b / alpha)`;
  if (!_parseColorDiv.style.backgroundColor) return null;
  const computed = getComputedStyle(_parseColorDiv).backgroundColor;
  const m = computed.match(
    /^color\(srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.e+-]+))?\)/,
  );
  if (!m) return null;
  const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return {
    r: clamp(+m[1]),
    g: clamp(+m[2]),
    b: clamp(+m[3]),
    a: m[4] != null ? +m[4] : 1,
  };
}

export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function hslToRgb(
  h: number,
  s: number,
  l: number,
): [number, number, number] {
  h /= 360;
  s /= 100;
  l /= 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const h2r = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(h2r(h + 1 / 3) * 255),
    Math.round(h2r(h) * 255),
    Math.round(h2r(h - 1 / 3) * 255),
  ];
}

export function rgbToHwb(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const [h] = rgbToHsl(r, g, b);
  return [
    h,
    Math.round((Math.min(r, g, b) / 255) * 100),
    Math.round((1 - Math.max(r, g, b) / 255) * 100),
  ];
}

export function hwbToRgb(
  h: number,
  w: number,
  bk: number,
): [number, number, number] {
  const w1 = w / 100,
    bk1 = bk / 100;
  if (w1 + bk1 >= 1) {
    const g = Math.round((w1 / (w1 + bk1)) * 255);
    return [g, g, g];
  }
  const [pr, pg, pb] = hslToRgb(h, 100, 50);
  const f = 1 - w1 - bk1;
  return [
    Math.round(pr * f + w1 * 255),
    Math.round(pg * f + w1 * 255),
    Math.round(pb * f + w1 * 255),
  ];
}

export function _p01(v: number) {
  return parseFloat((v * 100).toFixed(2)) + "%";
}

export function _deg(h: number) {
  return Math.round(h) + "deg";
}

export function fmtHex(r: number, g: number, b: number, a: number): string {
  const h = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return a >= 1 - 0.5 / 255
    ? `#${h(r)}${h(g)}${h(b)}`
    : `#${h(r)}${h(g)}${h(b)}${h(a * 255)}`;
}

export function fmtRgb(r: number, g: number, b: number, a: number): string {
  const body = `${_p01(r / 255)} ${_p01(g / 255)} ${_p01(b / 255)}`;
  return a >= 1 ? `rgb(${body})` : `rgb(${body} / ${_p01(a)})`;
}

export function fmtHwb(h: number, w: number, bk: number, a: number): string {
  const body = `${_deg(h)} ${w}% ${bk}%`;
  return a >= 1 ? `hwb(${body})` : `hwb(${body} / ${_p01(a)})`;
}

export function fmtHsl(h: number, s: number, l: number, a: number): string {
  const body = `${_deg(h)} ${s}% ${l}%`;
  return a >= 1 ? `hsl(${body})` : `hsl(${body} / ${_p01(a)})`;
}

const MAX_RECENT_COLORS = 20;
export const recentColors: string[] = [];

export function addToRecentColors(css: string) {
  const i = recentColors.indexOf(css);
  if (i !== -1) recentColors.splice(i, 1);
  recentColors.unshift(css);
  while (recentColors.length > MAX_RECENT_COLORS) recentColors.pop();
}
