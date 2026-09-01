import { WrappedCanvas } from "mediabunny";
import { ComponentWithLiveDuration } from "./live-duration";
import { ReadOnlyRect } from "phil-lib/misc";
import { RectangleScheduleInfo } from "../schedule-helper";
import { Scalar, ShowOptions } from "../showable";
import { ImportedMediaBunnyVideo, SlowImage } from "../slow-image-sources";
import { Keyframe } from "../interpolate";

// MARK: Proposed New Video Component,
// mediabunny streams

/**
 * A single frame of the input video clip.
 *
 * This is *some version of* a canvas.
 */
type Frame = WrappedCanvas["canvas"];

/**
 * Request frames, awaiting the exact result.
 */
class AsyncFrameSource {
  // Constructor will take a Mediabunny source as an input.
  // That gets reused when we change modes.

  #mostRecent: WrappedCanvas | undefined;
  #canceled = false;
  async get(timeInMs: number): Promise<Frame | undefined> {
    // This might reuse #mostRecent,
    // it might read more from the current stream, leaving the returned value in #mostRecent,
    //   or it might start a new stream.
    // It is possible that the stream does not contain the requested Frame
    //   in which case we return undefined.
    // Cancel could happen during a get().
    // I'm not sure exactly what happens if someone hits the "Stop Recording" button while we are waiting on this function to complete.
    // Nasty edge case!!!!
    //
    // I was hoping to avoid this, but maybe we need to make a second promise just for cancels.
    // I don't think mediabunny provides a way of canceling a pending request.
    // it would be very clean if we could guarantee that this get returned immediately, but that's almost impossible
    // I don't like this!
    // I don't know how to avoid it.
    // I think the caller needs to be responsible for this, not us.
    // If someone hits "Cancel Recording" it is up to the main program to deal with the fact
    // that a request to this function is still pending.

    // TODO
    return undefined!;
  }
  cancel() {
    // This is explicitly not async.
    this.#canceled = true;
    // Maybe resolve a promise.
    // Maybe ask the request to die early.
    // almost certainly close the iterator / stream of canvasses.
  }
}

/**
 * Request frames immediately, doing the best it can.
 */
class RafFrameSource {
  /**
   * How many frames to read ahead.
   * This refers to what this object is keeping in memory,
   * seperate from Mediabunny's internal read ahead.
   */
  static readonly MAX_FRAMES = 5;
  #localCache: WrappedCanvas[] = [];

  get(timeInMs: number): { frame: Frame; error: number } | undefined {
    // AsyncFrameSource only returned a canvas.
    // The assumption was that either the request failed or it succeeded.
    // The realtime version will have a third category:  "close enough".
    // The spec (currently only on paper, not on the computer yet) says that the display will include some indication if we are display a "close enough" frame.
    // The details are not complete, but presumably we want to include an indication of how far off and in which direction.
    // error will be 0 for perfect, or the number of milliseconds that we are off.
    // + means the returned value is ahead of the request
    // - means behind.
    // 0 means the request was somewhere, anywhere, within the frame we returned.
    // Otherwise error is the distance between the request and the *closest* edge of the frame we returned.
    // If this returns the first item in #localCache, then we leave #localCache in tact.
    // Otherwise we consume all items before the requested one.
    // And we notify someone in case we need to send another request to Mediabunny.

    // TODO
    return undefined!;
  }
  cancel() {
    // Close the stream.
    // Does it matter if there is a pending request?
    // Do the Mediabunny docs say anything about doing a cancel while a request is outstanding?
    // (These are the things that keep me up at night!)
  }
}

