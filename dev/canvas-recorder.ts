import "./canvas-recorder.css";

import {
  assertNonNullable,
  FIGURE_SPACE,
  parseFloatX,
  parseIntX,
  ReadOnlyRect,
} from "phil-lib/misc";
import {
  AnimationLoop,
  getById,
  querySelector,
  querySelectorAll,
} from "phil-lib/client-misc";
import {
  Output,
  StreamTarget,
  CanvasSource,
  Mp4OutputFormat,
  AudioBufferSource,
  QUALITY_HIGH,
} from "mediabunny";
import {
  RootComponentEditor,
  SerializedScalar,
  SerializedSchedule,
  Showable,
  ShowableParent,
  SoundClip,
  VisualEditorAPI,
} from "../src/showable.ts";
import {
  discreteKeyframes,
  interpolateColors,
  interpolateLattices,
  interpolateNumbers,
  interpolatePoints,
  interpolateRects,
  Keyframe,
} from "../src/interpolate.ts";
import { Lattice, LatticeValue } from "../src/lattice.ts";
import { ArrowValue, interpolateArrow } from "../src/schedule-helper.ts";
import {
  applyJsonEntry,
  applyTree,
  counterparts,
  fillTreeDefaults,
  findSerializedNode,
  isVideoSnapshot,
  JsonFileEntry,
  omitComponentDefaults,
  omitTreeDefaults,
  serializeComponents,
  serializeScalars,
  serializeSchedules,
  serializeTree,
  SerializedFixedChild,
  SNAPSHOT_FORMAT_VERSION,
  VideoSnapshot,
} from "../src/snapshot.ts";
import { downloadBlob, philDebug } from "../src/utility.ts";
import { debugLog, getNewDebugLogEntries } from "../src/debug-log.ts";
import { AudioBuilder } from "./audio-builder.ts";
import { openColorPickerDialog } from "./color-picker.ts";
import { setSwatchColor } from "./color-utils.ts";
import {
  addName,
  buildEaseSelect,
  buildNumericInput,
  buildScalarSection,
  parseScheduleFromClipboard,
  scheduleToTypeScript,
} from "./schedule-helpers.ts";
import {
  buildTraditionalTextPanel,
  openFontPickerDialog,
} from "./font-widgets.ts";
import { buildSlideComponentPanel } from "./slide-panel.ts";
import { buildVideoClipPanel } from "./video-clip-panel.ts";
import { buildTextFramePanel, CanvasState } from "./multi-text-panel.ts";
import {
  ownerOf,
  parseSoundClips,
  rehomeSoundClip,
  soundOwners,
  startWithin,
  tidyMs,
} from "./sound-clips.ts";
import { askHowToSplit } from "./split-dialog.ts";
import { SyncedFile, type SyncedFileOptions } from "./synced-file.ts";
import { TimelineDisplay, type TimelineBlock } from "./timeline-display.ts";
import { showableOptions } from "../src/dynamic-exports.ts";
import { watchServiceWorkerReady } from "./delay-files.ts";
import { DurationAgnosticComponent } from "../src/slide-components/duration-agnostic.ts";
import {
  componentChoices,
  componentRegistry,
} from "../src/slide-components/registry.ts";
import { pickComponent } from "./component-picker.ts";
import {
  SerializedChild,
  buildComponents,
} from "../src/slide-components/serialize.ts";
import { SlideComponent } from "../src/slide-components/slide-component.ts";
import { VideoClipComponent } from "../src/slide-components/video-clip.ts";
import { MultiTextComponent } from "../src/slide-components/multi-text.ts";
import { InSeriesComponent } from "../src/slide-components/in-series.ts";
import { splitVideoClip } from "../src/slide-components/split-video-clip.ts";
import { TraditionalTextComponent } from "../src/slide-components/traditional-text.ts";
import { PaddingComponent } from "../src/slide-components/in-parallel.ts";

// Automatically check for status and report to console.
// Also, register philDebug.loadServiceWorker() and philDebug.unloadServiceWorker().
watchServiceWorkerReady();

/**
 * Reads the `?toShow=` query parameter and returns the matching {@link Showable}.
 *
 * Strings are NFC-normalized before comparison so that characters like "ń"
 * match regardless of how the browser percent-encodes them.
 *
 * If the parameter is missing or unrecognized, the page body is replaced with
 * a minimal link list and this function throws, halting the rest of the module.
 */
async function resolveToShow(): Promise<Showable> {
  const request = new URLSearchParams(location.search).get("toShow");
  if (request !== null) {
    const record = showableOptions.get(request);
    if (record) {
      return record.create();
    }
  }

  const h1 = document.createElement("h1");
  h1.textContent = "Select a video";
  const ul = document.createElement("ul");
  for (const [key, { description }] of showableOptions) {
    const url = new URL(location.href);
    url.searchParams.set("toShow", key);
    const a = document.createElement("a");
    a.href = url.href;
    a.textContent = description ? `${key} — ${description}` : key;
    const li = document.createElement("li");
    li.append(a);
    ul.append(li);
  }
  document.body.replaceChildren(h1, ul);
  throw new Error(
    "Showing video selection — no valid 'toShow' query parameter.",
  );
}

// resolveToShow() throws to halt module execution when showing the menu, so that
// subsequent code referencing now-removed DOM nodes never runs.  Register a
// one-shot onerror handler here (before the call) to suppress that expected
// throw from appearing as a red error in the console.
window.onerror = (msg) => {
  if (typeof msg === "string" && msg.includes("no valid 'toShow'")) {
    window.onerror = null;
    return true; // suppress console output
  }
  return false;
};

/**
 * The top level item that we are viewing and/or saving.
 */
const toShow = await resolveToShow();

const canvas = getById("main", HTMLCanvasElement);
const context = assertNonNullable(canvas.getContext("2d"));

const timelineDisplay = new TimelineDisplay(
  getById("timelineCanvas", HTMLCanvasElement),
);

/**
 * By analogy to an SVG view box, we always focus on the ideal coordinates.
 * We can save or view in any coordinates we want.  I usually save to 4k
 * for the sake of YouTube.  I usually draw the biggest canvas I can, not going
 * off the screen, keeping the aspect ratio.  Those are implementation details
 * that the drawing code doesn't have to care about.
 * @returns A matrix converting from the 16x9 ideal coordinates to the actual canvas coordinates.
 */
function mainTransform() {
  return new DOMMatrixReadOnly().scale(canvas.width / 16, canvas.height / 9);
}

// ---------------------------------------------------------------------------
// Zoom & pan
// ---------------------------------------------------------------------------

const viewport = getById("canvasViewport", HTMLDivElement);
const canvasLoading = getById("canvasLoading", HTMLDivElement);
const zoomSelect = getById("zoomSelect", HTMLSelectElement);
const zoomControls = getById("zoomControls", HTMLDivElement);

/** Explicit zoom factor: 1.0 = one canvas pixel per device pixel (4K shown at 1920×1080 CSS px on Retina). */
let currentZoomFactor = 1;
let panX = 0;
let panY = 0;
/** True while the recording loop is running; suppresses all canvas resize operations. */
let isRecording = false;

/**
 * Clamps pan so the canvas stays on-screen.
 * When the canvas is smaller than the viewport, centers it instead.
 */
function clampPan(
  canvasCssWidth: number,
  canvasCssHeight: number,
  px: number,
  py: number,
): [number, number] {
  const viewportWidth = viewport.clientWidth;
  const viewportHeight = viewport.clientHeight;
  if (canvasCssWidth <= viewportWidth) {
    return [
      Math.round((viewportWidth - canvasCssWidth) / 2),
      Math.round((viewportHeight - canvasCssHeight) / 2),
    ];
  }
  return [
    Math.max(viewportWidth - canvasCssWidth, Math.min(0, px)),
    Math.max(viewportHeight - canvasCssHeight, Math.min(0, py)),
  ];
}

/**
 * Resizes the canvas to match zoom and repositions it via left/top.
 * zoom = 1.0 → 3840×2160 physical pixels, displayed at 1920×1080 CSS px on Retina.
 *
 * Guards canvas.width/height assignment: assigning to those properties always
 * clears the canvas (browser spec), so skip it when the size hasn't changed
 * (e.g. during a pan drag where only left/top need updating).
 */
function applyZoom(zoom: number, px = panX, py = panY) {
  if (isRecording) return;
  currentZoomFactor = zoom;
  const dpr = devicePixelRatio;
  const physW = Math.round(3840 * zoom);
  const physH = Math.round(2160 * zoom);
  const cssW = physW / dpr;
  const cssH = physH / dpr;
  if (canvas.width !== physW || canvas.height !== physH) {
    canvas.style.transform = "";
    canvas.style.transformOrigin = "";
    canvas.style.maxWidth = "";
    canvas.style.maxHeight = "";
    canvas.width = physW;
    canvas.height = physH;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    showFrame(playPositionSeconds.valueAsNumber * 1000, true);
  }
  [panX, panY] = clampPan(cssW, cssH, px, py);
  canvas.style.left = `${panX}px`;
  canvas.style.top = `${panY}px`;
}

/** Fits the 16:9 canvas into the viewport at pixel-perfect resolution. */
function zoomToFit() {
  if (isRecording) return;
  const vpW = viewport.clientWidth;
  const vpH = viewport.clientHeight;
  if (vpW === 0 || vpH === 0) return;
  const dpr = devicePixelRatio;
  const cssW = Math.min(vpW, (vpH * 16) / 9);
  const cssH = Math.min(vpH, (vpW * 9) / 16);
  const newW = Math.round(cssW * dpr);
  const newH = Math.round(cssH * dpr);
  canvas.style.transform = "";
  canvas.style.transformOrigin = "";
  canvas.style.maxWidth = "";
  canvas.style.maxHeight = "";
  canvas.width = newW;
  canvas.height = newH;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.style.left = `${Math.round((vpW - cssW) / 2)}px`;
  canvas.style.top = `${Math.round((vpH - cssH) / 2)}px`;
  // Immediately redraw so the canvas clear doesn't show as a gray flash.
  showFrame(playPositionSeconds.valueAsNumber * 1000, true);
}

zoomSelect.addEventListener("change", () => {
  if (zoomSelect.value === "fit") {
    zoomToFit();
  } else {
    applyZoom(parseFloat(zoomSelect.value), 0, 0);
  }
});

const viewportResizeObserver = new ResizeObserver(() => {
  if (zoomSelect.value === "fit") {
    zoomToFit();
  } else {
    applyZoom(currentZoomFactor); // re-clamp pan to new viewport size
  }
});
viewportResizeObserver.observe(viewport);

// Pan on trackpad scroll / mouse wheel; prevent browser back/forward navigation.
viewport.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (zoomSelect.value === "fit") return;
    applyZoom(currentZoomFactor, panX - e.deltaX, panY - e.deltaY);
  },
  { passive: false },
);

/**
 * @param timeInMs Draw the animation at this time.
 * @param live True for interactive display (schedule markers drawn on top).
 * False when rendering for save/export (markers omitted).
 */
/**
 * Render one frame onto the main canvas.
 *
 * **Call sites are intentionally limited.**
 * `AnimationLoop` (a `requestAnimationFrame` wrapper) calls this on every tick,
 * so the canvas is always up to date.  Any state change — dragging, editing a
 * keyframe value, loading a snapshot — will be reflected on the very next tick
 * without an explicit call here.
 *
 * The only legitimate extra call site is:
 * - The offline recording loop, which drives time itself and must render each
 *   frame before capturing it.
 *
 * Do **not** add new calls here from event handlers.  Doing so causes the
 * expensive per-frame work (e.g. halftone shadows) to run once per input event
 * rather than once per animation frame, which can freeze the UI under fast
 * input (pointermove, etc.).
 */
function showFrame(timeInMs: number, live: boolean) {
  timelineDisplay.setPlayMs(timeInMs - sectionStartTime);
  for (const update of goToButtonUpdaters) update();
  context.reset();
  context.setTransform(mainTransform());
  if (live) {
    const quality = querySelector(
      'input[name="quality"]:checked',
      HTMLInputElement,
    ).value as "High Quality" | "Low Power";
    toShow.show({
      timeInMs,
      context,
      globalTime: timeInMs,
      quality,
      registerTransform: (c, t) => componentTransforms.set(c, t),
      playSpeed: 0 /* TODO use the real value. */,
    });
    drawScheduleMarkers(context);
  } else {
    toShow.show({
      timeInMs,
      context,
      globalTime: timeInMs,
      quality: "High Quality",
      playSpeed: "exact",
    });
  }
}
// Exposed so the browser console can call showFrame() directly for debugging.
(window as any).showFrame = showFrame;

/**
 * You can select an individual section to display.
 *
 * Dragging the slider all the way to the left will set the time to this time.
 * If you select repeat, each time you get to the end you will be sent back
 * to this time.
 */
let sectionStartTime = 0;

/**
 * You can select an individual section to display.
 *
 * Dragging the slider all the way to the right will set the time to this time.
 * If you select repeat or pause, that action will file when you get to this
 * time.
 */
let sectionEndTime = 0;

/**
 * Play or pause.  Option space will toggle this.
 */
const playCheckBox = getById("play", HTMLInputElement);

/**
 * The slider that lets you see or adjust the current time, relative to the
 * section we are displaying.  If the user changes this, the changes will
 * automatically be sent to playPositionSeconds.  playPositionSeconds is the
 * primary source of this information.
 */
const playPositionRange = getById("playPositionRange", HTMLInputElement);

/**
 * This lets you see or adjust the current time.  The user can only edit this
 * when paused; otherwise this control would be moving to quickly to be used.
 *
 * This can be a number outside of the normal range of the current section.
 * This, like all user visible number, is measured in seconds.  Internal
 * things measure time in milliseconds.
 */
const playPositionSeconds = getById("playPositionSeconds", HTMLInputElement);
/**
 * When we get to the end of the section, automatically jump back to the
 * beginning of the section.
 */
const repeatRadioButton = querySelector(
  'input[name="onSectionEnd"][value="repeat"]',
  HTMLInputElement,
);
/**
 * When we get to the end of the section just keep going.
 */
const continueRadioButton = querySelector(
  'input[name="onSectionEnd"][value="continue"]',
  HTMLInputElement,
);

/**
 * Update the input that shows the time as a number.
 * @param timeInMs The time to display in the number control.
 * This is *automatically* converted to seconds and rounded to the nearest ⅒ of a millisecond.
 * We only use milliseconds, not seconds, inside the code.
 */
function loadPlayPositionSeconds(timeInMs: number) {
  playPositionSeconds.value = (timeInMs / 1000).toFixed(4);
}

/**
 * Update the range input to show the same time as the number input.
 *
 * The range control will clamp the input within a certain range.
 *
 * The number input does not do any clamping and it is the only input that the program uses.
 * If the user changes the range input, and the value is immediately copied to the number input for use in the program.
 */
function loadPlayPositionRange() {
  playPositionRange.valueAsNumber = playPositionSeconds.valueAsNumber * 1000;
}

const audioContext = new AudioContext();
console.log(audioContext);
const gainNode = audioContext.createGain();
gainNode.connect(audioContext.destination);

/** Set to true once the AudioBuffer has been fully built and is safe to play. */
let audioReady = false;
let audioSourceNode: AudioBufferSourceNode | null = null;
/** audioContext.currentTime at the moment startAudio() last started a source node. */
let audioContextStartTime = 0;
/** Media position (ms) at the moment startAudio() last started a source node. */
let audioMediaStartMs = 0;
let audioPlaybackRate = 1;

/**
 * True when the browser blocked AudioContext autoplay.
 * In this mode we use performance.now() for timing instead of audioContext.currentTime.
 * Audio does not play, but animation runs and stays internally consistent.
 *
 * RAF = Request Animation Frame.
 * https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
 */
let rafFallbackMode = false;
/** True when fallback-mode "playback" is running (mirrors audioSourceNode !== null). */
let rafFallbackPlaying = false;
/** performance.now() at the moment fallback playback last started. */
let rafFallbackStartPerf = 0;
/** Media position (ms) at the moment fallback playback last started. */
let rafFallbackStartMs = 0;

const autoplayFallbackMsg = getById("autoplayFallbackMsg", HTMLDivElement);
const muteCheckbox = getById("muteAudio", HTMLInputElement);

function currentAudioTimeMs(): number {
  if (rafFallbackMode) {
    return (
      rafFallbackStartMs +
      (performance.now() - rafFallbackStartPerf) * audioPlaybackRate
    );
  }
  return (
    audioMediaStartMs +
    (audioContext.currentTime - audioContextStartTime) *
      audioPlaybackRate *
      1000
  );
}

function enterRafFallback(fromMs: number, showMessage: boolean): void {
  rafFallbackMode = true;
  rafFallbackStartMs = fromMs;
  rafFallbackStartPerf = performance.now();
  rafFallbackPlaying = true;
  muteCheckbox.checked = true;
  gainNode.gain.value = 0;
  autoplayFallbackMsg.hidden = !showMessage;
}

function startAudio(fromMs: number): void {
  stopAudio();
  if (rafFallbackMode) {
    // Already in fallback — just re-anchor the timing.
    rafFallbackStartMs = fromMs;
    rafFallbackStartPerf = performance.now();
    rafFallbackPlaying = true;
    return;
  }
  if (!audioReady) return;
  if (audioContext.state !== "running") {
    if (!navigator.userActivation.isActive) {
      // No user gesture available (e.g. restoring play state on page load).
      // Silently fall back — animation runs, audio muted.
      enterRafFallback(fromMs, false);
      return;
    }
    // Has a user gesture.  resume() is async — the source node below plays
    // once the context transitions to running.  Do NOT check state synchronously
    // after this call; it will still read "suspended" before the promise resolves.
    audioContext.resume().catch(() => {});
  }
  const source = audioContext.createBufferSource();
  source.buffer = audioBuilder.getAudioBuffer();
  source.playbackRate.value = audioPlaybackRate;
  source.connect(gainNode);
  const contextNow = audioContext.currentTime;
  source.start(contextNow, fromMs / 1000);
  audioSourceNode = source;
  audioContextStartTime = contextNow;
  audioMediaStartMs = fromMs;
}

function stopAudio(): void {
  rafFallbackPlaying = false;
  if (audioSourceNode) {
    try {
      audioSourceNode.stop();
    } catch (_) {}
    audioSourceNode.disconnect();
    audioSourceNode = null;
  }
}

/**
 * Change playback speed without a restart or glitch.
 * Re-anchors the timing so currentAudioTimeMs() stays continuous.
 */
function setPlaybackRate(rate: number): void {
  if (rafFallbackPlaying) {
    const currentMs = currentAudioTimeMs();
    rafFallbackStartMs = currentMs;
    rafFallbackStartPerf = performance.now();
  } else if (audioSourceNode) {
    const currentMs = currentAudioTimeMs();
    audioContextStartTime = audioContext.currentTime;
    audioMediaStartMs = currentMs;
    audioSourceNode.playbackRate.value = rate;
  }
  audioPlaybackRate = rate;
}

{
  const volumeSlider = getById("volumeAudio", HTMLInputElement);
  muteCheckbox.addEventListener("input", () => {
    if (!muteCheckbox.checked && rafFallbackMode) {
      // Un-muting is a user gesture — try to exit fallback and resume real audio.
      const currentMs = currentAudioTimeMs();
      rafFallbackMode = false;
      rafFallbackPlaying = false;
      autoplayFallbackMsg.hidden = true;
      if (playCheckBox.checked) {
        stopAudio();
        startAudio(currentMs);
      }
    }
    gainNode.gain.value = muteCheckbox.checked ? 0 : volumeSlider.valueAsNumber;
  });
  volumeSlider.addEventListener("input", () => {
    if (!muteCheckbox.checked) {
      gainNode.gain.value = volumeSlider.valueAsNumber;
    }
  });
  getById("speedAudio", HTMLSelectElement).addEventListener("change", (e) => {
    setPlaybackRate(parseFloat((e.target as HTMLSelectElement).value));
  });
}

let audioBuilder = new AudioBuilder(toShow.duration);

let reloadGeneration = 0;

async function initAudio(): Promise<void> {
  const myGen = ++reloadGeneration;
  audioReady = false;
  stopAudio();
  const newBuilder = new AudioBuilder(toShow.duration);

  async function doIt(item: Showable, offset: number): Promise<boolean> {
    if (myGen !== reloadGeneration) return false;
    if (item.soundClips) {
      for (const clip of item.soundClips) {
        // A brand new clip has no source yet, and a URL being typed is wrong
        // until it's finished.  Either way, skip that one clip, not all audio.
        if (clip.source === "") continue;
        try {
          await newBuilder.add(
            clip.source,
            offset + clip.startMsIntoScene,
            clip.startMsIntoClip,
            clip.lengthMs,
          );
        } catch (reason) {
          debugLog("audio", `Skipped "${clip.source}": ${reason}`);
        }
        if (myGen !== reloadGeneration) return false;
      }
    }
    if (item.children) {
      for (const { child, start } of item.children) {
        if (!(await doIt(child, offset + start))) return false;
      }
    }
    return true;
  }

  const time1 = performance.now();
  const completed = await doIt(toShow, 0);
  const time2 = performance.now();
  if (!completed) {
    console.log(
      `Audio init superseded after ${(time2 - time1).toFixed(0)} ms.`,
    );
    return;
  }
  audioBuilder = newBuilder;
  audioReady = true;
  console.log(`Audio ready in ${(time2 - time1).toFixed(0)} ms.`);
  // Sound clips on the timeline can now show their waveforms, and the ones
  // that play to the end of their file now know how long that is.
  timelineDisplay.redraw();
}

initAudio();

/**
 * We disable {@link animationLoop} while rendering to a file.
 * We can reenable it when we are done rendering.
 */
let suspendLiveAnimationLoop = false;

/**
 * Redraw the canvas and update some other controls.
 *
 * This is for live / realtime drawing.  This is disabled when we are saving the file.
 */
const animationLoop = new AnimationLoop((_rAFTimeInMs: number) => {
  if (suspendLiveAnimationLoop) {
    return;
  }
  if (!playCheckBox.checked) {
    // Paused.
    stopAudio();
    playPositionSeconds.disabled = false;
    showFrame(playPositionSeconds.valueAsNumber * 1000, true);
    return;
  }

  // Playing.
  playPositionSeconds.disabled = true;

  if (!audioSourceNode && !rafFallbackPlaying) {
    // No source node running: first play, after pause/seek, or after repeat.
    let startMs = playPositionSeconds.valueAsNumber * 1000;
    if (startMs >= sectionEndTime - 0.05 && !continueRadioButton.checked) {
      // At the end — jump to the beginning.
      startMs = sectionStartTime;
      loadPlayPositionSeconds(startMs);
      loadPlayPositionRange();
    }
    startAudio(startMs);
    // If audio isn't built yet (and not in fallback mode), hold the current frame.
    if (!audioSourceNode && !rafFallbackPlaying) {
      showFrame(playPositionSeconds.valueAsNumber * 1000, true);
      return;
    }
  }

  const timeInMs = currentAudioTimeMs();

  if (timeInMs >= sectionEndTime - 0.05 && !continueRadioButton.checked) {
    if (repeatRadioButton.checked) {
      // Loop: restart from the beginning of the section.
      loadPlayPositionSeconds(sectionStartTime);
      startAudio(sectionStartTime);
      loadPlayPositionRange();
      showFrame(sectionStartTime, true);
    } else {
      // Pause at end.
      stopAudio();
      loadPlayPositionSeconds(sectionEndTime);
      loadPlayPositionRange();
      playCheckBox.checked = false;
      playPositionSeconds.disabled = false;
      showFrame(sectionEndTime, true);
    }
    return;
  }

  loadPlayPositionSeconds(timeInMs);
  loadPlayPositionRange();
  showFrame(timeInMs, true);
});

playPositionRange.addEventListener("input", () => {
  stopAudio();
  loadPlayPositionSeconds(playPositionRange.valueAsNumber);
});
playPositionSeconds.addEventListener("input", () => {
  loadPlayPositionRange();
});

// Cmd+Z / Ctrl+Z opens the history (undo) dialog when no text field is focused.
addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key !== "z") return;
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement
  )
    return;
  event.preventDefault();
  if (historyDialog.open) return;
  const target = currentSaveTarget();
  if (target) void openHistoryDialog(target);
});

addEventListener("keypress", (event) => {
  if (!event.altKey) {
    return;
  }
  switch (event.code) {
    case "Space": {
      playCheckBox.checked = !playCheckBox.checked;
      event.preventDefault();
      break;
    }
    case "Digit0": {
      loadPlayPositionSeconds(sectionStartTime);
      loadPlayPositionRange();
      stopAudio();
      event.preventDefault();
      break;
    }
    case "KeyB": {
      getById("back5s", HTMLButtonElement).click();
      event.preventDefault();
      break;
    }
  }
});

getById("back5s", HTMLButtonElement).addEventListener("click", () => {
  const backMs = Math.max(
    sectionStartTime,
    playPositionSeconds.valueAsNumber * 1000 - 5000,
  );
  loadPlayPositionSeconds(backMs);
  loadPlayPositionRange();
  stopAudio();
  playCheckBox.checked = true;
});

/**
 * Frames per second.
 *
 * This is only used when saving.  We rely on chrome to tell us when to draw frames
 * for the live/realtime display.  Than can vary significantly.
 */
const FPS = 60;

/**
 * This is the status of the save.  It has no purpose during live / realtime operation
 * so it initialize it to blank.
 */
const infoDiv = getById("info", HTMLDivElement);
infoDiv.innerHTML = "";

const startRecordingButton = getById("startRecording", HTMLButtonElement);
const cancelRecordingButton = getById("cancelRecording", HTMLButtonElement);

/**
 * Play, pause, repeat, current time etc.
 *
 * When we save, these are all disabled.
 * Some of these display the right data, but you can't change them.
 */
const liveControls = getById("liveControls", HTMLFieldSetElement);

/**
 * Someone hit the stop button.
 */
let canceled = false;

