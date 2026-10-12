import { ReadOnlyRect } from "phil-lib/misc";
import { Keyframe } from "../src/interpolate.ts";
import { SingleImageComponent } from "../src/slide-components/image.ts";
import {
  centeredOnCanvas,
  maxFit,
  minCover,
  PIXELS_PER_UNIT,
  preservePixels,
  sameCenter,
  shrinkToAspect,
} from "../src/slide-components/video-info.ts";
import { SingleImage } from "../src/slow-image-sources.ts";
import { ALIGN_HORIZONTALLY, ALIGN_VERTICALLY, buildSnapRow } from "./rect-snap.ts";

/** What the panel needs from the Visual Editor.  It never reaches into canvas-recorder.ts directly. */
export type StaticImagePanelHooks = {
  /** A Dest Rect keyframe's value was replaced.  Sync its number fields and on-canvas handles, and save. */
  readonly rectKeyframeChanged: (keyframe: Keyframe<ReadOnlyRect>) => void;
  /** The Dest Rect keyframe in ✎ edit mode, if there is one. */
  readonly editingRectKeyframe: () => Keyframe<ReadOnlyRect> | null;
};

export type StaticImagePanel = {
  readonly element: HTMLElement;
  /** The URL or the Dest Rect may have changed.  Reloads only if the URL did. */
  refresh(): void;
  /** The image's width / height, once known.  For Shift-dragging the Dest Rect. */
  aspect(): number | undefined;
};

/**
 * The "Image File" panel shown at the top of the schedule editor when a
 * {@link SingleImageComponent} is selected:  the image's size, and one-click
 * ways to size and place the Dest Rect.
 *
 * The sizing buttons are the same as the Video File panel's (see
 * video-clip-panel.ts).  The image is drawn the same way as a video, as large
 * as fits inside Dest Rect, centered, so the same rectangles work.
 *
 * When URL is animated, this describes the image at the time of the Dest Rect
 * keyframe being changed.
 */
