# Editor with Changeable Schedules

The current Visual Editor is very powerful, but it has a very strict structure.
Here are some changes that we need to add more interesting components.

Normally you can change the contents of a schedule at any time.
But the Visual Editor currently expects the number and types of schedules for a component to be fixed.
When I say "changeable schedules" I mean I want to add the ability to add and delete schedules from within the Visual Editor.

## Scalar Fields

A component should have a way to store fields that are not on a schedule.
The component has a single value for this field.
The data types will probably be the same as for schedule fields, or at least a significant overlap.

These should be serialized and deserialized, just like schedules.

These should be available in the Visual Editor.
Hopefully all of the same editor controls that we currently use for schedules will be available.
They work well and hopefully we can save work by reusing some code!

This has value _beyond_ my other point about "changeable schedules".
This is _required_ for "changeable schedules", because these fields will tell us how many additional schedules we need to add.

## Hidden Fields

I'm referring to both the current schedule fields and to the proposed scaler fields.

Not all fields should be displayed with the Visual Editor's normal mechanisms.
They should _still_ be serialized and deserialized.

Use case:
As described below, the components might supply their own editor.
That editor will change the field, instead of the default editor for that field type.

Simpler use case:
Maybe this data is too rare and/or complicated to get its own editor.
When we create a component, we fill that field in.
That might be in TypeScript code.
Or, we might hand edit a serialized JSON file to change the value.

## Use Case: Path Component

Imagine a simple path component **including a path editor**.
Not to replace a real vector art program!
But something tightly integrated with the rest of this project, good for simple paths.

Start with an SVG \<path> element:

- A path property
- fillStyle property
- a strokeSTyle property
- a lineWidth property
- Not everything in the svg element, but all the fields that I usually specify in this project.

The path property is a _scalar_ string.
Initially it will be driven by a normal string editor.
It can have values like "M 0,0 L 1,1" or "M \$\$point\$\$ L \$\$point\$\$".
The latter requests two schedules, one for the first point and one for the second point.
The Visual Editor does not know the details of what "\$\$point\$\$" means, only the component.
This is accomplished by callbacks.

On every change that the user requests from the GUI, call a custom (and optional) method in the component to notify the component of the change.
Probably a simple wakeUp() with no arguments, for simplicity.