/**
 * Escape text before dropping it into `infoDiv.innerHTML`.
 * Error messages can contain arbitrary text (e.g. a URL with special characters);
 * this keeps that text from being misinterpreted as markup.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function startRecording(saveStartMs = 0, saveEndMs = toShow.duration) {
  stopAudio();
  startRecordingButton.disabled = true;
  liveControls.disabled = true;
  cancelRecordingButton.disabled = false;
  canceled = false;

  suspendLiveAnimationLoop = true;

  // Lock canvas at 4K for the duration of recording.
  // Disable all size-changing code paths so the encoder sees a constant frame size.
  isRecording = true;
  viewportResizeObserver.disconnect();
  zoomControls.inert = true;
  canvas.width = 3840;
  canvas.height = 2160;
  canvas.style.width = "";
  canvas.style.height = "";
  canvas.style.maxWidth = "100%";
  canvas.style.maxHeight = "100%";
  canvas.style.left = "50%";
  canvas.style.top = "50%";
  canvas.style.transform = "translate(-50%, -50%)";
  canvas.style.transformOrigin = "";

  // `output` is created inside the try block below, but we need to reach it
  // from the catch block too, so we can still finalize (and thus flush)
  // whatever got encoded before the error.
  let output: Output | undefined;
  try {
    infoDiv.innerHTML =
      "Choose save location... (recording starts immediately)";

    // User picks file
    const fileHandle = await window.showSaveFilePicker({
      id: "video-save",
      suggestedName: "canvas-recording.mp4",
      types: [
        {
          description: "WebM Video",
          accept: { "video/mp4": [".mp4"] },
        },
      ],
    });

    const writableStream = await fileHandle.createWritable();

    // Set up Mediabunny output (streaming to file)
    output = new Output({
      format: new Mp4OutputFormat(),
      target: new StreamTarget(writableStream, { chunked: true }), // Batch writes for speed
    });

    // Canvas source (VP9 for good quality/size on macOS)
    const videoSource = new CanvasSource(canvas, {
      codec: "hevc",
      bitrate: 16_000_000, // ~8Mbps — tune higher for better quality
    });

    output.addVideoTrack(videoSource, { frameRate: FPS });

    const fullAudioBuffer = audioBuilder.getAudioBuffer();
    let audioBuffer: AudioBuffer;
    if (saveStartMs === 0 && saveEndMs >= toShow.duration) {
      audioBuffer = fullAudioBuffer;
    } else {
      const sr = fullAudioBuffer.sampleRate;
      const s0 = Math.round((saveStartMs / 1000) * sr);
      const s1 = Math.min(
        Math.round((saveEndMs / 1000) * sr),
        fullAudioBuffer.length,
      );
      const len = Math.max(0, s1 - s0);
      audioBuffer = new AudioBuffer({
        numberOfChannels: fullAudioBuffer.numberOfChannels,
        length: len,
        sampleRate: sr,
      });
      for (let ch = 0; ch < fullAudioBuffer.numberOfChannels; ch++) {
        audioBuffer.copyToChannel(
          fullAudioBuffer.getChannelData(ch).subarray(s0, s0 + len),
          ch,
        );
      }
    }
    const audioSource = new AudioBufferSource({
      codec: "aac",
      bitrate: QUALITY_HIGH,
    });
    output.addAudioTrack(audioSource);

    const startTime = performance.now();

    await output.start();
    infoDiv.innerHTML = "Recording in progress...";

    const frameDuration = 1000 / FPS;

    // Offline loop: draw + push frames (not limited to realtime)
    let frameNumber = 0;
    let warnedNoFramePromises = false;
    while (!canceled) {
      const timeInMs = saveStartMs + (frameNumber + 0.5) * frameDuration;
      if (timeInMs >= saveEndMs) {
        break;
      }
      if (toShow.getFramePromises) {
        const framePromises = new Set<Promise<unknown>>();
        toShow.getFramePromises(timeInMs, framePromises);
        await Promise.all([...framePromises]);
      } else if (!warnedNoFramePromises) {
        warnedNoFramePromises = true;
        console.info(
          "toShow.getFramePromises is not implemented — recording will not wait for slow-loading content (fonts, images, etc.) to become ready.",
        );
      }
      showFrame(timeInMs, false);
      loadPlayPositionSeconds(timeInMs);
      loadPlayPositionRange();
      // Push frame (timestamp/duration in seconds)
      const timestampSec = frameNumber / FPS;
      const durationSec = 1 / FPS;
      // This await is essential.
      // 1) It handles backpressure.
      //    o  Without this the drawing stage will go at full speed.
      //    o  The output of the draw stages gets queued up somewhere.
      //    o  When that builds up too much the system becomes less responsive and eventually less stable.
      // 2) It avoids some errors.
      //    o  Running at full speed usually worked as long as it didn't crash.
      //    o  Running with this await works fine.
      //    o  But when I tried to run without this await, but with a different await in this loop, I got weird error messages.
      // 3) It keeps the GUI live.
      //    o  Without this we'd need some other way to break the work up.
      //    o  This works very well on its own.
      await videoSource.add(timestampSec, durationSec);
      frameNumber++;
    }

    // Trim audio to match actual recorded frames, then send.
    const actualAudioMs = frameNumber * frameDuration;
    const sr = audioBuffer.sampleRate;
    const samplesNeeded = Math.min(
      Math.round((actualAudioMs / 1000) * sr),
      audioBuffer.length,
    );
    if (samplesNeeded >= audioBuffer.length) {
      audioSource.add(audioBuffer);
    } else {
      const trimmedAudio = new AudioBuffer({
        numberOfChannels: audioBuffer.numberOfChannels,
        length: samplesNeeded,
        sampleRate: sr,
      });
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        trimmedAudio.copyToChannel(
          audioBuffer.getChannelData(ch).subarray(0, samplesNeeded),
          ch,
        );
      }
      audioSource.add(trimmedAudio);
    }

    infoDiv.innerHTML = "Frames complete.  Finalizing video.";
    cancelRecordingButton.disabled = true;

    await output.finalize(); // Finishes encoding + closes stream automatically

    const elapsedSeconds = (performance.now() - startTime) / 1000;

    infoDiv.innerHTML = `
      <strong>Recording complete!</strong><br>
      Frames: ${frameNumber}<br>
      Elapsed time: ${elapsedSeconds.toFixed(3)} seconds<br>
      Recording Speed: ${(frameNumber / FPS / elapsedSeconds).toFixed(3)} × realtime
    `;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      // The user closed the "choose save location" dialog without picking a file.
      // Not an error — nothing was recorded yet, so there's nothing to finalize.
      infoDiv.innerHTML = "Recording canceled.";
    } else {
      console.error("Recording failed:", e);
      const message = e instanceof Error ? e.message : String(e);
      infoDiv.innerHTML = `<strong style="color:red">Recording failed:</strong> ${escapeHtml(message)}`;
      if (output) {
        try {
          // Flush and close the file so whatever was recorded before the
          // error isn't lost.
          await output.finalize();
          infoDiv.innerHTML += "<br>Partial recording saved.";
        } catch (finalizeError) {
          console.error(
            "Failed to finalize output after an earlier error:",
            finalizeError,
          );
          infoDiv.innerHTML +=
            '<br><strong style="color:red">Could not save even a partial recording.</strong>';
        }
      }
    }
  } finally {
    // Restore pixel-perfect mode and re-enable the controls we disabled at the
    // top, regardless of whether the recording succeeded, was canceled, or failed.
    cancelRecordingButton.disabled = true;
    startRecordingButton.disabled = false;
    liveControls.disabled = false;
    isRecording = false;
    zoomControls.inert = false;
    viewportResizeObserver.observe(viewport);
    if (zoomSelect.value === "fit") {
      zoomToFit();
    } else {
      applyZoom(currentZoomFactor);
    }
    suspendLiveAnimationLoop = false;
  }
}

cancelRecordingButton.addEventListener("click", () => {
  canceled = true;
  cancelRecordingButton.disabled = true;
});

// ---------------------------------------------------------------------------
// Save dialog
// ---------------------------------------------------------------------------

const saveDialog = getById("saveDialog", HTMLDialogElement);
const saveChapterSelect = getById("saveChapterSelect", HTMLSelectElement);
const saveStartSecondsInput = getById("saveStartSeconds", HTMLInputElement);
const saveEndSecondsInput = getById("saveEndSeconds", HTMLInputElement);
const saveInfoStart = getById("saveInfoStart", HTMLTableCellElement);
const saveInfoEnd = getById("saveInfoEnd", HTMLTableCellElement);
const saveInfoDuration = getById("saveInfoDuration", HTMLTableCellElement);
const saveInfoFrames = getById("saveInfoFrames", HTMLTableCellElement);

function formatTimecode(ms: number): string {
  const totalFrames = Math.round((ms * FPS) / 1000);
  const frames = totalFrames % FPS;
  const totalSec = Math.floor(totalFrames / FPS);
  const seconds = totalSec % 60;
  const minutes = Math.floor(totalSec / 60) % 60;
  const hours = Math.floor(totalSec / 3600);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(frames).padStart(2, "0")}`;
}

function updateSaveDialogInfo(): void {
  const startMs = (saveStartSecondsInput.valueAsNumber || 0) * 1000;
  const endMs = (saveEndSecondsInput.valueAsNumber || 0) * 1000;
  const durationMs = Math.max(0, endMs - startMs);
  const invalid = endMs <= startMs;
  saveInfoStart.textContent = formatTimecode(startMs);
  saveInfoEnd.textContent = formatTimecode(endMs);
  saveInfoDuration.textContent = formatTimecode(durationMs);
  saveInfoDuration.style.color = invalid ? "red" : "";
  saveInfoFrames.textContent = Math.floor(
    (durationMs * FPS) / 1000,
  ).toLocaleString();
  saveInfoFrames.style.color = invalid ? "red" : "";
}

function setSaveRange(startMs: number, endMs: number): void {
  saveStartSecondsInput.value = (startMs / 1000).toString();
  saveEndSecondsInput.value = (endMs / 1000).toString();
  updateSaveDialogInfo();
}

function populateSaveChapterSelect(): void {
  saveChapterSelect.replaceChildren();
  const entire = document.createElement("option");
  entire.textContent = "Entire video";
  entire.dataset.startMs = "0";
  entire.dataset.endMs = toShow.duration.toString();
  saveChapterSelect.append(entire);
  chapterList.forEach((item) => {
    const opt = document.createElement("option");
    opt.textContent = item.prefix + item.description;
    opt.dataset.startMs = item.start.toString();
    opt.dataset.endMs = item.end.toString();
    saveChapterSelect.append(opt);
  });
}

saveChapterSelect.addEventListener("change", () => {
  const opt = saveChapterSelect.selectedOptions[0];
  if (opt) {
    setSaveRange(
      parseFloat(opt.dataset.startMs ?? "0"),
      parseFloat(opt.dataset.endMs ?? toShow.duration.toString()),
    );
  }
});

getById("saveAllBtn", HTMLButtonElement).addEventListener("click", () => {
  saveChapterSelect.selectedIndex = 0;
  setSaveRange(0, toShow.duration);
});

getById("saveCopyChapterBtn", HTMLButtonElement).addEventListener(
  "click",
  () => {
    const info = chapterList[select.selectedIndex];
    if (info) {
      saveChapterSelect.selectedIndex = info.absolutePosition + 1;
      setSaveRange(info.start, info.end);
    }
  },
);

saveStartSecondsInput.addEventListener("input", () => {
  saveChapterSelect.selectedIndex = -1;
  updateSaveDialogInfo();
});

saveEndSecondsInput.addEventListener("input", () => {
  saveChapterSelect.selectedIndex = -1;
  updateSaveDialogInfo();
});

getById("saveDialogCancelBtn", HTMLButtonElement).addEventListener(
  "click",
  () => saveDialog.close(),
);

getById("saveOkBtn", HTMLButtonElement).addEventListener("click", () => {
  const startMs = (saveStartSecondsInput.valueAsNumber || 0) * 1000;
  const endMs = (saveEndSecondsInput.valueAsNumber || 0) * 1000;
  saveDialog.close();
  startRecording(startMs, endMs);
});

startRecordingButton.addEventListener("click", () => {
  populateSaveChapterSelect();
  setSaveRange(0, toShow.duration);
  saveDialog.showModal();
});

/**
 * This powers the GUI that lets you select and display a specific section of the video.
 */
type ShowableTree = {
  description: string;
  prefix: string;
  start: number;
  end: number;
  parent: ShowableTree | undefined;
  children: ShowableTree[];
  absolutePosition: number;
  siblingPosition: number;
  selectable: Showable;
};

/**
 * The flat list of every selectable section in the video, in timeline order.
 * Drives the chapter \<select> and the Visual Editor.
 * Exposed on the console as `philDebug.chapterList`.
 */
const chapterList = new Array<ShowableTree>();
/**
 * Initialize the `chapterList` list with all the sections of the video.
 * @param current Add this and its children.
 * @param prefix Draw the sections like an outline.
 * Each section is indented a little more than its parent.
 * @param start What time does the section start?
 * Each showable only knows its duration.
 * We compute the start time as we build the tree.
 * @param limit The last time that is available for this section to run.
 * A section will not run past the end of any of its ancestors.
 * This is measured from the beginning of the entire video.
 * @param descriptionPrefix Used when we are combining nodes.
 * @param parent
 */
function dump(
  current: Showable,
  prefix = "",
  start = 0,
  limit = Infinity,
  descriptionPrefix = "",
  parent?: ShowableTree,
  /** When collapsing a chain of single-interesting-child nodes, this holds the
   *  outermost (root) node so the chapter always selects the top of the chain. */
  selectableRoot?: Showable,
) {
  /**
   * Remove any children with a duration of 0.
   * The point of this list is to let the user select a section of the video to view.
   * Things with a duration of 0 add nothing of value to this list.
   */
  const interestingChildren = (current.children ?? []).filter(
    ({ child }) => child.duration,
  );
  if (
    interestingChildren.length == 1 &&
    interestingChildren[0].start == 0 &&
    interestingChildren[0].child.duration == current.duration
  ) {
    // Merge this node with its only interesting child to flatten the tree.
    // Keep selectableRoot pointing to the outermost node of the chain.
    dump(
      interestingChildren[0].child,
      prefix,
      start,
      limit,
      descriptionPrefix + current.description + " ⏵ ",
      parent,
      selectableRoot ?? current,
    );
  } else {
    // Add this node to the tree then process its children recursively.
    const end = Math.min(start + current.duration, limit);
    const info: ShowableTree = {
      prefix,
      description: descriptionPrefix + current.description,
      start,
      end,
      parent,
      children: [],
      absolutePosition: chapterList.length,
      siblingPosition: parent ? parent.children.length : NaN,
      selectable: selectableRoot ?? current,
    };
    if (parent) {
      parent.children.push(info);
    }
    chapterList.push(info);
    interestingChildren.forEach((next) => {
      const absoluteStart = start + next.start;
      dump(next.child, FIGURE_SPACE + prefix, absoluteStart, end, "", info);
    });
  }
}
const select = getById("chapterSelector", HTMLSelectElement);

/**
 * Rebuild {@link chapterList} and the chapter `<select>` from the current tree, keeping the
 * same chapter selected if it still exists.
 *
 * The previous selection is found by its Showable first and its description second.  A
 * description alone isn't stable: when `dump()` collapses a single-child chain, a newly added
 * child can turn "Galaga" into "Galaga ⏵ Timeline".
 *
 * @returns true if the selected chapter is still the same Showable as before.
 */
function initChapters(): boolean {
  const previous = chapterList[select.selectedIndex];
  chapterList.length = 0;
  dump(toShow);
  select.replaceChildren();
  chapterList.forEach((value) => {
    const option = document.createElement("option");
    option.textContent = value.prefix + value.description;
    option.value = value.description;
    select.append(option);
  });
  let restoredIndex = previous
    ? chapterList.findIndex((d) => d.selectable === previous.selectable)
    : -1;
  if (restoredIndex < 0 && previous) {
    restoredIndex = chapterList.findIndex(
      (d) => d.description === previous.description,
    );
  }
  select.selectedIndex = restoredIndex >= 0 ? restoredIndex : 0;
  return (
    previous !== undefined &&
    chapterList[select.selectedIndex].selectable === previous.selectable
  );
}

initChapters();
//console.table(chapterList);

/**
 * These describe the parent of the currently selected section.
 */
const parentCells = querySelectorAll("#parentRow td", HTMLTableCellElement);
/**
 * These describe the section immediately before this section, sharing the same parent.
 */
const previousSiblingCells = querySelectorAll(
  "#previousSiblingRow td",
  HTMLTableCellElement,
);
/**
 * These describe the current section of the video.
 */
const thisCells = querySelectorAll("#thisRow td", HTMLTableCellElement);
/**
 * These describe the first subsection of the current section.
 */
const firstChildCells = querySelectorAll(
  "#firstChildRow td",
  HTMLTableCellElement,
);
/**
 * These describe the section immediately after the current section, sharing the same parent.
 */
const nextSiblingCells = querySelectorAll(
  "#nextSiblingRow td",
  HTMLTableCellElement,
);

const buttonDestination = new Map<
  HTMLButtonElement,
  ShowableTree | undefined
>();

/**
 * Fill in the table that shows information about a handful or relevant sections.
 * @param cells The row to update
 * @param info Describes the relevant section.
 */
function updateRow(
  cells: readonly HTMLTableCellElement[],
  info: ShowableTree | undefined,
) {
  /**
   * Pressing this button will jump to the section described by this row.
   *
   * The row for the current section has no button because we are already there.
   */
  const button = querySelectorAll(
    "button",
    HTMLButtonElement,
    0,
    1,
    cells[0],
  ).at(0);
  if (button) {
    button.disabled = info == undefined;
    buttonDestination.set(button, info);
  }
  if (info == undefined) {
    cells[1].textContent = "";
    cells[2].textContent = "";
    cells[3].textContent = "";
  } else {
    cells[1].textContent = info.description;
    cells[2].textContent = (info.start / 1000).toFixed(3);
    cells[3].textContent = (info.end / 1000).toFixed(3);
  }
}

/**
 * Go to the previous section.
 *
 * This is based on an in order traversal of the tree.
 * This might be a sibling or the parent of the current element.
 */
const previousButton = getById("previousButton", HTMLButtonElement);

/**
 * Go to the next section.
 *
 * This is based on an in order traversal of the tree.
 */
const nextButton = getById("nextButton", HTMLButtonElement);

const componentsEditorFieldset = getById(
  "componentsEditor",
  HTMLFieldSetElement,
);
const scheduleEditorFieldset = getById("scheduleEditor", HTMLFieldSetElement);

/**
 * The slide child currently being edited in the schedule editor.
 * null means the parent section itself is the schedule target.
 */
let selectedSlideChild: Showable | null = null;

/** The active {@link RootComponentEditor}, if the current root has one. */
let activeRootComponentEditor: RootComponentEditor | undefined = undefined;

/** The element returned by {@link activeRootComponentEditor}.start(), shown at the top of .components-list. */
let activeRootComponentEditorElement: HTMLElement | undefined = undefined;

const visualEditorAPI: VisualEditorAPI = {
  getCurrentlySelected(): Showable {
    return selectedSlideChild ?? chapterList[select.selectedIndex]!.selectable;
  },
  refreshGUI(howMuch) {
    const selectable = chapterList[select.selectedIndex]?.selectable;
    if (!selectable) return;
    if (howMuch === "sound") {
      void initAudio();
    } else if (howMuch === "properties") {
      updateScheduleEditor(selectedSlideChild ?? selectable);
    } else {
      // "structure"
      selectedSlideChild = null;
      updateComponentEditor(selectable);
      updateScheduleEditor(selectable);
      void saveVideoState();
    }
  },
  seek(ms) {
    stopAudio();
    loadPlayPositionSeconds(sectionStartTime + ms);
    loadPlayPositionRange();
  },
  getCurrentTimeMs() {
    return playPositionSeconds.valueAsNumber * 1000 - sectionStartTime;
  },
  getDecodedBuffer(url: string): AudioBuffer | null {
    return audioBuilder.getDecodedBuffer(url);
  },
};

// MARK: Console API
philDebug.chapterList = chapterList;
philDebug.refreshSounds = () => void initAudio();
philDebug.VisualEditor = {
  get rootComponent(): Showable | undefined {
    return chapterList[select.selectedIndex]?.selectable;
  },
  get selectedComponent(): Showable | null {
    return selectedSlideChild;
  },
  /** Current time in ms relative to the start of the selected chapter. */
  get localTimeMs(): number {
    return playPositionSeconds.valueAsNumber * 1000 - sectionStartTime;
  },
};

const scheduleHistoryControls = getById("scheduleHistoryControls", HTMLElement);
const openHistoryDialogBtn = getById("openHistoryDialogBtn", HTMLButtonElement);
const historyDialog = getById("historyDialog", HTMLDialogElement);
const historyList = getById("historyList", HTMLUListElement);
const historyDeleteBtn = getById("historyDeleteBtn", HTMLButtonElement);
const historyAbandonBtn = getById("historyAbandonBtn", HTMLButtonElement);
const historySaveBtn = getById("historySaveBtn", HTMLButtonElement);
const historyOkBtn = getById("historyOkBtn", HTMLButtonElement);
const historyCancelBtn = getById("historyCancelBtn", HTMLButtonElement);
const historyDialogHint = getById("historyDialogHint", HTMLElement);

// MARK: Rect marker drag state
type RectKf = Keyframe<ReadOnlyRect>;
type RectHandle = "tl" | "tr" | "bl" | "br" | "center";

/** The single rect keyframe currently in "edit" mode (drag handles shown on canvas). At most one at a time. */
let editingRectKf: RectKf | null = null;

/** Rect keyframes in "view" mode (shown as transparent overlays, but not draggable). */
const viewingRectKfs = new Set<RectKf>();

/** Maps each rect keyframe to a callback that syncs the editor number inputs when a drag changes the value. */
const markerSyncCallbacks = new Map<RectKf, (rect: ReadOnlyRect) => void>();

/**
 * When set, Shift-dragging a rect keyframe for which this returns a number
 * locks to that aspect ratio instead of the rectangle's own starting shape.
 * The Video File panel uses this so a Video Clip's Dest Rect snaps to the
 * shape of the video.  Cleared whenever {@link updateScheduleEditor} rebuilds.
 */
let rectAspectLock: ((kf: RectKf) => number | undefined) | null = null;

let draggingMarker: {
  kf: RectKf;
  handle: RectHandle;
  startLocalX: number;
  startLocalY: number;
  startRect: ReadOnlyRect;
} | null = null;

// MARK: Lattice marker drag state
/** Starting point for a brand new lattice keyframe: a 4x3 area of 1x1 cells. */
const DEFAULT_LATTICE: LatticeValue = {
  x: 0,
  y: 0,
  width: 4,
  height: 3,
  cellWidth: 1,
  cellHeight: 1,
};

type LatticeKf = Keyframe<LatticeValue>;
/** The rect handles, plus one more that drags the bottom-right corner of the top-left cell. */
type LatticeHandle = RectHandle | "cell";

/** The single lattice keyframe currently in "edit" mode. At most one at a time. */
let editingLatticeKf: LatticeKf | null = null;

/** Lattice keyframes in "view" mode (shown as overlays, but not draggable). */
const viewingLatticeKfs = new Set<LatticeKf>();

/** Maps each lattice keyframe to a callback that syncs the editor number inputs when a drag changes the value. */
const latticeSyncCallbacks = new Map<LatticeKf, (v: LatticeValue) => void>();

let draggingLattice: {
  kf: LatticeKf;
  handle: LatticeHandle;
  startLocalX: number;
  startLocalY: number;
  startValue: LatticeValue;
} | null = null;

// MARK: Point marker drag state
type PointKf = Keyframe<{ x: number; y: number }>;

/** The single point keyframe currently in "edit" mode. At most one at a time. */
let editingPointKf: PointKf | null = null;

/** Point keyframes in "view" mode (shown as small circles on canvas). */
const viewingPointKfs = new Set<PointKf>();

/** Maps each point keyframe to a callback that syncs the editor inputs when a drag changes the value. */
const pointSyncCallbacks = new Map<
  PointKf,
  (pt: { x: number; y: number }) => void
>();

/** The point keyframe currently being dragged. */
let draggingPoint: PointKf | null = null;

/**
 * Maps each number keyframe to a callback that syncs its editor input when
 * something other than that input changes the value -- e.g. dragging a
 * Multi Text's frame changes its Width and Height.
 */
const numberSyncCallbacks = new Map<Keyframe<number>, (n: number) => void>();

/**
 * 👁 / ✎ for each Multi Text's frame, remembered across rebuilds of the
 * schedule editor.  Starts with the handles showing, like selecting a text
 * box in PowerPoint.
 */
const textFrameCanvasStates = new WeakMap<MultiTextComponent, CanvasState>();

// MARK: Arrow marker drag state
type ArrowKf = Keyframe<ArrowValue>;
type ArrowHandle = "flat" | "pointy" | "center";

/** The single arrow keyframe currently in "edit" mode. */
let editingArrowKf: ArrowKf | null = null;

/** Arrow keyframes in "view" mode (shown as overlays, not draggable). */
const viewingArrowKfs = new Set<ArrowKf>();

/** Maps each arrow keyframe to a callback that syncs editor inputs when a drag changes the value. */
const arrowSyncCallbacks = new Map<ArrowKf, (v: ArrowValue) => void>();

let draggingArrow: {
  kf: ArrowKf;
  handle: ArrowHandle;
  startFlat: { x: number; y: number };
  startPointy: { x: number; y: number };
  startLocalX: number;
  startLocalY: number;
  pointerId: number;
} | null = null;

/** Last known local mouse position during an arrow drag (for constraint guide drawing). */
let draggingArrowMouseLocal: { x: number; y: number } | null = null;
/** Active constraint mode during arrow drag. */
let draggingArrowConstraint: "none" | "axial" | "radial" = "none";

/** Per-frame callbacks that refresh the "Go To" button labels in the schedule editor.
 *  Cleared whenever {@link updateScheduleEditor} rebuilds the table. */
const goToButtonUpdaters: Array<() => void> = [];

/**
 * Callbacks that sync duration `<input>` elements to their Showable's current
 * duration.  Each callback skips the update if its input has focus (to avoid
 * clobbering an in-progress drag or keystroke).
 * Cleared and repopulated whenever {@link updateComponentEditor} rebuilds.
 */
const durationSyncCallbacks: Array<() => void> = [];
const soundClipSyncCallbacks: Array<() => void> = [];
/**
 * The sound clip highlighted on the timeline and in its owner's Sound Clips
 * list.  Declared up here, not with the other sound clip code, because
 * {@link updateScheduleEditor} reads it and runs during startup.
 */
let selectedSoundClip: SoundClip | undefined;
/**
 * Callbacks that refresh custom panels in the schedule editor (bottom right)
 * when a duration changes anywhere — e.g. the Video File panel's speed
 * readout, after the Duration field in the component tree is edited.
 * Cleared whenever {@link updateScheduleEditor} rebuilds.
 */
const scheduleEditorRefreshers: Array<() => void> = [];

/** The selectable whose `.parent` is currently set to {@link veRootParent}. */
let _veRootSelectable: Showable | undefined;

let _durationAudioTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Synthetic {@link ShowableParent} that acts as the root of the editable tree.
 * When a selectable's `scheduleHasChanged()` chain reaches this object we:
 * - refresh all visible duration inputs,
 * - kick the auto-save / dirty-status machinery, and
 * - debounce an audio reload.
 */
const veRootParent: ShowableParent = {
  scheduleHasChanged() {
    for (const cb of durationSyncCallbacks) cb();
    for (const cb of scheduleEditorRefreshers) cb();
    markDirty();
    clearTimeout(_durationAudioTimer);
    _durationAudioTimer = setTimeout(() => void initAudio(), 300);
    // Redraw the timeline so block positions/sizes update during drags.
    if (_veRootSelectable) {
      timelineDisplay.setChapterDuration(_veRootSelectable.duration);
      timelineDisplay.setBlocks(_buildTimelineBlocks(_veRootSelectable));
    }
    scheduleChapterRefresh();
  },
};

/**
 * ShowableParent for the top-level `toShow` object.
 *
 * With {@link InSeriesComponent}, every slide has `.parent` set to `toShow`
 * (the slideList), so the `scheduleHasChanged()` chain now terminates here
 * instead of at `veRootParent`.  This object mirrors `veRootParent`'s
 * effects — timeline rebuild, dirty mark, audio reload — but is a *separate*
 * instance so `setVeRoot`'s cleanup (`parent === veRootParent`) never
 * accidentally clears this link.
 */
const toShowParent: ShowableParent = {
  scheduleHasChanged() {
    for (const cb of durationSyncCallbacks) cb();
    for (const cb of scheduleEditorRefreshers) cb();
    markDirty();
    clearTimeout(_durationAudioTimer);
    _durationAudioTimer = setTimeout(() => void initAudio(), 300);
    if (_veRootSelectable) {
      timelineDisplay.setChapterDuration(_veRootSelectable.duration);
      timelineDisplay.setBlocks(_buildTimelineBlocks(_veRootSelectable));
    }
    scheduleChapterRefresh();
  },
};
toShow.parent = toShowParent;

/** Wire `selectable` as the current VE root, unparenting the previous one. */
function setVeRoot(selectable: Showable): void {
  if (_veRootSelectable === selectable) return;
  if (_veRootSelectable?.parent === veRootParent) {
    _veRootSelectable.parent = undefined;
  }
  _veRootSelectable = selectable;
  if (selectable.parent === undefined) {
    selectable.parent = veRootParent;
  }
}

// MARK: Component Editor

/** Maps dynamically-added component instances back to their registry key for serialization. */

/**
 * Populated during each live showFrame() call via the registerTransform callback.
 * Maps a component Showable to the absolute canvas DOMMatrix that was in effect
 * when the component was last rendered.  Used by drawScheduleMarkers() to draw
 * handles in the correct transformed position, and by hit-testing to convert
 * logical mouse coordinates to component-local coordinates.
 */
const componentTransforms = new WeakMap<Showable, DOMMatrix>();

/**
 * Change the GUI to match the current section.
 * Read the current section out of the <select> (drop down) element.
 */
/**
 * Point the table, the Previous/Next buttons and the playback bounds at `info`.
 *
 * This is the light half of {@link updateFromSelect}: it leaves the audio, the selected
 * component and both editors alone, so it is safe to run while the user is editing.
 */
