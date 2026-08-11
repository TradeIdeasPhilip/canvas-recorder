import { FIGURE_SPACE, ReadOnlyRect } from "phil-lib/misc";
import { Keyframe } from "./interpolate";
import {
  applyScalarSnapshot,
  applySnapshot,
  Scalar,
  ScalarInfo,
  ScheduleInfo,
  SerializedScalar,
  SerializedSchedule,
  Showable,
  ShowableParent,
  ShowOptions,
} from "./showable";
import { SingleImage, SlowImage } from "./slow-image-sources";
import { computeGridTransform, drawGrid } from "./glib/grid";
import { Font } from "./glib/letters-base";
import { makeLineFont, makeLineFontRatio } from "./glib/line-font";
import { ParagraphLayout } from "./glib/paragraph-layout";
import { applyTransform } from "./glib/transforms";
import { myRainbow } from "./glib/my-rainbow";
import {
  ArrowScheduleInfo,
  ArrowValue,
  ColorScheduleInfo,
  NumberScheduleInfo,
  PointScheduleInfo,
  RectangleScheduleInfo,
  SelectScheduleInfo,
  StringScalarInfo,
  StringScheduleInfo,
} from "./schedule-helper";
import { PathShape, Point } from "./glib/path-shape";
import { BinaryInserter } from "./binary-search";
import { removeIf } from "./utility";

// MARK: showError()

const errorFont = makeLineFont(1);

/**
 * Write text on the screen where it is big and easy to see, even without knowing what else is there.
 * @param context Where to draw.
 * @param text What to draw.
 * Can include " " and "\n" for optional and forced line breaks.
 */
export function showError(context: CanvasRenderingContext2D, text: string) {
  const font = errorFont;
  const path = ParagraphLayout.singlePathShape({
    font,
    text,
    alignment: "center",
    width: 15.5,
  }).canvasPath;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = font.strokeWidth * 3;
  context.strokeStyle = "white";
  context.stroke(path);
  context.lineWidth = font.strokeWidth;
  context.strokeStyle = "red";
  context.stroke(path);
}

// MARK: In Parallel
// Strictly speaking, components do not have to be classes.
// They only have to implement Showable.
// However, if you plan to have children that the Visual Editor can add and remove,
// you almost certainly want to subclass ComponentWith*Duration or InParallelComponent,
// instead of starting from scratch.
// Also, making this a class makes it easy for a programmer to access all of the schedules.
// These are like properties of an html element or a Delphi control.
// A programmer might want to read or change these at runtime.
// The Visual Editor can dynamically inspect the list of schedules.
// But a programmer shouldn't *have to* use the dynamic interface.
// Instead, properties have names, object.propertyName, along with types and JSDoc comments.
// This works whether you recently created a TraditionalTextComponent:
//     const sample = new TraditionalTextComponent();
//     const fontFamily = sample.fontFamilySchedule.at(0 /* timeInMs*/);
//     const x = sample.schedules[1].at(0).x;
// or you asked
//     if (fromDatabase instanceof TraditionalTextComponent) { … }
// because TraditionalTextComponent is a class.

/**
 * These will be shared in {@link InParallelComponent.children}, so this type is assignable to the standard child record type.
 * This adds sourceIndex, which might be used internally.
 * The default implementation ignores it, but not all subclasses treat all of their subcomponents identically.
 */
type ParallelChildInfo = {
  readonly start: number;
  readonly replaceable: boolean;
  readonly child: Showable;
  /**
   * Which index of the #fixedChildren or #replaceableChildren arrays was the source of this?
   *
   */
  readonly sourceIndex: number;
};

type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

type ShowChildInfo = {
  child: Showable;
  replaceable: boolean;
  index: number;
  sourceIndex: number;
  options: ShowOptions;
};

/**
 * This Showable is a container for other Showable objects.
 * Multiple children can run at the same time.
 * This is, in a sense, "the general case" as a subclass or the individual children themselves can decide to restrict certain children to only display at a subset of possible times.
 *
 * The container's duration is the minimum required to allow all of its children to complete.
 * This is a reasonable default, but it can be overridden by subclasses.
 * See {@link DurationAgnosticComponent}, {@link ComponentWithLiveDuration}, and {@link ComponentWithLiveDuration} as
 * reasonable base classes with different ways to handle the duration.
 * See {@link PaddingComponent} for an example a subclass implementing duration in a different way.
 *
 * This can take two types of children.
 * Fixed children are added by bespoke TypeScript code at initialization time.
 * Replaceable children can be added and removed by the Visual Editor at any time.
 * The Visual Editor can modify details of both types of children.
 *
 * This is a newer version of {@link MakeShowableInParallel}.
 * That version assumed that the contents and durations were fixed.
 */
export class InParallelComponent implements Showable, ShowableParent {
  protected makeNotifyingScalar<T extends "string" | "number">(
    type: T,
    description: string,
    value: Scalar<T>["value"],
  ) {
    const scheduleHasChanged = this.scheduleHasChanged.bind(this);
    return {
      type,
      description,
      get value() {
        return value;
      },
      set value(newValue) {
        value = newValue;
        scheduleHasChanged();
      },
    };
  }
  protected showChild(info: ShowChildInfo) {
    info.child.show(info.options);
  }
  show(options: ShowOptions): void {
    const children = this.#fromCache().children;
    children.forEach(({ child, replaceable, sourceIndex, start }, index) => {
      let childOptions = options;
      if (start != 0) {
        const timeInMs = options.timeInMs - start;
        childOptions = { ...options, timeInMs };
      }
      this.showChild({
        child,
        replaceable,
        index,
        sourceIndex,
        options: childOptions,
      });
    });
  }
  // Interesting.  I had to add this specific way of referencing the base class's type,
  // otherwise the documentation comments on the fields of this object do not get copied.
  readonly replaceableComponents: // NonNullable<
  Showable["replaceableComponents"];
  //>;
  constructor(readonly description: string) {
    const get = (): Showable[] => [...this.#replaceableChildren];
    const replace = (newItems: readonly Showable[]) => {
      this.#replaceableChildren.forEach((child) => {
        this.#unparent(child);
      });
      this.#replaceableChildren.length = 0;
      newItems.forEach((child) => {
        this.#setParent(child);
        this.#replaceableChildren.push(child);
      });
      this.scheduleHasChanged();
    };
    const push = (...newItems: Showable[]): void => {
      // There are more efficient ways to do this, but this work work for now.
      // (Lets get the interface down right before trying to optimize!)
      const items = get();
      items.push(...newItems);
      replace(items);
    };
    this.replaceableComponents = { get, replace, push };
  }
  readonly #replaceableChildren = new Array<Showable>();
  #cached:
    | { duration: number; children: readonly ParallelChildInfo[] }
    | undefined;
  #fromCache() {
    if (!this.#cached) {
      const children = new Array<Mutable<ParallelChildInfo>>();
      let replaceableChildrenHaveBeenInserted = false;
      const checkReplaceableChildren = () => {
        if (!replaceableChildrenHaveBeenInserted) {
          this.#replaceableChildren.forEach((child, index) => {
            children.push({
              start: 0,
              replaceable: true,
              child,
              sourceIndex: index,
            });
          });
          replaceableChildrenHaveBeenInserted = true;
        }
      };
      this.#fixedChildren.array.forEach(({ zIndex, child }, index) => {
        if (zIndex >= 0) {
          checkReplaceableChildren();
        }
        children.push({
          start: 0,
          replaceable: false,
          child,
          sourceIndex: index,
        });
      });
      checkReplaceableChildren();
      const duration = this.recomputeDuration(children);
      this.#cached = { children, duration };
    }
    return this.#cached;
  }
  /**
   * This is called while rebuilding the cache.
   * The output of this method will be cached as the new Showable.duration for this object.
   *
   * The default is the max of all children.
   * Override this method if you need a different duration.
   *
   * This method is called whenever the cache is filled.
   * Any time a child's schedule changes or the list of children changes, the cache is invalidated.
   * The cache is used by both the Visual Editor and this.show().
   * You can override this method if you have other work that needs to be done at the same time.
   * You can call the original version of the method if you want to use the default duration.
   *
   * And the `children` parameter is explicity mutable.
   * Example: {@link PaddingComponent} changes the start time of its children here.
   * @param children What will be available from the cache as soon as we finish rebuilding the cache.
   * (The output of recomputeDuration will also be added to the cache, so the cache is in the process of being updated, so please don't try to read from the cache at this time.)
   * @returns The new duration to save for anyone who requests it.
   */
  protected recomputeDuration(children: Mutable<ParallelChildInfo>[]) {
    let duration = 0;
    children.forEach(({ child }) => {
      duration = Math.max(duration, child.duration);
    });
    return duration;
  }
  get children(): NonNullable<Showable["children"]> {
    return this.#fromCache().children;
  }
  get duration(): number {
    return this.#fromCache().duration;
  }
  #fixedChildren = new BinaryInserter<{
    child: Showable;
    zIndex: number;
  }>((record) => record.zIndex);
  /**
   *
   * @param child The child to add.
   * @param padding If this is undefined, add the child directly without creating a wrapper.
   * Otherwise create a PaddingComponent as a wrapper around the child, and that wrapper will be a child of this object.
   * This parameter contains instructions for the PaddingComponent constructor.
   * This can be `{}` to create a PaddingComponent with all of the defaults.
   * @param zIndex Where to insert this.
   * The replaceable components are all drawn immediately before zIndex=0.
   * The default z order will be one more than that of the last fixed child already present,
   * effectively pushing to the end of the list.
   * If there are no replaceable components yet the default z order will be 0,
   * immediately after the replaceable components.
   * @throws A child can only have one parent at a time.
   * It is an error to try to add a child that already has a parent.
   */
  addFixed({
    child,
    padding,
    zIndex,
  }: {
    child: Showable;
    padding?: Omit<
      ConstructorParameters<typeof PaddingComponent>[0],
      "registryKey"
    >;
    zIndex?: number;
  }) {
    if (zIndex === undefined) {
      const last = this.#fixedChildren.array.at(-1);
      if (last) {
        zIndex = last.zIndex + 1;
      } else {
        zIndex = 0;
      }
    }
    if (padding) {
      const paddingComponent = new PaddingComponent(padding);
      paddingComponent.addFixed({ child });
      child = paddingComponent;
    }
    this.#setParent(child);
    this.#fixedChildren.push({ child, zIndex });
    this.scheduleHasChanged();
  }
  #setParent(child: Showable) {
    if (child.parent) {
      throw new Error("Child already has a parent.");
    }
    child.parent = this;
  }
  #unparent(child: Showable) {
    if (child.parent != this) {
      console.error({
        actualParent: child.parent,
        expectedParent: this,
        child,
      });
      throw new Error("wtf");
    }
    child.parent = undefined;
  }
  scheduleHasChanged() {
    this.#cached = undefined;
    this.parent?.scheduleHasChanged();
  }
  parent?: ShowableParent | undefined;
  /**
   * Scalar (non-time-varying) fields displayed and edited in the Visual Editor,
   * shown immediately above the {@link schedules}.
   * Unlike schedules, each field holds a single mutable `value`.
   * Notice the {@link Scalar}\<T> type.
   *
   * The intent is for subclasses to append to this list in their constructors.
   * This class is intended to be the base class for a lot of things, so this is a good place the create this array.
   *
   * This is publicly modifiable because that makes the code simpler in some places.
   * This is JavaScript and sometimes I just modify an object instead of creating a new class.
   *
   * The base {@link Showable.scalars} defines this as an optional ReadonlyArray.
   * That works fine for consumers and for simple objects.
   * But creating a mutable array makes class hierarchies simpler.
   */
  readonly scalars: ScalarInfo[] = [];
  /**
   * These will be displayed in the Visual Editor.
   * Note most "properties" can change over time so I call them "schedules".
   * Consider importing from schedule-helper.ts to create the schedules.
   *
   * The intent is for subclasses to append to this list in their constructors.
   * This class is intended to be the base class for a lot of things, so this is a good place the create this array.
   *
   * This is publicly modifiable because that makes the code simpler in some places.
   * This is JavaScript and sometimes I just modify an object instead of creating a new class.
   *
   * The base {@link Showable.schedules} defines this as an optional ReadonlyArray.
   * That works fine for consumers and for simple objects.
   * But creating a mutable array makes class hierarchies simpler.
   *
   * Also, if the code directly calls set() on any schedules, we should hide those schedules from the Visual Editor.
   * Otherwise we give the user a false sense that he can modify something, and we get random changes each time we save.
   * This decision will depend on the individual object, not the class.
   */
  readonly schedules: ScheduleInfo[] = [];
  /**
   * Remove a schedule from the Visual Editor's editable list.
   * This is typically done when other code modifies the schedule.
   */
  hideSchedule(schedule: ScheduleInfo): void {
    removeIf(this.schedules, (contender) => contender === schedule);
  }
}

