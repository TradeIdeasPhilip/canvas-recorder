/**
 * Timeline overview for the Visual Editor.
 *
 * Draws horizontal block rows for child components, a lane of sound clips
 * below them, a play-head, and a chapter cursor.  Supports click-to-seek, click-to-select-block, drag-to-resize handles,
 * drag-to-pan, and scroll-to-zoom.
 *
 * All times are **chapter-local** milliseconds (0 → chapter duration).
 * Block positions are live: startMs / durationMs are getter functions so that
 * an in-progress drag immediately reflects in the next redraw.
 */

/** A single block shown on the timeline. */
export type TimelineBlock = {
  /** Opaque identity — passed to {@link TimelineDisplay.onBlockClick}. */
  readonly id: object;
  readonly label: string;
  /** Current left edge in chapter-local ms.  Called every redraw. */
  readonly startMs: () => number;
  /** Current width in chapter-local ms.  Called every redraw. */
  readonly durationMs: () => number;
  /**
   * For minDuration blocks: the drag handle sits here instead of at startMs()+durationMs().
   * Lets the handle lag behind when actual duration exceeds minDuration.
   * Called every redraw when present.
   */
  readonly handleEndMs?: () => number;
  /** Called on every mousemove during a left-edge drag.  Arg: chapter-local ms. */
  readonly onDragLeft?: (newStartMs: number) => void;
  /** Called on every mousemove when dragging the block body.  Arg: new chapter-local ms for left edge. */
  readonly onDragBody?: (newStartMs: number) => void;
  /** Called on every mousemove during a right-edge drag.  Arg: chapter-local ms of new right edge. */
  readonly onDragRight?: (newEndMs: number) => void;
  /** Called on mouseup after a right drag.  Returns actual right-edge ms so the handle can snap. */
  readonly onCommitRight?: () => number;
  /** Fill color for the block.  Defaults to #4a8fdb (blue). */
  readonly color?: string;
  /**
   * `"sound"` blocks get their own, taller rows below all the others.  They
   * are stacked only when they overlap, so two sounds playing at once are
   * easy to spot.
   */
  readonly lane?: "sound";
  /**
   * For sound blocks:  the decoded audio, and the point in it that lines up
   * with the block's left edge.  Drawn inside the block.  Return undefined
   * until the file has been decoded.
   */
  readonly waveform?: () => { buffer: AudioBuffer; fromMs: number } | undefined;
};

/** Which row each block is in, and where each row is, in CSS px. */
type RowLayout = {
  readonly rows: number[];
  readonly tops: number[];
  readonly heights: number[];
};

// ── layout constants (all CSS px) ─────────────────────────────────────────────

const ROW_H_CSS = 28;
const SOUND_ROW_H_CSS = 40;
const BLOCK_PAD_CSS = 3;   // gap above/below block within its row
const HANDLE_PX = 8;       // pixel zone at block edges that triggers a drag cursor
const MIN_WINDOW_MS = 50;  // smallest zoom window allowed
const BOTTOM_PAD_CSS = Math.round(ROW_H_CSS / 3);  // always-blank seek strip at the bottom

// ── TimelineDisplay ───────────────────────────────────────────────────────────

export class TimelineDisplay {
  private _blocks: TimelineBlock[] = [];
  private _selectedId: object | undefined;
  /** A sound clip highlighted alongside {@link _selectedId}, which is then its owner. */
  private _selectedSoundId: object | undefined;
  private _durationMs = 1000;
  private _playLocalMs = 0;
  private _viewStartMs = 0;
  private _viewEndMs = 1000;
  /** Row layout cached after each draw so hit-testing reuses it without recomputing. */
  private _layout: RowLayout = { rows: [], tops: [], heights: [] };

  /** Fires when the user clicks the background or scrubs (shift-drag).  Arg: chapter-local ms. */
  onSeek?: (localMs: number) => void;
  /** Fires when the user clicks a block body.  Arg: the block's id. */
  onBlockClick?: (id: object) => void;

  constructor(readonly canvas: HTMLCanvasElement) {
    this._setupEvents();
  }

  // ── public API ─────────────────────────────────────────────────────────────

  /** Call when the chapter changes; resets zoom/pan to show the full chapter. */
  setChapterDuration(durationMs: number): void {
    this._durationMs = Math.max(durationMs, 1);
    this._viewStartMs = 0;
    this._viewEndMs = this._durationMs;
    this._draw();
  }