function applyChapterBounds(info: ShowableTree): void {
  previousButton.disabled = info.absolutePosition == 0;
  nextButton.disabled = info.absolutePosition == chapterList.length - 1;
  updateRow(parentCells, info.parent);
  updateRow(thisCells, info);
  updateRow(firstChildCells, info.children.at(0));
  const previousSibling =
    info.parent && info.siblingPosition != 0
      ? info.parent.children.at(info.siblingPosition - 1)
      : undefined;
  updateRow(previousSiblingCells, previousSibling);
  const nextSibling = info.parent
    ? info.parent.children.at(info.siblingPosition + 1)
    : undefined;
  updateRow(nextSiblingCells, nextSibling);
  // Round both boundaries to 0.1 ms precision (matching the toFixed(4) display).
  // Rounding start UP and end DOWN prevents the range from ever pointing at a frame
  // that belongs to the adjacent chapter, even after a toFixed(4) round-trip.
  sectionStartTime = Math.ceil(info.start * 10) / 10;
  sectionEndTime = info.end;
  if (sectionEndTime < toShow.duration) {
    // Floor first so that subtracting 0.1 lands on a clean 0.1 ms boundary.
    sectionEndTime = Math.floor(sectionEndTime * 10) / 10 - 0.1;
  }
  playPositionRange.min = sectionStartTime.toString();
  playPositionRange.max = sectionEndTime.toString();
}

/** Switch to the chapter selected in the `<select>`. */
function updateFromSelect() {
  stopAudio();
  const info = chapterList[select.selectedIndex];
  applyChapterBounds(info);
  // playPositionRange automatically clamps to [min, max].  Make the number match.
  const rawPositionMs = playPositionRange.valueAsNumber;
  const safePositionMs = Math.max(rawPositionMs, sectionStartTime);
  loadPlayPositionSeconds(safePositionMs);
  const newRootEditor = info.selectable.rootComponentEditor;
  if (newRootEditor !== activeRootComponentEditor) {
    activeRootComponentEditor?.suspend();
    activeRootComponentEditor = newRootEditor;
    activeRootComponentEditorElement = newRootEditor
      ? newRootEditor.start(visualEditorAPI)
      : undefined;
  }
  selectedSlideChild = null;
  updateComponentEditor(info.selectable);
  updateScheduleEditor(info.selectable);
  _updateTimeline(info.selectable);
}
select.addEventListener("input", updateFromSelect);

/**
 * Bring the chapter list and the playback bounds up to date after durations change.
 *
 * The chapter list stores each chapter's start and end, so it goes stale whenever a duration
 * changes: typing one, dragging on the timeline, adding or removing a child, or restoring
 * saved state.  When the selected chapter survives, only the bounds are refreshed, leaving
 * playback and the editors alone.  When it's gone, this switches chapters properly.
 */
function refreshChapters(): void {
  if (initChapters()) {
    applyChapterBounds(chapterList[select.selectedIndex]);
    // The range clamped itself to the new bounds; show the real position again.  The
    // number input stays the source of truth, so a playhead past a shortened end is left
    // for playback to wrap rather than moved here.
    loadPlayPositionRange();
  } else {
    updateFromSelect();
  }
}

let _chapterRefreshPending = false;

/** Run {@link refreshChapters} at most once per animation frame; a drag fires many changes. */
function scheduleChapterRefresh(): void {
  if (_chapterRefreshPending) return;
  _chapterRefreshPending = true;
  requestAnimationFrame(() => {
    _chapterRefreshPending = false;
    refreshChapters();
  });
}
updateFromSelect();

timelineDisplay.onSeek = (localMs) => {
  stopAudio();
  loadPlayPositionSeconds(localMs + sectionStartTime);
  loadPlayPositionRange();
};

timelineDisplay.onBlockClick = (id) => {
  // Find the Showable that was clicked (may be nested) and select it.
  const selectable = chapterList[select.selectedIndex]?.selectable;
  if (!selectable) return;
  // A sound clip:  select its owner, which shows the clip in its Sound Clips list.
  const soundOwner = ownerOf(soundOwners(selectable), id as SoundClip);
  if (soundOwner) {
    selectedSoundClip = id as SoundClip;
    selectInChapter(soundOwner.owner);
    return;
  }
  function findIn(
    children: NonNullable<Showable["children"]>,
    container: Showable,
  ): boolean {
    for (const { child } of children) {
      if (child === id) {
        selectedSlideChild = child;
        updateComponentEditor(container);
        updateScheduleEditor(child);
        timelineDisplay.setSelectedId(child);
        return true;
      }
      if (child.children?.length && findIn(child.children, child)) return true;
    }
    return false;
  }
  findIn(selectable.children ?? [], selectable);
};

// MARK: Timeline blocks

/**
 * A sound clip's numbers changed, from a field or a drag on the timeline.
 * Save, rebuild the audio soon, and bring the fields and the timeline up to date.
 */
function _onClipValueChanged(): void {
  markDirty();
  clearTimeout(_durationAudioTimer);
  _durationAudioTimer = setTimeout(() => void initAudio(), 300);
  for (const cb of soundClipSyncCallbacks) cb();
  timelineDisplay.redraw();
}

// MARK: Sound clips

/** Shortest a sound clip can be trimmed to by dragging, in ms. */
const MIN_SOUND_CLIP_MS = 50;

/** How long the file `clip` plays from is, once it has been decoded. */
function soundFileMs(clip: SoundClip): number | undefined {
  const buffer = audioBuilder.getDecodedBuffer(clip.source);
  return buffer ? buffer.duration * 1000 : undefined;
}

/**
 * How long `clip` plays:  its Length, or with no Length, the rest of its
 * file.  Undefined only when that file hasn't been decoded yet.
 */
function soundClipLengthMs(clip: SoundClip): number | undefined {
  if (clip.lengthMs !== undefined) return clip.lengthMs;
  const fileMs = soundFileMs(clip);
  return fileMs === undefined
    ? undefined
    : Math.max(0, fileMs - (clip.startMsIntoClip ?? 0));
}

/**
 * A timeline block for one sound clip, whose owner starts `ownerStart` ms
 * into the chapter.  The body moves it, the left edge trims or extends its
 * beginning, and the right edge its end.  Trimming leaves the rest of the
 * sound playing at exactly the same moment.
 */
function soundClipBlock(clip: SoundClip, ownerStart: number): TimelineBlock {
  const start = () => ownerStart + clip.startMsIntoScene;
  return {
    id: clip,
    get label() {
      return clip.notes || clip.source || "—";
    },
    color: "#3aab3a",
    lane: "sound",
    startMs: start,
    durationMs: () => soundClipLengthMs(clip) ?? 0,
    waveform: () => {
      const buffer = audioBuilder.getDecodedBuffer(clip.source);
      return buffer ? { buffer, fromMs: clip.startMsIntoClip ?? 0 } : undefined;
    },
    onDragBody: (newStartMs) => {
      // Before the owner starts, or after it ends, is legal.
      clip.startMsIntoScene = tidyMs(newStartMs - ownerStart);
      _onClipValueChanged();
    },
    onDragLeft: (newStartMs) => {
      const fromMs = clip.startMsIntoClip ?? 0;
      let delta = newStartMs - start();
      // Can't start before the file does.
      delta = Math.max(delta, -fromMs);
      const length = soundClipLengthMs(clip);
      if (length !== undefined) {
        delta = Math.min(delta, length - MIN_SOUND_CLIP_MS);
      }
      clip.startMsIntoScene = tidyMs(clip.startMsIntoScene + delta);
      clip.startMsIntoClip = tidyMs(fromMs + delta);
      // With no Length the clip plays to the end of its file, so its end
      // already stays put.
      if (clip.lengthMs !== undefined) {
        clip.lengthMs = tidyMs(clip.lengthMs - delta);
      }
      _onClipValueChanged();
    },
    onDragRight: (newEndMs) => {
      let length = newEndMs - start();
      const fileMs = soundFileMs(clip);
      if (fileMs !== undefined) {
        // Can't play past the end of the file.
        length = Math.min(length, fileMs - (clip.startMsIntoClip ?? 0));
      }
      clip.lengthMs = tidyMs(Math.max(MIN_SOUND_CLIP_MS, length));
      _onClipValueChanged();
    },
    onCommitRight: () => start() + (soundClipLengthMs(clip) ?? 0),
  };
}

/**
 * Select `target`, which is the current chapter or something inside it, the
 * same way clicking it in the component tree does.
 */
function selectInChapter(target: Showable): void {
  const chapter = chapterList[select.selectedIndex]?.selectable;
  if (!chapter) return;
  selectedSlideChild = target === chapter ? null : target;
  updateComponentEditor(chapter);
  updateScheduleEditor(target);
  activeRootComponentEditor?.selectionChanged(target);
  timelineDisplay.setSelectedId(selectedSlideChild ?? undefined);
}

/** Build timeline blocks for the children of `selectable`. */
function _buildTimelineBlocks(selectable: Showable): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];
  const seen = new Set<object>();

  function addChildrenBlocks(
    children: NonNullable<Showable["children"]>,
    offset: number,
  ): void {
    for (const { child, start: childStart } of children) {
      const absoluteStart = offset + childStart;
      // Capture label before instanceof narrowing removes userEditableDescription from the type.
      const label = child.userEditableDescription ?? child.description;

      if (child instanceof PaddingComponent) {
        const primaryChild = child.children?.[0]?.child;
        if (!primaryChild || seen.has(primaryChild)) continue;
        seen.add(primaryChild);
        seen.add(child);
        const primaryLabel =
          primaryChild.userEditableDescription ?? primaryChild.description;
        const blockLabel = primaryLabel || label;
        const paddedStart = () => absoluteStart + child.initialTimeScalar.value;
        const durationAgnosticChild =
          primaryChild instanceof DurationAgnosticComponent
            ? primaryChild
            : undefined;
        blocks.push({
          id: child,
          label: blockLabel,
          startMs: paddedStart,
          durationMs: () => primaryChild.duration,
          onDragLeft: (newStartMs) => {
            child.initialTimeScalar.value = Math.max(
              0,
              newStartMs - absoluteStart,
            );
          },
          handleEndMs: durationAgnosticChild
            ? () =>
                paddedStart() + durationAgnosticChild.minDurationScalar.value
            : undefined,
          onDragRight: durationAgnosticChild
            ? (newEndMs) => {
                durationAgnosticChild.minDurationScalar.value = Math.max(
                  0,
                  newEndMs - paddedStart(),
                );
              }
            : undefined,
          onCommitRight: durationAgnosticChild
            ? () =>
                paddedStart() + durationAgnosticChild.minDurationScalar.value
            : undefined,
        });
      } else if (child instanceof DurationAgnosticComponent) {
        if (seen.has(child)) continue;
        seen.add(child);
        blocks.push({
          id: child,
          label,
          startMs: () => absoluteStart,
          durationMs: () => child.duration,
          handleEndMs: () => absoluteStart + child.minDurationScalar.value,
          onDragRight: (newEndMs) => {
            child.minDurationScalar.value = Math.max(
              0,
              newEndMs - absoluteStart,
            );
          },
          onCommitRight: () => absoluteStart + child.minDurationScalar.value,
        });
      } else if (child.setDuration !== undefined) {
        if (seen.has(child)) continue;
        seen.add(child);
        blocks.push({
          id: child,
          label,
          startMs: () => absoluteStart,
          durationMs: () => child.duration,
          onDragRight: (newEndMs) => {
            child.setDuration!(Math.max(0, newEndMs - absoluteStart));
          },
          onCommitRight: () => absoluteStart + child.duration,
        });
      } else if (child.children?.length) {
        // Structural container with no settable duration (e.g. InSeriesComponent).
        // Show its children on the timeline with their start times accumulated.
        addChildrenBlocks(child.children, absoluteStart);
      }
    }
  }

  addChildrenBlocks(selectable.children ?? [], 0);

  // Every sound clip in this chapter, whoever owns it, in the sound lane.
  for (const { owner, startMs } of soundOwners(selectable)) {
    for (const clip of owner.soundClips!) {
      blocks.push(soundClipBlock(clip, startMs));
    }
  }

  return blocks;
}

function _updateTimeline(selectable: Showable): void {
  timelineDisplay.setChapterDuration(selectable.duration);
  timelineDisplay.setBlocks(_buildTimelineBlocks(selectable));
  timelineDisplay.setSelectedId(selectedSlideChild ?? undefined);
}
querySelectorAll("table button", HTMLButtonElement).forEach((button) => {
  button.addEventListener("click", () => {
    const info = buttonDestination.get(button)!;
    select.selectedIndex = info.absolutePosition;
    updateFromSelect();
  });
});
previousButton.addEventListener("click", () => {
  select.selectedIndex--;
  updateFromSelect();
});
nextButton.addEventListener("click", () => {
  select.selectedIndex++;
  updateFromSelect();
});

/**
 * When someone hits refresh in their browser,
 * or hits save in vs code so vite causes a refresh,
 * restart the user with the same gui settings.
 */
function saveState() {
  sessionStorage.setItem("index", select.selectedIndex.toString());
  sessionStorage.setItem("timeInSeconds", playPositionSeconds.value);
  sessionStorage.setItem(
    "state",
    querySelector('input[name="onSectionEnd"]:checked', HTMLInputElement).value,
  );
  sessionStorage.setItem("wasPlaying", playCheckBox.checked ? "1" : "0");
  sessionStorage.setItem("zoomSelect", zoomSelect.value);
  sessionStorage.setItem("panX", panX.toString());
  sessionStorage.setItem("panY", panY.toString());
  sessionStorage.setItem(
    "quality",
    querySelector('input[name="quality"]:checked', HTMLInputElement).value,
  );

  // Splitter positions — only persist if an explicit size was set by drag or restore.
  const topLeft = getById("top-left", HTMLDivElement);
  const topRight = getById("top-right", HTMLDivElement);
  const leftCol = getById("left-col", HTMLDivElement);
  if (topLeft.style.height)
    sessionStorage.setItem("pane-height-top-left", topLeft.style.height);
  if (topRight.style.height)
    sessionStorage.setItem("pane-height-top-right", topRight.style.height);
  if (leftCol.style.flex)
    sessionStorage.setItem(
      "pane-width-left-col",
      leftCol.style.flex.split(" ")[2],
    );
}

addEventListener("pagehide", (_event) => {
  saveState();
});

// MARK: Schedule Editor

type ScheduleInfo = NonNullable<Showable["schedules"]>[number];

// MARK: Schedule persistence (IndexedDB)

const toShowKey = new URLSearchParams(location.search).get("toShow") ?? "";

/** Marker written when the user deliberately chooses TypeScript defaults. */
type MarkerHistoryEntry = {
  timestamp: number;
  kind: "ts-defaults";
};
function isMarker(e: VideoHistoryEntry): e is MarkerHistoryEntry {
  return "kind" in e;
}

/**
 * One saved state of the whole video — the unit of undo.
 *
 * A video is one tree, so one entry holds all of it; see
 * development-plans/single-tree-per-video.md.
 */
type VideoDataEntry = { timestamp: number; tree: SerializedFixedChild };
type VideoHistoryEntry = VideoDataEntry | MarkerHistoryEntry;
type VideoHistoryRecord = {
  videoKey: string;
  entries: VideoHistoryEntry[];
};

/** Where the current in-memory state came from. */
type LoadSource =
  | { kind: "ts-defaults" }
  | { kind: "db"; timestamp: number }
  | { kind: "json"; filename: string };

const MAX_HISTORY_ENTRIES = 20;

/**
 * TypeScript defaults captured at page load — before any DB restoration.
 *
 * One tree for the whole video, matching the shape a video is actually saved in.  Shown as a
 * permanent "TypeScript defaults" option in the history list so the user can always reset to
 * the code-defined starting point. Never written to IndexedDB.
 *
 * Undefined only before {@link captureDefaults}() has run.
 */
let tsDefaultsTree: SerializedFixedChild | undefined;
/** Where the video's current in-memory state was loaded from. */
let _loadSource: LoadSource | undefined;
/**
 * {@link currentTreeJson} as of the last load from, or save to, IndexedDB or a file.
 * {@link isVideoDirty} compares against this to decide whether an autosave is needed.
 */
let _baselineTreeJson: string | undefined;

function openScheduleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("canvas-recorder-schedules", 4);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      if (oldVersion < 2)
        db.createObjectStore("files", { keyPath: "filename" });
      if (oldVersion < 3)
        db.createObjectStore("videos", { keyPath: "videoKey" });
      // Versions 1–3 had a per-chapter "history" store.  "videos" replaced it in v3, and v4
      // removes it.  Also drop the directory handle left behind by the temporary
      // "Save All 3" button.  See development-plans/single-tree-per-video.md.
      if (db.objectStoreNames.contains("history")) db.deleteObjectStore("history");
      if (oldVersion < 4)
        req.transaction!.objectStore("files").delete("__properties-dir__");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // A second tab still holding the old version blocks the upgrade, and without this the
    // page would just hang with no explanation.
    req.onblocked = () =>
      console.error(
        "IndexedDB upgrade is blocked — another tab has this database open at an " +
          "older version. Close other canvas-recorder tabs and reload.",
      );
  });
}

// MARK: File handle DB

type FileRecord = {
  filename: string;
  /** null for the "no active file" sentinel. */
  handle: FileSystemFileHandle | null;
  savedAt: number;
  isActive: boolean;
  /** Scopes this record to a specific video tab (toShowKey). Added for per-video isolation. */
  videoKey?: string;
  /** "Sync to file" is checked for this file.  See dev/synced-file.ts. */
  syncEnabled?: boolean;
  /** Exactly what the last sync wrote.  How a sync notices someone else changed the file. */
  lastWrittenBody?: string;
};

// The `__no-file__|<video>` sentinel record was once written by "Restore Defaults" to detach from
// the active file, so that startup wouldn't load it.  Startup no longer loads from files at all
// (IndexedDB is the only source; synced files are exports), so nothing needs the sentinel.
// Databases created before then may still contain one; the readers below skip records without a
// handle.

/** Read all records from the `files` table scoped to the given video. */
async function readAllFileRecords(videoKey: string): Promise<FileRecord[]> {
  const db = await openScheduleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readonly");
    const req = tx.objectStore("files").getAll();
    req.onsuccess = () =>
      resolve(
        (req.result as FileRecord[]).filter((r) => r.videoKey === videoKey),
      );
    req.onerror = () => reject(req.error);
  });
}

