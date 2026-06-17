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
  applyScalarSnapshot,
  applySnapshot,
  ScalarInfo,
  Selectable,
  SerializedKf,
  SerializedScalar,
  SerializedSchedule,
  Showable,
} from "../src/showable.ts";
import {
  discreteKeyframes,
  ease,
  easeIn,
  easeOut,
  interpolateColors,
  interpolateNumbers,
  interpolatePoints,
  interpolateRects,
  Keyframe,
} from "../src/interpolate.ts";
import { downloadBlob } from "../src/utility.ts";
import { myRainbow, myRainbowInfo } from "../src/glib/my-rainbow.ts";
import { AudioBuilder } from "./audio-builder.ts";
import {
  buildComponents,
  componentRegistry,
  fontsAreAvailable,
  SerializedChild,
  SlideComponent,
  TraditionalTextComponent,
  TRANSFORM_PLACEHOLDERS,
} from "../src/slide-components.ts";
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
  canvasCSSW: number,
  canvasCSSH: number,
  px: number,
  py: number,
): [number, number] {
  const vpW = viewport.clientWidth;
  const vpH = viewport.clientHeight;
  if (canvasCSSW <= vpW) {
    return [
      Math.round((vpW - canvasCSSW) / 2),
      Math.round((vpH - canvasCSSH) / 2),
    ];
  }
  return [
    Math.max(vpW - canvasCSSW, Math.min(0, px)),
    Math.max(vpH - canvasCSSH, Math.min(0, py)),
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
    toShow.show({ timeInMs, context, globalTime: timeInMs, quality: "High Quality" });
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

  async function doIt(item: Selectable, offset: number): Promise<boolean> {
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
  debug.forEach((item) => {
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
    const info = debug[select.selectedIndex];
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
type SelectableTree = {
  description: string;
  prefix: string;
  start: number;
  end: number;
  parent: SelectableTree | undefined;
  children: SelectableTree[];
  absolutePosition: number;
  siblingPosition: number;
  selectable: Selectable;
};

/**
 * The list of sections that you can display.
 *
 * "Debug" because this is not part of the video.
 * This is used in the editor to help you create the video.
 */
const debug = new Array<SelectableTree>();
/**
 * Initialize the `debug` list with all the sections of the video.
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
  current: Selectable,
  prefix = "",
  start = 0,
  limit = Infinity,
  descriptionPrefix = "",
  parent?: SelectableTree,
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
    const info: SelectableTree = {
      prefix,
      description: descriptionPrefix + current.description,
      start,
      end,
      parent,
      children: [],
      absolutePosition: debug.length,
      siblingPosition: parent ? parent.children.length : NaN,
      selectable: current,
    };
    if (parent) {
      parent.children.push(info);
    }
    debug.push(info);
    interestingChildren.forEach((next) => {
      const absoluteStart = start + next.start;
      dump(next.child, FIGURE_SPACE + prefix, absoluteStart, end, "", info);
    });
  }
}
const select = getById("chapterSelector", HTMLSelectElement);

function initChapters(): void {
  const savedDescription = debug[select.selectedIndex]?.description;
  debug.length = 0;
  dump(toShow);
  select.replaceChildren();
  debug.forEach((value) => {
    const option = document.createElement("option");
    option.textContent = value.prefix + value.description;
    option.value = value.description;
    select.append(option);
  });
  const restoredIndex =
    savedDescription !== undefined
      ? debug.findIndex((d) => d.description === savedDescription)
      : -1;
  select.selectedIndex = restoredIndex >= 0 ? restoredIndex : 0;
}

initChapters();
//console.table(debug);

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
  SelectableTree | undefined
>();

/**
 * Fill in the table that shows information about a handful or relevant sections.
 * @param cells The row to update
 * @param info Describes the relevant section.
 */
function updateRow(
  cells: readonly HTMLTableCellElement[],
  info: SelectableTree | undefined,
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
const scheduleHistoryControls = getById("scheduleHistoryControls", HTMLElement);
const saveScheduleNowBtn = getById("saveScheduleNowBtn", HTMLButtonElement);
const scheduleHistorySelect = getById(
  "scheduleHistorySelect",
  HTMLSelectElement,
);
const loadScheduleBtn = getById("loadScheduleBtn", HTMLButtonElement);

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

// MARK: Component Editor

/** Maps dynamically-added component instances back to their registry key for serialization. */
const componentRegistryKey = new WeakMap<Showable, string>();

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
  const info = debug[select.selectedIndex];
  previousButton.disabled = info.absolutePosition == 0;
  nextButton.disabled = info.absolutePosition == debug.length - 1;
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
  // playPositionRange automatically clamps to [min, max].  Make the number match.
  const rawPositionMs = playPositionRange.valueAsNumber;
  const safePositionMs = Math.max(rawPositionMs, sectionStartTime);
  loadPlayPositionSeconds(safePositionMs);
  selectedSlideChild = null;
  updateComponentEditor(info.selectable);
  updateScheduleEditor(info.selectable);
}
select.addEventListener("input", updateFromSelect);
updateFromSelect();
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
}

if (import.meta.hot) {
  // Changing a typescript file invokes this.
  // Changing a css file would cause vite:beforeUpdate, instead.
  import.meta.hot.on("vite:beforeFullReload", (_data) => {
    saveState();
  });
}

addEventListener("pagehide", (_event) => {
  saveState();
});

// MARK: Schedule Editor

type ScheduleInfo = NonNullable<Selectable["schedules"]>[number];

// MARK: Schedule persistence (IndexedDB)

const toShowKey = new URLSearchParams(location.search).get("toShow") ?? "";

type HistoryEntry = {
  timestamp: number;
  schedules: SerializedSchedule[];
  scalars?: SerializedScalar[];
  components?: SerializedChild[];
};
type HistoryRecord = { selectableKey: string; entries: HistoryEntry[] };

const MAX_HISTORY_ENTRIES = 20;

/**
 * TypeScript defaults captured at page load — before any DB restoration.
 * Keyed by {@link selectableKey}. Shown as a permanent "TypeScript defaults"
 * option in the history select so the user can always reset to the
 * code-defined starting point. Never written to IndexedDB.
 */
const tsDefaults = new Map<string, HistoryEntry>();
/** Set to true once initFromDB has finished. After that, saving state that
 * matches the TS default is legitimate (the user explicitly reset to it). */
let initFromDBComplete = false;

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
): Promise<void> {
  const db = await openScheduleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("history", "readwrite");
    tx.objectStore("history").put({ selectableKey: key, entries });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
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
  for (const item of debug) {
    const sel = item.selectable;
    const key = selectableKey(sel);
    if (seen.has(key)) continue;
    seen.add(key);
    const hasSchedules = !!sel.schedules?.length;
    const hasScalars = !!sel.scalars?.length;
    const hasChildren = Array.isArray(sel.components);
    if (!hasSchedules && !hasScalars && !hasChildren) continue;
    const entry: HistoryEntry = {
      timestamp: 0,
      schedules: hasSchedules ? serializeSchedules(sel.schedules!) : [],
    };
    if (hasScalars) entry.scalars = serializeScalars(sel.scalars!);
    if (hasChildren) entry.components = serializeComponents(sel.components!);
    tsDefaults.set(key, entry);
  }
}

/**
 * Restores the most recent DB entry for every chapter that has one.
 * Runs once at page load (after {@link captureDefaults}) so that Vite
 * hot-reloads don't wipe out in-progress edits.
 * Refreshes the schedule editor for the currently visible chapter when done.
 */
async function initFromDB(unloadBackup?: string | null): Promise<void> {
  // Parse the backup map synchronously before any async work, so each per-item
  // promise can apply the backup in the same async round as the DB read.
  const backupMap = new Map<string, HistoryEntry>();
  if (unloadBackup) {
    try {
      const parsed = JSON.parse(unloadBackup) as
        | { key: string; entry: HistoryEntry }
        | { key: string; entry: HistoryEntry }[];
      for (const { key, entry } of Array.isArray(parsed) ? parsed : [parsed]) {
        backupMap.set(key, entry);
      }
    } catch {
      /* malformed backup — ignore */
    }
  }

  const seen = new Set<string>();
  const restores: Promise<void>[] = [];
  for (const item of debug) {
    const sel = item.selectable;
    const key = selectableKey(sel);
    if (seen.has(key)) continue;
    seen.add(key);
    if (
      !sel.schedules?.length &&
      !sel.scalars?.length &&
      !Array.isArray(sel.components)
    )
      continue;
    restores.push(
      readHistory(key).then(async (record) => {
        const entries = record?.entries ?? [];
        const last = entries.at(-1);
        const backup = backupMap.get(key);
        const useBackup =
          backup !== undefined && backup.timestamp > (last?.timestamp ?? 0);
        const effective = useBackup ? backup : last;
        if (!effective) return;
        if (sel.scalars?.length && effective.scalars?.length) {
          applyScalarSnapshot(sel.scalars, effective.scalars);
        }
        if (sel.schedules?.length && effective.schedules.length) {
          applySnapshot(sel.schedules, effective.schedules);
        }
        if (sel.components !== undefined && effective.components !== undefined) {
          sel.components.length = 0;
          sel.components.push(...buildComponents(effective.components));
        }
        if (useBackup) {
          const entryJson = JSON.stringify({
            schedules: backup!.schedules,
            scalars: backup!.scalars,
            components: backup!.components,
          });
          const lastJson = last
            ? JSON.stringify({
                schedules: last.schedules,
                scalars: last.scalars,
                components: last.components,
              })
            : null;
          if (entryJson !== lastJson) {
            entries.push(backup!);
            while (entries.length > MAX_HISTORY_ENTRIES) entries.shift();
            await writeHistory(key, entries);
          }
        }
      }),
    );
  }
  await Promise.all(restores);

  initFromDBComplete = true;
  canvas.style.visibility = "";
  canvasLoading.style.display = "none";
  const currentSel = debug[select.selectedIndex]?.selectable;
  if (currentSel) {
    updateComponentEditor(currentSel);
    updateScheduleEditor(currentSel);
  }
}

function easeName(fn: ((t: number) => number) | undefined): string | undefined {
  if (!fn) return undefined;
  if (fn === ease) return "ease";
  if (fn === easeIn) return "easeIn";
  if (fn === easeOut) return "easeOut";
  return "hold";
}

function serializeSchedules(
  schedules: readonly ScheduleInfo[],
): SerializedSchedule[] {
  return schedules.map((info) => ({
    description: info.description,
    type: info.type,
    keyframes: info.schedule.map((kf) => {
      const entry: SerializedKf = { time: kf.time, value: kf.value };
      const name = easeName(kf.easeAfter);
      if (name) entry.easeAfter = name;
      return entry;
    }),
  }));
}

function serializeScalars(scalars: readonly ScalarInfo[]): SerializedScalar[] {
  return scalars.map((info) => ({
    description: info.description,
    type: info.type,
    value: info.value,
  }));
}

function serializeComponents(components: Showable[]): SerializedChild[] {
  return components.flatMap((child) => {
    // Fall back to description when it exactly matches a registry key — this
    // handles TypeScript-hardcoded components that were never stamped by
    // buildComponents or the visual editor's "add component" path.
    const rk =
      child.registryKey ??
      componentRegistryKey.get(child) ??
      (componentRegistry.has(child.description) ? child.description : undefined);
    if (!rk) return [];
    const entry: SerializedChild = {
      registryKey: rk,
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
    return [entry];
  });
}

function selectableKey(selectable: Selectable): string {
  return `${toShowKey}|${selectable.description}`;
}

/** Reads history from IndexedDB and repopulates the history <select>.
 *  selectValue: explicit option to select; omit to default to the most recent DB entry. */
async function refreshHistoryUI(selectable: Selectable, selectValue?: string) {
  const key = selectableKey(selectable);
  const record = await readHistory(key);
  const entries = record?.entries ?? [];
  const hasDefaults = tsDefaults.has(key);
  scheduleHistorySelect.replaceChildren();
  if (entries.length === 0 && !hasDefaults) {
    scheduleHistorySelect.hidden = true;
    loadScheduleBtn.hidden = true;
  } else {
    scheduleHistorySelect.hidden = false;
    loadScheduleBtn.hidden = false;
    if (hasDefaults) {
      const opt = document.createElement("option");
      opt.value = "ts-defaults";
      opt.textContent = "TypeScript defaults";
      scheduleHistorySelect.append(opt);
    }
    for (let i = entries.length - 1; i >= 0; i--) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = new Date(entries[i].timestamp).toLocaleString();
      scheduleHistorySelect.append(opt);
    }
    // Use explicit selectValue if valid; otherwise default to most recent DB entry.
    const target =
      selectValue ??
      (entries.length > 0 ? String(entries.length - 1) : undefined);
    if (
      target &&
      [...scheduleHistorySelect.options].some((o) => o.value === target)
    ) {
      scheduleHistorySelect.value = target;
    }
  }
}

/** Saves current schedule state to IndexedDB. */
async function saveScheduleState(selectable: Selectable, updateUI = true) {
  const hasSchedules = !!selectable.schedules?.length;
  const hasScalars = !!selectable.scalars?.length;
  const hasChildren = Array.isArray(selectable.components);
  if (!hasSchedules && !hasScalars && !hasChildren) return;
  const key = selectableKey(selectable);
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
  const newJson = JSON.stringify({
    schedules: newSchedules,
    scalars: newScalars,
    components: newComponents,
  });
  // Skip saving if nothing changed since the last entry (e.g. Vite hot-reload
  // with no user edits triggers beforeunload and would pollute history).
  const last = entries[entries.length - 1];
  if (last) {
    const prevJson = JSON.stringify({
      schedules: last.schedules,
      scalars: last.scalars,
      components: last.components,
    });
    if (prevJson === newJson) return;
  }
  // Skip saving if the state is still the unmodified TypeScript defaults,
  // but only during the early-load window before initFromDB has finished.
  // After that, the user may have deliberately reset to defaults (e.g. deleted
  // all components), and we must persist that change.
  if (!initFromDBComplete) {
    const tsDefault = tsDefaults.get(key);
    if (tsDefault) {
      const defaultJson = JSON.stringify({
        schedules: tsDefault.schedules,
        scalars: tsDefault.scalars,
        components: tsDefault.components,
      });
      if (defaultJson === newJson) return;
    }
  }
  const entry: HistoryEntry = {
    timestamp: Date.now(),
    schedules: newSchedules,
  };
  if (newScalars !== undefined) entry.scalars = newScalars;
  if (newComponents !== undefined) entry.components = newComponents;
  entries.push(entry);
  while (entries.length > MAX_HISTORY_ENTRIES) entries.shift();
  await writeHistory(key, entries);
  if (updateUI) await refreshHistoryUI(selectable, String(entries.length - 1));
}

/**
 * Returns the slide-level selectable that should be saved/loaded as a unit.
 * For components slides this is always the slide itself (not the selected child),
 * so a single save captures the full component list and all keyframes.
 */
function currentSaveTarget(): Selectable | null {
  const selectable = debug[select.selectedIndex]?.selectable;
  if (!selectable) return null;
  if (selectable.components !== undefined) return selectable;
  return selectable.schedules?.length ? selectable : null;
}

saveScheduleNowBtn.addEventListener("click", () => {
  const target = currentSaveTarget();
  if (target) saveScheduleState(target);
});

loadScheduleBtn.addEventListener("click", () => {
  const target = currentSaveTarget();
  if (!target) return;
  const loadedValue = scheduleHistorySelect.value;
  if (loadedValue === "ts-defaults") {
    const defaults = tsDefaults.get(selectableKey(target));
    if (!defaults) return;
    if (target.scalars?.length && defaults.scalars?.length) {
      applyScalarSnapshot(target.scalars, defaults.scalars);
    }
    if (target.schedules?.length && defaults.schedules.length) {
      applySnapshot(target.schedules, defaults.schedules);
    }
    if (target.components !== undefined && defaults.components) {
      target.components.length = 0;
      target.components.push(...buildComponents(defaults.components));
    }
    selectedSlideChild = null;
    updateComponentEditor(target);
    updateScheduleEditor(target, "ts-defaults");
    return;
  }
  const index = parseInt(loadedValue, 10);
  readHistory(selectableKey(target)).then((record) => {
    const entry = record?.entries[index];
    if (!entry) return;
    if (target.scalars?.length && entry.scalars?.length) {
      applyScalarSnapshot(target.scalars, entry.scalars);
    }
    if (target.schedules?.length && entry.schedules.length) {
      applySnapshot(target.schedules, entry.schedules);
    }
    if (target.components !== undefined && entry.components) {
      target.components.length = 0;
      target.components.push(...buildComponents(entry.components));
    }
    selectedSlideChild = null;
    updateComponentEditor(target);
    updateScheduleEditor(target, loadedValue);
  });
});

function saveOnUnload() {
  // Save every slide that has editable state, not just the currently-visible one.
  // A user may edit slide 1 then navigate to slide 5 before refreshing; we must
  // persist slide 1's changes even though it is no longer selected.
  const seen = new Set<string>();
  const backups: { key: string; entry: HistoryEntry }[] = [];

  for (const item of debug) {
    const sel = item.selectable;
    const key = selectableKey(sel);
    if (seen.has(key)) continue;
    seen.add(key);

    const hasSchedules = !!sel.schedules?.length;
    const hasScalars = !!sel.scalars?.length;
    const hasChildren = Array.isArray(sel.components);
    if (!hasSchedules && !hasScalars && !hasChildren) continue;

    const schedules = hasSchedules ? serializeSchedules(sel.schedules!) : [];
    const scalars = hasScalars ? serializeScalars(sel.scalars!) : undefined;
    const components = hasChildren
      ? serializeComponents(sel.components!)
      : undefined;
    const tsDefault = tsDefaults.get(key);
    const newJson = JSON.stringify({ schedules, scalars, components });
    const defaultJson = !initFromDBComplete && tsDefault
      ? JSON.stringify({
          schedules: tsDefault.schedules,
          scalars: tsDefault.scalars,
          components: tsDefault.components,
        })
      : null;
    if (newJson !== defaultJson) {
      backups.push({
        key,
        entry: {
          timestamp: Date.now(),
          schedules,
          ...(scalars !== undefined && { scalars }),
          ...(components !== undefined && { components }),
        },
      });
    }
    // Async DB write — succeeds on tab-hide, may be abandoned on navigation.
    saveScheduleState(sel, false);
  }

  if (backups.length > 0) {
    sessionStorage.setItem("pendingScheduleSave", JSON.stringify(backups));
  }
}
window.addEventListener("beforeunload", saveOnUnload);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveOnUnload();
});

// MARK: Color editor utilities

type RGBA = { r: number; g: number; b: number; a: number };

/**
 * Paints `el` as a color swatch.  A checkerboard background sits behind the
 * color so that any alpha transparency is clearly visible.
 */
function setSwatchColor(el: HTMLElement, css: string): void {
  el.style.backgroundImage = [
    `linear-gradient(${css},${css})`,
    "linear-gradient(45deg,#bbb 25%,transparent 25%)",
    "linear-gradient(-45deg,#bbb 25%,transparent 25%)",
    "linear-gradient(45deg,transparent 75%,#bbb 75%)",
    "linear-gradient(-45deg,transparent 75%,#bbb 75%)",
  ].join(",");
  el.style.backgroundSize = "auto,8px 8px,8px 8px,8px 8px,8px 8px";
  el.style.backgroundPosition = "0 0,0 0,0 4px,4px -4px,-4px 0";
  el.style.backgroundColor = "#fff";
}

// Hidden div for CSS color validation / parsing via getComputedStyle.
const _parseColorDiv = document.createElement("div");
_parseColorDiv.style.cssText =
  "position:fixed;top:-100px;left:-100px;width:1px;height:1px;visibility:hidden";
document.documentElement.append(_parseColorDiv);

function parseCssColorToRgba(css: string): RGBA | null {
  _parseColorDiv.style.backgroundColor = "";
  _parseColorDiv.style.backgroundColor = css;
  if (!_parseColorDiv.style.backgroundColor) return null;
  const c = getComputedStyle(_parseColorDiv).backgroundColor;
  const m = c.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/,
  );
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  s /= 100;
  l /= 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const h2r = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(h2r(h + 1 / 3) * 255),
    Math.round(h2r(h) * 255),
    Math.round(h2r(h - 1 / 3) * 255),
  ];
}

