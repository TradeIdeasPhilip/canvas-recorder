# Rotate and Auto Size the Multi Text Component

Proposal:

Add the abilities to rotate the text and and to do various auto sizing operations.

## Rotations

Currently rotations are done with a seperate `SlideComponent`.

The Multi Text Component class already handles scaling through the font size, skew via the "oblique" property and and translations via the position or rectangle property.
The only major piece missing was rotations.
_Maybe the GUI will make more sense with the rotations done here, too_?
I'm not certain.

See the [proposed Wrap button](./add-component-dialog.md#add-wrap-button), which will make it easier to add a rotation to _any_ type of component.

Are rotations intertwined with auto sizing?
At first I thought about them together.
Now I'm thinking these are two seperate projects.

## Auto Sizing

I've got an example of auto sizing in galaga.ts.
The individual slide does the auto sizing and it's a bit more work than it seems like it should be.
It seems like the Multi Text Component could include options for auto sizing.
The individual slide would have no interesting code;
it would set the bounds and the content and select a few settings to control the auto size.

My question: **How many cases do we get into**?
Looking "from the helicopter" it seems like there are multiple questions, like whether or not the width is fixed and whether or not the height is fixed.
These seem to overlap and we will probably have to write code for each combination of these and more.

### What to Display in the Visual Editor's GUI

Notice that the TextComponent in simple-text.ts is different from the Multi Text Component.
One uses a point to set the position of the text and the other used a rectangle.
In fact that should depend on your other settings.
You might get a point or a rectangle and it can change.

You actually might get a hybrid:
What if the text is fixed width, either word wrapped or auto-sized, but the height is unlimited?
We might want to display a line segment with three circles.
The two on the ends work the the top or bottom line of a rectangle, where any change in y position applies to both.
And the circle in the middle works like the circle in the center of a rectangle moving the line segment without resizing it.

And the height might be constrained but not the width?

Alignment and baseline only make sense sometimes, and (maybe) should be removed from the TypeScript type (one record records a lot of details, grouping any properties that depend on each other into one big property)

Do you ever need word wrap _and_ auto-size together?
What if word wrap is not sufficient on its own?
HTML just lets things poke out of the container.
If we're already implementing auto sizing, we might as well make auto sizing the fallback when that _and_ word wrap were both selected.

`ParagraphLayout` lets you set the width to `+Infinity` when you want to disable word wrap.
In that case it determines the `width` based on what's actually used.
Otherwise it returns the `width` you requested.

Changing the size to make things fit left to right is easy.
That's a simple transform, scale by desired width / current width.
But up and down might be more complicated.
If you are using word wrap, and we make the font size smaller because the document is too long, you never know for certain how much smaller to make the font size to get it perfect.

### Can you freeze the current settings?

What if you use the auto sizing to help you lay out your biggest item.
Then you want to freeze that and make all of the messages use the same sizes.
I.e. Auto sizing becomes a development time tool and is not run while playing the video.
This won't be the only use case, but it might be a common one.