  setBlocks(blocks: TimelineBlock[]): void {
    this._blocks = blocks;
    this._draw();
  }

  setSelectedId(id: object | undefined): void {
    this._selectedId = id;
    this._draw();
  }

  /** Draw again, e.g. after a value a block reads has changed outside a drag. */
  redraw(): void {
    this._draw();
  }

  /** Highlight one sound clip block, or none. */
  setSelectedSoundId(id: object | undefined): void {
    this._selectedSoundId = id;
    this._draw();
  }

  /** @param localMs  Play position relative to chapter start (0 .. chapter duration). */
  setPlayMs(localMs: number): void {
    this._playLocalMs = localMs;
    this._draw();
  }

  // ── coordinate helpers ─────────────────────────────────────────────────────

  private _msToX(ms: number, canvasW: number): number {
    const dur = this._viewEndMs - this._viewStartMs;
    return dur > 0 ? ((ms - this._viewStartMs) / dur) * canvasW : 0;
  }

  private _xToMs(cssX: number, cssW: number): number {
    const dur = this._viewEndMs - this._viewStartMs;
    return this._viewStartMs + (cssX / cssW) * dur;
  }

  // ── row assignment (greedy, left-to-right) ─────────────────────────────────

  /** Greedy rows for the blocks at `indices`, numbered from 0. */
  private _assignLane(indices: number[], rows: number[]): number {
    const blocks = this._blocks;
    const rowEnds: number[] = [];
    const order = [...indices].sort(
      (a, b) => blocks[a]!.startMs() - blocks[b]!.startMs(),
    );
    for (const i of order) {
      const b = blocks[i]!;
      const end = b.startMs() + b.durationMs();
      let row = rowEnds.findIndex((rowEnd) => rowEnd <= b.startMs());
      if (row < 0) {
        row = rowEnds.length;
        rowEnds.push(end);
      } else {
        rowEnds[row] = end;
      }
      rows[i] = row;
    }
    return rowEnds.length;
  }

  /** Component rows first, then the sound lane's rows below them. */
  private _assignRows(): RowLayout {
    const n = this._blocks.length;
    const rows: number[] = new Array(n).fill(0);
    const all = Array.from({ length: n }, (_, i) => i);
    const isSound = (i: number) => this._blocks[i]!.lane === "sound";
    const componentRows = this._assignLane(all.filter((i) => !isSound(i)), rows);
    const soundIndices = all.filter(isSound);
    const soundRows = this._assignLane(soundIndices, rows);
    for (const i of soundIndices) rows[i]! += componentRows;
    const heights = [
      ...new Array<number>(componentRows).fill(ROW_H_CSS),
      ...new Array<number>(soundRows).fill(SOUND_ROW_H_CSS),
    ];
    const tops: number[] = [];
    let y = 0;
    for (const height of heights) {
      tops.push(y);
      y += height;
    }
    return { rows, tops, heights };
  }

  // ── drawing ────────────────────────────────────────────────────────────────