// MARK: Duration Agnostic

/**
 * I like this as a base class for a lot of generic containers.
 * Like MultiTextComponent where you can already add subcomponents and it is naive to duration.
 * The basic text components have a duration of 0, requesting nothing, but running as long as they are scheduled to run.
 * Like the items added by the Visual Editor.
 * *Any component* can be a parent because that's useful for prototyping.
 * If a custom component is duration agnostic, use this as the base.
 *
 * That said, most of the time we will need to set the duration of a text or rectangle or arrow component.
 * And we might as well take care of that here, in a base class aimed at duration-agnostic components like these.
 * The minDuration property is a nice generic way to allow children to request time or to let the Visual Editor change this.
 * I can see minDuration as something that the Visual Editor eventually looks for and automatically adds a marker on the timeline so the user can drag it.
 * Consider adding {@link Padding} as a parent because it will allow the Visual Editor to change the start time using the timeline.
 */
export class DurationAgnosticComponent extends InParallelComponent {
  readonly minDurationScalar: Scalar<"number">;
  protected override recomputeDuration(children: Mutable<ParallelChildInfo>[]) {
    return Math.max(
      super.recomputeDuration(children),
      this.minDurationScalar.value,
    );
  }
  constructor(description: string) {
    super(description);
    this.minDurationScalar = this.makeNotifyingScalar(
      "number",
      "Min Duration",
      0,
    );
    this.scalars.push(this.minDurationScalar);
  }
}

// MARK: Live Duration

/**
 * This is a convenient base class for any component that wants to have children.
 * It takes care of the interfaces and implementation of having children.
 *
 * The duration is an input.
 * The constructor takes an initial value and it can be changed with setDuration();
 * See {@link ComponentWithFixedDuration} if you want the duration to be immutable.
 *
 * A subclass can override show() and call super.show() whenever it is time to display the children.
 * Or override showChild() to make changes to the way we display specific children or to mix other operation in between showing various children.
 */
export class ComponentWithLiveDuration extends InParallelComponent {
  #requestedDuration: number;
  setDuration(newDuration: number) {
    // It is explicitly assumed that a component can clamp this value into range.
    newDuration = Math.max(0, newDuration);
    if (newDuration != this.#requestedDuration) {
      this.#requestedDuration = newDuration;
      this.scheduleHasChanged();
    }
  }
  protected override recomputeDuration(children: readonly ParallelChildInfo[]) {
    return this.#requestedDuration;
  }
  constructor(description: string, duration: number) {
    super(description);
    this.#requestedDuration = duration;
  }
}

// MARK: Fixed Duration

/**
 * This is a convenient base class for any component that wants to have children.
 * It takes care of the interfaces and implementation of having children.
 *
 * The duration is immutable.
 * The constructor takes an initial value and it can never change;
 * See {@link ComponentWithLiveDuration} or {@link DurationAgnosticComponent} if you want to change the duration in the Visual Editor.
 *
 * TODO the following paragraph is confusing *and* out of date.
 * A subclass override show() and call super.show() whenever it is time to display the children.
 * Or override showChild() to make changes to the way we display specific children or to mix other operation in between showing various children.
 */
export class ComponentWithFixedDuration extends InParallelComponent {
  readonly #requestedDuration: number;
  protected override recomputeDuration(children: readonly ParallelChildInfo[]) {
    return this.#requestedDuration;
  }
  constructor(description: string, duration: number) {
    super(description);
    this.#requestedDuration = duration;
  }
}

// MARK: Padding

/**
 * What to do before a {@link Showable} is supposed to start or after it is supposed to end.
 * * "hide" = Don't show at all.
 * * "freeze" = Call show() with `timeInMs` set to 0 before or to `duration` after the item should be running.
 *   In some contexts this is called "hold".
 * * "live" = Call show() the values that might be less than 0 or greater than duration.
 *
 * This is aimed at specific containers, like {@link PaddingComponent}.
 * The general assumption is that `Showable` containers are only called with timeInMs between 0 and duration.
 */
export type AtEnd = "hide" | "freeze" | "live";

/**
 * A PaddingComponent does two major things:
 * * It requests extra time before and after its primary component is scheduled.
 * * It decides what to show before and after the primary component is scheduled.
 *
 * The primary component is the subcomponent with the lowest z order.
 * I.e. the first subcomponent.
 * I chose that because it was simple.
 * If necessary we can add an option to select a specific subcomponent to be the primary component regardless of the z order.
 *
 * Other subcomponents are "callouts".
 * The requested duration of a callout is ignored.
 * All callouts start at the same time as the primary component.
 * So it the primary component gets rescheduled, all of its children move with it.
 *
 * The PaddingComponent's parent might call show() at times before 0 or after the duration of the primary component and the callout.
 * The PaddingComponent can be configured to handle these cases in different ways, for the primary component.
 * However, the PaddingComponent will pass all show() requests on to the callouts without modifications.
 * It is up to the individual subcomponents to deal with out of bounds timeInMs values.
 *
 * Most components, like rectangles and arrows, will show themselves any time they are called regardless of timeInMs.
 * There are two easy ways to modify this.
 * * You can alter the item to be off screen or transparent at certain times.
 *   Schedules work just fine with times that are out of bounds.
 * * You can wrap the subcomponent in its own PaddingComponent.
 *   That can easily hide or hold the component outside of its normally scheduled time.
 *   And you can use the initialTime property to change the start time relative to the primary component.
 *   `initialTime` can be positive or negative.
 *
 * PaddingComponent is often used with {@link InParallelComponent}.
 * The latter is responsible for an entire scene.
 * The former makes each element of the scene appear and disappear at the right time.
 */
export class PaddingComponent extends InParallelComponent {
  readonly registryKey: string = "Padding";
  protected override recomputeDuration(
    children: Mutable<ParallelChildInfo>[],
  ): number {
    const start = this.initialTimeScalar.value;
    children.forEach((childInfo) => {
      childInfo.start = start;
    });
    const primaryChild = children.at(0)?.child;
    const primaryChildDuration = primaryChild ? primaryChild.duration : 0;
    return (
      this.initialTimeScalar.value +
      primaryChildDuration +
      this.extraTimeScalar.value
    );
  }
  constructor(
    initialValues: {
      initialTime?: number;
      extraTime?: number;
      showBefore?: AtEnd;
      showAfter?: AtEnd;
      description?: string;
      registryKey?: string;
    } = {},
  ) {
    super(initialValues.description ?? "Padding");
    this.scalars.push(
      this.initialTimeScalar,
      this.extraTimeScalar,
      this.showBeforeScalar,
      this.showAfterScalar,
    );
    if (initialValues.initialTime !== undefined) {
      this.initialTimeScalar.value = initialValues.initialTime;
    }
    if (initialValues.extraTime !== undefined) {
      this.extraTimeScalar.value = initialValues.extraTime;
    }
    if (initialValues.showBefore !== undefined) {
      this.showBeforeScalar.value = initialValues.showBefore;
    }
    if (initialValues.showAfter !== undefined) {
      this.showAfterScalar.value = initialValues.showAfter;
    }
    if (initialValues.registryKey !== undefined) {
      // If you are subclassing PaddingComponent
      // or you are adding fixed subcomponents to an object,
      // then you need to create a new registry key.
      // Otherwise, keep the default.
      // TODO Does it ever make sense for someone to change the registry key to undefined?
      this.registryKey = initialValues.registryKey;
    }
  }
  readonly initialTimeScalar: Scalar<"number"> = this.makeNotifyingScalar(
    "number",
    "Initial Time",
    0,
  );
  readonly extraTimeScalar: Scalar<"number"> = this.makeNotifyingScalar(
    "number",
    "Extra Time",
    0,
  );
  /**
   * See {@link AtEnd} for the meanings of these choices.
   */
  readonly showBeforeScalar: Scalar<"select"> = {
    description: "Show Before",
    type: "select",
    choices: ["hide", "freeze", "live"],
    value: "hide",
  };
  /**
   * See {@link AtEnd} for the meanings of these choices.
   */
  readonly showAfterScalar: Scalar<"select"> = {
    description: "Show After",
    type: "select",
    choices: ["hide", "freeze", "live"],
    value: "freeze",
  };
  protected override showChild(info: ShowChildInfo) {
    const primary = info.index == 0;
    let timeInMs = info.options.timeInMs;
    if (timeInMs < 0) {
      const before = primary ? this.showBeforeScalar.value : "live";
      switch (before) {
        case "hide": {
          return;
        }
        case "freeze": {
          timeInMs = 0;
        }
        // case "live": leave it alone.  Let the child deal with the out of bounds time.
      }
    } else if (timeInMs > info.child.duration) {
      const after = primary ? this.showAfterScalar.value : "live";
      switch (after) {
        case "hide": {
          return;
        }
        case "freeze": {
          timeInMs = info.child.duration;
        }
        // case "live": leave it alone.  Let the child deal with the out of bounds time.
      }
    }
    info.child.show({ ...info.options, timeInMs });
  }
}

// MARK: In Series

// If I ever want to allow the user to intermix replaceable and fixed
// components, I should start testing here!  The feature would be useful and easy to
// test in this class.
// Currently all replaceable components are at zIndex:0.
// The fixed components will be arranged according to their zIndex.
// And the replaceable components can be arranged by user with the Visual Editor.
// But they will all be grouped together, never interleaved with the fixed components.
// This seems like a very useful feature in most places.
// At a bare minimum it would be nice to ask to go before or after all of the fixed controls.
// In this class it would be nice to have full control over interleaving.
// I'm not 100% sure how important this is for other classes, but a good part of the
// replaceable components in general is for quick prototyping.
// I.e. lots of random cases, hard to predict in advance, it would be nice to have
// the tool already ready then next time I need it so I don't have to stop what I'm doing
// then.
/**
 * Each of the children is displayed one after the next.
 * The total duration of this item is the sum of all of its children's durations.
 *
 * This is the modern replacement for {@link MakeShowableInSeries}.
 *
 * This adds the ability to adjust durations at run time.
 * I.e. {@link ShowableParent.scheduleHasChanged}()
 * Even if you don't need that directly, if any on your children need need that ability, then use this class.
 * Most new code supports that by default.
 */
