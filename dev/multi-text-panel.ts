import { ReadOnlyRect } from "phil-lib/misc";
import {
  MultiTextComponent,
  ROTATIONS,
} from "../src/slide-components/multi-text.ts";
import {
  ALIGN_HORIZONTALLY,
  ALIGN_VERTICALLY,
  buildSnapRow,
  STRETCH_TO_CANVAS,
  tidy,
  tidyRect,
} from "./rect-snap.ts";
import { buildNumericInput } from "./schedule-helpers.ts";

/** Whether the frame is drawn on the canvas (👁), and whether it has handles to drag (✎). */
export type CanvasState = { readonly viewing: boolean; readonly editing: boolean };

/** What the panel needs from the Visual Editor.  It never reaches into canvas-recorder.ts directly. */
export type TextFramePanelHooks = {
  /**
   * Position, Width and Height were just changed by
   * {@link MultiTextComponent.setFrame}.  Sync their number fields and save.
   */
  readonly frameChanged: () => void;
  /** Rotation was changed by a button.  Rebuild so the Rotation menu shows it, and save. */
  readonly rotationChanged: () => void;
  readonly canvasState: () => CanvasState;
  readonly setCanvasState: (state: CanvasState) => void;
};

export type TextFramePanel = {
  readonly element: HTMLElement;
  /** Something the frame depends on may have changed.  Redraw.  Leaves alone a field you're typing in. */
  refresh(): void;
};

const FIELDS = ["x", "y", "width", "height"] as const;

/**
 * The "Text Frame" panel shown at the top of the schedule editor when a
 * {@link MultiTextComponent} is selected.
 *
 * It edits the frame the way it looks on screen, after Rotation:  the x, y,
 * width and height you'd see if you measured the box on the canvas, handles to
 * drag it, buttons to snap it to the canvas, and buttons to turn it in place.
 * Underneath it's all Position, Width and Height (see
 * {@link MultiTextComponent.setFrame}), which stay in the text's own
 * directions in the fields below.
 *
 * See development-plans/rotate-and-auto-size-multi-text.md.
 */
