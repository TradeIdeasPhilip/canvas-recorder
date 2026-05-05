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