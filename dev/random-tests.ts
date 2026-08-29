/**
 * Scratch space for trying out browser APIs before committing to them
 * elsewhere in the project. See random-tests.html.
 */

import { AnimationLoop, getById, querySelector } from "phil-lib/client-misc";
import { sleep } from "phil-lib/misc";
import {
  ALL_FORMATS,
  CanvasSink,
  Input,
  InputVideoTrack,
  UrlSource,
  WrappedCanvas,
} from "mediabunny";

// MARK: Log helper

const logEl = document.getElementById("log") as HTMLPreElement;

function log(message: string) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent += `[${time}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

// MARK: IndexedDB helpers
// FileSystemFileHandle objects are structured-cloneable, so IndexedDB can
// store them directly. localStorage/sessionStorage cannot -- they only hold
// strings.

const DB_NAME = "random-tests-db";
const STORE_NAME = "handles";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const result = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// MARK: Permission helper
// A handle pulled back out of IndexedDB starts in the "prompt" permission
// state even if it was "granted" earlier -- Chrome does not persist grants
// across page loads for security reasons. queryPermission() checks silently;
// requestPermission() may show the browser's own permission prompt (not a
// file picker) if needed.

async function verifyPermission(
  handle: FileSystemHandle,
  readWrite: boolean,
): Promise<boolean> {
  const options: FileSystemHandlePermissionDescriptor = readWrite
    ? { mode: "readwrite" }
    : {};
  if ((await handle.queryPermission(options)) === "granted") {
    return true;
  }
  if ((await handle.requestPermission(options)) === "granted") {
    return true;
  }
  return false;
}

// MARK: Save-side handle

const SAVE_KEY = "saveHandle";

document
  .getElementById("pickSaveHandle")!
  .addEventListener("click", async () => {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "random-tests.txt",
        types: [
          { description: "Text Files", accept: { "text/plain": [".txt"] } },
        ],
      });
      await idbSet(SAVE_KEY, handle);
      log(`Picked "${handle.name}" and stored the handle in IndexedDB.`);
    } catch (error) {
      log(`Pick save handle failed/cancelled: ${error}`);
    }
  });

document
  .getElementById("writeRemembered")!
  .addEventListener("click", async () => {
    const handle = await idbGet<FileSystemFileHandle>(SAVE_KEY);
    if (!handle) {
      log("No remembered save handle. Click step 1 first.");
      return;
    }
    if (!(await verifyPermission(handle, true))) {
      log("Permission to write was denied.");
      return;
    }
    const writable = await handle.createWritable();
    await writable.write(`Written at ${new Date().toISOString()}\n`);
    await writable.close();
    log(`Wrote to "${handle.name}" without showing a file picker.`);
  });

document
  .getElementById("forgetSaveHandle")!
  .addEventListener("click", async () => {
    await idbDelete(SAVE_KEY);
    log("Forgot the save handle.");
  });

// MARK: Open-side handle

const OPEN_KEY = "openHandle";

document
  .getElementById("pickOpenHandle")!
  .addEventListener("click", async () => {
    try {
      const [handle] = await window.showOpenFilePicker();
      await idbSet(OPEN_KEY, handle);
      log(`Picked "${handle.name}" and stored the handle in IndexedDB.`);
    } catch (error) {
      log(`Pick open handle failed/cancelled: ${error}`);
    }
  });

document
  .getElementById("readRemembered")!
  .addEventListener("click", async () => {
    const handle = await idbGet<FileSystemFileHandle>(OPEN_KEY);
    if (!handle) {
      log("No remembered open handle. Click step 1 first.");
      return;
    }
    if (!(await verifyPermission(handle, false))) {
      log("Permission to read was denied.");
      return;
    }
    const file = await handle.getFile();
    const contents = await file.text();
    log(
      `Read "${handle.name}" without showing a file picker (${contents.length} chars). First 100: ${contents.slice(0, 100)}`,
    );
  });

document
  .getElementById("forgetOpenHandle")!
  .addEventListener("click", async () => {
    await idbDelete(OPEN_KEY);
    log("Forgot the open handle.");
  });

// MARK: Status check (no prompts at all)

document.getElementById("checkStatus")!.addEventListener("click", async () => {
  for (const [label, key, readWrite] of [
    ["Save handle", SAVE_KEY, true],
    ["Open handle", OPEN_KEY, false],
  ] as const) {
    const handle = await idbGet<FileSystemFileHandle>(key);
    if (!handle) {
      log(`${label}: nothing remembered.`);
      continue;
    }
    const options: FileSystemHandlePermissionDescriptor = readWrite
      ? { mode: "readwrite" }
      : {};
    const state = await handle.queryPermission(options);
    log(`${label}: "${handle.name}", permission = ${state}`);
  }
});

log("Ready. Note: this all requires a Chromium-based browser (Chrome/Edge).");

// MARK: Video

{
  // The goal is to seek to a specific frame.
  // This works but it is slow.
  //
  // I'm working with a test file that was the output of canvas-recorder.html.
  // I.e. 60 fps, 4k, HEVC/H.265.
  //
  // If I start fresh and only advance or retreat by a single frame at a time,
  // I get reasonable values of about 0.056 seconds per frame.
  // That's about 1/3 of real time.
  //
  // If I start jumping around randomly the first three to five seeks take about 1/2 second.
  // After that they start to take about 1 second per seek.
  // Hitting refresh will take that number back down to 1/2!
  // Somewhat random, but fairly repeatable.
  //
  // If I start jumping around then I try to advance one frame at a time,
  // I see numbers around 1 second per seek.
  // The randomizing step leaves us in a bad state where the single step becomes slow!
  //
  // The three seeks in a row code is very inconsistent.
  // Most of the seeks take around 1 second each.
  // Some are closer to 1/2 second.
  // And some are very fast, maybe one in 10 will take less than 1/10 of a second.
  // I can't predict the individual times, but those times repeat a lot.
  //
  // Stepping through one frame at a time from 0.
  // It started from 0.034 seconds per seek.
  // By 2 seconds it takes 0.657 seconds per seek.
  // There was a little bit of jitter, but it mostly got slower as time progressed.
  // When I stepped backward one frame at a time, the time per seek decreased each time.
  // The numbers were similar to the numbers I saw going forward.
  // Proposal:
  // * The first frame is keyframe.
  // * I did not hit any other keyframes in the first 2 seconds.
  // * Each request restarts from 0, and processes all the frames up to the requested frame.
  //
  // I exported goto() to window.goto() so I could try interactive tests.
  // It seems like it is smart enough to take almost no time if the frame number does not change.
  // Even if the current time is a fraction different, but it's the same frame, it's still fast.
  // If I jump to 5n seconds (where n is an integer) it is fast.
  // If I jump to 5n + m seconds, where m is a number between 0 and 5,
  // then the time only depends on m, not n.
  // That suggests that there is a keyframe every 5 seconds.
  // And that it always works forward from the closest keyframe one frame at a time.
  //
  // Note:  These files are hard to edit in CapCut.
  // TODO:  Try a video from my camera phone, another from a screen recording, and one saved in ProRes.
  // These have worked better from me in CapCut in the past.
  // The HEVC/H.265 output is aimed at a final output to send to YouTube, not further editing.
  // I used this test file because I had it handy, not because it is realistic.
  // The whole point of this program is never render my output until the final version!
  //
  // My original expectations:
  // I knew there would be some cost to jumping around randomly.
  // But I was hoping that advancing a single frame at a time could be done very quickly.
  //
  // I haven't seriously tried the realtime / preview mode, yet.
  // I am curious how much trouble the seek time will cause.
  // I was originally assuming that I could start the video clip at any specific time,
  // and let it run at full speed.
  // But what if I'm running at realtime speed,
  // and I request that we seek to the time that I want now,
  // and it takes between 0.02 and 2.0 seconds to do the initial seek?
  // Will it stay behind that amount as it continues?
  // Should I try to seek to a time in advance, to match that delay?
  // That seems impossible since I don't know the delay.
  // Being off by a whole second seems bad.
  // Maybe, if I knew where the keyframes were in the file that I'm looking at,
  // I could ask to synchronize again when we get to a keyframe.
  // That would require knowing a lot about the media that I'm playing.
  // I was originally worried about the video and audio getting off over time
  // because they are run by different clocks and this is a known issue.
  // But not being able to start when I want to will cause much bigger discrepancy.
  // I need to write some tests to try this and see what happens.
  // I.e. if I am in play mode
  // and I set the video.currentTime to 4 seconds
  // at exactly 12:00:04,
  // and I check video.currentTime at 12:00:10,
  // do I expect video.currentTime to be 10?
  // Or will it be somewhere around 9 because of the approximately 1 second required to seek?
  const video = querySelector("video", HTMLVideoElement);
  /**
   *
   * @param time Seek to this position in the video.
   * This is the number of seconds from the start of the video.
   */
  const goto = async (time: number) => {
    const startTime = performance.now();
    video.currentTime = time;
    video.addEventListener(
      "seeked",
      () => {
        console.log(
          `seeked event fired after ${((performance.now() - startTime) / 1000).toFixed(3)} seconds ${video.seeking ? "WRONG" : "confirmed"}`,
        );
      },
      { once: true },
    );
    while (true) {
      if (!video.seeking) {
        console.log(
          `done in ${((performance.now() - startTime) / 1000).toFixed(3)} seconds`,
        );
        break;
      }
      console.log("seeking");
      await sleep(10);
    }
  };
  (window as any).goto = goto;
  getById("randomSeek", HTMLButtonElement).addEventListener("click", () => {
    goto(video.duration * Math.random());
  });
  getById("seekNextFrame", HTMLButtonElement).addEventListener("click", () => {
    goto((video.currentTime + 1 / 60) % video.duration);
  });
  getById("seekPreviousFrame", HTMLButtonElement).addEventListener(
    "click",
    () => {
      goto((video.currentTime - 1 / 60 + video.duration) % video.duration);
    },
  );
  getById("threeSeeks", HTMLButtonElement).addEventListener(
    "click",
    async () => {
      await goto((video.currentTime + 1) % video.duration);
      await goto((video.currentTime + 1) % video.duration);
      await goto((video.currentTime + 1) % video.duration);
    },
  );
}

// MARK: Mediabunny
{
  const putMediabunnyCanvasHere = getById(
    "putMediabunnyCanvasHere",
    HTMLDivElement,
  );
  let currentlyPlaying: AnimationLoop | undefined;
  function displayCanvas(currentFrame: HTMLCanvasElement) {
    putMediabunnyCanvasHere.innerHTML = "";
    putMediabunnyCanvasHere.append(currentFrame);
  }
  function pause() {
    // Stop playing
    currentlyPlaying?.cancel();
    currentlyPlaying = undefined;
  }

  // Opened once, up front.
  const trackPromise: Promise<InputVideoTrack> = (async () => {
    const input = new Input({
      source: new UrlSource("./frame counter.mp4"),
      formats: ALL_FORMATS,
    });
    const track = await input.getPrimaryVideoTrack();
    if (!track) {
      throw new Error('No video track found in "./frame counter.mp4".');
    }
    return track;
  })();
  trackPromise.catch((error) => {
    log(`Mediabunny: failed to open "./frame counter.mp4": ${error}`);
  });
  // poolSize is left at the default (undefined), which disables the pool --
  // every WrappedCanvas gets its own freshly allocated canvas, so nothing is
  // ever silently overwritten while we're testing.
  const sinkPromise: Promise<CanvasSink> = trackPromise.then(
    (track) => new CanvasSink(track),
  );

  /**
   * The generator currently in use.  jumpTo() replaces this with a fresh
   * one; skipNFrames(), play(), and the "Display Next Frame" button just
   * keep pulling from whichever one is current.
   */
  let currentIterator: AsyncGenerator<WrappedCanvas, void, unknown> | undefined;

  /**
   * Pull one frame from currentIterator and display it.
   * @returns The frame that was displayed, or undefined if there is no
   * current iterator (jumpTo() hasn't been called yet) or the file is
   * exhausted.
   */
  async function nextFrame(): Promise<WrappedCanvas | undefined> {
    if (!currentIterator) {
      log("Mediabunny: jump to a time before playing/stepping.");
      return undefined;
    }
    const result = await currentIterator.next();
    if (result.done) {
      log("Mediabunny: reached the end of the file.");
      return undefined;
    }
    const { canvas } = result.value;
    // CanvasSink yields HTMLCanvasElements in a DOM context (like this one)
    // and OffscreenCanvases otherwise -- see the CanvasSink doc comment.
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Expected an HTMLCanvasElement in a DOM context.");
    }
    displayCanvas(canvas);
    return result.value;
  }

  async function jumpTo(seconds: number) {
    pause();
    const startTime = performance.now();
    const sink = await sinkPromise;
    currentIterator = sink.canvases(seconds);
    await nextFrame();
    const elapsedSeconds = (performance.now() - startTime) / 1000;
    console.log(
      `Jumped to ${seconds.toFixed(3)} in ${elapsedSeconds.toFixed(3)} seconds.`,
    );
  }
  async function skipNFrames(numberOfFrames: number) {
    pause();
    const startTime = performance.now();
    for (let i = 0; i < numberOfFrames; i++) {
      if (!currentIterator) {
        log("Mediabunny: jump to a time before skipping.");
        return;
      }
      const result = await currentIterator.next();
      if (result.done) {
        log("Mediabunny: reached the end of the file while skipping.");
        return;
      }
    }
    await nextFrame();
    const elapsedSeconds = (performance.now() - startTime) / 1000;
    console.log(
      `Skipped ${numberOfFrames} frames in ${elapsedSeconds.toFixed(3)} seconds.`,
    );
  }
  function play() {
    pause();
    /**
     * Milliseconds.
     * Basically the same as performance.now().
     * But sometimes slightly different.
     * You should never compare `performance.now()` to `animationTime` directly.
     */
    let startTime: number | undefined;
    /**
     * The timestamp of the initial frame.
     * We can compare how much time has passed in the video we are playing
     * against the amount of realtime that has passed,
     * to check for clock drift.
     *
     * Eventually we will use this to correct for clock drift,
     * but let's start simple and always display one frame of video per animation frame.
     */
    let initialFrameTime: number | undefined;
    // True while a previous tick's nextFrame() is still in flight.  Without
    // this, a decode slower than one animation frame would let ticks pile up
    // and call currentIterator.next() concurrently.
    let busy = false;
    currentlyPlaying = new AnimationLoop((animationTime) => {
      if (startTime === undefined) {
        startTime = animationTime;
      }
      if (busy) {
        return;
      }
      busy = true;
      nextFrame()
        .then((frame) => {
          if (frame && initialFrameTime === undefined) {
            initialFrameTime = frame.timestamp;
          }
        })
        .finally(() => {
          busy = false;
        });
    });
  }
  getById("jumpToBeginning", HTMLButtonElement).addEventListener(
    "click",
    () => {
      jumpTo(0);
    },
  );
  getById("displayNextFrame", HTMLButtonElement).addEventListener(
    "click",
    () => {
      pause();
      nextFrame();
    },
  );
  getById("play", HTMLButtonElement).addEventListener("click", () => {
    play();
  });
  getById("frameRateMetrics", HTMLButtonElement).addEventListener(
    "click",
    async () => {
      const track = await trackPromise;
      // Scan every packet in the file instead of just the default sample of
      // 256.  The docs say to pass Infinity for this, but that throws at
      // runtime ("must be a non-negative number") -- Number.MAX_SAFE_INTEGER
      // works around it.
      const metrics = await track.computeFrameRateMetrics({
        targetPacketCount: Number.MAX_SAFE_INTEGER,
      });
      log(
        `Mediabunny frame rate metrics:\n` +
          `  underlyingFrameRate: ${metrics.underlyingFrameRate}\n` +
          `  bestGuessFrameRate: ${metrics.bestGuessFrameRate}\n` +
          `  minFrameRate: ${metrics.minFrameRate}\n` +
          `  maxFrameRate: ${metrics.maxFrameRate}\n` +
          `  averageFrameRate: ${metrics.averageFrameRate}\n` +
          `  medianFrameRate: ${metrics.medianFrameRate}\n` +
          `  frameRateIsConstant: ${metrics.frameRateIsConstant}\n` +
          `  probedPacketCount: ${metrics.probedPacketCount}`,
      );
      const transparent = await track.canBeTransparent();
      log(`Mediabunny canBeTransparent(): ${transparent}`);
    },
  );
  (window as any).mediabunny = { jumpTo, pause, play, skipNFrames };
}
