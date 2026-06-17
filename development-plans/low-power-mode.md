# Low power mode

Issue:
Some items take a lot of resources to draw properly.
We should have a way to disable that for development.

**Status**: Complete

## Power vs Speed

The issue is seldom the frame rate.
I can do an amazing amount of stuff at 60hz.
And even when things are slow, requestAnimationFrame() degrades very gracefully.

Also note that my laptop can only _encode_ at about 80% of realtime speed.
That runs on dedicated hardware and that rate never changes.
So as long as the main part of my code is running faster than 80% of realtime, the encoder will limit the speed of saving.

The issue is that sometimes my laptop gets very hot.
And if it's not plugged in, I'm draining the battery too quickly.

## Worst Offender

Currently there is only one thing that is causing me any trouble worth mentioning.
The halftone shadows are very resource intensive.

There is no problem disabling this in development.
In development I'm usually looking at a preview that's about 30% of full size.
(30% in each dimension.)
And the shadow is meant to be subtle and not get in the way.

I want to set up a framework where other effects could also be disable or limited.
However, this is the only example for today.

## Framework Change

My suggestion for the main program:

Add a pair of radio buttons to the top left corner of the screen, just to the right of "Zoom:" and the corresponding \<select> element.
"High Quality" vs "Low Power".
This should default to "High Quality" on a fresh start.
The current state should be saved in session storage, like the bulk of the application's settings, on a refresh.

We respect this GUI setting in development mode.
When we record we _always_ use "High Quality" mode.
(I've tried various low quality recording options from time to time, but I seldom if ever use them.
That's what live / development mode is for.)

Add a corresponding field to ShowOptions.
It should have type `"High Quality" | "Low Power"`.
This is _not_ optional.
Most code will just copy the existing field (often like `const newOptions : ShowOptions = {...options, timeInMs: fakeTime}`).
The top level code needs to set this value.
Let tsc and the LSP tell me if we missed anything.

### TSX / Command Line Version

Don't forget `npm run record`.
This _only_ does recording, never development stuff.
So this program should always set the mode to "High Quality".

## Fix for Halftone Shadows

Note: We tried some simpler versions of this effect.
The naive version tried to reduce the image size all in one step.
It looked really bad.
It was distracting.
Showing nothing at all is better than showing that bad version.

Suggested fix:
Completely disable the shadow in low power mode.

Draw the white background.
Draw the foreground images on top of that.
Do not create or use a temporary canvas.

The relevant code is all hiding inside makeShadowDemo(), so the change should be small and localized.

I've considered some simpler versions of the shadow.
But I don't want to think about those unless the suggested solution fails.
