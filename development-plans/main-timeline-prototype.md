# Main Timeline Prototype

We need a “main” timeline.
Deleting something or resizing something automatically moves everything later in the timeline, like the main timeline in CapCut (and others).
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
