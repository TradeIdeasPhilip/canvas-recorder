import { CanvasSink, WrappedCanvas } from "mediabunny";
import { ComponentWithLiveDuration } from "./live-duration";
import { ReadOnlyRect } from "phil-lib/misc";
import { RectangleScheduleInfo } from "../schedule-helper";
import { Scalar, ShowOptions } from "../showable";
import { ImportedMediaBunnyVideo, SlowImage } from "../slow-image-sources";
import { Keyframe } from "../interpolate";

// MARK: Proposed New Video Component,
// mediabunny streams

// If you see "Unsupported edit list: multiple edits are not currently supported. Only using first edit."
// This message comes from Mediabunny.
// This can be caused by editing a file with QuickTime and cutting something out of the middle.
// Trimming seems to work okay, but if the editor shows N+1 clips before saving, I get N copies of this message.
// If you need to fix a file like this, try `ffmpeg -i input.mov -c copy output.mp4`.
//
// So: document it as "caused by QuickTime's non-destructive trim/delete when the edit ends up with more than one remaining segment," not pause/resume — my original guess was wrong, this one's right. Practical note worth keeping alongside it: the ffmpeg -i in.mov -c copy out.mp4 stream-copy workaround from before still applies if you ever need one of these post-edit files to read correctly — it bakes the edit list into one clean segment.

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
  /**
   * How many frames we're willing to drain-and-discard from the current
   * stream before giving up and paying for a fresh seek instead.  Simple
   * first pass -- tune this once we have real numbers, per the "drain vs.
   * reseek" tradeoff: draining costs one decode per skipped frame, reseeking
   * costs "walk forward from the nearest keyframe," so draining only wins
   * for small gaps.
   */
  static readonly MAX_FRAMES_TO_SKIP = 30;

  constructor(private readonly sink: CanvasSink) {}

  #iter: AsyncGenerator<WrappedCanvas, void, unknown> | undefined;
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
    //
    // What we *can* do: check #canceled between steps of a multi-frame drain,
    // so a cancel that arrives mid-drain doesn't uselessly finish draining.
    // That's a best-effort speedup, not a guarantee -- a single in-flight
    // `await this.#iter.next()` can't be interrupted once it's started.
    if (this.#canceled) return undefined;

    const seconds = timeInMs / 1_000;

    // Already holding the requested frame -- no Mediabunny call needed.
    if (this.#mostRecent && this.#contains(this.#mostRecent, seconds)) {
      return this.#mostRecent.canvas;
    }

    const needBrandNewStream =
      !this.#iter || !this.#mostRecent || seconds < this.#mostRecent.timestamp;

    if (needBrandNewStream) {
      await this.#restart(seconds);
    } else {
      // Try draining forward first; it's cheap when the gap is small.
      for (let i = 0; i < AsyncFrameSource.MAX_FRAMES_TO_SKIP; i++) {
        if (this.#canceled) return undefined;
        const result = await this.#iter!.next();
        if (result.done) {
          this.#mostRecent = undefined;
          return undefined;
        }
        this.#mostRecent = result.value;
        if (this.#contains(this.#mostRecent, seconds)) {
          return this.#mostRecent.canvas;
        }
      }
      // Draining didn't get there -- the gap was bigger than we're willing
      // to walk one frame at a time.  Pay for one seek instead.
      await this.#restart(seconds);
    }

    if (this.#canceled) return undefined;
    return this.#mostRecent?.canvas;
  }

  #contains(frame: WrappedCanvas, seconds: number): boolean {
    return seconds >= frame.timestamp && seconds < frame.timestamp + frame.duration;
  }

  async #restart(seconds: number): Promise<void> {
    await this.#iter?.return();
    this.#iter = this.sink.canvases(seconds);
    const result = await this.#iter.next();
    this.#mostRecent = result.done ? undefined : result.value;
  }

  cancel() {
    // This is explicitly not async.
    this.#canceled = true;
    // Best-effort: ask the stream to clean up (closes any VideoSamples it
    // decoded ahead of what we consumed).  Doesn't interrupt a get() that's
    // already awaiting a specific frame -- see the comment in get().
    void this.#iter?.return().catch(() => {});
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
  /**
   * If the request has moved more than this many seconds beyond the newest
   * frame we've already seen, don't bother trying to catch up frame by
   * frame -- throw away the stream and start fresh near the new target.
   * Simple first pass, same spirit as {@link AsyncFrameSource.MAX_FRAMES_TO_SKIP}.
   */
  static readonly MAX_SKIP_SECONDS = 0.5;

  constructor(private readonly sink: CanvasSink) {}

  #localCache: WrappedCanvas[] = [];
  #iter: AsyncGenerator<WrappedCanvas, void, unknown> | undefined;
  #fetchInProgress = false;
  #atEnd = false;
  #canceled = false;

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
    if (this.#canceled) return undefined;

    const seconds = timeInMs / 1_000;

    // The request jumped (scrub, chapter change, ...) far enough that
    // catching up frame by frame isn't worth it.  Reseek instead.
    const newest = this.#localCache.at(-1)?.timestamp;
    const tooFarAhead =
      newest !== undefined && seconds - newest > RafFrameSource.MAX_SKIP_SECONDS;
    const tooFarBehind =
      this.#localCache[0] !== undefined && seconds < this.#localCache[0].timestamp;
    if (tooFarAhead || tooFarBehind) {
      void this.#iter?.return().catch(() => {});
      this.#iter = undefined;
      this.#localCache.length = 0;
      this.#atEnd = false;
    }

    // Consume (discard) everything strictly before the requested time,
    // always leaving at least one frame -- even a stale one is better than
    // nothing to draw.
    while (
      this.#localCache.length > 1 &&
      seconds >= this.#localCache[1]!.timestamp
    ) {
      this.#localCache.shift();
    }

    // "Now might be a good time to check for more data."  No-ops on its own
    // if we're already at the end, canceled, or a request is in flight.
    this.#maybeRequestMore(seconds);

    const first = this.#localCache[0];
    if (!first) return undefined;

    let error: number;
    if (seconds < first.timestamp) {
      // The frame is ahead of the request.
      error = Math.round((first.timestamp - seconds) * 1_000);
    } else if (seconds >= first.timestamp + first.duration) {
      // The frame is behind the request.
      error = -Math.round((seconds - (first.timestamp + first.duration)) * 1_000);
    } else {
      error = 0;
    }
    return { frame: first.canvas, error };
  }

  #maybeRequestMore(seconds: number): void {
    if (this.#canceled || this.#atEnd || this.#fetchInProgress) return;
    if (this.#localCache.length >= RafFrameSource.MAX_FRAMES) return;

    if (!this.#iter) {
      this.#iter = this.sink.canvases(seconds);
    }
    this.#fetchInProgress = true;
    this.#iter.next().then(
      (result) => {
        this.#fetchInProgress = false;
        if (this.#canceled) return;
        if (result.done) {
          this.#atEnd = true;
          return;
        }
        this.#localCache.push(result.value);
      },
      () => {
        // A failed decode just means we stay at whatever we already have;
        // the next get() will try again.
        this.#fetchInProgress = false;
      },
    );
  }

  cancel() {
    // Close the stream.
    // Does it matter if there is a pending request?
    // Do the Mediabunny docs say anything about doing a cancel while a request is outstanding?
    // (These are the things that keep me up at night!)
    //
    // Same answer as AsyncFrameSource: no way to interrupt an in-flight
    // request, so this is best-effort cleanup, not a guarantee.
    this.#canceled = true;
    void this.#iter?.return().catch(() => {});
  }
}

// Three classes for encapsulation.
// Lots of disposable objects to keep the logic simple.
// Small, simple interface.
// Knows nothing about the main program's logic.
class FrameSource {
  // Opening the file (Input + track + CanvasSink) is the expensive,
  // mode-independent part -- that's the "Mediabunny source" that gets reused
  // across live/record switches.  Deciding *how* to read frames out of it
  // (AsyncFrameSource vs. RafFrameSource) is what's cheap to throw away.
  // Turning a URL into a CanvasSink is main-program-ish setup work (parsing,
  // fetching, opening), so it's left to the caller -- this class only knows
  // how to read from an already-open sink.
  // The source can be read only.
  // Cancel this object and create a new one with the new request.
  constructor(private readonly sink: CanvasSink) {}
  #current: AsyncFrameSource | RafFrameSource | undefined;
  cancel() {
    this.#current?.cancel();
    this.#current = undefined;
  }
  getAsync(timeInMs: number): Promise<Frame | undefined> {
    if (!(this.#current instanceof AsyncFrameSource)) {
      this.cancel();
      this.#current = new AsyncFrameSource(this.sink);
    }
    return this.#current.get(timeInMs);
  }
  getRaf(timeInMs: number): { frame: Frame; error: number } | undefined {
    if (!(this.#current instanceof RafFrameSource)) {
      this.cancel();
      this.#current = new RafFrameSource(this.sink);
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
