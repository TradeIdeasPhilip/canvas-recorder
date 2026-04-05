type ClickAndDragListener = {
  /**
   * In the case of {$link clickDragAndOnce}(), this is the last message the listener will get.
   * This is when we return control to the default listener.
   * @param x The x position where the mouse went down.
   * @param y The y position where the mouse went down.
   */
  onClick: (x: number, y: number) => void;
  /**
   * This is called when the user presses the mouse, moves more than a tiny amount, then releases.
   * I.e. "drag".  This is called at the end of a drag gesture.
   *
   * In the case of {$link clickDragAndOnce}(), this is the last message the listener will get.
   * This is when we return control to the default listener.
   * @param x0 The starting x, where the mouse went down
   * @param y0 The starting y, where the mouse went down
   * @param x1 The final x, where the mouse button was released
   * @param y1 The final y, where the mouse button was released
   * @param status "mouseup" means that this ended in the archetypal mouse up event, i.e. normal.
   * "mouseleave" means that we stopped tracking the mouse because it left the element.
   * Some callers might consider that an abort.
   */
  onDrag: (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    status: "mouseup" | "mouseleave",
  ) => void;
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
    const { x, y } = getCanvasCoords(e);
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
