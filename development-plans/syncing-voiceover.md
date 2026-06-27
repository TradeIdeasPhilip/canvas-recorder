# Syncing Voiceover

These are near term thoughts.
(As of 6/27/2026)
I'm making good progress on some animations.
I have more to do, but not a lot more.

Whenever I record a status update video I have trouble making my voiceover match the existing animation.
This is a preview of a real problem that I will have whenever I finish the animations and start the final voiceover.
I need better tools for adjusting things.

We already have the ability to adjust video clips and animation schedules.
It's just not in the GUI yet.
The GUI will _play_ the current version, but currently changes must be done in code.

## Problems with the Current Playback Controls

### The Chapter Selector does too many things.

**Status:** A lot of this could be fixed at any time.
Eventually we want a real timeline, which will probably cause some changes to this GUI.
But there's no reason to wait.

The biggest problem is that the \<select id="chapterSelector"> element does too many things at once.
I like the idea of selecting a `Showable` on the GUI and being brought right to that part of the video, and seeing relevant choices in the visual editor, and setting the program to loop on that section of the video.
That will be still be a common case and possibly the most common case.
But it can't be the only case.

Sometimes I want to loop over an arbitrary part of the movie.
The default would be to show the entire movie.
When I say "loop," I mean what we currently do, where the user might or might not have to manually restart it at the end, but either way we have specific starting and ending points.

I will often want to start end between chapters.
But if we are implementing a normal timeline, and if I can pick any point on the timeline, and the ends of chapters are slightly sticky, we don't need to add anything special for this case.

And I might want to edit something that I'm not currently looking at.
Maybe I'm editing a property in a group of slides that gets used by all of the slides in the group.
I don't do that anywhere yet, but I plan to.
MultiTextComponent is already able to be used that way.
I want to loop on one particular part of the code, but the editor covers a much longer part of the video.

### No Access to Sound Clips

Those can only be seen or edited in the TypeScript code.

I should be able to view and edit these directly on the timeline.
A "normal" timeline like CapCut has is reasonable, at least to start.

I want it to be easy to link a sound file to something specific.

Currently I can select a sound file, trim it, and set its start time relative to the start time of something else in the tree of chapters.
I suppose I can create a child node that appears in the tree that does nothing but serve as nothing but an anchor for a sound file.
That exists, but I never had a reason to use that.
The child could be created and adjusted based on inputs to the constructor for the `Showable`.
But there is currently nothing in the Visual Editor that can edit any of this.

**Do we recreate some objects each time that the Visual Editor touches them?**
Interesting idea.
**TODO** Find a better section for this paragraph.

Currently I use a separate program to trim the audio: http://localhost:5173/sound-explorer.html
Ideally this would all be done on one page... maybe.
In any case, this program can read the values saved by the sound-explorer.

I can imagine these two working together.
I continue to use sound-explorer.\* to do the big edits.
I tear a single file into a lot of individual clips, each with an English description.
(That already exists!)
The Visual Editor in canvas-recorder.\* can import an entire sound file, and it can adjust beginning and end of each clip at any time.
The Visual Editor will have an easy way to import clips from sound-explorer.\*.
The import is a simple copy.
You can change the copy or the original and it will not affect the other.

#### Short Term Plans

**Status:** Part 1 and the rename can be done at any time.
These should be small and simple.
Part 2 can happen as other changes are being made.
"debug" was renamed!
philDebug.rootVideoElement exists.

Try some type of reasonable first guess at sound file updates.

Part 1: Always read the sounds from `const debug: SelectableTree[]`, like we do now.
But add an easy way to do this from the console.
Maybe we create `philDebug.refreshSounds()` and `philDebug.rootVideoElement`.

I hate the name "debug"!
Let's change that to "rootVideoElement".
"Debug" suggested working in the console, and is accurate and appropriate for "philDebug", but not for the top of tree.

Note: `philDebug.VisualEditor.rootComponent`, described below, refers to whatever is currently being edited on the right side of the screen.
That's different from `philDebug.rootVideoElement`, described here, which is the top level of the entire video.

Keep the existing code that rebuilds the entire soundtrack every time there's a change.
It works well for now.
I can imagine something better, but this isn't terrible.