function rgbToHwb(r: number, g: number, b: number): [number, number, number] {
  const [h] = rgbToHsl(r, g, b);
  return [
    h,
    Math.round((Math.min(r, g, b) / 255) * 100),
    Math.round((1 - Math.max(r, g, b) / 255) * 100),
  ];
}

function hwbToRgb(h: number, w: number, bk: number): [number, number, number] {
  const w1 = w / 100,
    bk1 = bk / 100;
  if (w1 + bk1 >= 1) {
    const g = Math.round((w1 / (w1 + bk1)) * 255);
    return [g, g, g];
  }
  const [pr, pg, pb] = hslToRgb(h, 100, 50);
  const f = 1 - w1 - bk1;
  return [
    Math.round(pr * f + w1 * 255),
    Math.round(pg * f + w1 * 255),
    Math.round(pb * f + w1 * 255),
  ];
}

function _p01(v: number) {
  return parseFloat((v * 100).toFixed(2)) + "%";
}
function _deg(h: number) {
  return Math.round(h) + "deg";
}

function fmtHex(r: number, g: number, b: number, a: number): string {
  const h = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return a >= 1 - 0.5 / 255
    ? `#${h(r)}${h(g)}${h(b)}`
    : `#${h(r)}${h(g)}${h(b)}${h(a * 255)}`;
}

