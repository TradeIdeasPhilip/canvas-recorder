import "../src/morph-test.ts";
import {
  assertNonNullable,
  FIGURE_SPACE,
  parseFloatX,
  parseIntX,
} from "phil-lib/misc.ts";
import {
  AnimationLoop,
  getBlobFromCanvas,
  getById,
  querySelector,
  querySelectorAll,
} from "phil-lib/client-misc.ts";
import "./style.css";
import {
  Output,
  StreamTarget,
  CanvasSource,
  Mp4OutputFormat,
} from "mediabunny";
import { Selectable, Showable } from "../src/showable.ts";
import { downloadBlob } from "../src/utility.ts";
import { Point } from "../src/glib/path-shape.ts";
import { transform } from "../src/glib/transforms.ts";

// Consider setting toShow equal to one of these:
import { morphTest } from "../src/morph-test.ts";
import { top } from "../src/peano-fourier/top.ts";
import { showcase } from "../src/showcase.ts";
import { peanoArithmetic } from "../src/peano-arithmetic.ts";

const canvas = getById("main", HTMLCanvasElement);
const context = assertNonNullable(canvas.getContext("2d"));

/**
 * The top level item that we are viewing and/or saving.
 */
const toShow = peanoArithmetic;

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

let canvasSize: { readonly width: number; readonly height: number } | undefined;

// One-time setup (e.g. on init/mount)
const resizeObserver = new ResizeObserver((entries) => {
  canvasSize = undefined;
});

// Observe the canvas (or its wrapper div if you prefer)
resizeObserver.observe(canvas, { box: "device-pixel-content-box" });

/**
 *
 * @param timeInMs Draw the animation at this time.  The drawing code doesn't
 * know or care about the frame rate.  When saving I typically use 60 fps.  When
 * displaying live the framerate can vary depending how busy your computer is
 * and if it's plugged in or on battery.  The frames might all cover slightly
 * different amounts of time.
 * @param size How many pixels
 * * "live" means the right number of pixels to perfectly fill the canvas.
 * This can change if you resize the window.
 * * 4k and hd hav their normal meaning.
 */
function showFrame(timeInMs: number, size: "live" | "4k" | "hd") {
  if (size == "live") {
    if (!canvasSize) {
      // getClientRects forces a layout step.
      // The cost was about 0.2ms / frame
      // At 60 fps that's about 1.2% of our entire time.
      const clientRect = canvas.getClientRects()[0];
      canvasSize = {
        height: Math.round(clientRect.height * devicePixelRatio),
        width: Math.round(clientRect.width * devicePixelRatio),
      };
    }
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
  } else if (size == "4k") {
    canvas.width = 3840;
    canvas.height = 2160;
  } else {
    canvas.width = 1920;
    canvas.height = 1080;
  }
  context.reset();
  context.setTransform(mainTransform());
  toShow.show({ timeInMs, context, globalTime: timeInMs });
}
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

/**
 * The play head is located at (wall clock time - playOffset).
 *
 * NaN means uninitialized.  Use playPositionSeconds to reload this when needed.
 */
let playOffset = NaN;

let syncWithAudio = false;
const audioElement = querySelector("audio", HTMLAudioElement);
{
  const playControlsFieldset = getById("play-controls", HTMLFieldSetElement);
  const lockAudioAndVideoInput = getById("lock-audio-video", HTMLInputElement);
  lockAudioAndVideoInput.addEventListener("input", () => {
    syncWithAudio = lockAudioAndVideoInput.checked;
    playControlsFieldset.disabled = syncWithAudio;
    if (syncWithAudio && audioElement.paused) {
      audioElement.currentTime = playPositionSeconds.valueAsNumber;
    }
  });
}

/**
 * Redraw the canvas and update some other controls.
 *
 * This is for live / realtime drawing.  This is disabled when we are saving the file.
 */
const animationLoop = new AnimationLoop((timeInMS: number) => {
  if (syncWithAudio) {
    playOffset = NaN;
    timeInMS = sectionStartTime + audioElement.currentTime * 1000;
    loadPlayPositionSeconds(timeInMS);
    loadPlayPositionRange();
  } else if (!playCheckBox.checked) {
    // Paused.  Copy time from the numerical input.
    playPositionSeconds.disabled = false;
    timeInMS = playPositionSeconds.valueAsNumber * 1000;
    playOffset = NaN;
  } else {
    // Playing.  (Not paused.)
    playPositionSeconds.disabled = true;
    if (isNaN(playOffset)) {
      // Starting fresh.
      if (
        playPositionSeconds.valueAsNumber * 1000 >= sectionEndTime &&
        !continueRadioButton.checked
      ) {
        // At the end.  Jump to the beginning.
        loadPlayPositionSeconds(sectionStartTime);
      }
      playOffset = timeInMS - playPositionSeconds.valueAsNumber * 1000;
    }
    timeInMS -= playOffset;
    if (timeInMS >= sectionEndTime && !continueRadioButton.checked) {
      // At the end and not instructed to continue past the end.
      playOffset = NaN;
      if (repeatRadioButton.checked) {
        timeInMS = sectionStartTime;
      } else {
        timeInMS = sectionEndTime;
        playCheckBox.checked = false;
        playPositionSeconds.disabled = false;
      }
    }
    loadPlayPositionSeconds(timeInMS);
    loadPlayPositionRange();
  }
  showFrame(timeInMS, "live");
});