In the case of the path component, it will parse the path string and count the number of \$\$point\$\$ strings it can find.
Then it will change its own `schedules` field to add or remove schedules.
(There are more details, like not erasing all the user's data while editing.
But that's an implementation detail of the component.
The Visual Editor its interfaces don't care.)
Then it will end with a callback to the Visual Editor saying that it has made changes and the Visual Editor should refresh its schedules.

You can ask the Visual Editor to refresh at any time, not just in the wake up call from the editor.
For example, the component might have a button or other control and the user can go directly to the control, skipping the Visual Editor.
Presumably the Visual Editor should check for changes in children in the same place.
This code is so far, ridiculously far from human perception, maybe keep it simple and delete and recreate that whole part of the gui.

And we need an optional custom editor panel for each component.
This would appear in the bottom right quadrant, with all the other "fields" or "properties" or "schedules".
The custom editor panel, if it exists, is in the top of that quadrant.
Under that are all of the scaler fields.
And at the bottom are the existing schedule fields.
These are all in the same \<div> and they all scroll together.

In the case of this path component, this custom "editor" is all text output, no input.
It includes help text, explaining how to use this control.
And it shows error messages when relevant.

With all of those callbacks in both directions, it seems nice to wonder about grouping them.
Maybe something as simple as grouping all update calls (in either direction) until at least the end of the the current event in the event loop.
requestAnimationFrame would be perfect!
I don't feel so bad about destroying and recreating things from scratch if we limit it to once per animation frame.
But does that work if the message comes from the Visual Editor to the component then back?
I don't want to skip an animation frame before reacting.
Maybe it's enough to make the calls from the visual editor _before_ making the calls to the visual editor.

I'm not sure where this one will land.
Even a minimal version of this will be powerful and useful.
I want to drag our existing point editor and have that control a path!
This might get additional features and start to look more like a normal art program, less like a programmer hack.
I'll have to try it out and see what I think.

## Use Case: Text Component

**Update:** A decent first prototype is working and available as "Multi Text".

This one is more complicated, but maybe we can start with a subset of this.

The current text component offers a lot of options, but they apply to all of the text.
You can't make just one word bold.
(The current component is a placeholder.)

What we need is a series of blocks of text.
Each block gets most of the same options as the entire Text component.
Text, bold, obliqueness, color, etc.
These could even be stored as sub-components, if we don't want to create a new type of thing.

The top level text component will need the ability to create new children.
Similar to the normal add component button.
But maybe we can disable that button, and add our own which only creates text segment components.
And there is no other way to create text segment components.

There are multiple types of children!!!
There is a simple version with all the current options.
But then there's a different version that will use strokeColors() instead of stroke.
It will have most of the same options, but instead of a single stroke color it will need a list of colors and a few more options related to animation.

The top level is responsible for the layout.
It goes to each of the children and asks them to contribute to the layout.
These text segments are like \<span> elements, wrapping and sharing baselines, but each with its own formatting.
And it gives the children what they need to display their segments.
The children will get the paths generated by their text, and maybe information about the whole layout.

It might make sense to separate the text content from the other properties.
In particular, you might want to create only a few styles, then reuse them a lot.
You only need one "underline" style that can be shared by a lot of blocks of text.

And consider the opposite case.
How do we make it easy for someone just entering one blob of text.
Even if the eventual plan is more complicated, it is common to start with the unformatted text.

"Formatting Pieces of Text" in showcase.ts would be a good place to start.
Two types of children, both components.

- A block of text.
  - A schedule sets the text.
  - A schedule sets the style.
  - The style is a number, chosen discretely.
  - The number is an index into the list of styles.
- A style.
  - Copy most of the fields from the current Text component.
  - And another version that works with strokeColors(), as described above.

The top level will keep some properties from the original text component.
In particular, any inputs to ParagraphLayout.align().
Currently:

- `width = Infinity`
- `alignment: "left" | "center" | "right" | "justify" = "left"`
- `additionalLineHeight = 0`

(Width cannot be infinity.
We do not support that in our current editor.
For now I'm just using a big number.)

### Named Text Styles

The current prototype expects each block of text to pick a style from a list.
The text component looks at all of its direct descendants and it puts all of the style components into that array, in order.
Each block of text provides an integer, and that is used as an array index.

That works, but it seems like a pain.
Named children would avoid lots of problems.
Like if I delete one item, I don't want to find all of the references to the following items and subtract 1 from each index.

Also, we already have support for selecting a string from a list without interpolating.
(I.e. a discrete selection.)

We already have a constrained string input.
We could give that input a list of valid names.
But that list might change as people edit things in the Visual Editor.
The current code might already be good enough because you can't change the list of valid things while the list is visible.
You'd have to switch to a different tab and when you switch back the Visual Editor will reread the options.

Finally, names give us more ability to share styles.
When a block of text requests "bold", first we look for a style named "bold" in the current multi text component.
If it does not contain a definition of "bold", then we go up the hierarchy.
If there is a conflict, the closest entry wins, the one furthest down the tree from the root.

Here's a crude prototype:

```
type MoreStyles = {
  here: ReadonlyMap<string, TextFormatComponent>;
  moreStyles?: MoreStyles;
};

function getStyles(
  name: string,
  search: { moreStyles?: MoreStyles },
): TextFormatComponent | undefined {
  if (!search.moreStyles) {
    return undefined;
  }
  const current = search.moreStyles.here.get(name);
  return current ?? getStyles(name, search.moreStyles);
}
```

Each Multi Text control will build a list of styles.
But other controls can be created for the sole purpose of adding more config options.

I was thinking about adding `moreStyles?` to showable.
So on the way down, as we recursively call Showable.show(), most code will just copy moreStyles as is, if it exists.
But some components will add to it using our LISP style, cons cell style, scope object.
But that isn't sufficient for the editor, is it?
The editor wants to know all the options even when we aren't displaying anything.
Look at how the Visual Editor solved this for transform matrices.
Same problem, the Visual Editor needs access to the entire path from the root of the tree to accumulate all the info it needs.

### TODO: Discrete only schedules

Some schedules should disallow any easing functions in the Visual Editor because they will be ignored when rendering.
This should be the default for strings (but not for colors).
The default for all other fields is a to allow easing.
A "duration" is a third option; a schedule can work in exactly one of these three capacities.
Or duration implies discrete, if that's a more convenient way to think about it.
(In that last case I might say "non-ease-able" instead of discrete, as that would be more accurate.)

## Use Case: Slide Deck

I don't know exactly what I want, but the integration could be a lot tighter than it is.

It seems like the text component is facing similar issues.
You have schedules pointing to components.
If you delete a component, should the computer automatically renumber the components?
Maybe names would be better than numbers?!

## Use Case: Transform editor

Currently we use strings as transforms.
And we can only animate them in discrete steps.

The final version of the transform editor will have a lot in common with the path editor I described.

We will have a list of numbers or points that we can control separately.
And we have a transform string template like `scale([0] [1]) translate(3px, [2]px)`.
The main part of the Visual Editor needs to know about the schedules, and the exact number and type of the schedules can change.

The simplest user interface would be to let the Visual Editor give you a normal string input for the template.
That's a scaler.
The component would have a callback that would check the string as the user types and would create or destroy schedules as needed.
And the component would have a simple custom "editor" panel that displays help and the current status including any error messages.
_This part is exactly like the proposed first version of the path editor._

The difference, of course is how we display markers on the screen.
Initially you will see the content update in real time.
But the draggable markers will come later.
This will be very powerful if we do it right.

## Big question: What does the changing number of schedules code look like?

Is this easy or hard?
Is this simple or messy?

What happens when we save things?
Do we need to restore the first part of the component, to know how many schedules we should create, then copy those schedules from the saved json object after we know what we're looking for?

## Font Family, Weight and Style

This is a small, self contained step forward.
I want to add a few specific things to TraditionalText.

### Sources of Font Data

I'm currently looking at document.fonts and window.queryLocalFonts().
These seem to have very similar information, but in different formats.
I think we need them both, merged together.

It seems like window.queryLocalFonts() groups weight and style together into one field called style.
And it sometimes uses "book", a non-css name for a font weight.

Unknown or unexpected content should be written to the console.
I.e. anything that doesn't fit neatly into the requirements below.

### Font Style

After some research I found that the canvas has little if any support for oblique fonts.
So we can make this choice very simple for the user.
A constrained string input labeled "style" with options "normal" and "italic".

We will show the user information about what is available.
We will not give any type of warning if the user tries to use italic and it doesn't exist for that font.
The canvas always synthesizes italics if it needs to.
But it would be good to see a list of supported styles, "normal", "italic", and "oblique".
I've never seen that last one, but let's just record whatever information is there and report it to the user.

This will require a new panel in the Visual Editor dedicated to this component.
That's required to display information about the currently selected font.
This will require the Visual Editor to ask that component to refresh the panel any time the user changes font family.
I've discussed these features above, and this component is a good place to start.

### Font Weight

This should be a standard numerical input.

We should collect information about the weights available for each font.
We should display information about the weights of the currently selected font.
Just like the font style, we will display this in a new panel in the editor specific to this component, and we will automatically update when the user changes font families.

What if the user picks an invalid weight for this font?
We might show a warning, but we won't show an error.
Warnings make sense because lots of things keep changing.
If I change a font family and my font weight is not supported any more, some red ink on the screen would be appreciated, a beep or dialog box would **not** be appreciated.

The font weight is complicated.
Some fonts offer discrete values.
Others offer ranges.
I think we can make some simple assumptions:

- A font will have discrete values or ranges, not both.
- If it uses ranges, we assume the ranges are continuous (even if delivered in separate FontFace objects) and just care about the min and max.
- If a font has different font styles, etc, we can merge all of the ranges or discrete values together.
  - They are probably all the same.
  - We have one set of font weight ranges per font family

We can show _numbers_ in the new panel as as _names_.
Something like "300 (Light), 350, 400 (Normal)" or "300 - 450 (Includes Light and Normal)".
The editable part will just be our normal number editor.

Note: You can switch between different families over time.
So I don't know how complicated we need our warnings to be.
This is just a first prototype, don't go overboard, but some simple warning when one or more weights in the schedule is out of range for one or more of the font families in the schedule.

### Font Family

Note: You can switch between different families over time.
So the new panel should list information (font style font weight, etc) for all font faces currently in the schedule.

This should be a constrained string input.
We know all of the fonts in advance.

Problem: I currently have 317 font families installed on my computer, and most of those came standard.
I have 6 additional fonts currently loaded from the web via my \*.css files.
That's a lot for a standard `<select>`.
Maybe we need something more like a combo box, where you can type to search, but can we still keep it constrained.

Problem: `<select>` does _not_ give you instant feedback.
For an `<input>` you can switch between "input" and "change" events.
For a `<select>`, both fire only on commit.
It sure would be nice to view updates immediately, like we do with our other controls.
It would be nice for all constrained inputs, but especially for this long list, especially when we are displaying interesting info in the new status panel as well as on the preview.

## Path Component, revisited

I like the general style of the Multi Text component.
It uses sub-components to customize different parts of the rendering process.

A path component will cant have 1 or more sources of a path.
It cant have multiple components that draw the path.
This works well with my past experience.
E.g. a shadow or glow under the main path.

Source of path:

- A simple string. A valid [path string](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/d).
- An editor that allows for named points. The master string will look up values in a series of schedules. Points can be reused! Sometimes I need two points to be _identical_, and I worry about round off error unless I use an exact copy of a number.
- If a MultiText control is a direct descendant of a path component then it exports its path instead of rendering it.
- Maybe others.

Path renderers:

- Standard fill.
- Standard stroke.
- strokeColors()

Renderers do not have to be direct descendants of the path.
This allows you to use a slide component, optionally, to transform it.
In practice I sometimes want to make paths available at the top level, then they appear in multiple slides, each with its own transform.
This also allows for a filter. This will read a path from its ancestors, modify the path, then reexport a modified version of the path. "Handwriting Effect" is the archetypical example.

**Only one path** per Path component?
I'm not so sure about that.
That would make sense if only direct descendants could be renderers.
But I could see this exporting a lot of sources, each with their own name, at the top of some big subtree.
Renders can pick sources by name, by analogy to text segments selecting text formatters by name.
Path sources must come directly under a Path Component, just a text formatters must come directly under a multi text component.

## Font Family Editor

**Status: Complete!**
Looks amazing!

See [./local-font-notes.md](./local-font-notes.md) for some bug reports.

Used by the Traditional Text Component.

~~Currently it is~~ For a while it was unusable.
While adding the ability to type any font family name, it is now very hard to select a font.
You have to hit backspace because it is trying to _search_ for a string that is initialized to the current font name.
We need to separate the idea of the current font and the current search string.

We need a different editor for the font-family type.
The data will still be stored in a StringScheduleInfo.
We display the value as a string, but...
you can click on the string it brings up a dialog box.

The dialog box will cover the entire bottom right section.
You will see immediately updates as you change things.

There will be a fixed list of fonts.
These will be populated from document.fonts _and_ window.queryLocalFonts().
Currently we only use document.fonts.
Remove the option to type a custom font name.

The top row has an \<edit> with a search string.
Split that string on whitespace.
Display a font if its family name contains each substring from the search string, case insensitive.
(Therefore the empty string means to display everything.)

The top row also has an edit with the sample text, defaulting to "ABC def 0123456789".

The "client" / expandable part of the dialog box is a table.
Use the standard css scrollbars.
The top row is the initial font, from when we opened the dialog box.
The remaining rows are the fonts that matched the search criteria, in alphabetical order.
The left column is the sample string, rendered in the the row's font.
The right column is the name of the font family, rendered in the default font, for readability.

The currently selected font will be displayed with a different background color.
When you click on a row, that row's font is selected.
That change will be made to the schedule immediately so the main display will immediately update.

If you change the search criteria and the currently selected font is not already listed, i.e. not the initial font _and_ doesn't match the search criteria, then add the font as the second line, right under the initial font.

The bottom row is an "OK" button.
There's no need for an explicit cancel button.
The initial value is always at the top of the list.

It's possible that we will read an invalid font name from a schedule.
(Maybe I uninstalled a font, whatever.)
The important thing is not to crash.

## Editing Transforms, second attempt.

**Status: Working!**

The transform editor only lives in the Slide Component.
I plan to keep it that way.

Currently we have a list of transform strings.
These can be animated but they are all discrete values.

Eventually I can imagine tools with markers on the canvas, like the point editor, but for various transform primitives.

For now I want something simple that I think we can do quickly.
It's a little bit ugly but it's a good start and it will give us 100% of the runtime functionality that we need.

We will have a fixed number of numeric inputs.
Initially lets say 10.
If you only need to animate one value, just ignore the other 9.
If you ever need 11, you have to go in and change the source code.

We have one scalar string for the template for the transform.
It will be something like

- `"scale(5) translate(1px, 3px)"`
- `"scale(𝓐) translate(1px, 3px)"`
- `"scale(𝓐) translate(𝓑px, 𝓐px)"` or
- `"scale(𝓑) translate(1px, 3px)"`

Those special letters are the placeholders.
Each will have a corresponding numeric schedule with the same name.
I chose Mathematical Bold Script because it was the most readable and the most consistent of the [similar alternatives](http://xahlee.info/comp/unicode_math_font.html), upper and lower case.

There will be a special editor panel for the slide component.
Among other things it will list the names of all of these placeholders.
Something like "Placeholders: 𝓐 𝓑", etc.
Add a space between each one so they are _easy to copy and paste_.

The editor panel will also give you the status of your template string.
A simple test should suffice.
Try replacing all of the placeholders with "0".
Try to create a new DOMMatrix with that string.
If that throws, report an error.
The exception does not contain any helpful details about the problem, so just report "syntax error".

And the editor panel will offer simple help.
Include "By default the video is 16px wide and 9px tall. Other length units are not well defined."
And a link to https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform.
Maybe more.

## Custom Color Editor

**Status: Working!**

The built in html color input control was a good start, but it's missing some things.
And our recent addition of the font family _dialog_ worked very well.
So let's make a custom color editor.

Try to keep this out of the way of the canvas.
Maybe it has a fixed size for simplicity, but we always draw it in the bottom right side of the window.

Something like a tabbed design, like a lot of color editors.

One tab lets you type any string.
We'll have a function to check if it is valid.
Maybe use getComputedStyle() on a control to see if the color is good.
This can be a visible \<div> that we use to display the resulting color.

We can also getComputedStyle() to convert anything back to RGB.

We can use the colorizr npm package if we need to do any interesting conversions.
That worked well for me in https://github.com/TradeIdeasPhilip/random-svg-tests.
We can also export complicated css strings; interpolateColor() for example uses the css color-mix function.
We really only need this to populate the sliders of some of the panels.

One tab has recent colors.

One tab lists the colors of [my rainbow](../src/glib/my-rainbow.ts).

One tab has four sliders: red, green, blue and alpha.
Display the resulting color two ways:
"#xxxxxxxx", but only "#xxxxxx" if alpha is at FF (100%).
And "rgb(30% 20% 50% / 80%)", or "rgb(30% 20% 50%)" if alpha is 100%.
Draw the current color in a small square.
And constantly update the schedule or scalar value so the new value is visible in the canvas.
I don't see any need for any more graphics showing off the color wheel or anything like that.
Save the color as "rgb(30% 20% 50% / 80%)", not "#xxxxxxxx", and include an appropriate number of digits after the decimal point.

I haven't had much luck with the newer color spaces, so let's skip those.
Let's add panels for HWB and and HSL.
Again, four sliders each, one per channel.
HWB always saves as "hwb(50deg 30% 40%)" or "hwb(50deg 30% 40% / 20%)".
(Always degrees and %.)
Similar for hsl().
Display these three ways: #, rgb() and the native format that we are using for saving.

The RGB, HWB and HSL panels do not need numeric inputs.
You can go back and forth between those panels and the string input panel, if you really want to set a number precisely.

The sample square can be above or below the tabs, always visible.

Presumably cancel works in the normal way.
Hit the cancel button or the ESC key.
The currently selected color gets added to the recent color list.
The currently selected color is restored to the color when we opened the dialog.

## Better Samples

Currently we use the same list for restoring saved components as we do when hitting the "+ Add to root" button.
That was a good start but we can do better.

By default, keep all of the existing controls as is.

There should be a convenient list of possible values for the "+" button hard coded.
These can be a mix of the existing style and restoring json files.

The user could have a personal favorites list, saved to the database.
Not urgent, as I'm the user and a programmer.

The list could include recent activity.
Like the last 10 items that I've deleted.
Deleting is closer to cutting.
But we save at least 10 of these.
These should probably go to the IndexedDB database to be safe.
I'm afraid that it will be too easy to or delete something by mistake and lose it.
This seems like it will make life better and more secure, just like what we are currently saving to the database.

Ideally we would filter out duplicates.
We remember the most recent N addition to the list.
If an existing item is re-added, it gets moved to the most recent spot.
If we add a new item, and the list is full, we delete as many items as we need to get back down to N.

I did this all the time in MySQL.
I used two keys.
The date and time sorted the list before deleting anything.
And the value was a unique key and I used the REPLACE command.
The implementation will have to change, but I want to repeat this result.

There is just one namespace for all of these cut items.
I.e. you can cut from one project and paste to another.
As long as you are running on the same port number.

### Multi Text

When you create a new Multi Text button from the button you should get two children.
One text segment and one style.
You can always delete these or add more, but this is a good starting place.

### Slide

Currently we display a rectangle for debug reasons.
That should change.
The Slide Component should not draw anything itself.
It should only draw its children.

When you create a slide from the button, it gives you one child.
That child is a rectangle.
Similar to what we have now but:

- Easy to delete the rectangle.
- Lots of config options for the rectangle.
