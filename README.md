# Canvas Recorder

How I make [my videos](https://www.youtube.com/@PhilipSmolen).

This looks like PowerPoint, Delphi or a traditional video editor when those tools are appropriate.
But also to use standard web graphics tools to create bespoke content.
This includes a lot of programming support for creating web graphics.

[Vite](https://vite.dev/) allows you to see the results of your code changes almost instantly.

## Super Quick Start

Look at [./src/showcase.ts](./src/showcase.ts) for some examples to copy.
Visible here: https://tradeideasphilip.github.io/canvas-recorder/canvas-recorder.html?toShow=showcase.
Or run `npm run dev` to start Vite then see it locally http://localhost:5173/canvas-recorder.html?toShow=showcase

Copy this and modify it to your needs.
There are more examples, but these were selected and refined as a good starting place.

### Creating a New Video

- Put your content in [./src/](./src/)
- Create at least on `Showable` object representing your entire movie.
- Add this `Showable` to `showableOptions` in [./dev/canvas-recorder.ts](./dev/canvas-recorder.ts).
- Run Vite, `npm run dev` to host the software.
- Click the url from Vite, and follow the menu to find your new video.
- Change the code as desired and as soon as you save the changes will automatically reload.
- When you are happy with the live preview, hit "Record and Save Video".

## Highlights

### Coding

Web tools!
You can use the same effects on live, interactive web pages as in your recorded videos.
Code reuse!
Typescript and HTML Canvas.

### Main program

- GUI for previewing videos.
- Hot load code changes and restart exactly where you left off.
- One click encoding and saving, with live preview.

### Path library

- An easy way to draw and animate math functions.
- Read and write path strings used in SVG.
- Wrappers around Bezier.js for the hard core math.
- Support for any affine transform, especially the common ones.
- Automatically convert a parametric function into a path.
- Various options for morphing or interpolating between paths.
- Tools to create text as a path. Use the same tools to manipulate text, images, and graphs. Morph smoothly between them.

### Performance

I'm getting good result on an *old* M1 MacBook Air!

- Most of my stuff runs at 60fps, 4k, real time.
- When frames are slower, the realtime display is very robust.
- I can generate and encode that same quality at about 80% of realtime.

### In Progress

- Sound editor. Still missing a lot of convenience features. But it works and it's a nice start.
- Visual editors. Already helpful, but I'm still deciding what I want to do with them.

### Most Current

This project also contains the most recent version of a lot of library routines. For example [src/glib/](src/glib/) contains a lot of graphics tools that are useful in multiple scenarios. This includes drawing with the canvas or SVG.

Eventually I'd like to split things up into separate NPM packages and separate git repositories. But for the moment, the easiest thing to do is to clone this project and add your own code.

### Pixel Perfect

It's hard to explain.
It's what you think you always have, but when you take a closer look you would be amazed.

Time and space are assumed to be continuous in the bulk of this project.
I never convert to frames or pixels until the last possible moment.
Surprisingly, it often *helps* performance, so I have no idea why people still get this wrong in 2026.

If you like to get really close to the screen and squint, like I do, here's some advice:
* Avoid blurs and noise.
  * They can look *so* good on the screen in development, but they don't survive encoding.
  * Some problems are immediately obvious, but do a long test and you'll see even more.
* Gradients are pushing the limits
  * use with caution.
  * Again, my old MacBook air's display can make perfect gradients, but they don't always translate.
* The encoding and YouTubing process loves solid objects with crisp edges.
  * Filling and stroking paths are easy ways to create encoder-friendly content.
  * And check out my halftone dots example.

## Glossary

Directions:

- left, _center_, right
- top, _middle_, bottom

"PathShape":

- `PathShape` is a class that I use a lot.
- `pathShape` is the preferred variable name for instances of this class.
- Sometimes I say `shape` or `path`, but that is not preferred.
- `path` often refers to a [canvas path](https://developer.mozilla.org/en-US/docs/Web/API/Path2D) which are often used alongside `PathShape` objects.

- `Showable` is an interface used to describe a whole video or part of a video. It is recursive and can be used a lot of ways.
- "Slide" is a metaphor for a group of visuals all shown together.
  - It is a reference to a PowerPoint slide.
  - The showcase includes a power point style outline.
  - I sometimes say "create a slide" when I just want a new group of stuff all displayed at the same time.
  - In general "slide" means a `Showable` that a plan to use a way generally similar to a PowerPoint slide, e.g. full screen and shown in series with other slides.
- "chapter", "test" and "scene" are similar.
  - Still a full screen `Showable` shown in series with others.
  - It's just how I'm thinking about the content.

"Component" refers to a `Showable` that can be added and removed at runtime.
There is a component editor that is often useful when designing an animation.
Any `Showable` can make this editor available via its `components` property.

"command" often refers to a single Bezier curve.
I chose this term because one of my `Command` objects corresponds pretty closely to a "command" in an [SVG path string](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/d).
An `LCommand` represents a line segment and `QCommand` and `CCommand` refer to higher order Bezier curves.

"viewBox" is an _idea_ that I stole from SVG.
The canvas doesn't have a literal [viewBox](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/viewBox) element, so I implement the idea myself with the canvas's transform matrix.
The _idea_ is that the internal dimensions of an image (used to draw it) and the external dimensions (used for layout) are almost completely disconnected.
In SVG you use [preserveAspectRatio](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/preserveAspectRatio) to fill in the last details, what to do if the aspect ratios don't line up.
In this project you use [panAndZoom()](https://github.com/TradeIdeasPhilip/canvas-recorder/blob/master/src/glib/transforms.ts#L67) for the same purpose.

"progress" almost always means a number between 0 and 1 where 0 means the beginning and 1 means the end.
This is used to display an animation at a specific stage.
This is a common input parameter when an animation routine does not know its starting time and duration, as is the case with most reusable code.
If your input is in milliseconds, a very simple approach is to say `const progress = currentTime/duration`.
However, most newer code uses [keyframes and interpolation](https://github.com/TradeIdeasPhilip/canvas-recorder/blob/master/src/interpolate.ts) as a more flexible way to determine the progress.

"HEVC" or "H.265" refer the encoding that we use.
The web version of this program is currently limited to this encoding because it works well.
In particular, my computer has dedicated hardware for this mode.
See the node version for full access to FFMPEG.

## Project history

I've had a few attempts at this.
My previous tech stack was becoming slow and unreliable.
Here's a good sample:
https://github.com/TradeIdeasPhilip/html-to-video

I was taking screen shots of a web page.
This allowed me to use any and all HTML features.
In practice I almost always stuck with a single SVG element.

SVG is nice in some places, especially when it comes to quick prototypes and Chrome's dev panel.
But persistent objects don't really help in this context; I'm drawing every frame from scratch.
And screen shots are slow to compress.
And the screen shots require me to use Puppeteer which makes things more complicated.
And SVG had odd quirks and often isn't reliable and often works better in test than in production.

### New Version

Now I'm using the HTML canvas for all of my drawings.
I can still display things on a web page, I just need a \<canvas> instead of an \<SVG>.
This provides very quick development with Vite.
It can copy the data from the canvas **very efficiently**, **much faster** than any previous implementation.

The resulting is GUI so much better than any of the debug tools I'd cobbled together in previous versions.
Those were minimal attempts at debugging individual issues.
The new GUI is focused on displaying the movie, previewing it.
If you need any other data for debugging, just display it on the screen like a normal movie.
If you want to build a prototype, just build a simple movie.

### Node

The node version still exists for special cases.
It uses FFMPEG for encoding, so it supports pretty much any format worth supporting with tons of options.
It only replaces the "Record and Save Video" button.
Use the web version for developing and testing your video and use the node software at the last moment.

The web version always encodes in HEVC.
That works incredibly well and covers 99.5% of my needs.
The underlying API offers a few other options, but not nearly as many as FFMPEG.
In particular it does not have any (reliable) support for an alpha channel.
By default this program will output in ProRes.
That format *does* support an alpha channel and it is optimized for use in video editing programs.
Use case:  Using this program to make a few cool animations, using other tools to make other parts of the video, and using a video editor to put it all together.

It is *possible* to use FFMPEG in a web page.
See https://github.com/TradeIdeasPhilip/handwriting-effect for a successful example of that.
However, that trick only works with small videos.
The ProRes format is *much* less efficient than HEVC.

Note:  The default canvas is completely transparent before the content code decides to overwrite it.
See [src/alpha-test.ts](src/alpha-test.ts) for an example with transparency.
To run that demo and create a video with an alpha channel type `npm run record -- alpha-test`.
Or see a live version here:  https://tradeideasphilip.github.io/canvas-recorder/canvas-recorder.html?toShow=alpha-test.