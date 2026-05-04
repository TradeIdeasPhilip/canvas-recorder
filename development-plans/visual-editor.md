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