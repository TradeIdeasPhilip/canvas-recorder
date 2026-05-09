Next goal:
Make the visual editor tools more useable.
Ideally most of the work will big done in the visual editor, and only the parts that need to be will be done in TypeScript.

How to save from the visual editor:
Currently saved automatically to IndexDB on each change.
Copied out in small pieces to the clipboard.
No clear and obvious way to close the loop, so the settings go back into the TypeScript code or at least into git.

Changing things that used to be read only.
Sound-- needed to move into another thread anyway, let's start there.
Preview GUI -- probably just refresh it from scratch when notified.
Notifications can all be internal since the gui is making the changes and listening for them.
The in parallel and in series options need replacements, something not read-only.

Example:
7 pointed stars vs fourier
We will have a lot of these, they all have the same interface.
Each one will need it's own schedule to say how to do the fourier steps.
Must use 3 different colors for the three types of segments,
and can't use the same trick as in the Sierpiński video because these segments are not all the same size.
In the past we'd show all of these in order, all the same way.
I want to create a lot of different presentations all in the visual editor, and only use TypeScript to draw te actually fourier effect.
Placeholder: Until we create some real code, just draw the outline of a circle to represent these.

Want to create multiple slides from the visual editor.
Want to create transitions between the slides.
Want to add text and other simple effects.

Start this in src/shadow-test.ts.
That contains a lot of related tests and demonstrations for the visual editor.
We're kind'a picking up where ./schedule-editor-prototype.md left off.
That previous file gave me some good tools, but those are just fragments of what's to come.
Now I want to focus on those tools, and I want to pull them together into something more complete and coherent.
Also, I like the style in shadow-test.ts. (bright colors, white background, halftone shadow)

