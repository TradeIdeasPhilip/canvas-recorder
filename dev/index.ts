import { assertNonNullable, FIGURE_SPACE, sleep } from "phil-lib/misc.ts";
import {
  AnimationLoop,
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
import { fourierIntro } from "../src/peano-fourier/fourier-intro.ts";
import { peanoIterations } from "../src/peano-fourier/peano-iterations.ts";
import { peanoFourier } from "../src/peano-fourier/peano-fourier.ts";
import { top } from "../src/peano-fourier/top.ts";
import { Showable } from "../src/showable.ts";

const canvas = getById("main", HTMLCanvasElement);
const context = assertNonNullable(canvas.getContext("2d"));

const toShow = top;

function showFrame(timeInMS: number, size: "live" | "4k" | "hd") {
  if (size == "live") {
    const clientRect = canvas.getClientRects()[0];
    canvas.width = Math.round(clientRect.width * devicePixelRatio);
    canvas.height = Math.round(clientRect.height * devicePixelRatio);
  } else if (size == "4k") {
    canvas.width = 3840;
    canvas.height = 2160;
  } else {
    canvas.width = 1920;
    canvas.height = 1080;
  }
  context.reset();
  context.scale(canvas.width / 16, canvas.height / 9);
  toShow.show(timeInMS, context);
}
(window as any).showFrame = showFrame;

let sectionStartTime = 0;
let sectionEndTime = 0;

const playPositionRangeInput = getById("playPosition", HTMLInputElement);
const pauseButton = querySelector(
  'input[name="playState"][value="pause"]',
  HTMLInputElement
);
const playButton = querySelector(
  'input[name="playState"][value="play"]',
  HTMLInputElement
);
const repeatButton = querySelector(
  'input[name="playState"][value="repeat"]',
  HTMLInputElement
);

/**
 * The play head is located at (wall clock time - playOffset).
 *
 * NaN means uninitialized.
 */
let playOffset = NaN;
const animationLoop = new AnimationLoop((timeInMS: number) => {
  if (pauseButton.checked) {
    timeInMS = playPositionRangeInput.valueAsNumber;
    playOffset = NaN;
  } else {
    if (isNaN(playOffset)) {
      if (playPositionRangeInput.valueAsNumber >= sectionEndTime) {
        // Is this correct?  I'm imaging problems with rounding where the max value of the control != sectionEndTime.
        playPositionRangeInput.valueAsNumber = sectionStartTime;
      }
      playOffset = timeInMS - playPositionRangeInput.valueAsNumber;
    }
    timeInMS -= playOffset;
    if (timeInMS >= sectionEndTime) {
      playOffset = NaN;
      if (playButton.checked) {
        pauseButton.checked = true;
      }
    }
    playPositionRangeInput.valueAsNumber = timeInMS;
  }
  showFrame(timeInMS, "live");
});

playPositionRangeInput.addEventListener("input", () => {
  playOffset = NaN;
});

const FPS = 60;

const infoDiv = getById("info", HTMLDivElement);
infoDiv.innerHTML = "Click 'Record and Save' to start...";

async function startRecording() {
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
    bitrate: 8_000_000, // ~8Mbps — tune higher for better quality
  });

  output.addVideoTrack(videoSource, { frameRate: FPS });

  const startTime = performance.now();

  await output.start();
  infoDiv.innerHTML =
    "Recording in progress... (drawing frames as fast as possible)";

  const frameDuration = 1000 / FPS;

  // Offline loop: draw + push frames (faster than realtime)
  let frameNumber = 0;
  while (true) {
    const timeInMS = (frameNumber + 0.5) * frameDuration;
    if (timeInMS > toShow.duration) {
      break;
    }
    showFrame(timeInMS, "4k");
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

  await output.finalize(); // Finishes encoding + closes stream automatically

  const elapsedSeconds = (performance.now() - startTime) / 1000;

  infoDiv.innerHTML = `
    <strong>Recording complete!</strong><br>
    Frames: ${frameNumber}<br>
    Elapsed time: ${elapsedSeconds.toFixed(3)} seconds<br>
    File saved via File System Access API!
  `;
}

// Trigger with a button (user gesture required for showSaveFilePicker)
const button = document.createElement("button");
button.textContent = "Record and Save Video";
button.onclick = startRecording;
document.body.appendChild(button);

type ShowableTree = {
  description: string;
  prefix: string;
  start: number;
  end: number;
  parent: ShowableTree | undefined;
  children: ShowableTree[];
  absolutePosition: number;
  siblingPosition: number;
};

const debug = new Array<ShowableTree>();
function dump(
  showable: Showable,
  prefix = "",
  start = 0,
  limit = Infinity,
  parent?: ShowableTree
) {
  const end = Math.min(start + showable.duration, limit);
  const info: ShowableTree = {
    prefix,
    description: showable.description,
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
  showable.children?.forEach((next) => {
    const absoluteStart = start + next.start;
    dump(next.child, FIGURE_SPACE + prefix, absoluteStart, end, info);
  });
}
dump(toShow);
//console.table(debug);

const select = querySelector("select", HTMLSelectElement);
debug.forEach((value) => {
  const option = document.createElement("option");
  option.textContent = value.prefix + value.description;
  option.value = value.description;
  select.append(option);
});

const parentCells = querySelectorAll("#parentRow td", HTMLTableCellElement);
const previousSiblingCells = querySelectorAll(
  "#previousSiblingRow td",
  HTMLTableCellElement
);
const thisCells = querySelectorAll("#thisRow td", HTMLTableCellElement);
const firstChildCells = querySelectorAll(
  "#firstChildRow td",
  HTMLTableCellElement
);
const nextSiblingCells = querySelectorAll(
  "#nextSiblingRow td",
  HTMLTableCellElement
);

const buttonDestination = new Map<
  HTMLButtonElement,
  ShowableTree | undefined
>();

function updateRow(
  cells: readonly HTMLTableCellElement[],
  info: ShowableTree | undefined
) {
  const button = querySelectorAll(
    "button",
    HTMLButtonElement,
    0,
    1,
    cells[0]
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

const previousButton = getById("previousButton", HTMLButtonElement);
const nextButton = getById("nextButton", HTMLButtonElement);

function updateFromSelect() {
  const info = debug[select.selectedIndex];
  previousButton.disabled = info.absolutePosition == 0;
  nextButton.disabled = info.absolutePosition == debug.length;
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
  playPositionRangeInput.min = sectionStartTime.toString();
  playPositionRangeInput.max = sectionEndTime.toString();
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