function fmtRgb(r: number, g: number, b: number, a: number): string {
  const body = `${_p01(r / 255)} ${_p01(g / 255)} ${_p01(b / 255)}`;
  return a >= 1 ? `rgb(${body})` : `rgb(${body} / ${_p01(a)})`;
}

function fmtHwb(h: number, w: number, bk: number, a: number): string {
  const body = `${_deg(h)} ${w}% ${bk}%`;
  return a >= 1 ? `hwb(${body})` : `hwb(${body} / ${_p01(a)})`;
}

function fmtHsl(h: number, s: number, l: number, a: number): string {
  const body = `${_deg(h)} ${s}% ${l}%`;
  return a >= 1 ? `hsl(${body})` : `hsl(${body} / ${_p01(a)})`;
}

const MAX_RECENT_COLORS = 20;
const recentColors: string[] = [];

function addToRecentColors(css: string) {
  const i = recentColors.indexOf(css);
  if (i !== -1) recentColors.splice(i, 1);
  recentColors.unshift(css);
  while (recentColors.length > MAX_RECENT_COLORS) recentColors.pop();
}

function addName<T extends { name: string }>(element: T) {
  // Chrome has started to complain about unnamed form elements.
  element.name = crypto.randomUUID();
  return element;
}

function buildNumericInput(
  value: number,
  onChange: (n: number) => void,
): HTMLInputElement {
  const input = addName(document.createElement("input"));
  input.type = "number";
  input.value = String(value);
  input.step = "0.1";
  input.style.width = "5em";
  input.addEventListener("input", () => {
    if (!isNaN(input.valueAsNumber)) onChange(input.valueAsNumber);
  });
  return input;
}

function buildEaseSelect(keyframe: {
  easeAfter?: (t: number) => number;
}): HTMLSelectElement {
  const select = addName(document.createElement("select"));
  for (const label of ["linear", "ease", "easeIn", "easeOut", "hold"]) {
    const opt = document.createElement("option");
    opt.value = opt.textContent = label;
    select.append(opt);
  }
  const fn = keyframe.easeAfter;
  select.value = !fn
    ? "linear"
    : fn === ease
      ? "ease"
      : fn === easeIn
        ? "easeIn"
        : fn === easeOut
          ? "easeOut"
          : "hold";
  select.addEventListener("change", () => {
    switch (select.value) {
      case "linear":
        keyframe.easeAfter = undefined;
        break;
      case "ease":
        keyframe.easeAfter = ease;
        break;
      case "easeIn":
        keyframe.easeAfter = easeIn;
        break;
      case "easeOut":
        keyframe.easeAfter = easeOut;
        break;
      case "hold":
        keyframe.easeAfter = (t) => (t < 1 ? 0 : 1);
        break;
    }
  });
  return select;
}

function scheduleToTypeScript(
  info: ScheduleInfo,
  showableDescription: string,
): string {
  function easeSuffix(fn: ((t: number) => number) | undefined): string {
    const name = easeName(fn);
    if (!name) return "";
    if (name === "hold") return ", easeAfter: (t) => (t < 1 ? 0 : 1)";
    return `, easeAfter: ${name}`;
  }

  function formatValue(value: unknown): string {
    if (
      info.type === "color" ||
      info.type === "string" ||
      info.type === "select"
    ) {
      return JSON.stringify(value as string);
    } else if (info.type === "number") {
      return String(value as number);
    } else if (info.type === "point") {
      const v = value as { x: number; y: number };
      return `{ x: ${v.x}, y: ${v.y} }`;
    } else {
      const v = value as ReadOnlyRect;
      return `{ x: ${v.x}, y: ${v.y}, width: ${v.width}, height: ${v.height} }`;
    }
  }

  const rows = info.schedule.map(
    (kf) =>
      `  { time: ${kf.time}, value: ${formatValue(kf.value)}${easeSuffix(kf.easeAfter)} },`,
  );
  const header = [
    `// Showable.description: ${JSON.stringify(showableDescription)}`,
    `// Schedule name: ${JSON.stringify(info.description)}`,
  ].join("\n");
  return `${header}\n[\n${rows.join("\n")}\n]`;
}

