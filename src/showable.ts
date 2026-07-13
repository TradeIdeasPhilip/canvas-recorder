import { positiveModulo, ReadOnlyRect } from "phil-lib/misc";
import { ease, easeIn, easeOut, Keyframe } from "./interpolate";
import { Point } from "./glib/path-shape";

/**
 * The content shouldn't know much about the Visual Editor.
 * For example, the content might be running in the command line version of this code, which has no Visual Editor.
 * Also, the Visual Editor is big and complicated and constantly changing.
 * This is a minimal interface to the Visual Editor for use in {@link RootComponentEditor}.
 * If there is no Visual Editor then {@link RootComponentEditor.start}() will never be called.
 */
export type VisualEditorAPI = {
  /**
   * @returns Which component's properties are currently available in the bottom right of the screen.
   */
  getCurrentlySelected(): Showable;
  /**
   *
   * @param howMuch "sound" means to rebuild the sound from clips.
   * "properties" means that the values of one or more properties has changed.  "properties" means schedules or scalars.
   * "structure" means that something bigger has changed, like adding or removing a component.
   * "structure" pretty much implies that the sounds and properties should be reread.
   */
  refreshGUI(howMuch: "sound" | "properties" | "structure"): void;
};

/**
 * The "root" component refers to the showable at the top of the tree on the top right side of the screen.
 * Each root component can bring a tree of children, all editable by the Visual Editor, all saved in one group per root.
 *
 * This allows a component to add custom content to the Visual Editor.
 * This content should be displayed in the scrollable section of the top right part of the screen, right under the list of components.
 */
export type RootComponentEditor = {
  /**
   * Call this when a new root element is selected.
   * @param visualEditor These are functions that can be used to communicate with the Visual Editor.
   * You can hold onto this until you are suspended.
   * Trying to use the object after that is forbidden and the results are undefined.
   * @returns This element should be displayed so this object can interact with the user.
   */
  start(visualEditor: VisualEditorAPI): HTMLElement;
  /**
   * This is called when a new root element is put in place.
   * This object might have created other listeners or callbacks and now would be a good time to cancel those.
   */
  suspend(): void;
  /**
   * This is called whenever the Visual Editor updates something.
   * @param component What changed?
   * @param property What changed?
   */
  update(component: Showable, property: ScalarInfo | ScheduleInfo): void;
  /**
   * This is called whenever
   * @param selected Which component's properties are currently available in the bottom right of the screen.
   */
  selectionChanged(selected: Showable): void;
  /**
   * If there are a lot of updates, or if something other than a property value changed, this will be called.
   * E.g. a new component was added or the entire thing was reloaded from a snapshot.
   */
  resetAll(): void;
};

/**
 * This represents an animation.
 * This might be the entire animation we intend to display or record.
 * Or this might be a part of the animation that will be joined with other parts.
 */
