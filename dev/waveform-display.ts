/**
 * Self-contained waveform overview display.
 *
 * Shows min/max audio samples per pixel, a play-head line, and a past/future
 * background split.  Supports click-to-seek, drag-to-pan, and scroll-to-zoom.
 *
 * Usage:
 *   const display = new WaveformDisplay(canvasElement);
 *   display.onSeek = (ms) => seekAudioTo(ms);
 *   display.setAudioBuffer(audioBuilder.getAudioBuffer());
 *   display.setChapter(startMs, endMs);   // call on chapter change
 *   display.setPlayMs(currentMs);         // call every animation frame
 */
export class WaveformDisplay {
  private soundData: Float32Array | null = null;
  private sampleRate = 44100;
  private chapterStartMs = 0;
  private chapterEndMs = 0;
  private playMs = 0;
  /** Left edge of the visible window, in global ms. */
  private viewStartMs = 0;
  /** Right edge of the visible window, in global ms. */
  private viewEndMs = 0;

  /** Smallest visible window allowed, in ms. Prevents zooming past one sample. */
  private static readonly MIN_WINDOW_MS = 100;

  /** Fires when the user clicks or completes a short drag. Argument is global ms. */
  onSeek?: (ms: number) => void;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.setupEvents();
  }

  /** Replace the audio source. Pass null to clear (shows placeholder). */
  setAudioBuffer(buffer: AudioBuffer | null): void {
    this.soundData = buffer ? buffer.getChannelData(0) : null;
    this.sampleRate = buffer?.sampleRate ?? 44100;
  }

  /**
   * Set which chapter is active.  Resets zoom/pan to show the full chapter.
   * @param startMs  Chapter start in global audio ms.
   * @param endMs    Chapter end in global audio ms.
   */
  setChapter(startMs: number, endMs: number): void {
    this.chapterStartMs = startMs;
    this.chapterEndMs = endMs;
    this.viewStartMs = startMs;
    this.viewEndMs = endMs;
  }

  /** Call every animation frame.  Updates the play-head and redraws. */
  setPlayMs(ms: number): void {
    this.playMs = ms;
    this.draw();
  }

  // MARK: draw

  private draw(): void {
    const { canvas } = this;
    const dpr = devicePixelRatio;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (w === 0 || h === 0) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext("2d")!;
    const { viewStartMs, viewEndMs, playMs } = this;
    const viewDur = viewEndMs - viewStartMs;
    if (viewDur <= 0) return;

    const msToX = (ms: number) => ((ms - viewStartMs) / viewDur) * w;

    // Background: gray for already-played, white for upcoming.
    const playX = Math.round(msToX(playMs));
    ctx.fillStyle = "#e8e8e8";
    ctx.fillRect(0, 0, playX, h);
    ctx.fillStyle = "#fff";
    ctx.fillRect(playX, 0, w - playX, h);

    // Waveform bars.
    if (this.soundData) {
      const data = this.soundData;
      const rate = this.sampleRate;
      const total = data.length;
      const msToSample = (ms: number) => (ms / 1000) * rate;

      ctx.fillStyle = "#333";
      for (let px = 0; px < w; px++) {
        const s0 = Math.floor(msToSample(viewStartMs + (px / w) * viewDur));
        const s1 = Math.floor(
          msToSample(viewStartMs + ((px + 1) / w) * viewDur),
        );
        const from = Math.max(0, s0);
        const to = Math.min(total, Math.max(s0 + 1, s1));
        if (to <= from) continue;

        let mn = data[from]!;
        let mx = mn;
        for (let i = from + 1; i < to; i++) {
          const v = data[i]!;
          if (v < mn) mn = v;
          else if (v > mx) mx = v;
        }
        // Audio convention: +1 → top, −1 → bottom.
        const top = Math.round(((1 - mx) / 2) * h);
        const bot = Math.round(((1 - mn) / 2) * h);
        ctx.fillRect(px, top, 1, Math.max(1, bot - top));
      }
    } else {
      ctx.fillStyle = "#999";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const fs = Math.max(10, Math.round(h * 0.4));
      ctx.font = `${fs}px sans-serif`;
      ctx.fillText("No audio", w / 2, h / 2);
    }

    // Play-head line.
    ctx.fillStyle = "#d00";
    ctx.fillRect(playX, 0, 1, h);
  }

  // MARK: events

  private setupEvents(): void {
    const { canvas } = this;
    /** clientX when the pointer went down. */
    let downX = 0;
    /** View range when the pointer went down, for pan math. */
    let downStart = 0;
    let downEnd = 0;
    let panning = false;

    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      downX = e.clientX;
      downStart = this.viewStartMs;
      downEnd = this.viewEndMs;
      panning = false;
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!(e.buttons & 1)) return;
      const dx = e.clientX - downX;
      if (!panning && Math.abs(dx) > 4) panning = true;
      if (!panning) return;

      const rect = canvas.getBoundingClientRect();
      const msPerPx = (downEnd - downStart) / rect.width;
      const dur = downEnd - downStart;
      let s = downStart - dx * msPerPx;
      // Clamp so we don't pan outside the chapter.
      s = Math.max(this.chapterStartMs, Math.min(this.chapterEndMs - dur, s));
      this.viewStartMs = s;
      this.viewEndMs = s + dur;
      this.draw();
    });

    canvas.addEventListener("pointerup", (e) => {
      if (e.button !== 0) return;
      if (!panning) {
        // Treat as a click → seek.
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ms =
          this.viewStartMs +
          (x / rect.width) * (this.viewEndMs - this.viewStartMs);
        const clamped = Math.max(
          this.chapterStartMs,
          Math.min(this.chapterEndMs, ms),
        );
        this.onSeek?.(clamped);
      }
      panning = false;
    });

    // Scroll wheel: zoom centered on the cursor position.
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cursorMs =
          this.viewStartMs +
          (cx / rect.width) * (this.viewEndMs - this.viewStartMs);

        // deltaY > 0 → scroll down → zoom out (show more).
        const sensitivity = 1 / 7;
        const factor = e.deltaY > 0 ? 1.5 ** sensitivity : 1.5 ** -sensitivity;
        let newStart = cursorMs + (this.viewStartMs - cursorMs) * factor;
        let newEnd = cursorMs + (this.viewEndMs - cursorMs) * factor;

        // Keep inside the chapter.
        newStart = Math.max(this.chapterStartMs, newStart);
        newEnd = Math.min(this.chapterEndMs, newEnd);

        if (newEnd - newStart >= WaveformDisplay.MIN_WINDOW_MS) {
          this.viewStartMs = newStart;
          this.viewEndMs = newEnd;
          this.draw();
        }
      },
      { passive: false },
    );
  }
}
