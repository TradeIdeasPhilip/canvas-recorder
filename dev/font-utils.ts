export const FONT_WEIGHT_NAMES = new Map<number, string>([
  [100, "Thin"],
  [200, "Extra Light"],
  [300, "Light"],
  [400, "Normal"],
  [500, "Medium"],
  [600, "Semi Bold"],
  [700, "Bold"],
  [800, "Extra Bold"],
  [900, "Black"],
]);

export interface FontFamilyData {
  /** "normal", "italic", "oblique" — whatever document.fonts reports. */
  styles: Set<string>;
  /** Sorted discrete weight values (only populated when no range is present). */
  discreteWeights: number[];
  /** Continuous weight range, if the font uses one. */
  weightRange: { min: number; max: number } | null;
}

/**
 * Parse a FontFace.weight string into a discrete number or [min,max] range.
 * Returns null and logs a console warning for unexpected formats.
 */
export function parseFontWeight(
  str: string,
  familyName: string,
): number | [number, number] | null {
  str = str.trim();
  if (str === "normal") return 400;
  if (str === "bold") return 700;
  const parts = str.split(/\s+/);
  if (parts.length === 1) {
    const n = parseFloat(parts[0]);
    if (isFinite(n)) return n;
  } else if (parts.length === 2) {
    const lo = parseFloat(parts[0]);
    const hi = parseFloat(parts[1]);
    if (isFinite(lo) && isFinite(hi)) return [lo, hi];
  }
  console.warn(
    `TraditionalTextComponent: unexpected font-weight "${str}" for family "${familyName}"`,
  );
  return null;
}

/**
 * Collect style and weight information for a font family from `document.fonts`.
 * Family name comparison is case-insensitive; quoted names (e.g. `"Times New Roman"`)
 * are normalized before comparison.
 */
export function getFontFamilyData(familyName: string): FontFamilyData {
  const data: FontFamilyData = {
    styles: new Set(),
    discreteWeights: [],
    weightRange: null,
  };
  const weightSet = new Set<number>();
  let hasRange = false;

  const needle = familyName.toLowerCase();
  for (const face of document.fonts) {
    const faceName = face.family.replace(/^["']|["']$/g, "").trim();
    if (faceName.toLowerCase() !== needle) continue;

    // Normalize style
    const style = face.style.toLowerCase();
    data.styles.add(style.startsWith("oblique") ? "oblique" : style);

    // Parse weight
    const w = parseFontWeight(face.weight, familyName);
    if (w === null) continue;
    if (Array.isArray(w)) {
      hasRange = true;
      if (!data.weightRange) {
        data.weightRange = { min: w[0], max: w[1] };
      } else {
        data.weightRange.min = Math.min(data.weightRange.min, w[0]);
        data.weightRange.max = Math.max(data.weightRange.max, w[1]);
      }
    } else {
      weightSet.add(w);
    }
  }

  if (!hasRange) {
    data.discreteWeights = [...weightSet].sort((a, b) => a - b);
  }
  return data;
}

export function formatWeightLabel(w: number): string {
  const name = FONT_WEIGHT_NAMES.get(w);
  return name ? `${w} (${name})` : String(w);
}

export function formatWeightSummary(data: FontFamilyData): string {
  if (data.weightRange) {
    const { min, max } = data.weightRange;
    const named = [...FONT_WEIGHT_NAMES.entries()]
      .filter(([w]) => w >= min && w <= max)
      .map(([, name]) => name);
    const range = `${min}–${max}`;
    return named.length ? `${range} (includes ${named.join(", ")})` : range;
  }
  if (data.discreteWeights.length) {
    return data.discreteWeights.map(formatWeightLabel).join(", ");
  }
  return "(not found in loaded fonts)";
}

/**
 * Family name → comma-separated unique style words from window.queryLocalFonts().
 * Populated once at startup; used by buildTraditionalTextPanel to display info
 * for local fonts that are not in document.fonts.
 */
export const localFontStylesMap = new Map<string, string>();

export function _fetchLocalFonts() {
  if (!("queryLocalFonts" in window)) {
    console.log(
      "Warning: Local fonts are not available. Try using Chrome to fix this.",
    );
    return;
  }
  // queryLocalFonts() requires the page to be visible.  Calling it while hidden
  // (e.g. during a Vite HMR reload) throws SecurityError — defer if needed.
  if (document.visibilityState !== "visible") {
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "visible") _fetchLocalFonts();
      },
      { once: true },
    );
    return;
  }
  (
    window as unknown as {
      queryLocalFonts: () => Promise<Array<{ family: string; style: string }>>;
    }
  )
    .queryLocalFonts()
    .then((fonts) => {
      const byFamily = new Map<string, Set<string>>();
      for (const f of fonts) {
        let s = byFamily.get(f.family);
        if (!s) {
          s = new Set();
          byFamily.set(f.family, s);
        }
        for (const w of f.style.split(/\s+/)) if (w) s.add(w);
      }
      for (const [fam, styles] of byFamily) {
        localFontStylesMap.set(fam, [...styles].join(", "));
      }
    })
    .catch((e: unknown) => console.warn("queryLocalFonts():", e));
}