// Three classes for encapsulation.
// Lots of disposable objects to keep the logic simple.
// Small, simple interface.
// Knows nothing about the main program's logic.
class FrameSource {
  // We need a constructor that takes in a media bunny source,
  // or instructions for building the source (e.g. url of video).
  // The source can be read only.
  // Cancel this object and create a new one with the new request.
  #current: AsyncFrameSource | RafFrameSource | undefined;
  cancel() {
    this.#current?.cancel();
    this.#current = undefined;
  }
  getAsync(timeInMs: number): Promise<Frame | undefined> {
    if (!(this.#current instanceof AsyncFrameSource)) {
      this.cancel();
      this.#current = new AsyncFrameSource(/** Some arguments */);
    }
    return this.#current.get(timeInMs);
  }
  getRaf(timeInMs: number): { frame: Frame; error: number } | undefined {
    if (!(this.#current instanceof RafFrameSource)) {
      this.cancel();
      this.#current = new RafFrameSource(/** Some arguments */);
    }
    return this.#current.get(timeInMs);
  }
}

// MARK: Video Clip

export class VideoClipComponent extends ComponentWithLiveDuration {
  readonly registryKey = "Video Clip";
  readonly urlScalar: Scalar<"string"> = {
    description: "URL",
    type: "string",
    value: "",
  };
  readonly startMsIntoClipScalar: Scalar<"number"> = {
    description: "Start Ms Into Clip",
    type: "number",
    value: 0,
  };
  readonly endMsIntoClipScalar: Scalar<"number"> = {
    description: "End Ms Into Clip",
    type: "number",
    value: 1000,
  };
  readonly destinationRectSchedule = new RectangleScheduleInfo("Dest Rect", {
    x: 0,
    y: 0,
    width: 16,
    height: 9,
  });
  #video: ImportedMediaBunnyVideo | undefined;
  #getVideo() {
    const url = this.urlScalar.value;
    if (url == "") {
      this.#video = undefined;
    } else if (url !== this.#video?.url) {
      this.#video = url ? new ImportedMediaBunnyVideo(url) : undefined;
    }
    return this.#video;
  }
  constructor(
    initialValues: {
      description?: string;
      url?: string;
      startMsIntoClip?: number;
      endMsIntoClip?: number;
      duration?: number;
      destinationRect?: ReadOnlyRect | readonly Keyframe<ReadOnlyRect>[];
    } = {},
  ) {
    super(
      initialValues.description ?? "Video Clip",
      initialValues.duration ?? 1_000,
    );
    if (initialValues.url !== undefined) {
      this.urlScalar.value = initialValues.url;
    }
    if (initialValues.startMsIntoClip !== undefined) {
      this.startMsIntoClipScalar.value = initialValues.startMsIntoClip;
    }
    if (initialValues.endMsIntoClip !== undefined) {
      this.endMsIntoClipScalar.value = initialValues.endMsIntoClip;
    }
    if (initialValues.destinationRect !== undefined) {
      this.destinationRectSchedule.set(initialValues.destinationRect);
    }
    this.scalars.push(
      this.urlScalar,
      this.startMsIntoClipScalar,
      this.endMsIntoClipScalar,
    );
    this.schedules.push(this.destinationRectSchedule);
  }
  override getFramePromises(
    timeInMs: number,
    set: Pick<Set<Promise<unknown>>, "add">,
  ) {
    const video = this.#getVideo();
    if (video) {
      set.add(video.getPromise(timeInMs));
    }
    super.getFramePromises(timeInMs, set);
  }
  override show(options: ShowOptions): void {
    const { context, playSpeed, timeInMs } = options;
    const video = this.#getVideo();
    const destination = this.destinationRectSchedule.at(timeInMs);
    if (video) {
      if (playSpeed === "exact") {
        // This was already handled in getFramePromises().
      } else {
        video.liveSync(timeInMs, playSpeed);
      }
      if (!video.somethingIsAvailable) {
        SlowImage.showError(
          context,
          destination.x,
          destination.y,
          destination.width,
          destination.height,
        );
      } else {
        const sourceAspect = video.naturalWidth / video.naturalHeight;
        const destAspect = destination.width / destination.height;
        let drawW: number, drawH: number;
        if (sourceAspect > destAspect) {
          drawW = destination.width;
          drawH = destination.width / sourceAspect;
        } else {
          drawH = destination.height;
          drawW = destination.height * sourceAspect;
        }
        const drawX = destination.x + (destination.width - drawW) / 2;
        const drawY = destination.y + (destination.height - drawH) / 2;
        context.drawImage(video.data, drawX, drawY, drawW, drawH);
      }
    }
    super.show(options);
  }
  locationInClip(timeInMs: number): number {
    if (timeInMs < 0 || timeInMs > this.duration) {
      return NaN;
    }
    if (this.duration > 0) {
      return (
        (timeInMs / this.duration) *
          (this.endMsIntoClipScalar.value - this.startMsIntoClipScalar.value) +
        this.startMsIntoClipScalar.value
      );
    }
    return this.startMsIntoClipScalar.value;
  }
}
