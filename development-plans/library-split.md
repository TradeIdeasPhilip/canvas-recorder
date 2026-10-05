# Library Split

Split this project into one npm library for the tooling and one small project per video.

**Status:** Collecting notes. No code changes or detailed plan yet.

This document gathers notes that were scattered across the project.
The originals are still in place; follow the links for full context.

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