Part 2: As we work on the "in parallel component", described below, we should work on a way to incorporate sounds into the GUI.
There are a lot of details to work out.
The important things are letting the use edit the sounds visually, and saving these changes with the rest of the Visual Editor's changes.

## Current Project

some5.ts contains a lot of independent demos.
I need to make it slow down and speed up in places to fit a voiceover.
I'd love to record and edit the voiceover in the same application.

In some places I could just adjust the length & speed of a each chapter.
But in some places I want to completely freeze the action.
And ideally the speed would ease.
I.e. things would decelerate and accelerate, instead of _suddenly_ stopping and starting.

### Minimal Prototype

**Status:** This is a brain storming session.
I think it's close to complete.
I want to try some small bits of code, just to get started and see what it looks like.

Add most of the slides to a second list.
They continue to be visible and editable as they are now.
But they are also visible to the last slide, which is a user configurable container around them.

This first, simplest container is an "in series" control.
Most videos have a MakeShowableInSeries connecting all of the scenes or slides or chapters in the video.
And I think I have a prototype of an in series control that works with components and the visual editor, but I haven't really looked at that.

This new in series slide will have a string schedule called "Slide".
It's a constrained string.
You can only add new slides by changing the TypeScript code.
Each slide's `description` property is used in this list.

I don't see an example of this, but I've needed this for a long time.
Sometimes I want a discrete value from a schedule, but I still need progress.
The ScheduleHelper classes all have an at() method that returns the underlying type.
If we know how to interpolate the type, then we do and we return the interpolated value.
If not, then we just return the first value and call it "discrete."
In either case we only return a value of type `T` and we do not share the progress.
It seems like all ScheduleHelper classes could have a `discrete() : { value: T, progress: number}` method.
**This seems useful even if we don't use it here.**

Hmm.
I wanted to use the existing tools for easing.
And that would work for simple cases like `ease`.
But even as soon as I want to start after a small delay and end a little early, I need more information.

I can imagine two schedules, one with strings and the other with numbers for the progress.
Or one schedule with two data items, the progress and the discrete value.
In some cases we really want or need that.
But it seems like a real pain and more than we need most of the time.

