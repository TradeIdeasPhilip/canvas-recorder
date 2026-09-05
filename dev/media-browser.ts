/**
 * Quick strawman for a CapCut-"Media tab"-style tool.
 *
 * Paste video URLs, one per line.  Each gets probed with Mediabunny for its
 * real duration / pixel size / frame rate.  Selecting one shows a shared
 * editor (one copy of the tools, not one per row) for trimming and choosing
 * a destination size, with a live `<video>` preview.  Copy produces JSON
 * shaped like `VideoClipComponent`'s constructor options.
 *
 * See development-plans/ for the spec this was built from (told to the
 * assistant, not written down first -- this file is the first draft).
 */

import { ALL_FORMATS, Input, UrlSource } from "mediabunny";
import { getById } from "phil-lib/client-misc";

// MARK: Constants

/** The canvas is always 16×9 units -- see CLAUDE.md's "Coordinate System". */
const CANVAS_WIDTH_UNITS = 16;
const CANVAS_HEIGHT_UNITS = 9;

/**
 * Recordings render at 3840×2160 (see dev/canvas-recorder.ts), so
 * 3840 / 16 = 2160 / 9 = 240 pixels per canvas unit.  "Preserve Pixels"
 * uses this to size a destination rect that shows the media at its native
 * resolution with no scaling in the final output.
 */
const PIXELS_PER_UNIT = 240;

// MARK: Data model

type Status = "loading" | "ready" | "error";

type MediaEntry = {
  readonly url: string;
  status: Status;
  errorMessage?: string;
  naturalWidth: number;
  naturalHeight: number;
  durationMs: number;
  fpsLabel: string;
  startMs: number;
  endMs: number;
  destWidthUnits: number;
  destHeightUnits: number;
};

const entries = new Map<string, MediaEntry>();
let selectedUrl: string | undefined;

// MARK: DOM references

const urlInput = getById("urlInput", HTMLTextAreaElement);
const loadButton = getById("loadButton", HTMLButtonElement);
const rowsBody = getById("rows", HTMLTableSectionElement);

const editor = getById("editor", HTMLDivElement);
const editorUrl = getById("editorUrl", HTMLSpanElement);
const previewContainer = getById("previewContainer", HTMLDivElement);
const previewVideo = getById("previewVideo", HTMLVideoElement);

const startMsInput = getById("startMs", HTMLInputElement);
const endMsInput = getById("endMs", HTMLInputElement);
const durationMsInput = getById("durationMs", HTMLInputElement);
const goToStartButton = getById("goToStart", HTMLButtonElement);
const goToEndButton = getById("goToEnd", HTMLButtonElement);
const setStartNowButton = getById("setStartNow", HTMLButtonElement);
const setEndNowButton = getById("setEndNow", HTMLButtonElement);

const destWidthInput = getById("destWidth", HTMLInputElement);
const destHeightInput = getById("destHeight", HTMLInputElement);
const fitMaxFitButton = getById("fitMaxFit", HTMLButtonElement);
const fitMinCoverButton = getById("fitMinCover", HTMLButtonElement);
const fitPreservePixelsButton = getById("fitPreservePixels", HTMLButtonElement);

// MARK: Fit math

/** "max fit" / "maxpect" / "meet" / "contain": the whole media fits inside 16×9. */
function computeMaxFit(mediaWidth: number, mediaHeight: number) {
  const mediaAspect = mediaWidth / mediaHeight;
  const canvasAspect = CANVAS_WIDTH_UNITS / CANVAS_HEIGHT_UNITS;
  return mediaAspect > canvasAspect
    ? { width: CANVAS_WIDTH_UNITS, height: CANVAS_WIDTH_UNITS / mediaAspect }
    : { width: CANVAS_HEIGHT_UNITS * mediaAspect, height: CANVAS_HEIGHT_UNITS };
}

/** "min to cover" / "slice" / "fill": 16×9 is fully covered, media may overflow it. */
function computeMinToCover(mediaWidth: number, mediaHeight: number) {
  const mediaAspect = mediaWidth / mediaHeight;
  const canvasAspect = CANVAS_WIDTH_UNITS / CANVAS_HEIGHT_UNITS;
  return mediaAspect > canvasAspect
    ? { width: CANVAS_HEIGHT_UNITS * mediaAspect, height: CANVAS_HEIGHT_UNITS }
    : { width: CANVAS_WIDTH_UNITS, height: CANVAS_WIDTH_UNITS / mediaAspect };
}

/** "preserve pixels": native resolution, no resampling, once rendered at 240px/unit. */
function computePreservePixels(mediaWidth: number, mediaHeight: number) {
  return { width: mediaWidth / PIXELS_PER_UNIT, height: mediaHeight / PIXELS_PER_UNIT };
}

// MARK: Loading the URL list

