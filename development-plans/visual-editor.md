Next goal:
Make the visual editor tools more useable.
Ideally most of the work will big done in the visual editor, and only the parts that need to be will be done in TypeScript.

How to save from the visual editor

Changing things that used to be read only
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