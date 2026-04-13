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
* Roughly analogous to an SVG filter, I take in an image as input and add special effects to that image.
* The half tone has a discrete resolution, an integer number of circles that we could draw across or down.
* We can create a full sized temporary canvas and draw the input image into that.
* The drawing code doesn't know that it's talking to a temporary canvas instead of the final canvas, and it doesn't care, `context` is already an input to `onDraw()` so this will be easy to hook.
* We make a smaller copy of the temporary canvas.
* The resolution of the small copy of the input matches the resolutions of the halftone dots.
* We ignore the colors and only look at the alpha channel of that copy.
* Start by painting the entire background of the real canvas all white.
* If a pixel in the small copy is completely transparent, don't draw a dot there, you can see the white background.
* If a pixel in the small copy is completely opaque, draw a large circle in the corresponding section of the main canvas, overlapping nearby circles by a little bit, light gray.
* If a pixel's opacity is in between, the circle's *area* will be proportional to the pixel's opacity.
* Draw the shadow offset a little bit.
* Then copy input image as is from the temporary canvas to the final canvas.
* And repeat 60 times a second.

This could work with any of my recent videos.
But something with a solid outline and a partially transparent fill, like in sierpiński.ts, would work especially well.