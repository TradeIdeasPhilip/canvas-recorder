# Library Split

Split this project into one npm library for the tooling and one small project per video.

**Status (2026-10-12):** Planning version 1. No code yet.
See [Version 1 plan](#version-1-plan) below.

The rest of this document gathers notes that were scattered across the project.
The originals are still in place; follow the links for full context.

## Version 1 plan

**The goal is to get one real video out:** the robots from [riemann-surfaces-3d](https://github.com/TradeIdeasPhilip/riemann-surfaces-3d), recorded in 4K and always perfect, with sounds and text added in our editor.

- This is a *first* version of the library, not a perfect one. Semantic versioning lets version 2 start fresh.
- Try for a complete library. Anything unnecessary that gets in the way gets commented out.
- riemann-surfaces-3d is our customer, and it represents a serious, common use case: another program wants to save what it already shows on screen to a video file, and use our editor for annotations.
  - Make as few changes to it as possible.
  - We are not building a component that draws robots or solves math problems. We are saving a result the program already draws.

### Ground rules

- **Rule 1:** this work doesn't interfere with canvas-recorder, and vice versa. Either project can be dropped mid-thought.
- **Rule 2:** canvas-recorder is the source of truth. The library is a copy and may be rebuilt from scratch several times.

### Projects

| Project | Role in version 1 |
| --- | --- |
| `canvas-recorder-lib` (new repo) | The library |
| `riemann-surfaces-3d` (existing, port 5179) | The customer; the first real consumer |
| `canvas-recorder` (port 5173) | Unchanged. Still the source of truth |
| `canvas-recorder-dev` (Font Inspector + Kerning slides) | Deferred until after the video (see question 4) |
| `canvas-recorder-sample` (help page) | Deferred until after the video (see question 4) |

### The library: `canvas-recorder-lib`

- **Built by a copy script.** `scripts/import-from-canvas-recorder.mjs` copies the player's import tree from `../canvas-recorder` verbatim, keeping `dev/` and `src/` as they are, so relative imports still work.
  The tree is about 12 `dev/` files and 40 `src/` files, *minus* `src/dynamic-exports.ts`, so none of the old videos come along.
  - Commit A is the verbatim import; hand edits are separate commits after it.
  - To re-sync, re-run the script on a branch and rebase the edits onto it.
- **The main control object, `canvasRecorder`.** It's exported and documented, and holds:
  - `pixelWidth` / `pixelHeight` (default 3840 × 2160);
  - `width` / `height` in logical units (default 16 × 9);
  - `fps` (default 60);
  - `start(showable, { name })`.

  Any part of a video can read the settings. They're frozen once `start()` runs.
  Video code should read them inside `show()`, not at module top level, because static imports run before `main.ts`'s body.
  The library's own uses of 3840/2160/16/9/60 switch to these properties. The old videos aren't copied, so they aren't touched.
- **`start()` replaces `document.body`** with the player's HTML, stored as a TS string extracted from `canvas-recorder.html`.
  It then loads the player module with one internal `import()`, so its 6,200 lines run unchanged.
  - The "Select a video" menu, `resolveToShow()`, and the `?toShow=` registry are gone.
  - `name` replaces `toShowKey` for IndexedDB, sessionStorage and save files.
  - The player's only top-level `await` goes away, so the TLA deadlock can't happen.
- **Ship a real build (changed from the earlier plan).** The library publishes `dist/` `.js` + `.d.ts`, not TypeScript source.
  Shipping source would make riemann's `tsc`, which is part of its `npm run build`, type-check our code under its own settings: TS 5.9 (we use 6.0), with `noUnusedLocals` and `noUnusedParameters` on.
  That would break its GitHub Pages build.
  - Build: `tsc` with `rewriteRelativeImportExtensions` (our imports say `.ts`), plus a step that copies the CSS files, which tsc ignores.
  - While developing, run `tsc --watch` in the library.
  - riemann depends on it with `"canvas-recorder-lib": "file:../canvas-recorder-lib"` for now.
- **Exports:**
  - `canvasRecorder`;
  - the core (Showable types, the slide components, interpolate, PathShape, fonts);
  - `componentRegistry`, which is already an exported `Map`, so the customer can register its own components and get save, load and "TypeScript defaults" for free;
  - the new component below.
- **CSS:** `import "./x.css"` inside the library just works in the consumer's Vite. Never set `"sideEffects": false`, or production builds drop the styles.
  The player's CSS is imported only by the player module, so riemann's normal page never sees it.
- **Not in version 1:**
  - the tsx recorder;
  - test-rig;
  - random-tests;
  - the service worker;
  - sound-explorer and media-browser, unless they turn out to be needed for this video.

### New library component: Live Canvas

This component is generic: it knows nothing about robots.
It copies another program's live canvases into rectangles, and keeps that program's simulation in step with `timeInMs`.

The customer implements a small host interface, one per clip:

```ts
type LiveCanvasHost = {
  /** Put the program in its state at time 0 of this clip. */
  restart(): void;
  /** Advance exactly `dtSeconds`. Must not read the clock, the keyboard or the mouse. */
  step(dtSeconds: number): void;
  /** True once the clip is over.  Used to measure the duration. */
  isDone?(): boolean;
  /** Render the current state.  Each canvas must come back at exactly the requested pixel size. */
  render(sizes: readonly { width: number; height: number }[]): readonly HTMLCanvasElement[];
  /** Lines for the statistics area. */
  status?(): readonly string[];
};
```

**Properties.** One editable rectangle schedule per canvas, plus one for the statistics.
They're in 16 × 9 units, like everything else, so our text and annotations line up with them.
The defaults for this video:

- input graph on the left, 9 × 9: `{x: 0, y: 0, width: 9, height: 9}`;
- output graph bottom right, 7 × 7: `{x: 9, y: 2, width: 7, height: 7}`;
- statistics in the top-right 7 × 2: `{x: 9, y: 0, width: 7, height: 2}`.

**Real pixels.** There's no need to turn off the virtual units.
Inside `show()`, multiply a rectangle by `context.getTransform()` to get its exact pixel size, render three.js at that size with pixel ratio 1, and `drawImage` it back into the unit rectangle. It lands 1:1, so it's pixel-perfect.
That gives 2160 × 2160 and 1680 × 1680 pixels while recording, and whatever the window is in preview.
Do the `drawImage` right after `render()`, in the same task, or create the renderers with `preserveDrawingBuffer: true`.

**Time.** `stepMs = 1000 / fps`.
The component remembers how many steps it has taken, and the target is `floor(timeInMs / stepMs)`.

- If the target is behind it, `restart()`; then step forward until it catches up.
- Recording advances exactly one step per frame. Live playback at 60 Hz does about the same, so the preview behaves like the program does on its own screen.
- **Live preview** caps the catch-up work per frame (about 8 ms). If it's still behind, it draws what it has plus a small warning light, like the video clip component.
- **Recording** does the full catch-up in `getFramePromises()`, so a recorded frame is always exact.

**What random seeking will do.** Seeking forward costs one step per 1/60 s skipped. Seeking backward replays from the start of that clip.
The steps are simulation only, with no rendering, so they're cheap. Even so, a jump deep into the narrated tour (minutes long) will show the warning light for a moment while it catches up.
That's the experiment you're curious about.

**Duration.** At startup, measure by a dry run: `restart()`, then step until `isDone()`.
If that's too slow for 14 demos, cache or hard-code the numbers.

### Changes to riemann-surfaces-3d (keep them small)

1. **An "Open video editor" button.** It dynamically imports a new file, `src/video-editor.ts`, so the normal app never loads the library.
2. **Stop the app's own loop and input when the editor opens:**
   - `renderer.setAnimationLoop(null)`;
   - a flag that makes `readKeys()` return all zeros, and makes the pointer and keydown handlers do nothing. Otherwise typing in the Visual Editor would walk z around.
3. **Split `frame(timestamp)` into `step(dt)` and `render()`.** The existing loop stays: `timer.update(t); step(min(dt, 0.05)); fitToCanvas…; render()`. The on-screen behavior is unchanged.
4. **`freshStart(demo)`:** `reset()` + the right function + fixed settings (mode, eye, sheet checkbox, 3D-floor lift, off-sheet select, `time = 0`, `sheetMix`), then the demo's own function.
   This is needed because demos start "wherever the body is now", and the editor needs every demo to start the same way every time (see question 1).
5. **`statusText()`:** the readout's content as plain lines, factored out of `updateReadout()` so both can use it.
6. **Build the tree in `video-editor.ts`:**
   - a top-level duration-agnostic component (permanent);
   - replaceable children: a background `RectangleComponent`, and an `InSeriesComponent` holding one Live Canvas per demo, in button order;
   - register the Live Canvas entry in `componentRegistry`;
   - `canvasRecorder.start(root, { name: "riemann-surfaces-3d" })`.
7. **Leave fitToCanvas alone.** Once our GUI replaces the body, the original canvases are detached, `clientWidth` is 0, and it already returns early. Live Canvas sizes the renderers instead.

### Things I noticed in riemann-surfaces-3d

- **Time steps.** The frame loop uses a variable `dt` (`timer.getDelta()`, capped at 0.05). The fixed step fixes that.
  All the easing (`1 - exp(-dt * k)`) is `dt`-based, so it's deterministic with a fixed step.
- **Sparkles.** `Sparkles` uses `Math.random()` when it's constructed, and they keep moving with `time`, so they won't match between "played from the start" and "seeked".
  It's visual only; reseed or ignore.
- **Toasts and the startup wave emote** run on `setTimeout`, which is wall-clock time, and the toasts are HTML. They won't appear in the recording (see question 2).
- **The line font has no `−` (U+2212), `𝒾` or `√`.** The readout and nameplates use all three.
  So draw the statistics with canvas `fillText` in Roboto, which riemann already bundles for its tabular digits.
- **Square input view.** On screen the input view is wider than it is tall; a 9 × 9 rect makes the camera's aspect 1. Check the demos' framing, since they were tuned on a wide view.
- **Version differences.** riemann runs Vite 8 (we use 7) and TS 5.9 (we use 6). The dist build handles TS; Vite is worth one test.

### Decisions (2026-10-13)

These override anything above that disagrees.

- **The video is the narrated tour.** One `FullScreenComponent` plays it. Adding the other demos is optional, just for play.
- **Seeking: forward only, for now.** riemann treats a big jump in time like a hidden window and stops animating.
  So, as with a video stream that has a single keyframe, you can only walk forward.
  - If `timeInMs` goes backwards, `restart()`.
  - Recording and playing from the start are what matter.

  Fixing seeking is not in scope.
  (Live Canvas steps in 1/60 s increments, so the big-jump rule may never fire during catch-up. Worth a look someday, not today.)
- **The component is named `FullScreenComponent`.** It lives in riemann, not in the library.
  It has no domain words in it, so another program can copy it as is.
  The library doesn't need a new component at all; the host-interface idea above becomes this one class.
- **Ship source too, like phil-lib.** The package contains `dist/` `.js` + `.d.ts` and the `.ts` sources, with `declarationMap` so Go to Definition opens the real source.
  `exports` → `types` points at the `.d.ts`, so a consumer's `tsc` never type-checks our source.
- **riemann upgrades to TypeScript 6** (`npm install --save-dev typescript@^6.0.2`).
- **Both three.js views are already square,** so no framing problem.
- **Statistics: `fillText` in Roboto.** The line font also doesn't read well at small sizes.
- **Captions: drawn for now, because they help. Removed before the final recording.** Toasts are dropped.
- **The dev and sample projects wait until after the video.**

### Open questions (answered above)

1. **Fresh start per demo, or chained?** On screen, each demo starts where the previous one left off.
   For the video, I recommend a fresh start for each. Then seeking within a demo only replays that demo, and demos can be reordered or cut independently.
   Chained would mean any seek replays everything from the first demo.
2. **Toasts and captions.**
   - The narrated tour's captions could go into the statistics area, or become our own Multi Text.
   - The end-of-demo toasts could be drawn, or dropped in favor of text you add in the editor.

   I'd draw the captions and drop the toasts.
3. **Is the narrated tour in the video?** Its moves are pinned to `RECORDED` voiceover times (narration.ts).
   With our sound tools placing the voiceover, that could line up nicely, but it's the longest clip and the hardest to seek in.
4. **Dev and sample projects:** OK to defer both until the video is out?
5. **Name:** "Live Canvas" for the component?

## Goal

From [puppeteer-and-ffmpeg.md](puppeteer-and-ffmpeg.md#long-term-npm-library):

> One of my ongoing goals is to separate video content from the production environment — one npm library for the tooling (GUI, encoder glue, audio mixer, etc.) and one small project per video.

> A library would also give each video project a clean place to configure global settings — output resolution, for example — rather than having them baked into the monorepo with no clean override path.

> Semantic versioning is the real prize: I can make incremental improvements once and every downstream project gets them. Breaking changes become explicit and manageable via major version bumps, rather than silent surprises spread across a giant single repo.

From [instant-startup.md](instant-startup.md#project-structure):

> In an ideal world I could imagine one npm package for all the tooling (the play button, the logic to encode frames, the class that merges all the audio clips according to the schedule, etc) and another for each video I wanted to produce.

> Eventually I want to revisit this.
> Especially to extract [glib](../src/glib/README.md) as its own npm package.

From [README.md](../README.md#most-current):

> Eventually I'd like to split things up into separate NPM packages and separate git repositories. But for the moment, the easiest thing to do is to clone this project and add your own code.

[src/glib/README.md](../src/glib/README.md):

> This directory contains files that should probably be moved to a library in its own npm package.

## Use cases

The main one: each new video is its own small project that imports the library.

### Recording another canvas app (the three.js robots)

_The original notes for this use case. The concrete version is in the [Version 1 plan](#version-1-plan)._

A separate project, not yet on GitHub, has robots walking around in three.js, doing both interactive and scripted things.
I would not want to import that project into this one: it has a different style, a different level of quality control, and heavy package imports.

Instead, once some good scripted moves are hooked up to buttons, I want to prompt: _"now import canvas-recorder-lib and use it to record the results of hitting the button labeled 'spiral but the camera stays fixed'."_
It's already drawing to a canvas, and the RAF handler already takes time as an input, so turning that into a `Showable` shouldn't be hard.

**The concern.** The robots walk smoothly because of a lot of automatic, hidden state.
Jumping to a random frame would probably be good enough for a preview.
But you could never clip two parts together unless they were recorded in order.

**What this needs from the library:**

- **A separate page in the robots project.** Add a `record.html` that calls `start()`, so the player GUI never touches the app's own page.
  This needs no API change.
  The player's CSS is only imported by the player module, which `start()` loads on demand, so the robots app's normal page never gets the library's styles.
- **An adapter `Showable`.** It lives in the robots project, so the library never depends on three.js.
  Inside `show()`:
  - advance the simulation to `timeInMs`;
  - render with three.js;
  - `context.drawImage(threeCanvas, 0, 0, width, height)`.

  Size the three.js renderer to `context.canvas.width × height`, so the copy is 1:1 and stays pixel-perfect.
  Do the `drawImage` right after `render()`, or use `preserveDrawingBuffer: true`.
  If models load asynchronously, report them through `getFramePromises()`.
- **Make time the only input.** This is the fix for the concern. `show(t)` has to be a function of `t` alone:
  - a fixed simulation timestep, not the RAF's variable `dt`, so the recording (exact 1/60 s steps, slower than real time) matches the preview;
  - seeded randomness, and no `performance.now()`;
  - the button press becomes an event at a known time in a script.

  Then seeking is just "if `t` went backwards, reset and step forward to `t`".
  That's cheap when the simulation steps without rendering.
  Any range can be recorded, and separately recorded clips line up exactly.
  A bonus: an interactive session could be recorded as a log of timestamped inputs, then rendered offline at full quality.
- **Maybe a library helper for that pattern:** something like `replayable({ reset, step, render, stepMs })`.
  Any simulation would benefit (physics, boids, cellular automata), and it keeps the robots adapter tiny.
- **Ship a real build sooner.** The robots project will be the first consumer with a different tsconfig and code style.
  Shipping TypeScript source means its compiler type-checks the library's source under its own settings.
  That argues for doing the `tsc → dist` build early.
- **A README written for that prompt.** The library's README should have a short "record an existing canvas app" section.
  Then a Claude session in the robots project can do the job from the docs alone.

## What goes where (first thoughts)

From [instant-startup.md](instant-startup.md#project-structure): today `/dev` is the tooling and `/src` is the content.
That's the natural first cut, but it isn't clean:

- **glib** might be its own package, separate from the tooling.
- **Shared content-like code** (slide-components, showcase, `stroke-colors`, corner rounding…) sits in `src/` but is used by many videos.
- **Videos reuse other videos.**
  > the `Showable` interface is intended to be recursive.
  > So my next video might reference one of my previous videos, and it might actually reach right in and play part of the old video in the new video.
- **Small items headed for phil-lib:**
  - `downloadBlob()` in [src/utility.ts](../src/utility.ts) (`// TODO copy this to phil-lib/client-misc.ts`)
  - [src/zipper.ts](../src/zipper.ts) (`// This should eventually move to phil-lib.`)

## Prerequisites

### Remove the CLI/TSX recording path

From [puppeteer-and-ffmpeg.md](puppeteer-and-ffmpeg.md#long-term-npm-library):

> The main obstacle has been the CLI/TSX version: essentially two separate programs to support, which makes packaging as a library painful. Removing it clears that obstacle.

That document proposes replacing it with WASM FFmpeg (easy) and, optionally, Puppeteer driving the browser (harder).

### Stop committing `docs/`

[ci-pages-deploy.md](ci-pages-deploy.md) describes deploying through GitHub Actions instead of committing build output.
That isn't strictly a prerequisite for this repo, but **every new per-video project should start that way** rather than having to migrate later.

## Setting up each new per-video project

Collected from [ci-pages-deploy.md](ci-pages-deploy.md), [vite.config.js](../vite.config.js) and CLAUDE.md:

- Copy `vite.config.js`. Its own comment says, "I copy this file to every new project."
  Keep `base: "./"`, `outDir: "docs"` and `target: "esnext"`.
- Register every HTML page in `rollupOptions.input`.
  Otherwise the page works under `npm run dev` but silently disappears from `npm run build`.
- Keep the `manualChunks` idea: put library code and `node_modules` into stable chunks.
  This has two purposes:
  - It avoids the top-level-await deadlock. A dynamically imported chunk statically imports the async main entry, and the page hangs with no error.
  - It keeps hashes stable across rebuilds.
- Add `.github/workflows/deploy.yml` (checkout → setup-node → `npm ci` → `npm run build` → upload-pages-artifact `docs/` → deploy-pages).
  Set Pages' source to "GitHub Actions", and put `docs/` in `.gitignore` from the first commit.

## Things in the code that will have to change

These aren't in any plan yet. I found them while collecting the notes above.

- **Hard-coded 4K resolution.** This is the "global settings" item from the Goal section. It appears in:
  - [dev/canvas-recorder.ts:806](../dev/canvas-recorder.ts#L806) (`canvas.width = 3840`) and the zoom math near [line 213](../dev/canvas-recorder.ts#L213)
  - [record/cli-record.ts:41](../record/cli-record.ts#L41)
  - [src/shadow-test.ts:1378](../src/shadow-test.ts#L1378) (`PIXELS_PER_UNIT = 240`)
  - [src/slide-components/video-info.ts:11](../src/slide-components/video-info.ts#L11)
- **The GUI is HTML + CSS, not just TypeScript.**
  [canvas-recorder.html](../canvas-recorder.html) has about 400 lines and about 80 `id`s, plus `dev/*.css`.
  The library has to ship that markup somehow, or build it in code. This is probably the biggest design question.
- **The tooling imports content.** `dev/canvas-recorder.ts` imports [src/dynamic-exports.ts](../src/dynamic-exports.ts), the video registry.
  That dependency points the wrong way for a library. The video project should hand its `Showable` to the library, not the other way around.
  With one project per video, `?toShow=` and the selection menu may mostly go away.
- **Per-video files.** These need a home in each video project:
  - `public/` audio and images (e.g. `./Showcase.FLAC`)
  - [properties/](../properties/README.md) `<video>.json`
  - the auto-loaded `./saved_state/<toShowKey>.json` ([dev/canvas-recorder.ts:6081](../dev/canvas-recorder.ts#L6081))

  Side note: [docs/saved_state/README.md](../docs/saved_state/README.md) lives inside the build output.
  That conflicts with ci-pages-deploy.md, and it may be stale now that `properties/` exists.
- **The service worker.** [public/delay-files-sw.js](../public/delay-files-sw.js) has to be served from the app's own origin.
  A library can't drop it into the consumer's `public/` automatically.
- **The other pages:** sound-explorer, media-browser, random-tests, test-rig.
  For each one, decide whether it belongs in the library, in a tools project, or nowhere.
- **[canvas-recorder-lite.md](canvas-recorder-lite.md)** (no visual editor, no sound…) might be the right shape for some library consumers.

## Packaging notes

From a conversation on 2026-09-23. See also phil-lib's [build instructions](https://github.com/TradeIdeasPhilip/phil-lib#build-instructions).

### Reading

- Matt Pocock, [How To Create An NPM Package](https://www.totaltypescript.com/how-to-create-an-npm-package). This one builds a modern package from an empty directory. You can skip the Prettier, Vitest and Actions sections.
- TypeScript handbook, ["I'm writing a library"](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html). It gives a recommended tsconfig with the reason for each setting.
- Checkers: [publint.dev](https://publint.dev) and [arethetypeswrong](https://arethetypeswrong.github.io) (`npx @arethetypeswrong/cli --pack`).
  Write a modern package, run both, and fix what they flag. That's what lets you ignore the old standards.

### Checklist

- ESM only (`"type": "module"`). Skip CommonJS, dual packages and UMD.
- The `exports` field is the whole interface. Put `types` first in each entry.
- Build with plain `tsc` and don't bundle; the app's Vite does that.
  Emit `.js`, `.d.ts` and `declarationMap`, so that Go to Definition lands in the `.ts` source.
- Use `rootDir: src` and `outDir: dist`, plus a `files` field. Check with `npm pack --dry-run`.
- Use `module: node18`/`NodeNext` for the library, which forces `.js` extensions on relative imports. `bundler` is fine for the apps.
- Make **phil-lib a peerDependency** of the new library. Otherwise the videos can end up with two copies of phil-lib, which breaks `instanceof` checks and gives "Type X is not assignable to type X" errors.
- Existing gotchas (from Claude's memory notes):
  - tsx doesn't transform TypeScript inside `node_modules`, so import `"pkg/file"`, not `"pkg/file.ts"`.
  - Export names must be ASCII, because Rollup truncates names at the first character above U+00FF.

### Why `npm link` kept failing

Likely causes:

1. Any later `npm install` in the app silently replaces the link with the registry version.
2. Stale builds: `exports` points at `.js`, so each library edit needs a `tsc` run.
3. Vite's "outside of serving allow list" error for symlinks outside the project (`server.fs.allow`).
4. Duplicate dependencies resolved from the linked package's own `node_modules`.
5. The link was made under a different Node version (nvm).

**Alternative:** `"phil-lib": "file:../phil-lib"` in package.json.
It's the same symlink, but it's recorded in package.json and survives `npm install`.
It breaks CI builds, where `../phil-lib` doesn't exist, so switch back to a version number before pushing.

### Working on two repos with Claude

Start in one repo and use `/add-dir ../other-repo`, or add it to `additionalDirectories` in `.claude/settings.json`.
Each repo gets its own commits.
Give each repo its own CLAUDE.md.

## Open questions

- **One repo with npm workspaces, or separate repos?**
  Workspaces (`packages/lib`, `videos/*`) link everything automatically and avoid most of the `npm link` problems.
  Separate repos give real semantic versioning between projects.
  phil-lib stays separate either way.
- Is glib its own package or part of the tooling package?
- How does a new video reuse part of an old video once they live in different projects?
- Where do shared content-like pieces live (slide-components, showcase)?
- What happens to the hosted GitHub Pages demo?
  [puppeteer-and-ffmpeg.md](puppeteer-and-ffmpeg.md#pure-web-use) values it for non-programmers and first impressions, so something like today's showcase needs to stay online.
- How does this interact with [instant-startup.md](instant-startup.md#toshow--list-of-videos)'s idea that no `?toShow=` gives you a new, unnamed project?