function buildScalarSection(info: ScalarInfo): HTMLElement {
  const section = document.createElement("fieldset");
  section.style.cssText = "margin-bottom:0.4em";
  const legend = document.createElement("legend");
  legend.textContent = info.description;
  section.append(legend);

  if (info.type === "string") {
    const input = document.createElement("textarea");
    input.rows = 1;
    input.value = info.value;
    input.style.cssText = "width:100%;box-sizing:border-box;resize:vertical";
    input.addEventListener("input", () => {
      info.value = input.value;
    });
    section.append(input);
  } else if (info.type === "color") {
    const swatchBtn = document.createElement("button");
    swatchBtn.type = "button";
    swatchBtn.title = info.value;
    swatchBtn.style.cssText =
      "width:2.5em;height:1.8em;border:1px solid #999;cursor:pointer;border-radius:2px";
    setSwatchColor(swatchBtn, info.value);
    swatchBtn.addEventListener("click", () =>
      openColorPickerDialog(info, section),
    );
    section.addEventListener("input", () => {
      setSwatchColor(swatchBtn, info.value);
      swatchBtn.title = info.value;
    });
    section.append(swatchBtn);
  } else if (info.type === "number") {
    const input = document.createElement("input");
    input.type = "number";
    input.value = String(info.value);
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      if (isFinite(v)) info.value = v;
    });
    section.append(input);
  } else if (info.type === "select") {
    const sel = document.createElement("select");
    for (const choice of info.choices) {
      const opt = document.createElement("option");
      opt.value = opt.textContent = choice;
      if (choice === info.value) opt.selected = true;
      sel.append(opt);
    }
    sel.addEventListener("change", () => {
      info.value = sel.value;
    });
    section.append(sel);
  } else if (info.type === "point") {
    for (const axis of ["x", "y"] as const) {
      const label = document.createElement("label");
      label.textContent = `${axis}: `;
      const input = document.createElement("input");
      input.type = "number";
      input.value = String(info.value[axis]);
      input.style.width = "6em";
      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        if (isFinite(v)) info.value = { ...info.value, [axis]: v };
      });
      label.append(input);
      section.append(label, " ");
    }
  } else {
    // rectangle
    for (const field of ["x", "y", "width", "height"] as const) {
      const label = document.createElement("label");
      label.textContent = `${field}: `;
      const input = document.createElement("input");
      input.type = "number";
      input.value = String((info.value as Record<string, number>)[field]);
      input.style.width = "5em";
      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        if (isFinite(v)) info.value = { ...info.value, [field]: v };
      });
      label.append(input);
      section.append(label, " ");
    }
  }
  return section;
}

// MARK: Font info panel (TraditionalTextComponent)

/** Counter for unique <datalist> IDs within the schedule editor. */
let _datalistIdCounter = 0;

const FONT_WEIGHT_NAMES = new Map<number, string>([
  [100, "Thin"],
  [200, "Extra Light"],
  [300, "Light"],
  [400, "Normal"],
  [500, "Medium"],
  [600, "Semi Bold"],
  [700, "Bold"],
  [800, "Extra Bold"],
  [900, "Black"],
]);

interface FontFamilyData {
  /** "normal", "italic", "oblique" — whatever document.fonts reports. */
  styles: Set<string>;
  /** Sorted discrete weight values (only populated when no range is present). */
  discreteWeights: number[];
  /** Continuous weight range, if the font uses one. */
  weightRange: { min: number; max: number } | null;
}

/**
 * Parse a FontFace.weight string into a discrete number or [min,max] range.
 * Returns null and logs a console warning for unexpected formats.
 */
function parseFontWeight(
  str: string,
  familyName: string,
): number | [number, number] | null {
  str = str.trim();
  if (str === "normal") return 400;
  if (str === "bold") return 700;
  const parts = str.split(/\s+/);
  if (parts.length === 1) {
    const n = parseFloat(parts[0]);
    if (isFinite(n)) return n;
  } else if (parts.length === 2) {
    const lo = parseFloat(parts[0]);
    const hi = parseFloat(parts[1]);
    if (isFinite(lo) && isFinite(hi)) return [lo, hi];
  }
  console.warn(
    `TraditionalTextComponent: unexpected font-weight "${str}" for family "${familyName}"`,
  );
  return null;
}

/**
 * Collect style and weight information for a font family from `document.fonts`.
 * Family name comparison is case-insensitive; quoted names (e.g. `"Times New Roman"`)
 * are normalized before comparison.
 */
function getFontFamilyData(familyName: string): FontFamilyData {
  const data: FontFamilyData = {
    styles: new Set(),
    discreteWeights: [],
    weightRange: null,
  };
  const weightSet = new Set<number>();
  let hasRange = false;

  const needle = familyName.toLowerCase();
  for (const face of document.fonts) {
    const faceName = face.family.replace(/^["']|["']$/g, "").trim();
    if (faceName.toLowerCase() !== needle) continue;

    // Normalize style
    const style = face.style.toLowerCase();
    data.styles.add(style.startsWith("oblique") ? "oblique" : style);

    // Parse weight
    const w = parseFontWeight(face.weight, familyName);
    if (w === null) continue;
    if (Array.isArray(w)) {
      hasRange = true;
      if (!data.weightRange) {
        data.weightRange = { min: w[0], max: w[1] };
      } else {
        data.weightRange.min = Math.min(data.weightRange.min, w[0]);
        data.weightRange.max = Math.max(data.weightRange.max, w[1]);
      }
    } else {
      weightSet.add(w);
    }
  }

  if (!hasRange) {
    data.discreteWeights = [...weightSet].sort((a, b) => a - b);
  }
  return data;
}

function formatWeightLabel(w: number): string {
  const name = FONT_WEIGHT_NAMES.get(w);
  return name ? `${w} (${name})` : String(w);
}

function formatWeightSummary(data: FontFamilyData): string {
  if (data.weightRange) {
    const { min, max } = data.weightRange;
    const named = [...FONT_WEIGHT_NAMES.entries()]
      .filter(([w]) => w >= min && w <= max)
      .map(([, name]) => name);
    const range = `${min}–${max}`;
    return named.length ? `${range} (includes ${named.join(", ")})` : range;
  }
  if (data.discreteWeights.length) {
    return data.discreteWeights.map(formatWeightLabel).join(", ");
  }
  return "(not found in loaded fonts)";
}

// Family name → comma-separated unique style words from window.queryLocalFonts().
// Populated once at startup; used by buildTraditionalTextPanel to display info
// for local fonts that are not in document.fonts.
const localFontStylesMap = new Map<string, string>();

function _fetchLocalFonts() {
  if (!("queryLocalFonts" in window)) {
    console.log(
      "Warning: Local fonts are not available. Try using Chrome to fix this.",
    );
    return;
  }
  // queryLocalFonts() requires the page to be visible.  Calling it while hidden
  // (e.g. during a Vite HMR reload) throws SecurityError — defer if needed.
  if (document.visibilityState !== "visible") {
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "visible") _fetchLocalFonts();
      },
      { once: true },
    );
    return;
  }
  (
    window as unknown as {
      queryLocalFonts: () => Promise<Array<{ family: string; style: string }>>;
    }
  )
    .queryLocalFonts()
    .then((fonts) => {
      const byFamily = new Map<string, Set<string>>();
      for (const f of fonts) {
        let s = byFamily.get(f.family);
        if (!s) {
          s = new Set();
          byFamily.set(f.family, s);
        }
        for (const w of f.style.split(/\s+/)) if (w) s.add(w);
      }
      for (const [fam, styles] of byFamily) {
        localFontStylesMap.set(fam, [...styles].join(", "));
      }
    })
    .catch((e: unknown) => console.warn("queryLocalFonts():", e));
}
_fetchLocalFonts();

// MARK: Font coverage utilities

/**
 * Code-point ranges that virtually every local (system) font supports.
 * Used as a whitelist when a font is not in document.fonts (i.e. a local font)
 * so we only warn when the user's text ventures outside these safe ranges.
 */
const LOCAL_FONT_SAFE_RANGES: [number, number][] = [
  [0x0020, 0x007e], // printable ASCII
  [0x00a0, 0x00ff], // Latin-1 Supplement (é ñ ü ß …)
  [0x2013, 0x2014], // en / em dash
  [0x2018, 0x2019], // curly single quotes
  [0x201c, 0x201d], // curly double quotes
  [0x2026, 0x2026], // ellipsis
  [0x20ac, 0x20ac], // €
];

/** Matches graphemes that are rendered by the OS emoji font, not the text font. */
const _emojiRe = /\p{Emoji_Presentation}/u;

/** Parse a CSS `unicode-range` descriptor string into [lo, hi] code-point pairs. */
function _parseUnicodeRange(unicodeRange: string): [number, number][] {
  return unicodeRange.split(",").flatMap((part) => {
    part = part.trim().toUpperCase();
    if (!part.startsWith("U+")) return [];
    const raw = part.slice(2);
    const dash = raw.indexOf("-");
    if (dash >= 0) {
      const lo = parseInt(raw.slice(0, dash), 16);
      const hi = parseInt(raw.slice(dash + 1), 16);
      if (isFinite(lo) && isFinite(hi)) return [[lo, hi] as [number, number]];
    } else {
      const v = parseInt(raw, 16);
      if (isFinite(v)) return [[v, v] as [number, number]];
    }
    return [];
  });
}

function _cpInRanges(cp: number, ranges: [number, number][]): boolean {
  return ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
}

/**
 * Returns unique grapheme clusters from `text` that are NOT covered by `family`.
 *
 * - Web fonts (families present in document.fonts) are checked against their
 *   declared `unicodeRange`.
 * - Local / system fonts fall back to {@link LOCAL_FONT_SAFE_RANGES}.
 * - Whitespace and emoji are always excluded from the result.
 */