export type Showable = {
  /**
   * How long should this effect last, in milliseconds?
   * This should be 0 or positive.
   *
   * This can be +Infinity.
   * That could be a problem when saving to a file.
   * That can be overridden by MakeShowableInParallel.
   *
   * **duration = 0 in a series vs. in parallel:**
   * - In a `MakeShowableInParallel` group, duration=0 is fine — the group's
   *   total duration is the max of all children, so a 0-duration child just
   *   runs for whatever time the other children require.  Use this for
   *   backgrounds, title overlays, and any other layer that should last as
   *   long as the container.
   * - In a `MakeShowableInSeries` group (or directly in the scene list),
   *   duration=0 means the item contributes nothing to the timeline.  The GUI
   *   hides it to reduce clutter (the assumption is that duration=0 marks a
   *   disabled item).  Give such an item a nonzero duration — or use
   *   `reserve()` on the enclosing `MakeShowableInParallel` — so the series
   *   allocates time for it.
   */
  readonly duration: number;
  /**
   * Something user friendly.
   *
   * Aimed at a person using our development console.
   * That type of user can navigate a tree of Showable objects.
   */
  readonly description: string;
  /**
   * What should we display in the tree of subcomponents in the Visual Editor?
   * Each component should have a meaningful name.
   * Display this:  `component.userEditableDescription??description`.
   *
   * Note:
   * The chapterSelector only looks at the {@link Showable.description} field.
   * `description` works well for items that are created mostly in TypeScript.
   * For example, the top level items submitted to \<select id="chapterSelector">
   * often have names like "Try New Items" or at least "Slide 1" and "Slide 2".
   * However, when you are creating a lot of instances of components, they will all have boring and repetitive names,
   * like "Traditional Text" or "Slide".
   * In this new case of the Visual Editor and components, we need a way to edit the description from the GUI.
   * These values will be up to the end user and completely unconstrained.
   * Unfortunately a lot of the current code expects the `description` field to be immutable and sane.
   * Otherwise I'd reuse that field.
   *
   * This field is only modified by the user and the Visual Editor.
   * In particular, there is no callback to say that this has changed.
   *
   * Recommended GUI:  When you select a component in the Visual Editor, you see a list of properties for that component.
   * That includes schedules and scalars.
   * This new property should appear at the top of that scrollable list of properties.
   * Call this property "Name" (a reference to Delphi and similar tools).
   * The property editor should contain an \<input> for the string version of this property.
   * And it should contain a \<button> labeled "Reset".
   * If the user hits the reset button, the input is cleared and the reset button is disabled.
   * If the user modifies the \<input> the reset button is reenabled.
   * The reset button changes this field to `undefined` (or removes it completely).
   *
   * This field will get saved and loaded at the same time as we save and load the other properties of each component.
   */
  userEditableDescription?: string;
  /**
   * Aimed at a person using our development console.
   * That type of user can navigate a tree of Showable objects.
   */
  readonly children?: readonly {
    readonly start: number;
    readonly child: Showable;
  }[];

  readonly soundClips?: readonly {
    readonly source: string;
    readonly startMsIntoScene: number;
    readonly startMsIntoClip?: number;
    readonly lengthMs?: number;
  }[];

  /**
   * Scalar (non-time-varying) fields displayed and edited in the Visual Editor,
   * rendered above {@link schedules}.  Unlike schedules, each field holds a
   * single mutable `value`.  Consider importing from `schedule-helper.ts` to
   * create scalar infos.
   */
  readonly scalars?: readonly ScalarInfo[];

  /**
   * These will be displayed in the Visual Editor.
   * Note most "properties" can change over time so I call them "schedules".
   * Consider importing from schedule-helper.ts to create the schedules.
   */
  readonly schedules?: readonly ScheduleInfo[];

  /**
   * Runtime-mutable list of components managed by the component editor.
   * Each component's show() is called with the parent's ShowOptions every frame.
   * When undefined the component editor is not available for this item.
   * Set to [] to opt in with an initially empty list.
   */
  readonly components?: Showable[];

  /**
   * TypeScript-defined list of components whose structure cannot be changed by
   * the user — they cannot be added, removed, or reordered.  Their properties
   * (schedules, scalars, sub-components) remain fully editable in the Visual
   * Editor.  Each item can itself carry `components` and/or `fixedComponents`.
   *
   * `undefined` and `[]` are equivalent.
   */
  readonly fixedComponents?: readonly Showable[];

  /**
   * Any time a new root component is selected, see if that component has this property set.
   * If so, call {@link RootComponentEditor.start}() and honer the other callbacks in {@link RootComponentEditor}.
   */
  readonly rootComponentEditor?: RootComponentEditor;

  /**
   * Key in `componentRegistry` that can recreate this component.
   * Set this on any component that is hardcoded in TypeScript source so the
   * visual editor can serialize it into TypeScript defaults and the save/restore
   * pipeline can round-trip it correctly.
   */
  registryKey?: string;
  /**
   * Draw this object to the canvas.
   *
   * This should have no other assumptions or side effects.
   * The system can call show with any input at any time.
   * @param timeInMs Show the animation at this time.
   *
   * This will typically be between 0 and `duration`, inclusive.
   * See addMargins() or MakeShowableInSeries or makeShowableInSeries() if you need to be certain.
   */
  show(options: ShowOptions): void;
};

/**
 * Use as {@link ScheduleInfo.timeAxisLabel} when keyframe times are 0–1
 * progress values rather than milliseconds.
 */
export const progressAxisLabel = "Progress (0 - 1)";

