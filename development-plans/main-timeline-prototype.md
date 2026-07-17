# Main Timeline Prototype

We need a “main” timeline.
Deleting something or resizing something automatically moves everything later in the timeline, like the main timeline in CapCut (and others).
A.k.a. "ripple effect".
The first item starts at 0.
Each item starts exactly where the previous item ends.
The items are all Showable objects and the main timelines always displays exactly one of these items at a time.

The list of fixedComponents was a mistake.
I still like that feature and I want to use it in other places, but not for this purpose.
Instead of that we will have a list of showable objects that I can access by description, a registry of sorts.
These can be referenced just like we reference font names and text styles by name.
I.e. the description field of these objects will be stored in the JSON file and available in the Visual Editor as a string.

This timeline only needs two types of child objects.

Transition objects:
These will transition between the two slides on either side, like we do now.
If one of these is put at the beginning or end of the list, that’s an error.
We know how to deal with these types of errors:  same as MultiText referencing an invalid style, detect it in the object’s show() method and report using the same method as the text components use.
Otherwise show() calls the show methods of its two neighbors, with time set to 0 or 1 to freeze it at the appropriate place.
Make sure to check for an error to avoid a stack overflow!
Temporary errors are likely as we update the schedule.

Slide wrapper objects:
These will be simpler than our current slide wrapper objects.
Each one has a duration, which we can edit in various ways, not just a number.
Each one has a starting and ending progress.
Those are two static properties, not a continuous schedule.
Those can be edited as numbers *and* possibly in a more graphic way.
Each one refers to a specific slide.
This is a string and it is also static, not a schedule.
This should be a constrained string, as we know the list of slides in advance and they only change from TypeScript code changes.

These are initialized to look like they do now.
We make small adjustments to the code or we read the values from a json file.
Each slide will initially get 3 for these new slide wrapper objects.
The first one will have progress fixed at 0 and a duration copied from the constant we use now.
The second one will have progress go from 0 to 1 and a duration that matches the original.
The last one will have progress fixed at 1 and a duration copied from the constant we use now.
And we insert a transition object between each of those.
That initialization is done once, then we can modify it using the visual editor.

We only support linear progress!
That’s all I was planning to use.
It makes everything simpler.

What can you do with a transition object in the Visual Editor?
You can delete it.
You can move it to another part of the timeline.
You can insert a new one into the timeline.

What can you do with a slide wrapper object in the Visual Editor?
You can delete it.
You can duplicate it.
You can move it to another part of the timeline.
You can create new ones to add to the timeline.
You can split it at a given point, creating two objects.
Initially the two objects together will perform like the first, but you can edit them separately.
You can adjust the duration while keeping the progress values at the endpoints, effectively speeding up or slowing down the animation, while showing the same range of content.
You can extrapolate from one side or the other.
Tell the visual editor how much time to add and which end and it will be adjusted.

Let’s start with this.
We will still need to do linking, eventually.
But this is the base of the timeline.
We can set the times of these things without worrying about arrows or Voice overs or other outside objects.
Things in this “main timeline” only depend on other things in this timeline.
Other things can change because this changes, but only in that direction.

Let me clarify:
The “complete” timeline will be a directed tree.
The “main” timeline will be at the root of the tree.
All automatic updates will get pushed through the tree away from the root, toward the leaves.
However, a human will look at the total tree and make changes as he sees fit.

Please make me a *prototype* of this.
All the code should be in some5.ts.
This is why I added Showable.rootComponentEditor, a good place for prototypes.
We need to display the items horizontally, like a time line.  We need names on the timeline that might be cut off depending how much we zoom in.
I like how the zoom and pan GUI for the waveform display.
Let’s copy that for now.
Eventually these will all be linked together or displayed in a single control, but for this prototype just copy that.
I want to see time passing on this timeline.
I want to jump to the current when I click, just like in the waveform display.
(Again, these are temporary duplicates of the sound timeline)
I want to click on one and be given the opportunity to edit it.

This can be rough.
I want a straw man to build on.

# Updating and Linking

I’m trying to answer a related big picture question.  The Visual Editor is making it easier and easier to change things that used to be fixed.  I don’t have a plan for how to implement that cleanly.  I’m brainstorming and thinking out loud.  Please help.

The big question:  How do I notify listeners or changes and when and how granular?  I can imagine one big event that tells anyone who is listening that a change has been made, and a simple wrapper around that so it doesn’t fire more than once per event, or maybe not until the next animation frame callback.  We are building more and more complicated data that needs to be updated.  If I want to be able to link things in a useful way, we’ll have a tree of dependencies.

