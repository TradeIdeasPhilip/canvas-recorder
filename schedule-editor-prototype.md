# Schedule Editor Prototype

Let's work toward "## Schedules and Interpolation" in [./instant-startup.md](./instant-startup.md).

Let's start with a simple GUI that we can attach to schedule objects.

Full prototype mode.
Let's try things out to see what we like.
Let's not worry too much about future things like how to save and load these values, that will only get in the way right now.

## Current Status

### Done
- `ScheduleInfo` type in `showable.ts`: discriminated union on `type` ("string" | "color" | "number" | "rectangle" | "point"), each with a `readonly Keyframe<T>[]` schedule and a `description`.
- `schedules?: readonly ScheduleInfo[]` added to `Selectable`.
- `interpolateColors(time, keyframes)` — time-based, replacing the old signature.
- Old `interpolateColors` renamed `interpolateColorsEqualWidths` to avoid confusion.
- `interpolateRects` and `interpolatePoints` implemented (lerp each field).
- Basic schedule editor in `canvas-recorder.html` / `dev/canvas-recorder.ts`:
  - "Show Editor" checkbox, disabled when the selected section has no schedules.
  - Color picker (`<input type="color">`) — fires on every drag, not just commit.
  - Number inputs for numbers, text input for strings.
  - x/y inputs for points; x/y/width/height for rectangles.
  - Ease dropdown (linear / easeIn / easeOut / hold) per keyframe gap.
  - Edits mutate keyframes in place; canvas redraws immediately.
- `slide2ColorSchedule` wired to `slide2Base.schedules` as first live test.

### Next
- Ease column visual offset: the dropdown sits in the same row as the "from" keyframe, but it controls the gap *to* the next keyframe. The prototype doc asks for a half-row visual offset to make this clear. CSS `transform: translateY(50%)` on the ease cell, or an interleaved row layout, would do it.
- Dragging points and rectangles directly on the canvas (locked to number inputs).
  - Normalize rectangles so the user can drag any corner.
  - Shift-drag to lock aspect ratio on rectangles.
- Timeline strip: show keyframe positions as draggable markers, so times can be adjusted without editing numbers.
- Add / delete keyframes from the editor UI.
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

Note that easing refers to the time **between** two frames.
In code I often explicitly write "easeAfter" to clarify that the easing in this keyframe refers to the values in this keyframe and in the *next* keyframe.
Same meaning as "ease" has in most APIs, I'm just being more explicit.

Please do something similar in the editor.
If we have a \<table> listing one keyframe per row,
offset the ease column by one half row so it's clear that the easing is between two keyframes.
(or similar)

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