export type ScheduleInfo = {
  /**
   * Visible on the GUI
   */
  readonly description: string;
  /**
   * If true, the user edits the durations of the schedules.
   * If false, the default, the user edits the start times of the schedule.
   * Either way, we store start times in the schedule.
   */
  readonly editDurations?: boolean;
  /**
   * Label for the time/position column in the Visual Editor.
   * Defaults to `"Time (ms)"` (or `"Duration (ms)"` when {@link editDurations} is true).
   * Set to {@link progressAxisLabel} when keyframe times are 0–1 progress values.
   */
  readonly timeAxisLabel?: string;
} & (
  | {
      readonly type: "string";
      // Maybe schedule should actually be a BinaryInserter!!!
      // That might be helpful here and it might help in other places.
      // BinaryInserter isn't necessary here, but it might be useful.
      readonly schedule: Keyframe<string>[];
      /**
       * When set, the Visual Editor renders each keyframe value as a combo box
       * (`<input list="…">`) instead of a plain textarea, offering these strings
       * as autocomplete suggestions.  The user can still type any value; the list
       * is not strictly enforced.
       *
       * Mutable so it can be populated asynchronously after construction — e.g.
       * font family names loaded from `document.fonts.ready`.
       */
      choices?: readonly string[];
      /**
       * When true, the Visual Editor shows a read-only display and a "Choose…"
       * button that opens a full font-picker dialog instead of a combo box.
       * Only meaningful when `choices` is also populated.
       */
      useDialog?: boolean;
    }
  | {
      readonly type: "select";
      readonly choices: readonly string[];
      readonly schedule: Keyframe<string>[];
    }
  | {
      readonly type: "color";
      readonly schedule: Keyframe<string>[];
    }
  | { readonly type: "number"; readonly schedule: Keyframe<number>[] }
  | { readonly type: "rectangle"; readonly schedule: Keyframe<ReadOnlyRect>[] }
  | { readonly type: "point"; readonly schedule: Keyframe<Point>[] }
);

/**
 * A scalar field holds a single value (not time-varying) that belongs to a
 * component.  It is editable in the Visual Editor and round-trips through
 * save/restore just like a schedule.
 *
 * `value` is intentionally mutable so the Visual Editor can write to it.
 */
export type ScalarInfo = {
  readonly description: string;
} & (
  | { readonly type: "string"; value: string }
  | {
      readonly type: "select";
      readonly choices: readonly string[];
      value: string;
    }
  | { readonly type: "color"; value: string }
  | { readonly type: "number"; value: number }
  | { readonly type: "rectangle"; value: ReadOnlyRect }
  | { readonly type: "point"; value: Point }
);

export type SerializedScalar = {
  description: string;
  type: string;
  value: unknown;
};

export type SerializedKf = { time: number; value: unknown; easeAfter?: string };
export type SerializedSchedule = {
  description: string;
  type: string;
  keyframes: SerializedKf[];
};

function easeFromName(
  name: string | undefined,
): ((t: number) => number) | undefined {
  if (name === "ease") return ease;
  if (name === "easeIn") return easeIn;
  if (name === "easeOut") return easeOut;
  if (name === "hold") return (t: number) => (t < 1 ? 0 : 1);
  return undefined;
}

/**
 * Mutates the live schedule arrays in-place from serialized keyframe data.
 * Use this to initialize a component's schedules from a saved database entry
 * rather than duplicating keyframe literals in TypeScript source.
 */
export function applySnapshot(
  schedules: readonly ScheduleInfo[],
  snapshot: SerializedSchedule[],
): void {
  // Warn about duplicate (description, type) pairs — only the first will ever be restored.
  const liveKeys = new Set<string>();
  for (const s of schedules) {
    const key = `${s.description}\0${s.type}`;
    if (liveKeys.has(key)) {
      console.warn(
        `applySnapshot: duplicate schedule "${s.description}" (${s.type}) — only the first will be restored from the database.`,
      );
    }
    liveKeys.add(key);
  }
  for (const serialized of snapshot) {
    const live = schedules.find(
      (s) =>
        s.description === serialized.description && s.type === serialized.type,
    );
    if (!live) {
      /*
      console.warn(
        `applySnapshot: saved schedule "${serialized.description}" (${serialized.type}) no longer exists in code — ignoring.`,
      );
      */
      continue;
    }
    const liveArr = live.schedule as unknown[];
    liveArr.length = 0;
    for (const skf of serialized.keyframes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const kf: any = { time: skf.time, value: skf.value };
      const fn = easeFromName(skf.easeAfter);
      if (fn) kf.easeAfter = fn;
      liveArr.push(kf);
    }
  }
}

/**
 * Mutates scalar values in-place from serialized data.
 * Counterpart to {@link applySnapshot} for scalar fields.
 */
