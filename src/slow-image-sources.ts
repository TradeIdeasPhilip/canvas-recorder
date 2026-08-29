import { assertFinite, makePromise } from "phil-lib/misc";
import { ALL_FORMATS, CanvasSink, Input, UrlSource } from "mediabunny";
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
   * The interface allows {@link ImportedVideo} to create a new promise each frame.
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

//  MARK: Imported Video

let tempLastRequest = -Infinity;

export class ImportedVideo extends SlowImage {
  #error: Promise<void> | undefined;
  #seekInProgress: undefined | ((reason?: any) => void);
  liveSync(timeInMs: number, speed: number): void {
    if (this.#seekInProgress) {
      // This should never happen.
      // It suggests an internal logic error.
      console.warn(
        "Calling ImportedVideo.liveSync() while a seek is in progress.",
      );
    }
    // TODO We should let the video run continuously.
    this.#videoElement.pause();
    const desiredTime = timeInMs / 1_000;
    const jump = desiredTime - tempLastRequest; // this.#videoElement.currentTime;
    if (Math.abs(jump) > 1 / 60 / 10) {
      tempLastRequest = desiredTime;
      this.#videoElement.currentTime = desiredTime;
    }
  }
  getPromise(timeInMs: number): Promise<void> {
    if (this.#error) {
      // Any failure is permanent.
      return this.#error;
    }
    if (this.#seekInProgress) {
      // This should never happen.
      // It suggests an internal logic error.
      console.warn(
        "Calling ImportedVideo.getPromise() while a seek is in progress.",
      );
    }
    const promise = makePromise();
    this.#seekInProgress = promise.reject;
    this.#videoElement.addEventListener(
      "seeked",
      () => {
        if (this.#videoElement.seeking) {
          console.error("Still seeking after “seeked” event fired");
        }
        if (!this.#seekInProgress) {
          console.log("wtf");
        }
        this.#seekInProgress = undefined;
        promise.resolve();
      },
      { once: true },
    );
    if (this.#videoElement.seeking) {
      console.error("Already seeking before seek requested.");
    }
    this.#videoElement.currentTime = timeInMs / 1_000;
    if (!this.#videoElement.seeking) {
      console.error("Not seeking after seek requested.");
    }
    return promise.promise;
  }
  // TODO `document` is unavailable in Node.js (record/cli-record.ts).
  readonly #videoElement = document.createElement("video");
  readonly data: CanvasImageSourceWebCodecs = this.#videoElement;
  get naturalWidth() {
    return this.#videoElement.videoWidth;
  }
  get naturalHeight() {
    return this.#videoElement.videoHeight;
  }
  get somethingIsAvailable() {
    // TODO test this.
    // The image component works a different way.
    // Do these both handle src="" the same way?
    return this.naturalWidth > 0 && this.naturalHeight > 0 && !this.#error;
  }
  constructor(readonly url: string) {
    super();
    this.#videoElement.crossOrigin = "anonymous";
    this.#videoElement.addEventListener("error", (event) => {
      console.error(event, this);
      this.#error = Promise.reject(event.message);
      this.#seekInProgress?.(event.message);
    });
    this.#videoElement.src = url;
    // TODO   is there something like HTMLImageElement.decode() for HTMLVideoElement?
  }
  //     Implementation suggestions:

  // Render-to-file: seek and await a specific frame
  // There's no frame-number API on <video> — only time, which fits this project's philosophy fine. The core loop:

  // video.currentTime = timeInSeconds;
  // await new Promise<void>((resolve, reject) => {
  //   video.addEventListener("seeked", () => resolve(), { once: true });
  //   video.addEventListener("error", () => reject(video.error), { once: true });
  // });
  // // video now holds the frame at timeInSeconds; drawImage(video, ...) is safe.
  // seeked fires once the browser has actually landed on that time and has a decoded frame ready — that's your getPromise() for ImportedVideo, matching the "reject on failure" contract you already established for SingleImage. A couple of refinements worth having:
  // 	•	Skip the seek entirely if Math.abs(video.currentTime - timeInSeconds) < epsilon — requestFrame() may get called again before the previous seek's promise settles or with a time you're already sitting on, and reseeking to the same spot is wasted work.
  // 	•	If you want certainty about which frame actually got presented (not just "a seek finished"), video.requestVideoFrameCallback(callback) gives you { mediaTime, presentedFrames, ... } metadata — more precise than seeked alone, but check your TS lib version has it typed (it's fairly recent; you may need a small ambient declaration, same as the DOMMatrix shim in record/cli-record.ts).
  // 	•	Set video.crossOrigin = "anonymous" before setting .src, same as SingleImage does for images — otherwise drawImage(video, …) taints the canvas the moment the source isn't same-origin with proper CORS headers.
  // 	•	somethingIsAvailable maps naturally to video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA (2).
  // Live: match playback speed, don't fight the clock
  // Set video.playbackRate to the same multiplier you already track as audioPlaybackRate, mute it (video.muted = true, since your own audio pipeline is the sound source), call .play() once when your timer starts, .pause() when it stops, and hard-set video.currentTime on explicit seeks/scrubs — mirroring exactly what startAudio()/stopAudio()/setPlaybackRate() already do for the AudioBufferSourceNode.
  // Should you worry about drift? Yes, a little — don't just set the initial time and walk away. Your currentAudioTimeMs() is driven by AudioContext.currentTime, which tracks the audio hardware clock — very stable. <video>'s internal clock is driven by its own decode/render pipeline and is not guaranteed to stay locked to that, especially away from playbackRate = 1.0 or under any system load; over tens of seconds a real (if small) offset is plausible. Given your own tolerance ("off by a frame or two is fine"), you don't need per-frame reseeking — that would actually cause visible stutter, since <video> seeking isn't built to be called every animation frame. Instead, check drift cheaply every rAF tick and only correct when it exceeds a threshold:

  // const expected = currentAudioTimeMs() / 1000; // your timer is authoritative
  // if (Math.abs(video.currentTime - expected) > 0.05 /* ~3 frames @ 60fps */) {
  //   video.currentTime = expected;
  // }
  // That's the standard "genlock" pattern (used the same way in video conferencing / AV-sync code): let the video element run natively via .play()/.playbackRate most of the time, and snap it back only when it's actually drifted past your tolerance — cheap, and matches what you already said is acceptable.

  // Notes after trying a few things from the console:
  // https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/seeked_event
  // does what I need for recording.
  // Even if I request the exact same frame twice in a row,
  // or if request 0.00001 more than last time, it will do the callback.
  // Set the video.src value *before* trying to seek or you might get spurious callbacks.
  // If you request a time before 0 or after video.duration, video.currentTime will be clamped in range.
  // If you request a time between two frames video.currentTime will return the requested time.

  // I get https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/error_event
  // any time I set video.src to an invalid url, including "".
  // I have never seen that as a result of seek,
  // but I can imagine it happening if a file is partially bad or the network gives out while seeking.
}