/** Remove a single file record from the `files` table by its filename key. */
async function deleteFileRecord(filename: string): Promise<void> {
  const db = await openScheduleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").delete(filename);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function readVideoHistory(): Promise<VideoHistoryRecord | undefined> {
  const db = await openScheduleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("videos", "readonly");
    const req = tx.objectStore("videos").get(toShowKey);
    req.onsuccess = () => resolve(req.result as VideoHistoryRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function writeVideoHistory(entries: VideoHistoryEntry[]): Promise<void> {
  const db = await openScheduleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("videos", "readwrite");
    tx.objectStore("videos").put({
      videoKey: toShowKey,
      entries,
    } satisfies VideoHistoryRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// MARK: Sync to file

async function getFileRecord(key: string): Promise<FileRecord | undefined> {
  const db = await openScheduleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readonly");
    const req = tx.objectStore("files").get(key);
    req.onsuccess = () => resolve(req.result as FileRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function putFileRecord(record: FileRecord): Promise<void> {
  const db = await openScheduleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Storage for a synced file whose record lives under one fixed key (the
 * defaults and diff files).  These records have no `videoKey`, which is what
 * keeps them out of the Load dialog.
 *
 * @param enabledIfUnknown How to read a record written before syncing existed.
 * The old "Save defaults" checkbox deleted its record when unchecked, so any
 * old defaults record means it was on.
 */
function keyedSyncStorage(
  key: string,
  enabledIfUnknown: boolean,
): Pick<SyncedFileOptions, "load" | "store"> {
  return {
    async load() {
      const record = await getFileRecord(key);
      if (!record?.handle) return undefined;
      return {
        filename: record.handle.name,
        handle: record.handle,
        enabled: record.syncEnabled ?? enabledIfUnknown,
        lastWrittenBody: record.lastWrittenBody,
      };
    },
    async store({ handle, enabled, lastWrittenBody }) {
      await putFileRecord({
        filename: key,
        handle,
        savedAt: Date.now(),
        isActive: false,
        syncEnabled: enabled,
        lastWrittenBody,
      });
    },
  };
}

const JSON_FILE_TYPES: FilePickerAcceptType[] = [
  { description: "JSON", accept: { "application/json": [".json"] } },
];

/**
 * The video's state, mirrored to a JSON file on every save to IndexedDB.
 *
 * Its records are the per-video ones the Load dialog lists, so every file it
 * has synced to stays available there.  The synced one is the "active" one.
 * A file made active by the old Save As button isn't sync consent, so it starts
 * unchecked, suggesting that same file.
 */
const jsonSync = new SyncedFile({
  checkbox: getById("jsonSyncCheckbox", HTMLInputElement),
  status: getById("jsonSyncStatus", HTMLSpanElement),
  picker: {
    id: "json-state",
    types: JSON_FILE_TYPES,
    defaultName: () => `${toShowKey}.json`,
  },
  render: () => JSON.stringify(buildJsonSnapshot(), null, 2),
  showPending: true,
  open: (content) => {
    const tree = parseSnapshotFile(JSON.parse(content));
    if (!tree) throw new Error("This file has no usable saved state.");
    // persist:  the opened state goes into IndexedDB, so it survives a reload
    // and the previous state stays in Load.
    applyJsonSnapshot(tree, false, true);
  },
  async load() {
    const records = (await readAllFileRecords(toShowKey)).filter(
      (r) => r.handle,
    );
    const synced = records.find((r) => r.isActive && r.syncEnabled);
    // When nothing is being synced, suggest the file used most recently.
    const record =
      synced ?? records.toSorted((a, b) => b.savedAt - a.savedAt)[0];
    if (!record) return undefined;
    return {
      filename: record.filename,
      handle: record.handle!,
      enabled: record === synced,
      lastWrittenBody: record.lastWrittenBody,
    };
  },
  async store({ filename, handle, enabled, lastWrittenBody }) {
    const db = await openScheduleDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        if (enabled) {
          // Only one file per video is synced (and so "active") at a time.
          for (const r of getAllReq.result as FileRecord[]) {
            if (r.videoKey === toShowKey && r.filename !== filename && r.isActive)
              store.put({ ...r, isActive: false, syncEnabled: false });
          }
        }
        store.put({
          filename,
          handle,
          savedAt: Date.now(),
          isActive: enabled,
          syncEnabled: enabled,
          videoKey: toShowKey,
          lastWrittenBody,
        } satisfies FileRecord);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
});

/** The TypeScript defaults, mirrored to a JSON file.  These only change when the code does. */
const defaultsSync = new SyncedFile({
  checkbox: getById("defaultsSyncCheckbox", HTMLInputElement),
  status: getById("defaultsSyncStatus", HTMLSpanElement),
  picker: {
    id: "defaults-auto-save",
    types: JSON_FILE_TYPES,
    defaultName: () => `${toShowKey || "defaults"}-ts-defaults.json`,
  },
  render: () => JSON.stringify(buildDefaultsSnapshot(), null, 2),
  ...keyedSyncStorage(`__defaults-auto-save__|${toShowKey}`, true),
});

/** Every difference from the TypeScript defaults, as text, mirrored alongside the JSON. */
const diffSync = new SyncedFile({
  checkbox: getById("diffSyncCheckbox", HTMLInputElement),
  status: getById("diffSyncStatus", HTMLSpanElement),
  picker: {
    id: "diff-save",
    types: [{ description: "Text file", accept: { "text/plain": [".txt"] } }],
    defaultName: () => `${toShowKey || "diff"}.txt`,
  },
  render: () => buildDiffText(),
  // The old Save Diffs button asked every time; its record is only a suggestion.
  ...keyedSyncStorage(`__diff-save__|${toShowKey}`, false),
});

/** The code-defined starting point, in the same format as {@link buildJsonSnapshot}. */
function buildDefaultsSnapshot(): VideoSnapshot {
  return {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    videoKey: toShowKey,
    // captureDefaults() runs before anything can save, so this is always set by now.
    tree: tsDefaultsTree ?? serializeTree(toShow),
  };
}

// MARK: Diffs

/** What the diff's code generator needs to know about a brand new instance of one class. */
type ClassDefaults = {
  readonly schedules: SerializedSchedule[];
  readonly scalars: SerializedScalar[];
  readonly duration: number;
  /** Schedule description → the property that holds it, e.g. "Dest Rect" → "destinationRectSchedule". */
  readonly schedulePropertyNames: ReadonlyMap<string, string>;
  /** Scalar description → the property that holds it. */
  readonly scalarPropertyNames: ReadonlyMap<string, string>;
};

const classDefaultsCache = new Map<new () => Showable, ClassDefaults>();

/**
 * {@link ClassDefaults} for `cls`, worked out the first time and cached.  The
 * diff is rebuilt on every save, and used to construct a new instance of each
 * class for every component it described.
 */
function classDefaults(cls: new () => Showable): ClassDefaults {
  let cached = classDefaultsCache.get(cls);
  if (!cached) {
    const instance = new cls();
    // Map description → property name via reference identity.
    const propertyNames = (items: readonly { description: string }[]) => {
      const names = new Map<string, string>();
      for (const item of items) {
        for (const [k, v] of Object.entries(instance as Record<string, unknown>)) {
          if (v === item) {
            names.set(item.description, k);
            break;
          }
        }
      }
      return names;
    };
    cached = {
      schedules: serializeSchedules(instance.schedules ?? []),
      scalars: serializeScalars(instance.scalars ?? []),
      duration: instance.duration,
      schedulePropertyNames: propertyNames(instance.schedules ?? []),
      scalarPropertyNames: propertyNames(instance.scalars ?? []),
    };
    classDefaultsCache.set(cls, cached);
  }
  return cached;
}

/**
 * Builds a human-readable text diff of the current live state vs the
 * TypeScript defaults captured at page load ({@link tsDefaults}). Walks
 * tsDefaults as the authoritative source so that every property — including
 * those in slides not currently visible — is covered. Outputs "breadcrumb"
 * context lines so it is always clear where a difference lives in the tree.
 */
function buildDiffText(): string {
  const lines: string[] = [];
  const lastPath = { value: [] as string[] };

  /** Print only the path segments not yet printed since the last difference. */
  function printPathIfNeeded(path: string[]): void {
    const last = lastPath.value;
    let i = 0;
    while (i < last.length && i < path.length && last[i] === path[i]) i++;
    for (let j = i; j < path.length; j++) {
      lines.push(`${"→ ".repeat(j)}${path[j]}`);
    }
    lastPath.value = [...path];
  }

  function formatScheduleValue(s: SerializedSchedule): string {
    return s.keyframes !== undefined
      ? JSON.stringify(s.keyframes)
      : JSON.stringify(s.value);
  }

  function formatScalarValue(s: SerializedScalar): string {
    return JSON.stringify(s.value);
  }

  /** Convert a user-visible label into a camelCase JavaScript identifier. */
  function toVarName(label: string): string {
    const words = label
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .split(" ")
      .filter(Boolean);
    return words
      .map((w, i) =>
        i === 0
          ? w[0].toLowerCase() + w.slice(1)
          : w[0].toUpperCase() + w.slice(1),
      )
      .join("");
  }

  function formatScheduleAsCode(s: SerializedSchedule): string {
    return s.keyframes !== undefined
      ? JSON.stringify(s.keyframes)
      : JSON.stringify(s.value);
  }

  /**
   * Generate TypeScript constructor + .set() lines for a removable component,
   * omitting any property whose value matches the class default.
   */
  /** Variable names already used in this diff, so generated code never declares one twice. */
  const usedVarNames = new Set<string>();
  function uniqueVarName(base: string): string {
    let name = base;
    for (let i = 2; usedVarNames.has(name); i++) name = `${base}${i}`;
    usedVarNames.add(name);
    return name;
  }

  /**
   * TypeScript that recreates `comp`, a component added in the Visual Editor, and adds it to
   * `parentExpr`.  Covers everything the save file stores for such a component:  schedules
   * and scalars that differ from the class's defaults, the user's name for it, its own
   * replaceable children (recursively), its duration, and its sound clips.
   */
  function generateComponentCode(
    comp: Showable,
    indent: string,
    parentExpr = "this",
  ): string[] {
    const out: string[] = [];
    const rk = comp.registryKey ?? "unknown";
    const regEntry = componentRegistry.get(rk);

    if (!regEntry?.howToGenerate) {
      out.push(
        `${indent}// [WARNING: no howToGenerate for "${rk}" — manual conversion needed]`,
      );
      return out;
    }

    const cls = regEntry.howToGenerate.class;
    const className = cls.name;
    const def = classDefaults(cls);
    const schedulePropMap = def.schedulePropertyNames;
    const scalarPropMap = def.scalarPropertyNames;

    const defSchedules = def.schedules;
    const curSchedules = serializeSchedules(comp.schedules ?? []);
    const defScalars = def.scalars;
    const curScalars = serializeScalars(comp.scalars ?? []);

    const displayName = comp.userEditableDescription ?? comp.description ?? rk;
    const varName = uniqueVarName(toVarName(displayName) || "comp");
    const ctorDesc = comp.userEditableDescription ?? comp.description ?? rk;

    out.push(
      `${indent}const ${varName} = new ${className}({ description: ${JSON.stringify(ctorDesc)} });`,
    );

    for (const curS of curSchedules) {
      const defS = defSchedules.find((s) => s.description === curS.description);
      if (JSON.stringify(defS) !== JSON.stringify(curS)) {
        const prop =
          schedulePropMap.get(curS.description) ??
          curS.description.toLowerCase() + "Schedule";
        out.push(
          `${indent}${varName}.${prop}.set(${formatScheduleAsCode(curS)});`,
        );
      }
    }

    for (const curSc of curScalars) {
      const defSc = defScalars.find((s) => s.description === curSc.description);
      if (JSON.stringify(defSc) !== JSON.stringify(curSc)) {
        const prop =
          scalarPropMap.get(curSc.description) ??
          curSc.description.toLowerCase() + "Scalar";
        out.push(
          `${indent}${varName}.${prop}.value = ${JSON.stringify(curSc.value)};`,
        );
      }
    }

    if (comp.userEditableDescription !== undefined) {
      out.push(
        `${indent}${varName}.userEditableDescription = ${JSON.stringify(comp.userEditableDescription)};`,
      );
    }

    // Children first, so a duration that depends on them is set last.
    for (const child of comp.replaceableComponents?.get() ?? []) {
      out.push(...generateComponentCode(child, indent, varName));
    }

    if (comp.setDuration !== undefined && comp.duration !== def.duration) {
      out.push(`${indent}${varName}.setDuration(${comp.duration});`);
    }

    if (comp.soundClips?.length) {
      out.push(
        `${indent}${varName}.soundClips = ${JSON.stringify(comp.soundClips)};`,
      );
    }

    out.push(`${indent}${parentExpr}.addFixed({ child: ${varName} });`);

    return out;
  }

  function diffNode(
    defaultEntry: SerializedFixedChild,
    sel: Showable,
    path: string[],
  ): void {
    const defSchedules = defaultEntry.schedules ?? [];
    const curSchedules = sel.schedules?.length
      ? serializeSchedules(sel.schedules)
      : [];

    for (const defS of defSchedules) {
      const curS = curSchedules.find((s) => s.description === defS.description);
      if (JSON.stringify(defS) !== JSON.stringify(curS)) {
        printPathIfNeeded([...path, defS.description]);
        lines.push(`TypeScript: ${formatScheduleValue(defS)}`);
        lines.push(
          `Current:    ${curS ? formatScheduleValue(curS) : "(missing)"}`,
        );
      }
    }
    for (const curS of curSchedules) {
      if (!defSchedules.find((s) => s.description === curS.description)) {
        printPathIfNeeded([...path, curS.description]);
        lines.push(`TypeScript: (none)`);
        lines.push(`Current:    ${formatScheduleValue(curS)}`);
      }
    }

    const defScalars = defaultEntry.scalars ?? [];
    const curScalars = sel.scalars?.length ? serializeScalars(sel.scalars) : [];
    for (const defSc of defScalars) {
      const curSc = curScalars.find((s) => s.description === defSc.description);
      if (JSON.stringify(defSc) !== JSON.stringify(curSc)) {
        printPathIfNeeded([...path, defSc.description]);
        lines.push(`TypeScript: ${formatScalarValue(defSc)}`);
        lines.push(
          `Current:    ${curSc ? formatScalarValue(curSc) : "(missing)"}`,
        );
      }
    }
    for (const curSc of curScalars) {
      if (!defScalars.find((s) => s.description === curSc.description)) {
        printPathIfNeeded([...path, curSc.description]);
        lines.push(`TypeScript: (none)`);
        lines.push(`Current:    ${formatScalarValue(curSc)}`);
      }
    }

    const defDuration = defaultEntry.duration;
    const curDuration =
      sel.setDuration !== undefined ? sel.duration : undefined;
    if (
      defDuration !== curDuration &&
      (defDuration !== undefined || curDuration !== undefined)
    ) {
      printPathIfNeeded([...path, "Duration"]);
      lines.push(`TypeScript: ${defDuration ?? "(n/a)"}`);
      lines.push(`Current:    ${curDuration ?? "(n/a)"}`);
    }

    if (defaultEntry.userEditableDescription !== sel.userEditableDescription) {
      printPathIfNeeded([...path, "Description"]);
      lines.push(
        `TypeScript: ${JSON.stringify(defaultEntry.userEditableDescription)}`,
      );
      lines.push(`Current:    ${JSON.stringify(sel.userEditableDescription)}`);
    }

    const defClips = defaultEntry.soundClips;
    const curClips = sel.soundClips;
    if (JSON.stringify(defClips) !== JSON.stringify(curClips)) {
      printPathIfNeeded([...path, "Sound Clips"]);
      lines.push(`TypeScript: ${JSON.stringify(defClips)}`);
      lines.push(`Current:    ${JSON.stringify(curClips)}`);
    }

    const currentComponents = sel.replaceableComponents?.get() ?? [];
    if (currentComponents.length > 0) {
      printPathIfNeeded(path);
      for (const comp of currentComponents) {
        lines.push(...generateComponentCode(comp, "  "));
      }
    }

    const liveFixed = getFixedComponents(sel);
    const defaultFixed = defaultEntry.fixedComponents ?? [];
    const liveFor = counterparts(defaultFixed, liveFixed);
    for (const [index, defFixed] of defaultFixed.entries()) {
      const liveChild = liveFor[index];
      if (!liveChild) {
        printPathIfNeeded([...path, defFixed.description]);
        lines.push(`  [WARNING: fixed child absent from live tree]`);
        continue;
      }
      diffNode(defFixed, liveChild, [...path, defFixed.description]);
    }
    for (const liveChild of liveFixed) {
      if (!liveFor.includes(liveChild)) {
        printPathIfNeeded([...path, liveChild.description]);
        lines.push(
          `  [fixed child in live tree but absent from TypeScript defaults]`,
        );
      }
    }
  }


  // One tree, so one walk: diffNode() recurses through fixedComponents on its own.
  if (tsDefaultsTree) {
    diffNode(tsDefaultsTree, toShow, [toShow.description]);
  }

  if (lines.length === 1) lines.push("(no differences found)");

  return lines.join("\n");
}

// MARK: Load-source helpers

/** Logs abandoned or deleted items; replace console.info with persistent storage if needed. */
function sendToRecycleBin(...args: unknown[]): void {
  console.info("🗑️ Recycle bin:", ...args);
}

/**
 * The component, at or under `root`, whose replaceable children include `child`.
 * Undefined when `child` is not a replaceable child of anything in the tree -- for example
 * the root itself, or a component built in TypeScript.
 */
function findReplaceableParent(
  root: Showable,
  child: Showable,
): Showable | undefined {
  if (root.replaceableComponents?.get().includes(child)) return root;
  for (const { child: next } of root.children ?? []) {
    const found = findReplaceableParent(next, child);
    if (found) return found;
  }
  return undefined;
}

function getFixedComponents(showable: Showable): Showable[] {
  return (
    showable.children?.flatMap(({ replaceable, child }) =>
      replaceable ? [] : child,
    ) ?? []
  );
}

/**
 * The video's current state, as it is saved:  only what differs from the
 * TypeScript defaults.
 *
 * Every save goes through here:  IndexedDB, the synced file, the unload
 * backup.  The TypeScript defaults file is the one thing written in full.
 * Read a saved tree back with {@link loadableTree}.
 */
function savedTree(): SerializedFixedChild {
  return omitTreeDefaults(serializeTree(toShow), tsDefaultsTree);
}

/**
 * A saved tree with the TypeScript defaults put back, ready to apply.
 *
 * Applying only changes what a tree mentions, so without this a property you
 * changed and then saved at its default would keep your change.  Trees saved
 * before defaults were left out pass through unchanged.
 */
function loadableTree(saved: SerializedFixedChild): SerializedFixedChild {
  return fillTreeDefaults(saved, tsDefaultsTree);
}

/**
 * The canonical serialization of the video's current state.
 *
 * One function so the dirty check and the history dedup can never disagree.  They used to:
 * `currentSnapshotJson` included `userEditableDescription` while the dedup string did not, so
 * a renamed component read as dirty forever and re-saved on every autosave tick.
 */
function currentTreeJson(): string {
  return JSON.stringify(savedTree());
}

/** True if the video's in-memory state differs from what was last loaded or saved. */
function isVideoDirty(): boolean {
  return (
    _baselineTreeJson !== undefined && currentTreeJson() !== _baselineTreeJson
  );
}

function formatLoadSource(source: LoadSource | undefined): string {
  if (!source) return "—";
  switch (source.kind) {
    case "ts-defaults":
      return "TypeScript defaults";
    case "json":
      return source.filename;
    case "db":
      return new Date(source.timestamp).toLocaleString();
  }
}

// MARK: Active file display

const loadJsonBtn = getById("loadJsonTestBtn", HTMLButtonElement);

/**
 * Apply TypeScript defaults to a selectable in-place.
 *
 * Locates the selectable's node inside the one captured tree.  This replaces a flat lookup
 * plus a fallback scan of every ancestor's entry: the flat map never held an entry for a
 * nested slide, which is why restoring defaults on one used to do nothing at all.
 */
function applyTsDefaults(selectable: Showable): void {
  const node = findSerializedNode(toShow, tsDefaultsTree, selectable);
  if (node) applyJsonEntry(selectable, node);
}

/**
 * Write a ts-defaults marker for this video, but only if the latest entry is not already
 * such a marker.  Fire-and-forget.
 */
function writeMarkerIfNeeded(): void {
  void (async () => {
    const record = await readVideoHistory();
    const entries = record?.entries ?? [];
    const last = entries.at(-1);
    if (last && isMarker(last) && last.kind === "ts-defaults") return;
    entries.push({ timestamp: Date.now(), kind: "ts-defaults" });
    while (entries.length > MAX_HISTORY_ENTRIES) entries.shift();
    await writeVideoHistory(entries);
  })();
}

/**
 * Snapshots the current (TypeScript-defined) state of the whole video into
 * {@link tsDefaultsTree}.
 * Must be called once at page load, before any DB restoration, so the tree
 * always reflects the true code-defined starting point.
 */
function captureDefaults(): void {
  tsDefaultsTree = serializeTree(toShow);
}

/**
 * Restores the video's most recent DB entry.
 * Runs once at page load (after {@link captureDefaults}) so that Vite
 * hot-reloads don't wipe out in-progress edits.
 * Refreshes the schedule editor for the currently visible chapter when done.
 */
async function initFromDB(unloadBackup?: string | null): Promise<void> {
  // Parse the backup synchronously, before any async work.
  type BackupItem = { entry: VideoDataEntry; selectedTimestamp?: number };
  const backupMap = new Map<string, BackupItem>();
  if (unloadBackup) {
    try {
      const parsed = JSON.parse(unloadBackup) as {
        key: string;
        entry: VideoHistoryEntry;
        selectedTimestamp?: number;
      }[];
      for (const { key, entry, selectedTimestamp } of Array.isArray(parsed)
        ? parsed
        : [parsed]) {
        if (!isMarker(entry)) backupMap.set(key, { entry, selectedTimestamp });
      }
    } catch {
      /* malformed backup — ignore */
    }
  }

  const record = await readVideoHistory();
  const entries = record?.entries ?? [];
  const last = entries.at(-1);
  const backupItem = backupMap.get(toShowKey);
  const backup = backupItem?.entry;
  const useBackup =
    backup !== undefined && backup.timestamp > (last?.timestamp ?? 0);
  const effective = useBackup ? backup : last;

  let source: LoadSource;

  // If the previous session deliberately selected a specific entry (not dirty, not
  // ts-defaults), restore exactly that one by timestamp.
  const selectedTimestamp = backupItem?.selectedTimestamp;
  const specificEntry =
    selectedTimestamp === undefined
      ? undefined
      : entries.find(
          (e): e is VideoDataEntry =>
            !isMarker(e) && e.timestamp === selectedTimestamp,
        );

  if (specificEntry) {
    applyTree(toShow, loadableTree(specificEntry.tree));
    source = { kind: "db", timestamp: selectedTimestamp! };
  } else if (!effective || isMarker(effective)) {
    // No data entry -- the active file or the URL fetch will supply the state.
    source = { kind: "ts-defaults" };
  } else {
    applyTree(toShow, loadableTree(effective.tree));
    source = { kind: "db", timestamp: effective.timestamp };

    if (useBackup) {
      // The unload backup is newer than the database -- write it back.
      const lastJson =
        last && !isMarker(last) ? JSON.stringify(last.tree) : null;
      if (JSON.stringify(backup!.tree) !== lastJson) {
        entries.push(backup!);
        while (entries.length > MAX_HISTORY_ENTRIES) entries.shift();
        await writeVideoHistory(entries);
      } else if (last && !isMarker(last)) {
        // Same content as the newest entry -- reuse its timestamp so the history
        // dialog can still find it.
        source = { kind: "db", timestamp: last.timestamp };
      }
    }
  }
  _loadSource = source;
  _baselineTreeJson = currentTreeJson();

  canvas.style.visibility = "";
  canvasLoading.style.display = "none";
  const currentSel = chapterList[select.selectedIndex]?.selectable;
  if (currentSel) {
    updateComponentEditor(currentSel);
    updateScheduleEditor(currentSel);
  }
}


/** Saves current schedule state to IndexedDB as a full data entry.
 *  Pass force=true (💾 Save button) to bypass the ts-defaults-no-auto-save guard. */
/**
 * Append the video's current state to its undo history in IndexedDB.
 *
 * @param force Write even when the state looks clean.  Used for explicit user saves.
 */
/**
 * Save the video to IndexedDB, then bring the synced files up to date.
 *
 * Every save goes through here, and the syncs are in a `finally`, so there is
 * no way to save one without the other.  A sync whose file already matches is
 * a cheap no-op, which covers the early returns in {@link saveVideoStateToDb}.
 */
async function saveVideoState(force = false): Promise<void> {
  try {
    await saveVideoStateToDb(force);
  } finally {
    jsonSync.request();
    diffSync.request();
  }
}

async function saveVideoStateToDb(force: boolean): Promise<void> {
  if (!force && !isVideoDirty()) return;

  const tree = savedTree();
  const newJson = JSON.stringify(tree);

  const record = await readVideoHistory();
  const entries = record?.entries ?? [];

  // Nothing changed since the last data entry -- don't add a duplicate.
  const last = entries.findLast((e) => !isMarker(e)) as
    | VideoDataEntry
    | undefined;
  if (last && JSON.stringify(last.tree) === newJson) return;

  const entry: VideoDataEntry = { timestamp: Date.now(), tree };
  entries.push(entry);
  // Drop older entries with identical content, keeping only the newest copy.
  const lastIdx = entries.length - 1;
  const deduped = entries.filter(
    (e, i) =>
      i === lastIdx ||
      isMarker(e) ||
      JSON.stringify((e as VideoDataEntry).tree) !== newJson,
  );
  while (deduped.length > MAX_HISTORY_ENTRIES) deduped.shift();
  await writeVideoHistory(deduped);

  _loadSource = { kind: "db", timestamp: entry.timestamp };
  _baselineTreeJson = newJson;
}

// MARK: Auto-save timer

/** Pending auto-save timer handle, or null if no save is scheduled. */
let _autosaveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Save the video to IndexedDB if it has changed.
 * Called by the auto-save timer; never needs to update the status display
 * because the status is computed lazily when the display is next rebuilt.
 */
function _autosaveAllDirty(): void {
  _autosaveTimer = null;
  if (isVideoDirty()) void saveVideoState();
}

/**
 * Call this whenever the user makes any edit.
 * Debounces auto-saves to IndexedDB: starts (or restarts) a 5-second timer
 * so rapid changes produce one save, not hundreds.
 * The unload handler remains the safety net for any changes the timer hasn't
 * flushed yet.
 */
function markDirty(): void {
  if (_autosaveTimer !== null) clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(_autosaveAllDirty, 5000);
  jsonSync.refreshStatus();
}

/**
 * Returns the slide-level selectable that should be saved/loaded as a unit.
 * For components slides this is always the slide itself (not the selected child),
 * so a single save captures the full component list and all keyframes.
 */
function currentSaveTarget(): Showable | null {
  const selectable = chapterList[select.selectedIndex]?.selectable;
  if (!selectable) return null;
  if (selectable.replaceableComponents !== undefined) return selectable;
  return selectable.schedules?.length ? selectable : null;
}

function saveOnUnload() {

  // When the history dialog is open the live tree may hold a transient preview from
  // _dialogSelectItem.  Back up the pre-dialog state instead, so a preview is never
  // persisted as if the user had accepted it.
  const previewing = historyDialog.open && _historyTarget !== null;
  const tree = previewing
    ? (JSON.parse(_preDialogSnapshotJson) as SerializedFixedChild)
    : savedTree();
  const source = previewing ? _preDialogSource : _loadSource;
  const dirty = previewing ? _wasInitiallyDirty : isVideoDirty();

  if (source?.kind === "ts-defaults" && !dirty) {
    // Remember that the user is sitting on TypeScript defaults, not the last DB save.
    writeMarkerIfNeeded();
  } else {
    // For a clean DB selection, remember which entry the user chose so the next startup
    // restores exactly that one instead of creating a spurious new record.
    const selectedTimestamp =
      source?.kind === "db" && !dirty ? source.timestamp : undefined;
    const backup = {
      key: toShowKey,
      entry: { timestamp: Date.now(), tree } satisfies VideoDataEntry,
      ...(selectedTimestamp !== undefined && { selectedTimestamp }),
    };
    // A dirty preview's content lives only in the backup; initFromDB writes it to the DB
    // on the next startup.  Don't call saveVideoState() here -- the live tree is the
    // preview, not the state being backed up.
    if (dirty && !previewing) void saveVideoState();
    try {
      sessionStorage.setItem("pendingScheduleSave", JSON.stringify([backup]));
    } catch (e) {
      // One whole tree can exceed the ~5MB sessionStorage quota on a big video.  The
      // IndexedDB write above already happened, so losing this backstop is survivable.
      console.warn("Could not write the unload backup to sessionStorage.", e);
    }
  }
}

// MARK: History dialog

type FileEntryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; tree: SerializedFixedChild };

/** Describes a single item in the history dialog's list. */
type DialogListItem =
  | { kind: "ts-defaults" }
  | { kind: "db-entry"; entry: VideoDataEntry; entryIndex: number }
  | {
      kind: "file-entry";
      fileRecord: FileRecord;
      /** Undefined while loading or on error; the entry for this selectable's key once loaded. */
      jsonEntry: JsonFileEntry | undefined;
      loadError: boolean;
    };

let _historyTarget: Showable | null = null;
let _preDialogSnapshotJson = "";
let _preDialogSource: LoadSource | undefined;
let _wasInitiallyDirty = false;
let _dialogItems: DialogListItem[] = [];
let _selectedDialogIndex = -1;
let _allHistoryEntries: VideoHistoryEntry[] = [];
/** File records from the `files` IndexedDB table, populated when the dialog opens. */
let _dialogFileRecords: FileRecord[] = [];
/** Async load state for each filename; populated after the dialog opens. */
const _dialogFileStates = new Map<string, FileEntryState>();

function _dialogSelectItem(index: number, target: Showable) {
  if (index < 0 || index >= _dialogItems.length) return;
  _selectedDialogIndex = index;

  for (let i = 0; i < historyList.children.length; i++) {
    historyList.children[i].classList.toggle("selected", i === index);
  }

  const item = _dialogItems[index];
  // Top item (index 0) and ts-defaults are never deletable.
  historyDeleteBtn.disabled = index === 0 || item.kind === "ts-defaults";

  // Preview the selected state
  if (item.kind === "ts-defaults") {
    applyTsDefaults(target);
  } else if (item.kind === "db-entry") {
    applyScopedToTarget(target, item.entry.tree);
  } else if (item.kind === "file-entry" && item.jsonEntry !== undefined) {
    applyJsonEntry(target, item.jsonEntry);
    // If still loading or has no entry for this key, leave the current preview.
  }
  selectedSlideChild = null;
  activeRootComponentEditor?.resetAll();
  updateComponentEditor(target);
  updateScheduleEditor(target);

  // The Abandon/Save buttons are no longer used; only Keep is shown.
  historyOkBtn.hidden = false;
  historyAbandonBtn.hidden = true;
  historySaveBtn.hidden = true;
}

/**
 * Rebuilds _dialogItems and the list DOM by merging DB entries, file records,
 * and the TypeScript-defaults entry (positioned by the Restore-Defaults sentinel),
 * then selects the item at selectIndex (clamped to list bounds).
 * Safe to call after deletion or async file loads.
 */
function _rebuildDialogList(target: Showable, selectIndex?: number): void {
  // Sentinel's savedAt determines where "TypeScript defaults" appears in the list.
  const sentinel = _dialogFileRecords.find((r) => r.handle === null);
  const tsDefaultsTimestamp = sentinel?.savedAt ?? -Infinity;

  type Stamped = { timestamp: number; item: DialogListItem };
  const stamped: Stamped[] = [];

  // File entries (real files, not the null sentinel).
  for (const fr of _dialogFileRecords) {
    if (fr.handle === null) continue;
    const state = _dialogFileStates.get(fr.filename);
    // Locate the selected chapter's node inside the file's whole-video tree, so the dialog
    // still previews only what the chapter selector has selected.
    const jsonEntry =
      state?.status === "loaded"
        ? findSerializedNode(toShow, state.tree, target)
        : undefined;
    const loadError = state?.status === "error";
    stamped.push({
      timestamp: fr.savedAt,
      item: { kind: "file-entry", fileRecord: fr, jsonEntry, loadError },
    });
  }

  // DB entries.
  for (let i = 0; i < _allHistoryEntries.length; i++) {
    const e = _allHistoryEntries[i];
    if (!isMarker(e)) {
      stamped.push({
        timestamp: e.timestamp,
        item: { kind: "db-entry", entry: e, entryIndex: i },
      });
    }
  }

  // TypeScript defaults — positioned by sentinel or pinned to the bottom.
  stamped.push({
    timestamp: tsDefaultsTimestamp,
    item: { kind: "ts-defaults" },
  });

  stamped.sort((a, b) => b.timestamp - a.timestamp);
  _dialogItems = stamped.map((s) => s.item);

  historyList.replaceChildren();
  for (let i = 0; i < _dialogItems.length; i++) {
    const item = _dialogItems[i];
    const li = document.createElement("li");
    li.style.cssText =
      "padding:0.35em 0.6em;cursor:pointer;border-bottom:1px solid #eee";

    if (item.kind === "ts-defaults") {
      li.textContent = "TypeScript defaults";
    } else if (item.kind === "db-entry") {
      li.textContent = new Date(item.entry.timestamp).toLocaleString();
    } else {
      const fr = item.fileRecord;
      const state = _dialogFileStates.get(fr.filename);
      const ts = new Date(fr.savedAt).toLocaleString();
      const isActive = jsonSync.filename === fr.filename;
      if (!state || state.status === "loading") {
        li.textContent = `📄 ${fr.filename}  …`;
        li.style.color = "gray";
      } else if (state.status === "error") {
        li.textContent = `📄 ${fr.filename}  (failed to read)`;
        li.style.color = "red";
      } else if (!item.jsonEntry) {
        li.textContent = `📄 ${fr.filename}  ${ts}  (not in file)`;
        li.style.color = "gray";
      } else {
        li.textContent = `📄 ${fr.filename}  ${ts}${isActive ? "  ✓" : ""}`;
      }
    }

    const idx = i;
    li.addEventListener("click", () => _dialogSelectItem(idx, target));
    li.addEventListener("mouseover", () => {
      li.style.background = "#f0f0f0";
    });
    li.addEventListener("mouseout", () => {
      li.style.background = "";
    });
    historyList.append(li);
  }

  historyList.tabIndex = 0;
  historyList.onkeydown = (e) => {
    if (
      e.key === "ArrowDown" &&
      _selectedDialogIndex < _dialogItems.length - 1
    ) {
      _dialogSelectItem(_selectedDialogIndex + 1, target);
    } else if (e.key === "ArrowUp" && _selectedDialogIndex > 0) {
      _dialogSelectItem(_selectedDialogIndex - 1, target);
    }
  };

  historyDialogHint.textContent = _wasInitiallyDirty
    ? "Changes saved to history — browse and preview previous states."
    : `Currently: ${formatLoadSource(_preDialogSource)}`;

  let initialIndex: number;
  if (selectIndex !== undefined) {
    initialIndex = Math.min(Math.max(0, selectIndex), _dialogItems.length - 1);
  } else if (_wasInitiallyDirty) {
    // We just saved the dirty state; it lands as the most recent DB entry.
    initialIndex = _dialogItems.findIndex((it) => it.kind === "db-entry");
    if (initialIndex < 0) initialIndex = 0;
  } else {
    const src = _preDialogSource;
    const found = _dialogItems.findIndex((it) => {
      if (src?.kind === "ts-defaults" && it.kind === "ts-defaults") return true;
      if (
        src?.kind === "db" &&
        it.kind === "db-entry" &&
        it.entry.timestamp === src.timestamp
      )
        return true;
      if (
        src?.kind === "json" &&
        it.kind === "file-entry" &&
        it.fileRecord.filename === src.filename
      )
        return true;
      return false;
    });
    initialIndex = found >= 0 ? found : 0;
  }
  _dialogSelectItem(initialIndex, target);
}

/** Async: fetch a file entry's content and refresh the list when done. */
async function _loadFileEntry(
  fileRecord: FileRecord,
  target: Showable,
): Promise<void> {
  const filename = fileRecord.filename;
  try {
    const handle = fileRecord.handle;
    if (!handle) throw new Error("no file handle");
    const perm = await handle.queryPermission({ mode: "read" });
    if (perm !== "granted") throw new Error("permission denied");
    const file = await handle.getFile();
    const content = await file.text();
    const tree = parseSnapshotFile(JSON.parse(content));
    if (!tree) throw new Error("no usable state in file");
    _dialogFileStates.set(filename, { status: "loaded", tree });
  } catch {
    if (jsonSync.filename !== filename) {
      // Stale handle for a non-active file — remove it silently from the DB and list.
      void deleteFileRecord(filename);
      _dialogFileRecords = _dialogFileRecords.filter(
        (r) => r.filename !== filename,
      );
      _dialogFileStates.delete(filename);
    } else {
      // Active file failed: keep the record but show it red.
      _dialogFileStates.set(filename, { status: "error" });
    }
  }
  if (!historyDialog.open || _historyTarget !== target) return;
  _rebuildDialogList(target, _selectedDialogIndex);
}

async function openHistoryDialog(target: Showable) {
  _historyTarget = target;
  _preDialogSnapshotJson = currentTreeJson();
  _preDialogSource = _loadSource;
  _wasInitiallyDirty = isVideoDirty();

  // Save dirty state immediately so it appears at the top of the history list.
  if (_wasInitiallyDirty) {
    await saveVideoState(true);
  }

  // Read DB history and file records simultaneously (both are fast local reads).
  const [record, fileRecords] = await Promise.all([
    readVideoHistory(),
    readAllFileRecords(toShowKey),
  ]);
  _allHistoryEntries = record?.entries ?? [];
  _dialogFileRecords = fileRecords;
  _dialogFileStates.clear();
  for (const fr of fileRecords) {
    if (fr.filename !== "" && fr.handle) {
      _dialogFileStates.set(fr.filename, { status: "loading" });
    }
  }

  _rebuildDialogList(target);
  historyDialog.showModal();
  historyList.focus();

  // Populate file entry contents asynchronously (grayed out until ready).
  for (const fr of fileRecords) {
    if (fr.filename !== "" && fr.handle) {
      void _loadFileEntry(fr, target);
    }
  }
}

/**
 * Apply the currently selected dialog item, save it to IndexedDB as the new
 * top-of-history entry, then update source tracking.
 */
async function _applyDialogSelection() {
  const target = _historyTarget;
  if (!target) return;
  const item = _dialogItems[_selectedDialogIndex];
  if (!item) return;

  // Re-apply the selected item (may already be previewed, but be explicit).
  if (item.kind === "ts-defaults") {
    applyTsDefaults(target);
  } else if (item.kind === "db-entry") {
    applyScopedToTarget(target, item.entry.tree);
  } else if (item.kind === "file-entry" && item.jsonEntry !== undefined) {
    applyJsonEntry(target, item.jsonEntry);
  }

  // Save the chosen state to IndexedDB so refreshes restore it.
  await saveVideoState(true);
  // saveVideoState already updates _loadSource → { kind: "db", timestamp }.

  selectedSlideChild = null;
  activeRootComponentEditor?.resetAll();
  updateComponentEditor(target);
  updateScheduleEditor(target);
}

historyOkBtn.addEventListener("click", () => {
  void _applyDialogSelection();
  historyDialog.close();
});
historyAbandonBtn.addEventListener("click", () => {
  // No longer shown; kept for safety.
  historyDialog.close();
});
historySaveBtn.addEventListener("click", () => {
  // No longer shown; kept for safety.
  historyDialog.close();
});
historyCancelBtn.addEventListener("click", () => {
  // Revert to the state before the dialog opened.  The snapshot covers the whole video, so
  // restore the whole video -- a preview may have been scoped to one chapter, but undoing it
  // against `target` alone would apply the root's state to that chapter.
  const target = _historyTarget;
  if (target) {
    applyTree(
      toShow,
      loadableTree(JSON.parse(_preDialogSnapshotJson) as SerializedFixedChild),
    );
    selectedSlideChild = null;
    activeRootComponentEditor?.resetAll();
    updateComponentEditor(target);
    updateScheduleEditor(target);
  }
  historyDialog.close();
});

historyDeleteBtn.addEventListener("click", async () => {
  const target = _historyTarget;
  if (!target) return;
  const item = _dialogItems[_selectedDialogIndex];
  if (!item || item.kind === "ts-defaults") return;

  if (item.kind === "db-entry") {
    sendToRecycleBin("deleted", item.entry);
    _allHistoryEntries.splice(item.entryIndex, 1);
    await writeVideoHistory(_allHistoryEntries);
  } else if (item.kind === "file-entry") {
    await deleteFileRecord(item.fileRecord.filename);
    _dialogFileRecords = _dialogFileRecords.filter(
      (r) => r.filename !== item.fileRecord.filename,
    );
    _dialogFileStates.delete(item.fileRecord.filename);
  }

  _rebuildDialogList(target, _selectedDialogIndex);
});

openHistoryDialogBtn.addEventListener("click", () => {
  const target = currentSaveTarget();
  if (target) void openHistoryDialog(target);
});

// Any edit in the schedule editor kicks the auto-save timer, and refreshes
// the panels at the top, which summarize the fields below them.  (Listening
// here rather than on each section survives a section being rebuilt.)
scheduleEditorFieldset.addEventListener("input", () => {
  markDirty();
  for (const cb of scheduleEditorRefreshers) cb();
});
scheduleEditorFieldset.addEventListener("change", () => {
  markDirty();
  for (const cb of scheduleEditorRefreshers) cb();
});

// MARK: Font info panel (TraditionalTextComponent)

/** Counter for unique <datalist> IDs within the schedule editor. */
let _datalistIdCounter = 0;
// MARK: Schedule section builder

function buildScheduleSection(
  info: ScheduleInfo,
  selectable: Showable,
): HTMLElement {
  const showableDescription = selectable.description;
  const section = document.createElement("fieldset");

  if (info.editDurations) {
    // Durations must be positive; clamp any bad values left over from serialization.
    const schedule = info.schedule as (typeof info.schedule)[number][];
    for (const kf of schedule) {
      if (kf.time <= 0) kf.time = 5000;
    }
  }

  function rebuild() {
    // If the editing/viewing rect kf was removed from the schedule, clear it.
    if (info.type === "rectangle") {
      const kfSet = new Set(info.schedule as RectKf[]);
      if (editingRectKf && !kfSet.has(editingRectKf)) editingRectKf = null;
      for (const kf of viewingRectKfs) {
        if (!kfSet.has(kf)) viewingRectKfs.delete(kf);
      }
    }
    if (info.type === "lattice") {
      const kfSet = new Set(info.schedule as LatticeKf[]);
      if (editingLatticeKf && !kfSet.has(editingLatticeKf))
        editingLatticeKf = null;
      for (const kf of viewingLatticeKfs) {
        if (!kfSet.has(kf)) viewingLatticeKfs.delete(kf);
      }
    }
    if (info.type === "point") {
      const kfSet = new Set(info.schedule as PointKf[]);
      if (editingPointKf && !kfSet.has(editingPointKf)) editingPointKf = null;
      for (const kf of viewingPointKfs) {
        if (!kfSet.has(kf)) viewingPointKfs.delete(kf);
      }
    }
    if (info.type === "arrow") {
      const kfSet = new Set(info.schedule as ArrowKf[]);
      if (editingArrowKf && !kfSet.has(editingArrowKf)) editingArrowKf = null;
      for (const kf of viewingArrowKfs) {
        if (!kfSet.has(kf)) viewingArrowKfs.delete(kf);
      }
    }
    activeRootComponentEditor?.resetAll();
    section.replaceWith(buildScheduleSection(info, selectable));
    // Panels care how many keyframes there are, e.g. whether the Text Frame
    // panel has one frame to edit.
    for (const cb of scheduleEditorRefreshers) cb();
  }

  function currentTimeMs() {
    return playPositionSeconds.valueAsNumber * 1000;
  }

  /** Time relative to the start of the selected scene — what keyframe.time values use. */
  function localTimeMs() {
    return currentTimeMs() - sectionStartTime;
  }

  function addKeyframeAtCurrentTime() {
    const t = localTimeMs();
    let value: unknown;
    if (info.type === "color") value = interpolateColors(t, info.schedule);
    else if (info.type === "number")
      value = interpolateNumbers(t, info.schedule);
    else if (info.type === "rectangle")
      value = interpolateRects(t, info.schedule);
    else if (info.type === "lattice")
      value = interpolateLattices(t, info.schedule);
    else if (info.type === "point") value = interpolatePoints(t, info.schedule);
    else if (info.type === "arrow")
      value =
        info.schedule.length > 0
          ? interpolateArrow(t, info.schedule as ArrowKf[])
          : { flat: { x: 2, y: 4.5 }, pointy: { x: 12, y: 4.5 } };
    else value = discreteKeyframes(t, info.schedule);
    const insertAt = info.schedule.findIndex((kf) => kf.time > t);
    const newKf = { time: t, value } as (typeof info.schedule)[number];
    if (insertAt === -1)
      (info.schedule as (typeof info.schedule)[number][]).push(newKf);
    else
      (info.schedule as (typeof info.schedule)[number][]).splice(
        insertAt,
        0,
        newKf,
      );
    rebuild();
  }

  const legend = document.createElement("legend");
  legend.textContent = info.description + " ";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "+ Add";
  const sortBtn = document.createElement("button");
  sortBtn.type = "button";
  sortBtn.textContent = "Sort";
  sortBtn.title = "Re-sort rows by time";

  if (info.editDurations) {
    addBtn.title = "Append item";
    addBtn.addEventListener("click", () => {
      const schedule = info.schedule as (typeof info.schedule)[number][];
      const lastKf = schedule[schedule.length - 1];
      const value: unknown = lastKf
        ? lastKf.value
        : info.type === "color"
          ? "#ffffff"
          : info.type === "number"
            ? 0
            : info.type === "rectangle"
              ? { x: 0, y: 0, width: 4, height: 3 }
              : info.type === "lattice"
                ? DEFAULT_LATTICE
                : info.type === "point"
                  ? { x: 0, y: 0 }
                  : info.type === "arrow"
                    ? { flat: { x: 2, y: 4.5 }, pointy: { x: 12, y: 4.5 } }
                    : "";
      schedule.push({ time: 5000, value } as (typeof info.schedule)[number]);
      rebuild();
    });
    sortBtn.hidden = true;
  } else {
    addBtn.title = "Add keyframe at current time";
    addBtn.addEventListener("click", addKeyframeAtCurrentTime);
    sortBtn.addEventListener("click", () => {
      (info.schedule as (typeof info.schedule)[number][]).sort(
        (a, b) => a.time - b.time,
      );
      rebuild();
    });
  }

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "🖥️ → 📋";
  copyBtn.title = "Copy schedule as TypeScript";
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(
      scheduleToTypeScript(info, showableDescription),
    );
  });

  const pasteErrorSpan = document.createElement("span");
  pasteErrorSpan.style.cssText = "color:red;font-size:0.85em;margin-left:0.3em";
  let pasteErrorTimer: ReturnType<typeof setTimeout> | undefined;
  function showPasteError(msg: string) {
    pasteErrorSpan.textContent = msg;
    clearTimeout(pasteErrorTimer);
    pasteErrorTimer = setTimeout(() => {
      pasteErrorSpan.textContent = "";
    }, 3000);
  }

  const pasteBtn = document.createElement("button");
  pasteBtn.type = "button";
  pasteBtn.textContent = "📋 → 🖥️";
  pasteBtn.title = "Paste schedule from clipboard";
  pasteBtn.addEventListener("click", async () => {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      showPasteError("Cannot read clipboard.");
      return;
    }
    const kfs = parseScheduleFromClipboard(text, info.type);
    if (!kfs) {
      showPasteError("Clipboard doesn't contain a compatible schedule.");
      return;
    }
    (info.schedule as unknown[]).length = 0;
    (info.schedule as unknown[]).push(...kfs);
    rebuild();
  });

  legend.append(
    addBtn,
    " ",
    sortBtn,
    " ",
    copyBtn,
    " ",
    pasteBtn,
    pasteErrorSpan,
  );
  section.append(legend);

  const table = document.createElement("table");
  const thead = table.createTHead();
  const headerRow = thead.insertRow();
  const valueHeaders =
    info.type === "point"
      ? ["x", "y", "Canvas"]
      : info.type === "arrow"
        ? ["x0", "y0", "x1", "y1", "Canvas"]
        : info.type === "rectangle"
          ? ["x", "y", "width", "height", "Canvas"]
          : info.type === "lattice"
            ? ["x", "y", "width", "height", "cell w", "cell h", "Canvas"]
            : ["Value"];
  for (const h of [
    info.timeAxisLabel ?? (info.editDurations ? "Duration (ms)" : "Time (ms)"),
    ...valueHeaders,
    "Ease ↓",
    "",
    ...(info.editDurations ? [] : ["Go To"]),
  ]) {
    const th = document.createElement("th");
    th.textContent = h;
    headerRow.append(th);
  }

  // Maps each keyframe object to its ease cell, so visibility updates
  // remain correct even when the internal array is sorted independently
  // of the UI row order.
  const easeCellForKf = new Map<
    (typeof info.schedule)[number],
    HTMLTableCellElement
  >();

  function updateEaseVisibility() {
    if (info.editDurations) {
      // In duration mode, ease is meaningful on every row including the last.
      easeCellForKf.forEach((cell) => {
        cell.style.visibility = "";
      });
      return;
    }
    const maxTime = Math.max(...info.schedule.map((kf) => kf.time));
    easeCellForKf.forEach((cell, kf) => {
      cell.style.visibility = kf.time >= maxTime ? "hidden" : "";
    });
  }

  const tbody = table.createTBody();
  for (let i = 0; i < info.schedule.length; i++) {
    const kf = info.schedule[i];
    const row = tbody.insertRow();

    if (info.editDurations) {
      const durationInput = buildNumericInput(kf.time, (n) => {
        if (n <= 0) {
          durationInput.setCustomValidity("Duration must be positive");
          durationInput.reportValidity();
          durationInput.valueAsNumber = kf.time;
          return;
        }
        durationInput.setCustomValidity("");
        kf.time = n;
      });
      durationInput.step = "any";
      durationInput.style.width = "6em";
      row.insertCell().append(durationInput);
    } else {
      // Time cell: editable input + "← now" button
      const timeInput = buildNumericInput(kf.time, (n) => {
        kf.time = n;
        // Keep the internal array sorted so interpolation always works correctly.
        // The UI rows stay in their current positions until Sort is clicked.
        (info.schedule as (typeof info.schedule)[number][]).sort(
          (a, b) => a.time - b.time,
        );
        updateEaseVisibility();
      });
      timeInput.step = "any";
      timeInput.style.width = "6em";
      const nowBtn = document.createElement("button");
      nowBtn.type = "button";
      nowBtn.textContent = "←";
      nowBtn.title = "Set to current time";
      nowBtn.addEventListener("click", () => {
        kf.time = localTimeMs();
        timeInput.valueAsNumber = kf.time;
        (info.schedule as (typeof info.schedule)[number][]).sort(
          (a, b) => a.time - b.time,
        );
        updateEaseVisibility();
      });
      row.insertCell().append(timeInput, "\u00a0", nowBtn);
    }

    if (info.type === "color") {
      const colorKf = kf as Keyframe<string>;
      const cell = row.insertCell();
      const swatchBtn = document.createElement("button");
      swatchBtn.type = "button";
      swatchBtn.title = colorKf.value;
      swatchBtn.style.cssText =
        "width:2.5em;height:1.8em;border:1px solid #999;cursor:pointer;border-radius:2px";
      setSwatchColor(swatchBtn, colorKf.value);
      swatchBtn.addEventListener("click", () =>
        openColorPickerDialog(colorKf, cell),
      );
      cell.addEventListener("input", () => {
        setSwatchColor(swatchBtn, colorKf.value);
        swatchBtn.title = colorKf.value;
      });
      cell.append(swatchBtn);
    } else if (info.type === "number") {
      const numKf = kf as Keyframe<number>;
      const input = buildNumericInput(numKf.value, (n) => {
        numKf.value = n;
      });
      numberSyncCallbacks.set(numKf, (n) => {
        input.valueAsNumber = n;
      });
      row.insertCell().append(input);
    } else if (info.type === "string") {
      const strKf = kf as Keyframe<string>;
      const cell = row.insertCell();
      if (info.useDialog) {
        // Font picker: read-only display + button that opens the dialog.
        const span = document.createElement("span");
        span.style.cssText =
          "display:inline-block;min-width:6em;padding:0.1em 0.3em;border:1px solid #ccc;border-radius:2px;background:#fff;font-size:0.9em";
        span.textContent = strKf.value;
        const chooseBtn = document.createElement("button");
        chooseBtn.type = "button";
        chooseBtn.textContent = "Choose…";
        chooseBtn.style.marginLeft = "0.4em";
        chooseBtn.addEventListener("click", () => {
          openFontPickerDialog(strKf, info.choices ?? [], cell);
        });
        // Refresh the display label whenever the dialog changes strKf.value.
        cell.addEventListener("input", () => {
          span.textContent = strKf.value;
        });
        cell.append(span, chooseBtn);
      } else if (info.choices?.length) {
        // Combo box: free-text <input> backed by a <datalist> of suggestions.
        // Fires "input" on every keystroke for instant canvas feedback.
        const listId = `dl-${_datalistIdCounter++}`;
        const input = addName(document.createElement("input"));
        input.type = "text";
        input.setAttribute("list", listId);
        input.value = strKf.value;
        input.style.cssText = "width:100%;box-sizing:border-box";
        input.addEventListener("input", () => {
          strKf.value = input.value;
        });
        const datalist = document.createElement("datalist");
        datalist.id = listId;
        for (const choice of info.choices) {
          const opt = document.createElement("option");
          opt.value = choice;
          datalist.append(opt);
        }
        cell.append(input, datalist);
      } else {
        const input = addName(document.createElement("textarea"));
        input.rows = 1;
        input.value = strKf.value;
        input.style.cssText =
          "width:100%;box-sizing:border-box;resize:vertical";
        input.addEventListener("input", () => {
          strKf.value = input.value;
        });
        cell.append(input);
      }
    } else if (info.type === "select") {
      const strKf = kf as Keyframe<string>;
      const cell = row.insertCell();
      const sel = addName(document.createElement("select"));
      for (const choice of info.choices) {
        const opt = document.createElement("option");
        opt.value = opt.textContent = choice;
        sel.append(opt);
      }
      sel.value = strKf.value;
      sel.addEventListener("change", () => {
        strKf.value = sel.value;
      });
      cell.append(sel);
    } else if (info.type === "point") {
      const ptKf = kf as PointKf;
      const fieldInputs: { x?: HTMLInputElement; y?: HTMLInputElement } = {};
      for (const coord of ["x", "y"] as const) {
        const input = buildNumericInput(ptKf.value[coord], (n) => {
          ptKf.value = { ...ptKf.value, [coord]: n };
        });
        fieldInputs[coord] = input;
        row.insertCell().append(input);
      }
      pointSyncCallbacks.set(ptKf, (pt) => {
        fieldInputs.x!.valueAsNumber = pt.x;
        fieldInputs.y!.valueAsNumber = pt.y;
      });

      const canvasCell = row.insertCell();
      const viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.textContent = "👁";
      viewBtn.title = "Show on canvas";
      if (viewingPointKfs.has(ptKf)) viewBtn.classList.add("active");
      viewBtn.addEventListener("click", () => {
        if (viewingPointKfs.has(ptKf)) {
          viewingPointKfs.delete(ptKf);
          viewBtn.classList.remove("active");
        } else {
          viewingPointKfs.add(ptKf);
          viewBtn.classList.add("active");
        }
      });

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "✎";
      editBtn.title = "Edit on canvas";
      editBtn.classList.add("edit-btn");
      if (editingPointKf === ptKf) editBtn.classList.add("active");
      editBtn.addEventListener("click", () => {
        const wasEditing = editingPointKf === ptKf;
        section
          .querySelectorAll<HTMLButtonElement>("button.edit-btn")
          .forEach((b) => b.classList.remove("active"));
        editingPointKf = wasEditing ? null : ptKf;
        if (editingPointKf) editBtn.classList.add("active");
      });

      canvasCell.append(viewBtn, "\u00a0", editBtn);
    } else if (info.type === "rectangle") {
      const rectKf = kf as RectKf;
      const fieldInputs: Partial<
        Record<"x" | "y" | "width" | "height", HTMLInputElement>
      > = {};
      for (const field of ["x", "y", "width", "height"] as const) {
        const input = buildNumericInput(rectKf.value[field], (n) => {
          rectKf.value = { ...rectKf.value, [field]: n };
        });
        fieldInputs[field] = input;
        row.insertCell().append(input);
      }
      markerSyncCallbacks.set(rectKf, (rect) => {
        for (const field of ["x", "y", "width", "height"] as const) {
          fieldInputs[field]!.valueAsNumber = rect[field];
        }
      });

      const canvasCell = row.insertCell();
      const viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.textContent = "👁";
      viewBtn.title = "Show on canvas";
      if (viewingRectKfs.has(rectKf)) viewBtn.classList.add("active");
      viewBtn.addEventListener("click", () => {
        if (viewingRectKfs.has(rectKf)) {
          viewingRectKfs.delete(rectKf);
          viewBtn.classList.remove("active");
        } else {
          viewingRectKfs.add(rectKf);
          viewBtn.classList.add("active");
        }
      });

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "✎";
      editBtn.title = "Edit on canvas";
      editBtn.classList.add("edit-btn");
      if (editingRectKf === rectKf) editBtn.classList.add("active");
      editBtn.addEventListener("click", () => {
        const wasEditing = editingRectKf === rectKf;
        section
          .querySelectorAll<HTMLButtonElement>("button.edit-btn")
          .forEach((b) => b.classList.remove("active"));
        editingRectKf = wasEditing ? null : rectKf;
        if (editingRectKf) editBtn.classList.add("active");
        // Which keyframe is in ✎ mode decides what some panel buttons act on.
        for (const cb of scheduleEditorRefreshers) cb();
      });

      canvasCell.append(viewBtn, "\u00a0", editBtn);
    } else if (info.type === "lattice") {
      const latKf = kf as LatticeKf;
      const fields = [
        "x",
        "y",
        "width",
        "height",
        "cellWidth",
        "cellHeight",
      ] as const;
      const fieldInputs: Partial<Record<(typeof fields)[number], HTMLInputElement>> =
        {};
      for (const field of fields) {
        const input = buildNumericInput(latKf.value[field], (n) => {
          latKf.value = { ...latKf.value, [field]: n };
        });
        fieldInputs[field] = input;
        row.insertCell().append(input);
      }
      latticeSyncCallbacks.set(latKf, (v) => {
        for (const field of fields) {
          fieldInputs[field]!.valueAsNumber = v[field];
        }
      });

      const canvasCell = row.insertCell();
      const viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.textContent = "\ud83d\udc41";
      viewBtn.title = "Show on canvas";
      if (viewingLatticeKfs.has(latKf)) viewBtn.classList.add("active");
      viewBtn.addEventListener("click", () => {
        if (viewingLatticeKfs.has(latKf)) {
          viewingLatticeKfs.delete(latKf);
          viewBtn.classList.remove("active");
        } else {
          viewingLatticeKfs.add(latKf);
          viewBtn.classList.add("active");
        }
      });

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "\u270e";
      editBtn.title = "Edit on canvas";
      editBtn.classList.add("edit-btn");
      if (editingLatticeKf === latKf) editBtn.classList.add("active");
      editBtn.addEventListener("click", () => {
        const wasEditing = editingLatticeKf === latKf;
        section
          .querySelectorAll<HTMLButtonElement>("button.edit-btn")
          .forEach((b) => b.classList.remove("active"));
        editingLatticeKf = wasEditing ? null : latKf;
        if (editingLatticeKf) editBtn.classList.add("active");
      });

      canvasCell.append(viewBtn, "\u00a0", editBtn);
    } else if (info.type === "arrow") {
      const arKf = kf as ArrowKf;
      const fieldInputs: Record<string, HTMLInputElement> = {};
      const makeInput = (get: () => number, setter: (n: number) => void) => {
        const input = buildNumericInput(get(), setter);
        return input;
      };
      fieldInputs["fx"] = makeInput(
        () => arKf.value.flat.x,
        (n) => {
          arKf.value = { ...arKf.value, flat: { ...arKf.value.flat, x: n } };
        },
      );
      fieldInputs["fy"] = makeInput(
        () => arKf.value.flat.y,
        (n) => {
          arKf.value = { ...arKf.value, flat: { ...arKf.value.flat, y: n } };
        },
      );
      fieldInputs["px"] = makeInput(
        () => arKf.value.pointy.x,
        (n) => {
          arKf.value = {
            ...arKf.value,
            pointy: { ...arKf.value.pointy, x: n },
          };
        },
      );
      fieldInputs["py"] = makeInput(
        () => arKf.value.pointy.y,
        (n) => {
          arKf.value = {
            ...arKf.value,
            pointy: { ...arKf.value.pointy, y: n },
          };
        },
      );
      row.insertCell().append(fieldInputs["fx"]!);
      row.insertCell().append(fieldInputs["fy"]!);
      row.insertCell().append(fieldInputs["px"]!);
      row.insertCell().append(fieldInputs["py"]!);
      arrowSyncCallbacks.set(arKf, (v) => {
        fieldInputs["fx"]!.valueAsNumber = v.flat.x;
        fieldInputs["fy"]!.valueAsNumber = v.flat.y;
        fieldInputs["px"]!.valueAsNumber = v.pointy.x;
        fieldInputs["py"]!.valueAsNumber = v.pointy.y;
      });

      const canvasCell = row.insertCell();
      const viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.textContent = "\ud83d\udc41";
      viewBtn.title = "Show on canvas";
      if (viewingArrowKfs.has(arKf)) viewBtn.classList.add("active");
      viewBtn.addEventListener("click", () => {
        if (viewingArrowKfs.has(arKf)) {
          viewingArrowKfs.delete(arKf);
          viewBtn.classList.remove("active");
        } else {
          viewingArrowKfs.add(arKf);
          viewBtn.classList.add("active");
        }
      });
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "\u270e";
      editBtn.title = "Edit on canvas";
      editBtn.classList.add("edit-btn");
      if (editingArrowKf === arKf) editBtn.classList.add("active");
      editBtn.addEventListener("click", () => {
        const wasEditing = editingArrowKf === arKf;
        section
          .querySelectorAll<HTMLButtonElement>("button.edit-btn")
          .forEach((b) => b.classList.remove("active"));
        editingArrowKf = wasEditing ? null : arKf;
        if (editingArrowKf) editBtn.classList.add("active");
      });
      canvasCell.append(viewBtn, "\u00a0", editBtn);
    }

    const easeCell = row.insertCell();
    easeCell.append(buildEaseSelect(kf));
    easeCellForKf.set(kf, easeCell);

    // Delete button — disabled when this is the only keyframe
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "🗑";
    deleteBtn.title = "Delete this keyframe";
    deleteBtn.disabled = info.schedule.length <= 1;
    deleteBtn.addEventListener("click", () => {
      (info.schedule as (typeof info.schedule)[number][]).splice(i, 1);
      rebuild();
    });

    const actionCell = row.insertCell();
    if (info.editDurations) {
      function moveKf(fromIdx: number, toIdx: number) {
        const schedule = info.schedule as (typeof info.schedule)[number][];
        const [item] = schedule.splice(fromIdx, 1);
        schedule.splice(toIdx, 0, item);
        rebuild();
      }
      const topBtn = document.createElement("button");
      topBtn.type = "button";
      topBtn.textContent = "⤒";
      topBtn.title = "Move to top";
      topBtn.disabled = i === 0;
      topBtn.addEventListener("click", () => moveKf(i, 0));

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.textContent = "↑";
      upBtn.title = "Move up";
      upBtn.disabled = i === 0;
      upBtn.addEventListener("click", () => moveKf(i, i - 1));

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.textContent = "↓";
      downBtn.title = "Move down";
      downBtn.disabled = i === info.schedule.length - 1;
      downBtn.addEventListener("click", () => moveKf(i, i + 1));

      const bottomBtn = document.createElement("button");
      bottomBtn.type = "button";
      bottomBtn.textContent = "⤓";
      bottomBtn.title = "Move to bottom";
      bottomBtn.disabled = i === info.schedule.length - 1;
      bottomBtn.addEventListener("click", () =>
        moveKf(i, info.schedule.length - 1),
      );

      actionCell.append(topBtn, upBtn, downBtn, bottomBtn, deleteBtn);
    } else {
      actionCell.append(deleteBtn);

      // "Go To" button — jumps to this keyframe's time, updated every frame.
      const goToBtn = document.createElement("button");
      goToBtn.type = "button";
      const updateGoTo = () => {
        const delta = kf.time - localTimeMs();
        const rounded = Math.round(delta);
        if (delta === 0) {
          goToBtn.textContent = "0";
          goToBtn.disabled = true;
        } else if (rounded === 0) {
          goToBtn.textContent = delta > 0 ? "+0" : "-0";
          goToBtn.disabled = false;
        } else {
          goToBtn.textContent = rounded > 0 ? `+${rounded}` : `${rounded}`;
          goToBtn.disabled = false;
        }
      };
      updateGoTo();
      goToButtonUpdaters.push(updateGoTo);
      goToBtn.addEventListener("click", () => {
        const globalMs = Math.max(
          sectionStartTime,
          Math.min(sectionEndTime, kf.time + sectionStartTime),
        );
        stopAudio();
        loadPlayPositionSeconds(globalMs);
        loadPlayPositionRange();
      });
      const goToCell = row.insertCell();
      goToCell.style.textAlign = "right";
      goToCell.append(goToBtn);
    }
  }
  updateEaseVisibility();

  table.append(tbody);
  section.append(table);
  section.addEventListener("input", () => {
    activeRootComponentEditor?.update(selectable, info);
  });
  return section;
}

async function pasteInto(target: Showable, selectable: Showable) {
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    alert("Could not read clipboard.");
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    alert("Clipboard does not contain valid JSON.");
    return;
  }
  const arr: SerializedChild[] = Array.isArray(parsed)
    ? (parsed as SerializedChild[])
    : [parsed as SerializedChild];
  const built = buildComponents(arr);
  if (built.length === 0) {
    alert("Nothing recognized in clipboard (unknown registryKey?).");
    return;
  }
  target.replaceableComponents!.push(...built);
  selectedSlideChild = built[built.length - 1];
  activeRootComponentEditor?.resetAll();
  updateComponentEditor(selectable);
  updateScheduleEditor(selectedSlideChild);
}

function updateComponentEditor(selectable: Showable) {
  setVeRoot(selectable);
  durationSyncCallbacks.length = 0;
  const rootReplaceable = selectable.replaceableComponents;
  const hasAnyChildren = (selectable.children?.length ?? 0) > 0;
  const shouldHide =
    rootReplaceable === undefined &&
    !hasAnyChildren &&
    !activeRootComponentEditorElement;
  if (shouldHide) {
    componentsEditorFieldset.replaceChildren();
    componentsEditorFieldset.hidden = true;
    return;
  }
  componentsEditorFieldset.hidden = false;

  // Preserve scroll position so clicking a component doesn't jump to the top.
  // If the list was scrolled to the bottom, stick to the bottom even if content
  // height changes slightly (e.g. because one item gains/loses bold text).
  const oldList = componentsEditorFieldset.querySelector(
    ".components-list",
  ) as HTMLElement | null;
  const savedScrollTop = oldList?.scrollTop ?? 0;
  const wasAtBottom = oldList
    ? oldList.scrollTop + oldList.clientHeight >= oldList.scrollHeight - 2
    : false;

  componentsEditorFieldset.replaceChildren();

  const list = document.createElement("div");
  list.className = "components-list";
  list.style.cssText = "display:flex;flex-direction:column;gap:0.25em";

  if (activeRootComponentEditorElement) {
    list.append(activeRootComponentEditorElement);
  }

  /** Build a duration input for `child` and register a sync callback. */
  function makeDurationInput(child: Showable): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.title = "Duration (ms)";
    input.style.cssText = "width:5.5em";
    input.value = String(child.duration);
    input.addEventListener("change", () => {
      child.setDuration!(input.valueAsNumber);
      input.value = String(child.duration);
    });
    durationSyncCallbacks.push(() => {
      if (document.activeElement !== input) {
        input.value = String(child.duration);
      }
    });
    return input;
  }

  function renderComponentTree(container: Showable, depth: number) {
    const replaceables = container.replaceableComponents;
    const replList = replaceables?.get() ?? [];

    for (const { child, replaceable } of container.children ?? []) {
      const idx = replaceable ? replList.indexOf(child) : -1;
      const row = document.createElement("div");
      row.style.cssText = `display:flex;align-items:center;gap:0.4em;padding-left:${depth * 1.2}em`;

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent =
        "✎ " + (child.userEditableDescription ?? child.description);
      editBtn.style.cssText = "flex:1;text-align:left";
      if (child === selectedSlideChild) editBtn.style.fontWeight = "bold";
      editBtn.addEventListener("click", () => {
        selectedSlideChild = child;
        updateComponentEditor(selectable);
        updateScheduleEditor(child);
        activeRootComponentEditor?.selectionChanged(child);
        timelineDisplay.setSelectedId(child);
      });

      row.append(editBtn);

      if (child.setDuration !== undefined) {
        row.append(makeDurationInput(child));
      }

      if (replaceable && replaceables) {
        const moveChild = (fromIdx: number, toIdx: number) => {
          const arr = replaceables.get();
          const [item] = arr.splice(fromIdx, 1);
          arr.splice(toIdx, 0, item);
          replaceables.replace(arr);
          activeRootComponentEditor?.resetAll();
          updateComponentEditor(selectable);
        };

        const topBtn = document.createElement("button");
        topBtn.type = "button";
        topBtn.textContent = "⤒";
        topBtn.title = "Move to top";
        topBtn.disabled = idx === 0;
        topBtn.addEventListener("click", () => moveChild(idx, 0));

        const upBtn = document.createElement("button");
        upBtn.type = "button";
        upBtn.textContent = "↑";
        upBtn.title = "Move up";
        upBtn.disabled = idx === 0;
        upBtn.addEventListener("click", () => moveChild(idx, idx - 1));

        const downBtn = document.createElement("button");
        downBtn.type = "button";
        downBtn.textContent = "↓";
        downBtn.title = "Move down";
        downBtn.disabled = idx === replList.length - 1;
        downBtn.addEventListener("click", () => moveChild(idx, idx + 1));

        const bottomBtn = document.createElement("button");
        bottomBtn.type = "button";
        bottomBtn.textContent = "⤓";
        bottomBtn.title = "Move to bottom";
        bottomBtn.disabled = idx === replList.length - 1;
        bottomBtn.addEventListener("click", () =>
          moveChild(idx, replList.length - 1),
        );

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.textContent = "🗑";
        deleteBtn.addEventListener("click", () => {
          const arr = replaceables.get();
          const i = arr.indexOf(child);
          if (i !== -1) arr.splice(i, 1);
          replaceables.replace(arr);
          if (selectedSlideChild === child) {
            selectedSlideChild = null;
            updateScheduleEditor(selectable);
          }
          activeRootComponentEditor?.resetAll();
          updateComponentEditor(selectable);
        });

        row.append(topBtn, upBtn, downBtn, bottomBtn, deleteBtn);
      }

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.textContent = "🖥️ → 📋";
      copyBtn.title = "Copy component";
      copyBtn.addEventListener("click", () => {
        const json = JSON.stringify(
          omitComponentDefaults(serializeComponents([child])),
          null,
          2,
        );
        navigator.clipboard
          .writeText(json)
          .catch(() => alert("Could not write to clipboard."));
      });
      row.append(copyBtn);

      if (child.replaceableComponents !== undefined) {
        const pasteIntoBtn = document.createElement("button");
        pasteIntoBtn.type = "button";
        pasteIntoBtn.textContent = "📋 → 🖥️";
        pasteIntoBtn.title = `Paste into "${child.description}"`;
        pasteIntoBtn.addEventListener("click", () =>
          pasteInto(child, selectable),
        );
        row.append(pasteIntoBtn);
      }

      list.append(row);

      if ((child.children?.length ?? 0) > 0) {
        renderComponentTree(child, depth + 1);
      }
    }
  }

  // Root row — the top-level Showable itself, shown above its children.
  const rootRow = document.createElement("div");
  rootRow.style.cssText = "display:flex;align-items:center;gap:0.4em";

  const rootEditBtn = document.createElement("button");
  rootEditBtn.type = "button";
  rootEditBtn.textContent =
    "✎ " + (selectable.userEditableDescription ?? selectable.description);
  rootEditBtn.style.cssText = "flex:1;text-align:left";
  if (selectedSlideChild === null) rootEditBtn.style.fontWeight = "bold";
  rootEditBtn.addEventListener("click", () => {
    selectedSlideChild = null;
    updateComponentEditor(selectable);
    updateScheduleEditor(selectable);
    activeRootComponentEditor?.selectionChanged(selectable);
  });

  const rootCopyBtn = document.createElement("button");
  rootCopyBtn.type = "button";
  rootCopyBtn.textContent = "🖥️ → 📋";
  rootCopyBtn.title = "Copy all components as JSON";
  rootCopyBtn.addEventListener("click", () => {
    const json = JSON.stringify(
      omitComponentDefaults(serializeComponents(rootReplaceable!.get())),
      null,
      2,
    );
    navigator.clipboard
      .writeText(json)
      .catch(() => alert("Could not write to clipboard."));
  });

  const rootPasteBtn = document.createElement("button");
  rootPasteBtn.type = "button";
  rootPasteBtn.textContent = "📋 → 🖥️";
  rootPasteBtn.title = `Paste into "${selectable.description}"`;
  rootPasteBtn.addEventListener("click", () =>
    pasteInto(selectable as Showable, selectable),
  );

  rootRow.append(rootEditBtn);
  if (selectable.setDuration !== undefined) {
    rootRow.append(makeDurationInput(selectable));
  }
  if (rootReplaceable !== undefined) rootRow.append(rootCopyBtn, rootPasteBtn);
  list.append(rootRow);

  renderComponentTree(selectable as Showable, 0);
  componentsEditorFieldset.append(list);

  // Toolbar: "Insert New Child" and "Wrap Component".
  // addTarget: where a new child goes (null = Insert disabled).
  const addTarget: Showable | null =
    selectedSlideChild === null
      ? rootReplaceable !== undefined
        ? (selectable as Showable)
        : null
      : selectedSlideChild.replaceableComponents !== undefined
        ? selectedSlideChild
        : null;
  const displayName = (s: Showable) => s.userEditableDescription ?? s.description;

  const toolbar = document.createElement("div");
  toolbar.className = "components-toolbar";
  toolbar.style.cssText =
    "display:flex;align-items:center;gap:0.4em;flex-wrap:wrap";

  /** Make `newSelection` the selected component and rebuild both editors. */
  const afterStructureEdit = (newSelection: Showable) => {
    selectedSlideChild = newSelection;
    activeRootComponentEditor?.resetAll();
    updateComponentEditor(selectable);
    updateScheduleEditor(newSelection);
  };

  const insertBtn = document.createElement("button");
  insertBtn.type = "button";
  insertBtn.textContent = "Insert New Child";
  insertBtn.disabled = addTarget === null;
  insertBtn.title =
    addTarget !== null
      ? `Add a new component inside "${displayName(addTarget)}".`
      : "The selected component can't hold children added in the Visual Editor.";
  insertBtn.addEventListener("click", async () => {
    if (!addTarget) return;
    const key = await pickComponent({
      title: "Insert New Child",
      subtitle: `Inside "${displayName(addTarget)}"`,
      purpose: "insert",
      choices: componentChoices(addTarget, "insert"),
    });
    const entry = key === undefined ? undefined : componentRegistry.get(key);
    if (!entry) return;
    const newChild = entry.create();
    addTarget.replaceableComponents!.push(newChild);
    afterStructureEdit(newChild);
  });

  // Wrap: the selected component must be a replaceable child of some parent -- which also
  // rules out the root -- and must not be a type that has to stay directly under its current
  // parent (a transition, or a Text Format).
  const wrapChild = selectedSlideChild;
  const wrapParent = wrapChild
    ? findReplaceableParent(selectable as Showable, wrapChild)
    : undefined;
  const wrapChildEntry =
    wrapChild?.registryKey === undefined
      ? undefined
      : componentRegistry.get(wrapChild.registryKey);
  const wrapBtn = document.createElement("button");
  wrapBtn.type = "button";
  wrapBtn.textContent = "Wrap Component";
  if (!wrapChild) {
    wrapBtn.disabled = true;
    wrapBtn.title = "Select a component in the list to wrap it.";
  } else if (!wrapParent) {
    wrapBtn.disabled = true;
    wrapBtn.title = `"${displayName(wrapChild)}" is built in TypeScript, so the Visual Editor can't move it into a wrapper.`;
  } else if (wrapChildEntry?.hiddenByDefault) {
    wrapBtn.disabled = true;
    wrapBtn.title = `A ${wrapChild.registryKey} only works directly inside its current parent, so it can't be wrapped.`;
  } else {
    wrapBtn.title = `Put "${displayName(wrapChild)}" inside a new component, in its current place.`;
  }
  wrapBtn.addEventListener("click", async () => {
    if (!wrapChild || !wrapParent) return;
    const key = await pickComponent({
      title: "Wrap Component",
      subtitle: `Around "${displayName(wrapChild)}"`,
      purpose: "wrap",
      choices: componentChoices(wrapParent, "wrap"),
    });
    const entry = key === undefined ? undefined : componentRegistry.get(key);
    if (!entry) return;
    const wrapper = entry.create();
    if (!wrapper.replaceableComponents) {
      console.error(
        `"${key}" is marked isGoodForWrapping but can't hold replaceable children.`,
      );
      return;
    }
    // Swap the wrapper into the child's slot first: replace() requires every item to be a
    // current child or parentless, and this releases the child so the wrapper can adopt it.
    const siblings = wrapParent.replaceableComponents!.get();
    siblings[siblings.indexOf(wrapChild)] = wrapper;
    wrapParent.replaceableComponents!.replace(siblings);
    wrapper.replaceableComponents.push(wrapChild);
    afterStructureEdit(wrapper);
  });

  toolbar.append(insertBtn, wrapBtn);
  componentsEditorFieldset.append(toolbar);
  // Restore scroll now that both list and toolbar are in the DOM, so
  // list.clientHeight reflects its final height and browser clamping is correct.
  list.scrollTop = wasAtBottom ? list.scrollHeight : savedScrollTop;
}

/**
 * The Sound Clips section of the schedule editor, for a component whose
 * `soundClips` is defined.  One card per clip, plus Add and Paste.
 *
 * Each card's Owner menu moves the clip to another component without changing
 * when it plays.  Registers per-field sync callbacks into
 * {@link soundClipSyncCallbacks}, so drags on the timeline show up here.
 */
function buildSoundClipSection(selectable: Showable): HTMLElement {
  const clips = selectable.soundClips!;

  /** The clip list changed shape:  save, rebuild the audio, redraw this section and the timeline. */
  function afterStructureChange(): void {
    markDirty();
    clearTimeout(_durationAudioTimer);
    _durationAudioTimer = setTimeout(() => void initAudio(), 300);
    updateScheduleEditor(selectable);
    if (_veRootSelectable) _updateTimeline(_veRootSelectable);
  }

  /** Every place a sound can live in this video, and when each starts. */
  const owners = soundOwners(toShow);
  const self = owners.find(({ owner }) => owner === selectable);
  /** When this component starts, in video time.  0 if it can't be found, which shouldn't happen. */
  const selfStartMs = self?.startMs ?? 0;

  const section = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = `Sound Clips (${clips.length})`;
  section.append(legend);

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;gap:0.4em;margin-bottom:0.3em;font-size:0.85em;color:#555";
  header.textContent = "Times are in ms, measured from the start of this component.";
  const playheadInOwner = () =>
    tidyMs(playPositionSeconds.valueAsNumber * 1000 - selfStartMs);
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "+ Add";
  addBtn.title = "Add an empty sound clip at the playhead.  Then fill in its source.";
  addBtn.style.marginLeft = "auto";
  addBtn.addEventListener("click", () => {
    const clip: SoundClip = { source: "", startMsIntoScene: playheadInOwner() };
    clips.push(clip);
    selectedSoundClip = clip;
    afterStructureChange();
  });
  const pasteBtn = document.createElement("button");
  pasteBtn.type = "button";
  pasteBtn.textContent = "📋 Paste";
  pasteBtn.title =
    "Add the sound clips on the clipboard:  Sound Explorer's Copy One or Copy All, or JSON.  " +
    "Their times are used exactly as copied.";
  pasteBtn.addEventListener("click", async () => {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      alert("Could not read the clipboard.");
      return;
    }
    const pasted = parseSoundClips(text);
    if (pasted.length === 0) {
      alert("No sound clips found on the clipboard.  Each one needs at least a source.");
      return;
    }
    clips.push(...pasted);
    selectedSoundClip = pasted[0];
    afterStructureChange();
  });
  header.append(addBtn, pasteBtn);
  section.append(header);

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]!;
    const card = document.createElement("div");
    const drawHighlight = () => {
      const selected = clip === selectedSoundClip;
      card.style.cssText =
        "background:#f0f8f0;border:1px solid #aaccaa;border-radius:3px;padding:0.2em 0.3em;margin-bottom:0.25em" +
        (selected ? ";outline:2px solid #1e6b1e;outline-offset:-1px" : "");
    };
    drawHighlight();
    // Working in a card selects that clip, in the list and on the timeline.
    card.addEventListener("focusin", () => {
      if (selectedSoundClip === clip) return;
      selectedSoundClip = clip;
      for (const cb of soundClipSyncCallbacks) cb();
      timelineDisplay.setSelectedSoundId(clip);
    });
    soundClipSyncCallbacks.push(drawHighlight);

    // Row 1: notes + reorder + delete
    const row1 = document.createElement("div");
    row1.style.cssText = "display:flex;gap:0.25em;align-items:center";

    const notesInput = document.createElement("input");
    notesInput.type = "text";
    notesInput.placeholder = "Notes";
    notesInput.style.cssText = "flex:1;min-width:0";
    notesInput.value = clip.notes ?? "";
    notesInput.addEventListener("input", () => {
      clip.notes = notesInput.value || undefined;
      _onClipValueChanged();
    });

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = "↑";
    upBtn.title = "Move up";
    upBtn.disabled = i === 0;
    upBtn.addEventListener("click", () => {
      [clips[i - 1], clips[i]] = [clips[i]!, clips[i - 1]!];
      afterStructureChange();
    });

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = "↓";
    downBtn.title = "Move down";
    downBtn.disabled = i === clips.length - 1;
    downBtn.addEventListener("click", () => {
      [clips[i + 1], clips[i]] = [clips[i]!, clips[i + 1]!];
      afterStructureChange();
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "✕";
    delBtn.title = "Delete clip";
    delBtn.addEventListener("click", () => {
      clips.splice(i, 1);
      if (selectedSoundClip === clip) selectedSoundClip = undefined;
      afterStructureChange();
    });

    row1.append(notesInput, upBtn, downBtn, delBtn);

    // Row 2: source URL
    const row2 = document.createElement("div");
    row2.style.cssText =
      "display:flex;gap:0.25em;align-items:center;margin-top:0.2em";
    const srcLabel = document.createElement("span");
    srcLabel.textContent = "src:";
    srcLabel.style.cssText = "flex-shrink:0;font-size:0.85em;color:#555";
    const sourceInput = document.createElement("input");
    sourceInput.type = "text";
    sourceInput.placeholder = "URL / path";
    sourceInput.style.cssText = "flex:1;min-width:0;font-size:0.85em";
    sourceInput.value = clip.source;
    sourceInput.addEventListener("input", () => {
      clip.source = sourceInput.value;
      _onClipValueChanged();
    });
    row2.append(srcLabel, sourceInput);

    // Row 3: numeric time fields
    const row3 = document.createElement("div");
    row3.style.cssText =
      "display:flex;gap:0.4em;align-items:center;margin-top:0.2em;flex-wrap:wrap;font-size:0.85em";

    function makeTimeInput(
      labelText: string,
      title: string,
      getValue: () => number | undefined,
      setValue: (v: number | undefined) => void,
      allowNegative: boolean,
    ): HTMLElement {
      const lbl = document.createElement("label");
      lbl.style.cssText =
        "display:flex;align-items:center;gap:0.2em;white-space:nowrap";
      lbl.textContent = labelText;
      lbl.title = title;
      const inp = document.createElement("input");
      inp.type = "number";
      if (!allowNegative) inp.min = "0";
      inp.step = "1";
      inp.style.cssText = "width:6em";
      const v = getValue();
      inp.value = v !== undefined ? String(v) : "";
      inp.placeholder = "ms";
      inp.addEventListener("input", () => {
        const parsed = inp.valueAsNumber;
        setValue(
          isNaN(parsed)
            ? undefined
            : allowNegative
              ? parsed
              : Math.max(0, parsed),
        );
        _onClipValueChanged();
      });
      soundClipSyncCallbacks.push(() => {
        if (document.activeElement !== inp) {
          const cur = getValue();
          inp.value = cur !== undefined ? String(cur) : "";
        }
      });
      lbl.append(inp);
      return lbl;
    }

    row3.append(
      makeTimeInput(
        "start:",
        "When the sound starts, in ms after this component starts.  " +
          "Negative is fine:  it starts that much before this component does.",
        () => clip.startMsIntoScene,
        (v) => {
          clip.startMsIntoScene = v ?? 0;
        },
        true,
      ),
      makeTimeInput(
        "from file:",
        "Where in the sound file to start, in ms.  Empty means 0, the beginning.",
        () => clip.startMsIntoClip,
        (v) => {
          clip.startMsIntoClip = v;
        },
        false,
      ),
      makeTimeInput(
        "length:",
        "How much of the file to play, in ms.  Empty means to the end of the file.",
        () => clip.lengthMs,
        (v) => {
          clip.lengthMs = v;
        },
        false,
      ),
    );

    // Row 4: owner (rehoming) and when it plays
    const row4 = document.createElement("div");
    row4.style.cssText =
      "display:flex;gap:0.4em;align-items:center;margin-top:0.2em;flex-wrap:wrap;font-size:0.85em";
    const ownerLabel = document.createElement("label");
    ownerLabel.style.cssText = "display:flex;align-items:center;gap:0.2em;min-width:0;flex:1";
    ownerLabel.textContent = "owner:";
    ownerLabel.title =
      "Which component this sound belongs to.  It moves when its owner moves.  " +
      "Choosing another owner keeps the sound playing at exactly the same time.  " +
      "▶ marks the owners playing when this sound starts.";
    const ownerSelect = document.createElement("select");
    ownerSelect.style.cssText = "min-width:0;flex:1";
    const clipStartInVideo = () => selfStartMs + clip.startMsIntoScene;
    owners.forEach(({ owner, startMs, path }, index) => {
      const option = document.createElement("option");
      const t = clipStartInVideo();
      const playing = startMs <= t && t < startMs + owner.duration;
      option.value = String(index);
      option.textContent = `${playing ? "▶ " : "\u2003"}${path}`;
      option.selected = owner === selectable;
      ownerSelect.append(option);
    });
    ownerSelect.addEventListener("change", () => {
      const to = owners[Number(ownerSelect.value)];
      if (!self || !to) return;
      rehomeSoundClip(clip, self, to);
      selectedSoundClip = clip;
      markDirty();
      clearTimeout(_durationAudioTimer);
      _durationAudioTimer = setTimeout(() => void initAudio(), 300);
      const chapter = chapterList[select.selectedIndex]?.selectable;
      if (chapter && startWithin(chapter, to.owner) !== undefined) {
        // Follow the clip to its new owner.
        selectInChapter(to.owner);
      } else {
        // The new owner is in another chapter.  Stay here; the clip is gone from this list.
        updateScheduleEditor(selectable);
      }
      if (_veRootSelectable) _updateTimeline(_veRootSelectable);
    });
    ownerLabel.append(ownerSelect);
    const playsAt = document.createElement("span");
    playsAt.style.cssText = "white-space:nowrap;color:#555";
    playsAt.title = "When this sound plays, in video time.";
    const drawPlaysAt = () => {
      const from = clipStartInVideo();
      const length = soundClipLengthMs(clip);
      playsAt.textContent =
        length === undefined
          ? `plays from ${(from / 1000).toFixed(3)} s`
          : `plays ${(from / 1000).toFixed(3)}–${((from + length) / 1000).toFixed(3)} s`;
    };
    drawPlaysAt();
    soundClipSyncCallbacks.push(drawPlaysAt);
    row4.append(ownerLabel, playsAt);

    card.append(row1, row2, row3, row4);
    section.append(card);
    if (clip === selectedSoundClip) {
      requestAnimationFrame(() => card.scrollIntoView({ block: "nearest" }));
    }
  }

  return section;
}

/** Builds the "Name" fieldset for {@link Showable.userEditableDescription}. */
function buildNameSection(selectable: Showable): HTMLElement {
  const section = document.createElement("fieldset");
  section.style.cssText = "margin-bottom:0.4em";
  const legend = document.createElement("legend");
  legend.textContent = "Name";
  section.append(legend);

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:0.4em;align-items:center";

  const input = document.createElement("input");
  input.type = "text";
  input.style.cssText = "flex:1;min-width:0";
  input.placeholder = selectable.description;
  input.value = selectable.userEditableDescription ?? "";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.textContent = "Reset";
  resetBtn.disabled = selectable.userEditableDescription === undefined;

  function syncName(value: string) {
    selectable.userEditableDescription = value === "" ? undefined : value;
    resetBtn.disabled = selectable.userEditableDescription === undefined;
    const root = currentSaveTarget();
    if (root) updateComponentEditor(root);
  }

  input.addEventListener("input", () => syncName(input.value));

  resetBtn.addEventListener("click", () => {
    input.value = "";
    syncName("");
  });

  row.append(input, resetBtn);
  section.append(row);
  return section;
}

function updateScheduleEditor(selectable: Showable) {
  scheduleEditorFieldset.replaceChildren();
  editingRectKf = null;
  viewingRectKfs.clear();
  markerSyncCallbacks.clear();
  editingLatticeKf = null;
  viewingLatticeKfs.clear();
  latticeSyncCallbacks.clear();
  editingPointKf = null;
  viewingPointKfs.clear();
  pointSyncCallbacks.clear();
  numberSyncCallbacks.clear();
  draggingPoint = null;
  editingArrowKf = null;
  viewingArrowKfs.clear();
  arrowSyncCallbacks.clear();
  draggingArrow = null;
  draggingArrowMouseLocal = null;
  draggingArrowConstraint = "none";
  goToButtonUpdaters.length = 0;
  scheduleEditorRefreshers.length = 0;
  soundClipSyncCallbacks.length = 0;
  rectAspectLock = null;
  // A highlighted sound clip stays highlighted only while its owner is selected.
  if (selectedSoundClip && !selectable.soundClips?.includes(selectedSoundClip)) {
    selectedSoundClip = undefined;
  }
  timelineDisplay.setSelectedSoundId(selectedSoundClip);
  // History is always saved/loaded at the slide level, even when the schedule
  // editor is open on an individual child component.
  const saveTarget = currentSaveTarget();
  scheduleHistoryControls.hidden = !saveTarget;
  const scalars = selectable.scalars;
  const schedules = selectable.schedules;
  const isTraditionalText = selectable instanceof TraditionalTextComponent;
  const slideComponent =
    selectable instanceof SlideComponent ? selectable : null;
  const videoClip =
    selectable instanceof VideoClipComponent ? selectable : null;
  const multiText =
    selectable instanceof MultiTextComponent ? selectable : null;

  if (
    !scalars?.length &&
    !schedules?.length &&
    !isTraditionalText &&
    !slideComponent &&
    selectable.soundClips === undefined
  ) {
    scheduleEditorFieldset.hidden = true;
    return;
  }
  scheduleEditorFieldset.hidden = false;
  scheduleEditorFieldset.append(buildNameSection(selectable));

  let customPanel: HTMLElement | null = null;
  if (isTraditionalText) {
    customPanel = buildTraditionalTextPanel(selectable);
    scheduleEditorFieldset.append(customPanel);
  } else if (slideComponent) {
    customPanel = buildSlideComponentPanel(slideComponent);
    scheduleEditorFieldset.append(customPanel);
  }

  const videoPanel = videoClip
    ? buildVideoClipPanel(videoClip, {
        scalarsChanged() {
          activeRootComponentEditor?.update(
            videoClip,
            videoClip.startMsIntoClipScalar,
          );
          activeRootComponentEditor?.update(
            videoClip,
            videoClip.endMsIntoClipScalar,
          );
          markDirty();
          // Rebuild so the Start / End fields show their new values.
          updateScheduleEditor(videoClip);
        },
        rectKeyframeChanged(kf) {
          // The same sync a drag on the canvas uses, so ✎ edit mode survives.
          markerSyncCallbacks.get(kf)?.(kf.value);
          activeRootComponentEditor?.update(
            videoClip,
            videoClip.destinationRectSchedule,
          );
          markDirty();
        },
        editingRectKeyframe: () => editingRectKf,
        soundClipsChanged() {
          updateScheduleEditor(videoClip);
        },
        splitProblem() {
          const target = splitTarget(videoClip);
          return typeof target === "string" ? target : undefined;
        },
        split() {
          void splitAtPlayhead(videoClip);
        },
      })
    : null;
  if (videoClip && videoPanel) {
    scheduleEditorFieldset.append(videoPanel.element);
    scheduleEditorRefreshers.push(videoPanel.refreshDerived);
    rectAspectLock = (kf) =>
      videoClip.destinationRectSchedule.schedule.includes(kf)
        ? videoPanel.aspect()
        : undefined;
  }

  if (multiText) {
    scheduleEditorFieldset.append(buildMultiTextFrame(multiText));
  }

  for (const info of scalars ?? []) {
    const section = buildScalarSection(info, selectable, (s, i) =>
      activeRootComponentEditor?.update(s, i),
    );
    // Rebuild the Transform Info panel whenever the template string changes.
    if (
      slideComponent &&
      info === slideComponent.transformTemplate &&
      customPanel
    ) {
      section.addEventListener("input", () => {
        const newPanel = buildSlideComponentPanel(slideComponent);
        customPanel!.replaceWith(newPanel);
        customPanel = newPanel;
      });
    }
    if (videoClip && videoPanel) {
      if (info === videoClip.urlScalar) {
        // The file may have changed:  re-read it.  This shares the open the
        // canvas is already doing for the live preview, so it costs nothing.
        section.addEventListener("input", videoPanel.refresh);
      } else if (
        info === videoClip.startMsIntoClipScalar ||
        info === videoClip.endMsIntoClipScalar
      ) {
        section.addEventListener("input", videoPanel.refreshDerived);
      }
    }
    scheduleEditorFieldset.append(section);
  }
  for (const info of schedules ?? []) {
    const section = buildScheduleSection(info, selectable);
    if (videoPanel && info === videoClip?.destinationRectSchedule) {
      section.addEventListener("input", videoPanel.refreshDerived);
    }
    // Rebuild the Font Info panel when the font family or weight changes.
    if (
      isTraditionalText &&
      (info === selectable.fontFamilySchedule ||
        info === selectable.fontWeightSchedule) &&
      customPanel
    ) {
      section.addEventListener("input", () => {
        const newPanel = buildTraditionalTextPanel(selectable);
        customPanel!.replaceWith(newPanel);
        customPanel = newPanel;
      });
    }
    scheduleEditorFieldset.append(section);
  }
  if (selectable.soundClips !== undefined) {
    scheduleEditorFieldset.append(buildSoundClipSection(selectable));
  }
}

// MARK: Split

/**
 * The series a Video Clip would be split within, or a sentence saying why it
 * can't be split.
 */
function splitTarget(clip: VideoClipComponent): InSeriesComponent | string {
  const parent = clip.parent;
  if (!(parent instanceof InSeriesComponent)) {
    return "Only a clip in a series, like a timeline, can be split:  the second piece has to start where the first one ends.";
  }
  if (!parent.replaceableComponents?.get().includes(clip)) {
    return "This clip is fixed in TypeScript, so the Visual Editor can't put a second piece next to it.";
  }
  if (!(clip.duration > 0)) {
    return "This clip has no length to split.";
  }
  return parent;
}

/** How long a sound plays, for splitting:  a clip whose file isn't decoded yet is taken to play forever. */
function soundLengthForSplit(sound: SoundClip): number {
  return soundClipLengthMs(sound) ?? Infinity;
}

/**
 * Ask how to split `clip` at the playhead, then replace it in its series with
 * the piece or pieces chosen.  See splitVideoClip() for what each piece gets.
 */
async function splitAtPlayhead(clip: VideoClipComponent): Promise<void> {
  const parent = splitTarget(clip);
  if (typeof parent === "string") return;
  const chapter = chapterList[select.selectedIndex]?.selectable;
  const clipStart = chapter ? (startWithin(chapter, clip) ?? 0) : 0;
  const choice = await askHowToSplit({
    clip,
    atMs: tidyMs(
      playPositionSeconds.valueAsNumber * 1000 - sectionStartTime - clipStart,
    ),
    lengthOf: soundLengthForSplit,
  });
  // The dialog is modal, but make sure nothing moved underneath it.
  if (!choice || splitTarget(clip) !== parent) return;
  const { first, second } = splitVideoClip(
    clip,
    choice.atMs,
    choice.crossing,
    soundLengthForSplit,
  );
  const kept =
    choice.keep === "both"
      ? [first, second]
      : choice.keep === "first"
        ? [first]
        : [second];
  const siblings = parent.replaceableComponents!.get();
  siblings.splice(siblings.indexOf(clip), 1, ...kept);
  // Saves, rebuilds the audio, and redraws the timeline and the chapter list.
  parent.replaceableComponents!.replace(siblings);
  selectedSoundClip = undefined;
  activeRootComponentEditor?.resetAll();
  if (chapter !== clip) {
    selectInChapter(kept[0]);
  }
  // Otherwise the chapter being shown was the clip itself, which is gone.  The
  // chapter list rebuilds on the next frame and, matching by name, lands on
  // the first piece kept.
  markDirty();
}

// MARK: Text Frame

/**
 * The Text Frame panel for a Multi Text, plus its frame on the canvas.
 * Part of {@link updateScheduleEditor}; returns the panel.
 *
 * The canvas side reuses the rectangle machinery (👁 / ✎, the handles,
 * Shift-drag) through a stand-in keyframe whose value *is* the frame:  reading
 * it asks {@link MultiTextComponent.frameAt}, and a drag writing it goes
 * through {@link MultiTextComponent.setFrame}.  Nothing is stored in it.
 */
function buildMultiTextFrame(text: MultiTextComponent): HTMLElement {
  const frameKf: RectKf = {
    time: 0,
    get value() {
      return text.frameAt(0);
    },
    set value(rect) {
      text.setFrame(rect);
    },
  };

  /** The Position, Width and Height fields below, after setFrame() changed them. */
  function syncFields(): void {
    const [position] = text.positionSchedule.schedule;
    pointSyncCallbacks.get(position)?.(position.value);
    for (const { schedule } of [text.widthSchedule, text.heightSchedule]) {
      numberSyncCallbacks.get(schedule[0])?.(schedule[0].value);
    }
  }
  // After a drag on the canvas.  applyMarkerDrag() then refreshes the panel.
  markerSyncCallbacks.set(frameKf, syncFields);

  const state = () =>
    textFrameCanvasStates.get(text) ?? { viewing: false, editing: true };

  /** Show the frame on the canvas, or not.  Only when there's one frame to show. */
  function applyCanvasState(): void {
    const { viewing, editing } = state();
    const editable = text.frameIsEditable;
    if (viewing && editable) {
      viewingRectKfs.add(frameKf);
    } else {
      viewingRectKfs.delete(frameKf);
    }
    if (editing && editable) {
      editingRectKf = frameKf;
    } else if (editingRectKf === frameKf) {
      editingRectKf = null;
    }
  }

  const panel = buildTextFramePanel(text, {
    frameChanged() {
      syncFields();
      for (const schedule of [
        text.positionSchedule,
        text.widthSchedule,
        text.heightSchedule,
      ]) {
        activeRootComponentEditor?.update(text, schedule);
      }
      markDirty();
    },
    rotationChanged() {
      activeRootComponentEditor?.update(text, text.rotationScalar);
      markDirty();
      // Rebuild so the Rotation menu shows the new value.
      updateScheduleEditor(text);
    },
    canvasState: state,
    setCanvasState(newState) {
      textFrameCanvasStates.set(text, newState);
      applyCanvasState();
    },
  });
  // Adding a keyframe to Position, say, means there's no longer one frame.
  scheduleEditorRefreshers.push(applyCanvasState, panel.refresh);
  applyCanvasState();
  return panel.element;
}

// MARK: Rect marker helpers

function clientToLogical(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * 16,
    y: ((clientY - rect.top) / rect.height) * 9,
  };
}

