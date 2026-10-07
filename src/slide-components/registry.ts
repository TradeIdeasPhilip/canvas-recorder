import { Showable } from "../showable";
import { ArrowComponent } from "./arrow";
import { CrossFadeTransition } from "./cross-fade-transition";
import { FrameCounter } from "./frame-counter";
import { FunctionGraphComponent } from "./function-graph";
import { HalftoneShadowComponent } from "./halftone-shadow";
import { HoldPreviousTransition, HoldNextTransition } from "./hold";
import { SingleImageComponent } from "./image";
import { PaddingComponent } from "./in-parallel";
import { InSeriesComponent } from "./in-series";
import {
  MultiTextComponent,
  TextSpanComponent,
  TextFormatComponent,
} from "./multi-text";
import { RectangleComponent } from "./rectangle";
import { TextComponent } from "./simple-text";
import { SlideComponent } from "./slide-component";
import { SlideLeftTransition } from "./slide-left";
import { TraditionalTextComponent } from "./traditional-text";
import { VideoClipComponent } from "./video-clip";

export type ComponentRegistryEntry = {
  /**
   * Create and return a new instance of the given component.
   * This takes no arguments and return an object with all the default properties.
   */
  create(): Showable;
  /**
   * Aimed at the Visual Editor user.
   * English text that can be displayed when the user selects this item.
   */
  description?: string;
  /**
   * Offer this in the Visual Editor's "Wrap Component" dialog.
   *
   * Wrapping replaces the selected component, in the same position in its parent, with a new
   * one of these, then makes the selected component its child.  So `create()` must return a
   * component with `replaceableComponents`, and its duration should follow its children, or
   * wrapping would change the timeline.
   *
   * The default is false.
   */
  isGoodForWrapping?: boolean;
  /**
   * This component is a {@link Transition}: it draws the end of the previous sibling and the
   * start of the next one, so it only works as a direct child of an In Series.
   *
   * In Series uses this to find the transitions to offer.  Transitions should also set
   * {@link hiddenByDefault}, so they aren't offered anywhere else.
   *
   * The default is false.
   */
  isTransition?: boolean;
  /**
   * Leave this out of the Visual Editor's "Insert New Child" and "Wrap Component" lists
   * unless the parent puts it back; see `replaceableComponents.customizeComponentChoices`.
   *
   * For components that only work under one kind of parent: the transitions (direct children
   * of an In Series) and Text Format (a direct child of a Multi Text).  Because such a component
   * depends on its parent, the Visual Editor also won't offer to wrap one.
   *
   * Hidden entries are still in the registry, so saved files containing them load normally.
   *
   * The default is false.
   */
  hiddenByDefault?: boolean;
  /**
   * This is aimed at the code generator.
   *
   * The common components are all classes.
   * Their constructors all take similar arguments.
   * The constructors are not identical, but we can work on that.
   *
   * This is optional.
   * Sometimes, especially for quick and/or bespoke work, components are created in a different way.
   * In those cases the code generator will just include a warning that it skipped a component and will continue with the rest of its work.
   * If necessary we can add other "type" values; that's reserved just in case.
   */
  howToGenerate?: {
    type: "class";
    class: new (...args: any[]) => Showable;
  };
};