function _uncoveredGraphemes(family: string, text: string): string[] {
  const needle = family.toLowerCase();
  const webRanges: [number, number][] = [];
  for (const face of document.fonts) {
    const faceName = face.family.replace(/^["']|["']$/g, "").trim();
    if (faceName.toLowerCase() === needle)
      webRanges.push(..._parseUnicodeRange(face.unicodeRange));
  }
  const ranges = webRanges.length > 0 ? webRanges : LOCAL_FONT_SAFE_RANGES;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const { segment } of new Intl.Segmenter().segment(text)) {
    if (!segment.trim() || _emojiRe.test(segment) || seen.has(segment))
      continue;
    seen.add(segment);
    if (!_cpInRanges(segment.codePointAt(0)!, ranges)) result.push(segment);
  }
  return result;
}

/**
 * Returns web font family names from document.fonts that cover every code
 * point in `graphemes`, sorted alphabetically, up to `maxResults`.
 */
function _findAlternativeFonts(graphemes: string[], maxResults = 6): string[] {
  if (!graphemes.length) return [];
  const cps = graphemes.map((g) => g.codePointAt(0)!);

  const familyRanges = new Map<string, [number, number][]>();
  for (const face of document.fonts) {
    const name = face.family.replace(/^["']|["']$/g, "").trim();
    if (!familyRanges.has(name)) familyRanges.set(name, []);
    familyRanges.get(name)!.push(..._parseUnicodeRange(face.unicodeRange));
  }

  return [...familyRanges]
    .filter(([, ranges]) => cps.every((cp) => _cpInRanges(cp, ranges)))
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .slice(0, maxResults);
}

/**
 * Build the Font Info panel shown at the top of the schedule editor when a
 * {@link TraditionalTextComponent} is selected.  Displays available styles and
 * weights for every family mentioned in the schedule, and warns when a
 * scheduled weight is not available for a given family.
 */
function buildTraditionalTextPanel(
  component: TraditionalTextComponent,
): HTMLElement {
  const panel = document.createElement("fieldset");
  panel.style.cssText = "border-color:#4488cc;margin-bottom:0.4em";
  const legend = document.createElement("legend");
  legend.textContent = "Font Info";
  panel.append(legend);

  const scheduledFamilies = [
    ...new Set(
      component.fontFamilySchedule.schedule
        .map((kf) => kf.value)
        .filter(Boolean),
    ),
  ];
  const scheduledWeights = [
    ...new Set(component.fontWeightSchedule.schedule.map((kf) => kf.value)),
  ];
  const warnings: string[] = [];
  const allText = component.textSchedule.schedule
    .map((kf) => kf.value)
    .join("");
  const allUncovered = new Set<string>();

  if (scheduledFamilies.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No font family set.";
    panel.append(p);
    return panel;
  }

  for (const family of scheduledFamilies) {
    const block = document.createElement("div");
    block.style.cssText = "margin-bottom:0.4em";

    const nameEl = document.createElement("strong");
    nameEl.textContent = family;
    block.append(nameEl);

    const data = getFontFamilyData(family);
    const notFound =
      data.styles.size === 0 &&
      data.discreteWeights.length === 0 &&
      !data.weightRange;

    if (notFound) {
      const localStyles = localFontStylesMap.get(family);
      if (localStyles !== undefined) {
        // Local system font (from queryLocalFonts) — show raw style words,
        // skip weight warning (weights can't be inferred from style strings).
        const stylesEl = document.createElement("div");
        stylesEl.style.cssText = "padding-left:1em";
        stylesEl.textContent = `Styles: ${localStyles}`;
        block.append(stylesEl);
      } else {
        const note = document.createElement("div");
        note.style.cssText = "padding-left:1em;color:#888";
        note.textContent =
          "(not found in loaded fonts — may still render if installed)";
        block.append(note);
      }
    } else {
      const stylesEl = document.createElement("div");
      stylesEl.style.cssText = "padding-left:1em";
      stylesEl.textContent = `Styles: ${[...data.styles].sort().join(", ")}`;
      block.append(stylesEl);

      const weightsEl = document.createElement("div");
      weightsEl.style.cssText = "padding-left:1em";
      weightsEl.textContent = `Weights: ${formatWeightSummary(data)}`;
      block.append(weightsEl);

      // Warn when a scheduled weight is clearly out of range / not in the set.
      for (const w of scheduledWeights) {
        let unavailable = false;
        if (data.weightRange) {
          unavailable = w < data.weightRange.min || w > data.weightRange.max;
        } else if (data.discreteWeights.length) {
          unavailable = !data.discreteWeights.includes(w);
        }
        if (unavailable) {
          warnings.push(
            `Weight ${formatWeightLabel(w)} may not be available for "${family}" (${formatWeightSummary(data)})`,
          );
        }
      }
    }
    const uncovered = _uncoveredGraphemes(family, allText);
    for (const g of uncovered) allUncovered.add(g);
    if (uncovered.length > 0) {
      const coverEl = document.createElement("div");
      coverEl.style.cssText = "padding-left:1em;color:#cc8800";
      coverEl.textContent = `⚠ May use fallback for: ${uncovered.join(" ")}`;
      block.append(coverEl);
    }
    panel.append(block);
  }

  for (const msg of warnings) {
    const warnEl = document.createElement("div");
    warnEl.style.cssText = "color:#cc8800";
    warnEl.textContent = `⚠ ${msg}`;
    panel.append(warnEl);
  }

  if (allUncovered.size > 0) {
    const alts = _findAlternativeFonts([...allUncovered]);
    if (alts.length > 0) {
      const altEl = document.createElement("div");
      altEl.style.cssText = "margin-top:0.4em;color:#666;font-size:0.9em";
      altEl.textContent =
        "Web fonts covering all characters: " + alts.join(", ");
      panel.append(altEl);
    }
  }

  return panel;
}

// MARK: Slide component panel

/**
 * Build the Transform Info panel shown at the top of the schedule editor
 * when a {@link SlideComponent} is selected.  Lists active placeholders,
 * validates the template syntax, and links to the CSS transform reference.
 */
function buildSlideComponentPanel(component: SlideComponent): HTMLElement {
  const panel = document.createElement("fieldset");
  panel.style.cssText = "border-color:#6a9e6a;margin-bottom:0.4em";
  const legend = document.createElement("legend");
  legend.textContent = "Transform Info";
  panel.append(legend);

  const template = component.transformTemplate.value;

  const usedEl = document.createElement("div");
  usedEl.textContent = "Placeholders: " + TRANSFORM_PLACEHOLDERS.join("  ");
  usedEl.style.cssText = "margin-bottom:0.3em;letter-spacing:0.1em";
  panel.append(usedEl);

  const testWith = (v: string) =>
    TRANSFORM_PLACEHOLDERS.reduce((s, p) => s.replaceAll(p, v), template);
  const statusEl = document.createElement("div");
  try {
    // Test with both 0 and 1: rotate(0) is valid but rotate(1) is not,
    // catching templates like "rotate(𝓐)" that are missing the "deg" unit.
    new DOMMatrixReadOnly(testWith("0") || "none");
    new DOMMatrixReadOnly(testWith("1") || "none");
    statusEl.textContent = "✓ Valid";
    statusEl.style.color = "green";
  } catch {
    statusEl.textContent = "✗ Syntax error";
    statusEl.style.color = "red";
  }
  panel.append(statusEl);

  const helpEl = document.createElement("div");
  helpEl.style.cssText = "font-size:0.85em;color:#666;margin-top:0.5em";
  helpEl.textContent =
    "By default the video is 16px wide and 9px tall. Other length units are not well defined.";
  const linkEl = document.createElement("a");
  linkEl.href =
    "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform";
  linkEl.textContent = "CSS transform reference ↗";
  linkEl.target = "_blank";
  linkEl.rel = "noopener";
  linkEl.style.cssText = "font-size:0.85em;display:block;margin-top:0.2em";
  panel.append(helpEl, linkEl);

  return panel;
}

// MARK: Font picker dialog

/**
 * Opens a full-screen font picker dialog.
 *
 * Merges families from the schedule's pre-built `choices` list (document.fonts)
 * with any additional families returned by window.queryLocalFonts() (experimental,
 * permission-gated).  Rows are filtered live as the user types a search string.
 *
 * Clicking a row immediately writes to `strKf.value` and dispatches a bubbling
 * "input" event from `cell` so the schedule editor's Font Info panel refreshes.
 *
 * The initial value (before the dialog opened) is always pinned as the first row
 * so the user can revert by clicking it.  There is no explicit cancel button.
 */
async function openFontPickerDialog(
  strKf: Keyframe<string>,
  choices: readonly string[],
  cell: HTMLElement,
): Promise<void> {
  const allFamilies = new Set<string>(choices);
  if ("queryLocalFonts" in window) {
    try {
      const localFonts = (await (
        window as unknown as {
          queryLocalFonts: () => Promise<Array<{ family: string }>>;
        }
      ).queryLocalFonts()) as Array<{ family: string }>;
      for (const f of localFonts) allFamilies.add(f.family);
    } catch (e) {
      console.warn("queryLocalFonts():", e);
    }
  }
  const sortedFamilies = [...allFamilies].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );

  const initialFont = strKf.value;
  let currentFont = strKf.value;

  // Cover the right column so the canvas stays fully visible.
  const rightCol = document.getElementById("right-col");
  const rect = rightCol?.getBoundingClientRect();

  const dialog = document.createElement("dialog");
  if (rect) {
    dialog.style.cssText = [
      `position:fixed`,
      `margin:0`,
      `padding:0`,
      `left:${rect.left}px`,
      `top:${rect.top}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      `max-width:none`,
      `max-height:none`,
      `border:none`,
      `border-left:2px solid #999`,
      `display:flex`,
      `flex-direction:column`,
      `box-shadow:-4px 0 16px rgba(0,0,0,0.2)`,
      `z-index:9999`,
      `overflow:hidden`,
    ].join(";");
  } else {
    dialog.style.cssText =
      "width:min(60em,90vw);height:80vh;display:flex;flex-direction:column;padding:0;border:1px solid #999;overflow:hidden;z-index:9999";
  }

  // ── Top controls ────────────────────────────────────────────────────────────
  const controls = document.createElement("div");
  controls.style.cssText =
    "display:flex;gap:0.5em;padding:0.5em;background:#f4f4f4;border-bottom:1px solid #ccc;flex-shrink:0;align-items:center";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search fonts…";
  searchInput.style.cssText = "flex:1;min-width:0";
  const searchLabel = document.createElement("label");
  searchLabel.textContent = "Search: ";
  searchLabel.append(searchInput);

  const sampleInput = document.createElement("input");
  sampleInput.type = "text";
  sampleInput.value = "Clean Simple Design 1234567890";
  sampleInput.style.cssText = "flex:2;min-width:0";
  const sampleLabel = document.createElement("label");
  sampleLabel.textContent = "Sample: ";
  sampleLabel.append(sampleInput);

  controls.append(searchLabel, " ", sampleLabel);

  // ── Font list table ──────────────────────────────────────────────────────────
  const tableContainer = document.createElement("div");
  tableContainer.style.cssText =
    "overflow-y:auto;flex:1;border-bottom:1px solid #ccc";

  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse";
  const tbody = table.createTBody();
  tableContainer.append(table);

  // ── Bottom bar ───────────────────────────────────────────────────────────────
  const bottom = document.createElement("div");
  bottom.style.cssText =
    "padding:0.4em 0.6em;background:#f4f4f4;flex-shrink:0;text-align:right";
  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "OK";
  okBtn.addEventListener("click", () => dialog.close());
  bottom.append(okBtn);

  dialog.append(controls, tableContainer, bottom);
  document.body.append(dialog);

  function pickFont(family: string) {
    currentFont = family;
    strKf.value = family;
    cell.dispatchEvent(new Event("input", { bubbles: true }));
    buildRows();
  }

  function addRow(family: string, sampleText: string, badge?: string) {
    const tr = document.createElement("tr");
    tr.dataset.family = family;
    const isSelected = family === currentFont;
    tr.style.cssText = `cursor:pointer;border-bottom:1px solid #eee;background:${isSelected ? "#bee6ff" : badge ? "#f5f5f5" : ""}`;
    tr.addEventListener("mouseover", () => {
      if (family !== currentFont) tr.style.background = "#e8f4ff";
    });
    tr.addEventListener("mouseout", () => {
      tr.style.background =
        family === currentFont ? "#bee6ff" : badge ? "#f5f5f5" : "";
    });
    tr.addEventListener("click", () => pickFont(family));
    if (isSelected) tr.dataset.selected = "";

    const sampleCell = tr.insertCell();
    sampleCell.style.cssText = "padding:0.25em 0.6em;font-size:1.3em";
    sampleCell.style.fontFamily = family;
    sampleCell.textContent = sampleText;

    const nameCell = tr.insertCell();
    nameCell.style.cssText =
      "padding:0.25em 0.6em;font-size:0.85em;white-space:nowrap;color:#444";
    nameCell.textContent = family;
    if (badge) {
      const b = document.createElement("span");
      b.style.cssText = "margin-left:0.4em;color:#999;font-size:0.8em";
      b.textContent = badge;
      nameCell.append(b);
    }

    tbody.append(tr);
  }

  function buildRows() {
    const sampleText = sampleInput.value || "ABC def 0123456789";
    const terms = searchInput.value
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const matched =
      terms.length === 0
        ? sortedFamilies
        : sortedFamilies.filter((f) =>
            terms.every((t) => f.toLowerCase().includes(t)),
          );

    tbody.replaceChildren();

    // Row 0: initial (pinned)
    addRow(initialFont, sampleText, "(initial)");

    // Row 1: current selection if not initial and not in search results
    if (currentFont !== initialFont && !matched.includes(currentFont)) {
      addRow(currentFont, sampleText, "(current)");
    }

    for (const family of matched) {
      addRow(family, sampleText);
    }

    tbody
      .querySelector<HTMLTableRowElement>("[data-selected]")
      ?.scrollIntoView({
        block: "nearest",
      });
  }

  searchInput.addEventListener("input", buildRows);
  sampleInput.addEventListener("input", buildRows);

  dialog.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const rows = [...tbody.rows];
    const selectedIndex = rows.findIndex((r) => "selected" in r.dataset);
    const next = rows[selectedIndex + (e.key === "ArrowDown" ? 1 : -1)];
    if (next?.dataset.family) pickFont(next.dataset.family);
  });

  // Escape closes the non-modal dialog (showModal() handles this automatically;
  // show() does not, so we wire it up manually).
  function onEscape(e: KeyboardEvent) {
    if (e.key === "Escape") dialog.close();
  }
  document.addEventListener("keydown", onEscape);

  buildRows();
  dialog.showModal();
  searchInput.focus();

  dialog.addEventListener("close", () => {
    document.removeEventListener("keydown", onEscape);
    dialog.remove();
  });
}

