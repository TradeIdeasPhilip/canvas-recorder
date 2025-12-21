# Canvas Recorder

I'm getting frustrated with Puppeteer and screen shots.

## Old Version

https://github.com/TradeIdeasPhilip/html-to-video

I was using a screen shot.
This allowed me to use any and all HTML features.
In practice I almost always stuck with a single SVG element.

SVG is nice in some places, especially when it comes to quick prototypes and Chrome's dev panel.
But persistent objects don't really help in this context; I'm drawing every frame from scratch.
And screen shots are slow to compress.
And the screen shots require me to use Puppeteer which makes things more complicated.
And SVG had odd quirks and often isn't reliable and often works better in test than in production.

## New Version

Now I'm trying to do the same thing, but only using the canvas.
I can still display things on a web page.
This provides very quick development with Vite.
But now the node process can run this code directly.
It can copy the data from the canvas very efficiently.

This should help my dev environment, too.
Now that I'm displaying a canvas, rather than drawing to the full screen, it will be easier for me to add a lot of debug options.
Like inputs to control the output.
Or multiple outputs so I can compare things side by side.