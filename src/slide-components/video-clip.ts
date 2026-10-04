import { ALL_FORMATS, CanvasSink, Input, UrlSource, WrappedCanvas } from "mediabunny";
import { ComponentWithLiveDuration } from "./live-duration";
import { ReadOnlyRect } from "phil-lib/misc";
import { RectangleScheduleInfo } from "../schedule-helper";
import { Scalar, ShowOptions, SoundClip } from "../showable";
import { SlowImage } from "../slow-image-sources";
import { Keyframe } from "../interpolate";
import { debugLog } from "../debug-log";
import { readVideoInfo, VideoInfo } from "./video-info";

// MARK: Streaming Frame Sources

// If you see "Unsupported edit list: multiple edits are not currently supported. Only using first edit."
// This message comes from Mediabunny.
// This can be caused by editing a file with QuickTime and cutting something out of the middle.
// Trimming seems to work okay, but if the editor shows N+1 clips before saving, I get N copies of this message.
// If you need to fix a file like this, try `ffmpeg -i input.mov -c copy output.mp4`.

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

  constructor(
    private readonly sink: CanvasSink,
    private readonly label: string,
  ) {}

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
 * How far `frame` is from `seconds`, in milliseconds.  0 when `seconds` falls
 * inside the frame; positive when the frame is ahead of the request, negative
 * when it's behind, measured to the frame's nearest edge.
 */
