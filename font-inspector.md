# Font Inspector

## Current status

I have no real tools for editing fonts.
I've created a few test rigs aimed at very specific problems.
I mostly create the fonts with TypeScript code.
I use the other windows in my project to test the results, i.e. just trying it in place.

## Current Goal

I'd like a window where I could type a letter or a small number of letters and zoom in really close.
I'd like to see lines on the screen corresponding to various relevant data, like the recommended bounding box and the baseline.

There are unlimited things to do next, but let's focus on this.

## Location

Let's put this in shadow-test.ts, as it really is another test.
The showcase is more about examples for people making content.
This is more of a low level tool that most people won't care about.

## Inputs

### Text to display.

A string.
Can be anything, but mostly we're expecting to zoom way in to one character, or just a few.
Don't worry about \n.

### Font Size

A number.
User units (16x9).

This will be the exact size of one of the displays.
The other display will be user zoom-able, but will have a scale, so this is still important.

### Font

Currently 3 to chose from.
Two have slightly different APIs from the third and much different implementations.

We don't have a \<select> style editor yet.
We will need to add this.
The result is a string selected from a list.
Each field can have it's own list.
I don't think the list will change while the program is running.
Certainly not in the case of fonts!

### Size and Position of Fully Instrumented Text

We need a rectangle editor so the user can control the amount of zoom.
Use panAndZoom() to *fit* the bounding box into the requested space.

I can imagine adding custom TypeScript code for context.
The user can easily move the reusable test harness to match his custom code.

### Position of Simple Text

And we need a point editor to set the location of a second copy of the text.
We want this to keep its size, so we don't need a rectangle editor or panAndZoom().

### Boldness

Skip this one for now.
For the moment we only display text in the recommended stroke width.

These are a few options and details that I don't want to think about right now.
Return to this when I have a specific problem I need to solve.

## Display

There will be two copies of the text.

A simple copy will be stroked in the requested size.
Mostly I was afraid that all of extra lines we're adding could make the other version hard to read.
Also, good to see an un-zoomed version.

A second copy of the text will need to be displayed with all of the (metaphorical) bells and whistles.
A rectangle editor will resize it so I can zoom in and out easily.

We will want a scale and grid, like the one we've used in some graphing samples.
(Warning:  Barely tested!  That's part of our job now!)
The units are the same as the font size (i.e. arbitrary and configurable).

Notes on resizing the text:
* Of course the entire path is transformed, that's the point
* And the line width is transformed correspondingly, as if you'd transformed everything together.
* The numbers on the scale and the lines on the grid will move to match the subject.
* But the font size and the line width used on the grid will *not* change when we zoom in.
* It shouldn't be hard, but it's not as easy as a lot of the examples in the code where I transform *everything*.

Initially I need to know the bounding box of the text.
(I mean the height and width reported by ParagraphLayout.
There is no reason to draw PathShape.getBBox(), I can already see that information myself.)

And I also want to see information about the font.
I'd like to see horizontal lines drawn at Font.top, 0 (the baseline) and Font.bottom.
I believe top and bottom are the space reserved for the text.
By default the bottom of one row becomes the top of the next.

In the case of `lineFont` (my main concern at the moment) there is more information available but it might be hard to find.
(I had such great plans for LineFontMetrics.
However, this may be the first time anyone outside of line-font.ts has read this object.)
It looks like we need to create our own LineFontMetrics, give that to the lineFont creation routine, *and* hold onto a copy of the metrics object for ourselves.

When we are using lineFont I want to display horizontal lines at capitolTop, capitolMiddle, and descender.

And display some sort of legend so we know what all these lines are.

## Background references

These are not required at the moment.
They may come up in the future and I don't want them to get lost.

https://tradeideasphilip.github.io/random-svg-tests/path-debugger.html is a tool I wrote to explore SVG paths.
It was aimed at some specific problems, but it has some general usefulness, too.
I was trying to use this to debug a font problem recently.
It shows me some good details about my path.
But there was no context.
I need to know the baseline and other things.
At the moment I'm just confused in general, I don't have a specific question I want to ask (like "is the bottom of the letter touching the baseline?"), I just want enough information that I can understand what's going on and troubleshoot the problem.
More context should help.

https://tradeideasphilip.github.io/random-svg-tests/hershey-fonts-viewer.html is a tool I wrote to help me convert the Hershey fonts into a format I could use.
Among other things it shows each letter before and after I added some custom processing.
I drew lines for the left, right, top and baseline of each letter.
And two more lines per letter to show off every bit of data I get from the Hershey fonts.
(`lineFont` has *a lot* more numbers available to display.)
The letters are huge:  4 samples across, 2 down cover my screen.
There are more Hershey fonts available so I will return to this eventually.

Ideally the best parts of these pages would be copied into the font editor.
Let's start simple for now, but be aware of what's out there.