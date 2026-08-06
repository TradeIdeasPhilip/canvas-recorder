# Timeline Editor

I want to build a proper timeline in this project.

I want the ability to reorder elements of the script visually.
I want to see all elements on the timeline, while I'm making my adjustments.
I want to link items on the timeline, so moving one item will automatically move other items.

## Standard Solutions

CapCut and similar video editors let me drop an animated gif (a "sticker") or a video on a timeline, then adjust its speed and size and position.
I like the idea but there are problems with this.
The biggest problem is that the items in the timeline must be pre-rendered.

If I change the size of a video clip, CapCut will resize each frame, but it will not be pixel perfect.
If I adjust the speed of a video clip, CapCut will drop or duplicate frames.
This works, but it limits quality.

One workaround is to guess the size and speed the first time, then rerender the scene later when I know the exact values.
At best this is slow and painful.
What if I have to do this multiple times?
It discourages my creativity and makes me stop when it's "good enough" instead of working until it's perfect.
What if I want a video to change size or shape while it's playing?
This is easy this canvas-recorder project, but it would be almost impossible to keep the pixel perfect quality in CapCut.

In the best cases I want to go back and forth.
I want to change details of the individual scenes and I want to change the overall script and I want to go back and forth between those.
Common case: I start with the voiceover and when I add graphics I don't like the timing.
Or vice versa.
Neither completely depends on the other.
I go back and forth tweaking things until everything is perfect or I get frustrated and give up.

## My Working Solutions

So far we've been adding a lot of standard video editor components into this project.
I can make a variety of adjustments and see instant feedback.
I can drag points on the screen to adjust the size and position of elements.
I can create keyframes and I can easily jump around in the video to see the results.
I call this the Visual Editor.

This is all a good start.
It works well and it's easy to add more of the same.

What's missing is the ability to make whole scenes appear and disappear at specific times.
The `duration` of a scene is set in TypeScript and typically treated as immutable.

## Prototypes

