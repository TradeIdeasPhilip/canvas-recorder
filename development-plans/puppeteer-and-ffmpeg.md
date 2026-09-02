## Background

[Older versions](https://github.com/TradeIdeasPhilip/html-to-video) of this software ([and an even earlier one](https://github.com/TradeIdeasPhilip/html-to-movie)) used [Puppeteer](https://pptr.dev/) to drive the browser and pipe the output to [FFmpeg](https://ffmpeg.org/) for encoding. The new version runs entirely in Chrome and uses [MediaBunny](https://www.npmjs.com/package/mediabunny) — a major improvement in almost every way. The live preview reloads instantly on save. I can scrub back and forth with no friction. I no longer need special test harnesses; I just write the code I want and see it immediately.

## The Gap: Transparent Backgrounds

The one significant thing MediaBunny can't do that FFmpeg can: transparent-background video using [ProRes](https://en.wikipedia.org/wiki/Apple_ProRes). That's almost certainly the main reason to keep FFmpeg in the picture at all.

The use case isn't full-length videos — it's small parts of a project, things like "stickers" in [CapCut](https://www.capcut.com/).

## Problems with the Current CLI / FFmpeg Path

The existing command-line recording path has two major problems:

1. **It's slow.** Encoding each frame as a PNG screenshot was the obvious bottleneck (switching to JPEG didn't help much). Beyond that, FFmpeg itself was slower than MediaBunny even while burning lots of CPU threads and running hot. I also suspect the CLI environment disables GPU acceleration, which compounds the problem.
2. **Two codebases diverge.** The browser version and the CLI/[TSX](https://www.npmjs.com/package/tsx) version are increasingly different, and it's hard to test the CLI side unless I put real time into maintaining it — which rarely happens.

## Proposal: Puppeteer as an Optional Driver

Throw away the CLI/TSX recording path entirely. The app only ever runs as an interactive browser window. But optionally, Puppeteer can *drive* that same browser window and inject a small set of extra APIs into it.

When the main program detects those injected APIs, it shows additional controls — for example, a "Save via FFmpeg" button. Everything else looks and works exactly as it does now; the extra options are just additional buttons that appear when Puppeteer is running.

A scripted command-line mode — where Puppeteer drives the whole session without any button presses — would be a minor add-on and should come almost for free once the core is working.

## Technical Advantages

### Preview Is Already Solved

In the old Puppeteer version, live preview was awkward because frames were screenshots rather than direct canvas output. Now the canvas renders at full quality; a CSS scale brings it down to fit the screen for the on-screen preview. No new work needed here.

### Canvas → FFmpeg Transport

Because we control the canvas, we control exactly how frames are passed to the FFmpeg process. Options worth evaluating:

- **Raw RGBA** — four bytes per pixel, no compression. FFmpeg can ingest this directly with no encoding step between processes.
- **Custom compression** — worth measuring whether the cost of reading pixels back from the GPU dominates, or whether a compression step helps.
- **Multi-threading** — send the captured canvas to a worker thread while the main thread draws the next frame.

### One Codebase

All development stays in the current browser-based workflow. The FFmpeg path only activates when Puppeteer injects its API. No separate program to maintain.

## Long-Term: npm Library

One of my ongoing goals is to separate video content from the production environment — one npm library for the tooling (GUI, encoder glue, audio mixer, etc.) and one small project per video.

The main obstacle has been the CLI/TSX version: essentially two separate programs to support, which makes packaging as a library painful. Removing it clears that obstacle.

A library would also give each video project a clean place to configure global settings — output resolution, for example — rather than having them baked into the monorepo with no clean override path.

Semantic versioning is the real prize: I can make incremental improvements once and every downstream project gets them. Breaking changes become explicit and manageable via major version bumps, rather than silent surprises spread across a giant single repo.

## Open Questions

- **Performance:** How does the new hybrid (Puppeteer driving the browser canvas) compare to the old all-Puppeteer approach? May need a quick benchmark before committing.
- **Canvas-to-Node transport:** What is the fastest way to pipe frame data from Chrome to FFmpeg? In the old version the choices were limited and I didn't like any of them. Raw RGBA seems promising — FFmpeg handles it natively — but the GPU readback cost is worth measuring before assuming it's free.

## Related: WASM FFmpeg Version

There is [a separate project](https://github.com/TradeIdeasPhilip/handwriting-effect) that runs entirely in the browser using [FFmpeg compiled to WASM](https://www.npmjs.com/package/@ffmpeg/ffmpeg). It works, and it was impressive to get running, but it's yet another fork to maintain, and it can only handle videos that fit entirely in memory — a constraint I couldn't find a way around no matter how hard I pushed. It's not the direction I want to go.

### WASM FFmpeg could work!

After additional thought, I realized that the WASM FFmpeg actually might be useful in this project.

I was originally critical of that approach because it only works for small files.
But I also noted that the past Puppeteer solutions and this project's TSX solution are *very* slow.
They only make sense because I expect them to be used on small videos.

The encoder for my existing WASM FFmeg project, [handwriting-effect](https://www.youtube.com/watch?v=qIwXfSPh-8s), is small and self-contained, so it would be easy to import into this project as an option.
That project works well and has been tested thoroughly.

### Memory limit quantified
The constraint: all frames must live simultaneously in WASM's virtual filesystem as PNGs before FFmpeg runs.

In this project the canvas is currently fixed at **4K (3840×2160) at 60fps**. Math animations with flat colors and clean edges compress very well — probably 3–8 MB per PNG frame.

| Resolution | FPS | MB/sec (PNGs) | Comfortable limit (~1.5 GB) |
|---|---|---|---|
| 4K (3840×2160) | 60 | ~300 MB/s | ~5 seconds |
| 1080p (1920×1080) | 30 | ~45 MB/s | ~30 seconds |
| 720p (1280×720) | 30 | ~20 MB/s | ~75 seconds |

**4K at 60fps is too big for WASM**.
CapCut stickers don't need 4K — 1080p or 720p at 30fps is exactly right for this use case, and 30 seconds is a very comfortable ceiling for a "sticker."

### Pure Web Use

I just realized that the WASM version has benefits even if we also add the full FFmpeg version.

The WASM version is a lot easier to use.
Even if you are a programmer and you are comfortable downloading and running Puppeteer, it's still a pain.
And it's a bigger barrier to entry when someone is considering a lot of different solutions and they've never hear of me or this project.

But we might have some users who aren't programmers at all.
I've disused these use cases before:

A user can already run this program from [where it is already hosted](https://tradeideasphilip.github.io/canvas-recorder/canvas-recorder.html?toShow=shadow-test) and create a custom video.
No downloads, no programming.
As our GUI and our base collection of widgets improves, this becomes a real possibility.

In the past I've suggested this for teams.
Some members of the team create a base project and post it to the web.
Some members write custom widgets.
Other team members are responsible for laying out the widgets and adding text and images.
The last group can work directly from the web.
And they will have the ability to download the result without help from a programmer.

The ability to make stickers with transparent backgrounds is another reason why non-programmers might actually want to use this project.
This project can provide an easy way to make "stickers".
This can replace the current handwriting-effect project because it will include that functionally and more.

## Final Thoughts

Adding **WASM FFmpeg** to this project **is a very good idea.**
It will provide real benefits with low effort and low risk.

Crudely speaking, the project with its current limit to Mediabunny supported output, is a 99% solution.
Adding WASM FFmpeg makes it a 99.9% solution.
Adding Puppeteer would make it a 100% solution.
The work for that 0.9% is a lot less than for that last 0.1%.

Also, we can use the WASM FFmpeg as a proving ground.
It's a way to test small samples of a project before deciding that we need the full power of FFmpeg.