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