If I make the first scene one frame longer, that causes everything else in the project, almost the entire project, to rebuild itself.  And that’s not terrible, but is that the right design?  A lot of this code in is project was designed to be created just once.  A schedule is an efficient way to organize things if you only create it once.  Now I’m thinking that I have to rebuild a lot of schedules from scratch each time we make a change via the Visual Editor.

Sound is the perfect example.  I decided to make one big sound clip and to use the sound player as our main clock.  Mostly that works well.  But it means rebuilding everything every time we make any changes.  Some types of changes can be deferred; we respond to a Visual Editor change event by clearing a cache.  And some values are stored as relative values.  But, as designed, we have to rebuild the sound file from scratch any time any change is made.

More thoughts on sound:  Currently we only change sounds in the TypeScript code.  I want to add a GUI, but what I have now works surprisingly well.  It won’t scale, but currently the time for processing the sound clips on refresh is just under 200ms.  It’s noticeable, but not huge.  Honestly, this whole process with Vite and sessionStorage is working amazingly well.  Rebuilding and restarting and restoring my GUI state in 200ms is impressive to me.

Of course I want the ability to drag a sound clip.  What’s the GUI like for that?  I assume I can see the waveform display updating smoothly as I drag the clip across the timeline.  I’m going to want to line things up visually.  I don’t think I’m expecting the sound to change while I’m moving the clip.  The user will probably do this while the output is paused.  Either way, muting the sound or continuing the play the old sound is probably better than constant updates.  Even if constant updates were possible, it would probably sound horrible, like abusing a record or tape.

The good part, the sound player already had some efficiencies baked in.  You can fire a request to update the sound on every mouse event.  That code takes care of the asynchronous parts on its own.  That includes merging multiple requests to update while an update is already in progress.  But still, every time you change the time line you have to burn a lot of CPU cycles.

Maybe the sound player could add more checks.  It could automatically check if the list of sound clips has actually changed or not.  We’re still talking about rebuilding the entire tree of dependencies every mouse event, possibly more than once per animation frame.  Maybe that’s actually necessary???

Back to my big question.  When the Visual Editor changes something, how do we decide who to notify and how often and how specific to be?  Image I’m working on a part of my project that doesn’t have any sound.  Maybe I’m adjusting an animation clip that will eventually get sound, but doesn’t have it yet.  Every time I adjust the clip’s start time or play rate, that might update.

That’s just one example.  Do I deal with a lot of separate things or are there some patterns?  At a bare minimum I want to know what all the major issues will be.  I don’t want this to become a mess but I don’t know enough to make a good plan.  If I have one master “something changed” event, there’s a certain simplicity to that.  Will that cause other problems?  Am I worried about the order in which different listeners are called?

Regarding the timeline: You built a good prototype; the basics are there.  We’ll eventually merge it into the waveform display.  I think the code will be cleaner if we work out more details of this prototype first.  Really I have one big question.  How will we organize the timeline?

Does every item have a pointer back to a previous item?
Is the pointer a JavaScript pointer or a string that we look up at runtime, matching other parts of our GUI?
When do we check for cycles?
What performance concerns, if any, do we have?
Are we dealing with the graph only on Visual Editor events, or every time we render a frame.

I worry a lot about things we have to do on every frame.  Mostly because it’s annoying.  There’s a lot of code that I used to do once at startup, but now I have to do it every frame because it’s possible that someone changed it in the visual editor.  The performance issues aren’t terrible, but I have to think about this problem in a lot of places.  One common approach is to cache a lot of the work and only rebuild when we have to.  That’s clever and it solves the performance issues well in practice.  But it’s more code to write and think about.

I was originally worried about the performance of the screen updates.  That’s actually the easy part!  In practice most of my stuff runs in realtime, faster than the encoder can write a file.  And when frames run a little long, I seldom notice.  My simple system of just drawing a frame for the current time (assuming time is continuous) is very robust.  However, when I’m dragging a control across the screen, that’s when I’d notice a slow response.  That’s the rarer case, but we need to do the most optimization for the cases when someone is dragging the mouse.

Use case:
The user changes a value in the Visual Editor.
This component has a special listener so it can do other things when this value changes.
Among other things, this moves an *attachment point*.
We don't have these yet, but I need to coordinate between objects.
Maybe my code does something interesting about 5 seconds into the scene, but the exact time is computed based on inputs to the visual editor.
A voiceover clip is set to start 1 second before this event.
And an arrow will be drawn from 2 seconds before this event through 6 seconds after this event.
Even before we add interesting attachment points, the start of the clip can already change because of a ripple effect in the timeline.
So the custom code in the component will have to send a notification for lots of things to rebuild.

