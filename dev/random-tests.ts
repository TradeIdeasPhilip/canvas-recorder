/**
 * Scratch space for trying out browser APIs before committing to them
 * elsewhere in the project. See random-tests.html.
 */

import { getById, querySelector } from "phil-lib/client-misc";
import { sleep } from "phil-lib/misc";

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
  const video = querySelector("video", HTMLVideoElement);
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
