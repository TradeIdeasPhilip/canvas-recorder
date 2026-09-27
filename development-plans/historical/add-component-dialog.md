# How to Add a new Component

The current GUI for this at the bottom of the top right part of the screen.
There is a `<select>` listing all of the components in the registry.
And there is an "+ Add" button that is enabled when the selected component allows replaceable children.

The `<select>` gets recreated on a regular basis, but we go out of our way to try to keep the currently selected value, to hide the fact that we are redrawing things.

## Replace `<select>` with Dialog Box

We've done this successfully in other dialog boxes.
See the font selector or the "load" button on the top right side of the screen for good examples.
This allows us to update the screen as the user is pursuing the options.
In this case it allows us to display an English description of each component.

Replace the `<select>` with a custom control like we use elsewhere.
Then we can update the description as the user clicks or uses the arrow keys.

Uses the standard "OK" and "Cancel" buttons.

## Add "Wrap" Button

Rename the current "+ Add" button to "Insert New Child".
Add a second button next to it labeled "Wrap Component".

"Insert New Child" continues to be enabled exactly when the selected component supports removable children.
"Wrap Component" should be enabled exactly when the selected component is a removable child of its parent.
That rule already covers the root component: it isn't a removable child of anything, so Wrap is disabled.

One more rule: Wrap is also disabled when the selected component is a transition or a Text Format.
Those only work *directly* inside one kind of parent (an In Series, a Multi Text).
Wrapping one would put a new component between it and that parent, which breaks it.
The button's tooltip says why it is disabled.

### Dialog Box

The window should say "Insert New Child" or "Wrap Component".

## The Parent Can Customize the List

Transition objects only make sense inside of an in series component.
These should be hidden by default but available as direct children of an in series component.
The in series component needs to add them to the top of the list.

The multi text component is a little more complicated.
A formatting object only makes sense as a direct child of a multi text component.
A text span object can exist anywhere but it makes a lot of sense as a direct child of a multi text.
So text span to the top of the list when adding to a multi text.

Most parents do nothing.

## References

The interfaces:

- `ComponentRegistryEntry` in `src/slide-components/registry.ts`:
  - `hiddenByDefault` — not offered in either dialog unless the parent adds it back.
    Set on the four transitions and on Text Format.
    Because these depend on their parent, they also can't be wrapped.
  - `isGoodForWrapping` — offered in the Wrap dialog.
    `create()` must return something with `replaceableComponents`.
  - `isTransition` — how In Series finds its transitions.
- `componentChoices(parent, purpose)` in `registry.ts` builds each dialog's list.
  It reads the registry every time, because videos can add entries at runtime.
- `Showable.replaceableComponents.customizeComponentChoices(choices, purpose, registry)` in
  `src/showable.ts` is the parent's hook.
  Subclasses of `InParallelComponent` override the protected method of the same name.
  The registry is passed in rather than imported, because `registry.ts` imports the component
  classes, so importing it back would be circular.
  - `InSeriesComponent`: transitions first, when inserting.
  - `MultiTextComponent`: Text Span, then Text Format, first, when inserting.

The GUI:

- `dev/component-picker.ts` — `pickComponent()`, the dialog.
  It remembers the last choice for Insert and for Wrap separately, in `localStorage`.
- `dev/canvas-recorder.ts` — the two buttons, in `updateComponentEditor()`.
  `findReplaceableParent()` locates the parent for Wrap.

Wrapping swaps the new component into the child's slot first, then moves the child inside it.
All four wrappers (Padding, In Series, Slide, Halftone Shadow) take their duration from their
children, so wrapping doesn't move anything on the timeline.

## Status 9/26/2026

Implemented as described above.
