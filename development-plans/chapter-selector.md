# Chapter Selector

The current `<select id="chapter">` needs a complete overhaul.
Almost nothing about the existing version is worth saving.
The original design was based on guesses from before most of this project existed.

## What does it do?

### Root for Visual Editor

This selects the root element in the Visual Editor.

This is a place where the current implementation is flawed.
Currently I cannot select "removable" component.
Which means I cannot apply an "undo" or "load" to a removable component, only to fixed components.
I should be able to select a removable component as the root component.

### What to Render

When you render to a file, you can set a start and end time.
Options on the GUI include save the current chapter, or save anything in the chapter list.
It defaults to saving the whole file and you can request and start and end time you desire.

Some version of this still makes sense.
I should be able to grab a Showable from a list and populate the start and end times in the GUI from that Showable.
There should also be an easy way to use one Showable for the start time and another for the end time.

And you should be able to copy from what's currently being displayed.

### What's Currently Being Displayed

The chapter selector puts limits on what can be played.
When you get to the end of the current chapter the playback typically jumps back to the beginning.
You might have to hit the play button again, depending on the current state, but either way it will eventually restart at the beginning of the current chapter.

Currently there is a third option to play past the end of the selected chapter.
That has limited support, e.g. you can't see or change the playback time on the `<input type="range">`.
It was a hack aimed at animations where I didn't know what the duration should be.
Now it's easy to change the duration of a Showable and the "continue" option is completely obsolete and in need of removal.

I like having limits.
I like the way we restart at the beginning.
But, as in [What to Render](#what-to-render) the Showable objects in the tree are only suggestions.
The user should easily be able to set the limits to match a Showable in a `<select>`.
But he should also be able to adjust each end to anything he wants.
And the Showable tree should also be available to set the start and end times separately.

### Where in the timeline are we?

One of my concerns in the `<table>` near the `<select>` was what's the previous chapter and the next chapter.
I never really used the buttons to jump between a chapter and its siblings.
And I seldom looked at the statistics in the table.

I think the concerns behind the table are still important, but the table itself did not help.
Really this table was trying to answer normal timeline questions.
Things like: what's next?

Where the table really missed out was the ability to drill in.
I could easily jump to a sibling or an ancestor.
What I often wanted to know was what subchapter was I in.
I can imagine a timeline with the entire tree of children, and a vertical line highlighting the current time and all of the Showable objects currently active.
Or at least a list of them in a `<select>`.

### Are these items all related?

I've listed several places where the current chapter is used.
Currently the visual editor and the limits on playback are tied to each other and they always change together, but the current chapter is only used by the render to file routine when the user asks for it.

We need to change this so that the playback limits are disconnected from the Visual Editor.
For one thing, the playback limits should no longer be limited to a specific Showable, but the Visual Editor root still is.

It should be easy to go back and forth between those two.
Maybe a button on each Showable in the Visual Editor that says "show this", setting both of the limits, jumping to the start, and hitting play.
Maybe each item in the chapter selector's visual timeline includes buttons like "Load in visual Editor", "Play this", "Start playing here" and "stop playing here".

## Filtering and Grouping

Originally there was some trash in the chapter selectors, so I wrote some rules trying to filter it out.
So much has changed and I don't remember the original complaints very well.
Initially lets do no filtering, and we can add things back if and when I see a problem.