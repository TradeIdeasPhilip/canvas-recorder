## Background

I've been building up some tools for creating animations in TypeScript in the browser.
These can be interactive or scripted.
These can be aimed at live display in the browser, or they can be saved to *.mp4 files.
Often the lived display is used for development and the *.mp4 is the final product.

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
I could HTML and TypeScript to create *widgets* to freely mix with the other the features of OBS.

I wish I could find a very simple video editor that that had the same idea.
Basically I'm building that.

The video editor should be *simple enough for my dad to use*.
Which I hope to accomplish mostly through only offering the features that I care about.
Simple things like cutting and rearranging segments of prerecorded video and audio.
And text and arrows.

This OBS style API will be used in two ways.
* Typical reusable features, like adding text on top of a video, should be implemented this way.
* And if you have custom TypeScript code that knows how to draw anything you want on the canvas, you can drop that in as as a widget or plugin.

## Quick Start

Think about creating a new project in Delphi or a new document in Word.
You start the application and you immediately get a blank form or document.
You can start editing immediately.
You can run your program or print your document without saving first.

The program doesn't even ask you for a file or directory name until you ask to save or quit.

It starts with a reasonable default template for your program or document.
You can *easily* change that later.
But most of the time you do nothing.

Delphi lets me create text very easily.
I can type right in the development environment.
I can adjust all of the formatting options.
Some of that text is real and permanent.
Other text is just a *quick* template that will be overwritten in code.

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
I don't have a GUI like that *yet*.
(I currently have all of the scenes in a `<select>`, not a list.)

### Attachment

I need each sound clip to be attached to something in the video timeline.
The start time is relative to the video.
So if I change parts of the video, the sound will move around with it.

I need an easy way to *rehome* a sound clip.
Common case:
I initially make the clip relative to one part of the video, *because that's convenient at the time*.
But I know that the clip should ultimately be attached to something else, in case the script changes.
The GUI should make it easy to change the point of attachment, and automatically update the offset, so nothing changes.

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

I *absolutely* need a good interface for editing these lists of keyframes from the running program.
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