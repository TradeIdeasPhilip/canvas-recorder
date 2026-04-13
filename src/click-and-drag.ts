type ClickAndDragListener = {
  /**
   * In the case of {$link clickDragAndOnce}(), this is the last message the listener will get.
   * This is when we return control to the default listener.
   * @param x The x position where the mouse went down.
   * @param y The y position where the mouse went down.
   */
  onClick: (x: number, y: number) => void;
  /**
   * This is called when the user presses the mouse, moves more than a tiny amount, then releases
   * normally (mouseup).
   *
   * In the case of {$link clickDragAndOnce}(), this is the last message the listener will get.
   * This is when we return control to the default listener.
   * @param x0 The starting x, where the mouse went down
   * @param y0 The starting y, where the mouse went down
   * @param x1 The final x, where the mouse button was released
   * @param y1 The final y, where the mouse button was released
   */
  onDrag: (x0: number, y0: number, x1: number, y1: number) => void;
  /**
   * Called when a drag in progress is cancelled — either by the Escape key or by the
   * browser taking the pointer away (e.g. a scroll gesture).
   * The drag position at the time of cancellation is not reported; callers should
   * treat this as "nothing happened".
   */
  cancel: () => void;
  /**
   * Called each time the mouse moves in the element while a drag is in progress.
   *
   * This will **not** cancel a {$link clickDragAndOnce}() session.
   * Expect any number of these callbacks.
   * @param x0 The starting x, where the mouse went down
   * @param y0 The starting y, where the mouse went down
   * @param x1 The current x, where the mouse is now
   * @param y1 The current y, where the mouse is now
   * @param status If the user released the mouse button here,
   * would the event be a click or a drag.
   */
  onDragMove: (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    status: "drag" | "click",
  ) => void;
  /**
   * Called each time the mouse moves and a drag is **not** in progress.
   * @param x The current x, where the mouse is now.
   * @param y The current y, where the mouse is now.
   */
  onFreeMove: (x: number, y: number) => void;
};

//
/**
 * Add these event handlers to your canvas.
 *
 * The pointer is captured on mousedown so dragging outside the canvas continues
 * to fire move events rather than triggering a leave/cancel.  Coordinates are
 * clamped to the canvas bounds while a drag is in progress, so dragging way off
 * to the left snaps to x=0 and dragging way off to the right snaps to x=canvas.width.
 *
 * Pressing Escape while a drag is in progress calls onDrag with status "mouseleave"
 * (i.e. cancel semantics).
 *
 * @param canvas
 * @param listener
 * @param dragThreshold To distinguish click from drag (in canvas pixels)
 */
export function setupClickAndDrag(
  canvas: HTMLCanvasElement,
  listener: ClickAndDragListener,
  dragThreshold = 5,
): void {
  let isDragging = false;
  let startX = 0;
  let startY = 0;

  // Helper to get canvas-relative coordinates, optionally clamped to canvas bounds.
  function getCanvasCoords(
    e: PointerEvent,
    clamp: boolean,
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let x = (e.clientX - rect.left) * scaleX;
    let y = (e.clientY - rect.top) * scaleY;
    if (clamp) {
      x = Math.max(0, Math.min(canvas.width, x));
      y = Math.max(0, Math.min(canvas.height, y));
    }
    return { x, y };
  }

  /**
   * @returns True if this move is small enough to be called a click.
   */
  function tinyMove(x: number, y: number) {
    const dx = x - startX;
    const dy = y - startY;
    return Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold;
  }

  function cancelDrag() {
    isDragging = false;
    listener.cancel();
  }

  // Pointer down — capture the pointer so moves continue even outside the canvas.
  canvas.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getCanvasCoords(e, false);
    isDragging = true;
    startX = x;
    startY = y;
  });

  // Pointer move — clamp coordinates to canvas bounds while dragging so that
  // dragging off-screen maps to the nearest edge rather than out-of-range values.
  canvas.addEventListener("pointermove", (e: PointerEvent) => {
    const { x, y } = getCanvasCoords(e, isDragging);
    if (isDragging) {
      listener.onDragMove(
        startX,
        startY,
        x,
        y,
        tinyMove(x, y) ? "click" : "drag",
      );
    } else {
      listener.onFreeMove(x, y);
    }
  });

  // Pointer up — complete the drag (or click) with clamped final position.
  canvas.addEventListener("pointerup", (e: PointerEvent) => {
    if (!isDragging) return;
    if (e.button !== 0) return;
    isDragging = false;
    const { x, y } = getCanvasCoords(e, true);
    if (tinyMove(x, y)) {
      listener.onClick(startX, startY);
    } else {
      listener.onDrag(startX, startY, x, y);
    }
  });

  // Pointer cancel — browser took the pointer away (e.g. scroll gesture).
  canvas.addEventListener("pointercancel", (_e: PointerEvent) => {
    if (!isDragging) return;
    cancelDrag();
  });

  // Escape key — cancel a drag in progress.
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && isDragging) {
      cancelDrag();
    }
  });

  // Optional: prevent context menu on right-click if needed
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
}

type ClickDragAndOnceListener = ClickAndDragListener & { onAbort(): void };

/**
 * This is similar to {@link setupClickAndDrag}(),
 * but this allows temporary overrides.
 * @param canvas Attach the listeners to this.
 * @param defaultListener Use this listener except when a one time request is in effect.
 * @returns An object that can be used to add or cancel a temporary listener.
 */
export function clickDragAndOnce(
  canvas: HTMLCanvasElement,
  defaultListener: ClickAndDragListener,
) {
  let nextTime: ClickDragAndOnceListener | undefined;
  function listenOnce(listener: ClickDragAndOnceListener) {
    if (nextTime) {
      nextTime.onAbort();
    }
    nextTime = listener;
  }
  function cancel(listener: ClickDragAndOnceListener) {
    if (listener != nextTime) {
      throw new Error("wtf");
    }
    nextTime = undefined;
  }

  // Escape key — abort an active extend-mode session (nextTime listener).
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && nextTime) {
      const listener = nextTime;
      nextTime = undefined;
      listener.onAbort();
    }
  });

  setupClickAndDrag(canvas, {
    onClick(x, y) {
      if (nextTime) {
        const listener = nextTime;
        // Clear this first, in case the callback wants to register another callback.
        nextTime = undefined;
        listener.onClick(x, y);
      } else {
        defaultListener.onClick(x, y);
      }
    },
    onDrag(x0, y0, x1, y1) {
      if (nextTime) {
        const listener = nextTime;
        // Clear this first, in case the callback wants to register another callback.
        nextTime = undefined;
        listener.onDrag(x0, y0, x1, y1);
      } else {
        defaultListener.onDrag(x0, y0, x1, y1);
      }
    },
    cancel() {
      if (nextTime) {
        const listener = nextTime;
        nextTime = undefined;
        listener.cancel();
      } else {
        defaultListener.cancel();
      }
    },
    onDragMove(x0, y0, x1, y1, status) {
      if (nextTime) {
        nextTime.onDragMove(x0, y0, x1, y1, status);
      } else {
        defaultListener.onDragMove(x0, y0, x1, y1, status);
      }
    },
    onFreeMove(x, y) {
      if (nextTime) {
        nextTime.onFreeMove(x, y);
      } else {
        defaultListener.onFreeMove(x, y);
      }
    },
  });
  return { listenOnce, cancel };
}