/** Registry of component factories available in the "Add" dropdown. */
export const componentRegistry = new Map<string, ComponentRegistryEntry>([
  [
    "Padding",
    {
      create() {
        return new PaddingComponent();
      },
      description:
        "What to display before or after displaying another component.  " +
        "This is commonly used inside an In Parallel parent to start displaying the child at a specific time.  " +
        "The timeline recognizes this control and lets you adjust the start time by dragging.",
      isGoodForWrapping: true,
      howToGenerate: { type: "class", class: PaddingComponent },
    },
  ],
  [
    "Frame Counter",
    {
      create() {
        return new FrameCounter();
      },
      description:
        "Aimed at debugging, this control shows how long it has been running in minutes, seconds and frames.",
      isGoodForWrapping: false,
      howToGenerate: { type: "class", class: FrameCounter },
    },
  ],
  [
    "In Series",
    {
      create() {
        return new InSeriesComponent();
      },
      description:
        "This is a container class.  " +
        "Each of its children runs in order.  " +
        "Inserting new children or removing children or changing children's durations will automatically adjust other children's start times.",
      isGoodForWrapping: true,
      howToGenerate: { type: "class", class: InSeriesComponent },
    },
  ],
  [
    "Slide Left Transition",
    {
      create() {
        return new SlideLeftTransition();
      },
      description:
        "The previous component slides left off the screen.  " +
        "At the same time the next component slides left onto the screen.",
      isGoodForWrapping: false,
      isTransition: true,
      hiddenByDefault: true,
      howToGenerate: { type: "class", class: SlideLeftTransition },
    },
  ],
  [
    "Cross Fade Transition",
    {
      create() {
        return new CrossFadeTransition();
      },
      description:
        "The previous component fades away while the next component appears.  ",
      isGoodForWrapping: false,
      isTransition: true,
      hiddenByDefault: true,
      howToGenerate: { type: "class", class: CrossFadeTransition },
    },
  ],
  [
    "Hold Previous",
    {
      create() {
        return new HoldPreviousTransition();
      },
      description: "Show the last frame of the previous component.",
      isGoodForWrapping: false,
      isTransition: true,
      hiddenByDefault: true,
      howToGenerate: { type: "class", class: HoldPreviousTransition },
    },
  ],
  [
    "Hold Next",
    {
      create() {
        return new HoldNextTransition();
      },
      description: "Show the first frame of the next component.",
      isGoodForWrapping: false,
      isTransition: true,
      hiddenByDefault: true,
      howToGenerate: { type: "class", class: HoldNextTransition },
    },
  ],
  [
    "Slide",
    {
      create() {
        return new SlideComponent();
      },
      description:
        "This container offers affine transforms and an alpha channel to its children.",
      isGoodForWrapping: true,
      howToGenerate: { type: "class", class: SlideComponent },
    },
  ],
  [
    "Text",
    {
      create() {
        return new TextComponent();
      },
      description: "A very simple version of the MultiText component.",
      isGoodForWrapping: false,
      howToGenerate: { type: "class", class: TextComponent },
    },
  ],
  [
    "Traditional Text",
    {
      create() {
        return new TraditionalTextComponent();
      },
      description:
        "A way to display text using normal web fonts and fonts installed on your computer.",
      isGoodForWrapping: false,
      howToGenerate: { type: "class", class: TraditionalTextComponent },
    },
  ],
  [
    "Rectangle",
    {
      create() {
        return new RectangleComponent();
      },
      description:"A perfect background, outline, or placeholder.",
      isGoodForWrapping: false,
      howToGenerate: { type: "class", class: RectangleComponent },
    },
  ],
  [
    "Arrow",
    {
      create() {
        return new ArrowComponent();
      },
      isGoodForWrapping: false,
      howToGenerate: { type: "class", class: ArrowComponent },
    },
  ],
  [
    "Function Graph",
    {
      create() {
        return new FunctionGraphComponent();
      },
      isGoodForWrapping: false,
      howToGenerate: { type: "class", class: FunctionGraphComponent },
    },
  ],
  [
    "Static Image",
    {
      create() {
        return new SingleImageComponent();
      },
      isGoodForWrapping: false,
      howToGenerate: { type: "class", class: SingleImageComponent },
    },
  ],
  [
    "Video Clip",
    {
      create() {
        return new VideoClipComponent();
      },
      isGoodForWrapping: false,
      howToGenerate: { type: "class", class: VideoClipComponent },
    },
  ],
  [
    "Multi Text",
    {
      create() {
        return new MultiTextComponent();
      },
      description:
        "A way to draw fancy text.  " +
        "This can contain multiple TextFormat and TextSpan components as children.",
      isGoodForWrapping: false,
      howToGenerate: { type: "class", class: MultiTextComponent },
    },
  ],
  [
    "Text Span",
    {
      create() {
        return new TextSpanComponent();
      },
      description:
        "Text to display in a MultiText component.  " +
        "This should be a descendant of a MultiText component.",
      isGoodForWrapping: false,
      howToGenerate: { type: "class", class: TextSpanComponent },
    },
  ],
  [
    "Text Format",
    {
      create() {
        return new TextFormatComponent();
      },
      description:
        "How to format text.  " +
        "This should be a child of a MultiText component.",
      isGoodForWrapping: false,
      hiddenByDefault: true,
      howToGenerate: { type: "class", class: TextFormatComponent },
    },
  ],
  [
    "Halftone Shadow",
    {
      create() {
        return new HalftoneShadowComponent();
      },
      isGoodForWrapping: true,
      howToGenerate: { type: "class", class: HalftoneShadowComponent },
    },
  ],
]);

if (false) {
  //test
  // This is a work in progress.
  // I want to make the inputs to the constructors of the components more similar,
  // for the sake of the code generator in the "Save Diffs" button.
  // In particular, Showable.description is read only and must be set in the constructor.
  // This won't be difficult, but I'm still considering some design decision.
  new PaddingComponent({ description: "test" });
  new FrameCounter({ description: "test" });
  new InSeriesComponent({ description: "test" });
  new SlideLeftTransition({ description: "test" });
  new CrossFadeTransition({ description: "test" });
  new HoldPreviousTransition({ description: "test" });
  new HoldNextTransition({ description: "test" });
  new SlideComponent({ description: "test" });
  new TextComponent({ description: "test" });
  new TraditionalTextComponent({ description: "test" });
  new RectangleComponent({ description: "test" });
  new ArrowComponent({ description: "test" });
  // @ts-expect-error: TODO make this work.
  new FunctionGraphComponent({ description: "test" });
  // @ts-expect-error: TODO make this work.
  new SingleImageComponent({ description: "test" });
  new MultiTextComponent({ description: "test" });
  // @ts-expect-error: TODO make this work.
  new TextSpanComponent({ description: "test" });
  new TextFormatComponent({ description: "test" });
  new HalftoneShadowComponent({ description: "test" });
}

/**
 * The registry keys the Visual Editor should offer, in display order.
 *
 * Starts from every registry entry that isn't {@link ComponentRegistryEntry.hiddenByDefault};
 * for "wrap", only those that are {@link ComponentRegistryEntry.isGoodForWrapping}.  Then the
 * parent adjusts the list through `replaceableComponents.customizeComponentChoices`.
 *
 * Read the registry each time: videos may add entries at runtime.
 *
 * @param parent For "insert", the component that will receive the new child.  For "wrap", the
 * current parent of the component being wrapped.
 */
export function componentChoices(
  parent: Showable,
  purpose: "insert" | "wrap",
): string[] {
  const choices = [...componentRegistry]
    .filter(
      ([, entry]) =>
        !entry.hiddenByDefault &&
        (purpose === "insert" || entry.isGoodForWrapping),
    )
    .map(([key]) => key);
  parent.replaceableComponents?.customizeComponentChoices?.(
    choices,
    purpose,
    componentRegistry,
  );
  return [...new Set(choices)].filter((key) => componentRegistry.has(key));
}