export function applyScalarSnapshot(
  scalars: readonly ScalarInfo[],
  snapshot: SerializedScalar[],
): void {
  const liveKeys = new Set<string>();
  for (const s of scalars) {
    const key = `${s.description}\0${s.type}`;
    if (liveKeys.has(key)) {
      console.warn(
        `applyScalarSnapshot: duplicate scalar "${s.description}" (${s.type}) — only the first will be restored from the database.`,
      );
    }
    liveKeys.add(key);
  }
  for (const serialized of snapshot) {
    const live = scalars.find(
      (s) =>
        s.description === serialized.description && s.type === serialized.type,
    );
    if (!live) {
      /*
      console.warn(
        `applyScalarSnapshot: saved scalar "${serialized.description}" (${serialized.type}) no longer exists in code — ignoring.`,
      );
      */
      continue;
    }
    (live as { value: unknown }).value = serialized.value;
  }
}

/**
 * All of the information available to {@link Showable.show}.
 */
export type ShowOptions = {
  /**
   * The current time.  Typically you draw the state based on this number.
   *
   * This value might be frozen and might not change from one call to the next.
   */
  readonly timeInMs: number;
  /**
   * Draw on this.
   *
   * **Canvas state conventions** (apply to all `show()` implementations):
   *
   * The following properties are *disposable* — callers make no assumptions
   * about the incoming value and callee makes no guarantees about the
   * outgoing value:
   * `fillStyle`, `strokeStyle`, `lineCap`, `lineJoin`, `lineWidth`.
   * (See also `CommonSettings` in `src/fancy-text.ts`.)
   * The same goes for the current path, which isn't exactly a property but it is disposable.
   *
   * `transform` follows save/restore semantics, like SVG `<g>` nesting.
   * Each `show()` call receives the parent's transform and is expected to
   * restore it before returning (use `save()`/`restore()`).  The root
   * transform maps the 16×9 logical coordinate space to the actual canvas
   * pixel dimensions: `scale(canvas.width / 16, canvas.height / 9)`.
   *
   * `globalAlpha` should follow the same save/restore convention as
   * `transform`.  See `fadeOut()` in `src/transitions.ts` for the intended
   * usage.
   */
  readonly context: CanvasRenderingContext2D;
  /**
   * This is the number of milliseconds from the start of the program.
   * This is useful for drawing certain types of animations.
   * In particular, if the colors are cycling constantly, as a background effect,
   * and you freeze or repeat a section, you might want the colors to keep cycling.
   */
  readonly globalTime: number;
  /**
   * Rendering quality level.
   * - `"High Quality"`: full effects (halftone shadows, etc.) — always used during recording.
   * - `"Low Power"`: expensive effects disabled — set via the GUI during live preview to
   *   reduce CPU heat and battery drain while iterating on animations.
   */
  readonly quality: "High Quality" | "Low Power";
  /**
   * Optional callback supplied by the visual editor during live rendering.
   * A component that renders child components should call this once per child,
   * passing the child and the canvas transform in effect when the child renders.
   * The editor uses the stored transforms to correctly position and hit-test
   * drag handles for components inside transformed slides.
   *
   * Only present during live (interactive) rendering — never during recording.
   */
  readonly registerTransform?: (
    component: Showable,
    transform: DOMMatrix,
  ) => void;
};

/**
 * Runtime assertion that value >= 0.
 * +Infinity is allowed, NaN is not.
 * @param value Verify this.
 * @throws If the value is negative or NaN this will throw an exception.
 */
function notNegative(value: number) {
  if (value < 0 || Number.isNaN(value)) {
    throw new Error("wtf");
  }
}

/**
 * Creates a new Showable object which passes each show() call to all of its children.
 *
 * You might have multiple things all running at the same time.
 * You might have things that overlap arbitrarily.
 * For example, the background is **always** showing.
 */