export class InSeriesComponent extends InParallelComponent {
  static readonly TRANSITION = Symbol("Transition");
  readonly registryKey = "In Series";
  constructor(description = "In Series") {
    super(description);
  }
  /**
   * Display the children one after another, sorted by zIndex.
   * The first one starts at time=0.
   * The others each start immediately after the previous one ends.
   * The total duration for this component is the sum of the durations of each of its children.
   */
  protected override recomputeDuration(
    children: Mutable<ParallelChildInfo>[],
  ): number {
    let start = 0;
    children.forEach((childInfo) => {
      childInfo.start = start;
      start += childInfo.child.duration;
    });
    return start;
  }
  protected override showChild(info: ShowChildInfo): void {
    /**
     * I haven't decided on a policy for this yet.
     * So let's keep the rules inside this opaque function.
     * @returns `true` if we should always show this child,
     * `false` if we should only show this child during its allotted time.
     */
    function allowExtendedTimes() {
      // The padding component is specifically designed to handle times before 0 and after duration.
      // It will blank and/or hold its primary child, so that is only shown at times between 0 and duration.
      // And the other children are expecting extending times, so callouts do not have to be limited to their immediate parent's allotted time.
      // So the result is clearly true for any child of type PaddingComponent.
      // Maybe it should be true in other cases, too, but I can't picture those cases.
      // Default to false because it's safer; most Showable objects do not expect to be called at extended times.
      return info.child instanceof PaddingComponent;
    }
    /**
     * Time is allocated exactly the same way as in {@link MakeShowableInSeries}:
     * * Most children are drawn at time >= 0 and < duration.
     * * However, the last child may also be called at duration.
     *
     * The children don't have to worry about the details.
     * Exactly one of them will be called at the instant one ends and the next starts.
     * That includes at the last child's duration.
     *
     * You cannot assume that a Showable's last frame will be displayed.
     * But you shouldn't assume that any specific time will be displayed.
     * Sometimes, however it has to be displayed.
     * In particular we often hold the last frame.
     * So we can't use the simpler rule that we only call show()
     * at times >= 0 and < duration.
     * @returns `true` if we are displaying the last child, `false` for the others.
     */
    const isLastChild = () => {
      return info.index == this.children.length - 1;
    };
    const timeInMs = info.options.timeInMs;
    const duration = info.child.duration;
    if (
      allowExtendedTimes() ||
      (timeInMs >= 0 &&
        (timeInMs < duration || (timeInMs == duration && !isLastChild())))
    ) {
      if (InSeriesComponent.TRANSITION in info.child) {
        const children = this.children;
        const { child, index, options } = info;
        let before: Showable | undefined;
        if (index > 0) {
          before = children[index - 1].child;
          if (InSeriesComponent.TRANSITION in before) {
            // Avoid an infinite recursion.
            // Assume this is a temporary issue as the user is rearranging things, and don't crash.
            before = undefined;
          }
        }
        let after = children.at(index + 1)?.child;
        if (after && InSeriesComponent.TRANSITION in after) {
          // Avoid an infinite recursion.
          after = undefined;
        }
        (child as Transition)[InSeriesComponent.TRANSITION](
          options,
          before,
          after,
        );
      } else {
        super.showChild(info);
      }
    }
  }
}

/**
 * This is a special type of component made to be a child of an {@link InSeriesComponent}.
 */
export type Transition = {
  /**
   * If this method exists on a child, an {@link InSeriesComponent} parent will call this instead of show().
   * @param options Standard ShowOptions
   * @param before This is the Showable immediately before the transition.
   * This will be undefined if the Transition is the first child.
   * This will be undefined if the Transition is preceded immediately by a another Transition.
   * Typically undefined will be treated like a showable that does nothing.
   * @param after This is the Showable immediately after the transition.
   * This will be undefined if the Transition is the last child.
   * This will be undefined if the Transition is followed immediately by a another Transition.
   * Typically undefined will be treated like a showable that does nothing.
   */
  [InSeriesComponent.TRANSITION](
    options: ShowOptions,
    before: Showable | undefined,
    after: Showable | undefined,
  ): void;
};

// MARK: Slide Left

/**
 * A {@link Transition}.
 * The previous Showable slides left off the screen.
 * At the same time the next Showable slides left onto the screen.
 */
export class SlideLeftTransition
  extends ComponentWithLiveDuration
  implements Transition
{
  constructor(options: { description?: string; duration?: number } = {}) {
    super(options.description ?? "Slide Left", options.duration ?? 1000);
  }
  readonly registryKey = "Slide Left Transition";
  override show(options: ShowOptions): void {
    // Thoughts about the future:
    // For now I'm focused on using this in an InSeriesComponent.
    // That said, it would not be hard to give it two normal children (fixed or removable) and work that way.
    // I.e. this might not always be an error.
    showError(
      options.context,
      "A SlideLeft's parent must be an InSeriesComponent.",
    );
  }
  [InSeriesComponent.TRANSITION](
    options: ShowOptions,
    before: Showable | undefined,
    after: Showable,
  ): void {
    const progress = options.timeInMs / this.duration;
    const context = options.context;
    context.save();
    // Set up the outgoing Showable:
    context.translate(progress * -16, 0);
    if (before) {
      const atEnd: ShowOptions = { ...options, timeInMs: before.duration };
      before.show(atEnd);
    }
    // Set up the incoming Showable:
    context.translate(16, 0);
    if (after) {
      const atBeginning: ShowOptions = { ...options, timeInMs: 0 };
      after.show(atBeginning);
    }
    context.restore();
  }
}

// MARK: Cross Fade Transition

/**
 * A {@link Transition} that cross-dissolves between the last frame of `before`
 * and the first frame of `after` in an {@link InSeriesComponent}.
 *
 * GPU path — no pixel read-back.  Uses `destination-in` + `lighter` compositing
 * to compute the premultiplied-alpha cross-dissolve:
 *   alpha_out = (1-t)*alpha_before + t*alpha_after
 *   C_out = ((1-t)*C_before*alpha_before + t*C_after*alpha_after) / alpha_out
 *
 * Either `before` or `after` may be `undefined`; the missing side fades
 * to/from transparent.
 */
export class CrossFadeTransition
  extends ComponentWithLiveDuration
  implements Transition
{
  readonly registryKey = "Cross Fade Transition";
  constructor(options: { description?: string; duration?: number } = {}) {
    super(options.description ?? "Cross Fade", options.duration ?? 1000);
  }
  override show(options: ShowOptions): void {
    showError(
      options.context,
      "A CrossFadeTransition's parent must be an InSeriesComponent.",
    );
  }
  [InSeriesComponent.TRANSITION](
    options: ShowOptions,
    before: Showable | undefined,
    after: Showable | undefined,
  ): void {
    const t = options.timeInMs / this.duration;
    const context = options.context;

    if (t <= 0) {
      if (before) before.show({ ...options, timeInMs: before.duration });
      return;
    }
    if (t >= 1) {
      if (after) after.show({ ...options, timeInMs: 0 });
      return;
    }

    if (typeof document === "undefined") {
      // CLI context: no DOM, can't create a temp canvas.  Show whichever side dominates.
      if (t < 0.5) {
        if (before) before.show({ ...options, timeInMs: before.duration });
      } else {
        if (after) after.show({ ...options, timeInMs: 0 });
      }
      return;
    }

    const { canvas } = context;
    const w = canvas.width;
    const h = canvas.height;
    const xf = context.getTransform();

    // Two temp canvases — one per scene — both matching the destination's
    // pixel resolution and logical-coordinate transform.
    function makeTemp(): CanvasRenderingContext2D {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.setTransform(xf);
      return ctx;
    }

    const ctxA = makeTemp();
    const ctxB = makeTemp();
    if (before) {
      const atEnd: ShowOptions = {
        ...options,
        timeInMs: before.duration,
        context: ctxA,
        registerTransform: undefined,
      };
      before.show(atEnd);
    }
    if (after) {
      const atBeginning: ShowOptions = {
        ...options,
        timeInMs: 0,
        context: ctxB,
        registerTransform: undefined,
      };
      after.show(atBeginning);
    }

    // Blend on ctxA (a clean temp canvas).
    // destination-in at (1-t) scales "before" pixels to (1-t) in premultiplied space.
    // lighter at t adds "after" pixels at weight t.
    // Doing the blend here — not on the destination — preserves whatever the
    // parent has already drawn on the destination (e.g. a HalftoneShadowComponent
    // background) so it doesn't get scaled down by destination-in.
    ctxA.save();
    ctxA.setTransform(1, 0, 0, 1, 0, 0);
    // Source color doesn't matter for destination-in — only source alpha does.
    ctxA.globalCompositeOperation = "destination-in";
    ctxA.fillStyle = `rgba(0,0,0,${1 - t})`;
    ctxA.fillRect(0, 0, w, h);
    ctxA.globalCompositeOperation = "lighter";
    ctxA.globalAlpha = t;
    ctxA.drawImage(ctxB.canvas, 0, 0);
    ctxA.restore();

    // Composite the blended result onto the destination.  source-over leaves
    // the parent's existing background layer intact wherever the blend is transparent.
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.drawImage(ctxA.canvas, 0, 0);
    context.restore();
  }
}

// MARK: SlideComponent

/**
 * Mathematical Bold Script capital letters A–J, used as placeholders in
 * {@link SlideComponent} transform templates.  String values only — ASCII
 * export name to avoid Rollup's non-Latin-1 truncation bug.
 */
export const TRANSFORM_PLACEHOLDERS = [
  "𝓐",
  "𝓑",
  "𝓒",
  "𝓓",
  "𝓔",
  "𝓕",
  "𝓖",
  "𝓗",
  "𝓘",
  "𝓙",
] as const;

/**
 * A slide is a generic container, like `<g>` or `<div>`.
 *
 * The transform is specified as a CSS transform string template.
 * Write placeholders like 𝓐 𝓑 𝓒 … in the template; each maps to an
 * animatable numeric schedule of the same name.  Example:
 *   "scale(𝓐) translate(𝓑px, 𝓒px)"
 *
 * Up to 10 placeholders (𝓐–𝓙) are available.  Unused schedules default
 * to 1 and can be ignored.
 *
 * Exported so dev/canvas-recorder.ts can use instanceof for the custom panel.
 */
export class SlideComponent extends DurationAgnosticComponent {
  readonly registryKey = "Slide";
  readonly transformTemplate = new StringScalarInfo(
    "Transform Template",
    "scale(1)",
  );

  readonly alphaSchedule = new NumberScheduleInfo("Alpha", 1);

  readonly placeA = new NumberScheduleInfo("𝓐", 1);
  readonly placeB = new NumberScheduleInfo("𝓑", 1);
  readonly placeC = new NumberScheduleInfo("𝓒", 1);
  readonly placeD = new NumberScheduleInfo("𝓓", 1);
  readonly placeE = new NumberScheduleInfo("𝓔", 1);
  readonly placeF = new NumberScheduleInfo("𝓕", 1);
  readonly placeG = new NumberScheduleInfo("𝓖", 1);
  readonly placeH = new NumberScheduleInfo("𝓗", 1);
  readonly placeI = new NumberScheduleInfo("𝓘", 1);
  readonly placeJ = new NumberScheduleInfo("𝓙", 1);

