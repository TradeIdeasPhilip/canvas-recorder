import { ReadOnlyRect } from "phil-lib/misc";
import { StringScheduleInfo, RectangleScheduleInfo } from "../schedule-helper";
import { Showable, ShowOptions } from "../showable";
import { SingleImage, SlowImage } from "../slow-image-sources";
import { Keyframe } from "../interpolate";

/**
 * Standard registry component: draws a single image loaded from a URL.
 *
 * If the URL is empty, the destination rectangle is left blank.
 * While the image is loading of if the URL is non-empty but the load fails,
 * {@link SlowImage.showError} draws a red ✕ so the problem is obvious.
 *
 * The URL schedule is discrete — changing it mid-animation triggers a fresh
 * load.  The dest-rect schedule is interpolated so you can animate placement.
 */
export class SingleImageComponent implements Showable {
  readonly registryKey = "Static Image";
  readonly urlSchedule = new StringScheduleInfo("URL", "");
  readonly destRectSchedule = new RectangleScheduleInfo("Dest Rect", {
    x: 1,
    y: 1,
    width: 14,
    height: 7,
  });
  readonly schedules = [this.urlSchedule, this.destRectSchedule] as const;
  readonly description = "Static Image";
  readonly duration = 0;
  #image: SingleImage | undefined;
  constructor(
    initialValues: {
      url?: string | readonly Keyframe<string>[];
      destRect?: ReadOnlyRect | readonly Keyframe<ReadOnlyRect>[];
    } = {},
  ) {
    if (initialValues.url !== undefined) {
      this.urlSchedule.set(initialValues.url);
    }
    if (initialValues.destRect !== undefined) {
      this.destRectSchedule.set(initialValues.destRect);
    }
  }
  #getImage(timeInMs: number) {
    const url = this.urlSchedule.at(timeInMs);
    if (url !== this.#image?.url) {
      this.#image = url ? new SingleImage(url) : undefined;
    }
    return this.#image;
  }
  getFramePromises(timeInMs: number, set: Pick<Set<Promise<unknown>>, "add">) {
    const image = this.#getImage(timeInMs);
    if (image) {
      set.add(image.getPromise());
    }
  }
  show({ context, timeInMs }: ShowOptions) {
    const image = this.#getImage(timeInMs);
    const dest = this.destRectSchedule.at(timeInMs);

    if (!image) return;
    if (!image.somethingIsAvailable) {
      SlowImage.showError(context, dest.x, dest.y, dest.width, dest.height);
      return;
    }

    // Fit the image inside dest, preserving aspect ratio (centered).
    const imgAspect = image.naturalWidth / image.naturalHeight;
    const destAspect = dest.width / dest.height;
    let drawW: number, drawH: number;
    if (imgAspect > destAspect) {
      drawW = dest.width;
      drawH = dest.width / imgAspect;
    } else {
      drawH = dest.height;
      drawW = dest.height * imgAspect;
    }
    const drawX = dest.x + (dest.width - drawW) / 2;
    const drawY = dest.y + (dest.height - drawH) / 2;
    context.drawImage(
      image.data as CanvasImageSource,
      drawX,
      drawY,
      drawW,
      drawH,
    );
  }
}