We [currently](https://github.com/TradeIdeasPhilip/canvas-recorder/commit/cf52fae9848051bb6f22fdaffc1e5290b6370131) have interesting prototypes of a timeline editor.

The prototype are in [some5.ts](../src/some5/some5.ts).
If this works out well, I'll make the timeline feature available to the entire program.

I'm doing some _real_ work there on a _real_ video that I want to produce.
The script so far looks pretty good, but I have more to add.
I might want to add some small tweaks to the existing part, but while we're working on these prototypes I want everything preserved exactly as is.

[main-timeline-prototype.md](main-timeline-prototype.md)

### Parallel Combination

The slide labeled "Parallel Combination" has a collection of smaller pieces (sometimes called "slides" or "scenes").
It includes some TypeScript code to select the speed and order of every scene.
It includes transitions between the scenes.

This creates good results, but it is a slow and painful process.
And it is hard to adjust earlier work without messing up later work.

The Visual Editor provides access to the animation code.
But it's only good for debugging.
When I change one aspect of the animation, nothing changes with it.

Currently the Visual Editors gives "low level" access to things like the speed of each slide, when each slide starts, and when the transition starts and end.
Changing one of these never makes any "ripple" changes.

If I change the TypeScript code then all of the scenes and transitions will ripple.
But I don't have good tools to visualize the changes.
And that code only affects the main scenes and transitions.
The sound and the callouts all must be manually updated to match those changes.
(See `moreToShow` for the list of arrows and callouts.)
Yuck!

### Main Timeline

The slide labeled "Main Timeline" contains the next prototype.
It contains a lot of the standard timeline features I need.
It's a good start.
My biggest complaint is that the code is complicated and I want to break it into smaller pieces.

This lets me split a scene into multiple pieces.
Then I can configure each piece separately.
E.g. I can adjust the speed of a scene in the middle.
We already have _schedules_ that can do a lot of what I needed, but splitting up the scenes made it easier to add all the tools that I want.

This prototype includes sound clips.
The sound clips can be linked to the video clips.
Moving a video clip will move the sound clip with it.

Sound clips are anchored to a specific part of the video clip.
If you extend or cut or adjust the speed of a video clip the sound will remain attached to the correct point.
It works very well.

Callouts are not yet implemented.
Saving is not yet implemented.
Sounds can not yet be linked to each other.

## New Plan

Split up the work that we are doing in the "Main Timeline".

Sounds are already relative to a `Showable` objects.
The start time is the number of milliseconds after the Showable object starts.
That's often good enough.
The Visual Editor should be able to edit these the same way the "Main Timeline" prototype does that now, but without any additional linking.

We already have ~~`Showable.components`~~ `Showable.children` and `Showable.fixedComponents`.
We need a way to make some of these visible on the timeline.
The Visual Editor will also contain \<input> fields to do the same thing.
This will be simpler than the "Main Timeline"

### Sound

- really don't need any special options
  - all sounds are editable
  - if `Showable.soundClips` is an array then the user can add, delete move ,etc
- This new editable view of sounds will replace the current waveform display.

rehoming!!!

### Callouts

- These can be simpler than the "Main Timeline" example.
- Just use a PaddingComponent.
- It was made (in part) for this purpose.

If the user wants to attach an arrow to another Showable object,
Start by asking if that object is already in a PaddingComponent.
If not, create one.
Mostly this is all the user's responsibility.
But this only makes sense in the context of an "in parallel" component, and common usage for that component is for all the children to be wrapped in a PaddingComponent, used to schedule it.
(Some components, like the title of the slide, might appear the entire time and not need "padding", but at the same time it wouldn't make sense to attach an arrow to a component that plays the entire time.)

The important thing is that anchoring comes for free.
When you change the start time of the "primary" component by modifying the initial padding, that will automatically drag the "callout" children, too.
Everything is anchored to its parent!

## Notes from Another Editor

**Status**:
These notes were in a different document.
They may be a little out of date.
And there's some overlap with other sections, but also so new stuff.

Timeline proposal:
Draw this on top of the same timeline that shows other things.
Let's focus on the space where we are currently drawing the waveform for the selected chapter.

Leave the timeline prototypes in place.
I will want to reference the work I did there while creating stuff with the new tools.
I'm not expecting any problems; we purposely implemented a lot in some5.ts instead of the shared code to keep it out of the way.

Issue, what if we want to drag past end of the timeline, making the timeline bigger? Nasty. Let’s avoid it for now, don’t allow dragging past the end. If it we come back to it, do it cautiously. I’ve seen this done wrong too many times.

Every component with a setDuration or a minDuration scalar property appears on the timeline. There will be some sort of marker at the end of the item and the user can drag that marker to change the duration. The visual editor will clamp the values to be reasonable, y is fixed, x is clamped between 0 and what it thinks is a reasonable upper bound (I’m being purposely vague, it’s just a constant or the result of calling a function.). At the same time the component may do its own clamping (or other changes) so the Visual Editor needs to read back `duration` and redraw the rectangle representing the item based on its reported duration, which might not match the position of the marker. When the user releases the mouse or hits escape, if this is a `duration` component, the marker will snap back to the reported duration. If this is a minDuration component, the marker might never actually match the duration.

PaddingComponent will be treated like a “wrapper” in the previous prototypes. When the visual editor sees a PaddingComponent with at least one child, it adds the child to the timeline. (The child might be on the timeline for multiple reasons. The rectangle on the timeline should be shared, never more than one per Component.) Draw a marker similar to the duration/minDuration marker, but on the front of the item. Dragging that will change the start time property of the padding component. We are not expecting any negotiations, like we have with duration, just set the value as assume the change took hold. Initially just clamp the values to match the size of the timeline. We’ll probably get smarter eventually, so make “clampTo” a function that will be easy to replace. Note that negative values of the start time are explicitly allowed.

Eventually things like extending and splitting can be added to the timeline. Certain classes would export the appropriate methods and the timeline would add the corresponding markers. But let’s start here.

Rehoming?

## Serious Plan

After a lot of work on the pieces (new classes in slide-components.ts and the Visual Editor now supports setDuration) and some productive prototypes, I think we're ready to do some work on the final product.

Major Pieces:

- Display relevant children on the timeline.
  - Rules described above include anything with a setDuration or minDuration scalar property
  - And anything wrapped in a PaddingComponent
  - More to be added, but that's all for today.
  - Draggable markers on the children.
  - _Automatically_ use different rows to display items without overlapping.
- Sounds
  - all sound clips are editable.
  - if `Showable.soundClips` is an array then the user can add, delete move ,etc
  - This new editable view of sounds will replace the current waveform display.
  - Rehoming -- When _moving_ sounds from one owner to another there should be an option to keep the current global position.
  - The "Main Timeline" prototype does a good job with sounds.

Don't worry about splitting clips, stretching clips, or anchoring to a specific part of a clip.
We will return to that at some time in the future.

### Detailed Plan

#### Part 1: Timeline Display (replaces waveform canvas)

**What we're replacing.**
The `#waveformCanvas` element goes away. In its place we render a new timeline canvas
(call it `#timelineCanvas`) that sits in the same spot at the top of the Visual Editor panel.

**Which children appear as blocks.**
We look at `selectable.children` for the currently selected chapter.
A child gets a block on the timeline when any of the following is true:

| Condition | Block extent | Draggable edges |
|-----------|-------------|-----------------|
| `child.setDuration !== undefined` | `[child.start, child.start + child.duration]` | Right only — calls `child.setDuration(newMs)` |
| child has a `minDuration` scalar | same | Right only — sets `scalar.value`; the block may extend *past* the marker if actual duration > minDuration |
| `child instanceof PaddingComponent` with ≥1 sub-child | `[padding.initialTimeScalar.value, padding.initialTimeScalar.value + primaryChild.duration]` | Left — sets `padding.initialTimeScalar.value`; right — if primary child has `setDuration`, calls it; otherwise fixed |

**Shared-block rule.**
A PaddingComponent's primary child might *also* qualify via `setDuration`.
In that case draw exactly **one** block with both a left marker and a right marker — never two overlapping blocks for the same underlying component.

**Row layout.**
Greedy assignment: iterate children left-to-right by start time and place each block in the first row where it does not overlap an already-placed block.
Sound clips (see Part 2) always go in a dedicated bottom row, separate from component blocks.
The canvas height grows automatically to accommodate however many rows are needed.

**Dragging behavior — right markers (`setDuration` / `minDuration`).**
On every `mousemove` event: call `setDuration` (or set the scalar) with the x-position mapped to milliseconds.
On `mouseup`: read back `child.duration` and snap the marker to the actual value — the component may clamp internally.
The `minDuration` marker stays at `scalar.value`; draw the block at the actual duration so the user can see the gap.

**Dragging behavior — left markers (PaddingComponent).**
On every `mousemove` event: set `padding.initialTimeScalar.value` directly.
Clamp to `[0, selectable.duration]` for now (make the clamp a small replaceable helper so we can loosen it later — note that negative values are explicitly legal and will be supported in a future iteration).
No read-back / negotiation needed; just set and assume it took hold.

**Interaction with the component list.**
Clicking a block selects that child in the component editor (sets `selectedSlideChild`, calls `updateScheduleEditor`) — the same as clicking its row in the component tree.
The selected block is visually highlighted.

**Time cursor.**
A thin vertical line tracks `currentTimeInMs` during playback.
Clicking anywhere on the canvas seeks to that time (same behavior as the waveform canvas today).
Zoom and pan controls are modelled after the existing waveform display.

---

#### Part 2: Sound Clip Editor

**Making `soundClips` mutable.**
Currently `Showable.soundClips` is `readonly`.
We need mutations to trigger audio rebuilds and JSON serialization.
Plan: change the field to a plain mutable array and mark changes with `markDirty()` after every mutation.
`markDirty()` already causes the sound player to rebuild — it handles rapid concurrent calls gracefully.
No new notification infrastructure is required.

**GUI section in the Visual Editor.**
When `selectable.soundClips !== undefined`, show a new "Sound Clips" section below the component tree.
Each clip gets a row of inputs:

- notes (text, maps to `clip.notes`)
- source URL (text, maps to `clip.source`)
- Start in scene (number, ms, maps to `clip.startMsIntoScene`)
- Start in clip (number, ms, maps to `clip.startMsIntoClip`)
- Length (number, ms, maps to `clip.lengthMs`)

Buttons: **Add** (appends a blank clip), **Delete** per clip, **↑** / **↓** per clip.
All changes call `markDirty()`.

**Clips on the timeline.**
Each sound clip gets a block in the dedicated sound row:
x-start = `clip.startMsIntoScene`, width = `clip.lengthMs ?? 0`.
The block body is draggable horizontally — dragging changes `clip.startMsIntoScene` and calls `markDirty()`.
The right edge is draggable — changes `clip.lengthMs` and calls `markDirty()`.
The label is `clip.notes ?? clip.source`.

**Serialization.**
Add `soundClips?: SoundClip[]` to `JsonFileEntry`.
Serialize and deserialize alongside scalars and schedules in the existing JSON save/load code.

**Rehoming.**
A "Move to…" button on each clip opens a dropdown of all chapters in the chapter list.
On confirm, compute `newStartMsIntoScene = clip.startMsIntoScene + sourceChapterGlobalStart - targetChapterGlobalStart` so the clip plays at the same wall-clock time.
Remove the clip from the source chapter's `soundClips` array and push it to the target's.
Call `markDirty()` on both.

---

#### Out of scope (for now)

- Splitting a scene at the current time
- Stretching / speed-changing a clip
- Anchoring a sound clip to a specific progress point within a component
- Auto-scrolling while dragging past the canvas edge
- Linking sounds to each other

---

### Test Checklist

**Timeline display — blocks**

1. Open a chapter whose `children` include an item with `setDuration`.
   Verify a block appears at the correct x-position and width.
2. Drag the right marker of a `setDuration` block leftward and rightward.
   Verify the duration input in the component list stays in sync during the drag.
   Release; verify the marker snaps to `child.duration` (in case the component clamped the value).
3. Open a chapter with a child that has a `minDuration` scalar.
   Verify the drag marker sits at `minDuration` but the block extends to `child.duration` when they differ.
4. Open a chapter with `PaddingComponent`-wrapped children.
   Verify each one shows a block positioned at `initialTimeScalar` with a left drag handle.
5. Drag the left marker of a PaddingComponent block.
   Verify `initialTimeScalar` updates and the block moves accordingly.
6. Open a chapter where a PaddingComponent's primary child also has `setDuration`.
   Verify exactly **one** block appears, with both a left and a right drag handle.
7. Arrange several children whose time ranges overlap.
   Verify the auto-row layout places them on separate rows without visual overlap.
8. Click a block on the timeline.
   Verify the component editor highlights the corresponding child and the schedule editor shows that child's schedules.
9. Verify the time cursor moves during playback.
10. Click the timeline background (not a block) at a given time position.
    Verify playback seeks to that position.

**Sound clip editor — list GUI**

11. Open a chapter with `soundClips` defined.
    Verify the Sound Clips section appears with the correct number of rows and pre-filled field values.
12. Edit `startMsIntoScene` in the text input.
    Verify the audio output updates (sound player rebuilds within a few seconds of the change).
13. Click **Add**.
    Verify a new blank clip row appears at the end of the list.
14. Click **Delete** on a clip.
    Verify the row disappears and audio updates.
15. Click **↑** on a clip that is not the first.
    Verify it swaps with the clip above it.

**Sound clip editor — timeline blocks**

16. Verify each `soundClip` appears as a block in the dedicated sound row of the timeline, at the correct x-position and width.
17. Drag a sound clip block horizontally.
    Verify `startMsIntoScene` updates live and the `startMsIntoScene` input field stays in sync.
18. Drag the right edge of a sound clip block.
    Verify `lengthMs` updates and the block widens/narrows.

**Serialization**

19. Make edits to both component durations and sound clips.
    Save to JSON. Reload the page and load that JSON file.
    Verify all edits are restored exactly.
20. Verify that a chapter with no `soundClips` property shows no Sound Clips section.

**Rehoming**

21. With two chapters open, use "Move to…" on a sound clip in chapter A, choosing chapter B.
    Verify the clip disappears from chapter A's list and appears in chapter B's list.
    Verify `clip.startMsIntoScene` in chapter B is adjusted so the clip plays at the same global time.
    Verify audio in chapter A no longer includes the clip, and audio in chapter B now does.

**Edge cases**

22. Chapter with no children meeting any display criteria: timeline shows only the time cursor, no blocks, no rows.
23. PaddingComponent with `initialTimeScalar = 0` and `primaryChild.duration = 0`: a zero-width block appears at x = 0 (degenerate but should not crash).
24. Drag a left (PaddingComponent) marker past the right edge of the timeline.
    Verify it clamps at `selectable.duration` and does not crash.