# Sounds on the Timeline

Let's make some *real* progress.
The "main timeline" currently plays all of the slides, just like the "Parallel Combination" does.
Let's copy the existing sounds, and add to the Visual Editor so I can make adjustments and add more sounds via a GUI.

The existing sound clips are are all good.
I plan to keep doing more of the same, adding sound clips and arrows and other callouts, adjusting the speed and other small details of the numbered slides.
Today I want a tool to help me finish this one video.

Eventually I still want a lot more, as described in the previous section, but let's focus on something simple and concrete for today.

## Basic Functionality

Now let's create a GUI for attaching sound clips to the timeline.
I want the ability to see all of the relevant numbers.
(e.g. the clip starts 123,456ms into the referenced sound file and plays for 1,200ms.)
And I want to edit these as HTML fields, just like we normally edit numbers in the Visual Editor.
And a string field for the name of the file (a url).

I also need a way to *see* the sound and video clips together.
A "normal" CapCut-style timeline with the video elements on one row and the sound clips on another row seems like a good place to start.
The *waveform display* is very *important* here.
The exact start and end times of the clip are a little bit random.
I try to leave a little padding on each side of the clip but the process is not consistent.

It should be easy to move either end of a sound clip or to move the entire clip.
(We just did something very similar with the ArrowComponent's editor!)
When I move just one end, I'm adding or removing some sound, but the unchanged part of the sound clip plays as the exact same time as before!
When the user moves the entire clip, the software only changes the `startMsIntoScene` property of the clip, not the `startMsIntoClip` or `lengthMs`.

And the changes should all save to the JSON file and the IndexedDB, like other details of our components.

And any changes should automatically get pushed back to the player, so it will play the right clips at the right time.
As discussed in the previous section, it shouldn't be hard to do a decent job.
Let's just try the obvious thing of sending all updates.
The sound class already automatically deals with updates coming in too quickly.
I suspect this will be sufficient for now.

## Attachment Points

I can imagine drawing a vertical line connecting each sound clip to a slide wrapper or a transition.
We are attaching one point in the sound clip to one point in the slide.

~~In some cases we might be making an attachment before or after an element is playing.
That might make the timeline GUI a little bit tricky.
But the rest of the code shouldn't care.~~
(This sounded interesting but it makes the GUI unnecessarily complicated, especially for a first draft!)

Sound clips can only be extended or clipped, never stretched or squeezed.
(CapCut lets me speed up or slow down a sound clip but it always sounds terrible, so let's just skip that.)
These operations leave the attachment point at the same place on the screen, and the same time in the video.

The slide wrappers and transitions can move, when previous things change.
The sound clip should automatically move with the item from the "main" timeline.
As discussed above, the main timeline never depends on anything but itself.
Other things will be linked to the main timeline.

Slide wrappers can be split.
If the split happens before an the attachment point, then the attached sound clip gets attached to the second part of the slide wrapper.
Otherwise it gets attached to the first part.
This should look like no change at all on the GUI.

Adjusting the end time of the slide wrapper doesn't affect any attachments.
Adjusting the start time of the slide wrapper means moving the content of this slide wrapper and that means moving the attached sound clips accordingly.

The user can also stretch or shrink a slide, adjusting its speed.
The program should do the math so the attachment point sticks to the same "progress" in the underlying slide.
All slides are required to move at a linear pace, so this should be trivial.

### Initial Attachment Points

When importing from "Parallel Combination" there will not be enough information.
Keep it simple.
Use the start of each sound clip as its attachment point.
And find the element on the "main" timeline that is running at that time and attach to that.

The tools described below should make it easy for me to adjust that if needed.

### Adjusting Attachment Points

On the timeline view I should be able to slide the vertical line that attaches a sound clip to an item on the "main" timeline.
This doesn't immediately change the timing of anything.
But it might have an affect later, when editing the timeline.

While you drag that line the program should update the current frame that we are displaying to match that time.
The user can see exactly what will be on the screen, and can see the waveform diagram.

And presumably a way to do this with numbers in that part of the GUI, too.

### Rehoming

It should be easy to attach a sound clip to a different part of the video without changing the video or the sound clip.
Just like sliding the vertical bar in the "Adjusting Attachment Points," this does not have any immediate effect on the timing of anything.
It only affects the way the future edits work.

For this first version, let's say that the attachment point has to be in the subcomponent that is currently playing.
That makes the GUI much simpler.
Things automatically get rehomed as you move the line.

## Overlapping Sound Clips

The common case is that no clips will overlap.

In fact, we don't currently support overlapping sounds.
One will overwrite the other.
I plan to fix that one day but it's not high on my priority list.
I'm currently focused on a voiceover, not music or sound effects.

However, there is *no need* for a CapCut style sound timeline, where you *can't* have overlap.
I don't see any value to sound clips "snapping" together like the video clips do.
The sound clips will be organized relative to the video, not each other.

It is possible that two sound clips will overlap temporarily.
While I'm rearranging the video and sound clips, some sound clips might *temporarily* overlap each other.
The correct answer is to keep the sound clips attached as requested.
The timeline display should make it clear that the two sounds are overlapping.
Maybe one of the sounds is moved to a different row to avoid overlap, but by default all sounds are in the same row.

## Importing Clips

I might start fresh by typing the name of a file and a few numbers into the Visual Editor.
More often I'm going to copy and paste from [our sound editor](http://localhost:5173/sound-explorer.html?src=.%2FSome+5+part+1.m4a).
It currently exports in the following two formats, both to the clipboard.

### Copy One

```json
{
  // "Worthy of further study... 3x1 ... 3x3 ... The computer will take care of the rest for you."
  source: "./Some 5 part 1.m4a",
  startMsIntoScene: 0,
  startMsIntoClip: 135655.83,
  lengthMs: 17360.60,
},
```

### Copy All

```json
const soundClips: {
  notes: string;
  source: string;
  startMsIntoScene: number;
  startMsIntoClip: number;
  lengthMs: number;
}[] = [
  {
    notes: "Let’s watch some matrices in their natural habitat.\n",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 2152.48,
    lengthMs: 3332.88,
  },
  {
    notes: "These examples ... matrix multiplication.",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 6100.35,
    lengthMs: 9497.02,
  },
  {
    notes: "This is an explainer... an easy one.",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 18100.33,
    lengthMs: 3146.46,
  },
  {
    notes: "The good news: the computer will help you create the matrices.\n",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 21659.03,
    lengthMs: 3964.26,
  },
  {
    notes: "And the computer will multiply the matrices for you.",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 26308.06,
    lengthMs: 2798.21,
  },
  {
    notes: "All you have to do is put them in the right order.",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 29656.19,
    lengthMs: 2488.90,
  },
  {
    notes: "Am I the only one who gets these things backwards",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 33409.17,
    lengthMs: 2792.56,
  },
  {
    notes: "There are only two possibilities. ... wrong every time?",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 37355.25,
    lengthMs: 4913.68,
  },
  {
    notes: "How I stopped guessing ... what's really going on.",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 43156.50,
    lengthMs: 3852.06,
  },
  {
    notes: "Affine transform overview",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 52174.38,
    lengthMs: 19280.38,
  },
  {
    notes: "Point = column vector = matrix.",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 72176.10,
    lengthMs: 6636.04,
  },
  {
    notes: "Shapes are just a collection of points.",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 79339.19,
    lengthMs: 3877.48,
  },
  {
    notes: "Top left corner of square",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 83676.98,
    lengthMs: 5009.33,
  },
  {
    notes: "Each operation is a square matrix ... computer creates it for you.",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 89969.63,
    lengthMs: 12498.48,
  },
  {
    notes: "Apply transform to point ... each point in image.",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 106089.79,
    lengthMs: 11654.98,
  },
  {
    notes: "More details... affine matrices are bigger.\n",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 119657.40,
    lengthMs: 10484.96,
  },
  {
    notes: "And sometimes people don't bother to list out all the terms.",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 130630.46,
    lengthMs: 3829.13,
  },
  {
    notes: "Worthy of further study... 3x1 ... 3x3 ... The computer will take care of the rest for you.",
    source: "./Some 5 part 1.m4a",
    startMsIntoScene: 0,
    startMsIntoClip: 135655.83,
    lengthMs: 17360.60,
  },
];
```

### The notes field

The notes field should be displayed as a description of the clip.
This is completely analogous to `Showable.userEditableDescription`.
It has no meaning except in development.
It will be essential if you have a lot of clips!

This is a comment, instead of a field, in some older code.
We can change the way the Sound Explorer exports single items to look more like the way it exports the entire list.

In the past I've always pasted that directly into TypeScript source code, so comments were all I needed.
"Copy All" is new and is intended for use with this new code we are building.