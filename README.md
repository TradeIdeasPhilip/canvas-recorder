# Canvas Recorder

How I make [my videos](https://www.youtube.com/@PhilipSmolen).

This looks like PowerPoint, Delphi or a traditional video editor when those tools are appropriate.
But also to use standard web graphics tools to create bespoke content.
This includes a lot of programming support for creating web graphics.

[Vite](https://vite.dev/) allows you to see the results of your code changes almost instantly.

## Super Quick Start

Look at showcase.ts for some examples to copy.
Visible here:  https://tradeideasphilip.github.io/canvas-recorder/canvas-recorder.html?toShow=showcase.
Or run `npm run dev` to start Vite then see it locally http://localhost:5173/canvas-recorder.html?toShow=showcase

Copy this and modify it to your needs.
There are more examples, but these were selected and refined as a good starting place.

## (to be reorganized, lots of older stuff)

I'm getting frustrated with Puppeteer and screen shots.

### Old Version

https://github.com/TradeIdeasPhilip/html-to-video

I was using a screen shot.
This allowed me to use any and all HTML features.
In practice I almost always stuck with a single SVG element.

SVG is nice in some places, especially when it comes to quick prototypes and Chrome's dev panel.
But persistent objects don't really help in this context; I'm drawing every frame from scratch.
And screen shots are slow to compress.
And the screen shots require me to use Puppeteer which makes things more complicated.
And SVG had odd quirks and often isn't reliable and often works better in test than in production.

### New Version

Now I'm trying to do the same thing, but only using the canvas.
I can still display things on a web page.
This provides very quick development with Vite.
But now the node process can run this code directly.
It can copy the data from the canvas very efficiently.

This should help my dev environment, too.
Now that I'm displaying a canvas, rather than drawing to the full screen, it will be easier for me to add a lot of debug options.
Like inputs to control the output.
Or multiple outputs so I can compare things side by side.

### Getting Started

[dev/index.ts](dev/index.ts) and [index.html](./index.html) contain the main program. This includes the tools that let you preview and record a video.

[src/\*.ts](src/) contains the source code for several different videos. Set the `toShow` constant in [dev/index.ts](dev/index.ts) to point to the one you want, or to one of your own.

This project also contains the most recent version of a lot of library routines. For example [src/glib/](src/glib/) contains a lot of graphics tools that are useful in multiple scenarios. This includes drawing with the canvas or SVG.

Eventually I'd like to split things up into separate NPM packages and separate git repositories. But for the moment, the easiest thing to do is to clone this project and add your own code.

## Glossary

Directions:
* left, *center*, right
* top, *middle*, bottom

"PathShape":
  * `PathShape` is a class that I use a lot.
  * `pathShape` is the preferred variable name for instances of this class.
  * Sometimes I say `shape` or `path`, but that is not preferred.
  * `path` often refers to a [canvas path](https://developer.mozilla.org/en-US/docs/Web/API/Path2D) which are often used alongside `PathShape` objects.

* `Showable` is an interface used to describe a whole video or part of a video.  It is recursive and can be used a lot of ways.
* "Slide" is a metaphor for a group of visuals all shown together.
  * It is a reference to a PowerPoint slide.
  * The showcase includes a power point style outline.
  * I sometimes say "create a slide" when I just want a new group of stuff all displayed at the same time.
  * In general "slide" means a `Showable` that a plan to use a way generally similar to a PowerPoint slide, e.g. full screen and shown in series with other slides.
  * I also have a container that where the user can add components at runtime (still early development) which I also call a "slide".  That name should change, but we will still be using a powerpoint slide as the metaphor.
* "test" and "scene" are similar.
  * Still a full screen `Showable` shown in series with others.
  * It's just how I'm thinking about the content.

"command" often refers to a single Bezier curve.
I chose this term because one of my `Command` objects corresponds pretty closely to a "command" in an [SVG path string](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/d).
An `LCommand` represents a line segment and `QCommand` and `CCommand` refer to higher order Bezier curves.

"viewBox" is an *idea* that I stole from SVG.
The canvas doesn't have a literal [viewBox](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/viewBox) element, so I implement the idea myself with the canvas's transform matrix.
The *idea* is that the internal dimensions of an image (used to draw it) and the external dimensions (used for layout) are almost completely disconnected.
In SVG you use [preserveAspectRatio](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/preserveAspectRatio) to fill in the last details, what to do if the aspect ratios don't line up.
In this project you use [panAndZoom()](https://github.com/TradeIdeasPhilip/canvas-recorder/blob/master/src/glib/transforms.ts#L67) for the same purpose.

"progress" almost always means a number between 0 and 1 where 0 means the beginning and 1 means the end.
This is used to display an animation at a specific stage.
This is a common input parameter when an animation routine does not know its starting time and duration, as is the case with most reusable code.
If your input is in milliseconds, a very simple approach is to say `const progress = currentTime/duration`.
However, most newer code uses [keyframes and interpolation](https://github.com/TradeIdeasPhilip/canvas-recorder/blob/master/src/interpolate.ts) as a more flexible way to determine the progress.

