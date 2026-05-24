# Two by Two Layout

The Visual Editor has become very powerful.
But there are too many things on the screen and things get lost.
If I have to scroll down to find an editor, then I can't see my preview, and I don't get any benefit from the preview updating instantly.

These changes will lead to a huge improvement in usability.

## Four Sections

I'm splitting the current screen into four different sections.

Each of these should be in its own \<div>.
I'm focused on one particular layout, but others will exist.
I'm expecting the TypeScript to handle the change between layouts.

Create a full screen app.
\<body> uses exactly 100% of viewport width and 100% of viewport height.

First split the screen into left and right halves.
Then split each of those top and bottom.
Initially the top and bottom with both be halves, but they will be adjusted and they should be able to adjust separately from each other.

The title, "Canvas Recorder Development Environment", goes away.
No room.

"Zoom:", \<select> and \<canvas> all go into the top left quadrant.

The "Show Editor" check box is no longer necessary.
We will always show the editor.
Delete any code behind that, we're not going back.

\<button id="reloadBtn" /> and \<span id="scheduleHistoryControls" /> are attached to the top of the top right quadrant.
The row that contains "+ Add to root" will be attached to the bottom of the top right quadrant.
The remainder of the top right quadrant will be be available for the list of components.
That list will have a vertical scroll bar.

\<fieldset id="scheduleEditor" \> will go to the bottom right quadrant.
This will have a vertical scroll bar.

Everything below that, starting with \<fieldset id="liveControls" />, goes into the bottom left quadrant.
That div will need a vertical scroll bar.

## Scrollbars

A wide element or a long word that won't word wrap should not cause a section to be the wrong size.
The section sizes are fixed.
If something doesn't fit, it should get scroll bars.
In particular the list of editable schedules is more than a page tall by itself sometimes.
And the list of components will get long, too.

## Zoom

Currently if I set the zoom to 200%, that makes my entire document very wide.
And I have to scroll down past the entire canvas to find the rest of my document.

The canvas should have a fixed size.
(It can adjust to the size of the document, but not to its own zoom amount.)
The canvas element should have scroll bars, rather than making a container element scroll.

## Thin Layout

A common use case is when I have Chrome's dev tools open.
That usually takes about half of my screen, on the right.
In this case it might make sense to do some responsive design and maybe maybe the four sections all on top of each other.

This idea needs some work.
But this is a common use case.

Zooming in is the same as making the window smaller.
I don't care about the real world size of the window.
If the text and other elements don't fit, we need a different layout.
And I don't care about the aspect ratio, either.

## Full Screen Layout

We will need a way to make the canvas as big as possible, preserving the aspect ratio.

If the window is full screen there will be room for about one row of text above or below the canvas.
The play button, and the rest of that row, seems like a good thing to put there.

Maybe this is the same as the thin layout.
You automatically go into single column layout if the window is too thin to properly display two columns.
And you can manually request single column mode any time you want to make the canvas wider.

If we are in zoom to fit mode (the most common option) then the width of the canvas should fill the window, and the height of the canvas should maintain the aspect ratio.
Limit the height to 100vh and add a vertical scroll bar on the canvas if necessary.

## No Phone Support

This project doesn't make any sense on a phone.
If we really wanted we might make a *very simple* preview window, but that's not required now.
Same for a tablet.
No touch support.