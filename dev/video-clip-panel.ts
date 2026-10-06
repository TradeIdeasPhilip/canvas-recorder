import { ReadOnlyRect } from "phil-lib/misc";
import { Keyframe } from "../src/interpolate.ts";
import { SoundClip } from "../src/showable.ts";
import { VideoClipComponent } from "../src/slide-components/video-clip.ts";
import {
  centeredOnCanvas,
  maxFit,
  minCover,
  PIXELS_PER_UNIT,
  preservePixels,
  sameCenter,
  shrinkToAspect,
  VideoInfo,
} from "../src/slide-components/video-info.ts";
import { ALIGN_HORIZONTALLY, ALIGN_VERTICALLY, buildSnapRow } from "./rect-snap.ts";

/**
 * The `notes` on a sound clip that this panel created.  This is how it
 * recognizes its own work, so Re-import can replace rather than pile up
 * copies, and Remove can't touch anything the user added by hand.
 */
const IMPORTED_AUDIO_NOTE = "imported from video";

/** What the panel needs from the Visual Editor.  It never reaches into canvas-recorder.ts directly. */
export type VideoClipPanelHooks = {
  /**
   * Start / End were changed by a button.  Save, and rebuild the schedule
   * editor so the number fields show the new values.
   */
  readonly scalarsChanged: () => void;
  /** A Dest Rect keyframe's value was replaced.  Sync its number fields and on-canvas handles, and save. */
  readonly rectKeyframeChanged: (keyframe: Keyframe<ReadOnlyRect>) => void;
  /** The Dest Rect keyframe in ✎ edit mode, if there is one. */
  readonly editingRectKeyframe: () => Keyframe<ReadOnlyRect> | null;
};

export type VideoClipPanel = {
  readonly element: HTMLElement;
  /** The URL may have changed:  re-read the file, then redraw everything. */
  refresh(): void;
  /** Start, End, Duration or the Dest Rect changed:  redraw from what we already know.  Synchronous. */
  refreshDerived(): void;
  /** The video's width / height, once known.  For Shift-dragging the Dest Rect. */
  aspect(): number | undefined;
};

// MARK: Formatting