// MARK: Imported Media Bunny Video

/**
 * Same job as {@link ImportedVideo}, but reads frames via Mediabunny's WebCodecs-based
 * `Input`/`CanvasSink` instead of an `HTMLVideoElement` + `currentTime` seeking.
 *
 * This exists to compare the two approaches for the render-to-file case: a `<video>`
 * element re-decodes from the nearest preceding keyframe on *every* seek (even a
 * single-frame step), which gets expensive fast on a file with a long GOP.
 * `CanvasSink` gives more direct control and, for sequential access in particular,
 * can decode each packet at most once instead of repeatedly re-walking a GOP.
 *
 * `data` differs from {@link ImportedVideo} in an important way: `ImportedVideo.data`
 * is a fixed reference to one `<video>` element that the browser mutates in place, so
 * whichever frame is "current" is always found at that same reference.  There is no
 * single mutable object like that here — each decoded frame is its own canvas — so
 * `data` is a getter over the most recently decoded canvas, swapped out every time
 * {@link getPromise} or {@link liveSync} pulls a new one.
 */
export class ImportedMediaBunnyVideo extends SlowImage {
  #error: Promise<void> | undefined;
  #naturalWidth = 0;
  #naturalHeight = 0;
  #currentCanvas: HTMLCanvasElement | OffscreenCanvas;
  get data(): CanvasImageSourceWebCodecs {
    return this.#currentCanvas;
  }
  get naturalWidth() {
    return this.#naturalWidth;
  }
  get naturalHeight() {
    return this.#naturalHeight;
  }
  get somethingIsAvailable() {
    return this.#naturalWidth > 0 && this.#naturalHeight > 0 && !this.#error;
  }
  /**
   * Resolves once the input's primary video track has been found and the
   * {@link CanvasSink} is ready to pull frames from it.  Rejects (and sets
   * {@link #error}) if the file has no video track or fails to open.
   */
  readonly #sinkReady: Promise<CanvasSink>;
  #seekInProgress = false;
  constructor(readonly url: string) {
    super();
    // TODO `document` is unavailable in Node.js (record/cli-record.ts) --
    // same limitation ImportedVideo has today.
    this.#currentCanvas = document.createElement("canvas");
    const input = new Input({
      source: new UrlSource(url),
      formats: ALL_FORMATS,
    });
    this.#sinkReady = (async () => {
      const track = await input.getPrimaryVideoTrack();
      if (!track) {
        throw new Error(`No video track found in "${url}".`);
      }
      this.#naturalWidth = track.displayWidth;
      this.#naturalHeight = track.displayHeight;
      // A small pool keeps VRAM use constant instead of allocating a fresh
      // canvas for every frame.  See the "performance" note on this class --
      // tune this once we know how it behaves in practice.
      return new CanvasSink(track, { poolSize: 2 });
    })();
    // Report setup failures the same way SingleImage does, so somethingIsAvailable
    // reflects a bad file even before anyone calls getPromise()/liveSync().
    this.#sinkReady.catch((e) => {
      this.#error = Promise.reject(e);
      this.#error.catch(() => {});
    });
  }
  /**
   * See {@link SlowImage.getPromise}'s doc comment for the live-vs-recording contract.
   * @param timeInMs Where to seek to, in milliseconds from the start of this clip.
   */
  async getPromise(timeInMs: number): Promise<void> {
    if (this.#error) {
      // Any failure is permanent.
      return this.#error;
    }
    if (this.#seekInProgress) {
      // This should never happen in the recording path (each frame is
      // requested and awaited before the next begins), but liveSync() can
      // still be mid-fetch when this fires.
      console.warn(
        "Calling ImportedMediaBunnyVideo.getPromise() while a fetch is in progress.",
      );
    }
    this.#seekInProgress = true;
    try {
      const sink = await this.#sinkReady;
      const wrapped = await sink.getCanvas(timeInMs / 1_000);
      if (wrapped) {
        this.#currentCanvas = wrapped.canvas;
      }
      // wrapped is null only when timeInMs is before the track's first
      // frame -- leave #currentCanvas as it was, same as ImportedVideo just
      // staying on whatever frame it's already showing.
    } catch (e) {
      this.#error = Promise.reject(e);
      this.#error.catch(() => {});
      throw e;
    } finally {
      this.#seekInProgress = false;
    }
  }
  /**
   * TODO We should let the video run continuously, same as {@link ImportedVideo.liveSync}.
   * For now this just jumps to the nearest available frame -- good enough to compare
   * the two approaches side by side while paused / scrubbing on the timeline.
   * `speed` is unused until continuous playback is implemented.
   */
  liveSync(timeInMs: number, speed: number): void {
    void speed;
    if (this.#seekInProgress) {
      // Already fetching a frame -- don't pile on another overlapping
      // request.  The next liveSync() tick will catch up.
      return;
    }
    void this.getPromise(timeInMs).catch(() => {
      // getPromise() already recorded the failure in #error; swallow here
      // so this fire-and-forget call doesn't produce an unhandled rejection.
    });
  }
}