  // TODO It would not be a bad idea to add registryKey as an optional input to the constructor.
  // As done and documented elsewhere, that goes with the fixed components idea.
  // The typescript code might want to add a few fixed components rather than creating a whole new class.
  // We got the fixed components for free when we inherited from InParallelComponent
  // And if someone uses that feature, then they should at a minimum disable registryKey.
  // Right?  Maybe there's a better way to exclude this from the serialization process.
  // Maybe overkill.  We have an example but it's never been used.

  constructor(
    initialValues: {
      description?: string;
      transformTemplate?: string;
      alpha?: number | readonly Keyframe<number>[];
      placeA?: number | readonly Keyframe<number>[];
      placeB?: number | readonly Keyframe<number>[];
      placeC?: number | readonly Keyframe<number>[];
      placeD?: number | readonly Keyframe<number>[];
      placeE?: number | readonly Keyframe<number>[];
      placeF?: number | readonly Keyframe<number>[];
      placeG?: number | readonly Keyframe<number>[];
      placeH?: number | readonly Keyframe<number>[];
      placeI?: number | readonly Keyframe<number>[];
      placeJ?: number | readonly Keyframe<number>[];
    } = {},
  ) {
    super(initialValues.description ?? "Slide");
    this.scalars.push(this.transformTemplate);
    if (initialValues.transformTemplate !== undefined)
      this.transformTemplate.value = initialValues.transformTemplate;
    this.schedules.push(
      this.alphaSchedule,
      this.placeA,
      this.placeB,
      this.placeC,
      this.placeD,
      this.placeE,
      this.placeF,
      this.placeG,
      this.placeH,
      this.placeI,
      this.placeJ,
    );
    if (initialValues.alpha !== undefined)
      this.alphaSchedule.set(initialValues.alpha);
    if (initialValues.placeA !== undefined)
      this.placeA.set(initialValues.placeA);
    if (initialValues.placeB !== undefined)
      this.placeB.set(initialValues.placeB);
    if (initialValues.placeC !== undefined)
      this.placeC.set(initialValues.placeC);
    if (initialValues.placeD !== undefined)
      this.placeD.set(initialValues.placeD);
    if (initialValues.placeE !== undefined)
      this.placeE.set(initialValues.placeE);
    if (initialValues.placeF !== undefined)
      this.placeF.set(initialValues.placeF);
    if (initialValues.placeG !== undefined)
      this.placeG.set(initialValues.placeG);
    if (initialValues.placeH !== undefined)
      this.placeH.set(initialValues.placeH);
    if (initialValues.placeI !== undefined)
      this.placeI.set(initialValues.placeI);
    if (initialValues.placeJ !== undefined)
      this.placeJ.set(initialValues.placeJ);
  }

  transformStringAt(timeInMs: number): string {
    const values = [
      this.placeA.at(timeInMs),
      this.placeB.at(timeInMs),
      this.placeC.at(timeInMs),
      this.placeD.at(timeInMs),
      this.placeE.at(timeInMs),
      this.placeF.at(timeInMs),
      this.placeG.at(timeInMs),
      this.placeH.at(timeInMs),
      this.placeI.at(timeInMs),
      this.placeJ.at(timeInMs),
    ];
    let result = this.transformTemplate.value;
    TRANSFORM_PLACEHOLDERS.forEach((ph, i) => {
      result = result.replaceAll(ph, String(values[i]));
    });
    return result;
  }
  override show(options: ShowOptions): void {
    const { context, timeInMs } = options;
    const alpha = this.alphaSchedule.at(timeInMs);

    // alpha <= 0 or NaN: skip entirely
    if (!(alpha > 0)) return;

    const transformString = this.transformStringAt(timeInMs);
    let transformMatrix: undefined | DOMMatrixReadOnly;
    try {
      transformMatrix = new DOMMatrixReadOnly(transformString);
    } catch {
      showError(context, "Invalid Transform:\n" + transformString);
      return;
    }

    if (alpha >= 1 || typeof document === "undefined") {
      // Fully opaque (or CLI fallback): existing path, no temp canvas.
      const originalTransform = context.getTransform();
      applyTransform(context, transformMatrix);
      super.show(options);
      context.setTransform(originalTransform);
    } else {
      // Semi-transparent: render children into a temp canvas, then composite.
      const { canvas } = context;
      const w = canvas.width;
      const h = canvas.height;
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tempCtx = tempCanvas.getContext("2d")!;
      tempCtx.setTransform(context.getTransform());
      applyTransform(tempCtx, transformMatrix);
      super.show({
        ...options,
        context: tempCtx,
        registerTransform: undefined,
      });
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = alpha;
      context.drawImage(tempCanvas, 0, 0);
      context.restore();
    }
  }
  protected override showChild(info: ShowChildInfo): void {
    info.options.registerTransform?.(
      info.child,
      info.options.context.getTransform(),
    );
    super.showChild(info);
  }
}

// MARK: Traditional Text

/**
 * Traditional text component.
 *
 * Uses the canvas's strokeText() and fillText().
 * Does **not** use the custom strokable fonts, like {@link TextComponent}.
 * Uses CSS fonts, including downloaded or built in fonts.
 *
 * TODO: https://developer.mozilla.org/en-US/docs/Web/API/Document/fonts offers ways to ensure that the font has loaded.
 * We should add methods to this class for awaiting and possibly failing.
 * Like we started and discussed in {@link SlowImage}.
 *
 * TODO??:   direction?? Seems worthless.
 * The best I can tell it is used to manually say whether context.textAlign="start"
 * is equivalent to context.textAlign="left" or context.textAlign="right".
 * That just seems stupid and useless and confusing.
 * In fact, I'm removing start and end from the list of options.
 * Note that שָׁלוֹם is drawn correctly, right-to-left, regardless of this setting.
 *
 * TODO: font-feature-settings (e.g. "tnum" for tabular numbers) is NOT
 * supported in the Canvas 2D API.  The canvas ctx.font property only accepts
 * the CSS2-level font shorthand; OpenType feature settings have no canvas
 * equivalent.  A potential workaround for tabular numbers is drawing each
 * digit individually at a fixed advance width.
 *
 * Exported so that dev/canvas-recorder.ts can do instanceof checks to build
 * the component-specific Font Info panel.
 */