loadButton.addEventListener("click", () => {
  const urls = urlInput.value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const wanted = new Set(urls);

  // Drop rows for URLs the user removed from the textarea.
  for (const url of [...entries.keys()]) {
    if (!wanted.has(url)) {
      entries.delete(url);
      if (selectedUrl === url) selectedUrl = undefined;
    }
  }

  // Add rows for new URLs; leave already-probed ones alone so we don't
  // re-fetch on every click of Load.
  for (const url of urls) {
    if (!entries.has(url)) {
      const entry: MediaEntry = {
        url,
        status: "loading",
        naturalWidth: 0,
        naturalHeight: 0,
        durationMs: 0,
        fpsLabel: "",
        startMs: 0,
        endMs: 0,
        destWidthUnits: CANVAS_WIDTH_UNITS,
        destHeightUnits: CANVAS_HEIGHT_UNITS,
      };
      entries.set(url, entry);
      void probe(entry);
    }
  }

  renderRows();
  renderEditor();
});

async function probe(entry: MediaEntry): Promise<void> {
  const input = new Input({ source: new UrlSource(entry.url), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) {
      throw new Error("No video track found.");
    }
    entry.naturalWidth = await track.getDisplayWidth();
    entry.naturalHeight = await track.getDisplayHeight();
    // Metadata-based duration first (cheap); fall back to a full scan only
    // if the file doesn't declare one.
    const metaDuration = await track.getDurationFromMetadata();
    entry.durationMs = (metaDuration ?? (await track.computeDuration())) * 1_000;

    // Default sample size (not a full scan) -- this tool is meant to be
    // quick to browse many URLs, not to be exact.
    const metrics = await track.computeFrameRateMetrics();
    entry.fpsLabel =
      metrics.minFrameRate === metrics.maxFrameRate
        ? formatNumber(metrics.minFrameRate)
        : `${formatNumber(metrics.minFrameRate)}–${formatNumber(metrics.maxFrameRate)}`;

    entry.startMs = 0;
    entry.endMs = entry.durationMs;
    const fit = computeMaxFit(entry.naturalWidth, entry.naturalHeight);
    entry.destWidthUnits = fit.width;
    entry.destHeightUnits = fit.height;

    entry.status = "ready";
  } catch (error) {
    entry.status = "error";
    entry.errorMessage = String(error);
  } finally {
    input.dispose();
  }
  renderRows();
  if (selectedUrl === entry.url) renderEditor();
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2);
}

function formatDuration(ms: number): string {
  return `${(ms / 1_000).toFixed(3)} s`;
}

// MARK: Row list

function renderRows(): void {
  rowsBody.innerHTML = "";
  for (const entry of entries.values()) {
    const tr = document.createElement("tr");
    if (entry.url === selectedUrl) tr.classList.add("selected");

    const urlCell = document.createElement("td");
    urlCell.className = "url";
    urlCell.textContent = entry.url;
    tr.append(urlCell);

    const statusCell = document.createElement("td");
    statusCell.className = `status-${entry.status}`;
    statusCell.textContent =
      entry.status === "loading"
        ? "Loading…"
        : entry.status === "error"
          ? `Error: ${entry.errorMessage}`
          : "Ready";
    tr.append(statusCell);

    const durationCell = document.createElement("td");
    durationCell.textContent = entry.status === "ready" ? formatDuration(entry.durationMs) : "";
    tr.append(durationCell);

    const sizeCell = document.createElement("td");
    sizeCell.textContent =
      entry.status === "ready" ? `${entry.naturalWidth}×${entry.naturalHeight}` : "";
    tr.append(sizeCell);

    const fpsCell = document.createElement("td");
    fpsCell.textContent = entry.status === "ready" ? entry.fpsLabel : "";
    tr.append(fpsCell);

    const selectCell = document.createElement("td");
    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.textContent = "Select";
    selectButton.disabled = entry.status !== "ready";
    selectButton.addEventListener("click", () => {
      selectedUrl = entry.url;
      renderRows();
      renderEditor();
    });
    selectCell.append(selectButton);
    tr.append(selectCell);

    const copyCell = document.createElement("td");
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "Copy";
    copyButton.disabled = entry.status !== "ready";
    copyButton.addEventListener("click", () => void copyEntry(entry, copyButton));
    copyCell.append(copyButton);
    tr.append(copyCell);

    rowsBody.append(tr);
  }
}

async function copyEntry(entry: MediaEntry, button: HTMLButtonElement): Promise<void> {
  const json = {
    url: entry.url,
    startMsIntoClip: entry.startMs,
    endMsIntoClip: entry.endMs,
    duration: entry.endMs - entry.startMs,
    // Top-left is always (0, 0) -- never shown or edited in this tool.
    destinationRect: { x: 0, y: 0, width: entry.destWidthUnits, height: entry.destHeightUnits },
  };
  const text = JSON.stringify(json, null, 2);
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied!";
  } catch (error) {
    console.error("Clipboard write failed:", error);
    button.textContent = "Copy failed";
  }
  setTimeout(() => (button.textContent = original), 1_500);
}

