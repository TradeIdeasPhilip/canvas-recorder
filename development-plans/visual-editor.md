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
Placeholder:  Until we create some real code, just draw the outline of a circle to represent these.

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
(**Update:  Done!**  The first dump is available in https://github.com/TradeIdeasPhilip/canvas-recorder/commit/afe86f38f53e22c45be593f9e20b4eef730b7400)
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
5 pointed stars:  https://youtu.be/ykN3wYOBq40?si=fu36cx7TZWJVrHYz
6 pointed stars:  https://www.youtube.com/playlist?list=PLJNSFdg--j7frNYLnOyVen1Rb7SjHRd3C
All source code in https://github.com/TradeIdeasPhilip/random-svg-tests

## Clarifications

Re:  "question is which data"  Honestly, you wrote that code and it worked so I barely looked at it, if at all.  My short term goal is to take inventory of what's already there.  Possibly there are different sections in the database, corresponding with the places where I can hit the copy button.  It should be easy enough to look at the tree that describes the movie and find all relevant editors and put them all together.  Maybe the key for each section in the database becomes a header in the html output.  Please, just show me what we got.

Re:  "The round-trip problem"  Here's the picture in my head.  Very tentative and preliminary, but it's a good straw man at least.  *Most of the time we only care about what's in the database*.  That's the "source of truth".  The rest are "administrative details."  It will be easy enough to add a button to save the current state (or more!) to a json file.  By default we use the current state from the database, but the typescript code will have access to one or more json files.  If a user starts and there is no saved state in the database, we have a fallback.  And we might have options to explicitly load one of these at any time, noting that the current state has already been saved.  There are a lot of details to explore, but I think the basic idea is reasonable and worth pursuing.

The picture in my head is *HyperCard*.  I was the right age and I used that a lot and it was amazing.  I'm picturing the modern typescript code replacing the compiled object code that HyperCard let you import as a resource.  Almost everything else will be in the database.  (As it was in HyperCard!)  That's not 100% true.  I could include javascript code snippets in the database, to be really powerful, but I'm planning to put all code into the *.ts files.  We already have one or more registries for converting strings into TypeScript functions and objects, and that's worked well so far.  (For example, the easing methods available in the schedule editor.)

One more thing regarding the database to git discussion.  I can imagine some people using this tool without doing any programming.  Maybe I'm not doing any custom math, just animating some pictures and text.  Or maybe it's a group project and one person is focused on the programming part and the other person is doing all the layout.  So there would need to be some way to save and load the files to the file system, for backups and such, like a normal program, in addition to any git or typescript integration.

## Small tools and code snippets

All of the values that we save in the database and display in the editor, they should all be easy to access from code.
* In particular, I'm thinking about someone at the console
  * No typescript, no imports, a totally different system for predictive text.
  * Always live and interactive.
* And also small custom tools.
  * Maybe something that I've typed at the console a few times and don't want to type it over and over.
  * Maybe there's a standard "distribute" function (like in PowerPoint and others) but one particular project works on a logarithmic scale.
  * There's no clear line between a small custom tool and a "real" tool, things will evolve.
* There can be internal stuff,
  * think of this like an API, making it easy for a programmer to interface with.
  * But we are still at the early stages of figuring things out, so "API" might be too strong a word.
* Example: `window.VisualEditor.selectedControls.forEach(control => {control.x+=5; control.y += 1;})`
  * This shows the basic scope of what I'm thinking about.
  * Presumably x and y are backed by code and will automatically request a save to the database soon, just like if I'd dragged all the controls with my mouse.
  * The interface doesn't have to look exactly like this; my point is make it short and simple enough that it could be useful from the console.

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
Absolute time *and* ratio of read time to size of the input files and ratio of write time to amount of data copied.

There are lots of options for sound.
I hope we can keep this simple model where we always have one big sound buffer for the entire project.
But there are lower level APIs that I might use as an alterative, providing data as needed instead of all at once.
Need to explore, see if the current approach is good enough.

For now, maybe a very simple wrapper around the sound requests.
In particular, if I'm spamming the reload button, things shouldn't get too bad.
If I hit the button 10 times quickly, I don't want 10 threads all running at once, or worse yet 10 requests queued up for the main thread.
Simple, robust, just enough to keep it working until we decide on the final plan.

Sound is *not* my *first* concern in this prototype.
I haven't recorded the voiceover yet.
But sound will be required by the end of this prototype.
The video we produce will have a voiceover.

At the moment the reload button won't do anything interesting.
We don't yet have code that would take advantage of that.
It would be easy enough to say `duration: 30_000 + 60_000 * Math.random(),` somewhere to make the test more interesting.

Eventually the reload button will be removed.
It will automatically be called by the GUI after a change was made, possibly grouped with other changes.

**Update:  Done!**
The full refresh is very fast!
It takes less than 1/2 second to reload the sound for the Sierpiński project.
The visual parts reload instantly.
Done here:  https://github.com/TradeIdeasPhilip/canvas-recorder/commit/4518aca3213f29ae0593a41af8c603fa8eaf1dd4