function formatMs(ms: number): string {
  const totalSeconds = ms / 1_000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${Math.round(ms)} ms (${minutes}:${seconds.toFixed(3).padStart(6, "0")})`;
}

function formatSpeed(speed: number): string {
  return `${speed.toFixed(speed >= 10 ? 1 : 2)}×`;
}

/**
 * Error text that won't alarm anyone.  While a URL is being typed, nearly
 * every keystroke names a file that doesn't exist, and that is not a problem.
 */
function quietError(error: unknown): string {
  const text = String(error);
  if (/404|not found|Failed to fetch/i.test(text)) return "Not found";
  if (/unsupported|unrecognized|format/i.test(text)) return "Not a video file this can read";
  return text.replace(/^Error:\s*/, "");
}

// MARK: Speed and sizing facts

/**
 * How fast the video plays.  1 means real time.  The clip shows End − Start
 * milliseconds of the file in Duration milliseconds of the scene, so these
 * three numbers alone decide it — which is the trap this panel exists to show.
 */
function playbackSpeed(clip: VideoClipComponent): number {
  const start = clip.startMsIntoClipScalar.value;
  const end = Math.max(start, clip.endMsIntoClipScalar.value);
  return clip.duration > 0 ? (end - start) / clip.duration : NaN;
}

const isRealTime = (speed: number) => Math.abs(speed - 1) < 0.0005;

/**
 * Output pixels per source pixel, for one Dest Rect keyframe.  1 is native
 * resolution.  Above 1 the video is being upscaled and will look soft.
 */
function nativeRatio(rect: ReadOnlyRect, info: VideoInfo): number {
  const drawn = shrinkToAspect(rect, info.video.width / info.video.height);
  return (drawn.width * PIXELS_PER_UNIT) / info.video.width;
}

/** The sound clip that would line this video's audio up with its picture, right now. */
function expectedSoundClip(
  clip: VideoClipComponent,
  audio: NonNullable<VideoInfo["audio"]>,
): SoundClip {
  const start = clip.startMsIntoClipScalar.value;
  const lengthMs = Math.max(start, clip.endMsIntoClipScalar.value) - start;
  // decodeAudioData() ignores the container's edit list, so decoded audio
  // position p lands at presentation time p + firstTimestamp.  To hear
  // presentation time `start` we read from start − firstTimestamp.  That is
  // usually a little *after* start (QuickTime recordings tend to have a
  // negative firstTimestamp); if it's before 0, the audio begins late, so wait
  // in the scene instead of reading from before the file starts.
  const readFrom = start - audio.firstTimestampMs;
  const lateBy = Math.max(0, -readFrom);
  return {
    source: clip.urlScalar.value,
    startMsIntoScene: lateBy,
    startMsIntoClip: Math.max(0, readFrom),
    lengthMs: Math.max(0, lengthMs - lateBy),
    notes: IMPORTED_AUDIO_NOTE,
  };
}

function sameSoundClip(a: SoundClip, b: SoundClip): boolean {
  const close = (x: number | undefined, y: number | undefined) =>
    x === y || (x !== undefined && y !== undefined && Math.abs(x - y) < 0.5);
  return (
    a.source === b.source &&
    close(a.startMsIntoScene, b.startMsIntoScene) &&
    close(a.startMsIntoClip, b.startMsIntoClip) &&
    close(a.lengthMs, b.lengthMs)
  );
}

// MARK: The panel

/**
 * The "Video File" panel shown at the top of the schedule editor when a
 * {@link VideoClipComponent} is selected.
 *
 * Statistics about the file, one-click trim / size actions, and audio import.
 * See development-plans/video-clip-panel.md.
 */
export function buildVideoClipPanel(
  clip: VideoClipComponent,
  hooks: VideoClipPanelHooks,
): VideoClipPanel {
  const panel = document.createElement("fieldset");
  panel.style.cssText = "border-color:#6a7fae;margin-bottom:0.4em";
  const legend = document.createElement("legend");
  legend.textContent = "Video File";
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
  const statsEl = line(panel, "font-size:0.9em;line-height:1.4");
  const derivedEl = line(panel, "font-size:0.9em;line-height:1.4;margin-top:0.3em");

  const timingRow = line(panel, "margin-top:0.5em");
  const wholeFileBtn = button(
    timingRow,
    "Whole file",
    "Start = 0, End = the end of the file, and Duration to match, so it plays in real time.",
  );
  const realTimeBtn = button(
    timingRow,
    "Play at 1×",
    "Set Duration to End − Start, so the video plays in real time.",
  );

  const rectRow = line(panel, "margin-top:0.4em");
  const rectButtons = [
    {
      text: "Fit canvas",
      title: "As large as possible while the whole video stays on the 16×9 canvas.  Centered.",
      make: (info: VideoInfo) =>
        centeredOnCanvas(maxFit(info.video.width, info.video.height)),
    },
    {
      text: "Cover canvas",
      title: "Just large enough to cover the whole canvas.  Some of the video will be off screen.  Centered.",
      make: (info: VideoInfo) =>
        centeredOnCanvas(minCover(info.video.width, info.video.height)),
    },
    {
      text: "Native pixels",
      title: `One video pixel per output pixel at ${PIXELS_PER_UNIT} px/unit — pixel perfect.  Keeps the rectangle's center.`,
      make: (info: VideoInfo, rect: ReadOnlyRect) =>
        sameCenter(preservePixels(info.video.width, info.video.height), rect),
    },
    {
      text: "Shrink to video",
      title: "Shrink the rectangle to the area the video actually covers inside it, so the handles hug the picture.",
      make: (info: VideoInfo, rect: ReadOnlyRect) =>
        shrinkToAspect(rect, info.video.width / info.video.height),
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
      drawDerived();
    },
  );
  alignRow.element.style.marginTop = "0.3em";
  panel.append(alignRow.element);

  const rectHint = line(panel, "font-size:0.85em;color:#a06000;min-height:0");

  const audioRow = line(panel, "margin-top:0.5em");
  const audioStatusEl = document.createElement("span");
  audioStatusEl.style.marginRight = "0.5em";
  audioRow.append(audioStatusEl);
  const importBtn = button(audioRow, "Import audio", "");
  const removeAudioBtn = button(audioRow, "Remove", "Remove the audio this panel imported.");

  /** The last answer we got from the file, or why there isn't one. */
  let info: VideoInfo | undefined;
  let state: "empty" | "loading" | "ready" | "error" = "empty";
  let errorText = "";
  /** Bumped by every refresh(), so an old, slow answer can't overwrite a newer one. */
  let generation = 0;

  // MARK: Drawing

  function draw(): void {
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
        statusEl.textContent = errorText;
        // Grey, not red:  this is the normal state while typing a name.
        statusEl.style.color = "#888";
        break;
      case "ready":
        statusEl.textContent = "✓ Ready";
        statusEl.style.color = "#070";
        break;
    }

    statsEl.replaceChildren();
    if (state === "ready" && info) {
      const { video, audio } = info;
      const stats = [
        `${info.formatName} · ${formatMs(info.durationMs)}`,
        `Video: ${video.width}×${video.height} · ${video.codec ?? "unknown codec"} · ${video.fpsLabel} fps (sampled)` +
          (video.firstTimestampMs !== 0
            ? ` · starts at ${video.firstTimestampMs.toFixed(1)} ms`
            : ""),
        audio
          ? `Audio: ${audio.channels} ch · ${audio.sampleRate} Hz · ${audio.codec ?? "unknown codec"}` +
            (audio.firstTimestampMs !== 0
              ? ` · offset ${audio.firstTimestampMs.toFixed(1)} ms`
              : "")
          : "Audio: none",
      ];
      for (const text of stats) line(statsEl).textContent = text;
    }
    drawDerived();
  }

  /** Everything that depends on the clip's own numbers, not just the file. */
  function drawDerived(): void {
    derivedEl.replaceChildren();
    const ready = state === "ready" && info !== undefined;
    const start = clip.startMsIntoClipScalar.value;
    const end = clip.endMsIntoClipScalar.value;
    const speed = playbackSpeed(clip);

    const add = (text: string, color = "") => {
      const div = line(derivedEl);
      div.textContent = text;
      if (color) div.style.color = color;
    };

    if (Number.isNaN(speed)) {
      add("Speed: — (Duration is 0)", "#a06000");
    } else if (isRealTime(speed)) {
      add("Speed: 1× — real time ✓", "#070");
    } else {
      add(
        `Speed: ${formatSpeed(speed)} — ${Math.round(Math.max(start, end) - start)} ms of video in ${Math.round(clip.duration)} ms of scene`,
        "#a06000",
      );
    }
    if (end < start) {
      add("End is before Start:  shows the Start frame, frozen.", "#a06000");
    }

    if (ready) {
      const fileMs = info!.durationMs;
      if (end > fileMs + 0.5) {
        add(`End is past the end of the file (${Math.round(fileMs)} ms).`, "#a06000");
      } else if (fileMs > 0) {
        const used = (Math.max(0, Math.max(start, end) - start) / fileMs) * 100;
        add(`Using ${used.toFixed(used < 10 ? 1 : 0)}% of the file.`);
      }

      const ratios = clip.destinationRectSchedule.schedule.map((kf) =>
        nativeRatio(kf.value, info!),
      );
      const lo = Math.min(...ratios);
      const hi = Math.max(...ratios);
      const label =
        Math.abs(hi - lo) < 0.005
          ? `${hi.toFixed(2)}× native`
          : `${lo.toFixed(2)}×–${hi.toFixed(2)}× native`;
      if (hi > 1.005) {
        add(`Pixels: ${label} — upscaled, will look soft.`, "#a06000");
      } else if (Math.abs(hi - 1) <= 0.005 && Math.abs(lo - 1) <= 0.005) {
        add(`Pixels: ${label} — pixel perfect ✓`, "#070");
      } else {
        add(`Pixels: ${label} (downscaled)`);
      }
    }

    wholeFileBtn.disabled = !ready;
    realTimeBtn.hidden = Number.isNaN(speed) || isRealTime(speed);
    realTimeBtn.disabled = !(end > start);
    for (const { btn } of rectButtons) btn.disabled = !ready;
    alignRow.draw();
    drawAudio(speed);
  }

  function drawAudio(speed: number): void {
    const imported = (clip.soundClips ?? []).filter(
      (sc) => sc.notes === IMPORTED_AUDIO_NOTE,
    );
    removeAudioBtn.hidden = imported.length === 0;
    const setStatus = (text: string, color = "") => {
      audioStatusEl.textContent = text;
      audioStatusEl.style.color = color;
    };

    if (state !== "ready" || !info) {
      setStatus(imported.length ? "Audio: imported" : "Audio:");
      importBtn.disabled = true;
      importBtn.textContent = imported.length ? "Re-import audio" : "Import audio";
      return;
    }
    const audio = info.audio;
    importBtn.textContent = imported.length ? "Re-import audio" : "Import audio";
    if (!audio) {
      setStatus(imported.length ? "Audio: imported, but this file has none" : "No audio track", "#888");
      importBtn.disabled = true;
      importBtn.title = "This file has no audio track.";
      return;
    }
    if (!isRealTime(speed)) {
      // AudioBuilder can't change the speed of a sound, so anything but 1×
      // would drift out of sync.
      setStatus(`Audio needs 1× — currently ${Number.isNaN(speed) ? "—" : formatSpeed(speed)}`, "#a06000");
      importBtn.disabled = true;
      importBtn.title = "Click Play at 1× first.";
      return;
    }
    importBtn.disabled = false;
    importBtn.title =
      "Add this file's audio as a sound clip on this Video Clip, lined up with the picture.  " +
      "It lives on the clip, so it moves with the clip on the timeline.";
    if (imported.length === 0) {
      setStatus("");
    } else if (
      imported.length === 1 &&
      sameSoundClip(imported[0], expectedSoundClip(clip, audio))
    ) {
      setStatus("Audio imported ✓", "#070");
    } else {
      setStatus("Audio imported, but out of date", "#a06000");
    }
  }

  // MARK: Actions

  function refresh(): void {
    const myGeneration = ++generation;
    const promise = clip.videoInfo();
    if (!promise) {
      state = "empty";
      info = undefined;
      draw();
      return;
    }
    state = "loading";
    draw();
    promise.then(
      (result) => {
        if (myGeneration !== generation) return;
        info = result;
        state = "ready";
        draw();
      },
      (error) => {
        if (myGeneration !== generation) return;
        info = undefined;
        state = "error";
        errorText = quietError(error);
        draw();
      },
    );
  }

  wholeFileBtn.addEventListener("click", () => {
    if (!info) return;
    clip.startMsIntoClipScalar.value = 0;
    clip.endMsIntoClipScalar.value = info.durationMs;
    // Bubbles up through scheduleHasChanged():  saves, rebuilds the audio,
    // updates the tree's Duration field and the timeline.
    clip.setDuration(info.durationMs);
    hooks.scalarsChanged();
  });

  realTimeBtn.addEventListener("click", () => {
    const start = clip.startMsIntoClipScalar.value;
    const end = clip.endMsIntoClipScalar.value;
    if (end > start) clip.setDuration(end - start);
    drawDerived();
  });

  /** Which Dest Rect keyframe a button should change, or why it can't decide. */
  function targetKeyframe(): Keyframe<ReadOnlyRect> | string {
    const schedule = clip.destinationRectSchedule.schedule;
    if (schedule.length === 1) return schedule[0];
    const editing = hooks.editingRectKeyframe();
    if (editing && schedule.includes(editing)) return editing;
    return "Dest Rect has several keyframes.  Click ✎ on the one you want to change.";
  }

  for (const { btn, make } of rectButtons) {
    btn.addEventListener("click", () => {
      if (!info) return;
      const target = targetKeyframe();
      if (typeof target === "string") {
        rectHint.textContent = target;
        return;
      }
      rectHint.textContent = "";
      target.value = make(info, target.value);
      hooks.rectKeyframeChanged(target);
      drawDerived();
    });
  }

  importBtn.addEventListener("click", () => {
    const audio = info?.audio;
    if (!audio) return;
    const kept = (clip.soundClips ?? []).filter(
      (sc) => sc.notes !== IMPORTED_AUDIO_NOTE,
    );
    clip.soundClips = [...kept, expectedSoundClip(clip, audio)];
    // Saves and rebuilds the audio, through the same path as a duration change.
    clip.scheduleHasChanged();
    drawDerived();
  });

  removeAudioBtn.addEventListener("click", () => {
    const kept = (clip.soundClips ?? []).filter(
      (sc) => sc.notes !== IMPORTED_AUDIO_NOTE,
    );
    clip.soundClips = kept.length ? kept : undefined;
    clip.scheduleHasChanged();
    drawDerived();
  });

  refresh();
  return {
    element: panel,
    refresh,
    refreshDerived: drawDerived,
    aspect: () => (info ? info.video.width / info.video.height : undefined),
  };
}