// MARK: Color picker dialog

async function openColorPickerDialog(
  colorRef: { value: string },
  cell: HTMLElement,
): Promise<void> {
  const initialCss = colorRef.value;
  const initialRgba: RGBA = parseCssColorToRgba(initialCss) ?? {
    r: 128,
    g: 128,
    b: 128,
    a: 1,
  };
  let currentRgba: RGBA = { ...initialRgba };

  const rightCol = document.getElementById("right-col");
  const rcRect = rightCol?.getBoundingClientRect();
  const dialog = document.createElement("dialog");
  if (rcRect) {
    dialog.style.cssText = [
      `position:fixed`,
      `margin:0`,
      `padding:0`,
      `left:${rcRect.left}px`,
      `top:${rcRect.top}px`,
      `width:${rcRect.width}px`,
      `height:${rcRect.height}px`,
      `max-width:none`,
      `max-height:none`,
      `border:none`,
      `border-left:2px solid #999`,
      `display:flex`,
      `flex-direction:column`,
      `box-shadow:-4px 0 16px rgba(0,0,0,0.2)`,
      `z-index:9999`,
      `overflow:hidden`,
      `background:#fff`,
    ].join(";");
  } else {
    dialog.style.cssText =
      "width:30em;max-height:80vh;display:flex;flex-direction:column;padding:0;overflow:hidden;z-index:9999;background:#fff";
  }

  // ── Swatch + display ────────────────────────────────────────────────────────
  const swatchRow = document.createElement("div");
  swatchRow.style.cssText =
    "display:flex;align-items:stretch;flex-shrink:0;border-bottom:1px solid #ddd";

  const swatchEl = document.createElement("div");
  swatchEl.style.cssText = "width:5em;flex-shrink:0";

  const displayDiv = document.createElement("div");
  displayDiv.style.cssText =
    "flex:1;padding:0.3em 0.6em;font-size:0.82em;font-family:monospace;" +
    "display:flex;flex-direction:column;justify-content:center;gap:0.1em;background:#f8f8f8";

  const hexDisplay = document.createElement("span");
  const rgbDisplay = document.createElement("span");
  displayDiv.append(hexDisplay, rgbDisplay);
  swatchRow.append(swatchEl, displayDiv);

  // ── Tab bar ─────────────────────────────────────────────────────────────────
  const tabBar = document.createElement("div");
  tabBar.style.cssText =
    "display:flex;flex-wrap:wrap;background:#eee;border-bottom:1px solid #ccc;flex-shrink:0";

  // ── Tab content ─────────────────────────────────────────────────────────────
  const tabContent = document.createElement("div");
  tabContent.style.cssText = "flex:1;overflow-y:auto;padding:0.6em";

  // ── Bottom bar ──────────────────────────────────────────────────────────────
  const bottomBar = document.createElement("div");
  bottomBar.style.cssText =
    "display:flex;justify-content:space-between;padding:0.4em 0.6em;" +
    "background:#f4f4f4;flex-shrink:0;border-top:1px solid #ccc";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "OK";
  bottomBar.append(cancelBtn, okBtn);

  dialog.append(swatchRow, tabBar, tabContent, bottomBar);
  document.body.append(dialog);

  // ── Apply ───────────────────────────────────────────────────────────────────
  function applyColor(rgba: RGBA, css: string) {
    currentRgba = rgba;
    colorRef.value = css;
    cell.dispatchEvent(new Event("input", { bubbles: true }));
    setSwatchColor(swatchEl, css);
    hexDisplay.textContent = fmtHex(rgba.r, rgba.g, rgba.b, rgba.a);
    rgbDisplay.textContent = fmtRgb(rgba.r, rgba.g, rgba.b, rgba.a);
  }

  // Seed display without dispatching
  setSwatchColor(swatchEl, initialCss);
  hexDisplay.textContent = fmtHex(
    initialRgba.r,
    initialRgba.g,
    initialRgba.b,
    initialRgba.a,
  );
  rgbDisplay.textContent = fmtRgb(
    initialRgba.r,
    initialRgba.g,
    initialRgba.b,
    initialRgba.a,
  );

  // ── Slider helper ───────────────────────────────────────────────────────────
  function makeSliderRow(
    label: string,
    min: number,
    max: number,
    initial: number,
    onChange: (v: number) => void,
  ): HTMLElement {
    const row = document.createElement("div");
    row.style.cssText =
      "display:grid;grid-template-columns:5.5em 1fr 3em;align-items:center;" +
      "gap:0.4em;margin-bottom:0.5em";
    const lbl = document.createElement("span");
    lbl.textContent = label;
    lbl.style.cssText = "font-size:0.85em;text-align:right";
    const slider = addName(document.createElement("input"));
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = "1";
    slider.value = String(Math.round(initial));
    slider.style.width = "100%";
    const valLbl = document.createElement("span");
    valLbl.textContent = String(Math.round(initial));
    valLbl.style.cssText =
      "font-size:0.8em;font-family:monospace;text-align:right";
    slider.addEventListener("input", () => {
      valLbl.textContent = slider.value;
      onChange(slider.valueAsNumber);
    });
    row.append(lbl, slider, valLbl);
    return row;
  }

  // ── Tab builders ────────────────────────────────────────────────────────────
  function buildStringTab(): HTMLElement {
    const div = document.createElement("div");
    const input = document.createElement("input");
    input.type = "text";
    input.value = colorRef.value;
    input.style.cssText =
      "width:100%;box-sizing:border-box;font-family:monospace;font-size:0.9em;margin-bottom:0.4em";
    const status = document.createElement("div");
    status.style.cssText = "font-size:0.85em;margin-bottom:0.4em";
    const preview = document.createElement("div");
    preview.style.cssText =
      "height:2em;border:1px solid #ccc;border-radius:2px";
    function validate() {
      const rgba = parseCssColorToRgba(input.value);
      if (rgba) {
        status.textContent = "✓ Valid";
        status.style.color = "green";
        preview.style.backgroundColor = input.value;
        applyColor(rgba, input.value);
      } else {
        status.textContent = "✗ Invalid color";
        status.style.color = "red";
      }
    }
    input.addEventListener("input", validate);
    validate();
    div.append(input, status, preview);
    return div;
  }

  function buildSwatchGrid(colors: readonly string[]): HTMLElement {
    if (colors.length === 0) {
      const msg = document.createElement("p");
      msg.style.color = "#888";
      msg.textContent = "None yet.";
      return msg;
    }
    const grid = document.createElement("div");
    grid.style.cssText = "display:flex;flex-wrap:wrap;gap:0.35em";
    for (const css of colors) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = css;
      btn.style.cssText =
        "width:2.4em;height:2.4em;border-radius:3px;cursor:pointer;" +
        "border:2px solid transparent;flex-shrink:0";
      btn.style.backgroundColor = css;
      if (css === colorRef.value) btn.style.borderColor = "#333";
      btn.addEventListener("click", () => {
        const rgba = parseCssColorToRgba(css) ?? currentRgba;
        applyColor(rgba, css);
        grid
          .querySelectorAll<HTMLButtonElement>("button")
          .forEach((b) => (b.style.borderColor = "transparent"));
        btn.style.borderColor = "#333";
      });
      grid.append(btn);
    }
    return grid;
  }

  function buildRgbTab(): HTMLElement {
    const div = document.createElement("div");
    let { r, g, b } = currentRgba;
    let ca = Math.round(currentRgba.a * 100);
    const extraDisplay = document.createElement("div");
    extraDisplay.style.cssText =
      "font-family:monospace;font-size:0.8em;color:#555;margin-top:0.4em";
    function update() {
      applyColor({ r, g, b, a: ca / 100 }, fmtRgb(r, g, b, ca / 100));
      extraDisplay.textContent = fmtHex(r, g, b, ca / 100);
    }
    div.append(
      makeSliderRow("Red", 0, 255, r, (v) => {
        r = v;
        update();
      }),
      makeSliderRow("Green", 0, 255, g, (v) => {
        g = v;
        update();
      }),
      makeSliderRow("Blue", 0, 255, b, (v) => {
        b = v;
        update();
      }),
      makeSliderRow("Alpha %", 0, 100, ca, (v) => {
        ca = v;
        update();
      }),
      extraDisplay,
    );
    extraDisplay.textContent = fmtHex(r, g, b, currentRgba.a);
    return div;
  }

  function buildHwbTab(): HTMLElement {
    const div = document.createElement("div");
    let [h, w, bk] = rgbToHwb(currentRgba.r, currentRgba.g, currentRgba.b);
    let ca = Math.round(currentRgba.a * 100);
    const extraDisplay = document.createElement("div");
    extraDisplay.style.cssText =
      "font-family:monospace;font-size:0.8em;color:#555;margin-top:0.4em";
    function update() {
      const [r, g, b] = hwbToRgb(h, w, bk);
      const a = ca / 100;
      applyColor({ r, g, b, a }, fmtHwb(h, w, bk, a));
      extraDisplay.textContent = fmtHex(r, g, b, a) + "  " + fmtRgb(r, g, b, a);
    }
    div.append(
      makeSliderRow("Hue°", 0, 360, h, (v) => {
        h = v;
        update();
      }),
      makeSliderRow("White %", 0, 100, w, (v) => {
        w = v;
        update();
      }),
      makeSliderRow("Black %", 0, 100, bk, (v) => {
        bk = v;
        update();
      }),
      makeSliderRow("Alpha %", 0, 100, ca, (v) => {
        ca = v;
        update();
      }),
      extraDisplay,
    );
    const [r0, g0, b0] = hwbToRgb(h, w, bk);
    extraDisplay.textContent =
      fmtHex(r0, g0, b0, currentRgba.a) +
      "  " +
      fmtRgb(r0, g0, b0, currentRgba.a);
    return div;
  }

  function buildHslTab(): HTMLElement {
    const div = document.createElement("div");
    let [h, s, l] = rgbToHsl(currentRgba.r, currentRgba.g, currentRgba.b);
    let ca = Math.round(currentRgba.a * 100);
    const extraDisplay = document.createElement("div");
    extraDisplay.style.cssText =
      "font-family:monospace;font-size:0.8em;color:#555;margin-top:0.4em";
    function update() {
      const [r, g, b] = hslToRgb(h, s, l);
      const a = ca / 100;
      applyColor({ r, g, b, a }, fmtHsl(h, s, l, a));
      extraDisplay.textContent = fmtHex(r, g, b, a) + "  " + fmtRgb(r, g, b, a);
    }
    div.append(
      makeSliderRow("Hue°", 0, 360, h, (v) => {
        h = v;
        update();
      }),
      makeSliderRow("Sat %", 0, 100, s, (v) => {
        s = v;
        update();
      }),
      makeSliderRow("Light %", 0, 100, l, (v) => {
        l = v;
        update();
      }),
      makeSliderRow("Alpha %", 0, 100, ca, (v) => {
        ca = v;
        update();
      }),
      extraDisplay,
    );
    const [r0, g0, b0] = hslToRgb(h, s, l);
    extraDisplay.textContent =
      fmtHex(r0, g0, b0, currentRgba.a) +
      "  " +
      fmtRgb(r0, g0, b0, currentRgba.a);
    return div;
  }

  function buildRainbowTab(): HTMLElement {
    const container = document.createElement("div");
    container.append(buildSwatchGrid([...myRainbow]));

    const header = document.createElement("p");
    header.style.cssText =
      "margin:0.7em 0 0.4em;font-size:0.82em;color:#444;font-style:italic";
    header.textContent =
      "These colors are all bright and distinct and all look good against a black or white background.";
    container.append(header);

    for (const { name, color, desc } of myRainbowInfo) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:baseline;gap:0.35em;margin-bottom:0.2em;font-size:0.82em";

      const dot = document.createElement("span");
      dot.style.cssText =
        `width:0.85em;height:0.85em;border-radius:2px;` +
        `background:${color};flex-shrink:0;display:inline-block;position:relative;top:0.1em`;

      const nameEl = document.createElement("strong");
      nameEl.style.cssText = "white-space:nowrap";
      nameEl.textContent = name + " —";

      const descEl = document.createElement("span");
      descEl.style.cssText = "color:#555;flex:1;min-width:0";
      descEl.textContent = desc;

      row.append(dot, nameEl, descEl);
      container.append(row);
    }
    return container;
  }

  // ── Tab switching ───────────────────────────────────────────────────────────
  type TabName = "String" | "Recent" | "Rainbow" | "RGB" | "HWB" | "HSL";
  const TAB_BUILDERS: Record<TabName, () => HTMLElement> = {
    String: buildStringTab,
    Recent: buildRecentTab,
    Rainbow: buildRainbowTab,
    RGB: buildRgbTab,
    HWB: buildHwbTab,
    HSL: buildHslTab,
  };

  function buildRecentTab() {
    return buildSwatchGrid(recentColors);
  }

  const tabBtns = new Map<TabName, HTMLButtonElement>();
  for (const name of Object.keys(TAB_BUILDERS) as TabName[]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = name;
    btn.style.cssText =
      "padding:0.3em 0.6em;border:none;background:transparent;cursor:pointer;" +
      "border-bottom:2px solid transparent";
    btn.addEventListener("click", () => showTab(name));
    tabBar.append(btn);
    tabBtns.set(name, btn);
  }

  function showTab(name: TabName) {
    tabContent.replaceChildren(TAB_BUILDERS[name]());
    tabBtns.forEach((btn, n) => {
      btn.style.fontWeight = n === name ? "bold" : "";
      btn.style.borderBottomColor = n === name ? "#333" : "transparent";
    });
  }

  showTab("RGB");

  // ── Close logic ─────────────────────────────────────────────────────────────
  let committed = false;

  okBtn.addEventListener("click", () => {
    committed = true;
    dialog.close();
  });
  cancelBtn.addEventListener("click", () => dialog.close());

  dialog.addEventListener("close", () => {
    addToRecentColors(colorRef.value);
    if (!committed) {
      colorRef.value = initialCss;
      cell.dispatchEvent(new Event("input", { bubbles: true }));
    }
    dialog.remove();
  });

  dialog.showModal();
}