function normalizeRect(r: ReadOnlyRect): ReadOnlyRect {
  return {
    x: r.width < 0 ? r.x + r.width : r.x,
    y: r.height < 0 ? r.y + r.height : r.y,
    width: Math.abs(r.width),
    height: Math.abs(r.height),
  };
}

function rectHandlePositions(
  r: ReadOnlyRect,
): Record<RectHandle, { x: number; y: number }> {
  return {
    tl: { x: r.x, y: r.y },
    tr: { x: r.x + r.width, y: r.y },
    bl: { x: r.x, y: r.y + r.height },
    br: { x: r.x + r.width, y: r.y + r.height },
    center: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
  };
}

/**
 * Returns the transform that maps from the active marker component's local
 * coordinate space to the logical 16×9 drawing space.
 *
 * `compTf` (from componentTransforms) maps local → canvas pixels.
 * `mainTransform()` maps logical → canvas pixels.
 * Therefore: local → logical  =  mainTransform()⁻¹ · compTf
 *
 * Returns null when no stored transform exists (component is at the root
 * level, so local == logical and no conversion is needed).
 */
function getMarkerRelTf(): DOMMatrix | null {
  const component =
    selectedSlideChild ??
    (chapterList[select.selectedIndex]?.selectable as Showable | undefined);
  if (!component) return null;
  const compTf = componentTransforms.get(component);
  if (!compTf) return null;
  return mainTransform().inverse().multiply(compTf);
}