function frameError(frame: WrappedCanvas, seconds: number): number {
  if (seconds < frame.timestamp) {
    return Math.round((frame.timestamp - seconds) * 1_000);
  }
  const end = frame.timestamp + frame.duration;
  if (seconds >= end) {
    return -Math.round((seconds - end) * 1_000);
  }
  return 0;
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

  constructor(
    private readonly sink: CanvasSink,
    private readonly label: string,
  ) {}

  /** Frames from the current stream, oldest first. */
  #localCache: WrappedCanvas[] = [];
  /**
   * Frames from the stream before the last reseek, still shown until the new
   * stream produces its first frame.  Empty except during that gap.
   *
   * A reseek used to empty the cache on the spot, leaving nothing at all to
   * draw until the decoder caught up — that was the red X.  An old frame with
   * the "close enough" mark is better than nothing, which is the point of
   * this class.
   */
  #staleFrames: WrappedCanvas[] = [];
  #iter: AsyncGenerator<WrappedCanvas, void, unknown> | undefined;
  /** A fetch for the *current* stream is in flight.  One for an abandoned stream doesn't count. */
  #fetchInProgress = false;
  #atEnd = false;
  #canceled = false;
  /**
   * Which stream is current.  Bumped by every reseek.  A fetch started on an
   * older stream can still finish afterwards; this is how it knows to throw
   * its frame away instead of mixing it into the new stream's cache.
   */
  #generation = 0;
  /** performance.now() when the current stream was opened.  For the debug log. */
  #streamOpenedAt = 0;

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

    // The request jumped (scrub, chapter change, falling behind, ...) far
    // enough that catching up frame by frame isn't worth it.  Reseek instead.
    //
    // While a reseek is still waiting for its first frame, #localCache is
    // empty, so this can't fire again:  at most one reseek is in flight at a
    // time.  If the request moves on in the meantime, it gets a reseek of its
    // own as soon as that first frame lands.
    const newest = this.#localCache.at(-1)?.timestamp;
    const tooFarAhead =
      newest !== undefined && seconds - newest > RafFrameSource.MAX_SKIP_SECONDS;
    const tooFarBehind =
      this.#localCache[0] !== undefined && seconds < this.#localCache[0].timestamp;
    if (tooFarAhead || tooFarBehind) {
      this.#reseek(seconds, tooFarAhead ? "too far ahead" : "too far behind");
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
    if (first) {
      return { frame: first.canvas, error: frameError(first, seconds) };
    }

    // Between a reseek and its first frame:  the closest of the old frames.
    // Its error is usually large, so show() will mark it.
    let closest: WrappedCanvas | undefined;
    for (const frame of this.#staleFrames) {
      if (
        !closest ||
        Math.abs(frameError(frame, seconds)) <
          Math.abs(frameError(closest, seconds))
      ) {
        closest = frame;
      }
    }
    if (closest) {
      return { frame: closest.canvas, error: frameError(closest, seconds) };
    }

    // Genuinely nothing:  the very first request, before any frame has ever arrived.
    debugLog(
      "RafFrameSource",
      `${this.label}: get(${seconds.toFixed(3)}s) MISS -- nothing decoded yet (stream #${this.#generation}), returning undefined`,
    );
    return undefined;
  }

  /**
   * Abandon the current stream and start a new one at `seconds`.
   *
   * The frames we already have stay on screen (see {@link #staleFrames}) until
   * the new stream's first frame replaces them.
   */
  #reseek(seconds: number, reason: string): void {
    this.#generation++;
    debugLog(
      "RafFrameSource",
      `${this.label}: reseek to stream #${this.#generation} (${reason}) -- ` +
        `requested=${seconds.toFixed(3)}s, had [${this.#localCache[0]?.timestamp.toFixed(3)}..${this.#localCache.at(-1)?.timestamp.toFixed(3)}]; ` +
        `keeping those ${this.#localCache.length} frame(s) on screen until the new stream's first frame`,
    );
    void this.#iter?.return().catch(() => {});
    this.#iter = undefined;
    // #localCache is never empty here (that's what triggered the reseek), and
    // an earlier reseek's stale frames were dropped when its first frame came.
    this.#staleFrames = this.#localCache;
    this.#localCache = [];
    this.#atEnd = false;
    // Any fetch in flight belongs to the old stream now.  Don't wait for it.
    this.#fetchInProgress = false;
  }

  #maybeRequestMore(seconds: number): void {
    if (this.#canceled || this.#atEnd || this.#fetchInProgress) return;
    if (this.#localCache.length >= RafFrameSource.MAX_FRAMES) return;

    if (!this.#iter) {
      this.#iter = this.sink.canvases(seconds);
      this.#streamOpenedAt = performance.now();
    }
    this.#fetchInProgress = true;
    const generation = this.#generation;
    this.#iter.next().then(
      (result) => {
        // Started before a reseek.  The frame belongs to a stream nobody wants
        // any more, and the flags belong to the new stream.  Touch nothing.
        if (generation !== this.#generation) return;
        this.#fetchInProgress = false;
        if (this.#canceled) return;
        if (result.done) {
          this.#atEnd = true;
          debugLog("RafFrameSource", `${this.label}: stream #${generation} ended`);
          return;
        }
        this.#localCache.push(result.value);
        if (this.#localCache.length === 1) {
          // The first frame of this stream.  (Consuming always leaves one
          // frame behind, so the cache can only be this short once per stream.)
          const elapsed = (performance.now() - this.#streamOpenedAt).toFixed(1);
          debugLog(
            "RafFrameSource",
            `${this.label}: first frame of stream #${generation} -- timestamp=${result.value.timestamp.toFixed(3)}s, ` +
              (this.#staleFrames.length > 0
                ? `replacing ${this.#staleFrames.length} stale frame(s) that filled the gap for ${elapsed}ms`
                : `took ${elapsed}ms to decode`),
          );
          this.#staleFrames = [];
        }
      },
      (error) => {
        if (generation !== this.#generation) return;
        // A failed decode just means we stay at whatever we already have;
        // the next get() will try again.
        this.#fetchInProgress = false;
        debugLog("RafFrameSource", `${this.label}: decode failed (stream #${generation}): ${error}`);
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
  constructor(
    private readonly sink: CanvasSink,
    private readonly label: string,
  ) {}
  #current: AsyncFrameSource | RafFrameSource | undefined;
  cancel() {
    this.#current?.cancel();
    this.#current = undefined;
  }
  getAsync(timeInMs: number): Promise<Frame | undefined> {
    if (!(this.#current instanceof AsyncFrameSource)) {
      this.cancel();
      this.#current = new AsyncFrameSource(this.sink, this.label);
    }
    return this.#current.get(timeInMs);
  }
  getRaf(timeInMs: number): { frame: Frame; error: number } | undefined {
    if (!(this.#current instanceof RafFrameSource)) {
      this.cancel();
      this.#current = new RafFrameSource(this.sink, this.label);
    }
    return this.#current.get(timeInMs);
  }
}

// MARK: Video Clip

/**
 * Everything needed to draw frames from one video file: the open Mediabunny
 * pipeline plus the natural pixel dimensions, read once when the URL is
 * (re)opened.
 */
type OpenVideo = {
  readonly frameSource: FrameSource;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  /**
   * The statistics the Visual Editor shows.  A separate promise, deliberately
   * not awaited by {@link openVideo}:  sampling the frame rate reads packets,
   * and that should never delay the first frame appearing on screen.
   */
  readonly info: Promise<VideoInfo>;
};

async function openVideo(url: string): Promise<OpenVideo> {
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) {
    throw new Error(`No video track found in "${url}".`);
  }
  const naturalWidth = await track.getDisplayWidth();
  const naturalHeight = await track.getDisplayHeight();
  // poolSize is left at the default (disabled): RafFrameSource can hold up
  // to MAX_FRAMES canvases alive at once, and a pool smaller than that would
  // silently overwrite a frame we're still displaying.  Revisit only if
  // per-frame allocation turns out to matter in practice.
  const frameSource = new FrameSource(new CanvasSink(track), url);
  const info = readVideoInfo(input, track);
  // Nobody may ever ask for the info; don't let that become an unhandled rejection.
  info.catch(() => {});
  return { frameSource, naturalWidth, naturalHeight, info };
}

export class VideoClipComponent extends ComponentWithLiveDuration {
  /**
   * How far off (ms) a live-mode "close enough" frame can be before show()
   * marks it visually.  Below this, the frame is used silently -- ordinary
   * playback jitter, not worth flagging.  First guess at the threshold;
   * tune once this has actually been watched in practice.
   */
  static readonly CLOSE_ENOUGH_MARK_THRESHOLD_MS = 100;
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
  /**
   * Usually this file's own audio, added by the Visual Editor's Import audio
   * button.  It lives here rather than on the scene so it stays lined up with
   * the picture when the clip moves on the timeline:  each sound clip's start
   * is measured from the start of *this* component.
   */
  soundClips?: SoundClip[];

  #url = "";
  #videoPromise: Promise<OpenVideo> | undefined;
  /** Set once #videoPromise resolves -- see #getVideoPromise() for why this can't just be read off the promise itself. */
  #video: OpenVideo | undefined;
  /** The frame most recently fetched for an exact (recording) request; drawn by show() when playSpeed === "exact". */
  #lastExactFrame: Frame | undefined;

  /**
   * (Re)opens the video if the URL changed since the last call.  Returns
   * undefined if there is no URL to show.
   */
  #getVideoPromise(): Promise<OpenVideo> | undefined {
    const url = this.urlScalar.value;
    if (url !== this.#url) {
      this.#url = url;
      this.#video = undefined;
      this.#lastExactFrame = undefined;
      // The old FrameSource (if any) is simply dropped.  Unlike
      // FilePathSource (Node-only), UrlSource holds no OS-level resource
      // like a file handle, so there's nothing to explicitly release.
      this.#videoPromise = url ? openVideo(url) : undefined;
      // A promise only resolves its .then() callbacks in a later microtask,
      // even if already settled -- so show() (synchronous) can't peek at
      // #videoPromise directly.  This side-channel keeps #video, a plain
      // field, in sync for show() to read.  Attaching .then() here (even
      // though a separate .then() in getFramePromises() also observes this
      // same promise) is what marks #videoPromise's rejection "handled" --
      // no unhandled-rejection console noise either way.
      this.#videoPromise?.then((v) => (this.#video = v)).catch(() => {});
    }
    return this.#videoPromise;
  }

  /**
   * Cheap facts about the file at the current URL, for the Visual Editor.
   *
   * This shares the one open this component already uses to draw frames, so
   * asking costs nothing extra, and it (re)opens the file if the URL changed —
   * even when this clip isn't on screen at the current playhead.
   *
   * `undefined` when there is no URL.  Rejects when the file can't be opened,
   * which is routine while someone is still typing the name.
   */
  videoInfo(): Promise<VideoInfo> | undefined {
    return this.#getVideoPromise()?.then((video) => video.info);
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
    const videoPromise = this.#getVideoPromise();
    const clipTimeMs = this.locationInClip(timeInMs);
    if (videoPromise && !Number.isNaN(clipTimeMs)) {
      set.add(
        videoPromise.then(({ frameSource }) =>
          frameSource.getAsync(clipTimeMs).then((frame) => {
            this.#lastExactFrame = frame;
          }),
        ),
      );
    }
    super.getFramePromises(timeInMs, set);
  }
  override show(options: ShowOptions): void {
    const { context, playSpeed, timeInMs } = options;
    const destination = this.destinationRectSchedule.at(timeInMs);
    const videoPromise = this.#getVideoPromise();
    const clipTimeMs = this.locationInClip(timeInMs);

    if (videoPromise && !Number.isNaN(clipTimeMs)) {
      let frame: Frame | undefined;
      let frameError: number | undefined; // ms; see RafFrameSource.get(). Only set in live mode.
      if (playSpeed === "exact") {
        // Already requested and cached by getFramePromises().
        frame = this.#lastExactFrame;
      } else {
        const result = this.#video?.frameSource.getRaf(clipTimeMs);
        frame = result?.frame;
        frameError = result?.error;
      }

      if (!frame || !this.#video) {
        debugLog(
          "VideoClip",
          `${this.urlScalar.value || "(no url)"}: drawing X -- mode=${playSpeed === "exact" ? "exact" : "live"}, ` +
            `clipTimeMs=${clipTimeMs.toFixed(1)}, reason=${!this.#video ? "video not open yet" : "no frame available"}`,
        );
        SlowImage.showError(
          context,
          destination.x,
          destination.y,
          destination.width,
          destination.height,
        );
      } else {
        const sourceAspect = this.#video.naturalWidth / this.#video.naturalHeight;
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
        context.drawImage(frame, drawX, drawY, drawW, drawH);

        if (
          frameError !== undefined &&
          Math.abs(frameError) > VideoClipComponent.CLOSE_ENOUGH_MARK_THRESHOLD_MS
        ) {
          debugLog(
            "VideoClip",
            `${this.urlScalar.value}: close-enough mark -- error=${frameError}ms, clipTimeMs=${clipTimeMs.toFixed(1)}`,
          );
          // "Close enough" but not exact -- a small corner mark, not
          // anything that obscures the frame itself.  Color notes which
          // direction: the returned frame is ahead of (cyan) or behind
          // (orange) where we actually asked to be.
          context.fillStyle = frameError > 0 ? "cyan" : "orange";
          const markRadius = Math.min(destination.width, destination.height) * 0.03;
          context.beginPath();
          context.arc(
            destination.x + destination.width - markRadius * 2,
            destination.y + markRadius * 2,
            markRadius,
            0,
            Math.PI * 2,
          );
          context.fill();
        }
      }
    }
    super.show(options);
  }
  /**
   * Where in the clip's own timeline `timeInMs` (this component's local
   * time) falls, in milliseconds.  NaN outside [0, duration].
   *
   * The end is clamped to be >= the start.  If the user sets these two
   * fields independently they may briefly end up reversed; playing
   * backwards isn't supported, so rather than throw or flip the direction we
   * just show the start frame, frozen, until the user fixes the range.
   */
  locationInClip(timeInMs: number): number {
    if (timeInMs < 0 || timeInMs > this.duration) {
      return NaN;
    }
    const start = this.startMsIntoClipScalar.value;
    const end = Math.max(start, this.endMsIntoClipScalar.value);
    if (this.duration > 0) {
      return (timeInMs / this.duration) * (end - start) + start;
    }
    return start;
  }
}