playPositionRange.addEventListener("input", () => {
  playOffset = NaN;
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
      playOffset = NaN;
      event.preventDefault();
      break;
    }
  }
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
  audioElement.pause();
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

  const startTime = performance.now();

  await output.start();
  infoDiv.innerHTML = "Recording in progress...";

  const frameDuration = 1000 / FPS;

  // Offline loop: draw + push frames (not limited to realtime)
  let frameNumber = 0;
  while (!canceled) {
    const timeInMS = (frameNumber + 0.5) * frameDuration;
    if (timeInMS > toShow.duration) {
      break;
    }
    showFrame(timeInMS, "4k");
    loadPlayPositionSeconds(timeInMS);
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
const select = querySelector("select", HTMLSelectElement);
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

/**
 * Change the GUI to match the current section.
 * Read the current section out of the <select> (drop down) element.
 */
function updateFromSelect() {
  playOffset = NaN;
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

const saveImageSecondsInput = getById("saveImageSeconds", HTMLInputElement);

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
  sessionStorage.setItem("saveImageSeconds", saveImageSecondsInput.value);
  sessionStorage.setItem(
    "play",
    playCheckBox.checked ? "checked" : "unchecked",
  );
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

// MARK: Save Image
{
  const saveButton = getById("saveImage", HTMLButtonElement);
  saveImageSecondsInput.addEventListener("input", () => {
    if (parseFloatX(saveImageSecondsInput.value) === undefined) {
      saveButton.disabled = true;
      saveImageSecondsInput.style.backgroundColor = "pink";
    } else {
      saveButton.disabled = false;
      saveImageSecondsInput.style.backgroundColor = "";
    }
  });

  getById("saveImage", HTMLButtonElement).addEventListener(
    "click",
    async () => {
      showFrame(
        assertNonNullable(parseFloatX(saveImageSecondsInput.value)) * 1000,
        "4k",
      );
      const filename = `frame-${saveImageSecondsInput.value}.png`;
      const blob = await getBlobFromCanvas(canvas);
      downloadBlob(filename, blob);
    },
  );

  getById("currentTimeToSaveImage", HTMLButtonElement).addEventListener(
    "click",
    () => {
      saveImageSecondsInput.value = playPositionSeconds.value;
    },
  );
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
      playOffset = NaN;
    }
    const playCheckBoxState = sessionStorage.getItem("play");
    playCheckBox.checked = playCheckBoxState == "checked";
    const saveImageSeconds = parseFloatX(
      sessionStorage.getItem("saveImageSeconds"),
    );
    if (saveImageSeconds !== undefined) {
      saveImageSecondsInput.valueAsNumber = saveImageSeconds;
    }
  } finally {
    sessionStorage.clear();
  }
}

// MARK: User interactions with the canvas.

/**
 * When you click on the canvas, convert the coordinates into the same coordinates
 * that we use for drawing.
 * @param pointerEvent The source of the location.
 * @returns The location converted into our ideal units.
 */
function getLocation(pointerEvent: PointerEvent): Point {
  return transform(
    pointerEvent.offsetX * devicePixelRatio,
    pointerEvent.offsetY * devicePixelRatio,
    mainTransform().inverse(),
  );
}

/**
 *
 * @param point Probably the output of {@link getLocation}
 * @returns The same info in a format that's easy to ready and could be
 * copied and pasted directly into code.
 */
function pointToString(point: Point) {
  return `{x: ${point.x.toFixed(3)}, y: ${point.y.toFixed(3)}}`;
}

/**
 *
 * @param pointerEvent Grab the point from here.
 * @returns The point converted into the right coordinate system.
 * It is in a format that is user readable and could be copied and pasted
 * directly into code.
 */
function locationString(pointerEvent: PointerEvent) {
  return pointToString(getLocation(pointerEvent));
}

/**
 * Show the position right under the mouse.
 * Updates as the mouse moves over the canvas.
 */
const currentPositionSpan = getById("currentPosition", HTMLSpanElement);

/**
 * Show the position right under the mouse.
 * Only updates when you click the mouse.
 * This is a good way to see something on the screen and copy it to the code.
 */
const lastDownSpan = getById("lastDown", HTMLSpanElement);

/**
 * Show the position right under the mouse.
 * Only updates when you release the mouse.
 * This, combined with {@link lastDownSpan} is a good way to draw a line or rectangle.
 */
const lastUpSpan = getById("lastUp", HTMLSpanElement);

canvas.addEventListener("pointermove", (pointerEvent) => {
  currentPositionSpan.innerText = locationString(pointerEvent);
});
canvas.addEventListener("pointerdown", (pointerEvent) => {
  lastDownSpan.innerText = locationString(pointerEvent);
  canvas.setPointerCapture(pointerEvent.pointerId);
});
canvas.addEventListener("pointerup", (pointerEvent) => {
  lastUpSpan.innerText = locationString(pointerEvent);
});

// TODO when saving video, only save the currently selected section.
//  * That button should make it obvious if we are saving everything or just part.
//  * Add a way to record any range you want.
// TODO Reenable other buttons after recording.
//  * Probably, but no rush.
//  * It is so easy to hit refresh!
// TODO Hot Keys
//  * Add _ for Previous and Next buttons.
//  * Add P and N as hotkeys.
//  * Maybe not.  This is possible but not very interesting.
//  * Instead maybe flip between specific frames or scenes with a hot key.