/** Map a component-local point to logical (16×9) coordinates. */
function localToLogical(
  localX: number,
  localY: number,
  relTf: DOMMatrix,
): { x: number; y: number } {
  const pt = new DOMPoint(localX, localY).matrixTransform(relTf);
  return { x: pt.x, y: pt.y };
}

/** Map a logical (16×9) point to component-local coordinates. */
function logicalToLocal(
  logX: number,
  logY: number,
  relTf: DOMMatrix,
): { x: number; y: number } {
  const pt = new DOMPoint(logX, logY).matrixTransform(relTf.inverse());
  return { x: pt.x, y: pt.y };
}

/**
 * Draw one cell of a lattice: a rectangle with both diagonals, the same
 * "here is a cell" mark used elsewhere for placeholder content.
 *
 * `dashed` marks a lattice that has no cells in at least one direction.  We
 * still draw a single cell flush against the top left so the user can see and
 * grab the control point, but the dashes say it isn't really there.
 */
function drawLatticeCell(
  ctx: CanvasRenderingContext2D,
  rect: ReadOnlyRect,
  dashed: boolean,
) {
  const { x, y, width, height } = rect;
  if (!(width > 0) || !(height > 0)) return;
  // 25% duty cycle, scaled to the cell so the pattern stays readable at any size.
  const dash = Math.min(width, height) / 8;
  ctx.setLineDash(dashed ? [dash, dash * 3] : []);
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y + height);
  ctx.moveTo(x, y + height);
  ctx.lineTo(x + width, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Draw a whole lattice in component-local space: the bounding area we are
 * trying to cover, plus a cell mark for each cell.
 *
 * A lattice with no cells in one direction still gets a single dashed cell so
 * the user can see what he is adjusting.
 */
function drawLatticeOutline(
  ctx: CanvasRenderingContext2D,
  value: LatticeValue,
  stroke: string,
  fill: string | undefined,
) {
  const { x, y, width, height } = value;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 0.05;
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, width, height);
  }
  ctx.setLineDash([]);
  ctx.strokeRect(x, y, width, height);

  const lattice = new Lattice(value);
  const empty = lattice.columnCount < 1 || lattice.rowCount < 1;
  if (empty) {
    drawLatticeCell(ctx, lattice.cellRect(0, 0), true);
  } else {
    lattice.cells().forEach(({ rect }) => drawLatticeCell(ctx, rect, false));
  }
}

