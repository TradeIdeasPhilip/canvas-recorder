# Chapter Selector

The current `<select id="chapter">` needs a **complete** overhaul.
Almost nothing about the existing version is worth saving.
The original design was based on guesses from before most of this project existed.

## What does it do?

### Root for Visual Editor

This selects the root element in the Visual Editor.

This is a place where the current implementation is flawed.
Currently I cannot select a "removable" component.
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

## How I _currently_ Use the Chapter Selector

In practice I typically have a presentation full of top level items presented in series.
I sometimes call these "slides" or "chapters."
I often switch to one slide when I'm working on that.
Or I switch to the top level element for the video if I want to watch the entire thing or anything beyond a single chapter.
I almost never select anything else in the chapter selector.

## Filtering and Grouping

Originally there was some trash in the chapter selectors, so I wrote some rules trying to filter it out.
So much has changed and I don't remember the original complaints very well.
Initially lets do no filtering, and we can add things back if and when I see a problem.

## Limits Must Follow Duration Changes

Durations now change all the time: typed into the Visual Editor, dragged on the timeline, or
changed by adding and removing children.
Saved state is also restored *after* the page first builds its lists, so even a fresh load
changes durations.

- Limits taken from a Showable should follow that Showable as its duration changes.
- Limits the user typed in should stay put.
- Updating the limits must not disturb editing: no stopping playback, no losing the selected
  component, no rebuilding the editors.

The old selector got this wrong at first: it computed every chapter's start and end once, at
load, so `galaga` showed a 0 ms chapter after its saved clip was restored.
The interim fix is `refreshChapters()` in `dev/canvas-recorder.ts`, called from both root
listeners' `scheduleHasChanged()`.

## Decisions (10/12/2026)

- **Matching removable components across history:** by position and registry key.  No IDs.
  IDs have been considered many times and cause more problems than they solve.  Confusing
  cases can be constructed, but they aren't expected in practice.  If it goes wrong, revisit.
- **Picking a root sets the play limits by default.**  A **Keep play limits** option leaves
  them alone.  Use case:  watching one section over and over while fixing several things in it,
  including with the Load dialog.
- **A component must never vanish from the list because of its duration.**  This happened:
  a slide's duration was set to 0 by accident, the list refreshed, and the slide being worked
  on disappeared, so there was no good way to fix it.  Zero length used to be a stand-in for
  "background component".  If an explicit filter is ever needed, add something like
  `Showable.canBeRoot`, defaulting to true.
- **Everything on the left side survives a reload,** the limits included.  The right side is
  being discussed in [multi-window-sync.md](multi-window-sync.md), stage 0.

## Where the hard parts are

1. **"Now" in the Visual Editor used to mean "playhead minus chapter start."**  It must be the
   root's start, because the limits and the root can now differ.  About 15 places used it:
   + Add, ← now and Go To in the schedule editor, the timeline, ✂ Split, the Handwriting
   panel, and seek.  A missed one is a silent bug, like a keyframe added at the wrong time.
2. **Removable components as the root.**
   - Load and undo find the root in a saved tree with `findSerializedNode()`, which only
     follows fixed children.  It needs to follow removable ones too, by position (see above).
   - A whole-video Load rebuilds removable components as new objects, so the root has to be
     found again by path after every Load, falling back to its parent if it's gone.
3. **Finding things by path.**  Needed for item 2, for restoring after a reload (today by an
   index into the list, which shifts), and for multi-window stage 0.  Build it once.

## Stages

Each one ships on its own.

1. **Done.**  Root and limits are separate:
   - `rootStartMs` and `playheadInRootMs()` for everything in the Visual Editor.
   - `limitsShowable` and `applyLimits()` for playback.
   - **Keep play limits** checkbox, plus a **Play this one** button that sets the limits to
     the root.  Both are saved across reloads.
   - A root with no length plays its nearest ancestor that has one, and says so.
   - Removed:  Continue, Previous / Next, and the table.
   - The list no longer merges single-child chains (no more "Galaga ⏵ Timeline"), shows
     the names you typed, and keeps zero-length *containers*.  Zero-length leaves are still
     left out, because showcase would otherwise list a couple of hundred more entries.
2. **Editing the limits.**  Each end is either "follows X's start / end" or a typed number.
   The render dialog uses the same limits.
3. **A breadcrumb of what's active at the playhead,** each item clickable to edit or play it.
4. **Removable roots,** per "Where the hard parts are", items 2 and 3.
5. **Maybe:**  the full drill-down timeline with a vertical playhead line.  Wait until the
   breadcrumb shows what's actually wanted.
