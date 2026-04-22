import "./canvas-recorder.css";

import "../src/morph-test.ts";
import {
  assertNonNullable,
  FIGURE_SPACE,
  parseFloatX,
  parseIntX,
  ReadOnlyRect,
} from "phil-lib/misc.ts";
import {
  AnimationLoop,
  getById,
  querySelector,
  querySelectorAll,
} from "phil-lib/client-misc.ts";
import {
  Output,
  StreamTarget,
  CanvasSource,
  Mp4OutputFormat,
  AudioBufferSource,
  QUALITY_HIGH,
} from "mediabunny";
import { Selectable, Showable } from "../src/showable.ts";
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
import { AudioBuilder } from "./audio-builder.ts";

import { morphTest } from "../src/morph-test.ts";
import { top } from "../src/peano-fourier/top.ts";
import { showcase } from "../src/showcase.ts";
import { peanoArithmetic } from "../src/peano-arithmetic.ts";
import { sierpińskiTop } from "../src/sierpiński.ts";
import { strokeColorsTest } from "../src/stroke-colors-test.ts";
import { createNineShapesComponent, shadowTest } from "../src/shadow-test.ts";
import {
  createFunctionGraphComponent,
  createRectangleComponent,
  createSingleImageComponent,
} from "../src/slide-components.ts";

/**
 * Maps URL `?toShow=` keys to available video options.
 * Fill in the `description` field for each entry — it appears in the selection page.
 */
const showableOptions = new Map<
  string,
  { item: Showable; description: string }
>([
  //["test", {item:undefined!, description:'</a><b>"只有经过中文测试，才算真正经过了测试！'}],
  ["showcase", { item: showcase, description: "Ideas to copy and paste." }],
  [
    "sierpiński",
    {
      item: sierpińskiTop,
      description:
        "Beautiful math, as seen here:  https://youtu.be/rEP1VevV3WI",
    },
  ],
  [
    "peano-fourier",
    {
      item: top,
      description:
        "Fun with math, the last scene of: https://www.youtube.com/watch?v=Imc1w0xNb4E",
    },
  ],
  [
    "peano-arithmetic",
    {
      item: peanoArithmetic,
      description:
        "Make take on Peano arithmetic, as seen here:  https://youtu.be/4_Wiwai-gO8",
    },
  ],
  [
    "morph-test",
    {
      item: morphTest,
      description:
        "Morphing the Peano Curve, the first part of https://www.youtube.com/watch?v=Imc1w0xNb4E",
    },
  ],
  [
    "stroke-colors-test",
    {
      item: strokeColorsTest,
      description:
        "Demonstrating and testing strokeColors(), as seen here:  https://youtu.be/MxpNJ2k86U0",
    },
  ],
  [
    "shadow-test",
    {
      item: shadowTest,
      description: "Halftone drop-shadow effect demo.",
    },
  ],
]);

/**
 * Reads the `?toShow=` query parameter and returns the matching {@link Showable}.
 *
 * Strings are NFC-normalized before comparison so that characters like "ń"
 * match regardless of how the browser percent-encodes them.
 *
 * If the parameter is missing or unrecognized, the page body is replaced with
 * a minimal link list and this function throws, halting the rest of the module.
 */