export function buildStaticImagePanel(
  component: SingleImageComponent,
  hooks: StaticImagePanelHooks,
): StaticImagePanel {
  const panel = document.createElement("fieldset");
  panel.style.cssText = "border-color:#6a7fae;margin-bottom:0.4em";
  const legend = document.createElement("legend");
  legend.textContent = "Image File";
  panel.append(legend);

  const line = (parent: HTMLElement, cssText = "") => {
    const div = document.createElement("div");
    div.style.cssText = cssText;
    parent.append(div);
    return div;
  };
  const button = (parent: HTMLElement, text: string, title: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.title = title;
    b.style.marginRight = "0.3em";
    parent.append(b);
    return b;
  };

  const statusEl = line(panel, "font-weight:bold;margin-bottom:0.2em");
  const derivedEl = line(panel, "font-size:0.9em;line-height:1.4");

  type Size = { readonly width: number; readonly height: number };
  const rectRow = line(panel, "margin-top:0.4em");
  const rectButtons = [
    {
      text: "Fit canvas",
      title: "As large as possible while the whole image stays on the 16×9 canvas.  Centered.",
      make: (size: Size) => centeredOnCanvas(maxFit(size.width, size.height)),
    },
    {
      text: "Cover canvas",
      title: "Just large enough to cover the whole canvas.  Some of the image will be off screen.  Centered.",
      make: (size: Size) => centeredOnCanvas(minCover(size.width, size.height)),
    },
    {
      text: "Native pixels",
      title: `One image pixel per output pixel at ${PIXELS_PER_UNIT} px/unit — pixel perfect.  Keeps the rectangle's center.`,
      make: (size: Size, rect: ReadOnlyRect) =>
        sameCenter(preservePixels(size.width, size.height), rect),
    },
  ].map(({ text, title, make }) => ({ btn: button(rectRow, text, title), make }));

  /**
   * Snap one edge of the Dest Rect to the canvas, or center it, keeping its
   * size.  These need nothing from the file, so unlike the row above they
   * work before it has loaded.
   */
  const alignRow = buildSnapRow(
    [ALIGN_HORIZONTALLY, ALIGN_VERTICALLY],
    () => {
      const target = targetKeyframe();
      return typeof target === "string" ? target : target.value;
    },
    (rect) => {
      const target = targetKeyframe();
      if (typeof target === "string") return;
      target.value = rect;
      hooks.rectKeyframeChanged(target);
      draw();
    },
  );
  alignRow.element.style.marginTop = "0.3em";
  panel.append(alignRow.element);

  const rectHint = line(panel, "font-size:0.85em;color:#a06000;min-height:0");

  /** The image this panel is describing, loaded or not. */
  let image: SingleImage | undefined;
  let state: "empty" | "loading" | "ready" | "error" = "empty";

  /** The image's size, once it has loaded. */
  function loadedSize(): Size | undefined {
    return state === "ready" && image
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : undefined;
  }

  // MARK: Drawing

  function draw(): void {
    const size = loadedSize();
    switch (state) {
      case "empty":
        statusEl.textContent = "No URL set";
        statusEl.style.color = "#888";
        break;
      case "loading":
        statusEl.textContent = "Loading…";
        statusEl.style.color = "#886600";
        break;
      case "error":
        // Grey, not red:  this is the normal state while typing a name.
        statusEl.textContent = "Not found, or not an image this can read";
        statusEl.style.color = "#888";
        break;
      case "ready":
        statusEl.textContent = `✓ ${size!.width}×${size!.height}`;
        statusEl.style.color = "#070";
        break;
    }

    derivedEl.replaceChildren();
    if (size) {
      // Output pixels per image pixel, for each Dest Rect keyframe.  1 is
      // native resolution.  Above 1 the image is being upscaled.
      const ratios = component.destRectSchedule.schedule.map(({ value }) => {
        const drawn = shrinkToAspect(value, size.width / size.height);
        return (drawn.width * PIXELS_PER_UNIT) / size.width;
      });
      const lo = Math.min(...ratios);
      const hi = Math.max(...ratios);
      const label =
        Math.abs(hi - lo) < 0.005
          ? `${hi.toFixed(2)}× native`
          : `${lo.toFixed(2)}×–${hi.toFixed(2)}× native`;
      const div = line(derivedEl);
      if (hi > 1.005) {
        div.textContent = `Pixels: ${label} — upscaled, will look soft.`;
        div.style.color = "#a06000";
      } else if (Math.abs(hi - 1) <= 0.005 && Math.abs(lo - 1) <= 0.005) {
        div.textContent = `Pixels: ${label} — pixel perfect ✓`;
        div.style.color = "#070";
      } else {
        div.textContent = `Pixels: ${label} (downscaled)`;
      }
    }

    for (const { btn } of rectButtons) btn.disabled = !size;
    alignRow.draw();
  }

  // MARK: Actions

  /** Which Dest Rect keyframe a button should change, or why it can't decide. */
  function targetKeyframe(): Keyframe<ReadOnlyRect> | string {
    const schedule = component.destRectSchedule.schedule;
    if (schedule.length === 1) return schedule[0];
    const editing = hooks.editingRectKeyframe();
    if (editing && schedule.includes(editing)) return editing;
    return "Dest Rect has several keyframes.  Click ✎ on the one you want to change.";
  }

  function refresh(): void {
    const target = targetKeyframe();
    const url = component.urlSchedule.at(
      typeof target === "string" ? 0 : target.time,
    );
    if (url === (image?.url ?? "")) {
      // Same file.  Only the Dest Rect may have changed.
      draw();
      return;
    }
    if (!url) {
      image = undefined;
      state = "empty";
      draw();
      return;
    }
    const loading = new SingleImage(url);
    image = loading;
    state = "loading";
    draw();
    loading.getPromise().then(
      () => {
        // A newer URL may have been typed while this one loaded.
        if (image !== loading) return;
        state = "ready";
        draw();
      },
      () => {
        if (image !== loading) return;
        state = "error";
        draw();
      },
    );
  }

  for (const { btn, make } of rectButtons) {
    btn.addEventListener("click", () => {
      const size = loadedSize();
      if (!size) return;
      const target = targetKeyframe();
      if (typeof target === "string") {
        rectHint.textContent = target;
        return;
      }
      rectHint.textContent = "";
      target.value = make(size, target.value);
      hooks.rectKeyframeChanged(target);
      draw();
    });
  }

  refresh();
  return {
    element: panel,
    refresh,
    aspect: () => {
      const size = loadedSize();
      return size ? size.width / size.height : undefined;
    },
  };
}
