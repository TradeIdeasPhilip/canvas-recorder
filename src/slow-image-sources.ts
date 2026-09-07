import { assertFinite } from "phil-lib/misc";
import { ShowOptions } from "./showable";

// MARK: Base Class

/**
 * A common interface for requesting image data.
 *
 * The drawing routines in this program were meant to be fast and immediate.
 * I do a lot of drawing in every animation frame.
 * (I.e. ~60hz, no await, freezing would be very noticeable.)
 *
 * The impetus behind this class hierarchy is copying frames from another video.
 * This might not be strictly required for normal images, especially those served locally, but it seems robust and simple to use this.
 *
 * This class explicitly hides any and all HTML elements.
 * Those are part of the implementation.
 * All code in /src should (ideally) be able to run in node.js or in a browser thread.
 */
export abstract class SlowImage {
  /**
   * Draw on a canvas to show the user that an image was unable to load.
   *
   * This is aimed at development and previews.
   * If there is a problem when saving a video, that usually throws an exception.
   *
   * This draws a red rectangle showing the borders edges of the area, and a red x going through the middle.
   * This is an old standard for showing missing images.
   * This is always available, so we're not worried about an await or another exception in an exception handler.
   *
   * Side effects:
   * This will take the same liberties with your canvas as described in {@link ShowOptions.context}.
   * (These are standard conventions within this project.)
   * @param destination A canvas context to draw on.
   * @param x The left side of where the image was going to be.
   * @param y The top side of where the image was going to be.
   * @param width The width of what you were going to display.
   * @param height The height of what you were going to display.
   */
  static showError(
    destination: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    assertFinite(x, y, width, height);
    if (width <= 0 || height <= 0) {
      throw new Error("wtf");
    }
    const lineWidth = 0.1;
    if (width < lineWidth * 2 || height < lineWidth * 2) {
      // Too small to try to show detail.
      // Our graphics might escape from the bounds.
      // This fallback is too simple to fail.
      destination.fillStyle = "red";
      destination.fillRect(x, y, width, height);
    } else {
      destination.strokeStyle = "red";
      destination.lineWidth = lineWidth;
      destination.lineJoin = "miter";
      // Make the lines fit perfectly within the region.
      x += lineWidth / 2;
      y += lineWidth / 2;
      width -= lineWidth;
      height -= lineWidth;
      destination.beginPath();
      destination.moveTo(x, y);
      destination.lineTo(x + width, y);
      destination.lineTo(x + width, y + height);
      destination.lineTo(x, y + height);
      destination.closePath();
      destination.stroke();
      // So the corners of the diagonal lines don't stick out.
      destination.lineCap = "round";
      destination.beginPath();
      destination.moveTo(x, y);
      destination.lineTo(x + width, y + height);
      destination.moveTo(x, y + height);
      destination.lineTo(x + width, y);
      destination.stroke();
    }
  }
  abstract readonly data: CanvasImageSourceWebCodecs;
  /** Intrinsic pixel width of the source.  0 until {@link somethingIsAvailable} is true. */
  abstract readonly naturalWidth: number;
  /** Intrinsic pixel height of the source.  0 until {@link somethingIsAvailable} is true. */
  abstract readonly naturalHeight: number;
  /**
   * This true after the file has been decoded and there is *something* available to be copied from the buffer.
   * If this is false, consider using {@link showError}() to notify the user, and continue with the rest of the processing.
   * In the case of a video, you might not be on the right frame.
   * Use {@link getPromise}() if you need an exact frame, like when you are saving the video result.
   * In realtime mode just use what's there and assume it's close.
   */
  abstract readonly somethingIsAvailable: boolean;
}

// MARK: Single Image

export class SingleImage extends SlowImage {
  #somethingIsAvailable = false;
  get somethingIsAvailable() {
    return this.#somethingIsAvailable;
  }
  readonly data: CanvasImageSourceWebCodecs;
  get naturalWidth() {
    return this.#element.naturalWidth;
  }
  get naturalHeight() {
    return this.#element.naturalHeight;
  }
  /**
   * {@link SingleImage} only uses the promise for loading and decoding.
   * And there is no way to change the url after constructing this object.
   * So we only need a single promise to handle the state of this object.
   */
  readonly #promise: Promise<void>;
  /**
   * Report data is available.
   *
   * Note:  This only applies to loading and decoding the data, *and* it applies to displaying the correct frame.
   *
   * Note:  On any failure this should throw/reject.
   * The standard \<img>.decode() can reject with an `EncodingError`, but in some
   * browsers it resolves silently even when the image is broken (naturalWidth === 0).
   * `SingleImage` covers both cases: it checks `naturalWidth` after decode resolves
   * and converts a silent success-with-broken-image into a rejection.
   *
   * We are explicitly returning a promise to `void`.
   * This property only provides a wake up call.
   * If you need any more information (like the actual image data) save a pointer to this object itself.
   *
   * Use cases:
   * * Live
   *   * Ignore the promise.
   *   * Always check if {@link somethingIsAvailable};
   *   * If not, use {@link showError}() to indicate the error to the user.
   *   * No need for additional diagnostics.  You can always set a breakpoint on showError().
   * * Recording
   *   * Ask the each frame for *all* its promises then await them all at once then draw the frame.
   *   * The same code will do the actual drawing for live and recorded video.
   *   * If any promise rejects the whole process will be aborted.
   *   * Any work in progress will be cleanly flushed and closed.
   */
  getPromise(): Promise<void> {
    return this.#promise;
  }
  #element: HTMLImageElement;
  constructor(readonly url: string) {
    super();
    this.#element = new Image();
    this.#element.crossOrigin = "anonymous";
    this.data = this.#element;
    this.#element.src = url;
    this.#promise = this.#element.decode().then(() => {
      if (this.#element.naturalWidth <= 0 || this.#element.naturalHeight <= 0) {
        throw new Error(`Unable to load "${url}".`);
      } else {
        this.#somethingIsAvailable = true;
      }
    });
    // Silence "unhandled rejection" noise in the console.
    // The promise stays rejected — getPromise() callers still receive the error.
    this.#promise.catch(() => {});
  }
}
