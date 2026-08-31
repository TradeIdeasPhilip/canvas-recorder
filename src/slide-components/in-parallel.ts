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

import { BinaryInserter } from "../binary-search";
import {
  Scalar,
  ScalarInfo,
  ScheduleInfo,
  Showable,
  ShowableParent,
  ShowOptions,
} from "../showable";
import { Mutable, removeIf } from "../utility";
import { PaddingComponent } from "./padding";

/**
 * These will be shared in {@link InParallelComponent.children}, so this type is assignable to the standard child record type.
 * This adds sourceIndex, which might be used internally.
 * The default implementation ignores it, but not all subclasses treat all of their subcomponents identically.
 */
export type ParallelChildInfo = {
  readonly start: number;
  readonly replaceable: boolean;
  readonly child: Showable;
  /**
   * Which index of the #fixedChildren or #replaceableChildren arrays was the source of this?
   *
   */
  readonly sourceIndex: number;
};

export type ShowChildInfo = {
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
  // This is a workaround for a strange TypeScript issue.
  // Without this
  //   const asClass = new TraditionalTextComponent();
  //   asClass.userEditableDescription = "Part 1";
  // will fail, even though
  //   const asType : Showable = asClass;
  //   asType.userEditableDescription = "Part 1";
  // succeeds.
  // Copying the declaration like this will automatically grab the
  // documentation comments associated with Showable.userEditableDescription.
  userEditableDescription?: string;
  getFramePromises(
    timeInMs: number,
    set: Pick<Set<Promise<unknown>>, "add">,
  ): void {
    // This function should mirror the show() & showChild() methods for each class.
    // That logic got broken into two pieces to help with subclassing.
    // That makes it a little annoying to copy that code.
    // show() is responsible for iterating over the the list of children and adjusting for the start time of each child.
    // (Don't forget to adjust the start time!)
    // showChild() can adjust or skip the request based on details of each child.
    this.children.forEach(({ child, start }) => {
      child.getFramePromises?.(timeInMs - start, set);
    });
  }
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
  /**
   * An interface for adding, removing or reordering subcomponents from the Visual Editor.
   *
   * get() and replace() form the core functionality.
   *
   * This property is undefined if this object does not want the Visual Editor to add, remove or reorder subcomponents.
   *
   * {@link InParallelComponent} provides a reasonable implementation of this object.
   * Subclasses can replace this with a different object or `undefined`, but only in the constructor.
   * TextComponent and ArrowComponent both set this to `undefined` to make show() simpler.
   */
  readonly replaceableComponents: Showable["replaceableComponents"];
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
  /**
   * This is a simple wrapper around {@link addFixed}.
   * @param child To add.
   */
  add(child: Showable) {
    this.addFixed({ child });
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
