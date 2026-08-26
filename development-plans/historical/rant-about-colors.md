## Status

Never mind.
I fixed a lot when I learned the secret to fixing our problems.
See parseCssColorToRgba() in canvas-recorder.ts.

## Original Rant

I started using css colors because they are powerful and I knew a bit about them and they seemed to work well.  Now I'm reconsidering that decision.  Maybe it makes sense to use a different color library, or even our own {r: , g:, b:, a: } object.

Part of the problem is that I have to make the change globally.  That's probably not hard.  In reality most of the interesting css colors come from @src/interpolate.ts  .  And that's where we would need to focus the change.  We already have classes for handling color schedules.  Change those to use our new preferred color object (format TBD).  The LSP will point out all the other changes that we need to make.

interpolate.ts contains the base function that I use to interpolate between colors, which is always done "in sRGB" for simplicity.  Instead of relying on cylindrical color space, I occasionally just provide more keyframes.  That works well for me and we already have tools for interpolating from a list of colors.  sRGB interpolation is trivial if we have an {r: , g:, b:, a: } style object.  We could do it ourselves or expect it from almost any color library.

The Visual Editor's string tab should be able to accept lots of inputs.  The more the better.  I don't have a specific list, but it seems like we're close to accepting all of css right now, the way we filter things though an element's computed css.

The bulk of the program should not rely on html elements or computed css.  The bulk of the program should work in node.js without any shims.  We don't need to accept every format in the world in the main part of the code.  Most of the time I'm just experimenting in our program, so I can use *our editor* to convert from whatever I'm playing with to something more canonical.

It would be nice if the new color object's constructor could take in some color strings, like "#fff" or "#ffffff".  I'm sure most 3rd party libraries support the simple stuff.  But I never like to push strings in that way because new Color("#ff") gets rejected at runtime, not compile time.  I have lots of examples of the same idea with DOMMatrix.  I try to avid new DOMMatrix("translateX(2)") in favor of new DomMatrix().translateXSelf(2) because the former has a bug that won't appear until runtime.

Do we need floating point numbers?  The canvas is currently limited to standard 32 bit r/g/b/a colors.  I have played with more powerful options available on my mac, and it was interesting, but it didn't really help the final moving making process.  I think we can accept whatever a good library uses internally.

What format do we want to save to JSON in?  It might be nice if it was #FF0000.  Probably not worth the trouble.  *No*, for some reason VS code doesn't automatically recognize colors in JSON like it does it text, so there's not much advantage.  We can save in whatever format is convenient.

There's only one other *interesting* case I can think of in our code.  @src/showcase.ts  includes a couple of slides called "Rainbow Spacing" and "Color Pair Readability".  They use colorizr to measure and describe the distance between two colors.  Presumably another color library will include something similar.  Worst case we could still use colorizr for this one purpose, which is what is was made for, without trying to use colorizr to convert random color strings.

We should have some backward capability when we read old schedules from the database or a json file. But do the conversion while we are "rehydrating" the object.  The old color string goes no further.  The bulk of the code only sees the new color object and the first save will save the color into the modern format.  This is aimed the current contents of my database and the *.json files currently in this project.  Any old values should send an info message to the console().  Hopefully this is something simple, like accepting any string that the library normal takes as an input color.  I don't think I've saved anything interesting in the database or those json files.  The interesting values are usually temporary values from interpolating between keyframes.  I'm not expecting the keyframes themselves to be interesting.

No change yet.  Your thoughts on the whole idea?  Can you recommend an appropriate library?  (I don't need much, and I'd like something simple with   Or for my needs maybe