export function buildTextFramePanel(
  text: MultiTextComponent,
  hooks: TextFramePanelHooks,
): TextFramePanel {
  const panel = document.createElement("fieldset");
  panel.style.cssText = "border-color:#6a7fae;margin-bottom:0.4em";
  const legend = document.createElement("legend");
  legend.textContent = "Text Frame";
  panel.append(legend);

  const line = (cssText = "") => {
    const div = document.createElement("div");
    div.style.cssText = cssText;
    panel.append(div);
    return div;
  };
  const button = (parent: HTMLElement, label: string, title: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.style.marginRight = "0.3em";
    parent.append(b);
    return b;
  };

  // MARK: Controls

  const canvasRow = line();
  const viewBtn = button(canvasRow, "👁", "Show the frame on the canvas");
  const editBtn = button(
    canvasRow,
    "✎",
    "Drag the frame on the canvas.  Corners resize it; the middle moves it.  " +
      "Hold Shift on a corner to keep its shape.",
  );
  const turnLeftBtn = button(
    canvasRow,
    "⟲ 90°",
    "Turn the text a quarter turn counterclockwise, in place.\n\n" +
      "The frame keeps its center.  (The Rotation menu below turns about Position instead.)",
  );
  turnLeftBtn.style.marginLeft = "0.8em";
  const turnRightBtn = button(
    canvasRow,
    "⟳ 90°",
    "Turn the text a quarter turn clockwise, in place.\n\n" +
      "The frame keeps its center.  (The Rotation menu below turns about Position instead.)",
  );

  const fieldsRow = line("margin-top:0.3em");
  fieldsRow.title =
    "The frame as it appears on screen, after Rotation.  " +
    "Turned 90°, width here is the frame's Height below, and height is its Width.";
  const inputs = Object.fromEntries(
    FIELDS.map((field) => {
      const label = document.createElement("label");
      label.textContent = `${field} `;
      label.style.marginRight = "0.5em";
      const input = buildNumericInput(0, (n) => {
        if (!text.frameIsEditable) return;
        text.setFrame({ ...text.frameAt(0), [field]: n });
        hooks.frameChanged();
        refresh();
      });
      label.append(input);
      fieldsRow.append(label);
      return [field, input];
    }),
  ) as Record<(typeof FIELDS)[number], HTMLInputElement>;

  const snapRow = buildSnapRow(
    [ALIGN_HORIZONTALLY, ALIGN_VERTICALLY, STRETCH_TO_CANVAS],
    target,
    (rect) => {
      text.setFrame(rect);
      hooks.frameChanged();
      refresh();
    },
  );
  snapRow.element.style.marginTop = "0.3em";
  panel.append(snapRow.element);

  const notes = line("font-size:0.85em;color:#a06000;margin-top:0.2em");

  // MARK: Behavior

  /** The frame the buttons and fields act on, or why there isn't one. */
  function target(): ReadOnlyRect | string {
    return text.frameIsEditable
      ? text.frameAt(0)
      : "Position, Width, Height, Anchor X or Baseline has several keyframes, " +
          "so there's no one frame to edit here.  Use the keyframes below.";
  }

  function turnBy(quarterTurns: 1 | 3): void {
    const before = text.frameIsEditable ? text.frameAt(0) : undefined;
    text.rotationScalar.value = ROTATIONS[(text.quarterTurns + quarterTurns) % 4];
    if (before) {
      // Turn in place, about the frame's center, the way PowerPoint does.  A
      // quarter turn swaps the frame's width and height on screen.
      const centerX = before.x + before.width / 2;
      const centerY = before.y + before.height / 2;
      text.setFrame(
        tidyRect({
          x: centerX - before.height / 2,
          y: centerY - before.width / 2,
          width: before.height,
          height: before.width,
        }),
      );
      hooks.frameChanged();
    }
    hooks.rotationChanged();
  }
  turnLeftBtn.addEventListener("click", () => turnBy(3));
  turnRightBtn.addEventListener("click", () => turnBy(1));

  viewBtn.addEventListener("click", () => {
    const state = hooks.canvasState();
    hooks.setCanvasState({ ...state, viewing: !state.viewing });
    refresh();
  });
  editBtn.addEventListener("click", () => {
    const state = hooks.canvasState();
    hooks.setCanvasState({ ...state, editing: !state.editing });
    refresh();
  });

  function refresh(): void {
    const editable = text.frameIsEditable;
    const frame = editable ? text.frameAt(0) : undefined;
    for (const field of FIELDS) {
      const input = inputs[field];
      input.disabled = !editable;
      // Don't fight the user's typing.  That field is the source of the change.
      if (document.activeElement === input) continue;
      input.value = frame ? String(tidy(frame[field])) : "";
    }

    const state = hooks.canvasState();
    viewBtn.classList.toggle("active", state.viewing);
    editBtn.classList.toggle("active", state.editing);
    viewBtn.disabled = editBtn.disabled = !editable;

    snapRow.draw();

    notes.replaceChildren();
    const note = (message: string) => {
      const div = document.createElement("div");
      div.textContent = message;
      notes.append(div);
    };
    if (!editable) note(target() as string);
    // Width runs along the lines, so after an odd number of quarter turns it's
    // the frame's height on screen.
    const sideways = text.quarterTurns % 2 === 1;
    if (text.widthModeScalar.value === "unbounded") {
      note(
        `Width Mode is unbounded, so the frame's ${sideways ? "height" : "width"} doesn't limit the text.`,
      );
    }
    if (text.heightModeScalar.value === "unbounded") {
      note(
        `Height Mode is unbounded, so the frame's ${sideways ? "width" : "height"} doesn't limit the text.`,
      );
    }
  }

  refresh();
  return { element: panel, refresh };
}
