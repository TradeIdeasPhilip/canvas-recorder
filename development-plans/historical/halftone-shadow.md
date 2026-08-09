# Halftone Shadow

This is an idea I have for a special effect.
I think it will look good and I want to try it out.
It's just for fun and to look good.

It's inspired by the "Halftone Background" that I use in the sierpiński.ts script.
That looks very good, even after sending to YouTube, even when I get really close to the screen and squint.
(I've been disappointed by gradients and noise patterns.)
But that background is static.
I want to make the halftone dance.

I was worried about what I could do with a halftone because of it's low resolution.
But it seems like a perfect match for a shadow, which should be a little blurry.

Basic idea:

- Roughly analogous to an SVG filter, I take in an image as input and add special effects to that image.
- The half tone has a discrete resolution, an integer number of circles that we could draw across or down.
- We can create a full sized temporary canvas and draw the input image into that.
- The drawing code doesn't know that it's talking to a temporary canvas instead of the final canvas, and it doesn't care, `context` is already an input to `onDraw()` so this will be easy to hook.
- We make a smaller copy of the temporary canvas.
- The resolution of the small copy of the input matches the resolutions of the halftone dots.
- We ignore the colors and only look at the alpha channel of that copy.
- Start by painting the entire background of the real canvas all white.
- If a pixel in the small copy is completely transparent, don't draw a dot there, you can see the white background.
- If a pixel in the small copy is completely opaque, draw a large circle in the corresponding section of the main canvas, overlapping nearby circles by a little bit, light gray.
- If a pixel's opacity is in between, the circle's _area_ will be proportional to the pixel's opacity.
- Draw the shadow offset a little bit.
- Then copy input image as is from the temporary canvas to the final canvas.
- And repeat 60 times a second.

This could work with any of my recent videos.
But something with a solid outline and a partially transparent fill, like in sierpiński.ts, would work especially well.

## Plan

Let's do this.

Goals:

- Get a _quick_ version of this out to see if it looks in my head.
- Lets go through the process of creating a new video project, to see some of the pain that I want to remove ./instant-startup.md, setting up the boilerplate.

Plan:

- Create a new file shadow-test.ts in /src
- Create a class or something to draw this special effect.
- Create an object called `deck` which is an "in series" `Showable
- - There are lots of examples of this just not called "deck," more often "sceneList."
- Create a top level showable that
- - appears in the main menu that you recently created from `?toShow=`,
- - applies the new shadow filter to the entire `deck`
- Create an object called "slide 1"
- - which is a _parallel_ showable.
- - Often called "scene" in the existing code instead of "slide."
- - Draw nine simple shapes using stroke and fill.
- - 3 equilateral triangles, 3 squares and 3 circles
- - One of each has a solid fill, no fill, and 25% opaque fill.
- Create a constant somewhere DEFAULT_SLIDE_DURATION_MS = 10_000.
- - The _parallel_ code has an option to set the minim duration

Remember that I start with a transform equivalent to svg's viewBox="0 0 16 9".
(Eventually the size and shape should be an input, but that's no rush, my target is always youtube therefore HD aspect ratio and a standard height like 4k)

### Colors

The colors of `myRainbow` should work perfectly and they are always a good starting place.
(And we 9 colors and 9 shapes, let's call that a good sign from the universe!)

I like to set the transparency directly on the color.
See `interpolateColor()` for one way to add transparency to a color, I use that function a lot.

I save the globalAlpha property for changes to the entire scene.
See fadeOut() in src/transitions.ts for an example of that.

The rules for preserving canvas properties aren't listed that clearly.
See `CommonSettings` in src/fancy-text.ts for a list of properties that I generally consider disposable.
Use them how you want in a block of code, but between two blocks of code you never make assumptions about what's coming in and you don't care about what's going out.
transform is usually respected in the same way as a stack of <g><g><g></g></g></g> elements, where each new transform is applied on top of the incoming transform and the transform is restored at the end.
globalAlpha should probably work the same way, but I was lazy and didn't bother.
These are conventions that I often use with the canvas, not specific to this project.

These should probably be listed somewhere more permanent and prominent than this file.
Please find a good place and let me know where you put it.

### createHalftone straw man

`function createHalftone(fromImage  , ) { ... } `

Copy as much as we can from the existing halftone code.
Including the size and frequency of the circles.

That code was slow, but mostly in one place: the transforms.
I did a poor job of drawing the initial shape that I wanted to turn into a halftone.
In this case we are taking the initial shape as an input, so that's not an issue.

fromImage input:
how about CanvasImageSourceWebCodecs for the source.
We expect it to be the _full sized_ temporary canvas discussed above.
We create the smaller canvas inside the function.
The result of this function is a https://developer.mozilla.org/en-US/docs/Web/API/Path2D

This should be helpful and reusable.

### makeShadowDemo straw man

```
type CanvasFillStyle = string | CanvasGradient | CanvasPattern;
function makeShadowDemo(options: {
  readonly base: Showable;
  readonly dotColor?: CanvasFillStyle;
  readonly background?: CanvasFillStyle;
  readonly dx?: number;
  readonly dy?: number;
}): Showable {
  const defaults = { dotColor: "#ccc", dx: 0.2, dy: 0.2 };
  const { base, dotColor, dx, dy, background } = { ...defaults, ...options };
  const result: Showable = {
    description: `${base.description} » shadow demo`,
    duration: base.duration,
    children: [
      { start: 0, child: base },
    ] /* So we can pick up the sound clips and show more info on the development screen. */,
    show(options) {
      const context = options.context;
      if (background) {
        context.fillStyle = background;
        context.fillRect(0, 0, 16, 9);
      }
      // Do we create the smaller canvas here, at 60hz, or outside this function so we only have to create it once?
      const virtualOptions = { ...options, context: fullSizeTemp };
      base.show(virtualOptions);
      // Create the shadow
      // fill the shadow with dotColor
      // use drawImage() to copy the fullSizeTemp onto the real `context` on top of the shadow and optional background.
    },
  };
  return result;
}
```

Side note: I like `const` and `readonly`.
And when there are more than a couple of inputs to a function, I like using an object to _name_ all of the inputs instead of relying on order.
Lots of examples in my code.
And often I break that object open so I'm holding onto the components not the original object because I don't know if the caller was planning to change that object after showing it to me, I'm paranoid like that.

This is less reusable and more specific to this one application.
If it works well it will evolve and maybe become a reusable component.
But this seemed like a very good place to split between the previous part, which seemed more generic and reusable.

## Summary

Three parts to this demo:

- Create some shapes to make shadows from, a placeholder for content.
- Create the filter-like effect, what I really want to see right now, the only thing that's really on my mind.
- Create the boiler plate for a new video, which we hope to make easier in the future.

## Current Status

Overall things look very good.
Exactly like the picture in my head.
Better than I expected.

When running playing full speed and not actively looking for problems, the illusion is pretty good.
And animated dots look good even after encoding and uploading to youtube.
We are going in the right direction.

### Bug

But when I pause in the right place I still see issues.
Lets start at the very last frame.

The red line has a shadow of two columns of medium sized dots.
That seems reasonable.

The orange line has a shadow of two columns of small dots.
It looks a lot thinner than it should be.

Orange and red can't _both_ be right.
They are both similar inputs, a line right around the boundary between cells.
But the dots for one are much smaller than for the other.
(**Much** smaller. The two inputs are very similar, so the outputs should be similar, required to keep the animation smooth.)
How can both columns of circles be significantly smaller in one shadow compared to another?
The idea is that one column will get fatter while the other gets thinner, the total will remain the same.

Yellow and green both have shadows that are a single line of circles for their shadow.
But the circles in one line are much bigger than the other.

Ignore the rest of the lines.
They are getting close enough that their shadows overlap.
It still looks amazing, but it would only complicated our tests.

The animation is interesting. Here are a couple notes:

- When I move one line an entire dot width to the left, it's shadow might look different. The circles will max out at significantly different radii.
- Two adjacent columns don't always seem to match up perfectly. Like maybe there's a thin strip of space _between_ the two cells, and part of my line is getting lost there. That could make the screen lighter and the timing a little off. The amount that gets lost varies. This could explain red vs orange in the last frame.

It's hard to describe the animation in any more detail. It doesn't repeat exactly the same each column of dots and I can't find a pattern beyond what I've described.

These things seem too big to be round-off errors.
And they are too obvious to ignore.

### Suggestion

Bring back the slow version of downsampling.
Add scene 6, content same as scene 5, but with the slow version of the shadow.
I have no idea where the actual problem is.
But this seems like an easy thing to test.