/** Where the lattice's cell-size control point sits: bottom-right of the top-left cell. */
function latticeCellHandlePosition(value: LatticeValue): { x: number; y: number } {
  const lattice = new Lattice(value);
  const cell = lattice.cellRect(0, 0);
  return { x: cell.x + cell.width, y: cell.y + cell.height };
}

function latticeHandlePositions(
  value: LatticeValue,
): Record<LatticeHandle, { x: number; y: number }> {
  return {
    ...rectHandlePositions(value),
    cell: latticeCellHandlePosition(value),
  };
}

function drawScheduleMarkers(ctx: CanvasRenderingContext2D) {
  if (
    !editingRectKf &&
    viewingRectKfs.size === 0 &&
    !editingLatticeKf &&
    viewingLatticeKfs.size === 0 &&
    !editingPointKf &&
    viewingPointKfs.size === 0 &&
    !editingArrowKf &&
    viewingArrowKfs.size === 0
  )
    return;

  const relTf = getMarkerRelTf();

  // --- Pass 1: rect and point OUTLINES drawn in component-local space ---
  // Applying relTf to the context lets us use local coordinates directly,
  // so the outlines align exactly with the rendered content.
  ctx.save();
  if (relTf) {
    ctx.transform(relTf.a, relTf.b, relTf.c, relTf.d, relTf.e, relTf.f);
  }

  // View-mode rects: semi-transparent fill + stroke
  ctx.strokeStyle = "#3498db";
  ctx.lineWidth = 0.05;
  for (const kf of viewingRectKfs) {
    if (kf === editingRectKf) continue; // edit mode takes visual priority
    const { x, y, width, height } = kf.value;
    ctx.fillStyle = "rgba(52, 152, 219, 0.2)";
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
  }

  // Edit-mode rect outline
  if (editingRectKf) {
    const { x, y, width, height } = editingRectKf.value;
    ctx.strokeStyle = "#e74c3c";
    ctx.lineWidth = 0.05;
    ctx.strokeRect(x, y, width, height);
  }

  // View-mode lattices: bounding area plus every cell, in the "view" blue.
  for (const kf of viewingLatticeKfs) {
    if (kf === editingLatticeKf) continue; // edit mode takes visual priority
    drawLatticeOutline(ctx, kf.value, "#3498db", "rgba(52, 152, 219, 0.2)");
  }

  // Edit-mode lattice: same shape, in the "edit" red, no fill.
  if (editingLatticeKf) {
    drawLatticeOutline(ctx, editingLatticeKf.value, "#e74c3c", undefined);
  }

  ctx.restore();

  // --- Pass 2: circles and crosshairs at PROJECTED logical positions ---
  // Positions are projected from local → logical so the markers have a
  // consistent screen size regardless of the slide's scale factor.
  ctx.save();

  // View-mode points
  for (const kf of viewingPointKfs) {
    if (kf === editingPointKf) continue;
    const pos = relTf
      ? localToLogical(kf.value.x, kf.value.y, relTf)
      : kf.value;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 0.15, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(52, 152, 219, 0.5)";
    ctx.fill();
    ctx.strokeStyle = "#3498db";
    ctx.lineWidth = 0.04;
    ctx.stroke();
  }

  // Edit-mode rect handles
  if (editingRectKf) {
    const RADIUS = 0.18;
    const positions = rectHandlePositions(editingRectKf.value);
    for (const handle of ["tl", "tr", "bl", "br", "center"] as RectHandle[]) {
      const localPos = positions[handle];
      const pos = relTf
        ? localToLogical(localPos.x, localPos.y, relTf)
        : localPos;
      const active = draggingMarker?.handle === handle;
      const r = active ? RADIUS * 1.4 : RADIUS;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = active ? "white" : "#e74c3c";
      ctx.fill();
      ctx.strokeStyle = "#e74c3c";
      ctx.lineWidth = 0.04;
      ctx.stroke();
    }
  }

  // Edit-mode lattice handles: the rect's five, plus the cell-size handle.
  // The cell handle is drawn in a different color so it reads as a different
  // kind of control -- it resizes the cells, not the covered area.
  if (editingLatticeKf) {
    const RADIUS = 0.18;
    const positions = latticeHandlePositions(editingLatticeKf.value);
    for (const handle of [
      "tl",
      "tr",
      "bl",
      "br",
      "center",
      "cell",
    ] as LatticeHandle[]) {
      const localPos = positions[handle];
      const pos = relTf
        ? localToLogical(localPos.x, localPos.y, relTf)
        : localPos;
      const active = draggingLattice?.handle === handle;
      const r = active ? RADIUS * 1.4 : RADIUS;
      const color = handle === "cell" ? "#f39c12" : "#e74c3c";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = active ? "white" : color;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.04;
      ctx.stroke();
    }
  }

  // Edit-mode point: red circle with crosshair
  if (editingPointKf) {
    const localPt = editingPointKf.value;
    const pos = relTf ? localToLogical(localPt.x, localPt.y, relTf) : localPt;
    const active = draggingPoint === editingPointKf;
    const RADIUS = active ? 0.25 : 0.2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, RADIUS, 0, 2 * Math.PI);
    ctx.fillStyle = active ? "white" : "#e74c3c";
    ctx.fill();
    ctx.strokeStyle = "#e74c3c";
    ctx.lineWidth = 0.04;
    ctx.stroke();
    // crosshair
    const ARM = RADIUS * 0.8;
    ctx.beginPath();
    ctx.moveTo(pos.x - ARM, pos.y);
    ctx.lineTo(pos.x + ARM, pos.y);
    ctx.moveTo(pos.x, pos.y - ARM);
    ctx.lineTo(pos.x, pos.y + ARM);
    ctx.strokeStyle = active ? "#e74c3c" : "white";
    ctx.lineWidth = 0.035;
    ctx.stroke();
  }

  // View-mode arrows
  for (const kf of viewingArrowKfs) {
    if (kf === editingArrowKf) continue;
    const f = relTf
      ? localToLogical(kf.value.flat.x, kf.value.flat.y, relTf)
      : kf.value.flat;
    const p = relTf
      ? localToLogical(kf.value.pointy.x, kf.value.pointy.y, relTf)
      : kf.value.pointy;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "rgba(52,152,219,0.5)";
    ctx.lineWidth = 0.04;
    ctx.setLineDash([]);
    ctx.stroke();
    for (const pt of [f, p]) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 0.15, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(52,152,219,0.3)";
      ctx.fill();
      ctx.strokeStyle = "#3498db";
      ctx.lineWidth = 0.04;
      ctx.stroke();
    }
  }

  // Edit-mode arrow: line + 3 drag handles + optional constraint guides
  if (editingArrowKf) {
    const kf = editingArrowKf;
    const f = relTf
      ? localToLogical(kf.value.flat.x, kf.value.flat.y, relTf)
      : kf.value.flat;
    const p = relTf
      ? localToLogical(kf.value.pointy.x, kf.value.pointy.y, relTf)
      : kf.value.pointy;
    const c = { x: (f.x + p.x) / 2, y: (f.y + p.y) / 2 };

    // Constraint guides while dragging a non-center handle
    if (
      draggingArrow &&
      draggingArrowMouseLocal &&
      draggingArrow.handle !== "center" &&
      draggingArrow.kf === kf
    ) {
      const isFlat = draggingArrow.handle === "flat";
      const movingLocal = isFlat
        ? draggingArrow.startFlat
        : draggingArrow.startPointy;
      const fixedLocal = isFlat
        ? draggingArrow.startPointy
        : draggingArrow.startFlat;
      const fixedLog = relTf
        ? localToLogical(fixedLocal.x, fixedLocal.y, relTf)
        : fixedLocal;
      const mouseLog = relTf
        ? localToLogical(
            draggingArrowMouseLocal.x,
            draggingArrowMouseLocal.y,
            relTf,
          )
        : draggingArrowMouseLocal;
      ctx.setLineDash([0.12, 0.12]);
      ctx.lineWidth = 0.035;
      if (draggingArrowConstraint === "axial") {
        const sdx = movingLocal.x - fixedLocal.x;
        const sdy = movingLocal.y - fixedLocal.y;
        const len = Math.hypot(sdx, sdy);
        if (len > 1e-9) {
          const ux = sdx / len;
          const uy = sdy / len;
          const t =
            (draggingArrowMouseLocal.x - fixedLocal.x) * ux +
            (draggingArrowMouseLocal.y - fixedLocal.y) * uy;
          const projLocal = {
            x: fixedLocal.x + t * ux,
            y: fixedLocal.y + t * uy,
          };
          const projLog = relTf
            ? localToLogical(projLocal.x, projLocal.y, relTf)
            : projLocal;
          // Dashed perpendicular drop from raw mouse to the axis
          ctx.beginPath();
          ctx.moveTo(mouseLog.x, mouseLog.y);
          ctx.lineTo(projLog.x, projLog.y);
          ctx.strokeStyle = "rgba(180,0,180,0.6)";
          ctx.stroke();
          // Extended axis guide
          const EXT = 20;
          ctx.beginPath();
          ctx.moveTo(fixedLog.x - ux * EXT, fixedLog.y - uy * EXT);
          ctx.lineTo(fixedLog.x + ux * EXT, fixedLog.y + uy * EXT);
          ctx.strokeStyle = "rgba(180,0,180,0.3)";
          ctx.stroke();
        }
      } else if (draggingArrowConstraint === "radial") {
        const movingLog = relTf
          ? localToLogical(movingLocal.x, movingLocal.y, relTf)
          : movingLocal;
        const r = Math.hypot(
          movingLog.x - fixedLog.x,
          movingLog.y - fixedLog.y,
        );
        ctx.beginPath();
        ctx.arc(fixedLog.x, fixedLog.y, r, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(180,0,180,0.5)";
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(fixedLog.x, fixedLog.y);
        ctx.lineTo(mouseLog.x, mouseLog.y);
        ctx.strokeStyle = "rgba(180,0,180,0.4)";
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Arrow line
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "#e74c3c";
    ctx.lineWidth = 0.04;
    ctx.setLineDash([]);
    ctx.stroke();

    // Three handles: flat, center, pointy
    const RADIUS = 0.18;
    const isDraggingThis = draggingArrow?.kf === kf;
    for (const [handle, pt] of [
      ["flat", f],
      ["center", c],
      ["pointy", p],
    ] as [ArrowHandle, { x: number; y: number }][]) {
      const isActive = isDraggingThis && draggingArrow!.handle === handle;
      // Endpoint is hollow when it's the one being moved (directly or via center drag).
      const isEndpoint = handle === "flat" || handle === "pointy";
      const hollow =
        isEndpoint &&
        isDraggingThis &&
        (draggingArrow!.handle === handle ||
          draggingArrow!.handle === "center");
      const r = isActive ? RADIUS * 1.4 : RADIUS;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
      if (!hollow) {
        ctx.fillStyle = "#e74c3c";
        ctx.fill();
      }
      ctx.strokeStyle = "#e74c3c";
      ctx.lineWidth = 0.04;
      ctx.stroke();
    }
  }

  ctx.restore();
}

function hitTestMarker(logX: number, logY: number) {
  if (!editingRectKf) return null;
  const relTf = getMarkerRelTf();
  const local = relTf
    ? logicalToLocal(logX, logY, relTf)
    : { x: logX, y: logY };
  const HIT_RADIUS = 0.3;
  const positions = rectHandlePositions(editingRectKf.value);
  for (const handle of ["tl", "tr", "bl", "br", "center"] as RectHandle[]) {
    const pos = positions[handle];
    const dx = local.x - pos.x;
    const dy = local.y - pos.y;
    if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
      return { kf: editingRectKf, handle };
    }
  }
  return null;
}

function hitTestLatticeMarker(logX: number, logY: number) {
  if (!editingLatticeKf) return null;
  const relTf = getMarkerRelTf();
  const local = relTf
    ? logicalToLocal(logX, logY, relTf)
    : { x: logX, y: logY };
  const HIT_RADIUS = 0.3;
  const positions = latticeHandlePositions(editingLatticeKf.value);
  // "cell" is tested first: when the lattice is a single cell filling the whole
  // area it sits exactly on top of "br", and the cell handle is the one the
  // user is reaching for in that situation.
  for (const handle of [
    "cell",
    "tl",
    "tr",
    "bl",
    "br",
    "center",
  ] as LatticeHandle[]) {
    const pos = positions[handle];
    const dx = local.x - pos.x;
    const dy = local.y - pos.y;
    if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
      return { kf: editingLatticeKf, handle };
    }
  }
  return null;
}

function applyLatticeDrag(localX: number, localY: number, shiftKey = false) {
  if (!draggingLattice) return;
  const { kf, handle, startLocalX, startLocalY, startValue } = draggingLattice;

  if (handle === "cell") {
    // The handle is the bottom-right corner of the top-left cell, and the
    // top-left cell is always flush with the top-left of the covered area.
    // So the cell size is just the distance from that corner.  Never negative:
    // 0 is allowed and means "exactly one row/column" (see Lattice).
    kf.value = {
      ...startValue,
      cellWidth: Math.max(0, localX - startValue.x),
      cellHeight: Math.max(0, localY - startValue.y),
    };
  } else {
    // Reuse the rectangle rules for the covered area, including letting the
    // user drag one corner past the other -- normalizeRect() sorts it out.
    const asRect = applyRectDrag(
      handle,
      startValue,
      startLocalX,
      startLocalY,
      localX,
      localY,
      shiftKey,
    );
    kf.value = {
      ...asRect,
      cellWidth: startValue.cellWidth,
      cellHeight: startValue.cellHeight,
    };
  }
  latticeSyncCallbacks.get(kf)?.(kf.value);
}

function hitTestPointMarker(logX: number, logY: number): PointKf | null {
  if (!editingPointKf) return null;
  const relTf = getMarkerRelTf();
  const local = relTf
    ? logicalToLocal(logX, logY, relTf)
    : { x: logX, y: logY };
  const HIT_RADIUS = 0.3;
  const { x, y } = editingPointKf.value;
  const dx = local.x - x;
  const dy = local.y - y;
  return dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS ? editingPointKf : null;
}

function applyPointDrag(localX: number, localY: number) {
  if (!draggingPoint) return;
  draggingPoint.value = { x: localX, y: localY };
  pointSyncCallbacks.get(draggingPoint)?.(draggingPoint.value);
  // E.g. the Text Frame panel, when this point is a Multi Text's Position.
  for (const cb of scheduleEditorRefreshers) cb();
}

function hitTestArrowMarker(
  logX: number,
  logY: number,
): { kf: ArrowKf; handle: ArrowHandle } | null {
  if (!editingArrowKf) return null;
  const relTf = getMarkerRelTf();
  const local = relTf
    ? logicalToLocal(logX, logY, relTf)
    : { x: logX, y: logY };
  const { flat, pointy } = editingArrowKf.value;
  const center = { x: (flat.x + pointy.x) / 2, y: (flat.y + pointy.y) / 2 };
  const HIT = 0.35;
  for (const [handle, pt] of [
    ["flat", flat],
    ["pointy", pointy],
    ["center", center],
  ] as [ArrowHandle, { x: number; y: number }][]) {
    const dx = local.x - pt.x;
    const dy = local.y - pt.y;
    if (dx * dx + dy * dy <= HIT * HIT) return { kf: editingArrowKf, handle };
  }
  return null;
}