Start with a complete dump of everything.
(**Update: Done!** The first dump is available in https://github.com/TradeIdeasPhilip/canvas-recorder/commit/afe86f38f53e22c45be593f9e20b4eef730b7400)
Right now the visual editor is very fragmented.
You can only see things related to one particular scene or component at a time.
And you can copy the data for the same group into the clipboard.
I want to see all of what the current movie has to offer.

I can imagine a single \<div> or \<pre> containing all of the data that we are saving anyway, so just dump it onto the screen.
We could probably rebuild

I can imagine the bulk of the movie being stored in that JSON that we are currently storing in IndexedDB.
The typescript code still does halftone dots.
And the typescript code will handle the fourier transforms of the stars, and will expose that to the other side as a component.
The JSON says which components go on screen when and where and at what pace, etc.

So I want to **see** this data.
I want to know what I'm working with.
I'm not 100% sure where I'm going, but I know this data will be important.
Start with very simple formatting, maybe `JSON.stringify(obj, null, 2))`.

Examples:
5 pointed stars: https://youtu.be/ykN3wYOBq40?si=fu36cx7TZWJVrHYz
6 pointed stars: https://www.youtube.com/playlist?list=PLJNSFdg--j7frNYLnOyVen1Rb7SjHRd3C
All source code in https://github.com/TradeIdeasPhilip/random-svg-tests

## Clarifications

Re: "question is which data" Honestly, you wrote that code and it worked so I barely looked at it, if at all. My short term goal is to take inventory of what's already there. Possibly there are different sections in the database, corresponding with the places where I can hit the copy button. It should be easy enough to look at the tree that describes the movie and find all relevant editors and put them all together. Maybe the key for each section in the database becomes a header in the html output. Please, just show me what we got.

Re: "The round-trip problem" Here's the picture in my head. Very tentative and preliminary, but it's a good straw man at least. _Most of the time we only care about what's in the database_. That's the "source of truth". The rest are "administrative details." It will be easy enough to add a button to save the current state (or more!) to a json file. By default we use the current state from the database, but the typescript code will have access to one or more json files. If a user starts and there is no saved state in the database, we have a fallback. And we might have options to explicitly load one of these at any time, noting that the current state has already been saved. There are a lot of details to explore, but I think the basic idea is reasonable and worth pursuing.

The picture in my head is _HyperCard_. I was the right age and I used that a lot and it was amazing. I'm picturing the modern typescript code replacing the compiled object code that HyperCard let you import as a resource. Almost everything else will be in the database. (As it was in HyperCard!) That's not 100% true. I could include javascript code snippets in the database, to be really powerful, but I'm planning to put all code into the \*.ts files. We already have one or more registries for converting strings into TypeScript functions and objects, and that's worked well so far. (For example, the easing methods available in the schedule editor.)

One more thing regarding the database to git discussion. I can imagine some people using this tool without doing any programming. Maybe I'm not doing any custom math, just animating some pictures and text. Or maybe it's a group project and one person is focused on the programming part and the other person is doing all the layout. So there would need to be some way to save and load the files to the file system, for backups and such, like a normal program, in addition to any git or typescript integration.

## Small tools and code snippets

All of the values that we save in the database and display in the editor, they should all be easy to access from code.

- In particular, I'm thinking about someone at the console
  - No typescript, no imports, a totally different system for predictive text.
  - Always live and interactive.
- And also small custom tools.
  - Maybe something that I've typed at the console a few times and don't want to type it over and over.
  - Maybe there's a standard "distribute" function (like in PowerPoint and others) but one particular project works on a logarithmic scale.
  - There's no clear line between a small custom tool and a "real" tool, things will evolve.
- There can be internal stuff,
  - think of this like an API, making it easy for a programmer to interface with.
  - But we are still at the early stages of figuring things out, so "API" might be too strong a word.
- Example: `window.VisualEditor.selectedControls.forEach(control => {control.x+=5; control.y += 1;})`
  - This shows the basic scope of what I'm thinking about.
  - Presumably x and y are backed by code and will automatically request a save to the database soon, just like if I'd dragged all the controls with my mouse.
  - The interface doesn't have to look exactly like this; my point is make it short and simple enough that it could be useful from the console.

## Reloading the script

Currently most aspects of scripts are constant.
In particular the start time and duration of each script are never expected to change.
We will be changing that rule.

Let's start simple.
Currently we load a lot of controls and variables and a sound buffer at the start of the main program from a single constant describing the script.
Let's add a button that says "reload".
That will clear out the current settings then load them the way we did at the start.
A lot of the initialization code should probably move into a function, instead of running directly from the module level, so we can call it more than once.

It seems like most of that effort will be very quick.
It could probably fit into a standard animation frame.
We could probably use the existing requestAnimationFrame frame logic to group changes.
Just like dragging a control in our editor, it doesn't matter how quickly you are generating mouse move events, it will not recompute things more than once per animation frame.

The problem is sound.
That is slow; crude estimate: one second of processing time per one minute of audio.

Sound is always initialized in async/await, because of the loading and decoding process.
Presumably we will keep decoded files cached.
We already have a cache, for when multiple scenes all request different parts of the same input file.
I added a function to clear that cache, with the intent of calling that function at the end of the initialization phase, but I can't remember if I'm calling it or not.
Of course we hope the second time we initialize everything will be in the cache, but there is no guarantee, so we can't get away from async / await.

After loading and decoding the input sounds, then we have to copy lots of samples from one array to another.
I think this takes noticeable time, but I'm not sure.
The current logging statement only tells me when the entire process is done.
**Need to add better logging.**
How much time was spent waiting on other threads vs on work in main thread.
Absolute time _and_ ratio of read time to size of the input files and ratio of write time to amount of data copied.

There are lots of options for sound.
I hope we can keep this simple model where we always have one big sound buffer for the entire project.
But there are lower level APIs that I might use as an alterative, providing data as needed instead of all at once.
Need to explore, see if the current approach is good enough.

For now, maybe a very simple wrapper around the sound requests.
In particular, if I'm spamming the reload button, things shouldn't get too bad.
If I hit the button 10 times quickly, I don't want 10 threads all running at once, or worse yet 10 requests queued up for the main thread.
Simple, robust, just enough to keep it working until we decide on the final plan.

Sound is _not_ my _first_ concern in this prototype.
I haven't recorded the voiceover yet.
But sound will be required by the end of this prototype.
The video we produce will have a voiceover.

At the moment the reload button won't do anything interesting.
We don't yet have code that would take advantage of that.
It would be easy enough to say `duration: 30_000 + 60_000 * Math.random(),` somewhere to make the test more interesting.

Eventually the reload button will be removed.
It will automatically be called by the GUI after a change was made, possibly grouped with other changes.

**Update: Done!**
The full refresh is very fast!
It takes less than 1/2 second to reload the sound for the Sierpiński project.
The visual parts reload instantly.
Done here: https://github.com/TradeIdeasPhilip/canvas-recorder/commit/4518aca3213f29ae0593a41af8c603fa8eaf1dd4

# Taking stock, 5/5/2026

## Adjusting the Duration of a Component.

Most components should have an option to resize them.

Video clips typically come with multiple options.
You can clip it to make it shorter.
You can reverse that operation, including more of the original clip, in place.
Or you can change the speed of the playback.
And I have to do this by hand, but often I fill space by repeating a video clip as many times as required.

It seems these are common options.
You should be able to tag a `Showable` to tell the visual editor which of these options make sense for the `Showable`.
(Like the way `Showable.components` is `undefined` to say no editor, or you can set it to tell component editor to appear for this `Showable`.)

- A clip can have a default (or initial) start and end time.
  - And a min and max start and end time.
  - If you don't specify anything you get the current behavior, requesting to run between 0 and `Showable.duration` milliseconds.
- A clip can have the option of playing at a different speed.
  - A lot of my math demos don't have any intrinsic speed or duration.
  - They have a "progress" input going from 0 to 1.
  - Typically we set `const progress = context.time / this.duration` in those cases.
  - Some `Showable` objects, like video clips, will have a preferred speed and that should be visible in the visual editor.
  - Most code in this project treats time as _continuous_ and will respond well to arbitrary changes to the playback rate.
- A clip might be intended to be repeated.
  - Like a lot of my background patterns.
  - Boolean option: Play at full speed vs tweak speed slightly for an integer number of playbacks.
- A clip might support more than one of these, it should probably say which is the default.
  - E.g. if you just drag the end of a clip.
  - If none of these options is available then that GUI won't be available.
  - Presumably the user has a way to override any of these, but not by accident.

If we change the length of a single `Showable` that might affect its parent.
At a bare minimum we need to reload everything from the new state.
Some parents might be more involved, like changing the timeline on a parent will automatically change some or all of it's children.

None of this affects `Showable.globalTime`.
That is always the number of milliseconds since the start of the program.
This all affects `Showable.timeInMs`.

See `addMargins()` for the programmatic version of some of this.
It's not really the same, but there will be overlap.
`addMargins()` does multiple things:

- It protects the wrapped `Showable` from calls before timeInMs = 0, or after its requested duration.
- It optionally adds time before or after the base animation when nothing is displayed.
  - This is helpful with _in series_ items, adding a "margin", a time not available to me or my neighbors.
  - This is helpful with _in parallel_ items, setting the starting time of the base object relative to its parent.
- It optionally freezes the first or last frame for some finite amount of time.
  - When used with `MakeShowableInParallel`, I often show nothing before the start time, then remain "frozen" "on stage" until the parent is done.

## Flexible "in Parallel" Component

We already have a visual editor for this.
Just set `Showable.components` to `[]`.

Should we automatically change the duration to the max of each item's duration?
That non-visual version, `MakeShowableInParallel`, uses the max of each item inside.
And there's an option to make it last even longer, a "phantom" item that is added to the list of thing to take the max of.
I think the answer is _no_.
Maybe that's an option, a button you can push.
Maybe when you drag a child (on the timeline) it tries to snap to an edge, but if you keep pushing it you can drag things outside of the edge.
I don't think it's a good idea to stretch or contract the parent when dragging a child, it seems confusing.

We need to create a generic component that allows for sub-components.
I.e. **recursion**!
Can our current infrastructure handle that?
The "main program" in typescript might be some generic container, analogous to a `TFrame` or `TForm` in Delphi.

## Miscellaneous Generic Component

The code in this project mostly focuses on small things that you can put together yourself.
I don't think that will translate well to a visual editor.
I think it will be good to have something like a `TFrame` in Delphi or a \<div> or \<g> in the web world.
A collection of useful things like:

- A host for sub-components running in parallel.
- A transform matrix
  - Like HTML and SVG, transforms are accumulated from your parents, never reset.
  - Eventually we need a powerful transform editor.
  - We can start with just strings in the standard CSS format, to get things going.
  - Soon after we will need to deal with interpolating from one state to another, which you get for free in css animations.
  - I _really hate_ CapCut's transform editor. Among other things, it lets me scale differently in x and y, and it lets me rotate, but I _have to_ do the rotate and scale in a specific order.
  - Simple things, like pan and zoom, should remain simple.
  - It's temping to encourage people to do only one transform at a time, and to combine multiple transforms by making creating a tree of components, each owning the next. I do that with multiple \<g> elements all the time because it makes combination and order of transforms make the most sense to me.
- A background?
  - That's a common one if we keep the component metaphor.
  - It seems convenient and it wouldn't be hard to do.
  - I was picturing a shape editor, but maybe that's part of this.
  - Now I'm picturing [clip-path](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/clip-path) style control over the background.
  - Eventually we might add a nice editor to cover all the options, but initially we only need a string input with a few simple suggestions, and help that points to an on line tool to help.
- Clipping
  - So far I've been ignoring clipping. (I only have "free range" animations.)
  - But it's somewhat standard and makes sense.
  - And, as I mentioned in the background discussion, there are lots of external tools to help people build a clipping path and we can focus on a string input for now.
  - A separate clipping path for the main content and for the background.
  - Make the background bigger than the content to make a simple border!
- Alpha
  - So far I haven't been very strict with alpha.
  - Most of the code just ignores `context.globalAlpha`.
  - Some code sets `context.globalAlpha` then calls naive code, then sets alpha to 1.0 on exit.
  - We should probably treat the alpha like we do the transform matrix: You can only multiply the previous alpha by a number, not set it to a value. That should be a standard everywhere, not just here.
  - Keep the same underlying mechanism: When asked to show() itself, save the current state, `*=` to set the new value. We are now changing more things, maybe push the entire context at once, and pop it on exit.
  - Refusing to draw at all when alpha is 0 has been a very convenient and useful trick in related code.
  - Note: This is **not** exactly how css handles alpha. It will create a temporary buffer for the entire group, draw the group normally, then use alpha to copy that buffer on top of the final image. That can be important if you draw multiple objects on top of each other. I'm hoping we can use this simpler option.
- Exception handling?
  - Currently exceptions pass all the way up to the top.
  - Now that I think about it, it's hard to do anything else.
  - Among other things, you can't even push and pop the state of the rending context reliably.
  - It's a stack. What if some other code pushes and does not have an exception handler so it never pops?
  - No, it would be way to hard to do this right, not worth it.

Slides can contain pretty much any type of component as children.
In particular, you can nest slides directly inside each other.
This functions like a \<div> or \<g>, grouping other items.

More could be added later.
We don't need a complete list, just something to build on.

### Class Hierarchy

It seems like image components, text components, \<div> or \<g> analogs and more could all benefit from most of what I've described here.
This would be a good place to create a shared base class.

Should an image or text component have the option to have children managed by the ?
Presumably

### Sharing an editor

Here's an interesting use case.
In one slide I hard coded a lot of component children.
I.e. the visual editor could not add or remove them.
However, I included most (but not all) of the children's editable properties as properties of the parent, so they would be available to the user.
The children included more than one instance of the same class, so I had to update the names to make them distinct.
This seems like a very common use case and a very helpful feature.

To be clear, this is talking about the tools for _TypeScript code_ to create a new class of component.
This document is focused on pushing as much work as possible on the visual editor.
But these tools _must always_ make it easy to integrate custom TypeScript code.

### Additional information for the show() routine

Should these contain a content rectangle?
I.e. custom typescript rendering code can ask what are the boundaries in which it should draw itself.
This should be an optional feature, advisory, but very useful.

The top level should set the rectangle to 16x9.
16 and 9 are currently "magic" numbers that are spread haphazardly through my code.
I have some standard background routines, for example, that need to know what they are the background for!
16 and 9 finally found their home!

The current code mostly uses `newSettings = {...oldSettings, newProperty:newValue}` for the few cases when it creates a new `ShowOptions` object.
That seems like a good default behavior.

The clipping path and background, described above, would already require the idea of a content rectangle.

## Slide Deck Component

I've used several different metaphors, let's focus on PowerPoint.
It's one `Showable` object after the next, all wrapped in a parent `Showable`.
`MakeShowableInSeries` is the programmatic and read only version of this idea.

This could have a nice visual editor to go with it.
Like in PowerPoint, you see the thumbnails for your slides and clicking on one brings that slide up in the main part of the editor,
Of course the thumbnails can be previews.
There are lots of options including live action.
Simple start: The visual editor lets you select a timestamp for the thumbnail, and the thumbnail is rebuilt automatically if it is visible, but always with timeInMs set to the specified value.

One of the big things that `MakeShowableInSeries` does is takes care of boundary conditions.
At any given time, exactly one of the children will be visible.
I don't want the children to be responsible for hiding themselves.
It sounds like only a minor inconvenience at first, but I keep running into annoying special cases, and it's just better to make the parent responsible.
For example: We typically want each item to be visible at exactly its start time, so the previous item has to yield at exactly its end time, but we want the last item to stay visible at the end, so something will be visible, because we might want to freeze on the (first or) last frame.
Another rare but real issue: Sometimes a duration will be part of a complicated computation, and two different pieces of code should get identical results, but due to round off error they might not be identical.
(Or they seem to be identical in test, but I can't convince myself it will always be true, I shouldn't have to think about these things.)

Presumably each slide in the deck is a miscellaneous generic component, described above.
Maybe we should call that a "slide"?

Unlike powerpoint, these can be recursive.
Presumably the Slide Deck contains a slide with multiple items, include a sub-slide-deck.
I suggested that a slide Deck's _direct_ children can be slides, but there _will_ be recursion.

Unlike a "slide", this should automatically resize based on it's children's durations.

We need some sort of editor add, remove, and rearrange slides.
There are multiple ways for a slide's duration to change.
The user should get an option to make things longer or shorter in the same place as these other options.

I'm still not clear what the timeline for this project should look like.
The slide preview window might be part of the timeline.
They certainly overlap a lot in functionality.

## Component Ids

Should each component get it's own GUID (or UUID)?
We're talking about a complicated structure.
It might be nice to use a GUID as a soft link to a component.
That would allow for sharing ("fan in"), which might or might not be a good idea.
(In SVG the CSS selectors and --variables look at parent, so you can configure things differently each time you \<use> them.)
That would also allow for cycles, that's bad.

This seems very powerful, especially when we are storing these components in a database.
I can imagine something analogous to the UNIX /lost+found directory.
But it would be so much more powerful since we have the entire history of the project in the database.

## Transform Editor

css animation style interpolation between transforms should not be very hard.
Take away just one "feature" of the css version:
You cannot specify a list of strings describing the transform at each keyframe, but my alternative is better.
First the editor lets you select a series of things like `rotate(${v1})` and `scale(${v1})` and _separately_ `scale(${v1} ${v2})` (I can never remember the syntax, it might require a comma) and maybe nice things that we add like rotateAbout(degrees, centerX, centerY).
So our editor will enforce that all of the descriptions line up.
Each keyframe is an array of numbers, one for each input in the composite transform that we've built.

There is room for so many improvements over the status quo in a transform editor!

We can start with simple things.
If you delete a piece of the template, all of the data gets deleted, too, automatically, so the remaining items are still lined up.
And you should be able to reorder these easily,

## Text Control

There are no limits to what you can to what you can do with text programmatically.

Current tools: I have a lot of small pieces that can be applied and grouped to make the text more interesting.
But I need something simpler, at least to get started.
I need to constrain the problem some.
And, like with the slide object, I need to accumulate a lot of settings in the same place.
In powerpoint **Bold** and _Italics_ are on the same menu, as it should be with our text _component_.
Currently bold and italics are handled in two completely unrelated ways.

fancy-text.ts was my most recent attempt to put a bunch of text tools into one place.
It was a nice leap forward, but it is far from complete.

The biggest change I want to make is to separate formatting boundaries from word boundaries.
Currently if I try to a**p**p*l*y different formatting to different parts of a word, the software kinda works but it becomes less stable and lots of little problems crop up.

fancy-text.ts made great progress by putting the formatting closer to the places where I generate the text.
I want to keep that and expand on it.
It might be nice to say "select the next word" or "select the previous word" or "select the last 3 letters of the previous word", etc.
That said, the GUI might hide all of this and try to look more like email/powerpoint/Word, etc.

I think we still have to _partition_ the body of the text into different sections for formatting.
You can't just say the first three words are bold and the last three are italic.
That would work if you are certain that there are exactly six words.
But you have to explicitly deal with the none and both cases, if you want them.

Part of the problem is that when I hand code solutions, I always try to do as much work up front as I can, and as little as possible in the animation frame handler.
That makes all of the examples in my code different and hard to copy.
And, while the idea made some sense for hand coded parts, it **absolutely** was premature and unnecessary optimization.

fancy-text.ts uses a lot of mutable fields.
Some of that was because it was a prototype and I didn't know where I was going.

And, somehow, this editor needs to be flexible and allow for new types of formatting from code.
I'm not sure what what means.
Maybe `Formatter` is an interface including calls at different parts of the rendering pipeline.
E.g. italic is done when we are _creating_ a path, "dancing ants" is done in each frame, bold is often a combination of both.
We are hiding these details from the GUI user, but not from the TypeScript code.

We need to add _something_ quickly to be useable!
The first version will not be anywhere near complete.
