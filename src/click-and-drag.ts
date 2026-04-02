type ClickAndDragListener = {
  onClick: (x: number, y: number) => void;
  onDrag: (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    status: "mousemove" | "mouseup" | "mouseleave",
  ) => void;
};

// Add these event handlers to your canvas
export function setupClickAndDrag(
  canvas: HTMLCanvasElement,
  listener: ClickAndDragListener,
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
    listener.onDrag(startX, startY, x, y, "mousemove");
  });

  // Mouse up
  canvas.addEventListener("mouseup", (e: MouseEvent) => {
    if (!isDragging) return;
    if (e.button !== 0) return;

    const { x, y } = getCanvasCoords(e);

    const dx = x - startX;
    const dy = y - startY;

    // Threshold to distinguish click from drag (in canvas pixels)
    const dragThreshold = 5; // pixels

    if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) {
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
      // Optional: you could call onDrag one last time with last known position
      // but usually better to just cancel
    }
  });

  // Optional: prevent context menu on right-click if needed
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
}

type ClickDragAndOnceListener = ClickAndDragListener & { onAbort(): void };

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
        nextTime.onClick(x, y);
        nextTime = undefined;
      } else {
        defaultListener.onClick(x, y);
      }
    },
    onDrag(x0, y0, x1, y1, status) {
      if (nextTime) {
        if (status != "mousemove") {
          nextTime.onDrag(x0, y0, x1, y1, status);
          nextTime = undefined;
        }
      } else {
        defaultListener.onDrag(x0, y0, x1, y1, status);
      }
    },
  });
  return { listenOnce, cancel };
}