  private _draw(): void {
    const { canvas } = this;
    const dpr = devicePixelRatio;
    const cssRect = canvas.getBoundingClientRect();
    const cssW = cssRect.width;
    if (cssW === 0) return;
    const pxW = Math.round(cssW * dpr);

    const layout = this._assignRows();
    this._layout = layout;
    const { rows, tops, heights } = layout;
    const rowsHeight = heights.reduce((sum, h) => sum + h, 0);
    const cssH = Math.max(ROW_H_CSS, rowsHeight) + BOTTOM_PAD_CSS;
    const pxH = Math.round(cssH * dpr);

    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
      canvas.style.height = `${cssH}px`;
    }

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, pxW, pxH);
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, pxW, pxH);

    const msToX = (ms: number) => this._msToX(ms, pxW);
    const PAD = BLOCK_PAD_CSS * dpr;

    // A faint band behind the sound lane, so it reads as one track.
    const firstSoundRow = this._blocks.reduce(
      (first, b, i) => (b.lane === "sound" ? Math.min(first, rows[i]!) : first),
      Infinity,
    );
    if (firstSoundRow !== Infinity) {
      ctx.fillStyle = "#e3eee3";
      ctx.fillRect(0, tops[firstSoundRow]! * dpr, pxW, (rowsHeight - tops[firstSoundRow]!) * dpr);
    }

    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i]!;
      const row = rows[i]!;
      const startMs = b.startMs();
      const durMs = b.durationMs();
      const x0 = msToX(startMs);
      const x1 = msToX(startMs + durMs);
      const y0 = tops[row]! * dpr + PAD;
      const y1 = (tops[row]! + heights[row]!) * dpr - PAD;
      const bw = Math.max(2 * dpr, x1 - x0);
      const bh = y1 - y0;
      const isSound = b.lane === "sound";
      const selected = isSound
        ? b.id === this._selectedSoundId
        : b.id === this._selectedId;

      // Block body
      ctx.fillStyle = selected
        ? isSound
          ? "#1e6b1e"
          : "#1a5aab"
        : (b.color ?? "#4a8fdb");
      const corner = Math.min(4 * dpr, bw / 2, bh / 2);
      ctx.beginPath();
      ctx.roundRect(x0, y0, bw, bh, corner);
      ctx.fill();

      const wave = b.waveform?.();
      if (wave && durMs > 0) {
        this._drawWaveform(ctx, wave, durMs, x0, bw, y0, bh, pxW);
      }
      if (isSound && selected) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.roundRect(x0 + dpr, y0 + dpr, bw - 2 * dpr, bh - 2 * dpr, corner);
        ctx.stroke();
      }

      // Separate handle line for minDuration blocks — only when minDuration < actual duration
      if (b.handleEndMs) {
        const handleMs = b.handleEndMs();
        if (handleMs !== startMs + durMs) {
          const hx = msToX(handleMs);
          ctx.fillStyle = "#e07020";
          ctx.fillRect(hx - dpr, y0, 2 * dpr, bh);
        }
      }

      // Label, clipped to visible portion of the block
      if (bw > 18 * dpr) {
        const clipLeft = Math.max(0, x0) + 4 * dpr;
        const clipRight = Math.min(pxW, x1) - 2 * dpr;
        if (clipRight > clipLeft) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(clipLeft, y0, clipRight - clipLeft, bh);
          ctx.clip();
          const fontPx = Math.round(11 * dpr);
          ctx.font = `${fontPx}px sans-serif`;
          let labelY = (y0 + y1) / 2;
          if (isSound) {
            // Over the waveform, on a patch just big enough for the words,
            // so both stay readable.
            const patchH = fontPx + 3 * dpr;
            const patchW = ctx.measureText(b.label).width + 6 * dpr;
            ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
            ctx.fillRect(clipLeft - 3 * dpr, y1 - patchH, patchW, patchH);
            labelY = y1 - patchH / 2;
          }
          ctx.fillStyle = "#fff";
          ctx.textBaseline = "middle";
          ctx.textAlign = "left";
          ctx.fillText(b.label, clipLeft, labelY);
          ctx.restore();
        }
      }
    }

    // Play-head line
    const phX = Math.round(msToX(this._playLocalMs));
    ctx.fillStyle = "rgba(200, 0, 0, 0.85)";
    ctx.fillRect(phX, 0, Math.ceil(dpr), pxH);
  }

  /**
   * Min / max bars, one per pixel column, for the part of the audio the block
   * covers.  Only the visible columns are computed.
   */
  private _drawWaveform(
    ctx: CanvasRenderingContext2D,
    { buffer, fromMs }: { buffer: AudioBuffer; fromMs: number },
    durationMs: number,
    x0: number,
    width: number,
    y0: number,
    height: number,
    canvasWidth: number,
  ): void {
    const data = buffer.getChannelData(0);
    const samplesPerMs = buffer.sampleRate / 1000;
    const middle = y0 + height / 2;
    const halfHeight = height / 2 - 1;
    const firstColumn = Math.max(0, Math.floor(-x0));
    const lastColumn = Math.min(width, canvasWidth - x0);
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    for (let px = firstColumn; px < lastColumn; px++) {
      const from = Math.max(
        0,
        Math.floor((fromMs + (px / width) * durationMs) * samplesPerMs),
      );
      const to = Math.min(
        data.length,
        Math.max(
          from + 1,
          Math.floor((fromMs + ((px + 1) / width) * durationMs) * samplesPerMs),
        ),
      );
      if (to <= from) continue;
      let low = data[from]!;
      let high = low;
      for (let i = from + 1; i < to; i++) {
        const v = data[i]!;
        if (v < low) low = v;
        else if (v > high) high = v;
      }
      const top = middle - high * halfHeight;
      const bottom = middle - low * halfHeight;
      ctx.fillRect(x0 + px, top, 1, Math.max(1, bottom - top));
    }
  }

  // ── events ─────────────────────────────────────────────────────────────────

  private _setupEvents(): void {
    const { canvas } = this;

    type DragState =
      | { kind: "idle" }
      | { kind: "potential"; x0: number; y0: number; msAtDown: number; bodyBlock?: { block: TimelineBlock; startMsAtDown: number }; leftBlock?: TimelineBlock; rightBlock?: TimelineBlock }
      | { kind: "pan"; x0: number; viewStart0: number; viewEnd0: number }
      | { kind: "drag-left"; block: TimelineBlock }
      | { kind: "drag-body"; block: TimelineBlock; startMsAtDown: number; msAtDown: number }
      | { kind: "drag-right"; block: TimelineBlock }
      | { kind: "seek" };

    let drag: DragState = { kind: "idle" };

    const toLocalMs = (e: PointerEvent): number => {
      const rect = canvas.getBoundingClientRect();
      return this._xToMs(e.clientX - rect.left, rect.width);
    };

    const clampMs = (ms: number) => Math.max(0, Math.min(this._durationMs, ms));

    type HitInput = { clientX: number; clientY: number; shiftKey?: boolean; altKey?: boolean };
    const hitTest = (e: HitInput): { block: TimelineBlock; zone: "left" | "right" | "body" } | undefined => {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const ms = this._xToMs(cx, rect.width);
      const viewDur = this._viewEndMs - this._viewStartMs;
      const pxPerMs = viewDur > 0 ? rect.width / viewDur : Infinity;
      const handleMs = HANDLE_PX / pxPerMs;

      const { rows, tops, heights } = this._layout;
      for (let i = 0; i < this._blocks.length; i++) {
        const b = this._blocks[i]!;
        const row = rows[i];
        if (row === undefined) continue;
        const top = tops[row]!;
        if (cy < top || cy >= top + heights[row]!) continue;

        const startMs = b.startMs();
        const endMs = startMs + b.durationMs();
        const markerMs = b.handleEndMs?.() ?? endMs;

        const inLeftZone = !!b.onDragLeft && Math.abs(ms - startMs) <= handleMs;
        const inRightZone = !!(b.onDragRight || b.onCommitRight) && Math.abs(ms - markerMs) <= handleMs;
        const inBody = ms >= startMs && ms <= endMs;
        if (!inLeftZone && !inRightZone && !inBody) continue;

        // Modifier overrides — resolve ambiguity on small/zero-duration blocks:
        // Shift → force right-edge (change duration / minDuration)
        if (e.shiftKey && (b.onDragRight || b.onCommitRight)) return { block: b, zone: "right" };
        // Ctrl → force body (select without dragging)
        if (e.altKey) return { block: b, zone: "body" };

        if (inLeftZone) return { block: b, zone: "left" };
        if (inRightZone) return { block: b, zone: "right" };
        return { block: b, zone: "body" };
      }
      return undefined;
    };

    let lastClientX = 0;
    let lastClientY = 0;

    const updateHoverCursor = (e: HitInput) => {
      const hit = hitTest(e);
      const isDurationZone = hit?.zone === "right" && !!(hit.block.onDragRight || hit.block.onCommitRight);
      const isStartTimeZone = hit?.zone === "left" && !!hit.block.onDragLeft;
      const isBodyDraggable = hit?.zone === "body" && !!hit.block.onDragBody;
      const isCtrlSelect = !!e.altKey && !!hit;
      canvas.style.cursor = isDurationZone ? "ew-resize"
        // A sound clip's left edge trims; anything else's moves the start.
        : isStartTimeZone ? (hit.block.lane === "sound" ? "ew-resize" : "grab")
        : isCtrlSelect ? "pointer"
        : isBodyDraggable ? "grab"
        : "crosshair";
    };

    const onKey = (e: KeyboardEvent) => {
      if (drag.kind === "idle" || drag.kind === "potential") {
        updateHoverCursor({ clientX: lastClientX, clientY: lastClientY, shiftKey: e.shiftKey, altKey: e.altKey });
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);

      const hit = hitTest(e);

      // Shift with no right-drag target → seek
      if (e.shiftKey && hit?.zone !== "right") {
        this.onSeek?.(clampMs(toLocalMs(e)));
        drag = { kind: "seek" };
        return;
      }
      // Ctrl on any block → potential so the mouseup triggers selection, not a drag
      if (e.altKey && hit) {
        drag = { kind: "potential", x0: e.clientX, y0: e.clientY, msAtDown: toLocalMs(e) };
        return;
      }
      const msAtDown = toLocalMs(e);
      const leftBlock = hit?.zone === "left" && hit.block.onDragLeft ? hit.block : undefined;
      const rightBlock = hit?.zone === "right" && (hit.block.onDragRight || hit.block.onCommitRight) ? hit.block : undefined;
      const bodyBlock = hit?.zone === "body" && hit.block.onDragBody
        ? { block: hit.block, startMsAtDown: hit.block.startMs() }
        : undefined;
      drag = { kind: "potential", x0: e.clientX, y0: e.clientY, msAtDown, leftBlock, rightBlock, bodyBlock };
    });

    canvas.addEventListener("pointermove", (e) => {
      // Hover cursor (no button pressed)
      if (!(e.buttons & 1)) {
        lastClientX = e.clientX;
        lastClientY = e.clientY;
        updateHoverCursor(e);
        return;
      }

      switch (drag.kind) {
        case "seek":
          this.onSeek?.(clampMs(toLocalMs(e)));
          break;
        case "drag-left":
          drag.block.onDragLeft!(toLocalMs(e));
          this._draw();
          break;
        case "drag-body": {
          const delta = toLocalMs(e) - drag.msAtDown;
          drag.block.onDragBody!(drag.startMsAtDown + delta);
          this._draw();
          break;
        }
        case "drag-right":
          drag.block.onDragRight?.(toLocalMs(e));
          this._draw();
          break;
        case "potential":
          if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 4) {
            if (drag.leftBlock) {
              drag = { kind: "drag-left", block: drag.leftBlock };
            } else if (drag.rightBlock) {
              drag = { kind: "drag-right", block: drag.rightBlock };
            } else if (drag.bodyBlock) {
              drag = { kind: "drag-body", block: drag.bodyBlock.block, startMsAtDown: drag.bodyBlock.startMsAtDown, msAtDown: drag.msAtDown };
            } else {
              drag = { kind: "pan", x0: drag.x0, viewStart0: this._viewStartMs, viewEnd0: this._viewEndMs };
            }
          }
          break;
        case "pan": {
          const rect = canvas.getBoundingClientRect();
          const dur = drag.viewEnd0 - drag.viewStart0;
          const msPerPx = rect.width > 0 ? dur / rect.width : 0;
          const dx = e.clientX - drag.x0;
          let s = drag.viewStart0 - dx * msPerPx;
          s = Math.max(0, Math.min(this._durationMs - dur, s));
          this._viewStartMs = s;
          this._viewEndMs = s + dur;
          this._draw();
          break;
        }
      }
    });

    canvas.addEventListener("pointerup", (e) => {
      if (e.button !== 0) return;
      const saved = drag;
      drag = { kind: "idle" };

      if (saved.kind === "drag-left" || saved.kind === "drag-right" || saved.kind === "drag-body") {
        if (saved.kind === "drag-right") saved.block.onCommitRight?.();
        this._draw();
        return;
      }
      if (saved.kind === "potential") {
        const hit = hitTest(e);
        if (hit) {
          // Any click on any part of a block selects it.
          this.onBlockClick?.(hit.block.id);
        } else {
          this.onSeek?.(clampMs(toLocalMs(e)));
        }
      }
    });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cursorMs = this._xToMs(e.clientX - rect.left, rect.width);
      const factor = e.deltaY > 0 ? 1.5 ** (1 / 7) : 1.5 ** (-1 / 7);
      let s = cursorMs + (this._viewStartMs - cursorMs) * factor;
      let end = cursorMs + (this._viewEndMs - cursorMs) * factor;
      s = Math.max(0, s);
      end = Math.min(this._durationMs, end);
      if (end - s >= MIN_WINDOW_MS) {
        this._viewStartMs = s;
        this._viewEndMs = end;
        this._draw();
      }
    }, { passive: false });
  }
}