// MARK: Shared editor

function renderEditor(): void {
  const entry = selectedUrl ? entries.get(selectedUrl) : undefined;
  if (!entry || entry.status !== "ready") {
    editor.hidden = true;
    return;
  }
  editor.hidden = false;
  editorUrl.textContent = entry.url;

  if (previewVideo.src !== entry.url) {
    previewVideo.src = entry.url;
  }

  startMsInput.valueAsNumber = entry.startMs;
  endMsInput.valueAsNumber = entry.endMs;
  durationMsInput.valueAsNumber = entry.endMs - entry.startMs;
  destWidthInput.valueAsNumber = entry.destWidthUnits;
  destHeightInput.valueAsNumber = entry.destHeightUnits;

  sizePreview(entry);
}

/** Preview always fills its box (crops as needed), independent of the fit-mode buttons. */
function sizePreview(entry: MediaEntry): void {
  const maxBoxWidth = 480;
  const maxBoxHeight = 360;
  const boxAspect = entry.destWidthUnits / entry.destHeightUnits;
  let boxWidth = maxBoxWidth;
  let boxHeight = maxBoxWidth / boxAspect;
  if (boxHeight > maxBoxHeight) {
    boxHeight = maxBoxHeight;
    boxWidth = maxBoxHeight * boxAspect;
  }
  previewContainer.style.width = `${boxWidth}px`;
  previewContainer.style.height = `${boxHeight}px`;

  const mediaAspect = entry.naturalWidth / entry.naturalHeight;
  const containerAspect = boxWidth / boxHeight;
  if (mediaAspect > containerAspect) {
    previewVideo.style.height = `${boxHeight}px`;
    previewVideo.style.width = `${boxHeight * mediaAspect}px`;
  } else {
    previewVideo.style.width = `${boxWidth}px`;
    previewVideo.style.height = `${boxWidth / mediaAspect}px`;
  }
}

function currentEntry(): MediaEntry | undefined {
  return selectedUrl ? entries.get(selectedUrl) : undefined;
}

// Start is the anchor: editing Start or End recomputes Duration; editing
// Duration keeps Start fixed and moves End.
startMsInput.addEventListener("change", () => {
  const entry = currentEntry();
  if (!entry) return;
  entry.startMs = startMsInput.valueAsNumber;
  durationMsInput.valueAsNumber = entry.endMs - entry.startMs;
});
endMsInput.addEventListener("change", () => {
  const entry = currentEntry();
  if (!entry) return;
  entry.endMs = endMsInput.valueAsNumber;
  durationMsInput.valueAsNumber = entry.endMs - entry.startMs;
});
durationMsInput.addEventListener("change", () => {
  const entry = currentEntry();
  if (!entry) return;
  entry.endMs = entry.startMs + durationMsInput.valueAsNumber;
  endMsInput.valueAsNumber = entry.endMs;
});

goToStartButton.addEventListener("click", () => {
  const entry = currentEntry();
  if (entry) previewVideo.currentTime = entry.startMs / 1_000;
});
goToEndButton.addEventListener("click", () => {
  const entry = currentEntry();
  if (entry) previewVideo.currentTime = entry.endMs / 1_000;
});
setStartNowButton.addEventListener("click", () => {
  const entry = currentEntry();
  if (!entry) return;
  entry.startMs = Math.round(previewVideo.currentTime * 1_000);
  startMsInput.valueAsNumber = entry.startMs;
  durationMsInput.valueAsNumber = entry.endMs - entry.startMs;
});
setEndNowButton.addEventListener("click", () => {
  const entry = currentEntry();
  if (!entry) return;
  entry.endMs = Math.round(previewVideo.currentTime * 1_000);
  endMsInput.valueAsNumber = entry.endMs;
  durationMsInput.valueAsNumber = entry.endMs - entry.startMs;
});

destWidthInput.addEventListener("change", () => {
  const entry = currentEntry();
  if (!entry) return;
  entry.destWidthUnits = destWidthInput.valueAsNumber;
  sizePreview(entry);
});
destHeightInput.addEventListener("change", () => {
  const entry = currentEntry();
  if (!entry) return;
  entry.destHeightUnits = destHeightInput.valueAsNumber;
  sizePreview(entry);
});

function applyFit(compute: (w: number, h: number) => { width: number; height: number }): void {
  const entry = currentEntry();
  if (!entry) return;
  const { width, height } = compute(entry.naturalWidth, entry.naturalHeight);
  entry.destWidthUnits = width;
  entry.destHeightUnits = height;
  destWidthInput.valueAsNumber = width;
  destHeightInput.valueAsNumber = height;
  sizePreview(entry);
}
fitMaxFitButton.addEventListener("click", () => applyFit(computeMaxFit));
fitMinCoverButton.addEventListener("click", () => applyFit(computeMinToCover));
fitPreservePixelsButton.addEventListener("click", () => applyFit(computePreservePixels));