export class TraditionalTextComponent extends DurationAgnosticComponent {
  readonly registryKey: string;
  /**
   * What to display.
   */
  readonly textSchedule = new StringScheduleInfo("Text", [
    { time: 0, value: "Type Here" },
  ]);
  /**
   * Where to display it.
   * See {@link textAlignSchedule} and {@link textBaselineSchedule} to know how this position will be interpreted.
   */
  readonly positionSchedule = new PointScheduleInfo("Position", [
    { time: 0, value: { x: 2, y: 1 } },
  ]);
  /**
   * The fill is the normal way of rendering traditional text.
   */
  readonly fillColorSchedule = new ColorScheduleInfo("Fill Color", [
    { time: 0, value: myRainbow.violet },
  ]);
  /**
   * The outline is stroked using this color.
   * See {@link outlineWidth} if you want to disable the outline.
   *
   * Note that the outline is stroked *before* it is filled.
   * That is the opposite of SVG.
   * I find the text is unreadable if you do it the other way.
   */
  readonly outlineColorSchedule = new ColorScheduleInfo("Outline Color", [
    { time: 0, value: myRainbow.orange },
  ]);
  /**
   * The outline is stroked using this lineWidth.
   * Set this to 0 if you want to disable the outline.
   *
   * Note that the outline is stroked *before* it is filled.
   * That is the opposite of SVG.
   * I find the text is unreadable if you do it the other way.
   */
  readonly outlineWidthSchedule = new NumberScheduleInfo("Outline Width", [
    { time: 0, value: 0 },
  ]);
  /**
   * This corresponds to "px" in the API.
   * However, these are our normal userspace units, not actually pixels.
   * The screen is typically 16×9.
   */
  readonly fontSizeSchedule = new NumberScheduleInfo("Font Size", [
    { time: 0, value: 0.5 },
  ]);
  /**
   * "normal" or "italic".
   * Oblique is omitted: the Canvas 2D API essentially treats it as a synonym
   * for italic and ignores any angle specification, so there is no practical
   * difference for our purposes.
   */
  readonly fontStyleSchedule = new SelectScheduleInfo("Font Style", "normal", [
    "normal",
    "italic",
  ] as const);
  /**
   * CSS font-weight (100–900).  400 = Normal, 700 = Bold.
   * The Visual Editor shows a warning in the Font Info panel if the selected
   * weight is not available for the current font family.
   */
  readonly fontWeightSchedule = new NumberScheduleInfo("Font Weight", 400);
  /**
   * The font family name (e.g. "Life Savers", "Times New Roman").
   *
   * The {@link choices} array is populated asynchronously from
   * `document.fonts` once fonts have loaded, enabling the Visual Editor to
   * offer an autocomplete combo box.  Until then the field accepts free text.
   *
   * Note: `window.queryLocalFonts()` (an experimental API requiring a
   * permission grant) can expose additional installed fonts not in
   * `document.fonts`.  Merging the two lists is a future enhancement.
   */
  readonly fontFamilySchedule = (() => {
    const info = new StringScheduleInfo("Font Family", [
      { time: 0, value: "Life Savers" },
    ]);
    // `document` is unavailable in Node.js (record/cli-record.ts).
    if (typeof document !== "undefined") {
      document.fonts.ready.then(() => {
        const families = new Set<string>();
        for (const face of document.fonts) {
          // FontFace.family may be wrapped in quotes; strip them.
          families.add(face.family.replace(/^["']|["']$/g, "").trim());
        }
        info.choices = [...families].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" }),
        );
      });
    }
    info.useDialog = true;
    return info;
  })();
  /**
   * The {@link positionSchedule} names a point.
   * Should that point refer to the left, center or right side of the text?
   */
  readonly textAlignSchedule = new SelectScheduleInfo("Align", "center", [
    "left",
    "center",
    "right",
  ]);
  /**
   * How does the text align with {@link positionSchedule} vertically?
   * https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/textBaseline
   */
  readonly textBaselineSchedule = new SelectScheduleInfo(
    "Baseline",
    "alphabetic",
    ["top", "hanging", "middle", "alphabetic", "ideographic", "bottom"],
  );
  constructor(
    initialValues: {
      registryKey?: string;
      description?: string;
      minDuration?: number;
      text?: string | readonly Keyframe<string>[];
      position?: Point;
      fillColor?: string | readonly Keyframe<string>[];
      outlineColor?: string | readonly Keyframe<string>[];
      outlineWidth?: number | readonly Keyframe<number>[];
      fontSize?: number | readonly Keyframe<number>[];
      fontStyle?: Parameters<
        TraditionalTextComponent["fontStyleSchedule"]["set"]
      >[0];
      fontWeight?: number | readonly Keyframe<number>[];
      fontFamily?: string | readonly Keyframe<string>[];
      textAlign?: Parameters<
        TraditionalTextComponent["textAlignSchedule"]["set"]
      >[0];
      textBaseline?: Parameters<
        TraditionalTextComponent["textBaselineSchedule"]["set"]
      >[0];
    } = {},
  ) {
    super(initialValues.description ?? "Traditional Text");
    this.registryKey = initialValues.registryKey ?? "Traditional Text";
    if (initialValues.minDuration !== undefined) {
      this.minDurationScalar.value = initialValues.minDuration;
    }
    this.schedules.push(
      this.textSchedule,
      this.positionSchedule,
      this.fillColorSchedule,
      this.outlineColorSchedule,
      this.outlineWidthSchedule,
      this.fontSizeSchedule,
      this.fontStyleSchedule,
      this.fontWeightSchedule,
      this.fontFamilySchedule,
      this.textAlignSchedule,
      this.textBaselineSchedule,
    );
    if (initialValues.text !== undefined)
      this.textSchedule.set(initialValues.text);
    if (initialValues.position !== undefined)
      this.positionSchedule.set(initialValues.position);
    if (initialValues.fillColor !== undefined)
      this.fillColorSchedule.set(initialValues.fillColor);
    if (initialValues.outlineColor !== undefined)
      this.outlineColorSchedule.set(initialValues.outlineColor);
    if (initialValues.outlineWidth !== undefined)
      this.outlineWidthSchedule.set(initialValues.outlineWidth);
    if (initialValues.fontSize !== undefined)
      this.fontSizeSchedule.set(initialValues.fontSize);
    if (initialValues.fontStyle !== undefined)
      this.fontStyleSchedule.set(initialValues.fontStyle);
    if (initialValues.fontWeight !== undefined)
      this.fontWeightSchedule.set(initialValues.fontWeight);
    if (initialValues.fontFamily !== undefined)
      this.fontFamilySchedule.set(initialValues.fontFamily);
    if (initialValues.textAlign !== undefined)
      this.textAlignSchedule.set(initialValues.textAlign);
    if (initialValues.textBaseline !== undefined)
      this.textBaselineSchedule.set(initialValues.textBaseline);
  }
  override show(options: ShowOptions) {
    super.show(options);
    const { context, timeInMs } = options;
    const text = this.textSchedule.at(timeInMs);
    const position = this.positionSchedule.at(timeInMs);
    const fillColor = this.fillColorSchedule.at(timeInMs);
    const outlineWidth = this.outlineWidthSchedule.at(timeInMs);
    const fontSize = this.fontSizeSchedule.at(timeInMs);
    const fontStyle = this.fontStyleSchedule.at(timeInMs);
    const fontWeight = this.fontWeightSchedule.at(timeInMs);
    const fontFamily = this.fontFamilySchedule.at(timeInMs);
    // CSS font shorthand: [style] [weight] [size] [family]
    const fontString = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    context.font = fontString;
    context.textAlign = this.textAlignSchedule.at(timeInMs);
    context.textBaseline = this.textBaselineSchedule.at(timeInMs);
    if (outlineWidth > 0) {
      const outlineColor = this.outlineColorSchedule.at(timeInMs);
      context.lineWidth = outlineWidth;
      // Most of the time you want miter.  If there is a sharp corner in
      // the filled version, there will be a corresponding corner in the
      // stroked version.  Where the filled version is smooth, lineJoin
      // is ignored and the stroked version is smooth.  Life Saves seems
      // buggy.  The filled version appears round everywhere, but the
      // stroked version had big pointy spikes.
      context.lineJoin = fontFamily == "Life Savers" ? "round" : "miter";
      context.strokeStyle = outlineColor;
      context.strokeText(text, position.x, position.y);
    }
    context.fillStyle = fillColor;
    context.fillText(text, position.x, position.y);
  }
}

// MARK: Frame Counter

/**
 * This component displays text like "0:00  0/60" to tell you the current timeInMs of this component.
 * That's minutes, seconds and (ideal) frames.
 * Values less than 0 are preceded by a negative sign.
 * Values greater than the component's duration are preceded by a plus sign.
 *
 * This component is aimed at development and debugging.
 */
export class FrameCounter extends TraditionalTextComponent {
  constructor(
    initialValues: Omit<
      NonNullable<ConstructorParameters<typeof TraditionalTextComponent>[0]>,
      "text"
    > = {},
  ) {
    initialValues.registryKey ??= "Frame Counter";
    initialValues.description ??= "Frame Counter";
    // A fixed width font so things don't jump around on the screen.
    initialValues.fontFamily ??= "Source Code Pro";
    // These are numbers and I don't know the largest number so I can't reserve space for it.
    // Right justify everything, like we normally do with numbers.
    initialValues.textAlign ??= "right";
    super(initialValues);
    this.hideSchedule(this.textSchedule);
  }
  override show(options: ShowOptions): void {
    let text = "";
    const timeInMs = options.timeInMs;
    if (timeInMs < 0) {
      text = "-";
    } else if (timeInMs > this.duration) {
      text = "+";
    }
    const minutesAndMore = Math.abs(timeInMs);
    const secondsAndMore = minutesAndMore % 60_000;
    const fractionalSeconds = secondsAndMore % 1_000;
    const minutes = (minutesAndMore - secondsAndMore) / 60_000;
    const seconds = (secondsAndMore - fractionalSeconds) / 1_000;
    // On a healthy system I'd expect the frame to increment by one (modulo 60) on each animation frame.
    // I wouldn't want to rely on that for a number of reasons, but it should per perfect for debugging.
    const frame = Math.floor((fractionalSeconds * 60) / 1_000);
    text += minutes.toLocaleString();
    text += ":";
    text += seconds.toString().padStart(2, "0");
    text += " ";
    text += frame.toString().padStart(2, FIGURE_SPACE);
    text += "/60";
    this.textSchedule.set(text);
    super.show(options);
  }
}

// MARK: Multi Text

/**
 * This is needed as a default in some places but should never actually be used.
 */
const baseFont = Font.cursive(1);

const TEXT_FORMAT_LIST = Symbol("Text Format List");
function getFormat(
  name: string,
  available: readonly TextFormatComponent[],
): TextFormatComponent | undefined {
  return available.findLast((component) => component.nameScalar.value == name);
}
/**
 *
 * @param options The incoming options, which might include formatters from MultiTextComponent ancestors.
 * @param current New formatters
 * @returns A list of formatters.
 * Any and all formatters read of `options` will come first,
 * followed by the formatters associated with the `current` MultiTextComponent.
 */
function extractTextFormatList(
  options: ShowOptions & {
    [TEXT_FORMAT_LIST]?: readonly TextFormatComponent[];
  },
  current: readonly TextFormatComponent[],
) {
  if (options[TEXT_FORMAT_LIST]) {
    return [...options[TEXT_FORMAT_LIST], ...current];
  } else {
    return current;
  }
}
/**
 *
 * @param options These are the incoming options.
 * Start from a copy of these.
 * @param textFormatList Add these into the options,
 * replacing any previous TEXT_FORMAT_LIST.
 * Presumably you created this list from a call to {@link extractTextFormatList}().
 * So one immutable array will be replacing another.
 * But the contents of the array will only grow, with new formatters being added to the end.
 * @returns A new ShowableOptions to share with children.
 * This will contain the next list of formatters.
 */
function setTextFormatList(
  options: ShowOptions,
  textFormatList: readonly TextFormatComponent[],
) {
  return { ...options, [TEXT_FORMAT_LIST]: textFormatList };
}
/**
 * Use this to combine multiple formats into one paragraph.
 *
 * This contains a sequence of TextSpanComponent objects with the text to display.
 * And a sequence of TextFormatComponent objects with formatting instructions.
 * Each TextSpanComponent object points to a TextFormatComponent object by name.
 * Presumably a lot of formatting will be reused, like "normal" and bold.
 *
 * This is a prototype.
 * The basic functionality is there and works.
 * But the GUI needs some cleanup.
 * If nothing else it needs instructions.
 * Ideally it would be impossible to add a TextSpanComponent or a TextFormatComponent to anything but one of these components.
 * And these components should have two *preferred* types of children:  TextSpanComponent or TextFormatComponent.
 *
 * Currently we print a warning on the screen for any errors.
 *
 * We can now have other children.
 * TextSpanComponent and TextFormatComponent have special meanings.
 * Any other children are drawn like normal.
 * These children are drawn before the TextSpanComponents are drawn.
 * One reason is that descendants get full access to this component's formatters.
 * So a top level Multi Text can create formatters shared by other Multi Text Components.
 * This includes Multi Text Components that are wrapped in other components.
 */
export class MultiTextComponent extends DurationAgnosticComponent {
  readonly registryKey = "Multi Text";
  readonly #temporaryText = new Array<TextSpanComponent>();
  /**
   * Create, initialize, and add a TextSpanComponent to this MultiTextComponent.
   * @param style The name of the style to apply to this text.
   * @param content The text to display.
   * @returns `this`, for chaining.
   */
  addText(style: string, content: string): this {
    const span = new TextSpanComponent();
    span.styleSchedule.set(style);
    span.contentSchedule.set(content);
    this.#temporaryText.push(span);
    return this;
  }
  static #splitter = /^⸨([^⸨⸩]*)⸩([^⸨⸩]*)(.*)$/s;
  /**
   * `component.addText1("⸨format1⸩content1⸨format2⸩content2⸨format3⸩content3")`
   * is equivalent to
   * `component.add("format1", "content1").add("format2", "content2").add("format3", "content3")`
   * @param all A string containing all of the text and styles to add.
   * @returns this;
   */
  addText1(all: string): this {
    while (all != "") {
      const pieces = MultiTextComponent.#splitter.exec(all);
      if (!pieces) {
        throw new Error("Invalid here:  " + all);
      }
      this.addText(pieces[1], pieces[2]);
      all = pieces[3];
    }
    return this;
  }
  /**
   * Remove all TextSpanComponent objects created by addText() or addText1().
   */
  clearText() {
    this.#temporaryText.length = 0;
    return this;
  }
  readonly positionSchedule = new PointScheduleInfo("Position", {
    x: 8,
    y: 0.25,
  });
  readonly alignmentSchedule = new SelectScheduleInfo("Alignment", "center", [
    "left",
    "center",
    "right",
    "justify",
  ]);
  /**
   * How does the text align with {@link positionSchedule} vertically?
   *
   */
  readonly textBaselineSchedule = new SelectScheduleInfo("Baseline", "top", [
    "top",
    "middle",
    "bottom",
  ]);
  readonly widthSchedule = new NumberScheduleInfo("Width", 7.5);
  readonly additionalLineHeightSchedule = new NumberScheduleInfo(
    "Additional Line Height",
    0,
  );
  constructor(
    initialValues: {
      description?: string;
      position?: Point | readonly Keyframe<Point>[];
      alignment?: Parameters<MultiTextComponent["alignmentSchedule"]["set"]>[0];
      textBaseline?: Parameters<
        MultiTextComponent["textBaselineSchedule"]["set"]
      >[0];
      width?: number | readonly Keyframe<number>[];
      additionalLineHeight?: number | readonly Keyframe<number>[];
    } = {},
  ) {
    super(initialValues.description ?? "Multi Text");
    this.schedules.push(
      this.positionSchedule,
      this.alignmentSchedule,
      this.textBaselineSchedule,
      this.widthSchedule,
      this.additionalLineHeightSchedule,
    );
    if (initialValues.position !== undefined)
      this.positionSchedule.set(initialValues.position);
    if (initialValues.alignment !== undefined)
      this.alignmentSchedule.set(initialValues.alignment);
    if (initialValues.textBaseline !== undefined)
      this.textBaselineSchedule.set(initialValues.textBaseline);
    if (initialValues.width !== undefined)
      this.widthSchedule.set(initialValues.width);
    if (initialValues.additionalLineHeight !== undefined)
      this.additionalLineHeightSchedule.set(initialValues.additionalLineHeight);
  }
  protected override showChild(info: ShowChildInfo): void {
    // We are not currently using this method.
    console.warn("yes!");
    if (info.child instanceof TextSpanComponent) {
      // TODO we should display the result of each TextSpanComponent in this call.
      // That way we can completely control the zIndex.
      // For now the text is all displayed at the highest zIndex.
    } else if (info.child instanceof TextFormatComponent) {
      // Nothing to do.
      // This is not a visible component.
    } else {
      super.showChild(info);
    }
  }
  override show(options: ShowOptions): void {
    const { context, timeInMs } = options;
    const sources = new Array<TextSpanComponent>();
    const newFormatters = new Array<TextFormatComponent>();
    const otherChildren = new Array<Showable>();
    this.children.forEach(({ child }) => {
      if (child instanceof TextSpanComponent) {
        sources.push(child);
      } else if (child instanceof TextFormatComponent) {
        newFormatters.push(child);
      } else {
        otherChildren.push(child);
      }
    });
    const allFormatters = extractTextFormatList(options, newFormatters);
    const childOptions = setTextFormatList(options, allFormatters);
    otherChildren.forEach((child) => {
      child.show(childOptions);
    });
    const paragraphLayout = new ParagraphLayout(baseFont);
    const initializedFormatters = new Map<
      string,
      ReturnType<TextFormatComponent["freeze"]> | undefined
    >();
    sources.push(...this.#temporaryText);
    sources.forEach((source) => {
      const { content, style } = source.get(timeInMs);
      const initializedFormatter = initializedFormatters.getOrInsertComputed(
        style,
        (style) => {
          const formatter = getFormat(style, allFormatters);
          return formatter?.freeze(timeInMs);
        },
      );
      if (!initializedFormatter) {
        // Throwing an exception seems extreme or even a warning to the console,
        // as this happens in the animation frame handler.
        showError(context, `Unknown style:\n“${style}”`);
      } else {
        initializedFormatter(content, paragraphLayout);
      }
    });
    const position = this.positionSchedule.at(timeInMs);
    const alignment = this.alignmentSchedule.at(timeInMs);
    // Note:  paragraphLayout.align() has partial support for more.
    // Things like capital top or (normal text) baseline.
    // But that code seems to be in a state of flux at the moment.
    // TODO fix it.
    const baseline = this.textBaselineSchedule.at(timeInMs);
    const width = this.widthSchedule.at(timeInMs);
    const additionalLineHeight = this.additionalLineHeightSchedule.at(timeInMs);
    const aligned = paragraphLayout.align(
      width,
      alignment,
      additionalLineHeight,
    );
    const x =
      position.x -
      (alignment == "right" ? width : alignment == "center" ? width / 2 : 0);
    const height = aligned.height;
    const y =
      position.y -
      (baseline == "bottom" ? height : baseline == "middle" ? height / 2 : 0);
    aligned.pathShapeByTag().forEach((pathShape, callback) => {
      pathShape = pathShape.translate(x, y);
      (callback as (options: ShowOptions, pathShape: PathShape) => void)(
        options,
        pathShape,
      );
    });
  }
}

// MARK: Text Span

export class TextSpanComponent implements Showable {
  readonly registryKey = "Text Span";
  public contentSchedule = new StringScheduleInfo("Content", "");
  // TODO do not allow easing in styleSchedule.
  public styleSchedule = new StringScheduleInfo("Style", "");
  readonly schedules = [this.contentSchedule, this.styleSchedule] as const;
  readonly description = "Text Span";
  readonly duration = 0;
  constructor(
    initialValues: {
      content?: string | readonly Keyframe<string>[];
      style?: string | readonly Keyframe<string>[];
    } = {},
  ) {
    if (initialValues.content !== undefined)
      this.contentSchedule.set(initialValues.content);
    if (initialValues.style !== undefined)
      this.styleSchedule.set(initialValues.style);
  }
  show(options: ShowOptions): void {
    // TODO Can we update the Visual Editor's GUI to prevent this from happening in the first place?
    showError(
      options.context,
      "TextSpanComponent\nshould be a child of\nMultiTextComponent",
    );
  }
  get(timeInMs: number) {
    const content = this.contentSchedule.at(timeInMs);
    const style = this.styleSchedule.at(timeInMs);
    return { content, style };
  }
}

// MARK: Text Format

type CachedFont = {
  readonly font: Font;
  readonly size: number;
  readonly boldness: number;
  readonly obliqueness: number;
};

export class TextFormatComponent implements Showable {
  readonly registryKey = "Text Format";
  readonly nameScalar = new StringScalarInfo("Name", "");
  readonly scalars = [this.nameScalar] as const;
  readonly colorSchedule: ColorScheduleInfo;
  readonly sizeSchedule = new NumberScheduleInfo("Font Size", 1);
  readonly boldnessSchedule = new NumberScheduleInfo("Boldness", 1);
  readonly obliquenessSchedule = new NumberScheduleInfo("Obliqueness", 0);
  readonly alphaSchedule = new NumberScheduleInfo("Alpha", 1);
  readonly schedules = new Array<ScheduleInfo>();
  readonly description: string;
  readonly duration = 0;
  constructor(
    initialValues: {
      description?: string;
      name?: string;
      color?: string | readonly Keyframe<string>[] | ColorScheduleInfo;
      size?: number | readonly Keyframe<number>[];
      boldness?: number | readonly Keyframe<number>[];
      obliqueness?: number | readonly Keyframe<number>[];
      alpha?: number | readonly Keyframe<number>[];
    } = {},
  ) {
    this.description = initialValues.description ?? "Text Format";
    if (initialValues.name !== undefined)
      this.nameScalar.value = initialValues.name;
    this.colorSchedule = new ColorScheduleInfo(
      "Color",
      initialValues.color ?? "#666",
    );
    if (initialValues.size !== undefined)
      this.sizeSchedule.set(initialValues.size);
    if (initialValues.boldness !== undefined)
      this.boldnessSchedule.set(initialValues.boldness);
    if (initialValues.obliqueness !== undefined)
      this.obliquenessSchedule.set(initialValues.obliqueness);
    if (initialValues.alpha !== undefined)
      this.alphaSchedule.set(initialValues.alpha);
    this.schedules.push(
      this.colorSchedule,
      this.sizeSchedule,
      this.boldnessSchedule,
      this.obliquenessSchedule,
      this.alphaSchedule,
    );
  }
  show(options: ShowOptions): void {
    // TODO Can we update the Visual Editor's GUI to prevent this from happening in the first place?
    showError(
      options.context,
      "TextFormatComponent\nshould be a child of\nMultiTextComponent",
    );
  }
  #cachedFont: undefined | CachedFont;
  freeze(timeInMs: number) {
    const color = this.colorSchedule.at(timeInMs);
    const size = this.sizeSchedule.at(timeInMs);
    const boldness = this.boldnessSchedule.at(timeInMs);
    const obliqueness = this.obliquenessSchedule.at(timeInMs);
    const alpha = this.alphaSchedule.at(timeInMs);
    if (
      !this.#cachedFont ||
      this.#cachedFont.size != size ||
      this.#cachedFont.boldness != boldness ||
      this.#cachedFont.obliqueness != obliqueness
    ) {
      const font = makeLineFontRatio(size, boldness).oblique(obliqueness);
      this.#cachedFont = { font, size, boldness, obliqueness };
    }
    const font = this.#cachedFont.font;
    function drawText({ context }: ShowOptions, pathShape: PathShape): void {
      context.strokeStyle = color;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = font.strokeWidth;
      context.globalAlpha = alpha;
      context.stroke(pathShape.canvasPath);
      context.globalAlpha = 1;
    }
    function addText(content: string, paragraphLayout: ParagraphLayout): void {
      paragraphLayout.addText(content, font, drawText);
    }
    return addText;
  }
}

/**
 * Resolves when every family in `familyNames` is confirmed available — either
 * as a loaded web font in `document.fonts` or as a local system font from
 * `queryLocalFonts()`.
 *
 * Rejects with a user-readable message listing any missing families.
 *
 * Intended for the recording pipeline: await this before encoding a frame so
 * that text is never rendered with a silent fallback font.
 *
 * In a Node.js / CLI context (where `document` is absent) the promise
 * resolves immediately without checking anything.
 *
 * If `queryLocalFonts()` is unavailable or the user denies permission, the
 * check falls back to web fonts only — local fonts are simply not verified.
 */
export async function fontsAreAvailable(
  familyNames: readonly string[],
): Promise<void> {
  if (typeof document === "undefined") return;

  await document.fonts.ready;

  const known = new Set<string>();
  for (const face of document.fonts) {
    known.add(
      face.family
        .replace(/^["']|["']$/g, "")
        .trim()
        .toLowerCase(),
    );
  }

  if ("queryLocalFonts" in globalThis) {
    try {
      const local = await (
        globalThis as unknown as {
          queryLocalFonts: () => Promise<Array<{ family: string }>>;
        }
      ).queryLocalFonts();
      for (const f of local) known.add(f.family.trim().toLowerCase());
    } catch {
      // Permission denied or API unavailable — proceed with web fonts only.
    }
  }

  const missing = familyNames.filter(
    (name) => !known.has(name.trim().toLowerCase()),
  );
  if (missing.length > 0) {
    const list = missing.map((n) => `"${n}"`).join(", ");
    throw new Error(
      `Font${missing.length === 1 ? "" : "s"} not found: ${list}`,
    );
  }
}

// MARK: Simple Text

export class TextComponent extends DurationAgnosticComponent {
  readonly registryKey = "Text";
  readonly colorSchedule = new ColorScheduleInfo("Color", "#888");
  readonly rectSchedule = new RectangleScheduleInfo("Rect", {
    x: 2,
    y: 2,
    width: 6,
    height: 4,
  });
  readonly textSchedule = new StringScheduleInfo("Text", "Type Here");
  readonly sizeSchedule = new NumberScheduleInfo("Size", 1);
  readonly boldnessSchedule = new NumberScheduleInfo("Boldness", 1);
  readonly obliquenessSchedule = new NumberScheduleInfo("Obliqueness", 0);
  readonly alignmentSchedule = new SelectScheduleInfo("Alignment", "left", [
    "left",
    "center",
    "right",
    "justify",
  ]);
  constructor(
    initialValues: {
      minDuration?: number;
      color?: string | readonly Keyframe<string>[];
      rect?: ReadOnlyRect | readonly Keyframe<ReadOnlyRect>[];
      text?: string | readonly Keyframe<string>[];
      size?: number | readonly Keyframe<number>[];
      boldness?: number | readonly Keyframe<number>[];
      obliqueness?: number | readonly Keyframe<number>[];
      // I have mixed feelings on the complicated type definition.
      // It is exactly what it needs to be, and it avoids any duplicated code or namespace pollution.
      // But it is long and complicated.
      // Final thoughts:  It was only complicated the first time.
      // You could clone this any number of times with different classes and properties.
      alignmentSchedule?: Parameters<
        TextComponent["alignmentSchedule"]["set"]
      >[0];
    } = {},
  ) {
    super("Text");
    if (initialValues.minDuration !== undefined) {
      this.minDurationScalar.value = initialValues.minDuration;
    }
    this.schedules.push(
      this.colorSchedule,
      this.rectSchedule,
      this.textSchedule,
      this.sizeSchedule,
      this.boldnessSchedule,
      this.obliquenessSchedule,
      this.alignmentSchedule,
    );
    if (initialValues.color !== undefined) {
      this.colorSchedule.set(initialValues.color);
    }
    if (initialValues.rect !== undefined) {
      this.rectSchedule.set(initialValues.rect);
    }
    if (initialValues.text !== undefined) {
      this.textSchedule.set(initialValues.text);
    }
    if (initialValues.size !== undefined) {
      this.sizeSchedule.set(initialValues.size);
    }
    if (initialValues.boldness !== undefined) {
      this.boldnessSchedule.set(initialValues.boldness);
    }
    if (initialValues.obliqueness !== undefined) {
      this.obliquenessSchedule.set(initialValues.obliqueness);
    }
    if (initialValues.alignmentSchedule !== undefined) {
      this.alignmentSchedule.set(initialValues.alignmentSchedule);
    }
  }
  #cachedFont: undefined | CachedFont;
  #cachedPath:
    | undefined
    | {
        readonly cachedFont: CachedFont;
        readonly width: number;
        readonly text: string;
        readonly alignment: TextComponent["alignmentSchedule"]["choices"][0];
        readonly path: Path2D;
      };
  override show(options: ShowOptions) {
    super.show(options);
    const { context, timeInMs } = options;
    const color = this.colorSchedule.at(timeInMs);
    const rect = this.rectSchedule.at(timeInMs);
    const text = this.textSchedule.at(timeInMs);
    const size = this.sizeSchedule.at(timeInMs);
    const boldness = this.boldnessSchedule.at(timeInMs);
    const obliqueness = this.obliquenessSchedule.at(timeInMs);
    const alignment = this.alignmentSchedule.at(timeInMs);
    context.strokeStyle = color;
    if (
      !this.#cachedFont ||
      this.#cachedFont.size != size ||
      this.#cachedFont.boldness != boldness ||
      this.#cachedFont.obliqueness != obliqueness
    ) {
      const font = makeLineFontRatio(size, boldness).oblique(obliqueness);
      this.#cachedFont = { font, size, boldness, obliqueness };
    }
    if (
      !this.#cachedPath ||
      this.#cachedPath.cachedFont != this.#cachedFont ||
      this.#cachedPath.width != rect.width ||
      this.#cachedPath.text != text ||
      this.#cachedPath.alignment != alignment
    ) {
      const path = ParagraphLayout.singlePathShape({
        font: this.#cachedFont.font,
        text,
        width: rect.width,
        alignment,
      }).canvasPath;
      const cachedFont = this.#cachedFont;
      this.#cachedPath = {
        cachedFont,
        path,
        text,
        width: rect.width,
        alignment,
      };
    }
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = this.#cachedFont.font.strokeWidth;
    const matrix = context.getTransform();
    context.translate(rect.x, rect.y);
    context.stroke(this.#cachedPath.path);
    context.setTransform(matrix);
  }
}

// MARK: Rectangle

/**
 * Standard registry component: a filled rectangle with an editable color and
 * position/size schedule.
 */
export class RectangleComponent implements Showable {
  readonly registryKey = "Rectangle";
  readonly colorSchedule = new ColorScheduleInfo("Color", "cyan");
  readonly rectSchedule = new RectangleScheduleInfo("Rect", {
    x: 2,
    y: 2,
    width: 6,
    height: 4,
  });
  readonly schedules = [this.colorSchedule, this.rectSchedule] as const;
  readonly description = "Rectangle";
  readonly duration = 0;
  constructor(
    initialValues: {
      color?: string | readonly Keyframe<string>[];
      rect?: ReadOnlyRect | readonly Keyframe<ReadOnlyRect>[];
    } = {},
  ) {
    if (initialValues.color !== undefined)
      this.colorSchedule.set(initialValues.color);
    if (initialValues.rect !== undefined)
      this.rectSchedule.set(initialValues.rect);
  }
  show({ context, timeInMs }: ShowOptions) {
    const color = this.colorSchedule.at(timeInMs);
    const rect = this.rectSchedule.at(timeInMs);
    context.fillStyle = color;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
}

// MARK: Arrow

/**
 * Standard registry component: a directed arrow with a rectangular shaft and
 * filled triangular head.  Uses a single filled {@link Path2D} so partially
 * transparent colors don't double-blend where the head overlaps the shaft.
 *
 * Both endpoints are {@link PointScheduleInfo} schedules, so the Visual Editor
 * renders them as draggable circles directly on the canvas.
 */
export class ArrowComponent extends DurationAgnosticComponent {
  readonly registryKey: string;

  readonly arrowSchedule = new ArrowScheduleInfo("Location", {
    flat: { x: 2, y: 4.5 },
    pointy: { x: 12, y: 4.5 },
  });
  readonly widthSchedule = new NumberScheduleInfo("Width", 0.5);
  readonly colorSchedule = new ColorScheduleInfo("Color", "#555");
  override readonly replaceableComponents = undefined;
  constructor(
    initialValues: {
      registryKey?: string;
      description?: string;
      arrow?: ArrowValue | readonly Keyframe<ArrowValue>[];
      width?: number | readonly Keyframe<number>[];
      color?: string | readonly Keyframe<string>[];
    } = {},
  ) {
    super(initialValues.description ?? "Arrow");
    this.schedules.push(
      this.arrowSchedule,
      this.widthSchedule,
      this.colorSchedule,
    );
    this.registryKey = initialValues.registryKey ?? "Arrow";
    if (initialValues.arrow !== undefined)
      this.arrowSchedule.set(initialValues.arrow);
    if (initialValues.width !== undefined)
      this.widthSchedule.set(initialValues.width);
    if (initialValues.color !== undefined)
      this.colorSchedule.set(initialValues.color);
  }

  static show(options: {
    context: CanvasRenderingContext2D;
    flat: Point;
    tip: Point;
    width: number;
    color: string;
  }) {
    const { color, context, flat, tip, width } = options;

    const dx = tip.x - flat.x;
    const dy = tip.y - flat.y;
    const length = Math.hypot(dx, dy);
    // **Bad Math**
    if (length < 1e-9) return;

    // Unit vector along arrow, and 90°-CCW perpendicular.
    const ux = dx / length;
    const uy = dy / length;
    const px = -uy;
    const py = ux;

    const halfWidth = width / 2;

    // Arrowhead geometry (Google Slides style concave chevron).
    // Scale the head down proportionally when the arrow is shorter than the desired head length.
    const headScale = Math.min(1, length / (width * 6.5));
    // Notch: where the shaft ends and the arrowhead begins.  ±hw wide, 4.8w back from tip.
    const notchBack = width * 4.8 * headScale;
    // Wing tips: the outermost corners.  ±2.4w wide, 6.5w back from tip.
    const wingBack = width * 6.5 * headScale;
    const wingHW = width * 2.4 * headScale;

    // Positions along the arrow axis.
    const notchX = tip.x - ux * notchBack;
    const notchY = tip.y - uy * notchBack;
    const wingX = tip.x - ux * wingBack;
    const wingY = tip.y - uy * wingBack;

    const path = new Path2D();
    path.moveTo(flat.x + px * halfWidth, flat.y + py * halfWidth);
    path.lineTo(notchX + px * halfWidth, notchY + py * halfWidth);
    path.lineTo(wingX + px * wingHW, wingY + py * wingHW);
    path.lineTo(tip.x, tip.y);
    path.lineTo(wingX - px * wingHW, wingY - py * wingHW);
    path.lineTo(notchX - px * halfWidth, notchY - py * halfWidth);
    path.lineTo(flat.x - px * halfWidth, flat.y - py * halfWidth);
    path.closePath();

    context.fillStyle = color;
    context.fill(path);
  }

  override show(options: ShowOptions) {
    const { context, timeInMs } = options;
    const { flat, pointy } = this.arrowSchedule.at(timeInMs);
    const width = this.widthSchedule.at(timeInMs);
    const color = this.colorSchedule.at(timeInMs);
    ArrowComponent.show({ context, flat, tip: pointy, width, color });
    // No children are expected, but children are possible, mostly for debugging.
    super.show(options);
  }
}

// MARK: Image

/**
 * Standard registry component: draws a single image loaded from a URL.
 *
 * While the image is loading (or if the URL is empty), the destination
 * rectangle is left blank.  If the URL is non-empty but the load fails,
 * {@link SlowImage.showError} draws a red ✕ so the problem is obvious.
 *
 * The URL schedule is discrete — changing it mid-animation triggers a fresh
 * load.  The dest-rect schedule is interpolated so you can animate placement.
 */
export class SingleImageComponent implements Showable {
  readonly registryKey = "Static Image";
  readonly urlSchedule = new StringScheduleInfo("URL", "");
  readonly destRectSchedule = new RectangleScheduleInfo("Dest Rect", {
    x: 1,
    y: 1,
    width: 14,
    height: 7,
  });
  readonly schedules = [this.urlSchedule, this.destRectSchedule] as const;
  readonly description = "Static Image";
  readonly duration = 0;
  #trackedUrl = "";
  #image: SingleImage | null = null;
  constructor(
    initialValues: {
      url?: string | readonly Keyframe<string>[];
      destRect?: ReadOnlyRect | readonly Keyframe<ReadOnlyRect>[];
    } = {},
  ) {
    if (initialValues.url !== undefined)
      this.urlSchedule.set(initialValues.url);
    if (initialValues.destRect !== undefined)
      this.destRectSchedule.set(initialValues.destRect);
  }
  show({ context, timeInMs }: ShowOptions) {
    const url = this.urlSchedule.at(timeInMs);
    const dest = this.destRectSchedule.at(timeInMs);

    if (url !== this.#trackedUrl) {
      this.#trackedUrl = url;
      this.#image = url ? new SingleImage(url) : null;
    }

    if (!this.#image) return;
    if (!this.#image.somethingIsAvailable) {
      SlowImage.showError(context, dest.x, dest.y, dest.width, dest.height);
      return;
    }

    // Fit the image inside dest, preserving aspect ratio (centered).
    const imgAspect = this.#image.naturalWidth / this.#image.naturalHeight;
    const destAspect = dest.width / dest.height;
    let drawW: number, drawH: number;
    if (imgAspect > destAspect) {
      drawW = dest.width;
      drawH = dest.width / imgAspect;
    } else {
      drawH = dest.height;
      drawW = dest.height * imgAspect;
    }
    const drawX = dest.x + (dest.width - drawW) / 2;
    const drawY = dest.y + (dest.height - drawH) / 2;
    context.drawImage(
      this.#image.data as CanvasImageSource,
      drawX,
      drawY,
      drawW,
      drawH,
    );
  }
}

// MARK: Function Graph

export class FunctionGraphComponent implements Showable {
  /**
   * Register a named function here so it can be selected via the "Function Name"
   * schedule in the visual editor.  Call this from your video's TypeScript file
   * before the component is rendered.
   *
   * @example
   * FunctionGraphComponent.functions.set("sin", Math.sin);
   * FunctionGraphComponent.functions.set("x²", x => x * x);
   */
  static readonly functions = new Map<string, (x: number) => number>();

  readonly registryKey = "Function Graph";
  readonly description = "Function Graph";
  readonly duration = 0;

  readonly functionNameSchedule = new StringScheduleInfo(
    "Function Name",
    "sin",
  );
  readonly destRectSchedule = new RectangleScheduleInfo("Dest Rect", {
    x: 2,
    y: 2,
    width: 6,
    height: 4,
  });
  readonly xMinSchedule = new NumberScheduleInfo("X Min", -Math.PI * 2);
  readonly xMaxSchedule = new NumberScheduleInfo("X Max", Math.PI * 2);
  readonly yMinSchedule = new NumberScheduleInfo("Y Min", -1.5);
  readonly yMaxSchedule = new NumberScheduleInfo("Y Max", 1.5);
  readonly gridColorSchedule = new StringScheduleInfo(
    "Grid Color",
    "rgba(255,255,255,0.35)",
  );
  readonly gridLineWidthSchedule = new NumberScheduleInfo(
    "Grid Line Width",
    0.02,
  );
  readonly fontSchedule = new StringScheduleInfo("Font", "0.28px sans-serif");
  readonly curveColorSchedule = new ColorScheduleInfo(
    "Curve Color",
    "rgb(0,128,255)",
  );

  readonly schedules = [
    this.functionNameSchedule,
    this.destRectSchedule,
    this.xMinSchedule,
    this.xMaxSchedule,
    this.yMinSchedule,
    this.yMaxSchedule,
    this.gridColorSchedule,
    this.gridLineWidthSchedule,
    this.fontSchedule,
    this.curveColorSchedule,
  ] as const;

  show({ context, timeInMs }: ShowOptions): void {
    const functionName = this.functionNameSchedule.at(timeInMs);
    const f = FunctionGraphComponent.functions.get(functionName);
    if (!f) {
      showError(context, `Unknown function:\n"${functionName}"`);
      return;
    }

    const destRect = this.destRectSchedule.at(timeInMs);
    const xMin = this.xMinSchedule.at(timeInMs);
    const xMax = this.xMaxSchedule.at(timeInMs);
    const yMin = this.yMinSchedule.at(timeInMs);
    const yMax = this.yMaxSchedule.at(timeInMs);
    if (xMax <= xMin || yMax <= yMin) return;

    const gridColor = this.gridColorSchedule.at(timeInMs);
    const gridLineWidth = this.gridLineWidthSchedule.at(timeInMs);
    const font = this.fontSchedule.at(timeInMs);
    const curveColor = this.curveColorSchedule.at(timeInMs);

    const viewRect: ReadOnlyRect = {
      x: xMin,
      y: yMin,
      width: xMax - xMin,
      height: yMax - yMin,
    };

    drawGrid(context, {
      destRect,
      viewRect,
      color: gridColor,
      majorLineWidth: gridLineWidth,
      font,
    });

    // Use the same transform as drawGrid so the curve aligns with the grid.
    const xf = computeGridTransform(destRect, viewRect);
    if (!xf) return;
    const { toCanvasX, toCanvasY, effectiveRect } = xf;

    // Border — drawn around the actual letterboxed area.
    context.strokeStyle = gridColor;
    context.lineWidth = gridLineWidth * 1.5;
    context.setLineDash([]);
    context.lineCap = "butt";
    context.strokeRect(
      effectiveRect.x,
      effectiveRect.y,
      effectiveRect.width,
      effectiveRect.height,
    );

    // Function curve — clipped to effectiveRect.
    context.save();
    context.beginPath();
    context.rect(
      effectiveRect.x,
      effectiveRect.y,
      effectiveRect.width,
      effectiveRect.height,
    );
    context.clip();

    const SAMPLE_COUNT = 300;
    context.beginPath();
    for (let i = 0; i <= SAMPLE_COUNT; i++) {
      const mx = xMin + ((xMax - xMin) * i) / SAMPLE_COUNT;
      const cx = toCanvasX(mx);
      const cy = toCanvasY(f(mx));
      if (i === 0) context.moveTo(cx, cy);
      else context.lineTo(cx, cy);
    }
    context.strokeStyle = curveColor;
    context.lineWidth = 0.04;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();

    context.restore();
  }
}

// MARK: Halftone Shadow

/** At 100% opacity the dot radius reaches this fraction of the half-cell width. */
const HALFTONE_MAX_RADIUS_FACTOR = 0.9;

/**
 * Wraps its children with a halftone drop-shadow effect.
 *
 * On each frame:
 *  1. Renders all children onto a tiny canvas (one pixel per halftone circle)
 *     to sample alpha cheaply.
 *  2. Reads the alpha channel and fills a dot Path2D offset by (dx, dy) as the shadow.
 *  3. Renders all children again at full quality onto the main canvas.
 *
 * Add content as replaceable children via the Visual Editor, or supply a `base`
 * Showable in the constructor to add it as a fixed child.
 */
export class HalftoneShadowComponent extends InParallelComponent {
  readonly registryKey = "Halftone Shadow";
  readonly dotColorSchedule = new ColorScheduleInfo("Dot Color", "#ccc");
  readonly backgroundColorSchedule = new ColorScheduleInfo(
    "Background Color",
    "transparent",
  );
  readonly dxSchedule = new NumberScheduleInfo("Dx", 0.2);
  readonly dySchedule = new NumberScheduleInfo("Dy", 0.2);
  readonly periodSchedule = new NumberScheduleInfo("Period", 0.25);

  #smallCanvas: HTMLCanvasElement | undefined;
  #smallCtx: CanvasRenderingContext2D | undefined;
  #smallCols = 0;
  #smallRows = 0;

  constructor(
    initialValues: {
      base?: Showable;
      description?: string;
      dotColor?: string | readonly Keyframe<string>[];
      backgroundColor?: string | readonly Keyframe<string>[];
      dx?: number | readonly Keyframe<number>[];
      dy?: number | readonly Keyframe<number>[];
      period?: number | readonly Keyframe<number>[];
    } = {},
  ) {
    const { base } = initialValues;
    super(
      initialValues.description ??
        (base ? `${base.description} » shadow` : "Halftone Shadow"),
    );
    this.schedules.push(
      this.dotColorSchedule,
      this.backgroundColorSchedule,
      this.dxSchedule,
      this.dySchedule,
      this.periodSchedule,
    );
    if (base) this.addFixed({ child: base });
    if (initialValues.dotColor !== undefined)
      this.dotColorSchedule.set(initialValues.dotColor);
    if (initialValues.backgroundColor !== undefined)
      this.backgroundColorSchedule.set(initialValues.backgroundColor);
    if (initialValues.dx !== undefined) this.dxSchedule.set(initialValues.dx);
    if (initialValues.dy !== undefined) this.dySchedule.set(initialValues.dy);
    if (initialValues.period !== undefined)
      this.periodSchedule.set(initialValues.period);
  }

  override show(options: ShowOptions): void {
    const { context, timeInMs } = options;
    const dotColor = this.dotColorSchedule.at(timeInMs);
    const backgroundColor = this.backgroundColorSchedule.at(timeInMs);
    const dx = this.dxSchedule.at(timeInMs);
    const dy = this.dySchedule.at(timeInMs);
    const period = this.periodSchedule.at(timeInMs);
    const cols = Math.ceil(16 / period);
    const rows = Math.ceil(9 / period);

    // Low-power mode or CLI context: skip the halftone pass.
    if (options.quality === "Low Power" || typeof document === "undefined") {
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, 16, 9);
      super.show(options);
      return;
    }

    // Resize the small canvas when period changes.
    if (
      !this.#smallCanvas ||
      this.#smallCols !== cols ||
      this.#smallRows !== rows
    ) {
      this.#smallCanvas = document.createElement("canvas");
      this.#smallCanvas.width = cols;
      this.#smallCanvas.height = rows;
      this.#smallCtx = this.#smallCanvas.getContext("2d", {
        willReadFrequently: true,
      })!;
      // Apply the 16×9 root transform once — it stays until the canvas is replaced.
      this.#smallCtx.scale(cols / 16, rows / 9);
      this.#smallCols = cols;
      this.#smallRows = rows;
    }
    const smallCtx = this.#smallCtx!;

    // Render children into the small canvas for alpha sampling.
    smallCtx.save();
    smallCtx.resetTransform();
    smallCtx.clearRect(0, 0, cols, rows);
    smallCtx.restore();
    super.show({ ...options, context: smallCtx, registerTransform: undefined });

    // Draw background.
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, 16, 9);

    // Build halftone dot path from the alpha channel and draw as the shadow.
    const { data } = smallCtx.getImageData(0, 0, cols, rows);
    const path = new Path2D();
    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        const alpha = data[(iy * cols + ix) * 4 + 3] / 255;
        if (alpha > 0) {
          const x = (ix + 0.5) * period;
          const y = (iy + 0.5) * period;
          const radius =
            Math.sqrt(alpha) * (period / 2) * HALFTONE_MAX_RADIUS_FACTOR;
          path.moveTo(x + radius, y);
          path.arc(x, y, radius, 0, Math.PI * 2);
        }
      }
    }
    context.save();
    context.translate(dx, dy);
    context.fillStyle = dotColor;
    context.fill(path);
    context.restore();

    // Render children at full quality onto the main canvas.
    super.show(options);
  }
}

// MARK: Registry

/** Registry of component factories available in the "Add" dropdown. */
export const componentRegistry = new Map<string, () => Showable>([
  ["Padding", () => new PaddingComponent()],
  ["Frame Counter", () => new FrameCounter()],
  ["In Series", (): Showable => new InSeriesComponent()],
  ["Slide Left Transition", () => new SlideLeftTransition()],
  ["Cross Fade Transition", () => new CrossFadeTransition()],
  ["Slide", (): Showable => new SlideComponent()],
  ["Text", () => new TextComponent()],
  ["Traditional Text", () => new TraditionalTextComponent()],
  ["Rectangle", () => new RectangleComponent()],
  ["Arrow", () => new ArrowComponent()],
  ["Function Graph", () => new FunctionGraphComponent()],
  ["Static Image", () => new SingleImageComponent()],
  ["Multi Text", (): Showable => new MultiTextComponent()],
  ["Text Span", () => new TextSpanComponent()],
  ["Text Format", () => new TextFormatComponent()],
  ["Halftone Shadow", (): Showable => new HalftoneShadowComponent()],
]);

// MARK: Serialize

export type SerializedChild = {
  registryKey: string;
  schedules: SerializedSchedule[];
  scalars?: SerializedScalar[];
  components?: SerializedChild[];
  userEditableDescription?: string;
  duration?: number;
};

/**
 * Rebuilds a component list from a serialized snapshot (e.g. a database entry
 * pasted directly into source code).  Each entry is created via its registry
 * factory, has its `registryKey` stamped on it, schedules restored via
 * `applySnapshot`, and nested components rebuilt recursively.  Entries whose
 * `registryKey` is not found in the registry are silently skipped.
 */
export function buildComponents(snapshot: SerializedChild[]): Showable[] {
  return snapshot.flatMap((sc) => {
    const factory = componentRegistry.get(sc.registryKey);
    if (!factory) return [];
    const child = factory();
    child.registryKey = sc.registryKey;
    if (sc.userEditableDescription !== undefined)
      child.userEditableDescription = sc.userEditableDescription;
    if (child.scalars?.length && sc.scalars?.length) {
      applyScalarSnapshot(child.scalars, sc.scalars);
    }
    if (sc.duration !== undefined) child.setDuration?.(sc.duration);
    if (child.schedules?.length) applySnapshot(child.schedules, sc.schedules);
    if (child.replaceableComponents !== undefined && sc.components?.length) {
      child.replaceableComponents.push(...buildComponents(sc.components));
    }
    return [child];
  });
}