function applyArrowDrag(
  localX: number,
  localY: number,
  e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
) {
  if (!draggingArrow) return;
  const { kf, handle, startFlat, startPointy, startLocalX, startLocalY } =
    draggingArrow;
  const dx = localX - startLocalX;
  const dy = localY - startLocalY;

  if (handle === "center") {
    kf.value = {
      flat: { x: startFlat.x + dx, y: startFlat.y + dy },
      pointy: { x: startPointy.x + dx, y: startPointy.y + dy },
    };
  } else {
    const movingStart = handle === "flat" ? startFlat : startPointy;
    const fixedPt = handle === "flat" ? startPointy : startFlat;
    const rawX = movingStart.x + dx;
    const rawY = movingStart.y + dy;
    let newX = rawX;
    let newY = rawY;

    if (e.shiftKey) {
      // Axial: project mouse onto the original arrow axis through fixedPt
      const sdx = movingStart.x - fixedPt.x;
      const sdy = movingStart.y - fixedPt.y;
      const len = Math.hypot(sdx, sdy);
      if (len > 1e-9) {
        const ux = sdx / len;
        const uy = sdy / len;
        const t = (rawX - fixedPt.x) * ux + (rawY - fixedPt.y) * uy;
        newX = fixedPt.x + t * ux;
        newY = fixedPt.y + t * uy;
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Radial: project mouse onto circle of original radius around fixedPt
      const r = Math.hypot(
        movingStart.x - fixedPt.x,
        movingStart.y - fixedPt.y,
      );
      /**
       * mouse delta x -- The horizontal distance between the mouse and the fixed point.
       */
      const mouseDx = rawX - fixedPt.x;
      /**
       * mouse delta y -- The vertical distance between the mouse and the fixed point.
       */
      const mouseDy = rawY - fixedPt.y;
      /**
       * The straight line distance between the mouse and the fixed point.
       */
      const mouseDistance = Math.hypot(mouseDx, mouseDy);
      if (mouseDistance > 1e-9) {
        newX = fixedPt.x + (mouseDx / mouseDistance) * r;
        newY = fixedPt.y + (mouseDy / mouseDistance) * r;
      }
    }

    const newMoving = { x: newX, y: newY };
    kf.value =
      handle === "flat"
        ? { flat: newMoving, pointy: startPointy }
        : { flat: startFlat, pointy: newMoving };
  }

  arrowSyncCallbacks.get(kf)?.(kf.value);
}

/**
 * The rectangle drag rules, as a pure function so the lattice editor can reuse
 * them for its covered area.
 *
 * @returns The new rectangle, already normalized -- the user is allowed to drag
 * one corner past the other, and this sorts out which edge is left or top.
 */
function applyRectDrag(
  handle: RectHandle,
  startRect: ReadOnlyRect,
  startLocalX: number,
  startLocalY: number,
  localX: number,
  localY: number,
  shiftKey: boolean,
  lockAspect?: number,
): ReadOnlyRect {
  const dx = localX - startLocalX;
  const dy = localY - startLocalY;
  let newRect: ReadOnlyRect;

  if (
    shiftKey &&
    handle !== "center" &&
    (lockAspect !== undefined || startRect.height !== 0)
  ) {
    // Aspect-ratio lock: keep the opposite (anchor) corner fixed and constrain
    // the drag vector so width/height = ar.  That is the rectangle's own
    // starting shape, unless the caller knows better -- e.g. a Video Clip's
    // Dest Rect locks to the shape of the video.
    const ar = lockAspect ?? startRect.width / startRect.height;
    // tl/br: vx and vy have the same sign relative to anchor.
    // tr/bl: they have opposite signs (one goes up while the other goes right).
    const sameSign = handle === "tl" || handle === "br";
    let anchorX: number, anchorY: number;
    switch (handle) {
      case "tl":
        anchorX = startRect.x + startRect.width;
        anchorY = startRect.y + startRect.height;
        break;
      case "tr":
        anchorX = startRect.x;
        anchorY = startRect.y + startRect.height;
        break;
      case "bl":
        anchorX = startRect.x + startRect.width;
        anchorY = startRect.y;
        break;
      default:
        anchorX = startRect.x;
        anchorY = startRect.y;
        break; // br
    }
    let vx = localX - anchorX;
    let vy = localY - anchorY;
    const sf = sameSign ? 1 : -1;
    // Drive by whichever dimension changed proportionally more.
    if (Math.abs(vx / ar) >= Math.abs(vy)) {
      vy = (vx / ar) * sf;
    } else {
      vx = vy * ar * sf;
    }
    newRect = {
      x: anchorX + Math.min(0, vx),
      y: anchorY + Math.min(0, vy),
      width: Math.abs(vx),
      height: Math.abs(vy),
    };
  } else {
    switch (handle) {
      case "tl":
        newRect = {
          x: startRect.x + dx,
          y: startRect.y + dy,
          width: startRect.width - dx,
          height: startRect.height - dy,
        };
        break;
      case "tr":
        newRect = {
          x: startRect.x,
          y: startRect.y + dy,
          width: startRect.width + dx,
          height: startRect.height - dy,
        };
        break;
      case "bl":
        newRect = {
          x: startRect.x + dx,
          y: startRect.y,
          width: startRect.width - dx,
          height: startRect.height + dy,
        };
        break;
      case "br":
        newRect = {
          x: startRect.x,
          y: startRect.y,
          width: startRect.width + dx,
          height: startRect.height + dy,
        };
        break;
      case "center":
        newRect = {
          x: startRect.x + dx,
          y: startRect.y + dy,
          width: startRect.width,
          height: startRect.height,
        };
        break;
    }
  }
  return normalizeRect(newRect);
}

function applyMarkerDrag(localX: number, localY: number, shiftKey = false) {
  if (!draggingMarker) return;
  const { kf, handle, startLocalX, startLocalY, startRect } = draggingMarker;
  kf.value = applyRectDrag(
    handle,
    startRect,
    startLocalX,
    startLocalY,
    localX,
    localY,
    shiftKey,
    rectAspectLock?.(kf),
  );
  markerSyncCallbacks.get(kf)?.(kf.value);
  // The fields were set directly, which fires no input event.
  for (const cb of scheduleEditorRefreshers) cb();
}

// MARK: Load previous state.
{
  // Read the unload backups BEFORE sessionStorage.clear() wipes them below.
  const unloadBackup = sessionStorage.getItem("pendingScheduleSave");
  // Hide the canvas until DB restoration is complete to prevent the TypeScript-
  // default state from flashing briefly before the saved state is applied.
  canvas.style.visibility = "hidden";
  // Capture TypeScript defaults before any DB restoration, so they're available
  // as the "reset" option in the history select throughout this session.
  captureDefaults();
  // Fetch the JSON file in parallel with DB init so startup latency stays low.
  const startupJsonFetch = fetchJsonSnapshot();
  // Restore the video's most recent DB entry — keeps edits alive
  // across Vite hot-reloads without the user having to manually click Load.
  // IndexedDB is the only source.  The synced files are exports, never read
  // back here; Open is the explicit way to load one.
  void initFromDB(unloadBackup).then(async () => {
    // Fallback: URL-based JSON for any key that still has ts-defaults.
    const jsonResult = await startupJsonFetch;
    if (jsonResult.ok) {
      applyJsonSnapshot(jsonResult.data, true, false);
    }
    // Catch the synced files up with whatever was restored, rather than
    // trusting the last session's final write:  a write started as the page
    // unloads usually never finishes.  (It can't leave a corrupt file, only a
    // stale one.)
    jsonSync.request();
    diffSync.request();
    defaultsSync.request();
  });

  // Sanity-check DB for timestamps in the future (clock skew, corrupted data).
  void (async () => {
    const now = Date.now();
    const allFileRecords = await readAllFileRecords(toShowKey);
    for (const fr of allFileRecords) {
      if (fr.savedAt > now) {
        console.error(
          `[sanity] File record "${fr.filename}" has a future timestamp: ${new Date(fr.savedAt).toISOString()} (now=${new Date(now).toISOString()})`,
        );
      }
    }
    const record = await readVideoHistory();
    for (const entry of record?.entries ?? []) {
      if (entry.timestamp > now) {
        console.error(
          `[sanity] History entry for "${toShowKey}" has a future timestamp: ${new Date(entry.timestamp).toISOString()} (now=${new Date(now).toISOString()})`,
        );
      }
    }
  })();

  // When first loading this page, try to restore the settings from the last session.
  // So when you configure the web page, and you hit refresh, or the page automatically
  // refreshes, you don't lose your settings.
  try {
    const index = sessionStorage.getItem("index");
    const timeInSeconds = sessionStorage.getItem("timeInSeconds");
    const state = sessionStorage.getItem("state");
    if (index && timeInSeconds && state) {
      select.selectedIndex = assertNonNullable(parseIntX(index));
      if (select.selectedIndex < 0) {
        // What if you save the state when row 13 is selected, but there are currently
        // only 5 rows available?  That's when we get here.  Without this change
        // updateFromSelect() would throw an exception.
        select.selectedIndex = 0;
      }
      updateFromSelect();
      const savedMs = parseFloat(timeInSeconds) * 1000;
      const clampedMs = Math.max(
        sectionStartTime,
        Math.min(sectionEndTime, savedMs),
      );
      loadPlayPositionSeconds(clampedMs);
      loadPlayPositionRange();
      querySelector(
        `input[name="onSectionEnd"][value="${state}"]`,
        HTMLInputElement,
      ).checked = true;
      if (sessionStorage.getItem("wasPlaying") === "1") {
        playCheckBox.checked = true;
      }
    }
    if (sessionStorage.getItem("quality") === "Low Power") {
      getById("lowPower", HTMLInputElement).checked = true;
    }
    const savedZoom = sessionStorage.getItem("zoomSelect");
    const savedPanX = parseFloatX(sessionStorage.getItem("panX") ?? "");
    const savedPanY = parseFloatX(sessionStorage.getItem("panY") ?? "");
    if (savedZoom !== null) {
      zoomSelect.value = savedZoom;
    }
    if (savedZoom === null || savedZoom === "fit") {
      zoomToFit();
    } else if (savedPanX !== undefined && savedPanY !== undefined) {
      applyZoom(parseFloat(savedZoom), savedPanX, savedPanY);
    } else {
      zoomToFit();
    }

    // Restore splitter positions (must read before sessionStorage.clear() below).
    // Values are stored as "XX.XX%" (new format) or a bare number in pixels (old).
    const topLeftH = sessionStorage.getItem("pane-height-top-left") ?? "";
    const topRightH = sessionStorage.getItem("pane-height-top-right") ?? "";
    const leftColW = sessionStorage.getItem("pane-width-left-col") ?? "";
    const toHeight = (v: string) =>
      v.endsWith("%") ? v : isFinite(parseFloat(v)) ? `${parseFloat(v)}px` : "";
    const toFlex = (v: string) =>
      v.endsWith("%")
        ? `0 0 ${v}`
        : isFinite(parseFloat(v))
          ? `0 0 ${parseFloat(v)}px`
          : "";
    const hL = toHeight(topLeftH);
    if (hL) getById("top-left", HTMLDivElement).style.height = hL;
    const hR = toHeight(topRightH);
    if (hR) getById("top-right", HTMLDivElement).style.height = hR;
    const fL = toFlex(leftColW);
    if (fL) getById("left-col", HTMLDivElement).style.flex = fL;
  } finally {
    sessionStorage.clear();
  }
}

// MARK: User interactions with the canvas.

// MARK: Canvas pointer interactions (pan)

let isDragging = false;
let dragStartClientX = 0;
let dragStartClientY = 0;
let dragStartPanX = 0;
let dragStartPanY = 0;

canvas.addEventListener("pointerdown", (pointerEvent) => {
  const logical = clientToLogical(pointerEvent.clientX, pointerEvent.clientY);
  const hit = hitTestMarker(logical.x, logical.y);
  if (hit) {
    canvas.setPointerCapture(pointerEvent.pointerId);
    const relTf = getMarkerRelTf();
    const local = relTf ? logicalToLocal(logical.x, logical.y, relTf) : logical;
    draggingMarker = {
      kf: hit.kf,
      handle: hit.handle,
      startLocalX: local.x,
      startLocalY: local.y,
      startRect: { ...hit.kf.value },
    };
    return;
  }
  const hitLattice = hitTestLatticeMarker(logical.x, logical.y);
  if (hitLattice) {
    canvas.setPointerCapture(pointerEvent.pointerId);
    const relTf = getMarkerRelTf();
    const local = relTf ? logicalToLocal(logical.x, logical.y, relTf) : logical;
    draggingLattice = {
      kf: hitLattice.kf,
      handle: hitLattice.handle,
      startLocalX: local.x,
      startLocalY: local.y,
      startValue: { ...hitLattice.kf.value },
    };
    return;
  }
  const hitPt = hitTestPointMarker(logical.x, logical.y);
  if (hitPt) {
    canvas.setPointerCapture(pointerEvent.pointerId);
    draggingPoint = hitPt;
    return;
  }
  const hitArrow = hitTestArrowMarker(logical.x, logical.y);
  if (hitArrow) {
    canvas.setPointerCapture(pointerEvent.pointerId);
    const relTf = getMarkerRelTf();
    const local = relTf ? logicalToLocal(logical.x, logical.y, relTf) : logical;
    draggingArrow = {
      kf: hitArrow.kf,
      handle: hitArrow.handle,
      startFlat: { ...hitArrow.kf.value.flat },
      startPointy: { ...hitArrow.kf.value.pointy },
      startLocalX: local.x,
      startLocalY: local.y,
      pointerId: pointerEvent.pointerId,
    };
    draggingArrowConstraint = "none";
    return;
  }
  if (zoomSelect.value === "fit") return;
  canvas.setPointerCapture(pointerEvent.pointerId);
  isDragging = true;
  dragStartClientX = pointerEvent.clientX;
  dragStartClientY = pointerEvent.clientY;
  dragStartPanX = panX;
  dragStartPanY = panY;
});
canvas.addEventListener("pointermove", (pointerEvent) => {
  if (pointerEvent.buttons === 0) {
    isDragging = false;
    draggingMarker = null;
    draggingLattice = null;
    draggingPoint = null;
    draggingArrow = null;
    draggingArrowMouseLocal = null;
    return;
  }
  if (draggingMarker) {
    const logical = clientToLogical(pointerEvent.clientX, pointerEvent.clientY);
    const relTf = getMarkerRelTf();
    const local = relTf ? logicalToLocal(logical.x, logical.y, relTf) : logical;
    applyMarkerDrag(local.x, local.y, pointerEvent.shiftKey);
    return;
  }
  if (draggingLattice) {
    const logical = clientToLogical(pointerEvent.clientX, pointerEvent.clientY);
    const relTf = getMarkerRelTf();
    const local = relTf ? logicalToLocal(logical.x, logical.y, relTf) : logical;
    applyLatticeDrag(local.x, local.y, pointerEvent.shiftKey);
    return;
  }
  if (draggingPoint) {
    const logical = clientToLogical(pointerEvent.clientX, pointerEvent.clientY);
    const relTf = getMarkerRelTf();
    const local = relTf ? logicalToLocal(logical.x, logical.y, relTf) : logical;
    applyPointDrag(local.x, local.y);
    return;
  }
  if (draggingArrow) {
    const logical = clientToLogical(pointerEvent.clientX, pointerEvent.clientY);
    const relTf = getMarkerRelTf();
    const local = relTf ? logicalToLocal(logical.x, logical.y, relTf) : logical;
    draggingArrowMouseLocal = local;
    draggingArrowConstraint = pointerEvent.shiftKey
      ? "axial"
      : pointerEvent.ctrlKey || pointerEvent.metaKey
        ? "radial"
        : "none";
    applyArrowDrag(local.x, local.y, pointerEvent);
    return;
  }
  if (isDragging) {
    applyZoom(
      currentZoomFactor,
      dragStartPanX + (pointerEvent.clientX - dragStartClientX),
      dragStartPanY + (pointerEvent.clientY - dragStartClientY),
    );
  }
});
canvas.addEventListener("pointerup", () => {
  isDragging = false;
  // Marker drags update keyframe values without firing fieldset events,
  // so kick the auto-save timer here when any drag just completed.
  if (draggingMarker || draggingLattice || draggingPoint || draggingArrow)
    markDirty();
  draggingMarker = null;
  draggingLattice = null;
  draggingPoint = null;
  draggingArrow = null;
  draggingArrowMouseLocal = null;
  draggingArrowConstraint = "none";
});
canvas.addEventListener("pointercancel", () => {
  isDragging = false;
  draggingMarker = null;
  draggingLattice = null;
  draggingPoint = null;
  draggingArrow = null;
  draggingArrowMouseLocal = null;
  draggingArrowConstraint = "none";
});

// Arrow drag keyboard handling (document-level so focus doesn't matter).
function refreshArrowConstraint(e: KeyboardEvent) {
  if (!draggingArrow || !draggingArrowMouseLocal) return;
  draggingArrowConstraint = e.shiftKey
    ? "axial"
    : e.ctrlKey || e.metaKey
      ? "radial"
      : "none";
  applyArrowDrag(draggingArrowMouseLocal.x, draggingArrowMouseLocal.y, e);
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && draggingArrow) {
    draggingArrow.kf.value = {
      flat: draggingArrow.startFlat,
      pointy: draggingArrow.startPointy,
    };
    arrowSyncCallbacks.get(draggingArrow.kf)?.(draggingArrow.kf.value);
    canvas.releasePointerCapture(draggingArrow.pointerId);
    draggingArrow = null;
    draggingArrowMouseLocal = null;
    draggingArrowConstraint = "none";
    return;
  }
  if (e.key === "Shift" || e.key === "Control" || e.key === "Meta") {
    refreshArrowConstraint(e);
  }
});
document.addEventListener("keyup", (e) => {
  if (e.key === "Shift" || e.key === "Control" || e.key === "Meta") {
    refreshArrowConstraint(e);
  }
});

getById("recordJustSound", HTMLButtonElement).addEventListener(
  "click",
  async () => {
    const blob = await audioBuilder.toBlob();
    downloadBlob("sound_file.wav", blob);
  },
);

function reload(): void {
  initChapters();
  updateFromSelect();
  initAudio();
}

getById("reloadBtn", HTMLButtonElement).addEventListener("click", reload);

// MARK: Debug Log

// debugLog() itself is just an array push -- cheap enough to call from a RAF
// handler. Rendering it to the page is intentionally decoupled onto its own
// slow timer, so a spammy source (e.g. a video clip stuck in a reseek loop)
// can't turn into a DOM-thrashing problem on top of whatever it's already
// diagnosing.
const debugLogPre = getById("debugLog", HTMLPreElement);
const MAX_DEBUG_LOG_LINES = 1000;
function renderNewDebugLogEntries(): void {
  const newEntries = getNewDebugLogEntries();
  if (newEntries.length === 0) return;
  const wasScrolledToBottom =
    debugLogPre.scrollTop + debugLogPre.clientHeight >=
    debugLogPre.scrollHeight - 4;
  const newLines = newEntries.map(
    (entry) => `${(entry.time / 1000).toFixed(3)}  [${entry.tag}]  ${entry.message}`,
  );
  const allLines = debugLogPre.textContent
    ? debugLogPre.textContent.split("\n").concat(newLines)
    : newLines;
  debugLogPre.textContent = allLines.slice(-MAX_DEBUG_LOG_LINES).join("\n");
  if (wasScrolledToBottom) {
    debugLogPre.scrollTop = debugLogPre.scrollHeight;
  }
}
setInterval(renderNewDebugLogEntries, 250);
getById("debugLogClearBtn", HTMLButtonElement).addEventListener(
  "click",
  () => {
    debugLogPre.textContent = "";
  },
);

getById("dumpDbBtn", HTMLButtonElement).addEventListener("click", async () => {
  const videoRecord = await readVideoHistory();
  const pre = getById("dbDump", HTMLPreElement);
  const lines: string[] = [];

  lines.push(`=== videos["${toShowKey}"] — ${videoRecord?.entries.length ?? 0} entr(ies) ===`);
  const latest = videoRecord?.entries.at(-1);
  lines.push(latest ? JSON.stringify(latest, null, 2) : "(none)");
  pre.textContent = lines.join("\n");
});

// MARK: Save JSON file

/** Serialize the current in-memory state of the whole video. */
function buildJsonSnapshot(): VideoSnapshot {
  return {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    videoKey: toShowKey,
    tree: savedTree(),
  };
}

/** Flush pending changes to IndexedDB so the database is consistent with memory. */
async function _flushDirtyToDb(): Promise<void> {
  if (isVideoDirty()) await saveVideoState();
}

/**
 * Save Copy As:  write the current state, once, to a file the user picks.
 * The one export with precise control over when it happens; it never changes
 * which file is synced.
 */
async function saveJsonCopyAs(): Promise<void> {
  await _flushDirtyToDb();
  const body = JSON.stringify(buildJsonSnapshot(), null, 2);

  let handle: FileSystemFileHandle;
  try {
    handle = await window.showSaveFilePicker({
      id: "json-state",
      suggestedName: `${toShowKey} copy.json`,
      types: JSON_FILE_TYPES,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    throw e;
  }

  const synced = jsonSync.handle;
  if (synced && (await handle.isSameEntry(synced))) {
    alert(
      `"${handle.name}" is the file Sync to file keeps up to date.\n\n` +
        `Choose a different name, or uncheck Sync to file first.`,
    );
    return;
  }

  try {
    const writable = await handle.createWritable();
    await writable.write(body);
    await writable.close();
  } catch {
    alert(`Could not write to "${handle.name}".`);
  }
}

getById("saveCopyAsJsonBtn", HTMLButtonElement).addEventListener(
  "click",
  () => void saveJsonCopyAs(),
);

// MARK: Load JSON file

type FetchJsonResult =
  | { ok: true; data: SerializedFixedChild }
  | { ok: false; reason: "not-found" | "parse-error" | "network-error" };

/**
 * The tree from a parsed save file, or undefined if it isn't one.
 *
 * Version 1 files (a flat map keyed by `"<videoKey>|<description>"`) are no longer read.  To
 * open one, check out a commit from before the reader was removed and re-save the file there.
 */
function parseSnapshotFile(parsed: unknown): SerializedFixedChild | undefined {
  // Saved files leave out the TypeScript defaults.  Put them back here, where
  // a file's tree first enters memory, so everything downstream sees a whole one.
  return isVideoSnapshot(parsed) ? loadableTree(parsed.tree) : undefined;
}

/** Fetch and parse `./saved_state/<toShowKey>.json`. */
async function fetchJsonSnapshot(): Promise<FetchJsonResult> {
  const url = `./saved_state/${toShowKey}.json`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return { ok: false, reason: "network-error" };
  }
  if (!response.ok) return { ok: false, reason: "not-found" };
  try {
    const tree = parseSnapshotFile(await response.json());
    if (!tree) return { ok: false, reason: "parse-error" };
    return { ok: true, data: tree };
  } catch {
    return { ok: false, reason: "parse-error" };
  }
}

/**
 * Apply a whole-video snapshot to just the chapter the user has selected.
 *
 * A stored entry now covers the entire video, but the Load dialog has always acted on
 * whatever the chapter selector points at.  Locating `target` inside the snapshot keeps that
 * behaviour: picking an older entry while a single slide is selected reverts that slide and
 * leaves its siblings alone.  Selecting the root applies everything.
 */
function applyScopedToTarget(
  target: Showable,
  tree: SerializedFixedChild,
): void {
  const node = findSerializedNode(toShow, loadableTree(tree), target);
  if (node) applyJsonEntry(target, node);
}

/** Rebuild the component and schedule editors after a load has replaced the tree's state. */
function refreshEditorsAfterLoad(): void {
  const current = currentSaveTarget();
  if (!current) return;
  selectedSlideChild = null;
  activeRootComponentEditor?.resetAll();
  updateComponentEditor(current);
  updateScheduleEditor(current);
}

/**
 * Apply a parsed JSON snapshot to all matching selectables in `chapterList`,
 * then refresh the schedule editor for the active chapter.
 *
 * @param snapshot - the parsed `Record<key, JsonFileEntry>` object
 * @param onlyIfNoDb - when true, skip any key that already has a DB entry
 *   (used during startup so the DB remains the highest-priority source)
 */
function applyJsonSnapshot(
  tree: SerializedFixedChild,
  onlyIfNoDb = false,
  persist = false,
): void {
  if (onlyIfNoDb && _loadSource?.kind === "db") return;

  applyJsonEntry(toShow, tree);
  _loadSource = { kind: "json", filename: `${toShowKey}.json` };
  _baselineTreeJson = currentTreeJson();

  // Write to IndexedDB so this state survives a Vite hot-reload.
  if (persist) void saveVideoState(true);

  refreshEditorsAfterLoad();
}

async function loadFromJsonFile(): Promise<void> {
  // Flush dirty state so the load can be undone from the history dialog.
  await _flushDirtyToDb();

  // Always show a picker — start in the same directory as the active file if there is one.
  let handle: FileSystemFileHandle;
  try {
    const [picked] = await window.showOpenFilePicker({
      id: "json-state",
      types: [
        { description: "JSON", accept: { "application/json": [".json"] } },
      ],
      startIn: jsonSync.handle ?? "documents",
    });
    handle = picked;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    throw e;
  }

  let fileContent: string;
  try {
    const file = await handle.getFile();
    fileContent = await file.text();
  } catch (e) {
    alert(`Could not read "${handle.name}": ${e}`);
    return;
  }

  let tree: SerializedFixedChild | undefined;
  try {
    tree = parseSnapshotFile(JSON.parse(fileContent));
  } catch {
    alert(`"${handle.name}" is not valid JSON.`);
    return;
  }
  if (!tree) {
    alert(
      `"${handle.name}" is not a canvas-recorder save file (format version ${SNAPSHOT_FORMAT_VERSION}).`,
    );
    return;
  }

  // Apply the whole tree, and save it to IndexedDB:  that's what makes it
  // survive a reload, keeps the previous state in Load, and (through the
  // save) brings the synced file up to date.  Opening a file doesn't change
  // which file is synced.
  applyJsonSnapshot(tree, false, true);

  // List it in the Load dialog, as before.  Not if it *is* the synced file:
  // that record already exists, and this would switch syncing off.
  const synced = jsonSync.handle;
  if (!synced || !(await handle.isSameEntry(synced))) {
    void putFileRecord({
      filename: handle.name,
      handle,
      savedAt: Date.now(),
      isActive: false,
      videoKey: toShowKey,
    });
  }
}

loadJsonBtn.addEventListener("click", () => void loadFromJsonFile());

// The "Restore Defaults" button used to live here.  It is gone: selecting the root in the
// chapter list and picking "TypeScript defaults" in the Load dialog does the same job, so
// restoring everything at once no longer needs to be a special case.

// MARK: Resizable pane dividers

/**
 * Wire up a horizontal drag handle that resizes the top pane within its column.
 * The bottom pane automatically fills whatever space remains (flex: 1).
 */
function initResizeHandle(handle: HTMLElement, topPane: HTMLElement): void {
  const storageKey = `pane-height-${topPane.id}`;

  handle.addEventListener("mousedown", (startEvent) => {
    startEvent.preventDefault();
    handle.classList.add("dragging");

    const col = handle.parentElement!;
    const colH = col.getBoundingClientRect().height;
    const handleH = handle.getBoundingClientRect().height;
    const startClientY = startEvent.clientY;
    const startPaneH = topPane.getBoundingClientRect().height;
    const MIN_PANE = 50;

    const onMove = (e: MouseEvent) => {
      const newH = Math.max(
        MIN_PANE,
        Math.min(
          colH - handleH - MIN_PANE,
          startPaneH + (e.clientY - startClientY),
        ),
      );
      topPane.style.height = `${((newH / colH) * 100).toFixed(2)}%`;
      if (zoomSelect.value === "fit") zoomToFit();
    };

    const onUp = () => {
      handle.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      sessionStorage.setItem(storageKey, topPane.style.height);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

initResizeHandle(
  getById("hresize-left", HTMLDivElement),
  getById("top-left", HTMLDivElement),
);
initResizeHandle(
  getById("hresize-right", HTMLDivElement),
  getById("top-right", HTMLDivElement),
);

{
  const vhandle = getById("vresize", HTMLDivElement);
  const leftCol = getById("left-col", HTMLDivElement);
  const MIN_COL = 80;
  const vStorageKey = "pane-width-left-col";

  vhandle.addEventListener("mousedown", (startEvent) => {
    startEvent.preventDefault();
    vhandle.classList.add("dragging");
    const totalW = document.body.getBoundingClientRect().width;
    const handleW = vhandle.getBoundingClientRect().width;
    const startClientX = startEvent.clientX;
    const startColW = leftCol.getBoundingClientRect().width;

    const onMove = (e: MouseEvent) => {
      const newW = Math.max(
        MIN_COL,
        Math.min(
          totalW - handleW - MIN_COL,
          startColW + (e.clientX - startClientX),
        ),
      );
      leftCol.style.flex = `0 0 ${((newW / totalW) * 100).toFixed(2)}%`;
      if (zoomSelect.value === "fit") zoomToFit();
    };

    const onUp = () => {
      vhandle.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      // flex is "0 0 X%" — store just the percentage part
      sessionStorage.setItem(vStorageKey, leftCol.style.flex.split(" ")[2]);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

// TODO when saving video, only save the currently selected section.
//  * That button should make it obvious if we are saving everything or just part.
//  * Add a way to record any range you want.
// TODO Reenable other buttons after recording.
//  * Probably, but no rush.
//  * It is so easy to hit refresh!

// MARK: Save on leaving

// These are registered last on purpose.  saveOnUnload() reads variables declared all over this
// file.  If this module throws while it is starting up, anything registered before the throw
// stays registered, but the variables declared after it never get initialized, so every later
// call fails with "Cannot access ... before initialization".  With an HMR hook, that is one
// error per file save until the page is reloaded.  Registered here, a module that fails to
// start never registers them at all.

if (import.meta.hot) {
  // Changing a typescript file invokes this.
  // Changing a css file would cause vite:beforeUpdate, instead.
  import.meta.hot.on("vite:beforeFullReload", (_data) => {
    saveState();
    saveOnUnload();
  });
}

window.addEventListener("beforeunload", saveOnUnload);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveOnUnload();
});
