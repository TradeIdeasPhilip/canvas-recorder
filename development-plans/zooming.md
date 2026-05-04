# brain storming on zooming

discussing Interactive mode only.
saving a video is still pegged at 4k.

## Rationale / User story

When you watch the video, mostly you want the entire video to be visible on the screen.
So you zoom out as much as you have to to make it all fit.
I always have to zoom out (shrink the image) at least a little because my entire screen is less than 4k.
If I want to make room for my tools and for chrome dev tools, then the image gets to about 1/4 it's original area.

Of course sometimes I care about a small detail and I want to zoom in to see it.

But the big concern is editing.
**When I place something on the screen I want pixel perfect layout.**

Currently the only user interaction is a very primitive UI.
I can hover, click or drag to see my mouse position written on the screen.
This takes care of converting mouse coordinates to 16x9 coordinates.
Eventually I want to replace that with better UIs.
For example, under certain circumstances I should be able to move something on the screen, and that updates the timeline.

## Layout

Currently the canvas grows to take most of the width of the browser.
Sometimes that's the right answer.
We need to address the layout eventually.
For now let's say that the canvas will resize for reasons beyond our control, and may continue to change at any time, but the details will be different than they are now.

## Resolution

Currently the canvas updates its internal  [width](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/width) and height to match its external [width](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/width) and height.

This is probably overkill.
I loved the *idea* of SVG deferring any pixilation until the last possible moment.
In practice I notice no difference in performance when the canvas is tiny vs large.

Let's just say that the canvas size is fixed at 4k resolution.
That simplifies a lot of things.

Hmmm.
Now canvas.width and canvas.height are *the* source of truth.
We can set them once in the \*.html file.
Anyone else who needs them can read them from here.
If and when I allow these values to change, this is where I will change them.

## ViewBox

Let's keep the initial transform.
The size of the screen is 16x9.
I love the idea that the final resolution is an implementation detail.

## Aspect Ratio

**Never** show the video at the wrong aspect ratio.
If the area available in the layout and the video don't have the same aspect ratio,
we can letterbox or we can let some parts get cut off, possibly both.

## Zoom

Seems like there are two top level options:
* Try to show everything, automatically changing the zoom level if the window size changes.
* Show at a specific amount of zoom.  If the window size changes, something might get cut off, or blank space may be exposed.

Simple drop down listing the standard zoom options.
"Zoom to fit", "100%", "50%", "200%", and "Custom".
Custom will allow you to drag and select a rectangle, any level of zoom.

100% always means device pixels, not css pixels.

## Extra space

Sometimes you might have extra space available.
That is unavoidable.
Simple case, the aspect ratio is wrong so we use a letterbox to avoid cutting anything off.

You may want extra space for other reasons.
As you are editing things, it might make sense to drag some things partway off the screen.
So you should be allowed to pan past the end.

But, that's not the common case.
When possible, avoid extra space.
Example, when I hit a hot key I expect the screen to zoom out 2x, normally I'd expect the center to stay centered, *but not* if that adds more unused space to the screen.


## Panning

We will need some way to pan.
Presumably dragging the mouse will pan, that's how it works in a lot of contexts.

## Pixelation

If the image is being shrunk to fit on the screen this is irrelevant, the defaults work fine.
If the image is being displayed at 100%, it's completely irrelevant.
If we're zooming in, I want it pixellated.
The only reason I'd bother to zoom in is because "I wanna see them pixels."

## Implementation

Lots of options.
Maybe make css do most of the work.
A parent div will take care of the layout.
The parent will crop the canvas if we zoom in too much to show it all.
We use a css transform to crop and pan the canvas.