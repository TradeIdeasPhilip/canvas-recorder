import { Showable, ShowOptions } from "../showable";
import { InSeriesComponent, Transition } from "./in-series";
import { ComponentWithLiveDuration } from "./live-duration";
import { showError } from "./show-error";

/**
 * A {@link Transition} that cross-dissolves between the last frame of `before`
 * and the first frame of `after` in an {@link InSeriesComponent}.
 *
 * GPU path — no pixel read-back.  Uses `destination-in` + `lighter` compositing
 * to compute the premultiplied-alpha cross-dissolve:
 *   alpha_out = (1-t)*alpha_before + t*alpha_after
 *   C_out = ((1-t)*C_before*alpha_before + t*C_after*alpha_after) / alpha_out
 *
 * Either `before` or `after` may be `undefined`; the missing side fades
 * to/from transparent.
 */
export class CrossFadeTransition
  extends ComponentWithLiveDuration
  implements Transition
{
  readonly registryKey = "Cross Fade Transition";
  constructor(options: { description?: string; duration?: number } = {}) {
    super(options.description ?? "Cross Fade", options.duration ?? 1000);
  }
  override show(options: ShowOptions): void {
    showError(
      options.context,
      "A CrossFadeTransition's parent must be an InSeriesComponent.",
    );
  }
  [InSeriesComponent.TRANSITION](
    options: ShowOptions,
    before: Showable | undefined,
    after: Showable | undefined,
  ): void {
    const t = options.timeInMs / this.duration;
    const context = options.context;

    if (t <= 0) {
      if (before) before.show({ ...options, timeInMs: before.duration });
      return;
    }
    if (t >= 1) {
      if (after) after.show({ ...options, timeInMs: 0 });
      return;
    }

    if (typeof document === "undefined") {
      // CLI context: no DOM, can't create a temp canvas.  Show whichever side dominates.
      if (t < 0.5) {
        if (before) before.show({ ...options, timeInMs: before.duration });
      } else {
        if (after) after.show({ ...options, timeInMs: 0 });
      }
      return;
    }

    const { canvas } = context;
    const w = canvas.width;
    const h = canvas.height;
    const xf = context.getTransform();

    // Two temp canvases — one per scene — both matching the destination's
    // pixel resolution and logical-coordinate transform.
    function makeTemp(): CanvasRenderingContext2D {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.setTransform(xf);
      return ctx;
    }

    const ctxA = makeTemp();
    const ctxB = makeTemp();
    if (before) {
      const atEnd: ShowOptions = {
        ...options,
        timeInMs: before.duration,
        context: ctxA,
        registerTransform: undefined,
      };
      before.show(atEnd);
    }
    if (after) {
      const atBeginning: ShowOptions = {
        ...options,
        timeInMs: 0,
        context: ctxB,
        registerTransform: undefined,
      };
      after.show(atBeginning);
    }

    // Blend on ctxA (a clean temp canvas).
    // destination-in at (1-t) scales "before" pixels to (1-t) in premultiplied space.
    // lighter at t adds "after" pixels at weight t.
    // Doing the blend here — not on the destination — preserves whatever the
    // parent has already drawn on the destination (e.g. a HalftoneShadowComponent
    // background) so it doesn't get scaled down by destination-in.
    ctxA.save();
    ctxA.setTransform(1, 0, 0, 1, 0, 0);
    // Source color doesn't matter for destination-in — only source alpha does.
    ctxA.globalCompositeOperation = "destination-in";
    ctxA.fillStyle = `rgba(0,0,0,${1 - t})`;
    ctxA.fillRect(0, 0, w, h);
    ctxA.globalCompositeOperation = "lighter";
    ctxA.globalAlpha = t;
    ctxA.drawImage(ctxB.canvas, 0, 0);
    ctxA.restore();

    // Composite the blended result onto the destination.  source-over leaves
    // the parent's existing background layer intact wherever the blend is transparent.
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.drawImage(ctxA.canvas, 0, 0);
    context.restore();
  }
}
