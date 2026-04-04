type ClickAndDragListener = {
  onClick: (x: number, y: number) => void;
  onDrag: (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    status: "mouseup" | "mouseleave",
  ) => void;
  onMove: (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    status: "drag" | "click",
  ) => void;
};

//
/**
 * Add these event handlers to your canvas.
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

  // Helper to get canvas-relative coordinates
  function getCanvasCoords(e: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  /**
   *
   * @param x The current x in canvas coordinates.
   * @param y The current y in canvas coordinates.
   * @returns True if this move is small enough to be called a click.
   * False if the move is big enough to be called a drag.
   */
  function tinyMove(x: number, y: number) {
    const dx = x - startX;
    const dy = y - startY;
    return Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold;
  }

  // Mouse down
  canvas.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button

    const { x, y } = getCanvasCoords(e);
    isDragging = true;
    startX = x;
    startY = y;
  });

  // Mouse move - only track when dragging
  canvas.addEventListener("mousemove", (e: MouseEvent) => {
    if (!isDragging) return;

    const { x, y } = getCanvasCoords(e);

    // Call onDrag with current start and current position
    listener.onMove(startX, startY, x, y, tinyMove(x, y) ? "click" : "drag");
  });

  // Mouse up
  canvas.addEventListener("mouseup", (e: MouseEvent) => {
    if (!isDragging) return;
    if (e.button !== 0) return;

    const { x, y } = getCanvasCoords(e);

    if (tinyMove(x, y)) {
      // It's a click
      listener.onClick(startX, startY);
    } else {
      // It's a drag - call onDrag with final position
      listener.onDrag(startX, startY, x, y, "mouseup");
    }

    isDragging = false;
  });

  // Cancel drag if mouse leaves the canvas
  canvas.addEventListener("mouseleave", (e) => {
    if (isDragging) {
      isDragging = false;
      const { x, y } = getCanvasCoords(e);
      listener.onDrag(startX, startY, x, y, "mouseleave");
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
    onDrag(x0, y0, x1, y1, status) {
      if (nextTime) {
        const listener = nextTime;
        // Clear this first, in case the callback wants to register another callback.
        nextTime = undefined;
        listener.onDrag(x0, y0, x1, y1, status);
      } else {
        defaultListener.onDrag(x0, y0, x1, y1, status);
      }
    },
    onMove(x0, y0, x1, y1, status) {
      if (nextTime) {
        nextTime.onMove(x0, y0, x1, y1, status);
      } else {
        defaultListener.onMove(x0, y0, x1, y1, status);
      }
    },
  });
  return { listenOnce, cancel };
}
