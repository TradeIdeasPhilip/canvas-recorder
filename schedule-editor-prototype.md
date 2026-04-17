# Schedule Editor Prototype

Let's work toward "## Schedules and Interpolation" in [./instant-startup.md](./instant-startup.md).

Let's start with a simple GUI that we can attach to schedule objects.

Full prototype mode.
Let's try things out to see what we like.
Let's not worry too much about future things like how to save and load these values, that will only get in the way right now.

## Current Status

### Done
- `ScheduleInfo` type in `showable.ts`: discriminated union on `type` ("string" | "color" | "number" | "rectangle" | "point"), each with a mutable `Keyframe<T>[]` schedule (editor can push/splice) and a `description`.
- `schedules?: readonly ScheduleInfo[]` added to `Selectable`.
- `interpolateColors(time, keyframes)` — time-based, replacing the old signature.
- Old `interpolateColors` renamed `interpolateColorsEqualWidths` to avoid confusion.
- `interpolateRects` and `interpolatePoints` implemented (lerp each field).
- Basic schedule editor in `canvas-recorder.html` / `dev/canvas-recorder.ts`:
  - "Show Editor" checkbox, disabled when the selected section has no schedules.
  - Color picker (`<input type="color">`) — fires on every drag, not just commit.
  - Number inputs for numbers, text input for strings.
  - x/y inputs for points; x/y/width/height for rectangles.
  - Ease dropdown (linear / easeIn / easeOut / hold) per keyframe gap; omitted on the last row.
  - Edits mutate keyframes in place; canvas redraws immediately.
- `slide2ColorSchedule` and `slide2RectSchedule` wired to `slide2Base.schedules`; rectangle drawn via `interpolateRects`.
- Three-state canvas model for rect keyframes:
  - **Normal** (default): row visible in table only, nothing on canvas.
  - **View** (👁 toggle per row): semi-transparent blue fill + outline drawn on canvas behind handles.
  - **Edit** (✎ toggle per row, at most one active at a time): red outline + 5 drag handles (tl, tr, bl, br, center).
  - Dragging a handle mutates the keyframe value in place; number inputs stay in sync via `markerSyncCallbacks`.
  - All canvas state (editing, viewing, dragging) cleared when the section selection changes.

### Next
- Normalize rectangles: dragging a corner past the opposite edge should flip the anchor, not produce negative width/height.
- Shift-drag to lock aspect ratio on rectangle corners.
- Edit keyframe times: the time cell is currently display-only; it should be an `<input>` with a "← now" button.
- Add / delete keyframes: 🗑 button per row (disabled when only one remains); an "add at current time" button in the section header.
- Sort button in section header to reorder rows after time edits.
- Timeline strip: show keyframe times as draggable markers on a horizontal bar.
- Wire more schedules: `slide5Base.startingPosition` is a natural next candidate.
- Wire more schedules: `slide5Base.startingPosition` is a natural next candidate (already stubbed with a TODO comment).

## Schedule

A schedule is a list of Keyframe<T> objects.
This is a different type from the built in Keyframe type.
However, my API was *inspired by* the standard Element.animate() API and it's Keyframe type.

interpolate.ts has all the code for manipulating schedules.
And see binary-search.ts if you need to insert items in a random order.

I say `Keyframes` in the code a lot where my newer code likes the term "schedule".

`Keyframes` is readonly because nothing in interpolate.ts will modify a schedule.
But in the the bulk of the program I find it convenient to use a non-read only array.
Maybe we need a `Schedule` type that is a non-read-only array of keyframes?

There is no notification associated with a schedule change.
On every frame the rendering code goes back to the schedule.
None of the rendering is cached.
(I often cache pure functions but I never try to cache screen output because that *never* works well.)

## Data types

A keyframe / schedule can be associated with any type.
Typically I use a single number (line width, font size, x offset, etc, etc) or a color.
You can even group things by making the type an array or object.

I want to start with rectangles and points.
I haven't used these yet in a schedule.
But they will integrate very well with the gui because you can drag right on the screen and see your results immediately.
Notice the `ReadOnlyRect` and `RealSvgRect` types in my code, available if needed.

Numbers should be in an \<input>.
I'm not yet providing much context to do any more than add a label.

The standard HTML color editor is fine.
Grab the callback for every update, not just the commit!
It's given me amazing results in other projects where I had it hooked up to a live gui.

Points and rectangles should be editable as numbers or by dragging.
Both interfaces are locked together.
Points and rectangles are **not** constrained to the viewBox.

When I hold down the shift key while dragging a rectangle corner, that should keep the current aspect ratio.
(I think that's the way it's normally done.)
Otherwise (and by default) we are not constraining the aspect ratio.
The \<input> part of the GUI does **not** include any support for locking the aspect ratio.

In the code I use panAndZoom() from transforms.ts to deal with aspect ratio mismatches.
It works well.
Don't put any constraints on the user.
The user can see his results immediately and can decide if he likes the results or not.
This lay can mostly ignore aspect ratio.

This new code will *normalize* the rectangle.
The user doesn't have to start at the top left corner.
As you drag a corner might change from the left most to the right most.
The user just drags, the main program just gets a normalized rectangle, this new code removes any friction.

## Easing

We've discussed lots of options in the past.
For now lets focus on a small fixed set: linear, easeIn, easeOut, and end.

## Discrete elements

I find the way CSS animations handle discrete values very confusing and clunky and error prone.

In my code I created discreteKeyframes().
It's basically an alternative to interpolated keyframes.
You have to pick one or the other.

Does the user chose between discrete vs interpolated keyframes?
Or is that based on the property?
In css the user decides, but some properties are only available in discrete mode.
I have no idea what I want, I haven't really thought about it, I just wanted to make sure this didn't get lost.

