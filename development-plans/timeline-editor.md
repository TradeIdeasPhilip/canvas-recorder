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
The Visual Editor should be able to edit these the same way the "Main Timeline" prototype does that now, but without an additional linking.

We already have `Showable.components` and `Showable.fixedComponents`.
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
- Som
