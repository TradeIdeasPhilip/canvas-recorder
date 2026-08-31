import { Point } from "bezier-js";
import { myRainbow } from "../glib/my-rainbow";
import {
  ColorScheduleInfo,
  NumberScheduleInfo,
  PointScheduleInfo,
  SelectScheduleInfo,
  StringScheduleInfo,
} from "../schedule-helper";
import { ShowOptions } from "../showable";
import { DurationAgnosticComponent } from "./duration-agnostic";
import { Keyframe } from "../interpolate";

/**
 * `document.fonts.check()`/`.load()` only know about `FontFace` objects that
 * have actually been registered from parsed CSS.  If a `@font-face` rule
 * never loaded at all — e.g. the stylesheet request failed because the
 * network was down — there is no `FontFace` to be "pending", so `check()`
 * vacuously reports the font as available.  That's indistinguishable, from
 * the Font Loading API's point of view, from a family that was always meant
 * to be a local/system font.  This checks membership directly instead.
 */
function isFontFamilyRegistered(fontFamily: string): boolean {
  const normalized = fontFamily.trim().toLowerCase();
  for (const face of document.fonts) {
    if (
      face.family
        .replace(/^["']|["']$/g, "")
        .trim()
        .toLowerCase() === normalized
    ) {
      return true;
    }
  }
  return false;
}

/**
 * `queryLocalFonts()` enumerates every font installed on the system — slow
 * enough that it must not run once per frame.  Cache the one query for the
 * life of the page; the set of installed fonts isn't going to change while
 * we're recording.
 */
let localFontFamilies: Promise<Set<string>> | undefined;
function getLocalFontFamilies(): Promise<Set<string>> {
  if (!localFontFamilies) {
    localFontFamilies = (async () => {
      const families = new Set<string>();
      if ("queryLocalFonts" in globalThis) {
        try {
          const local = await (
            globalThis as unknown as {
              queryLocalFonts: () => Promise<Array<{ family: string }>>;
            }
          ).queryLocalFonts();
          for (const f of local) families.add(f.family.trim().toLowerCase());
        } catch {
          // Permission denied or API unavailable — proceed with web fonts only.
        }
      }
      return families;
    })();
  }
  return localFontFamilies;
}

/**
 * Traditional text component.
 *
 * Uses the canvas's strokeText() and fillText().
 * Does **not** use the custom strokable fonts, like {@link TextComponent}.
 * Uses CSS fonts, including downloaded or built in fonts.
 *
 * {@link getFramePromises} awaits `document.fonts.load()`/`.check()` so recording
 * fails fatally rather than silently baking in a fallback font, following the
 * pattern started in {@link SlowImage}.  Live preview is unchanged: it relies on
 * the existing self-healing behavior of `fillText()`/`strokeText()`, which
 * triggers the same load in the background and looks right within a frame or two.
 *
 * TODO??:   direction?? Seems worthless.
 * The best I can tell it is used to manually say whether context.textAlign="start"
 * is equivalent to context.textAlign="left" or context.textAlign="right".
 * That just seems stupid and useless and confusing.
 * In fact, I'm removing start and end from the list of options.
 * Note that שָׁלוֹם is drawn correctly, right-to-left, regardless of this setting.
 *
 * TODO: font-feature-settings (e.g. "tnum" for tabular numbers) is NOT
 * supported in the Canvas 2D API.  The canvas ctx.font property only accepts
 * the CSS2-level font shorthand; OpenType feature settings have no canvas
 * equivalent.  A potential workaround for tabular numbers is drawing each
 * digit individually at a fixed advance width.
 *
 * Exported so that dev/canvas-recorder.ts can do instanceof checks to build
 * the component-specific Font Info panel.
 */
export class TraditionalTextComponent extends DurationAgnosticComponent {
  readonly registryKey: string;
  /**
   * What to display.
   */
  readonly textSchedule = new StringScheduleInfo("Text", [
    { time: 0, value: "Type Here" },
  ]);
  /**
   * Where to display it.
   * See {@link textAlignSchedule} and {@link textBaselineSchedule} to know how this position will be interpreted.
   */
  readonly positionSchedule = new PointScheduleInfo("Position", [
    { time: 0, value: { x: 2, y: 1 } },
  ]);
  /**
   * The fill is the normal way of rendering traditional text.
   */
  readonly fillColorSchedule = new ColorScheduleInfo("Fill Color", [
    { time: 0, value: myRainbow.violet },
  ]);
  /**
   * The outline is stroked using this color.
   * See {@link outlineWidth} if you want to disable the outline.
   *
   * Note that the outline is stroked *before* it is filled.
   * That is the opposite of SVG.
   * I find the text is unreadable if you do it the other way.
   */
  readonly outlineColorSchedule = new ColorScheduleInfo("Outline Color", [
    { time: 0, value: myRainbow.orange },
  ]);
  /**
   * The outline is stroked using this lineWidth.
   * Set this to 0 if you want to disable the outline.
   *
   * Note that the outline is stroked *before* it is filled.
   * That is the opposite of SVG.
   * I find the text is unreadable if you do it the other way.
   */
  readonly outlineWidthSchedule = new NumberScheduleInfo("Outline Width", [
    { time: 0, value: 0 },
  ]);
  /**
   * This corresponds to "px" in the API.
   * However, these are our normal userspace units, not actually pixels.
   * The screen is typically 16×9.
   */
  readonly fontSizeSchedule = new NumberScheduleInfo("Font Size", [
    { time: 0, value: 0.5 },
  ]);
  /**
   * "normal" or "italic".
   * Oblique is omitted: the Canvas 2D API essentially treats it as a synonym
   * for italic and ignores any angle specification, so there is no practical
   * difference for our purposes.
   */
  readonly fontStyleSchedule = new SelectScheduleInfo("Font Style", "normal", [
    "normal",
    "italic",
  ] as const);
  /**
   * CSS font-weight (100–900).  400 = Normal, 700 = Bold.
   * The Visual Editor shows a warning in the Font Info panel if the selected
   * weight is not available for the current font family.
   */
  readonly fontWeightSchedule = new NumberScheduleInfo("Font Weight", 400);
  /**
   * The font family name (e.g. "Life Savers", "Times New Roman").
   *
   * The {@link choices} array is populated asynchronously from
   * `document.fonts` once fonts have loaded, enabling the Visual Editor to
   * offer an autocomplete combo box.  Until then the field accepts free text.
   *
   * Note: `window.queryLocalFonts()` (an experimental API requiring a
   * permission grant) can expose additional installed fonts not in
   * `document.fonts`.  Merging the two lists is a future enhancement.
   */
  readonly fontFamilySchedule = (() => {
    const info = new StringScheduleInfo("Font Family", [
      { time: 0, value: "Life Savers" },
    ]);
    // `document` is unavailable in Node.js (record/cli-record.ts).
    if (typeof document !== "undefined") {
      document.fonts.ready.then(() => {
        const families = new Set<string>();
        for (const face of document.fonts) {
          // FontFace.family may be wrapped in quotes; strip them.
          families.add(face.family.replace(/^["']|["']$/g, "").trim());
        }
        info.choices = [...families].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" }),
        );
      });
    }
    info.useDialog = true;
    return info;
  })();
  /**
   * The {@link positionSchedule} names a point.
   * Should that point refer to the left, center or right side of the text?
   */
  readonly textAlignSchedule = new SelectScheduleInfo("Align", "center", [
    "left",
    "center",
    "right",
  ]);
  /**
   * How does the text align with {@link positionSchedule} vertically?
   * https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/textBaseline
   */
  readonly textBaselineSchedule = new SelectScheduleInfo(
    "Baseline",
    "alphabetic",
    ["top", "hanging", "middle", "alphabetic", "ideographic", "bottom"],
  );
  constructor(
    initialValues: {
      registryKey?: string;
      description?: string;
      minDuration?: number;
      text?: string | readonly Keyframe<string>[];
      position?: Point;
      fillColor?: string | readonly Keyframe<string>[];
      outlineColor?: string | readonly Keyframe<string>[];
      outlineWidth?: number | readonly Keyframe<number>[];
      fontSize?: number | readonly Keyframe<number>[];
      fontStyle?: Parameters<
        TraditionalTextComponent["fontStyleSchedule"]["set"]
      >[0];
      fontWeight?: number | readonly Keyframe<number>[];
      fontFamily?: string | readonly Keyframe<string>[];
      textAlign?: Parameters<
        TraditionalTextComponent["textAlignSchedule"]["set"]
      >[0];
      textBaseline?: Parameters<
        TraditionalTextComponent["textBaselineSchedule"]["set"]
      >[0];
    } = {},
  ) {
    super(initialValues.description ?? "Traditional Text");
    this.registryKey = initialValues.registryKey ?? "Traditional Text";
    if (initialValues.minDuration !== undefined) {
      this.minDurationScalar.value = initialValues.minDuration;
    }
    this.schedules.push(
      this.textSchedule,
      this.positionSchedule,
      this.fillColorSchedule,
      this.outlineColorSchedule,
      this.outlineWidthSchedule,
      this.fontSizeSchedule,
      this.fontStyleSchedule,
      this.fontWeightSchedule,
      this.fontFamilySchedule,
      this.textAlignSchedule,
      this.textBaselineSchedule,
    );
    if (initialValues.text !== undefined)
      this.textSchedule.set(initialValues.text);
    if (initialValues.position !== undefined)
      this.positionSchedule.set(initialValues.position);
    if (initialValues.fillColor !== undefined)
      this.fillColorSchedule.set(initialValues.fillColor);
    if (initialValues.outlineColor !== undefined)
      this.outlineColorSchedule.set(initialValues.outlineColor);
    if (initialValues.outlineWidth !== undefined)
      this.outlineWidthSchedule.set(initialValues.outlineWidth);
    if (initialValues.fontSize !== undefined)
      this.fontSizeSchedule.set(initialValues.fontSize);
    if (initialValues.fontStyle !== undefined)
      this.fontStyleSchedule.set(initialValues.fontStyle);
    if (initialValues.fontWeight !== undefined)
      this.fontWeightSchedule.set(initialValues.fontWeight);
    if (initialValues.fontFamily !== undefined)
      this.fontFamilySchedule.set(initialValues.fontFamily);
    if (initialValues.textAlign !== undefined)
      this.textAlignSchedule.set(initialValues.textAlign);
    if (initialValues.textBaseline !== undefined)
      this.textBaselineSchedule.set(initialValues.textBaseline);
  }
  /**
   * CSS font shorthand: [style] [weight] [size] [family].
   * Shared by {@link show} and {@link getFramePromises} so they can never disagree
   * about which font a given frame needs.
   */
  #fontStringAt(timeInMs: number): string {
    const fontSize = this.fontSizeSchedule.at(timeInMs);
    const fontStyle = this.fontStyleSchedule.at(timeInMs);
    const fontWeight = this.fontWeightSchedule.at(timeInMs);
    const fontFamily = this.fontFamilySchedule.at(timeInMs);
    return `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  }
  override getFramePromises(
    timeInMs: number,
    set: Pick<Set<Promise<unknown>>, "add">,
  ): void {
    // To test:
    // * philDebug.loadServiceWorker() to slow some web fonts down enough to be very visible.
    // * Set the program to display a page that does not use those fonts.
    // * Use flush cache and hard reload to flush the cache.
    // * Use normal reload to restart the service worker.
    // * Hit record and watch when the web fonts are first used.
    // * The screen should pause when loading the web fonts.
    // * The screen and the saved version should only have the correct version of the font.
    // * Or, instead of recording, just play the part of the video with the slow fonts.
    // * On the live screen you should see the fallback font for a short time before the real version appears.
    // * The live version does not call getFramePromises(), only when you save.
    super.getFramePromises(timeInMs, set);
    // `document` is unavailable in Node.js (record/cli-record.ts) — nothing
    // async to wait for there.
    if (typeof document === "undefined") {
      return;
    }
    const text = this.textSchedule.at(timeInMs);
    const fontFamily = this.fontFamilySchedule.at(timeInMs);
    const fontString = this.#fontStringAt(timeInMs);
    set.add(
      (async () => {
        // document.fonts.load() does not reliably reject just because the
        // requested family was never registered anywhere — it can resolve
        // having loaded nothing.  The checks below verify explicitly so a
        // bad/missing font is still fatal when recording.
        await document.fonts.load(fontString, text);
        if (isFontFamilyRegistered(fontFamily)) {
          // A real @font-face rule exists for this family — check whether
          // the exact weight/style/subset this frame needs is ready.
          // Passing `text` (rather than the default, a single space)
          // matters here: web fonts are often served as one file per
          // Unicode-range subset, so a family can be "loaded" for Latin
          // text while the subset this specific text needs is not.
          if (!document.fonts.check(fontString, text)) {
            throw new Error(
              `Font not available: "${fontString}" (needed for "${text}")`,
            );
          }
          return;
        }
        // No @font-face rule was ever registered for this family — either
        // its CSS failed to load (e.g. no network), or it was always meant
        // to be a local/system font.  document.fonts.check() can't tell
        // these two cases apart (it reports "available" either way), so
        // fall back to checking installed fonts directly.
        const localFamilies = await getLocalFontFamilies();
        if (!localFamilies.has(fontFamily.trim().toLowerCase())) {
          throw new Error(
            `Font family "${fontFamily}" was not found.  Its @font-face ` +
              `CSS may have failed to load (check your network connection), ` +
              `or it isn't installed on this system.`,
          );
        }
      })(),
    );
  }
  override show(options: ShowOptions) {
    super.show(options);
    const { context, timeInMs } = options;
    const text = this.textSchedule.at(timeInMs);
    const position = this.positionSchedule.at(timeInMs);
    const fillColor = this.fillColorSchedule.at(timeInMs);
    const outlineWidth = this.outlineWidthSchedule.at(timeInMs);
    const fontFamily = this.fontFamilySchedule.at(timeInMs);
    const fontString = this.#fontStringAt(timeInMs);
    context.font = fontString;
    context.textAlign = this.textAlignSchedule.at(timeInMs);
    context.textBaseline = this.textBaselineSchedule.at(timeInMs);
    if (outlineWidth > 0) {
      const outlineColor = this.outlineColorSchedule.at(timeInMs);
      context.lineWidth = outlineWidth;
      // Most of the time you want miter.  If there is a sharp corner in
      // the filled version, there will be a corresponding corner in the
      // stroked version.  Where the filled version is smooth, lineJoin
      // is ignored and the stroked version is smooth.  Life Saves seems
      // buggy.  The filled version appears round everywhere, but the
      // stroked version had big pointy spikes.
      context.lineJoin = fontFamily == "Life Savers" ? "round" : "miter";
      context.strokeStyle = outlineColor;
      context.strokeText(text, position.x, position.y);
    }
    context.fillStyle = fillColor;
    context.fillText(text, position.x, position.y);
  }
}