I can imagine the schedule helper just returns the progress in a linear fashion.
(Or it allows simple easing function because it's already available)
Then each function includes its own margins and easing.
That's a common but annoying approach.
Could we embed that in the editor?
You have a choice of all of the normal easing functions, or you can break into an automatically created and managed sub schedules?

#### A different approach

The serial approach sounded simple at first, but it might have been as simple as I thought.
And it was missing things, like overlapping slides.

Different approach:
Each slide has its own progress schedule!
In parallel instead of in series.
So I have full control!

What about _inserting_ time?
If I want to make the first slide take longer, I probably want all the other slides to start later.
I don't have a solution for that.
But I don't yet have a solution to that with a single schedule, either!
**TO DO**!

For now this feature has hard coded children.
In the recent past I tried to focus on fully componentizing all my my infrastructure.
That is unnecessary in the example at hand.

This would be a convenient place to insert a slide.
At the moment a slide is just a container with a transform.
I'm not sure exactly how to display that.
I could picture each slide being a child component, but without the ability to add and remove components.

**Status:** This next paragraph was implemented in https://github.com/TradeIdeasPhilip/canvas-recorder/commit/6ea913e332a54380d9eec2f85957d1d48676243e

That just needs to be a thing.
Separate from the rest of this.
`Showable` need _two_ lists of components.
Keep the existing list which can be `undefined` to disable, otherwise is fully editable by the user.
And add a fixed list of components.
These cannot be added removed or reordered by the user.
But they all appear in the visual editor along side the existing type of component.
And you can edit their properties.
And they might have either or both types of component children, continuing the existing tree structure.
The new field can be `undefined` or `[]` and it will mean exactly the same thing.
The new field is optional.

Hmm.
What does this do to our ability to save and load?
Do we get two copies of the data for each slide?
There is logic in case the exact same slide is included more than once in the timeline.
But I think this would be different because the data would be at the top level of the json for its own slide, but there might be a copy of every slides info in the group side.

Easy to fix.
Override the slide component so it doesn't share all of its children with the visual editor.
Add a miscellaneous callback to the slide to draw something extra while doing the transform.
It doesn't know or care about the details.

No.
Make it a subclass of Slide!
The class will have an additional property in the visual editor: the schedule for time vs time.

Proposal:
Each of these new schedules will map from the top level's ShowableOptions.timeInMs to a progress indicator.
Generally these outputs will vary between 0 and 1, and those are the values that will appear in the Visual Editor.
However, when we call the subcomponent's show() method we'll multiply the progress value time the subcomponent's duration value.
The duration is used directly when we display the slide directly.
But when we call the slide from this new slide container, we focus on progress from 0 to 1.

A progress of less than 0 or greater than 1 means don't display the subcomponent at all.
That has worked well in other places.
It's easy to say time = 0 → progress = -1, time = duration → progress = 2 and the rest will work itself out.

## Transitions & Overlap

**Status:** This section depends heavily on other decisions in this document.
This should be a consideration while making those decisions.
But there is no work immediately available.

I have a couple of simple samples somewhere in the code.
The old scene would move left out of frame while the new frame slides in from the other side.
Or one fades out while the other fades in.
Options are unlimited, but sliding is simple and works well.

This new timeline stuff might give us a few more options to consider.
Do we freeze on the last frame?
some5.ts doesn't really use globalTime.
Maybe in this script it will be simple.
In fact, I need to add some freezes at the end of many of these slides.

This would be a perfect use for a gui version of addMargins().
It would be nice to freeze the first and/or last frame.
But I'm not always sure how long to make this, and sometimes I'm just too lazy to add it in the main part of the code.
This is exactly the sort of thing that I'd want to add and adjust in the Visual Editor and ignore in the TypeScript code.

Maybe all of this is covered by the "in parallel" control that I've described above.
We will have the ability to overlap things any way we want.
We will have the ability to transform things any way we want.
Those two schedules will be right next to each other in the editor.

## Schedule vs Progress

**Status:** This section is totally independent of the rest of this document.
This can be implemented at any time.

Currently all schedules are displayed in the Visual Editor where the time is labeled "Time (ms)"
In some cases that label should change.
"Progress (0 - 1)" would be a very common example.
See the new time to progress schedule that I've listed above.
I suppose other strings might be helpful.
But at the same time I don't want to copy the literal constant "Progress (0 - 1)" all over the place.

Test cases:
There are already some places where we should be displaying "progress" instead of "ms".
I don't remember exactly where.
But a search for "const progress = timeInMs / this.duration" (and variations on that) should find a few examples.
Fix these examples and test the changes to the library at the same time.

This is another old request that I'm finally caring about enough to fix.

## Access from the Console

**Status:** This can be done at any time.
It would be good to have it sooner rather than later.
It will help me build some of the functionality described elsewhere in this document.
Creating this will involve a quick audit of what is currently available, which will help me think about what I want to do next.
`philDebug.VisualEditor.rootComponent` and `philDebug.VisualEditor.selectedComponent` exist now!

This is an old idea but I don't think any code exists.
There should be a way to access the Visual Editor from the console.

Right now I'm considering ways to make changes to lots of stops on lots of schedules at the same time.
Maybe insert a new item in the middle.
Maybe stretch or shrink or crop or expand an existing item.
This is where it would be nice to try various queries from the console.

Notice `philDebug` in utility.ts.
That's the preferred way to send things to the console.
(Details in the JS Doc.)

This "api" can focus on what's already available on the screen at the current moment.
So we're not adding any real functionality, we're just sharing what's already there.

I can imagine something like `philDebug.VisualEditor.components.forEach(component => {...})`.
That will provide a series of `Showable` objects so I don't really need the Visual Editor to help me access them.
Hmmm.
Maybe I only need `philDebug.VisualEditor.rootComponent` and `philDebug.VisualEditor.selectedComponent`.
Sometimes I will need to _tell_ the Visual Editor that I made a change.
Maybe sometimes a full refresh and rebuild, trying to keep the same things selected.
Maybe sometimes something more specific, like just reread the contents of the schedules and update the GUI.
And it doesn't exist yet, but we will have a way to update the sound clips at any time.