export class MakeShowableInParallel {
  constructor(readonly description: string) {}
  readonly #all: Showable[] = [];
  readonly #children: {
    /**
     * Wait this many milliseconds after the parent starts before starting this child.
     */
    readonly start: number;
    readonly child: Showable;
  }[] = [];
  /**
   * How long should this new showable run?
   */
  #duration = 0;
  /**
   * You can add to this as much as needed.
   * You can only "use" it to build a showable once.
   * You cannot make any more changes to this object after building the result.
   */
  #used = false;
  /**
   * Display something in the list but don't actually draw anything on the screen.
   * @param description What do display to the user.
   * @param start How many millisecond after the built Showable before this takes effect.
   * @param duration How long in milliseconds this will be in effect.
   */
  addNotes(description: string, start: number, duration: number) {
    this.#children.push({ start, child: { description, duration, show() {} } });
  }
  /**
   *
   * @param showable Add this child.
   * @param minDuration Request this much time.
   * All children are displayed for the entire time that the parent is shown.
   * The parent's duration is the largest of these values.
   *
   * Defaults to the `showable`'s duration.
   */
  add(showable: Showable, minDuration = showable.duration) {
    if (this.#used) {
      throw new Error("wtf");
    }
    notNegative(minDuration);
    this.#all.push(showable);
    this.#duration = Math.max(this.#duration, minDuration);
    this.#children.push({ start: 0, child: showable });
  }
  /**
   * Add time to the resulting Showable's time, without adding any children.
   * @param minDuration The final duration will be at least this big.
   */
  reserve(minDuration: number) {
    this.#duration = Math.max(this.#duration, minDuration);
  }
  /**
   * This will add an item and it will extend the last frame to the end of the composite Showable object.
   * @param showable To be added.
   */
  addJustified(showable: Showable, startAtMs = 0) {
    this.add(
      addMargins(showable, { hiddenBefore: startAtMs, frozenAfter: Infinity }),
      showable.duration + startAtMs,
    );
  }
  /**
   * Create a new Showable that includes all of the added Showable children
   * and notes.
   * @param description Display this to the user.
   * @returns The newly created Showable.
   */
  build(): Showable {
    if (this.#used) {
      throw new Error("wtf");
    }
    this.#used = true;
    const duration = this.#duration;
    const all = this.#all;
    const end = all.length;
    const show = (options: ShowOptions) => {
      for (let i = 0; i < end; i++) {
        all[i].show(options);
      }
    };
    return {
      duration,
      show,
      description: this.description,
      children: this.#children,
    };
  }
  /**
   * Creates a new Showable object which passes each show() call to all of its children.
   *
   * This creates a MakeShowableInParallel internally and calls add() on each child with the default arguments.
   * @param description Copied to the resulting Showable object.
   * @param children To be added to this group.
   * @returns A new Showable object which passes each show() call to all of its children.
   */
  static all(description: string, children: Showable[]) {
    const builder = new this(description);
    children.forEach((child) => {
      builder.add(child);
    });
    return builder.build();
  }
}

/**
 * Build a new Showable that contains a set of Showable children.
 * Each one runs right after the previous one.
 */
export class MakeShowableInSeries {
  constructor(readonly description: string) {}
  /**
   * How long will this last?
   * This gets updated as we add more children.
   */
  #duration = 0;
  /**
   * How long will the last?
   * This gets updated as we add more children.
   *
   * The *next* child to be added will start at this time.
   * In case you need to coordinate different items.
   */
  get duration() {
    return this.#duration;
  }
  readonly #script = new Array<{
    start: number;
    child: Showable;
  }>();
  /**
   * You can add to this as much as needed.
   * You can only "use" it to build a showable once.
   * You cannot make any more changes to this object after building the result.
   */
  #used = false;
  add(child: Showable) {
    if (this.#used) {
      throw new Error("wtf");
    }
    if (this.#duration === Infinity) {
      console.warn("Adding a new Showable after infinite time.");
    }
    const newEntry = { start: this.#duration, child };
    notNegative(child.duration);
    this.#duration += child.duration;
    this.#script.push(newEntry);
  }
  /**
   * Reserve time without actually drawing anything.
   * @param duration Reserve this many milliseconds before displaying the next child.
   */
  skip(duration: number) {
    if (this.#used) {
      throw new Error("wtf");
    }
    notNegative(duration);
    this.#duration += duration;
  }
  /**
   * Create a new Showable that includes all of the added Showable children.
   * @param description Display this to the user.
   * @returns The newly created Showable.
   */
  build(): Showable {
    if (this.#used) {
      throw new Error("wtf");
    }
    this.#used = true;
    /**
     * Work from the back.
     * If a time is on the boundary between two children, show() the one that starts later.
     * That will be the first one you see if you reversedScript.forEach().
     */
    const reversedScript = this.#script.toReversed();
    const duration = this.duration;
    const show = (options: ShowOptions) => {
      for (const { start, child } of reversedScript) {
        const localTime = options.timeInMs - start;
        if (localTime >= 0 && localTime <= child.duration) {
          // This item can be shown now.
          child.show({ ...options, timeInMs: localTime });
          break;
        }
      }
    };
    return {
      description: this.description,
      duration,
      show,
      children: this.#script,
    };
  }
  /**
   * Create a new showable that contains all of the inputs as children.
   * The new composite showable's duration will be the sum of the durations of all children.
   *
   * Each call to the composite's show() will call show() on at most one of the inputs, and will call hide() on the others.
   * All hide() calls will be done before the optional call to show().
   * This is important in case any of the inputs are sharing any resources.
   * An input will only be called at times between 0 and duration.
   * If a time is exactly on the boundary of two inputs, only the later input will be shown.
   * That means that any input could be shown at time 0.
   * But only the last input in the list could be called at time == duration.
   * @param children The child items to show.
   * @returns A new showable.
   */
  static all(description: string, children: Showable[]): Showable {
    const builder = new this(description);
    children.forEach((child) => {
      builder.add(child);
    });
    return builder.build();
  }
}

