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
  ScalarInfo,
  SerializedScalar,
  SerializedSchedule,
  Showable,
  VisualEditorAPI,
} from "../src/showable.ts";
import {
  discreteKeyframes,
  interpolateColors,
  interpolateNumbers,
  interpolatePoints,
  interpolateRects,
  Keyframe,
} from "../src/interpolate.ts";
import { ArrowValue, interpolateArrow } from "../src/schedule-helper.ts";
import {
  applyJsonEntry,
  JsonFileEntry,
  serializeComponents,
  serializeFixedComponents,
  serializeScalars,
  serializeSchedules,
  SerializedFixedChild,
} from "../src/snapshot.ts";
import { downloadBlob, philDebug } from "../src/utility.ts";
import { AudioBuilder } from "./audio-builder.ts";
import {
  buildComponents,
  componentRegistry,
  fontsAreAvailable,
  SerializedChild,
  SlideComponent,
  TraditionalTextComponent,
} from "../src/slide-components.ts";
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
import { WaveformDisplay } from "./waveform-display.ts";
import { showableOptions } from "../src/dynamic-exports.ts";

// Expose for manual testing from the browser devtools console.
(window as unknown as Record<string, unknown>).fontsAreAvailable =
  fontsAreAvailable;

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

const waveformDisplay = new WaveformDisplay(
  getById("waveformCanvas", HTMLCanvasElement),
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
  waveformDisplay.setPlayMs(timeInMs);
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
    });
    drawScheduleMarkers(context);
  } else {
    toShow.show({
      timeInMs,
      context,
      globalTime: timeInMs,
      quality: "High Quality",
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
        await newBuilder.add(
          clip.source,
          offset + clip.startMsIntoScene,
          clip.startMsIntoClip,
          clip.lengthMs,
        );
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
  waveformDisplay.setAudioBuffer(newBuilder.getAudioBuffer());
  console.log(`Audio ready in ${(time2 - time1).toFixed(0)} ms.`);
}

initAudio();

/**
 * Redraw the canvas and update some other controls.
 *
 * This is for live / realtime drawing.  This is disabled when we are saving the file.
 */
const animationLoop = new AnimationLoop((_rAFTimeInMs: number) => {
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

async function startRecording(saveStartMs = 0, saveEndMs = toShow.duration) {
  stopAudio();
  startRecordingButton.disabled = true;
  liveControls.disabled = true;
  cancelRecordingButton.disabled = false;
  canceled = false;

  animationLoop.cancel();

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

  infoDiv.innerHTML = "Choose save location... (recording starts immediately)";

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
  const output = new Output({
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

  // Send it all at once, don't `await`, let Media Bunny figure it out.
  audioSource.add(audioBuffer);

  const frameDuration = 1000 / FPS;

  // Offline loop: draw + push frames (not limited to realtime)
  let frameNumber = 0;
  while (!canceled) {
    const timeInMs = saveStartMs + (frameNumber + 0.5) * frameDuration;
    if (timeInMs >= saveEndMs) {
      break;
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

  // Restore pixel-perfect mode.
  isRecording = false;
  zoomControls.inert = false;
  viewportResizeObserver.observe(viewport);
  if (zoomSelect.value === "fit") {
    zoomToFit();
  } else {
    applyZoom(currentZoomFactor);
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

saveStartSecondsInput.addEventListener("change", () => {
  saveChapterSelect.selectedIndex = -1;
  updateSaveDialogInfo();
});

saveEndSecondsInput.addEventListener("change", () => {
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
    dump(
      interestingChildren[0].child,
      prefix,
      start,
      limit,
      descriptionPrefix + current.description + " ⏵ ",
      parent,
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
      selectable: current,
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

function initChapters(): void {
  const savedDescription = chapterList[select.selectedIndex]?.description;
  chapterList.length = 0;
  dump(toShow);
  select.replaceChildren();
  chapterList.forEach((value) => {
    const option = document.createElement("option");
    option.textContent = value.prefix + value.description;
    option.value = value.description;
    select.append(option);
  });
  const restoredIndex =
    savedDescription !== undefined
      ? chapterList.findIndex((d) => d.description === savedDescription)
      : -1;
  select.selectedIndex = restoredIndex >= 0 ? restoredIndex : 0;
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
      void saveScheduleState(selectable);
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

let draggingMarker: {
  kf: RectKf;
  handle: RectHandle;
  startLocalX: number;
  startLocalY: number;
  startRect: ReadOnlyRect;
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
function updateFromSelect() {
  stopAudio();
  const info = chapterList[select.selectedIndex];
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
  waveformDisplay.setChapter(sectionStartTime, sectionEndTime);
  playPositionRange.min = sectionStartTime.toString();
  playPositionRange.max = sectionEndTime.toString();
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
}
select.addEventListener("input", updateFromSelect);
updateFromSelect();

waveformDisplay.onSeek = (ms) => {
  stopAudio();
  loadPlayPositionSeconds(ms);
  loadPlayPositionRange();
};
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

if (import.meta.hot) {
  // Changing a typescript file invokes this.
  // Changing a css file would cause vite:beforeUpdate, instead.
  import.meta.hot.on("vite:beforeFullReload", (_data) => {
    saveState();
    saveOnUnload();
  });
}

addEventListener("pagehide", (_event) => {
  saveState();
});

// MARK: Schedule Editor

type ScheduleInfo = NonNullable<Showable["schedules"]>[number];

// MARK: Schedule persistence (IndexedDB)

const toShowKey = new URLSearchParams(location.search).get("toShow") ?? "";

/** Full serialized state saved to IndexedDB. */
type DataHistoryEntry = {
  timestamp: number;
  schedules: SerializedSchedule[];
  scalars?: SerializedScalar[];
  components?: SerializedChild[];
  fixedComponents?: SerializedFixedChild[];
  userEditableDescription?: string;
};
/** Marker written when the user deliberately chooses TypeScript defaults. */
type MarkerHistoryEntry = {
  timestamp: number;
  kind: "ts-defaults" | "json";
  /** Only set when kind === "json". */
  filename?: string;
};
type HistoryEntry = DataHistoryEntry | MarkerHistoryEntry;
function isMarker(e: HistoryEntry): e is MarkerHistoryEntry {
  return "kind" in e;
}
type HistoryRecord = {
  selectableKey: string;
  entries: HistoryEntry[];
  /** Persisted preference: load this key from JSON (or ts-defaults) on next startup. */
  sourcePointer?: { kind: "json"; filename: string } | { kind: "ts-defaults" };
};

/** Where the current in-memory state came from. */
type LoadSource =
  | { kind: "ts-defaults" }           // fallback — no DB record; JSON auto-load can override
  | { kind: "ts-defaults-explicit" }  // deliberate user choice; JSON auto-load must not override
  | { kind: "db"; timestamp: number }
  | { kind: "json"; filename: string };

const MAX_HISTORY_ENTRIES = 20;

/**
 * TypeScript defaults captured at page load — before any DB restoration.
 * Keyed by {@link selectableKey}. Shown as a permanent "TypeScript defaults"
 * option in the history select so the user can always reset to the
 * code-defined starting point. Never written to IndexedDB.
 */
const tsDefaults = new Map<string, DataHistoryEntry>();
/** Set to true once initFromDB has finished. */
let initFromDBComplete = false;
/** Where each selectable's current in-memory state was loaded from. */
const loadSources = new Map<string, LoadSource>();
/** JSON snapshot of each selectable's state at load time (or last save).
 *  Compared against current state to determine dirty status. */
const loadedSnapshots = new Map<string, string>();

function openScheduleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("canvas-recorder-schedules", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("history", { keyPath: "selectableKey" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readHistory(key: string): Promise<HistoryRecord | undefined> {
  const db = await openScheduleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("history", "readonly");
    const req = tx.objectStore("history").get(key);
    req.onsuccess = () => resolve(req.result as HistoryRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function readAllHistory(): Promise<HistoryRecord[]> {
  const db = await openScheduleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("history", "readonly");
    const req = tx.objectStore("history").getAll();
    req.onsuccess = () => resolve(req.result as HistoryRecord[]);
    req.onerror = () => reject(req.error);
  });
}

async function writeHistory(
  key: string,
  entries: HistoryEntry[],
  sourcePointer?: HistoryRecord["sourcePointer"],
): Promise<void> {
  const db = await openScheduleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("history", "readwrite");
    const record: HistoryRecord = { selectableKey: key, entries };
    if (sourcePointer !== undefined) record.sourcePointer = sourcePointer;
    tx.objectStore("history").put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Reads the record for key, sets its sourcePointer, and writes it back. */
async function persistSourcePointer(
  key: string,
  pointer: HistoryRecord["sourcePointer"],
): Promise<void> {
  const existing = await readHistory(key);
  await writeHistory(key, existing?.entries ?? [], pointer);
}

// MARK: Load-source helpers

/** Logs abandoned or deleted items; replace console.info with persistent storage if needed. */
function sendToRecycleBin(...args: unknown[]): void {
  console.info("🗑️ Recycle bin:", ...args);
}

/** Serializes the current in-memory state of a selectable to a JSON string. */
function currentSnapshotJson(selectable: Showable): string {
  return JSON.stringify({
    schedules: selectable.schedules?.length
      ? serializeSchedules(selectable.schedules)
      : [],
    scalars: selectable.scalars?.length
      ? serializeScalars(selectable.scalars)
      : undefined,
    components: Array.isArray(selectable.components)
      ? serializeComponents(selectable.components)
      : undefined,
    fixedComponents: selectable.fixedComponents?.length
      ? serializeFixedComponents(selectable.fixedComponents)
      : undefined,
    userEditableDescription: selectable.userEditableDescription,
  });
}

/** True if the selectable's in-memory state differs from what was last loaded or saved. */
function isDirty(selectable: Showable): boolean {
  const key = selectableKey(selectable);
  const snapshot = loadedSnapshots.get(key);
  return snapshot !== undefined && currentSnapshotJson(selectable) !== snapshot;
}

function formatLoadSource(source: LoadSource | undefined): string {
  if (!source) return "—";
  switch (source.kind) {
    case "ts-defaults":
    case "ts-defaults-explicit":
      return "TypeScript defaults";
    case "json":
      return source.filename;
    case "db":
      return new Date(source.timestamp).toLocaleString();
  }
}

/** Updates the inline status label to show source and dirty flag. */
// MARK: JSON save status

const jsonSaveStatusElement = getById("jsonSaveStatus", HTMLSpanElement);

/**
 * The JSON body we last successfully fetched or wrote, used to detect
 * unsaved changes. `undefined` = haven't checked yet.
 */
let _lastKnownJsonBody: string | undefined;

/**
 * The last fetch failure reason, if any. Cleared when a fetch or save succeeds.
 */
let _jsonFetchFailReason:
  | "not-found"
  | "parse-error"
  | "network-error"
  | undefined;

function updateJsonSaveStatus(): void {
  if (_jsonFetchFailReason === "not-found") {
    jsonSaveStatusElement.textContent = "JSON: never saved";
    jsonSaveStatusElement.style.color = "gray";
    jsonSaveStatusElement.title = `No file at ./saved_state/${toShowKey}.json`;
    return;
  }
  if (_jsonFetchFailReason === "network-error") {
    jsonSaveStatusElement.textContent = "JSON: server unreachable";
    jsonSaveStatusElement.style.color = "gray";
    jsonSaveStatusElement.title = "Could not reach the Vite dev server";
    return;
  }
  if (_jsonFetchFailReason === "parse-error") {
    jsonSaveStatusElement.textContent = "JSON: file corrupted";
    jsonSaveStatusElement.style.color = "red";
    jsonSaveStatusElement.title = `./saved_state/${toShowKey}.json is not valid JSON`;
    return;
  }
  if (_lastKnownJsonBody === undefined) {
    jsonSaveStatusElement.textContent = "Checking…";
    jsonSaveStatusElement.style.color = "gray";
    jsonSaveStatusElement.title = "";
    return;
  }
  const current = JSON.stringify(buildJsonSnapshot(), null, 2);
  if (current === _lastKnownJsonBody) {
    jsonSaveStatusElement.textContent = "JSON: saved ✓";
    jsonSaveStatusElement.style.color = "green";
    jsonSaveStatusElement.title = "";
  } else {
    jsonSaveStatusElement.textContent = "JSON: unsaved changes";
    jsonSaveStatusElement.style.color = "darkorange";
    jsonSaveStatusElement.title = "In-memory state differs from the saved JSON file";
  }
}

/** Apply TypeScript defaults to a selectable in-place. */
function applyTsDefaults(selectable: Showable): void {
  const defaults = tsDefaults.get(selectableKey(selectable));
  if (defaults) applyJsonEntry(selectable, defaults);
}

/**
 * Write a ts-defaults marker to IndexedDB for the given key,
 * but only if the latest entry is not already such a marker.
 * Fire-and-forget.
 */
function writeMarkerIfNeeded(key: string): void {
  void (async () => {
    const record = await readHistory(key);
    const entries = record?.entries ?? [];
    const last = entries.at(-1);
    if (last && isMarker(last) && last.kind === "ts-defaults") return;
    entries.push({ timestamp: Date.now(), kind: "ts-defaults" });
    while (entries.length > MAX_HISTORY_ENTRIES) entries.shift();
    // Selecting ts-defaults clears any persisted source pointer.
    await writeHistory(key, entries, undefined);
  })();
}

/**
 * Snapshots the current (TypeScript-defined) schedule state for every
 * selectable in the chapter list into {@link tsDefaults}.
 * Must be called once at page load, before any DB restoration, so the
 * map always reflects the true code-defined starting point.
 */
function captureDefaults(): void {
  tsDefaults.clear();
  const seen = new Set<string>();
  for (const item of chapterList) {
    const sel = item.selectable;
    const key = selectableKey(sel);
    if (seen.has(key)) continue;
    seen.add(key);
    const hasSchedules = !!sel.schedules?.length;
    const hasScalars = !!sel.scalars?.length;
    const hasChildren = Array.isArray(sel.components);
    const hasFixed = !!sel.fixedComponents?.length;
    if (!hasSchedules && !hasScalars && !hasChildren && !hasFixed) continue;
    const entry: DataHistoryEntry = {
      timestamp: 0,
      schedules: hasSchedules ? serializeSchedules(sel.schedules!) : [],
    };
    if (hasScalars) entry.scalars = serializeScalars(sel.scalars!);
    if (hasChildren) entry.components = serializeComponents(sel.components!);
    if (hasFixed) entry.fixedComponents = serializeFixedComponents(sel.fixedComponents!);
    if (sel.userEditableDescription !== undefined)
      entry.userEditableDescription = sel.userEditableDescription;
    tsDefaults.set(key, entry);
  }
}

/**
 * Restores the most recent DB entry for every chapter that has one.
 * Runs once at page load (after {@link captureDefaults}) so that Vite
 * hot-reloads don't wipe out in-progress edits.
 * Refreshes the schedule editor for the currently visible chapter when done.
 */
async function initFromDB(
  unloadBackup?: string | null,
  tsDefaultsBackup?: string | null,
): Promise<void> {
  // Parse the backup map synchronously before any async work, so each per-item
  // promise can apply the backup in the same async round as the DB read.
  type BackupItem = { entry: DataHistoryEntry; selectedTimestamp?: number };
  const backupMap = new Map<string, BackupItem>();
  if (unloadBackup) {
    try {
      const parsed = JSON.parse(unloadBackup) as
        | { key: string; entry: DataHistoryEntry; selectedTimestamp?: number }
        | {
            key: string;
            entry: DataHistoryEntry;
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

  const tsDefaultsSet = new Set<string>();
  if (tsDefaultsBackup) {
    try {
      const parsed = JSON.parse(tsDefaultsBackup) as string[];
      for (const key of parsed) tsDefaultsSet.add(key);
    } catch {
      /* malformed backup — ignore */
    }
  }

  const seen = new Set<string>();
  const restores: Promise<void>[] = [];
  for (const item of chapterList) {
    const sel = item.selectable;
    const key = selectableKey(sel);
    if (seen.has(key)) continue;
    seen.add(key);
    if (
      !sel.schedules?.length &&
      !sel.scalars?.length &&
      !Array.isArray(sel.components) &&
      !sel.fixedComponents?.length
    )
      continue;
    restores.push(
      readHistory(key).then(async (record) => {
        const entries = record?.entries ?? [];
        const last = entries.at(-1);
        const backupItem = backupMap.get(key);
        const backup = backupItem?.entry;
        const useBackup =
          backup !== undefined && backup.timestamp > (last?.timestamp ?? 0);
        const effective = useBackup ? backup : last;

        let source: LoadSource;

        // If this key is linked to the JSON file, check whether there are dirty
        // user edits from the previous session (captured in the unload backup).
        if (record?.sourcePointer?.kind === "json") {
          if (useBackup) {
            // User made edits after the last JSON save — those edits are in the
            // backup but saveScheduleState may not have completed before unload.
            // Apply the backup and clear the source pointer so future startups
            // use IndexedDB.
            applyJsonEntry(sel, backup!);
            source = { kind: "db", timestamp: backup!.timestamp };
            const backupJson = JSON.stringify({
              schedules: backup!.schedules,
              scalars: backup!.scalars,
              components: backup!.components,
              fixedComponents: backup!.fixedComponents,
            });
            const lastJson =
              last && !isMarker(last)
                ? JSON.stringify({
                    schedules: last.schedules,
                    scalars: last.scalars,
                    components: last.components,
                    fixedComponents: last.fixedComponents,
                  })
                : null;
            if (backupJson !== lastJson) {
              entries.push(backup!);
              while (entries.length > MAX_HISTORY_ENTRIES) entries.shift();
            }
            await writeHistory(key, entries, undefined); // clear source pointer
          } else {
            // No dirty edits — let the post-init JSON fetch apply this key.
            source = { kind: "ts-defaults" };
          }
          loadSources.set(key, source);
          loadedSnapshots.set(key, currentSnapshotJson(sel));
          return;
        }

        // If the previous session deliberately selected a specific DB entry
        // (not dirty, not ts-defaults), restore exactly that entry by timestamp.
        const selectedTimestamp = backupItem?.selectedTimestamp;
        if (selectedTimestamp !== undefined) {
          const specificEntry = entries.find(
            (e): e is DataHistoryEntry =>
              !isMarker(e) && e.timestamp === selectedTimestamp,
          );
          if (specificEntry) {
            applyJsonEntry(sel, specificEntry);
            source = { kind: "db", timestamp: selectedTimestamp };
            loadSources.set(key, source);
            loadedSnapshots.set(key, currentSnapshotJson(sel));
            return;
          }
          // Entry not in DB (pruned?) — fall through to normal backup logic
        }

        if (tsDefaultsSet.has(key) && !useBackup) {
          // The previous session explicitly selected "TypeScript defaults" for
          // this key; honour that choice (no data entry from backup to override).
          source = { kind: "ts-defaults-explicit" };
        } else if (!effective) {
          // No DB record at all — true fallback; JSON auto-load may override.
          source = { kind: "ts-defaults" };
        } else if (isMarker(effective) && effective.kind === "ts-defaults") {
          // DB has a ts-defaults marker — user deliberately chose TypeScript defaults.
          source = { kind: "ts-defaults-explicit" };
        } else if (isMarker(effective)) {
          // Unknown/other marker — fall back to TypeScript defaults (JSON may override).
          source = { kind: "ts-defaults" };
        } else {
          // Full data entry: apply it
          applyJsonEntry(sel, effective);
          source = { kind: "db", timestamp: effective.timestamp };

          if (useBackup) {
            // The backup is newer than what's in DB — write it back
            const backupJson = JSON.stringify({
              schedules: backup!.schedules,
              scalars: backup!.scalars,
              components: backup!.components,
              fixedComponents: backup!.fixedComponents,
            });
            const lastJson =
              last && !isMarker(last)
                ? JSON.stringify({
                    schedules: last.schedules,
                    scalars: last.scalars,
                    components: last.components,
                    fixedComponents: last.fixedComponents,
                  })
                : null;
            if (backupJson !== lastJson) {
              entries.push(backup!);
              while (entries.length > MAX_HISTORY_ENTRIES) entries.shift();
              await writeHistory(key, entries, record?.sourcePointer);
            } else if (last && !isMarker(last)) {
              // Same content as the last DB entry — use its timestamp so the
              // history dialog can find it by timestamp.
              source = { kind: "db", timestamp: last.timestamp };
            }
          }
        }
        loadSources.set(key, source);
        loadedSnapshots.set(key, currentSnapshotJson(sel));
      }),
    );
  }
  await Promise.all(restores);

  initFromDBComplete = true;
  canvas.style.visibility = "";
  canvasLoading.style.display = "none";
  const currentSel = chapterList[select.selectedIndex]?.selectable;
  if (currentSel) {
    updateComponentEditor(currentSel);
    updateScheduleEditor(currentSel);
  }
}


function selectableKey(selectable: Showable): string {
  return `${toShowKey}|${selectable.description}`;
}

/** Saves current schedule state to IndexedDB as a full data entry.
 *  Pass force=true (💾 Save button) to bypass the ts-defaults-no-auto-save guard. */
async function saveScheduleState(selectable: Showable, force = false) {
  const hasSchedules = !!selectable.schedules?.length;
  const hasScalars = !!selectable.scalars?.length;
  const hasChildren = Array.isArray(selectable.components);
  const hasFixed = !!selectable.fixedComponents?.length;
  if (!hasSchedules && !hasScalars && !hasChildren && !hasFixed) return;
  const key = selectableKey(selectable);

  // Skip auto-saving when state is clean — content matches what was loaded,
  // so there is nothing new to persist.  (Force=true bypasses this for explicit
  // user saves, which should always write regardless.)
  if (!force && !isDirty(selectable)) return;

  const record = await readHistory(key);
  const entries = record?.entries ?? [];
  const newSchedules = hasSchedules
    ? serializeSchedules(selectable.schedules!)
    : [];
  const newScalars = hasScalars
    ? serializeScalars(selectable.scalars!)
    : undefined;
  const newComponents = hasChildren
    ? serializeComponents(selectable.components!)
    : undefined;
  const newFixed = hasFixed
    ? serializeFixedComponents(selectable.fixedComponents!)
    : undefined;
  const newJson = JSON.stringify({
    schedules: newSchedules,
    scalars: newScalars,
    components: newComponents,
    fixedComponents: newFixed,
  });
  // Skip saving if nothing changed since the last data entry.
  const last = entries.findLast((e) => !isMarker(e)) as
    | DataHistoryEntry
    | undefined;
  if (last) {
    const prevJson = JSON.stringify({
      schedules: last.schedules,
      scalars: last.scalars,
      components: last.components,
      fixedComponents: last.fixedComponents,
    });
    if (prevJson === newJson) return;
  }
  const entry: DataHistoryEntry = {
    timestamp: Date.now(),
    schedules: newSchedules,
  };
  if (newScalars !== undefined) entry.scalars = newScalars;
  if (newComponents !== undefined) entry.components = newComponents;
  if (newFixed !== undefined) entry.fixedComponents = newFixed;
  if (selectable.userEditableDescription !== undefined)
    entry.userEditableDescription = selectable.userEditableDescription;
  entries.push(entry);
  while (entries.length > MAX_HISTORY_ENTRIES) entries.shift();
  // Clear any JSON source pointer — user edits are now in IndexedDB, not the JSON file.
  await writeHistory(key, entries, undefined);

  // Update source tracking and snapshot
  loadSources.set(key, { kind: "db", timestamp: entry.timestamp });
  loadedSnapshots.set(key, newJson);

}

// MARK: Auto-save timer

/** Pending auto-save timer handle, or null if no save is scheduled. */
let _autosaveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Save all currently dirty selectables to IndexedDB.
 * Called by the auto-save timer; never needs to update the status display
 * because the status is computed lazily when the display is next rebuilt.
 */
function _autosaveAllDirty(): void {
  _autosaveTimer = null;
  const seen = new Set<string>();
  for (const item of chapterList) {
    const sel = item.selectable;
    const key = selectableKey(sel);
    if (seen.has(key)) continue;
    seen.add(key);
    if (isDirty(sel)) void saveScheduleState(sel);
  }
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
}

/**
 * Returns the slide-level selectable that should be saved/loaded as a unit.
 * For components slides this is always the slide itself (not the selected child),
 * so a single save captures the full component list and all keyframes.
 */
function currentSaveTarget(): Showable | null {
  const selectable = chapterList[select.selectedIndex]?.selectable;
  if (!selectable) return null;
  if (selectable.components !== undefined) return selectable;
  return selectable.schedules?.length ? selectable : null;
}

function saveOnUnload() {
  // Save every slide that has editable state, not just the currently-visible one.
  const seen = new Set<string>();
  const backups: {
    key: string;
    entry: DataHistoryEntry;
    selectedTimestamp?: number;
  }[] = [];
  const tsDefaultsKeys: string[] = [];

  for (const item of chapterList) {
    const sel = item.selectable;
    const key = selectableKey(sel);
    if (seen.has(key)) continue;
    seen.add(key);

    const hasSchedules = !!sel.schedules?.length;
    const hasScalars = !!sel.scalars?.length;
    const hasChildren = Array.isArray(sel.components);
    const hasFixed = !!sel.fixedComponents?.length;
    if (!hasSchedules && !hasScalars && !hasChildren && !hasFixed) continue;

    // When the history dialog is open, `sel` may contain a transient preview
    // state from `_dialogSelectItem`.  Use the pre-dialog snapshot instead so
    // we never accidentally persist a preview to the DB or sessionStorage.
    if (
      historyDialog.open &&
      _historyTarget !== null &&
      selectableKey(_historyTarget) === key
    ) {
      const preSnap = JSON.parse(_preDialogSnapshotJson) as {
        schedules: SerializedSchedule[];
        scalars?: SerializedScalar[];
        components?: SerializedChild[];
        fixedComponents?: SerializedFixedChild[];
        userEditableDescription?: string;
      };
      const source = _preDialogSource;
      const dirty = _wasInitiallyDirty;

      if (
        (source?.kind === "ts-defaults" || source?.kind === "ts-defaults-explicit") &&
        !dirty
      ) {
        writeMarkerIfNeeded(key);
        tsDefaultsKeys.push(key);
        continue;
      }
      if (source?.kind === "json" && !dirty) {
        // JSON is the source of truth; re-fetched on startup. No backup needed.
        continue;
      }
      const selectedTimestamp =
        source?.kind === "db" && !dirty ? source.timestamp : undefined;
      backups.push({
        key,
        entry: {
          timestamp: Date.now(),
          schedules: preSnap.schedules,
          ...(preSnap.scalars !== undefined && { scalars: preSnap.scalars }),
          ...(preSnap.components !== undefined && {
            components: preSnap.components,
          }),
          ...(preSnap.fixedComponents !== undefined && {
            fixedComponents: preSnap.fixedComponents,
          }),
          ...(preSnap.userEditableDescription !== undefined && {
            userEditableDescription: preSnap.userEditableDescription,
          }),
        },
        ...(selectedTimestamp !== undefined && { selectedTimestamp }),
      });
      // For a dirty pre-dialog state, the backup carries the correct content;
      // initFromDB will write it to DB on the next startup.  Do NOT call
      // saveScheduleState here — sel has preview data, not the dirty pre-dialog data.
      continue;
    }

    const source = loadSources.get(key);
    const dirty = isDirty(sel);

    if (
      (source?.kind === "ts-defaults" || source?.kind === "ts-defaults-explicit") &&
      !dirty
    ) {
      // Remember that the user is on TypeScript defaults, not the last DB save.
      writeMarkerIfNeeded(key);
      tsDefaultsKeys.push(key); // synchronous backup for Vite-reload survival
      continue;
    }

    if (source?.kind === "json" && !dirty) {
      // JSON is the source of truth and will be re-fetched on startup.
      // No sessionStorage backup needed — a stale backup would confuse initFromDB
      // into thinking there are dirty user edits.
      continue;
    }

    // Dirty or loaded from DB — do the normal data save.
    const schedules = hasSchedules ? serializeSchedules(sel.schedules!) : [];
    const scalars = hasScalars ? serializeScalars(sel.scalars!) : undefined;
    const components = hasChildren
      ? serializeComponents(sel.components!)
      : undefined;
    const fixed = hasFixed
      ? serializeFixedComponents(sel.fixedComponents!)
      : undefined;
    // For a clean DB selection (!dirty), remember the specific timestamp the user
    // chose so the next startup can restore that exact entry without creating a
    // spurious new DB record.
    const selectedTimestamp =
      source?.kind === "db" && !dirty ? source.timestamp : undefined;
    backups.push({
      key,
      entry: {
        timestamp: Date.now(),
        schedules,
        ...(scalars !== undefined && { scalars }),
        ...(components !== undefined && { components }),
        ...(fixed !== undefined && { fixedComponents: fixed }),
        ...(sel.userEditableDescription !== undefined && {
          userEditableDescription: sel.userEditableDescription,
        }),
      },
      ...(selectedTimestamp !== undefined && { selectedTimestamp }),
    });
    // Only write to DB when there are actual uncommitted changes.
    // Clean selections (dirty=false) don't need a new DB entry — the selected
    // entry already exists in the history.
    if (dirty) {
      void saveScheduleState(sel);
    }
  }

  if (backups.length > 0) {
    sessionStorage.setItem("pendingScheduleSave", JSON.stringify(backups));
  }
  if (tsDefaultsKeys.length > 0) {
    sessionStorage.setItem("pendingTsDefaults", JSON.stringify(tsDefaultsKeys));
  }
}
window.addEventListener("beforeunload", saveOnUnload);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveOnUnload();
});

// MARK: History dialog

/** Describes a single item in the history dialog's list. */
type DialogListItem =
  | { kind: "current-unsaved"; snapshotJson: string }
  | { kind: "ts-defaults" }
  | { kind: "json-entry"; entry: JsonFileEntry }
  | {
      kind: "db-entry";
      entry: DataHistoryEntry;
      entryIndex: number;
      isInitial: boolean;
    };

let _historyTarget: Showable | null = null;
let _preDialogSnapshotJson = "";
let _preDialogSource: LoadSource | undefined;
let _wasInitiallyDirty = false;
let _dialogItems: DialogListItem[] = [];
let _selectedDialogIndex = -1;
let _allHistoryEntries: HistoryEntry[] = [];
/** Source pointer read from DB when the dialog opened — preserved on delete. */
let _dialogSourcePointer: HistoryRecord["sourcePointer"];
/** JSON snapshot fetched when the dialog opened, keyed by selectableKey. */
let _dialogJsonData: Record<string, JsonFileEntry> | undefined;

function _dialogSelectItem(index: number, target: Showable) {
  if (index < 0 || index >= _dialogItems.length) return;
  _selectedDialogIndex = index;

  // Highlight in list
  for (let i = 0; i < historyList.children.length; i++) {
    historyList.children[i].classList.toggle("selected", i === index);
  }

  const item = _dialogItems[index];
  const isInitial =
    item.kind === "current-unsaved" ||
    (item.kind === "ts-defaults" &&
      (_preDialogSource?.kind === "ts-defaults" ||
        _preDialogSource?.kind === "ts-defaults-explicit")) ||
    (item.kind === "json-entry" && _preDialogSource?.kind === "json") ||
    (item.kind === "db-entry" && item.isInitial);
  const isDeletable = item.kind === "db-entry" && !item.isInitial;
  historyDeleteBtn.disabled = !isDeletable;

  // Preview the selected state
  if (item.kind === "current-unsaved") {
    // Revert to the unsaved state captured when the dialog opened
    applyJsonEntry(target, JSON.parse(_preDialogSnapshotJson) as JsonFileEntry);
  } else if (item.kind === "ts-defaults") {
    applyTsDefaults(target);
  } else if (item.kind === "json-entry") {
    applyJsonEntry(target, item.entry);
  } else {
    applyJsonEntry(target, item.entry);
  }
  selectedSlideChild = null;
  activeRootComponentEditor?.resetAll();
  updateComponentEditor(target);
  updateScheduleEditor(target);

  // Show/hide OK vs Switch-and-Abandon/Switch-and-Save
  const isOriginal =
    index ===
    (_wasInitiallyDirty
      ? 0
      : _dialogItems.findIndex(
          (it) =>
            (it.kind === "ts-defaults" &&
              (_preDialogSource?.kind === "ts-defaults" ||
                _preDialogSource?.kind === "ts-defaults-explicit")) ||
            (it.kind === "json-entry" && _preDialogSource?.kind === "json") ||
            (it.kind === "db-entry" && it.isInitial),
        ));
  if (_wasInitiallyDirty && !isOriginal) {
    historyOkBtn.hidden = true;
    historyAbandonBtn.hidden = false;
    historySaveBtn.hidden = false;
  } else {
    historyOkBtn.hidden = false;
    historyAbandonBtn.hidden = true;
    historySaveBtn.hidden = true;
  }
}

/**
 * Rebuilds _dialogItems and the list DOM from _allHistoryEntries, then
 * selects the item at selectIndex (clamped to list bounds).
 * Does NOT touch _wasInitiallyDirty / _preDialogSnapshotJson / _preDialogSource
 * so it is safe to call after deletion without corrupting the dirty-state logic.
 */
function _rebuildDialogList(target: Showable, selectIndex?: number): void {
  const key = selectableKey(target);
  _dialogItems = [];
  if (_wasInitiallyDirty) {
    _dialogItems.push({
      kind: "current-unsaved",
      snapshotJson: _preDialogSnapshotJson,
    });
  }
  // JSON file entry (if available)
  const jsonEntry = _dialogJsonData?.[key];
  if (jsonEntry) {
    _dialogItems.push({ kind: "json-entry", entry: jsonEntry });
  }
  const initialTimestamp =
    _preDialogSource?.kind === "db" ? _preDialogSource.timestamp : -1;
  const dataEntries: { entry: DataHistoryEntry; entryIndex: number }[] = [];
  for (let i = 0; i < _allHistoryEntries.length; i++) {
    const e = _allHistoryEntries[i];
    if (!isMarker(e)) dataEntries.push({ entry: e, entryIndex: i });
  }
  for (let i = dataEntries.length - 1; i >= 0; i--) {
    const { entry, entryIndex } = dataEntries[i];
    _dialogItems.push({
      kind: "db-entry",
      entry,
      entryIndex,
      isInitial: entry.timestamp === initialTimestamp,
    });
  }
  _dialogItems.push({ kind: "ts-defaults" });

  historyList.replaceChildren();
  for (let i = 0; i < _dialogItems.length; i++) {
    const item = _dialogItems[i];
    const li = document.createElement("li");
    li.style.cssText =
      "padding:0.35em 0.6em;cursor:pointer;border-bottom:1px solid #eee";
    let label = "";
    if (item.kind === "current-unsaved") {
      label = "★ Current (unsaved changes)";
    } else if (item.kind === "json-entry") {
      label = `📄 ${toShowKey}.json`;
      if (_preDialogSource?.kind === "json") label += " ← initial load";
    } else if (item.kind === "ts-defaults") {
      label = "TypeScript defaults";
      if (
        _preDialogSource?.kind === "ts-defaults" ||
        _preDialogSource?.kind === "ts-defaults-explicit"
      )
        label += " ← initial load";
    } else {
      label = new Date(item.entry.timestamp).toLocaleString();
      if (item.isInitial) label += " ← initial load";
    }
    li.textContent = label;
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
    ? "You have unsaved changes. Switching will apply the selected state."
    : `Loaded from: ${formatLoadSource(_preDialogSource)}`;

  const idx =
    selectIndex !== undefined
      ? Math.min(Math.max(0, selectIndex), _dialogItems.length - 1)
      : _wasInitiallyDirty
        ? 0
        : _dialogItems.findIndex(
            (it) =>
              (it.kind === "ts-defaults" &&
                (_preDialogSource?.kind === "ts-defaults" ||
                  _preDialogSource?.kind === "ts-defaults-explicit")) ||
              (it.kind === "json-entry" && _preDialogSource?.kind === "json") ||
              (it.kind === "db-entry" && it.isInitial),
          );
  _dialogSelectItem(Math.max(0, idx), target);
}

async function openHistoryDialog(target: Showable) {
  _historyTarget = target;
  const key = selectableKey(target);
  _preDialogSnapshotJson = currentSnapshotJson(target);
  _preDialogSource = loadSources.get(key);
  _wasInitiallyDirty = isDirty(target);

  const [record, jsonResult] = await Promise.all([
    readHistory(key),
    fetchJsonSnapshot(),
  ]);
  _allHistoryEntries = record?.entries ?? [];
  _dialogSourcePointer = record?.sourcePointer;
  _dialogJsonData = jsonResult.ok ? jsonResult.data : undefined;

  _rebuildDialogList(target);

  historyDialog.showModal();
  historyList.focus();
}

/** Apply the currently selected dialog item and update source tracking. */
async function _applyDialogSelection(saveOld: boolean) {
  const target = _historyTarget;
  if (!target) return;
  const key = selectableKey(target);
  const item = _dialogItems[_selectedDialogIndex];
  if (!item) return;

  if (saveOld && _wasInitiallyDirty) {
    // Temporarily restore the old state to save it, then re-apply selection
    applyJsonEntry(target, JSON.parse(_preDialogSnapshotJson) as JsonFileEntry);
    await saveScheduleState(target, true);
    // Re-apply the selected item
    if (item.kind === "ts-defaults") applyTsDefaults(target);
    else if (item.kind === "db-entry" || item.kind === "json-entry")
      applyJsonEntry(target, item.entry);
    // "current-unsaved" is already applied (it IS the old state we just saved)
  }

  // Update source tracking
  if (item.kind === "ts-defaults") {
    loadSources.set(key, { kind: "ts-defaults-explicit" });
    loadedSnapshots.set(key, currentSnapshotJson(target));
    writeMarkerIfNeeded(key); // also clears sourcePointer
  } else if (item.kind === "db-entry") {
    loadSources.set(key, { kind: "db", timestamp: item.entry.timestamp });
    loadedSnapshots.set(key, currentSnapshotJson(target));
    // Explicit DB selection clears any JSON source pointer.
    void persistSourcePointer(key, undefined);
  } else if (item.kind === "json-entry") {
    const filename = `${toShowKey}.json`;
    loadSources.set(key, { kind: "json", filename });
    loadedSnapshots.set(key, currentSnapshotJson(target));
    void persistSourcePointer(key, { kind: "json", filename });
  } else if (item.kind === "current-unsaved") {
    // State is already "current"; source stays what it was but snapshot updates
    // (no change to loadSources — the unsaved state was already dirty vs the load source)
    // After choosing "current unsaved" as a deliberate selection, nothing changes.
  }

  selectedSlideChild = null;
  activeRootComponentEditor?.resetAll();
  updateComponentEditor(target);
  updateScheduleEditor(target);
}

historyOkBtn.addEventListener("click", () => {
  void _applyDialogSelection(false);
  historyDialog.close();
});
historyAbandonBtn.addEventListener("click", () => {
  sendToRecycleBin(
    "abandoned",
    _preDialogSnapshotJson,
    `from ${formatLoadSource(_preDialogSource)}`,
  );
  void _applyDialogSelection(false);
  historyDialog.close();
});
historySaveBtn.addEventListener("click", () => {
  void _applyDialogSelection(true);
  historyDialog.close();
});
historyCancelBtn.addEventListener("click", () => {
  // Revert to the state before the dialog opened
  const target = _historyTarget;
  if (target) {
    applyJsonEntry(target, JSON.parse(_preDialogSnapshotJson) as JsonFileEntry);
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
  if (!item || item.kind !== "db-entry" || item.isInitial) return;
  const key = selectableKey(target);
  sendToRecycleBin("deleted", item.entry);
  _allHistoryEntries.splice(item.entryIndex, 1);
  await writeHistory(key, _allHistoryEntries, _dialogSourcePointer);
  // Rebuild list without re-computing _wasInitiallyDirty — the current
  // component state may have been altered by previewing, so calling
  // openHistoryDialog here would incorrectly flag the session as dirty.
  _rebuildDialogList(target, _selectedDialogIndex);
});

openHistoryDialogBtn.addEventListener("click", () => {
  const target = currentSaveTarget();
  if (target) void openHistoryDialog(target);
});

// Any edit in the schedule editor kicks the auto-save timer.
scheduleEditorFieldset.addEventListener("input", () => { markDirty(); });
scheduleEditorFieldset.addEventListener("change", () => { markDirty(); });

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
      row.insertCell().append(
        buildNumericInput(numKf.value, (n) => {
          numKf.value = n;
        }),
      );
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
        (n) => { arKf.value = { ...arKf.value, flat: { ...arKf.value.flat, x: n } }; },
      );
      fieldInputs["fy"] = makeInput(
        () => arKf.value.flat.y,
        (n) => { arKf.value = { ...arKf.value, flat: { ...arKf.value.flat, y: n } }; },
      );
      fieldInputs["px"] = makeInput(
        () => arKf.value.pointy.x,
        (n) => { arKf.value = { ...arKf.value, pointy: { ...arKf.value.pointy, x: n } }; },
      );
      fieldInputs["py"] = makeInput(
        () => arKf.value.pointy.y,
        (n) => { arKf.value = { ...arKf.value, pointy: { ...arKf.value.pointy, y: n } }; },
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

function serializeComponent(child: Showable): SerializedChild {
  const entry: SerializedChild = {
    registryKey: child.registryKey ?? "",
    schedules: child.schedules?.length
      ? serializeSchedules(child.schedules)
      : [],
  };
  if (child.scalars?.length) {
    entry.scalars = serializeScalars(child.scalars);
  }
  if (child.components !== undefined) {
    entry.components = serializeComponents(child.components);
  }
  if (child.userEditableDescription !== undefined) {
    entry.userEditableDescription = child.userEditableDescription;
  }
  return entry;
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
  target.components!.push(...built);
  selectedSlideChild = built[built.length - 1];
  activeRootComponentEditor?.resetAll();
  updateComponentEditor(selectable);
  updateScheduleEditor(selectedSlideChild);
}

function updateComponentEditor(selectable: Showable) {
  const rootComponents = selectable.components;
  const rootFixed = selectable.fixedComponents;
  const shouldHide =
    rootComponents === undefined &&
    !(rootFixed && rootFixed.length > 0) &&
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

  const oldToolbar = componentsEditorFieldset.querySelector(
    ".components-toolbar",
  );
  const savedAddSelectValue =
    (oldToolbar?.querySelector("select") as HTMLSelectElement | null)?.value ??
    "";

  componentsEditorFieldset.replaceChildren();

  const list = document.createElement("div");
  list.className = "components-list";
  list.style.cssText = "display:flex;flex-direction:column;gap:0.25em";

  if (activeRootComponentEditorElement) {
    list.append(activeRootComponentEditorElement);
  }

  function renderComponentTree(container: Showable, depth: number) {
    const siblings = container.components ?? [];
    for (let idx = 0; idx < siblings.length; idx++) {
      const child = siblings[idx];
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
      });

      function moveChild(fromIdx: number, toIdx: number) {
        const arr = container.components!;
        const [item] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, item);
        activeRootComponentEditor?.resetAll();
        updateComponentEditor(selectable);
      }

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
      downBtn.disabled = idx === siblings.length - 1;
      downBtn.addEventListener("click", () => moveChild(idx, idx + 1));

      const bottomBtn = document.createElement("button");
      bottomBtn.type = "button";
      bottomBtn.textContent = "⤓";
      bottomBtn.title = "Move to bottom";
      bottomBtn.disabled = idx === siblings.length - 1;
      bottomBtn.addEventListener("click", () =>
        moveChild(idx, container.components!.length - 1),
      );

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.textContent = "🖥️ → 📋";
      copyBtn.title = "Copy component";
      copyBtn.addEventListener("click", () => {
        const json = JSON.stringify([serializeComponent(child)], null, 2);
        navigator.clipboard
          .writeText(json)
          .catch(() => alert("Could not write to clipboard."));
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.textContent = "🗑";
      deleteBtn.addEventListener("click", () => {
        const arr = container.components!;
        const i = arr.indexOf(child);
        if (i !== -1) arr.splice(i, 1);
        if (selectedSlideChild === child) {
          selectedSlideChild = null;
          updateScheduleEditor(selectable);
        }
        activeRootComponentEditor?.resetAll();
        updateComponentEditor(selectable);
      });

      row.append(
        editBtn,
        topBtn,
        upBtn,
        downBtn,
        bottomBtn,
        copyBtn,
        deleteBtn,
      );

      if (child.components !== undefined) {
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

      if (
        child.components !== undefined ||
        (child.fixedComponents?.length ?? 0) > 0
      ) {
        renderComponentTree(child, depth + 1);
      }
    }

    for (const child of container.fixedComponents ?? []) {
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
      });

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.textContent = "🖥️ → 📋";
      copyBtn.title = "Copy component";
      copyBtn.addEventListener("click", () => {
        const json = JSON.stringify([serializeComponent(child)], null, 2);
        navigator.clipboard
          .writeText(json)
          .catch(() => alert("Could not write to clipboard."));
      });

      row.append(editBtn, copyBtn);

      if (child.components !== undefined) {
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

      if (
        child.components !== undefined ||
        (child.fixedComponents?.length ?? 0) > 0
      ) {
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
    const json = JSON.stringify(serializeComponents(rootComponents!), null, 2);
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
  if (rootComponents !== undefined) rootRow.append(rootCopyBtn, rootPasteBtn);
  list.append(rootRow);

  renderComponentTree(selectable as Showable, 0);
  componentsEditorFieldset.append(list);

  // Toolbar: add select + add button.
  // addTarget: where the new component goes (null = add button disabled).
  const addTarget: Showable | null =
    selectedSlideChild === null
      ? rootComponents !== undefined
        ? (selectable as Showable)
        : null
      : selectedSlideChild.components !== undefined
        ? selectedSlideChild
        : null;

  const toolbar = document.createElement("div");
  toolbar.className = "components-toolbar";
  toolbar.style.cssText =
    "display:flex;align-items:center;gap:0.4em;flex-wrap:wrap";

  const addSelect = addName(document.createElement("select"));
  for (const [key] of componentRegistry) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    addSelect.append(opt);
  }
  if (
    savedAddSelectValue &&
    [...addSelect.options].some((o) => o.value === savedAddSelectValue)
  ) {
    addSelect.value = savedAddSelectValue;
  }

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent =
    addTarget !== null ? `+ Add to "${addTarget.description}"` : "+ Add";
  addBtn.disabled = addTarget === null;
  addBtn.addEventListener("click", () => {
    if (!addTarget) return;
    const factory = componentRegistry.get(addSelect.value);
    if (!factory) return;
    const newChild = factory();
    addTarget.components!.push(newChild);
    selectedSlideChild = newChild;
    activeRootComponentEditor?.resetAll();
    updateComponentEditor(selectable);
    updateScheduleEditor(newChild);
  });

  toolbar.append(addSelect, addBtn);
  componentsEditorFieldset.append(toolbar);
  // Restore scroll now that both list and toolbar are in the DOM, so
  // list.clientHeight reflects its final height and browser clamping is correct.
  list.scrollTop = wasAtBottom ? list.scrollHeight : savedScrollTop;
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
  editingPointKf = null;
  viewingPointKfs.clear();
  pointSyncCallbacks.clear();
  draggingPoint = null;
  editingArrowKf = null;
  viewingArrowKfs.clear();
  arrowSyncCallbacks.clear();
  draggingArrow = null;
  draggingArrowMouseLocal = null;
  draggingArrowConstraint = "none";
  goToButtonUpdaters.length = 0;
  // History is always saved/loaded at the slide level, even when the schedule
  // editor is open on an individual child component.
  const saveTarget = currentSaveTarget();
  scheduleHistoryControls.hidden = !saveTarget;
  const scalars = selectable.scalars;
  const schedules = selectable.schedules;
  const isTraditionalText = selectable instanceof TraditionalTextComponent;
  const slideComponent =
    selectable instanceof SlideComponent ? selectable : null;

  if (
    !scalars?.length &&
    !schedules?.length &&
    !isTraditionalText &&
    !slideComponent
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
    scheduleEditorFieldset.append(section);
  }
  for (const info of schedules ?? []) {
    const section = buildScheduleSection(info, selectable);
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

function drawScheduleMarkers(ctx: CanvasRenderingContext2D) {
  if (
    !editingRectKf &&
    viewingRectKfs.size === 0 &&
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
    const f = relTf ? localToLogical(kf.value.flat.x, kf.value.flat.y, relTf) : kf.value.flat;
    const p = relTf ? localToLogical(kf.value.pointy.x, kf.value.pointy.y, relTf) : kf.value.pointy;
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
    const f = relTf ? localToLogical(kf.value.flat.x, kf.value.flat.y, relTf) : kf.value.flat;
    const p = relTf ? localToLogical(kf.value.pointy.x, kf.value.pointy.y, relTf) : kf.value.pointy;
    const c = { x: (f.x + p.x) / 2, y: (f.y + p.y) / 2 };

    // Constraint guides while dragging a non-center handle
    if (draggingArrow && draggingArrowMouseLocal && draggingArrow.handle !== "center" && draggingArrow.kf === kf) {
      const isFlat = draggingArrow.handle === "flat";
      const movingLocal = isFlat ? draggingArrow.startFlat : draggingArrow.startPointy;
      const fixedLocal = isFlat ? draggingArrow.startPointy : draggingArrow.startFlat;
      const fixedLog = relTf ? localToLogical(fixedLocal.x, fixedLocal.y, relTf) : fixedLocal;
      const mouseLog = relTf
        ? localToLogical(draggingArrowMouseLocal.x, draggingArrowMouseLocal.y, relTf)
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
          const t = (draggingArrowMouseLocal.x - fixedLocal.x) * ux + (draggingArrowMouseLocal.y - fixedLocal.y) * uy;
          const projLocal = { x: fixedLocal.x + t * ux, y: fixedLocal.y + t * uy };
          const projLog = relTf ? localToLogical(projLocal.x, projLocal.y, relTf) : projLocal;
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
        const movingLog = relTf ? localToLogical(movingLocal.x, movingLocal.y, relTf) : movingLocal;
        const r = Math.hypot(movingLog.x - fixedLog.x, movingLog.y - fixedLog.y);
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
    for (const [handle, pt] of [["flat", f], ["center", c], ["pointy", p]] as [ArrowHandle, { x: number; y: number }][]) {
      const isActive = isDraggingThis && draggingArrow!.handle === handle;
      // Endpoint is hollow when it's the one being moved (directly or via center drag).
      const isEndpoint = handle === "flat" || handle === "pointy";
      const hollow = isEndpoint && isDraggingThis &&
        (draggingArrow!.handle === handle || draggingArrow!.handle === "center");
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
}

function hitTestArrowMarker(logX: number, logY: number): { kf: ArrowKf; handle: ArrowHandle } | null {
  if (!editingArrowKf) return null;
  const relTf = getMarkerRelTf();
  const local = relTf ? logicalToLocal(logX, logY, relTf) : { x: logX, y: logY };
  const { flat, pointy } = editingArrowKf.value;
  const center = { x: (flat.x + pointy.x) / 2, y: (flat.y + pointy.y) / 2 };
  const HIT = 0.35;
  for (const [handle, pt] of [["flat", flat], ["pointy", pointy], ["center", center]] as [ArrowHandle, { x: number; y: number }][]) {
    const dx = local.x - pt.x;
    const dy = local.y - pt.y;
    if (dx * dx + dy * dy <= HIT * HIT) return { kf: editingArrowKf, handle };
  }
  return null;
}

function applyArrowDrag(localX: number, localY: number, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
  if (!draggingArrow) return;
  const { kf, handle, startFlat, startPointy, startLocalX, startLocalY } = draggingArrow;
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
      const r = Math.hypot(movingStart.x - fixedPt.x, movingStart.y - fixedPt.y);
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

function applyMarkerDrag(localX: number, localY: number, shiftKey = false) {
  if (!draggingMarker) return;
  const { kf, handle, startLocalX, startLocalY, startRect } = draggingMarker;
  const dx = localX - startLocalX;
  const dy = localY - startLocalY;
  let newRect: ReadOnlyRect;

  if (shiftKey && handle !== "center" && startRect.height !== 0) {
    // Aspect-ratio lock: keep the opposite (anchor) corner fixed and constrain
    // the drag vector so width/height = startRect.width/startRect.height.
    const ar = startRect.width / startRect.height;
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
  kf.value = normalizeRect(newRect);
  markerSyncCallbacks.get(kf)?.(kf.value);
}

// MARK: Load previous state.
{
  // Read the unload backups BEFORE sessionStorage.clear() wipes them below.
  const unloadBackup = sessionStorage.getItem("pendingScheduleSave");
  const tsDefaultsBackup = sessionStorage.getItem("pendingTsDefaults");
  // Hide the canvas until DB restoration is complete to prevent the TypeScript-
  // default state from flashing briefly before the saved state is applied.
  canvas.style.visibility = "hidden";
  // Capture TypeScript defaults before any DB restoration, so they're available
  // as the "reset" option in the history select throughout this session.
  captureDefaults();
  // Fetch the JSON file in parallel with DB init so startup latency stays low.
  const startupJsonFetch = fetchJsonSnapshot();
  // Restore the most recent DB entry for every chapter — keeps edits alive
  // across Vite hot-reloads without the user having to manually click Load.
  void initFromDB(unloadBackup, tsDefaultsBackup).then(async () => {
    // After DB init: apply JSON as medium-priority fallback for any key that
    // still has ts-defaults (i.e. nothing was in the DB for that key).
    const jsonResult = await startupJsonFetch;
    if (jsonResult.ok) {
      applyJsonSnapshot(jsonResult.data, true, false);
      _jsonFetchFailReason = undefined;
      _lastKnownJsonBody = JSON.stringify(jsonResult.data, null, 2);
    } else {
      _jsonFetchFailReason = jsonResult.reason;
    }
    updateJsonSaveStatus();
  });

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
  if (draggingMarker || draggingPoint || draggingArrow) markDirty();
  draggingMarker = null;
  draggingPoint = null;
  draggingArrow = null;
  draggingArrowMouseLocal = null;
  draggingArrowConstraint = "none";
});
canvas.addEventListener("pointercancel", () => {
  isDragging = false;
  draggingMarker = null;
  draggingPoint = null;
  draggingArrow = null;
  draggingArrowMouseLocal = null;
  draggingArrowConstraint = "none";
});

// Arrow drag keyboard handling (document-level so focus doesn't matter).
function refreshArrowConstraint(e: KeyboardEvent) {
  if (!draggingArrow || !draggingArrowMouseLocal) return;
  draggingArrowConstraint = e.shiftKey ? "axial"
    : e.ctrlKey || e.metaKey ? "radial"
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

getById("dumpDbBtn", HTMLButtonElement).addEventListener("click", async () => {
  const records = await readAllHistory();
  const pre = getById("dbDump", HTMLPreElement);
  if (records.length === 0) {
    pre.textContent = "(database is empty)";
    return;
  }
  const lines: string[] = [];
  for (const record of records) {
    lines.push(`=== ${record.selectableKey} ===`);
    const latest = record.entries.at(-1);
    if (latest) {
      lines.push(JSON.stringify(latest, null, 2));
    }
    lines.push("");
  }
  pre.textContent = lines.join("\n");
});

// MARK: Save JSON file


/** Serialize the current in-memory state to a `Record<key, JsonFileEntry>`. */
function buildJsonSnapshot(): Record<string, JsonFileEntry> {
  const result: Record<string, JsonFileEntry> = {};
  const seen = new Set<string>();

  for (const item of chapterList) {
    const sel = item.selectable;
    const key = selectableKey(sel);
    if (seen.has(key)) continue;
    seen.add(key);

    const hasSchedules = !!sel.schedules?.length;
    const hasScalars = !!sel.scalars?.length;
    const hasChildren = Array.isArray(sel.components);
    const hasFixed = !!sel.fixedComponents?.length;
    if (!hasSchedules && !hasScalars && !hasChildren && !hasFixed) continue;

    const entry: JsonFileEntry = {};
    if (hasSchedules) entry.schedules = serializeSchedules(sel.schedules!);
    if (hasScalars) entry.scalars = serializeScalars(sel.scalars!);
    if (hasChildren) entry.components = serializeComponents(sel.components!);
    if (hasFixed) entry.fixedComponents = serializeFixedComponents(sel.fixedComponents!);
    if (sel.userEditableDescription !== undefined)
      entry.userEditableDescription = sel.userEditableDescription;
    result[key] = entry;
  }
  return result;
}

/**
 * @param link - when true, writes a source pointer for every saved key so that
 *   the next startup loads from JSON instead of IndexedDB.
 */
async function saveToJsonFile(link: boolean): Promise<void> {
  const snapshot = buildJsonSnapshot();
  const body = JSON.stringify(snapshot, null, 2);

  let fileHandle: FileSystemFileHandle;
  try {
    fileHandle = await window.showSaveFilePicker({
      id: "json-state",
      suggestedName: `${toShowKey}.json`,
      types: [
        { description: "JSON", accept: { "application/json": [".json"] } },
      ],
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    throw e;
  }

  const writable = await fileHandle.createWritable();
  await writable.write(body);
  await writable.close();

  // Verify: fetch the file through the dev server to confirm it landed in the
  // right place (under public/saved_state/, reachable via HTTP).
  const verifyResult = await fetchJsonSnapshot();
  if (!verifyResult.ok) {
    const hint =
      verifyResult.reason === "not-found"
        ? "File not found at the expected URL — did you save outside public/saved_state/?"
        : verifyResult.reason === "parse-error"
          ? "File saved but could not be re-parsed — the file may be corrupted."
          : "Dev server unreachable — start the Vite dev server and try again.";
    alert(
      `Save succeeded but verification failed.\n\n${hint}\n\nExpected URL: ./saved_state/${toShowKey}.json`,
    );
    _jsonFetchFailReason = verifyResult.reason;
    _lastKnownJsonBody = undefined;
  } else {
    const readBack = JSON.stringify(verifyResult.data, null, 2);
    if (readBack.length !== body.length) {
      alert(
        "Save warning: the file on disk does not match what was written.\n" +
          `Written: ${body.length} chars, read back: ${readBack.length} chars.`,
      );
    }
    _jsonFetchFailReason = undefined;
    _lastKnownJsonBody = body;

    if (link) {
      const filename = `${toShowKey}.json`;
      const pointer: HistoryRecord["sourcePointer"] = { kind: "json", filename };
      // Update in-memory source tracking immediately so status reflects the link
      // and saveOnUnload skips these keys (source="json", dirty=false).
      const seen = new Set<string>();
      for (const item of chapterList) {
        const sel = item.selectable;
        const key = selectableKey(sel);
        if (seen.has(key)) continue;
        seen.add(key);
        if (!snapshot[key]) continue;
        loadSources.set(key, { kind: "json", filename });
        loadedSnapshots.set(key, currentSnapshotJson(sel));
        void persistSourcePointer(key, pointer);
      }
    }
  }
  updateJsonSaveStatus();
}

getById("saveJsonLinkBtn", HTMLButtonElement).addEventListener(
  "click",
  () => void saveToJsonFile(true),
);
getById("saveJsonOnlyBtn", HTMLButtonElement).addEventListener(
  "click",
  () => void saveToJsonFile(false),
);

// MARK: Load JSON file

type FetchJsonResult =
  | { ok: true; data: Record<string, JsonFileEntry> }
  | { ok: false; reason: "not-found" | "parse-error" | "network-error" };

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
    const data = (await response.json()) as Record<string, JsonFileEntry>;
    return { ok: true, data };
  } catch {
    return { ok: false, reason: "parse-error" };
  }
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
  snapshot: Record<string, JsonFileEntry>,
  onlyIfNoDb = false,
  persist = false,
): void {
  const seen = new Set<string>();
  for (const item of chapterList) {
    const sel = item.selectable;
    const key = selectableKey(sel);
    if (seen.has(key)) continue;
    seen.add(key);

    const entry = snapshot[key];
    if (!entry) continue;

    if (onlyIfNoDb) {
      const src = loadSources.get(key);
      if (src?.kind === "db" || src?.kind === "ts-defaults-explicit") continue;
    }

    applyJsonEntry(sel, entry);
    loadSources.set(key, { kind: "json", filename: `${toShowKey}.json` });
    loadedSnapshots.set(key, currentSnapshotJson(sel));

    // Write to IndexedDB so this state survives a Vite hot-reload.
    if (persist) void saveScheduleState(sel, true);
  }

  // Refresh the schedule editor to reflect the newly loaded state.
  const current = currentSaveTarget();
  if (current) {
    selectedSlideChild = null;
    activeRootComponentEditor?.resetAll();
    updateComponentEditor(current);
    updateScheduleEditor(current);
  }
}

async function loadFromJsonFile(): Promise<void> {
  const result = await fetchJsonSnapshot();
  if (!result.ok) {
    const details =
      result.reason === "not-found"
        ? "File not found (404). Save it first, or check the file name."
        : result.reason === "parse-error"
          ? "File is corrupted or not valid JSON. Fix or re-save it."
          : "Could not reach the server. Check that the Vite dev server is running.";
    alert(`Could not load ./saved_state/${toShowKey}.json\n\n${details}`);
    _jsonFetchFailReason = result.reason;
    updateJsonSaveStatus();
    return;
  }
  applyJsonSnapshot(result.data, false, true);
  _jsonFetchFailReason = undefined;
  _lastKnownJsonBody = JSON.stringify(result.data, null, 2);
  updateJsonSaveStatus();
}

getById("loadJsonTestBtn", HTMLButtonElement).addEventListener(
  "click",
  () => void loadFromJsonFile(),
);

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
