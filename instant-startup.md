## Background

I've been building up some tools for creating animations in TypeScript in the browser.
These can be interactive or scripted.
These can be aimed at live display in the browser, or they can be saved to _.mp4 files.
Often the lived display is used for development and the _.mp4 is the final product.

I like what I have.
The old stuff slowly improves over time.
And I add new stuff constantly.

The problem is that it's hard to use.
Especially to start a new project.
If I just have a quick idea I want to try out, this is a pain.
My current setup works well for high quality productions,
where a spend a lot of time tweaking small details,
but it can be a pain when I want to be creative.

## Desired Product

I love the [OBS Browser Source](https://obsproject.com/kb/browser-source).
It allows me to use any web technology to create live video to mix with other live video.
I could HTML and TypeScript to create _widgets_ to freely mix with the other the features of OBS.

I wish I could find a very simple video editor that that had the same idea.
Basically I'm building that.

The video editor should be _simple enough for my dad to use_.
Which I hope to accomplish mostly through only offering the features that I care about.
Simple things like cutting and rearranging segments of prerecorded video and audio.
And text and arrows.

This OBS style API will be used in two ways.

- Typical reusable features, like adding text on top of a video, should be implemented this way.
- And if you have custom TypeScript code that knows how to draw anything you want on the canvas, you can drop that in as as a widget or plugin.

## Quick Start

Think about creating a new project in Delphi or a new document in Word.
You start the application and you immediately get a blank form or document.
You can start editing immediately.
You can run your program or print your document without saving first.

The program doesn't even ask you for a file or directory name until you ask to save or quit.

It starts with a reasonable default template for your program or document.
You can _easily_ change that later.
But most of the time you do nothing.

Delphi lets me create text very easily.
I can type right in the development environment.
I can adjust all of the formatting options.
Some of that text is real and permanent.
Other text is just a _quick_ template that will be overwritten in code.

## PowerPoint

The GUI should include an interface that is reminiscent of PowerPoint.

I should be able to create slides.

There are some quick options for backgrounds.
Transparent should always be available and easy.
Solid color should be easy.
I have a few other samples that I've used in various places.
There should be a list what's available, some of those items taking additional inputs.
This is a place where this API is open and I can make anything I want in TypeScript, and I can quickly and easily add it to the list.

It should be easy to add multiple text controls.
And images.
And arrows (vector paths).
Etc, and they all appear and disappear together.

Under the hood this will probably be a `Showable`.
I use that interface for most pieces of animation that are big enough that the main program needs to know about them.
I.e. things that appear in a list in the development GUI.

### Rationale

Really, I want a quick way to throw down ideas.
To brainstorm and build straw men.
Powerpoint is a great way for me to get my ideas out and organize them, so it was the first thing I thought of.

### Details

I don't know the details of what I actually want here.

I can imagine a menu or toolbar where I quickly bring up a few templates.
Like powerpoint with it's title and body on a typical new slide.
In fact, a lot of my current video code starts by choosing a title font and finding a standard place to put the title.
So all of the scenes will look consistent to the end user.
And so I can I see WTF is going on before the content is complete.

These "slides" might exist forever, or might might just be templates and snippets.
A quick way to get started, then they have no life of their own.

See src/showcase.ts for a list of possible templates or snippets.
I created this with instructions that you should copy the sample code and customize it.
These would be perfect objects and collections of objects to use as a template.
showcase.ts is far from completely, but you understand what I'm talking about and there is room for much more.

I like the idea of a group of things that appear on one slide, **and then** another group of things that appear on another slide.
Again, a quick way to **organize** and get started.
Eventually anything can go anywhere at any time.
I want to be able to **insert** a new idea and the rest automatically make room.

This should map nicely to existing code.
We can have one `Showable` that represents the entire slideshow.
`MakeShowableInSeries` creates a single showable by running one showable after another in series.
Like the slides in a a power point presentation, you show one after another.
That's extra scaffolding for the initial ideas that isn't required for anything else.
Each slide will probably be represented by a MakeShowableInParallel.
(I've done this many times, I know what the common case is.)
The optional background is the first child of the slide.
(So it can paint first.)
Add as many children as you like, text and images and widgets and such.
The slide will automatically run until all of its children are done.
But we can add a default minimum time of 10 seconds, so the whole presentation doesn't collapse down to 0 seconds before we add things to it.

### Rehoming

I describe the rehoming problem relative to sound in the following section.
But we can have the same problem here.
I might start by creating a few slides, because that's a convenient way to start.
But at some point I realize that one of my widgets needs more flexibility.
This will be a common use case.
I need a way to quickly disconnect a widget from the slide (or possibly from any container) and connect it to another container (or drop it directly on the timeline).
Nothing else changes.
The other slides do **not** collapse.
(The API already has an option to skip time, "in series" is not a difficult problem.)

I think this is the same exact problem as with sound.
Any timeline element should be able to rehome.
This is just a perfect example of why we need the feature.

## Sound

### Text Interface

Need some sort of text based way to see and edit the sound clips.
Maybe something simple like csv or even json listing each clip.
Easy to go back and forth between this and the other options.
I can imagine some sort of live control displaying the json as text and automatically syncing that json display with any other GUIs, in both directions.

### Traditional Sound Editor

I like my [sound explorer](http://localhost:5173/sound-explorer.html).
It lets me zoom in and play things in a convenient manner.
It saves data locally so it can survive a restart,
and so the data could be shared between web apps.
It lets me highlight what I want and export that to my code easily.

I like my [main program](http://localhost:5173/canvas-recorder.html).
It displays my video and plays my audio and keeps the synced.
And it does hot reloads to show changes in my code with minimal interruptions to the animation.

But I need a combination of the two.
Sometimes I want to see my clips in action while I'm editing the sound, **like a traditional video editor**.

It will be useful to see the video clips listed in the same place.
I don't have a GUI like that _yet_.
(I currently have all of the scenes in a `<select>`, not a list.)

### Attachment

I need each sound clip to be attached to something in the video timeline.
The start time is relative to the video.
So if I change parts of the video, the sound will move around with it.

Right now we're using the `Showable` interface for attaching sounds.
That's probably reasonable.

I can imagine some scenes being broken up into smaller pieces, just for the sake of attaching sound.
That should work as this interface was made to be recursive and cheap.

I.e. you might have one big `Showable` that you drop onto the timeline and move around as a whole.
But it might have children that you get for free, and don't explicitly add to the timeline, but these are available for attaching sounds.

This is one of the big reasons I'm writing my own video software!
I want to make it really easy to adjust both the sound and the video to match each other.
No compromises, everything should be lined up perfectly and the way I like it!
My last video, Sierpiński, had all the sound and video lined up perfectly, but it just took a lot more effort than I thought it should, and that's why I'm still working on these tools.

### Rehoming

I need an easy way to _rehome_ a sound clip.
Common case:
I initially make the clip relative to one part of the video, _because that's convenient at the time_.
But I know that the clip should ultimately be attached to something else, in case the script changes.
The GUI should make it easy to change the point of attachment, and automatically update the offset, so nothing changes.

This will make more sense when we have a GUI.
At some point I might _drag_ a sound clip from one scene to another.
(Or I might select a different scene from a <select>, I don't know the GUI yet.)
In this case it is always 100% of the time my intent to keep playing at the same time.

Current issue:
I created src/sierpiński.ts using my current sound tools which are clearly not finished.
I took some shortcuts.
The first several sound clips are all linked to the first scene in that project because it was easy.
It's okay because that project is dormant, but ideally each sound clip would move to the correct scene just in case I ever insert or delete any content in the future.
I've considered fixing this **but...**
I have no GUI.
I'd have to do it all **by hand** in code.
I'd have to change the association of each clip.
Then I'd have to find the start time of the new scene, and do math to change the start time, and hope I didn't screw it up.
Basically, I know what should be done here and I'm not going to do it, and I'm hoping next time there will be a GUI to help me.

## HyperCard

I've been fighting with the best way to make some changes in code in VS Code and other changes by dragging things on the screen in my app running in the browser.

I liked the object database built into HyperCard.
HTML5 gives us a client side object database.
We could easily store the current state of each object in the database.
If I drag something, it updates immediately, and it saves it in the database.
The main program only has to provide defaults for a new setup.
A simple debug tool could dump the database into a convenient format.
Maybe save that as a JSON file in GIT.

Widgets are written in typescript, but can be arranged in the GUI.

## Schedules and Interpolation

A lot of my animations are driven by schedules that aren't too far from a css animation.
I have a list of keyframes and I can specify interpolation methods between the keyframes.
Sometimes these are simple css-like properties, like the fill color or x position of some text.
Sometimes these are more specific to an animation, like "phase1", "phase2" and "phase3" which all have ranges from 0.0 to 1.0.

I _absolutely_ need a good interface for editing these lists of keyframes from the running program.
Seeing the results is trivial:
I redraw the canvas **every** animation frame.
All we have to do is change the array of keyframes.

The editor might be tightly integrated with the screen.
If you want to change the position of an object, it would be nice if you could do that by dragging.
That doesn't apply to everything, but when appropriate we need a gui for it.

This editor should also look a lot like the sound editor.
In fact, they might share a lot of GUI.
You need a way to synchronize the sounds, the bulk of the video, and any keyframes you want to edit.
And the keyframes should be available as some form of text, just like the sounds.

Mostly I'm picturing the timeline editor of a typical video editor.
(I use CapCut, mostly, but they are all similar.)
You can drag a sound clip right under an image, to make sure the sound starts right when the image appears.
We need to make it easy to attach things to each other; other programs have this but only to a limited degree.
My widgets might offer lots of attachment points, not just the start and the end.
My sound editor already displays clips in the normal way, just a canvas with a summary of the waveform.
I can always ask for snapshots of my Showable at different times, like a typical video timeline, or I can show the positions of the children to get something more specific.

The timeline will show where keyframes exists, like a typical video editor.
And there will be a way to adjust the keyframes from the timeline.
And there will be additional ways to change the keyframes, but they will definitely be visible on the timeline.

## Interactive Use

This is mostly aimed at making videos.
But there is plenty of room for interactive things.
Even for a completely scripted video, you want the development environment to be interactive.

There should be a good way to add sliders and such for random inputs.
So you can explore.

The interpolation and scripts overlaps this.
That requires you to have a schedule that is easy to edit.
I'm picturing a schedule with only one item, but why limit it.
Maybe the schedule is enough.

## Project Structure

Background!
This describes the entire npm package & git repository, not just the instant-startup idea.

In an ideal world I could imagine one npm package for all the tooling (the play button, the logic to encode frames, the class that merges all the audio clips according to the schedule,etc) and another for each video I wanted to produce.
But that's a pain.
I have one big project.

Eventually I want to revisit this.
Especially to extract [glib](src/glib/README.md) as its own npm package.

- /dev covers the tooling
- /src covers the content

The content could be subdivided even further, one directory per video.
But there is a lot of sharing between the projects.
Sometimes it's something library-like, like a function for adding rounded corners in an animated fashion.
But the `Showable` interface is intended to be recursive.
So my next video might reference one of my previous videos, and it might actually reach right in and play part of the old video in the new video.

At run time I use use the `http://localhost:5173/canvas-recorder.html?toShow=sierpi%C5%84ski` toShow parameter to say which video I'm playing.
And I use the <select> to pick from the tree of `Showable` objects even more, to zoom in.

## "Widgets" and "Plugins"

I don't have a lot of details about the interface yet.
At a bare minimum I'm thinking I need something like a control from Delphi or Visual Basic.
I.e. I can select a tool from a palette and I can drag a rectangle on the screen and that will cause arbitrary code to run and display the right thing in that rectangle.
There is some simple, well defined interface for adding code to that list.

The exact details of the interface will look a lot like a standard video editor timeline.
Where CapCut lets me add text, video clips, sound clips, animated gifs and a finite number of other things, I want to turn that into an interface or API.
I want to add my own code.
Otherwise, this is just another timeline object.
It will include:

- Start time
- end time
- list of properties (like font size, background color, transform, ..., and some new ones) that should be available in the keyframe editor.

I guess I was thinking "widget" is one of those objects that we can put on the screen.
I guess I was thinking "plug in" is a library that gets added to the system, like a dll.
"clip" can mean almost anything!
Don't read too much into my terminology.

## Where does the TypeScript widget code live on disk?

It seems like the bulk of the typescript code will continue to live where it does now.
It has to if I want VS Code's support while I type.

Maybe Visual Basic (yuck) is the better metaphor.
You create the widgets in C.
You configure them and a little code to glue them together in VB.

There might be some small bits of javascript code mixed in with the config data.
For example, the config stuff that's in the browser's local storage will include a lot of interpolation schedules.
And those will include an easing rule.
I have (about) 4 standard easing rules.
My TypeScript code accepts any function with the right signature (`(progress:number) => number`) as an input.
If you had a short custom easing function, this seems like a very reasonable thing to store as a string with the font size and background color.

Another example:
From the gui will be easy to say, "Start this clip 1,500ms after “Chapter 2” starts."
(One number for the offset, and what is that relative to?, just like we're doing now.)
But I might want to shove some code in that same location, just wrapped up as a string, and put it with the rest of the config info.
Something (very crudely) like "lerp(67%, chapter2.end(), chapter3.start())"
This is the shit that made HyperCard amazing (and made VB almost useable).
You shouldn't have to create a whole new widget or api or anything serious.
You shouldn't have to add "lerp between 2" to a menu!
This is just a small one-off, and the interface is a function that returns a time, and that's super flexible.

JavaScript is good at callbacks and executing strings.
I'm sure we can make something work.

Regarding security, I have no good answer.
I've considered similar things in the past.
For now, I'm focused on short things, so there's less room for abuse.
And for now it's all local.
The problem seems to come when you start sharing things:
I send you a power-point-slide-like-object, and it includes arbitrary code that will be executed in your browser!
But it's only running in the browser sandbox, and what are we worried about, #SoME5 spyware so my competitors will have access to my next presentation before I publish it to YouTube?
I have no good answer.
But this could be very powerful and cool.

## ?toShow= / list of videos

This would be a slight variation from what we've been doing.
We just added a menu, and if you don't ask for a specific video we show you the menu.

The new proposal is more like Delphi.
If you don't request specific project, you get a new, unnamed project.
Whatever project you are looking at, it should be easy to switch projects.

`?toShow` is, of course, a quick and dirty solution to a problem that is still evolving.