function resolveToShow(): Showable {
  const normalizedOptions = new Map(
    [...showableOptions.entries()].map(([k, v]) => [k.normalize("NFC"), v]),
  );

  const raw = new URLSearchParams(location.search).get("toShow");
  if (raw !== null) {
    const found = normalizedOptions.get(raw.normalize("NFC"));
    if (found) {
      return found.item;
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
const toShow = resolveToShow();

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
const CANVAS_W = 3840;
const CANVAS_H = 2160;

function mainTransform() {
  return new DOMMatrixReadOnly().scale(CANVAS_W / 16, CANVAS_H / 9);
}

// ---------------------------------------------------------------------------
// Zoom & pan
// ---------------------------------------------------------------------------

const viewport = getById("canvasViewport", HTMLDivElement);
const zoomSelect = getById("zoomSelect", HTMLSelectElement);

let currentScale = 1;
let panX = 0;
let panY = 0;

/**
 * Clamps a pan value so the canvas always covers the visible window area —
 * no empty space in either dimension.
 *
 * For each axis independently:
 *  - canvas larger than window  → pan ∈ [windowSize - scaledCanvas, 0]
 *  - canvas same size or smaller → pan = 0  (pinned; nothing to reveal)
 */
function clampPan(scale: number, px: number, py: number): [number, number] {
  const scaledW = CANVAS_W * scale;
  const scaledH = CANVAS_H * scale;
  // lower bound is negative (or 0); upper bound is always 0
  const minX = Math.min(0, window.innerWidth - scaledW);
  const minY = Math.min(0, window.innerHeight - scaledH);
  return [Math.max(minX, Math.min(0, px)), Math.max(minY, Math.min(0, py))];
}

function applyZoom(scale: number, px = panX, py = panY) {
  currentScale = scale;
  [panX, panY] = clampPan(scale, px, py);
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  viewport.style.width = `${Math.round(CANVAS_W * scale)}px`;
  viewport.style.height = `${Math.round(CANVAS_H * scale)}px`;
}

function zoomToFit() {
  const scale = (window.innerWidth * 0.95) / CANVAS_W;
  applyZoom(scale, 0, 0);
}

zoomSelect.addEventListener("change", () => {
  if (zoomSelect.value === "fit") {
    zoomToFit();
  } else {
    applyZoom(parseFloat(zoomSelect.value) / devicePixelRatio, 0, 0);
  }
});

window.addEventListener("resize", () => {
  if (zoomSelect.value === "fit") {
    zoomToFit();
  }
});

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
  toShow.show({ timeInMs, context, globalTime: timeInMs });
  if (live) {
    drawScheduleMarkers(context);
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
 * When we get to the end of the section, pause.
 */
const pauseRadioButton = querySelector(
  'input[name="onSectionEnd"][value="pause"]',
  HTMLInputElement,
);
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

const audioCtx = new AudioContext();
const gainNode = audioCtx.createGain();
gainNode.connect(audioCtx.destination);

/** Set to true once the AudioBuffer has been fully built and is safe to play. */
let audioReady = false;
let audioSourceNode: AudioBufferSourceNode | null = null;
/** audioCtx.currentTime at the moment startAudio() last started a source node. */
let audioCtxStartTime = 0;
/** Media position (ms) at the moment startAudio() last started a source node. */
let audioMediaStartMs = 0;
let audioPlaybackRate = 1;

function currentAudioTimeMs(): number {
  return (
    audioMediaStartMs +
    (audioCtx.currentTime - audioCtxStartTime) * audioPlaybackRate * 1000
  );
}

function startAudio(fromMs: number): void {
  stopAudio();
  if (!audioReady) return;
  audioCtx.resume(); // no-op if already running; needed on first play gesture
  const source = audioCtx.createBufferSource();
  source.buffer = audioBuilder.getAudioBuffer();
  source.playbackRate.value = audioPlaybackRate;
  source.connect(gainNode);
  const contextNow = audioCtx.currentTime;
  source.start(contextNow, fromMs / 1000);
  audioSourceNode = source;
  audioCtxStartTime = contextNow;
  audioMediaStartMs = fromMs;
}

function stopAudio(): void {
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
  if (audioSourceNode) {
    const currentMs = currentAudioTimeMs();
    audioCtxStartTime = audioCtx.currentTime;
    audioMediaStartMs = currentMs;
    audioSourceNode.playbackRate.value = rate;
  }
  audioPlaybackRate = rate;
}

{
  const muteCheckbox = getById("muteAudio", HTMLInputElement);
  const volumeSlider = getById("volumeAudio", HTMLInputElement);
  muteCheckbox.addEventListener("input", () => {
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

const audioBuilder = new AudioBuilder(toShow.duration);

(async () => {
  async function doIt(item: Selectable, offset: number) {
    if (item.soundClips) {
      for (const clip of item.soundClips) {
        await audioBuilder.add(
          clip.source,
          offset + clip.startMsIntoScene,
          clip.startMsIntoClip,
          clip.lengthMs,
        );
      }
    }
    if (item.children) {
      for (const { child, start } of item.children) {
        await doIt(child, offset + start);
      }
    }
  }
  const time1 = performance.now();
  await doIt(toShow, 0);
  const time2 = performance.now();
  audioReady = true;
  console.log(`Audio ready in ${(time2 - time1).toFixed(0)} ms.`);
})();

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

  if (!audioSourceNode) {
    // No source node running: first play, after pause/seek, or after repeat.
    let startMs = playPositionSeconds.valueAsNumber * 1000;
    if (startMs >= sectionEndTime && !continueRadioButton.checked) {
      // At the end — jump to the beginning.
      startMs = sectionStartTime;
      loadPlayPositionSeconds(startMs);
      loadPlayPositionRange();
    }
    startAudio(startMs);
    // If audio isn't built yet, hold the current frame until it is.
    if (!audioSourceNode) {
      showFrame(playPositionSeconds.valueAsNumber * 1000, true);
      return;
    }
  }

  const timeInMs = currentAudioTimeMs();

  if (timeInMs >= sectionEndTime && !continueRadioButton.checked) {
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

async function startRecording() {
  stopAudio();
  startRecordingButton.disabled = true;
  liveControls.disabled = true;
  cancelRecordingButton.disabled = false;
  canceled = false;

  animationLoop.cancel();

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

  const audioBuffer = audioBuilder.getAudioBuffer();
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
    const timeInMs = (frameNumber + 0.5) * frameDuration;
    if (timeInMs > toShow.duration) {
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
}

startRecordingButton.addEventListener("click", startRecording);
cancelRecordingButton.addEventListener("click", () => {
  canceled = true;
  cancelRecordingButton.disabled = true;
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
dump(toShow);
//console.table(debug);

/**
 * The drop down list containing the complete list of sections.
 */
const select = getById("chapterSelector", HTMLSelectElement);
debug.forEach((value) => {
  const option = document.createElement("option");
  option.textContent = value.prefix + value.description;
  option.value = value.description;
  select.append(option);
});

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
const showEditorCheckbox = getById("showEditor", HTMLInputElement);

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
  startLogicalX: number;
  startLogicalY: number;
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

/** Registry of component factories available in the "Add" dropdown. */
const componentRegistry = new Map<string, () => Showable>([
  ["Rectangle", () => createRectangleComponent()],
  ["Function Graph (sin)", () => createFunctionGraphComponent()],
  ["Function Graph (x²)", () => createFunctionGraphComponent((x) => x * x)],
  ["Nine Shapes (Shadow Test)", () => createNineShapesComponent()],
  ["Static Image", () => createSingleImageComponent()],
]);

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
  sectionStartTime = info.start;
  sectionEndTime = info.end;
  if (sectionEndTime < toShow.duration) {
    // The exact time when one section ends and the next begins typically belongs to the
    // next section.  MakeShowableInSeries ensures that we don't have a frame with
    // both or neither.  This is only an issue when you pause at the very end of a section.
    sectionEndTime -= 0.1;
  }
  playPositionRange.min = sectionStartTime.toString();
  playPositionRange.max = sectionEndTime.toString();
  // playPositionRange automatically limits you to the range of the currently selected chapter.
  // Make the number match in this case.
  loadPlayPositionSeconds(playPositionRange.valueAsNumber);
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
  sessionStorage.setItem("zoomSelect", zoomSelect.value);
  sessionStorage.setItem("panX", panX.toString());
  sessionStorage.setItem("panY", panY.toString());
}

if (import.meta.hot) {
  // Changing a typescript file invokes this.
  // Changing a css file would cause vite:beforeUpdate, instead.
  import.meta.hot.on("vite:beforeFullReload", (data) => {
    saveState();
  });
}

addEventListener("pagehide", (event) => {
  saveState();
});

// MARK: Schedule Editor

type ScheduleInfo = NonNullable<Selectable["schedules"]>[number];

// MARK: Schedule persistence (IndexedDB)

const toShowKey = new URLSearchParams(location.search).get("toShow") ?? "";

type SerializedKf = { time: number; value: unknown; easeAfter?: string };
type SerializedSchedule = {
  description: string;
  type: string;
  keyframes: SerializedKf[];
};
type SerializedChild = { registryKey: string; schedules: SerializedSchedule[] };
type HistoryEntry = {
  timestamp: number;
  schedules: SerializedSchedule[];
  components?: SerializedChild[];
};
type HistoryRecord = { selectableKey: string; entries: HistoryEntry[] };

const MAX_HISTORY_ENTRIES = 20;

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

function easeName(fn: ((t: number) => number) | undefined): string | undefined {
  if (!fn) return undefined;
  if (fn === ease) return "ease";
  if (fn === easeIn) return "easeIn";
  if (fn === easeOut) return "easeOut";
  return "hold";
}

function easeFromName(
  name: string | undefined,
): ((t: number) => number) | undefined {
  if (name === "ease") return ease;
  if (name === "easeIn") return easeIn;
  if (name === "easeOut") return easeOut;
  if (name === "hold") return (t) => (t < 1 ? 0 : 1);
  return undefined;
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

function applySnapshot(
  schedules: readonly ScheduleInfo[],
  snapshot: SerializedSchedule[],
) {
  for (const serialized of snapshot) {
    const live = schedules.find(
      (s) =>
        s.description === serialized.description && s.type === serialized.type,
    );
    if (!live) continue;
    const liveArr = live.schedule as unknown[];
    liveArr.length = 0;
    for (const skf of serialized.keyframes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const kf: any = { time: skf.time, value: skf.value };
      const fn = easeFromName(skf.easeAfter);
      if (fn) kf.easeAfter = fn;
      liveArr.push(kf);
    }
  }
}

function selectableKey(selectable: Selectable): string {
  return `${toShowKey}|${selectable.description}`;
}

/** Reads history from IndexedDB and repopulates the history <select>. */
async function refreshHistoryUI(selectable: Selectable) {
  const record = await readHistory(selectableKey(selectable));
  const entries = record?.entries ?? [];
  scheduleHistorySelect.replaceChildren();
  if (entries.length === 0) {
    scheduleHistorySelect.hidden = true;
    loadScheduleBtn.hidden = true;
  } else {
    scheduleHistorySelect.hidden = false;
    loadScheduleBtn.hidden = false;
    for (let i = entries.length - 1; i >= 0; i--) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = new Date(entries[i].timestamp).toLocaleString();
      scheduleHistorySelect.append(opt);
    }
  }
}

/** Saves current schedule state to IndexedDB. */
async function saveScheduleState(selectable: Selectable) {
  const hasSchedules = !!selectable.schedules?.length;
  const hasChildren = Array.isArray(selectable.components);
  if (!hasSchedules && !hasChildren) return;
  const key = selectableKey(selectable);
  const record = await readHistory(key);
  const entries = record?.entries ?? [];
  const entry: HistoryEntry = {
    timestamp: Date.now(),
    schedules: hasSchedules ? serializeSchedules(selectable.schedules!) : [],
  };
  if (hasChildren) {
    entry.components = selectable.components!.flatMap((child) => {
      const registryKey = componentRegistryKey.get(child);
      if (!registryKey || !child.schedules?.length) return [];
      return [{ registryKey, schedules: serializeSchedules(child.schedules) }];
    });
  }
  entries.push(entry);
  while (entries.length > MAX_HISTORY_ENTRIES) entries.shift();
  await writeHistory(key, entries);
  await refreshHistoryUI(selectable);
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
  const index = parseInt(scheduleHistorySelect.value, 10);
  readHistory(selectableKey(target)).then((record) => {
    const entry = record?.entries[index];
    if (!entry) return;
    if (target.schedules?.length && entry.schedules.length) {
      applySnapshot(target.schedules, entry.schedules);
    }
    if (target.components !== undefined && entry.components) {
      target.components.length = 0;
      for (const sc of entry.components) {
        const factory = componentRegistry.get(sc.registryKey);
        if (!factory) continue;
        const child = factory();
        componentRegistryKey.set(child, sc.registryKey);
        if (child.schedules?.length)
          applySnapshot(child.schedules, sc.schedules);
        target.components.push(child);
      }
    }
    selectedSlideChild = null;
    updateComponentEditor(target);
    updateScheduleEditor(target);
  });
});

function saveOnUnload() {
  const selectable = currentSaveTarget();
  if (selectable) saveScheduleState(selectable);
}
window.addEventListener("beforeunload", saveOnUnload);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveOnUnload();
});

showEditorCheckbox.addEventListener("change", () => {
  scheduleEditorFieldset.hidden = !showEditorCheckbox.checked;
});

/** Convert any CSS color string to #rrggbb for <input type="color">. */
const _colorCanvas = document.createElement("canvas");
_colorCanvas.width = _colorCanvas.height = 1;
const _colorCtx = _colorCanvas.getContext("2d", { willReadFrequently: true })!;
function cssColorToHex(color: string): string {
  _colorCtx.clearRect(0, 0, 1, 1);
  _colorCtx.fillStyle = color;
  _colorCtx.fillRect(0, 0, 1, 1);
  const [r, g, b] = _colorCtx.getImageData(0, 0, 1, 1).data;
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function buildNumericInput(
  value: number,
  onChange: (n: number) => void,
): HTMLInputElement {
  const input = document.createElement("input");
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
  const select = document.createElement("select");
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

function scheduleToTypeScript(info: ScheduleInfo): string {
  function easeSuffix(fn: ((t: number) => number) | undefined): string {
    if (!fn) return "";
    if (fn === easeIn) return ", easeAfter: easeIn";
    if (fn === easeOut) return ", easeAfter: easeOut";
    return ", easeAfter: (t) => (t < 1 ? 0 : 1)"; // hold
  }

  function formatValue(value: unknown): string {
    if (info.type === "color" || info.type === "string") {
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
  return `[\n${rows.join("\n")}\n]`;
}

function buildScheduleSection(info: ScheduleInfo): HTMLElement {
  const section = document.createElement("fieldset");

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
    section.replaceWith(buildScheduleSection(info));
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
  addBtn.title = "Add keyframe at current time";
  addBtn.addEventListener("click", addKeyframeAtCurrentTime);
  const sortBtn = document.createElement("button");
  sortBtn.type = "button";
  sortBtn.textContent = "Sort";
  sortBtn.title = "Re-sort rows by time";
  sortBtn.addEventListener("click", () => {
    (info.schedule as (typeof info.schedule)[number][]).sort(
      (a, b) => a.time - b.time,
    );
    rebuild();
  });
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "📋";
  copyBtn.title = "Copy schedule as TypeScript";
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(scheduleToTypeScript(info));
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
  for (const h of ["Time (ms)", ...valueHeaders, "Ease ↓", ""]) {
    const th = document.createElement("th");
    th.textContent = h;
    headerRow.append(th);
  }

  const easeCells: HTMLTableCellElement[] = [];

  function updateEaseVisibility() {
    const maxTime = Math.max(...info.schedule.map((kf) => kf.time));
    easeCells.forEach((cell, i) => {
      cell.style.visibility = info.schedule[i].time >= maxTime ? "hidden" : "";
    });
  }

  const tbody = table.createTBody();
  for (let i = 0; i < info.schedule.length; i++) {
    const kf = info.schedule[i];
    const row = tbody.insertRow();

    // Time cell: editable input + "← now" button
    const timeInput = buildNumericInput(kf.time, (n) => {
      kf.time = n;
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
      updateEaseVisibility();
    });
    row.insertCell().append(timeInput, "\u00a0", nowBtn);

    if (info.type === "color") {
      const colorKf = kf as Keyframe<string>;
      const cell = row.insertCell();
      const input = document.createElement("input");
      input.type = "color";
      try {
        input.value = cssColorToHex(colorKf.value);
      } catch {
        /**/
      }
      input.addEventListener("input", () => {
        colorKf.value = input.value;
      });
      cell.append(input);
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
      const input = document.createElement("input");
      input.type = "text";
      input.value = strKf.value;
      input.addEventListener("input", () => {
        strKf.value = input.value;
      });
      cell.append(input);
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
    easeCells.push(easeCell);

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
    row.insertCell().append(deleteBtn);
  }
  updateEaseVisibility();

  table.append(tbody);
  section.append(table);
  return section;
}

function updateComponentEditor(selectable: Selectable) {
  const children = selectable.components;
  componentsEditorFieldset.hidden = children === undefined;
  if (children === undefined) return;

  componentsEditorFieldset.replaceChildren();

  // List of current children
  const list = document.createElement("div");
  list.style.cssText =
    "display:flex;flex-direction:column;gap:0.25em;margin-bottom:0.5em";
  for (const child of children) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:0.4em";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "✎ " + child.description;
    editBtn.style.cssText = "flex:1;text-align:left";
    if (child === selectedSlideChild) editBtn.style.fontWeight = "bold";
    editBtn.addEventListener("click", () => {
      selectedSlideChild = child;
      showEditorCheckbox.checked = true;
      updateComponentEditor(selectable);
      updateScheduleEditor(child);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "🗑";
    deleteBtn.addEventListener("click", () => {
      const idx = children.indexOf(child);
      if (idx !== -1) children.splice(idx, 1);
      if (selectedSlideChild === child) {
        selectedSlideChild = null;
        updateScheduleEditor(selectable);
      }
      updateComponentEditor(selectable);
    });

    row.append(editBtn, deleteBtn);
    list.append(row);
  }
  componentsEditorFieldset.append(list);

  // Add row
  const addRow = document.createElement("div");
  addRow.style.cssText = "display:flex;align-items:center;gap:0.4em";

  const addSelect = document.createElement("select");
  for (const [key] of componentRegistry) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    addSelect.append(opt);
  }

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "+ Add";
  addBtn.addEventListener("click", () => {
    const factory = componentRegistry.get(addSelect.value);
    if (!factory) return;
    const newChild = factory();
    componentRegistryKey.set(newChild, addSelect.value);
    children.push(newChild);
    selectedSlideChild = newChild;
    showEditorCheckbox.checked = true;
    updateComponentEditor(selectable);
    updateScheduleEditor(newChild);
  });

  addRow.append(addSelect, addBtn);
  componentsEditorFieldset.append(addRow);
}

function updateScheduleEditor(selectable: Selectable) {
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
    refreshHistoryUI(saveTarget);
  } else {
    scheduleHistoryControls.hidden = true;
  }
  const schedules = selectable.schedules;
  if (!schedules?.length) {
    showEditorCheckbox.disabled = true;
    showEditorCheckbox.checked = false;
    scheduleEditorFieldset.hidden = true;
    return;
  }
  showEditorCheckbox.disabled = false;
  scheduleEditorFieldset.hidden = !showEditorCheckbox.checked;
  for (const info of schedules) {
    scheduleEditorFieldset.append(buildScheduleSection(info));
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

function drawScheduleMarkers(ctx: CanvasRenderingContext2D) {
  if (
    !editingRectKf &&
    viewingRectKfs.size === 0 &&
    !editingPointKf &&
    viewingPointKfs.size === 0
  )
    return;
  ctx.save();

  // View-mode rects: semi-transparent fill + stroke, drawn first (behind handles)
  ctx.strokeStyle = "#3498db";
  ctx.lineWidth = 0.05;
  for (const kf of viewingRectKfs) {
    if (kf === editingRectKf) continue; // edit mode takes visual priority
    const { x, y, width, height } = kf.value;
    ctx.fillStyle = "rgba(52, 152, 219, 0.2)";
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
  }

  // View-mode points: small blue circle
  for (const kf of viewingPointKfs) {
    if (kf === editingPointKf) continue;
    const { x, y } = kf.value;
    ctx.beginPath();
    ctx.arc(x, y, 0.15, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(52, 152, 219, 0.5)";
    ctx.fill();
    ctx.strokeStyle = "#3498db";
    ctx.lineWidth = 0.04;
    ctx.stroke();
  }

  // Edit-mode: rect outline + drag handles on top
  if (editingRectKf) {
    const { x, y, width, height } = editingRectKf.value;
    ctx.strokeStyle = "#e74c3c";
    ctx.lineWidth = 0.05;
    ctx.strokeRect(x, y, width, height);

    const RADIUS = 0.18;
    const positions = rectHandlePositions(editingRectKf.value);
    for (const handle of ["tl", "tr", "bl", "br", "center"] as RectHandle[]) {
      const pos = positions[handle];
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
    const { x, y } = editingPointKf.value;
    const active = draggingPoint === editingPointKf;
    const RADIUS = active ? 0.25 : 0.2;
    ctx.beginPath();
    ctx.arc(x, y, RADIUS, 0, 2 * Math.PI);
    ctx.fillStyle = active ? "white" : "#e74c3c";
    ctx.fill();
    ctx.strokeStyle = "#e74c3c";
    ctx.lineWidth = 0.04;
    ctx.stroke();
    // crosshair
    const ARM = RADIUS * 0.8;
    ctx.beginPath();
    ctx.moveTo(x - ARM, y);
    ctx.lineTo(x + ARM, y);
    ctx.moveTo(x, y - ARM);
    ctx.lineTo(x, y + ARM);
    ctx.strokeStyle = active ? "#e74c3c" : "white";
    ctx.lineWidth = 0.035;
    ctx.stroke();
  }

  ctx.restore();
}

function hitTestMarker(logX: number, logY: number) {
  if (!editingRectKf) return null;
  const HIT_RADIUS = 0.3;
  const positions = rectHandlePositions(editingRectKf.value);
  for (const handle of ["tl", "tr", "bl", "br", "center"] as RectHandle[]) {
    const pos = positions[handle];
    const dx = logX - pos.x;
    const dy = logY - pos.y;
    if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
      return { kf: editingRectKf, handle };
    }
  }
  return null;
}

function hitTestPointMarker(logX: number, logY: number): PointKf | null {
  if (!editingPointKf) return null;
  const HIT_RADIUS = 0.3;
  const { x, y } = editingPointKf.value;
  const dx = logX - x;
  const dy = logY - y;
  return dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS ? editingPointKf : null;
}

function applyPointDrag(logX: number, logY: number) {
  if (!draggingPoint) return;
  draggingPoint.value = { x: logX, y: logY };
  pointSyncCallbacks.get(draggingPoint)?.(draggingPoint.value);
}

function applyMarkerDrag(logX: number, logY: number, shiftKey = false) {
  if (!draggingMarker) return;
  const { kf, handle, startLogicalX, startLogicalY, startRect } =
    draggingMarker;
  const dx = logX - startLogicalX;
  const dy = logY - startLogicalY;
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
    let vx = logX - anchorX;
    let vy = logY - anchorY;
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
      playPositionSeconds.value = timeInSeconds;
      loadPlayPositionRange();
      querySelector(
        `input[name="onSectionEnd"][value="${state}"]`,
        HTMLInputElement,
      ).checked = true;
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
      applyZoom(parseFloat(savedZoom) / devicePixelRatio, savedPanX, savedPanY);
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
    draggingMarker = {
      kf: hit.kf,
      handle: hit.handle,
      startLogicalX: logical.x,
      startLogicalY: logical.y,
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
    applyMarkerDrag(logical.x, logical.y, pointerEvent.shiftKey);
    return;
  }
  if (draggingPoint) {
    const logical = clientToLogical(pointerEvent.clientX, pointerEvent.clientY);
    applyPointDrag(logical.x, logical.y);
    return;
  }
  if (isDragging) {
    applyZoom(
      currentScale,
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

// TODO when saving video, only save the currently selected section.
//  * That button should make it obvious if we are saving everything or just part.
//  * Add a way to record any range you want.
// TODO Reenable other buttons after recording.
//  * Probably, but no rush.
//  * It is so easy to hit refresh!
