/**
 * Timeline overview for the Visual Editor.
 *
 * Draws horizontal block rows for child components, a play-head, and a chapter
 * cursor.  Supports click-to-seek, click-to-select-block, drag-to-resize handles,
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
};

// ── layout constants (all CSS px) ─────────────────────────────────────────────

const ROW_H_CSS = 28;
const BLOCK_PAD_CSS = 3;   // gap above/below block within its row
const HANDLE_PX = 8;       // pixel zone at block edges that triggers a drag cursor
const MIN_WINDOW_MS = 50;  // smallest zoom window allowed

// ── TimelineDisplay ───────────────────────────────────────────────────────────

export class TimelineDisplay {
  private _blocks: TimelineBlock[] = [];
  private _selectedId: object | undefined;
  private _durationMs = 1000;
  private _playLocalMs = 0;
  private _viewStartMs = 0;
  private _viewEndMs = 1000;
  /** Row assignment cached after each draw so hit-testing reuses it without recomputing. */
  private _cachedRows: number[] = [];

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

  private _assignRows(): number[] {
    const blocks = this._blocks;
    const n = blocks.length;
    const rows: number[] = new Array(n).fill(0);
    const rowEnds: number[] = [];

    const order = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => blocks[a]!.startMs() - blocks[b]!.startMs());

    for (const i of order) {
      const b = blocks[i]!;
      const end = b.startMs() + b.durationMs();
      let placed = false;
      for (let r = 0; r < rowEnds.length; r++) {
        if (rowEnds[r]! <= b.startMs()) {
          rows[i] = r;
          rowEnds[r] = end;
          placed = true;
          break;
        }
      }
      if (!placed) {
        rows[i] = rowEnds.length;
        rowEnds.push(end);
      }
    }
    return rows;
  }

  // ── drawing ────────────────────────────────────────────────────────────────

  private _draw(): void {
    const { canvas } = this;
    const dpr = devicePixelRatio;
    const cssRect = canvas.getBoundingClientRect();
    const cssW = cssRect.width;
    if (cssW === 0) return;
    const pxW = Math.round(cssW * dpr);

    const rows = this._assignRows();
    this._cachedRows = rows;
    const numRows = rows.length > 0 ? Math.max(...rows) + 1 : 0;
    const cssH = Math.max(ROW_H_CSS, numRows * ROW_H_CSS);
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
    const ROW_PX = ROW_H_CSS * dpr;
    const PAD = BLOCK_PAD_CSS * dpr;

    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i]!;
      const row = rows[i]!;
      const startMs = b.startMs();
      const durMs = b.durationMs();
      const x0 = msToX(startMs);
      const x1 = msToX(startMs + durMs);
      const y0 = row * ROW_PX + PAD;
      const y1 = (row + 1) * ROW_PX - PAD;
      const bw = Math.max(2 * dpr, x1 - x0);
      const bh = y1 - y0;
      const selected = b.id === this._selectedId;

      // Block body
      ctx.fillStyle = selected ? "#1a5aab" : (b.color ?? "#4a8fdb");
      const corner = Math.min(4 * dpr, bw / 2, bh / 2);
      ctx.beginPath();
      ctx.roundRect(x0, y0, bw, bh, corner);
      ctx.fill();

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
          ctx.fillStyle = "#fff";
          ctx.font = `${Math.round(11 * dpr)}px sans-serif`;
          ctx.textBaseline = "middle";
          ctx.textAlign = "left";
          ctx.fillText(b.label, clipLeft, (y0 + y1) / 2);
          ctx.restore();
        }
      }
    }

    // Play-head line
    const phX = Math.round(msToX(this._playLocalMs));
    ctx.fillStyle = "rgba(200, 0, 0, 0.85)";
    ctx.fillRect(phX, 0, Math.ceil(dpr), pxH);
  }

  // ── events ─────────────────────────────────────────────────────────────────

  private _setupEvents(): void {
    const { canvas } = this;

    type DragState =
      | { kind: "idle" }
      | { kind: "potential"; x0: number; y0: number; msAtDown: number; bodyBlock?: { block: TimelineBlock; startMsAtDown: number } }
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

      for (let i = 0; i < this._blocks.length; i++) {
        const b = this._blocks[i]!;
        const row = this._cachedRows[i];
        if (row === undefined) continue;
        if (cy < row * ROW_H_CSS || cy >= (row + 1) * ROW_H_CSS) continue;

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
        : isStartTimeZone ? "grab"
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
      if (hit?.zone === "left" && hit.block.onDragLeft) {
        drag = { kind: "drag-left", block: hit.block };
        return;
      }
      if (hit?.zone === "right" && (hit.block.onDragRight || hit.block.onCommitRight)) {
        drag = { kind: "drag-right", block: hit.block };
        return;
      }
      const msAtDown = toLocalMs(e);
      const bodyBlock =
        hit?.zone === "body" && hit.block.onDragBody
          ? { block: hit.block, startMsAtDown: hit.block.startMs() }
          : undefined;
      drag = { kind: "potential", x0: e.clientX, y0: e.clientY, msAtDown, bodyBlock };
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
            if (drag.bodyBlock) {
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
