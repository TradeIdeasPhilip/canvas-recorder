import { applyTransform } from "../glib/transforms";
import { StringScalarInfo, NumberScheduleInfo } from "../schedule-helper";
import { ShowOptions } from "../showable";
import { DurationAgnosticComponent } from "./duration-agnostic";
import { ShowChildInfo } from "./in-parallel";
import { showError } from "./show-error";
import { Keyframe } from "../interpolate";

/**
 * Mathematical Bold Script capital letters A–J, used as placeholders in
 * {@link SlideComponent} transform templates.  String values only — ASCII
 * export name to avoid Rollup's non-Latin-1 truncation bug.
 */
export const TRANSFORM_PLACEHOLDERS = [
  "𝓐",
  "𝓑",
  "𝓒",
  "𝓓",
  "𝓔",
  "𝓕",
  "𝓖",
  "𝓗",
  "𝓘",
  "𝓙",
] as const;

/**
 * A slide is a generic container, like `<g>` or `<div>`.
 *
 * The transform is specified as a CSS transform string template.
 * Write placeholders like 𝓐 𝓑 𝓒 … in the template; each maps to an
 * animatable numeric schedule of the same name.  Example:
 *   "scale(𝓐) translate(𝓑px, 𝓒px)"
 *
 * Up to 10 placeholders (𝓐–𝓙) are available.  Unused schedules default
 * to 1 and can be ignored.
 *
 * Exported so dev/canvas-recorder.ts can use instanceof for the custom panel.
 */
export class SlideComponent extends DurationAgnosticComponent {
  readonly registryKey = "Slide";
  readonly transformTemplate = new StringScalarInfo(
    "Transform Template",
    "scale(1)",
  );

  readonly alphaSchedule = new NumberScheduleInfo("Alpha", 1);

  readonly placeA = new NumberScheduleInfo("𝓐", 1);
  readonly placeB = new NumberScheduleInfo("𝓑", 1);
  readonly placeC = new NumberScheduleInfo("𝓒", 1);
  readonly placeD = new NumberScheduleInfo("𝓓", 1);
  readonly placeE = new NumberScheduleInfo("𝓔", 1);
  readonly placeF = new NumberScheduleInfo("𝓕", 1);
  readonly placeG = new NumberScheduleInfo("𝓖", 1);
  readonly placeH = new NumberScheduleInfo("𝓗", 1);
  readonly placeI = new NumberScheduleInfo("𝓘", 1);
  readonly placeJ = new NumberScheduleInfo("𝓙", 1);

  // TODO It would not be a bad idea to add registryKey as an optional input to the constructor.
  // As done and documented elsewhere, that goes with the fixed components idea.
  // The typescript code might want to add a few fixed components rather than creating a whole new class.
  // We got the fixed components for free when we inherited from InParallelComponent
  // And if someone uses that feature, then they should at a minimum disable registryKey.
  // Right?  Maybe there's a better way to exclude this from the serialization process.
  // Maybe overkill.  We have an example but it's never been used.

  constructor(
    initialValues: {
      description?: string;
      transformTemplate?: string;
      alpha?: number | readonly Keyframe<number>[];
      placeA?: number | readonly Keyframe<number>[];
      placeB?: number | readonly Keyframe<number>[];
      placeC?: number | readonly Keyframe<number>[];
      placeD?: number | readonly Keyframe<number>[];
      placeE?: number | readonly Keyframe<number>[];
      placeF?: number | readonly Keyframe<number>[];
      placeG?: number | readonly Keyframe<number>[];
      placeH?: number | readonly Keyframe<number>[];
      placeI?: number | readonly Keyframe<number>[];
      placeJ?: number | readonly Keyframe<number>[];
    } = {},
  ) {
    super(initialValues.description ?? "Slide");
    this.scalars.push(this.transformTemplate);
    if (initialValues.transformTemplate !== undefined)
      this.transformTemplate.value = initialValues.transformTemplate;
    this.schedules.push(
      this.alphaSchedule,
      this.placeA,
      this.placeB,
      this.placeC,
      this.placeD,
      this.placeE,
      this.placeF,
      this.placeG,
      this.placeH,
      this.placeI,
      this.placeJ,
    );
    if (initialValues.alpha !== undefined)
      this.alphaSchedule.set(initialValues.alpha);
    if (initialValues.placeA !== undefined)
      this.placeA.set(initialValues.placeA);
    if (initialValues.placeB !== undefined)
      this.placeB.set(initialValues.placeB);
    if (initialValues.placeC !== undefined)
      this.placeC.set(initialValues.placeC);
    if (initialValues.placeD !== undefined)
      this.placeD.set(initialValues.placeD);
    if (initialValues.placeE !== undefined)
      this.placeE.set(initialValues.placeE);
    if (initialValues.placeF !== undefined)
      this.placeF.set(initialValues.placeF);
    if (initialValues.placeG !== undefined)
      this.placeG.set(initialValues.placeG);
    if (initialValues.placeH !== undefined)
      this.placeH.set(initialValues.placeH);
    if (initialValues.placeI !== undefined)
      this.placeI.set(initialValues.placeI);
    if (initialValues.placeJ !== undefined)
      this.placeJ.set(initialValues.placeJ);
  }

  transformStringAt(timeInMs: number): string {
    const values = [
      this.placeA.at(timeInMs),
      this.placeB.at(timeInMs),
      this.placeC.at(timeInMs),
      this.placeD.at(timeInMs),
      this.placeE.at(timeInMs),
      this.placeF.at(timeInMs),
      this.placeG.at(timeInMs),
      this.placeH.at(timeInMs),
      this.placeI.at(timeInMs),
      this.placeJ.at(timeInMs),
    ];
    let result = this.transformTemplate.value;
    TRANSFORM_PLACEHOLDERS.forEach((ph, i) => {
      result = result.replaceAll(ph, String(values[i]));
    });
    return result;
  }
  override show(options: ShowOptions): void {
    const { context, timeInMs } = options;
    const alpha = this.alphaSchedule.at(timeInMs);

    // alpha <= 0 or NaN: skip entirely
    if (!(alpha > 0)) return;

    const transformString = this.transformStringAt(timeInMs);
    let transformMatrix: undefined | DOMMatrixReadOnly;
    try {
      transformMatrix = new DOMMatrixReadOnly(transformString);
    } catch {
      showError(context, "Invalid Transform:\n" + transformString);
      return;
    }

    if (alpha >= 1 || typeof document === "undefined") {
      // Fully opaque (or CLI fallback): existing path, no temp canvas.
      const originalTransform = context.getTransform();
      applyTransform(context, transformMatrix);
      super.show(options);
      context.setTransform(originalTransform);
    } else {
      // Semi-transparent: render children into a temp canvas, then composite.
      const { canvas } = context;
      const w = canvas.width;
      const h = canvas.height;
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tempCtx = tempCanvas.getContext("2d")!;
      tempCtx.setTransform(context.getTransform());
      applyTransform(tempCtx, transformMatrix);
      super.show({
        ...options,
        context: tempCtx,
        registerTransform: undefined,
      });
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = alpha;
      context.drawImage(tempCanvas, 0, 0);
      context.restore();
    }
  }
  protected override showChild(info: ShowChildInfo): void {
    info.options.registerTransform?.(
      info.child,
      info.options.context.getTransform(),
    );
    super.showChild(info);
  }
}