## CapCut

It seems like CapCut has a common and reasonable framework for these types of decisions.
We can steal the high level structure from here.

CapCut has 3 relevant pieces of GUI:
* There is some sort of editor appropriate for each property.
  * It knows what is object is selected, this would conform to a Showable.
  * There are often a list of properties related to this object all listed one on top of the next (`Showable.schedules`).
  * There are buttons to go to the next or previous keyframe for this property, and to delete the current keyframe.
  * Those same buttons double as status indicators when they are disabled.
* The timeline shows where the keyframes are.
  * You can drag them on the time line to change their times.
* The screen shows the results of your changes immediately.
  * When appropriate you can drag things on the screen to rotate them.

It's not perfect but it seems like a good place to get started.

## Readonly vs User configurable

Do the rectangles and points need to be `readonly`?
I usually like `readonly` and use it as much as reasonable in my code.
But the schedule / array holding the object is explicitly not read only.

Actually there's a middle layer.
A schedule is an array of keyframe objects, and those keyframe point to the rect or point or whatever the datatype is.
Should the keyframes be read only?

Versions of this will come up a lot as we add more GUI control to things that were done in the one time setup parts of my code.

### How to represent a single value?

I want to follow the CapCut model where every property can be attached to a schedule.
So property editors only exist in the schedule editor.

CapCut says that 0 keyframes in the list means a single value.
But where would you store that single value?
You'd need a new place.

I always require at least one keyframe in my list to read a value.
I *hold* the first value in the list all the way back to -Infinity.
And I *hold* the last value in the last all the way forward to +Infinity.
So setting a single value means that all values

Note:  In my *code* I often create empty schedules to start with.
I let a different part of the code fill that in.
(A beautiful interface, perfect separation of concerns.)
And it's easier for that second piece of code to start from an empty array.
However, I am careful to always fill in at least one value before trying to use the schedule.

The user will be working in a different model.
He will be viewing the result while he is editing the schedule.
So we have to always have at least one entry.

Is this a problem?
I'm probably overthinking this.
We could set the time of that one keyframe to be plus or minus Infinity to denote special states.
I'm definitely overthinking this.

## What does Keyframe<T>.time mean?

interpolate.ts allows you to use the time field any way you want.
It's just a number that we sort and search on.

In a lot of places an API will accept `progress`.
That always eas a value between 0 and 1.
This can be useful in some places, but not here.
When I'm working on the timeline and schedules and and setting up animations, `Keyframe<T>.time` is always paired with `ShowOptions.timeInMs`.

## Separate Window

The sound editor shows how easily we can share config info between apps.
The same trick should work here.
That used window.localStorage() for all of the storage and notification needs.

It may be too early to start thinking about this.
But it might make sense for parts of this editor to be in their own window / webpage.
That would make a lot of things easier.
E.g. why should I worry about the layout when the user can just use browser windows and tabs and virtual desktops to organize the data.

This would allow much larger displays.
This would allow lots of different types of displays, maybe that one *.html file that I only use in very special cases and most people don't need to see it, rather than one big GUI with every possible option in it.
This would allow for different types of GUI tools; I'm usually afraid of adding any frameworks, but tools could be isolated.

I'm imagining four browser windows, two showing the visual for my movie at different times, and two different schedule editors, allowing me to edit the data in different ways and instantly see the results in different ways.

No rush, but whenever the current html file seems constraining we can create another.

## Appendix Ⅰ

New thoughts that I haven't had time to integrate with the rest of the document.
Also, I want to focus on this now.

We can currently edit values in keyframes.
We need a way to edit the time in a keyframe.
And we need a way to add and delete keyframes.

Note:  ±Infinity is explicitly allowed for Keyframe.time.
It isn't *required* because the first and last keyframe are automatically extended to ±Infinity.
But ±Infinity work with the rest of the code, and they are useful for the normal reasons, and I think I have used them in the code already.

NaN is explicitly forbidden for Keyframe.time.
It causes ugly problems to sort and search algorithms.
The GUI should never put a NaN into there, even on error.
It would be safe to assume that no one else has put a NaN in there.

There **should** always be at least one keyframe per schedule.
Key keyframe will have a "🗑️" (delete) button, and it must be disabled if it is the only frame in the schedule.
That said, the editor must **not** fail if the list is empty.
In particular, there should be button in the header for each section, so the user can fix the situation.
(An empty schedule will cause the display to fail badly, probably throw an exception.
So we don't have to be clever or graceful.
We just need to fix the problem.)

Keeping things in order:
The array should **always** be in a valid state.
If you need to change a time, the safest thing to do would be to delete the keyframe, change the time, then readd the keyframe.
It would be jarring to rearrange the rows as a person was typing in an \<input> in a row.
Let's start simple for now:
The header also has a sort button which will rearrange the rows on the screen to match the array.

The row for each keyframe will include the time, which can be edited through an \<input>.  (Currently we are displaying it, but we need to edit it)
There's also a button to copy the currently displayed time into this field (like I've done elsewhere on the page).

Keyframes representing rectangles and points will exist in one of three states.
* Normal / default -- show nothing on the canvas.  Only visible in the table.
* Edit -- **At most one** keyframe can be in edit mode at a time. Show the editor on the canvas.  The current rectangle editor display is good for now.  But it was confusing when two keyframes were both visible at the same time.
* View -- Make this visible on the canvas, but not editable.  Note:  The balls for the rectangles were sometimes overlapping and not all visible and that was confusing.  For view mode, please use the outline of a rectangle or fill rectangle with a partially transparent color.  (And make sure the edit markers are on top of these rectangles!)  Optimize the experience for the case where only a few things are visible at one, fewer than myRainbow.length.