// MARK: Schedule section builder

function buildScheduleSection(
  info: ScheduleInfo,
  showableDescription: string,
): HTMLElement {
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
    section.replaceWith(buildScheduleSection(info, showableDescription));
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
  legend.append(addBtn, " ", sortBtn, " ", copyBtn);
  section.append(legend);

  const table = document.createElement("table");
  const thead = table.createTHead();
  const headerRow = thead.insertRow();
  const valueHeaders =
    info.type === "point"
      ? ["x", "y", "Canvas"]
      : info.type === "rectangle"
        ? ["x", "y", "width", "height", "Canvas"]
        : ["Value"];
  for (const h of [
    info.editDurations ? "Duration (ms)" : "Time (ms)",
    ...valueHeaders,
    "Ease ↓",
    "",
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
    }
  }
  updateEaseVisibility();

  table.append(tbody);
  section.append(table);
  return section;
}

function serializeComponent(child: Showable): SerializedChild {
  const rk =
    child.registryKey ??
    componentRegistryKey.get(child) ??
    (componentRegistry.has(child.description) ? child.description : undefined) ??
    "";
  const entry: SerializedChild = {
    registryKey: rk,
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
  return entry;
}

async function pasteInto(target: Showable, selectable: Selectable) {
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
  updateComponentEditor(selectable);
  updateScheduleEditor(selectedSlideChild);
}

function updateComponentEditor(selectable: Selectable) {
  const rootComponents = selectable.components;
  componentsEditorFieldset.hidden = rootComponents === undefined;
  if (rootComponents === undefined) return;

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

  function renderComponentTree(container: Showable, depth: number) {
    const siblings = container.components ?? [];
    for (let idx = 0; idx < siblings.length; idx++) {
      const child = siblings[idx];
      const row = document.createElement("div");
      row.style.cssText = `display:flex;align-items:center;gap:0.4em;padding-left:${depth * 1.2}em`;

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "✎ " + child.description;
      editBtn.style.cssText = "flex:1;text-align:left";
      if (child === selectedSlideChild) editBtn.style.fontWeight = "bold";
      editBtn.addEventListener("click", () => {
        selectedSlideChild = child;
        updateComponentEditor(selectable);
        updateScheduleEditor(child);
      });

      function moveChild(fromIdx: number, toIdx: number) {
        const arr = container.components!;
        const [item] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, item);
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

      if (child.components !== undefined) {
        renderComponentTree(child, depth + 1);
      }
    }
  }

  // Root row — the top-level Showable itself, shown above its children.
  const rootRow = document.createElement("div");
  rootRow.style.cssText = "display:flex;align-items:center;gap:0.4em";

  const rootEditBtn = document.createElement("button");
  rootEditBtn.type = "button";
  rootEditBtn.textContent = "✎ " + selectable.description;
  rootEditBtn.style.cssText = "flex:1;text-align:left";
  if (selectedSlideChild === null) rootEditBtn.style.fontWeight = "bold";
  rootEditBtn.addEventListener("click", () => {
    selectedSlideChild = null;
    updateComponentEditor(selectable);
    updateScheduleEditor(selectable);
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

  rootRow.append(rootEditBtn, rootCopyBtn, rootPasteBtn);
  list.append(rootRow);

  renderComponentTree(selectable as Showable, 0);
  componentsEditorFieldset.append(list);

  // Toolbar: add select + add button.
  // addTarget: where the new component goes (null = add button disabled).
  const addTarget: Showable | null =
    selectedSlideChild === null
      ? (selectable as Showable)
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
    addTarget !== null
      ? `+ Add to "${addTarget.description}"`
      : "+ Add";
  addBtn.disabled = addTarget === null;
  addBtn.addEventListener("click", () => {
    if (!addTarget) return;
    const factory = componentRegistry.get(addSelect.value);
    if (!factory) return;
    const newChild = factory();
    newChild.registryKey = addSelect.value;
    componentRegistryKey.set(newChild, addSelect.value);
    addTarget.components!.push(newChild);
    selectedSlideChild = newChild;
    updateComponentEditor(selectable);
    updateScheduleEditor(newChild);
  });

  toolbar.append(addSelect, addBtn);
  componentsEditorFieldset.append(toolbar);
  // Restore scroll now that both list and toolbar are in the DOM, so
  // list.clientHeight reflects its final height and browser clamping is correct.
  list.scrollTop = wasAtBottom ? list.scrollHeight : savedScrollTop;
}

function updateScheduleEditor(
  selectable: Selectable,
  historySelectValue?: string,
) {
  scheduleEditorFieldset.replaceChildren();
  editingRectKf = null;
  viewingRectKfs.clear();
  markerSyncCallbacks.clear();
  editingPointKf = null;
  viewingPointKfs.clear();
  pointSyncCallbacks.clear();
  draggingPoint = null;
  // History is always saved/loaded at the slide level, even when the schedule
  // editor is open on an individual child component.
  const saveTarget = currentSaveTarget();
  if (saveTarget) {
    scheduleHistoryControls.hidden = false;
    refreshHistoryUI(saveTarget, historySelectValue);
  } else {
    scheduleHistoryControls.hidden = true;
  }
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

  let customPanel: HTMLElement | null = null;
  if (isTraditionalText) {
    customPanel = buildTraditionalTextPanel(selectable);
    scheduleEditorFieldset.append(customPanel);
  } else if (slideComponent) {
    customPanel = buildSlideComponentPanel(slideComponent);
    scheduleEditorFieldset.append(customPanel);
  }

  for (const info of scalars ?? []) {
    const section = buildScalarSection(info);
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
    const section = buildScheduleSection(info, selectable.description);
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
    (debug[select.selectedIndex]?.selectable as Showable | undefined);
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
    viewingPointKfs.size === 0
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
  // Read the unload backup BEFORE sessionStorage.clear() wipes it below.
  const unloadBackup = sessionStorage.getItem("pendingScheduleSave");
  // Hide the canvas until DB restoration is complete to prevent the TypeScript-
  // default state from flashing briefly before the saved state is applied.
  canvas.style.visibility = "hidden";
  // Capture TypeScript defaults before any DB restoration, so they're available
  // as the "reset" option in the history select throughout this session.
  captureDefaults();
  // Restore the most recent DB entry for every chapter — keeps edits alive
  // across Vite hot-reloads without the user having to manually click Load.
  void initFromDB(unloadBackup);

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
  draggingMarker = null;
  draggingPoint = null;
});
canvas.addEventListener("pointercancel", () => {
  isDragging = false;
  draggingMarker = null;
  draggingPoint = null;
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

// MARK: Resizable pane dividers

/**
 * Wire up a horizontal drag handle that resizes the top pane within its column.
 * The bottom pane automatically fills whatever space remains (flex: 1).
 */
function initResizeHandle(handle: HTMLElement, topPane: HTMLElement): void {
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
      topPane.style.height = `${newH}px`;
      if (zoomSelect.value === "fit") zoomToFit();
    };

    const onUp = () => {
      handle.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
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
      leftCol.style.flex = `0 0 ${newW}px`;
      if (zoomSelect.value === "fit") zoomToFit();
    };

    const onUp = () => {
      vhandle.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
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