// MARK: Font coverage utilities

/**
 * Code-point ranges that virtually every local (system) font supports.
 * Used as a whitelist when a font is not in document.fonts (i.e. a local font)
 * so we only warn when the user's text ventures outside these safe ranges.
 */
const LOCAL_FONT_SAFE_RANGES: [number, number][] = [
  [0x0020, 0x007e], // printable ASCII
  [0x00a0, 0x00ff], // Latin-1 Supplement (é ñ ü ß …)
  [0x2013, 0x2014], // en / em dash
  [0x2018, 0x2019], // curly single quotes
  [0x201c, 0x201d], // curly double quotes
  [0x2026, 0x2026], // ellipsis
  [0x20ac, 0x20ac], // €
];

/** Matches graphemes that are rendered by the OS emoji font, not the text font. */
const _emojiRe = /\p{Emoji_Presentation}/u;

/** Parse a CSS `unicode-range` descriptor string into [lo, hi] code-point pairs. */
export function _parseUnicodeRange(unicodeRange: string): [number, number][] {
  return unicodeRange.split(",").flatMap((part) => {
    part = part.trim().toUpperCase();
    if (!part.startsWith("U+")) return [];
    const raw = part.slice(2);
    const dash = raw.indexOf("-");
    if (dash >= 0) {
      const lo = parseInt(raw.slice(0, dash), 16);
      const hi = parseInt(raw.slice(dash + 1), 16);
      if (isFinite(lo) && isFinite(hi)) return [[lo, hi] as [number, number]];
    } else {
      const v = parseInt(raw, 16);
      if (isFinite(v)) return [[v, v] as [number, number]];
    }
    return [];
  });
}

export function _cpInRanges(cp: number, ranges: [number, number][]): boolean {
  return ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
}

/**
 * Returns unique grapheme clusters from `text` that are NOT covered by `family`.
 *
 * - Web fonts (families present in document.fonts) are checked against their
 *   declared `unicodeRange`.
 * - Local / system fonts fall back to {@link LOCAL_FONT_SAFE_RANGES}.
 * - Whitespace and emoji are always excluded from the result.
 */
export function _uncoveredGraphemes(family: string, text: string): string[] {
  const needle = family.toLowerCase();
  const webRanges: [number, number][] = [];
  for (const face of document.fonts) {
    const faceName = face.family.replace(/^["']|["']$/g, "").trim();
    if (faceName.toLowerCase() === needle)
      webRanges.push(..._parseUnicodeRange(face.unicodeRange));
  }
  const ranges = webRanges.length > 0 ? webRanges : LOCAL_FONT_SAFE_RANGES;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const { segment } of new Intl.Segmenter().segment(text)) {
    if (!segment.trim() || _emojiRe.test(segment) || seen.has(segment))
      continue;
    seen.add(segment);
    if (!_cpInRanges(segment.codePointAt(0)!, ranges)) result.push(segment);
  }
  return result;
}

/**
 * Returns web font family names from document.fonts that cover every code
 * point in `graphemes`, sorted alphabetically, up to `maxResults`.
 */
export function _findAlternativeFonts(
  graphemes: string[],
  maxResults = 6,
): string[] {
  if (!graphemes.length) return [];
  const cps = graphemes.map((g) => g.codePointAt(0)!);

  const familyRanges = new Map<string, [number, number][]>();
  for (const face of document.fonts) {
    const name = face.family.replace(/^["']|["']$/g, "").trim();
    if (!familyRanges.has(name)) familyRanges.set(name, []);
    familyRanges.get(name)!.push(..._parseUnicodeRange(face.unicodeRange));
  }

  return [...familyRanges]
    .filter(([, ranges]) => cps.every((cp) => _cpInRanges(cp, ranges)))
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .slice(0, maxResults);
}