/**
 * Create a new showable that calls the original over and over.
 * This can be useful for a background pattern that goes on forever, or as long as the foreground action continues.
 * And in test it often makes sense to repeat the current scene over and over.
 * @param showable The action to repeat
 * @param count How many times to repeat the action.
 * This can be Infinity.
 * This only affects the duration.
 * If you continue calling this it will repeat forever.
 * @returns A new `Showable` object that will call the original multiple times.
 */
export function makeRepeater(showable: Showable, count = Infinity): Showable {
  const period = showable.duration;
  const repeaterDuration = count * period;
  function show(options: ShowOptions) {
    const timeWithinPeriod = positiveModulo(options.timeInMs, period);
    showable.show({ ...options, timeInMs: timeWithinPeriod });
  }
  return {
    description: `${showable.description} » repeater`,
    duration: repeaterDuration,
    show,
    children: [{ start: 0, child: showable }],
  };
}

/**
 * This ensures that the base will be hidden before and after it's requested time slot.
 * This can add additional time before and after the base executes.
 * @param base Show this items.
 * @param extra
 * * hiddenBefore Wait this many milliseconds before showing `base`.  Default is 0.
 * * hiddenAfter Wait this many milliseconds after showing `base`.  Default is 0.
 * * frozenBefore Hold the initial image of `base` for this many milliseconds.  Default is 0.
 * * frozenAfter Hold the final image of `base` for this many milliseconds.  Default is 0.
 * @returns
 */
export function addMargins(
  base: Showable,
  extra: {
    hiddenBefore?: number;
    hiddenAfter?: number;
    frozenBefore?: number;
    frozenAfter?: number;
  },
): Showable {
  const builder = new MakeShowableInSeries(`${base.description} » margins`);
  if (extra.hiddenBefore !== undefined) {
    builder.skip(extra.hiddenBefore);
  }
  if (extra.frozenBefore !== undefined && extra.frozenBefore > 0) {
    builder.add({
      description: `${base.description} » frozen before`,
      duration: extra.frozenBefore,
      show(options: ShowOptions) {
        base.show({ ...options, timeInMs: 0 });
      },
    });
  }
  builder.add(base);
  if (extra.frozenAfter !== undefined && extra.frozenAfter > 0) {
    builder.add({
      description: `${base.description} » frozen after`,
      duration: extra.frozenAfter,
      show(options: ShowOptions) {
        base.show({ ...options, timeInMs: base.duration });
      },
    });
  }
  if (extra.hiddenAfter !== undefined) {
    builder.skip(extra.hiddenAfter);
  }
  return builder.build();
}

/**
 * Create a new showable that is similar to another, but change the duration and possibly the start time.
 *
 * This may call the base with times before 0 or after base.duration.
 * If that's a problem, consider {@link addMargins}.
 * @param base The object to modify.
 * @param duration The duration in milliseconds of the new Showable we are creating.
 * @param offset Start this many milliseconds into the new Showable.
 * Defaults to 0, starting at the beginning.
 * @returns The newly created Showable
 */
export function reschedule(
  base: Showable,
  duration: number,
  offset = 0,
): Showable {
  return {
    description: `${base.description} » rescheduled`,
    duration,
    show(options: ShowOptions) {
      base.show({ ...options, timeInMs: options.timeInMs + offset });
    },
    children: [{ start: -offset, child: base }],
  };
}
