# Properties

Saved Visual Editor state for each video, one set of files per video. Written by the
**📦 Save All 3** button in the [Canvas Recorder](http://localhost:5173/canvas-recorder.html),
which drops all three files here in one click.

Three file types, all named after the video's `toShow` key:

| File | What it is |
| --- | --- |
| `<video>.json` | The current saved state — the same thing 💾 [Save](../development-plans/saving-and-undoing.md#save) writes. |
| `<video>-ts-defaults.json` | The **TypeScript defaults**: the state as defined in code, before any Visual Editor changes. Same content as the "Save defaults" checkbox writes. See [Smarter Save Status](../development-plans/smarter-save-status.md#saving-the-status). |
| `<video>.txt` | A **diff**, not a log — a human-readable comparison of the live tree against the TypeScript defaults. Produced by the "Save Diffs" button. The `.txt` extension hides this, hence this table. |

These are a baseline snapshot taken before the
[single-tree-per-video refactor](../development-plans/single-tree-per-video.md). Commit them, so
there is something to roll back to.

## TODO — save each video

Open each link, click **📦 Save All 3**, then tick it off.

The first click asks which folder to use. **Navigate to `canvas-recorder/properties/`** — do not
accept whatever the picker happens to open, which may be somewhere else entirely. The button
checks the folder's name and refuses anything not called `properties`, so a wrong answer shows an
error instead of being silently remembered. After one correct answer there are no more dialogs,
and that single grant covers every video.

- ✅ [showcase](http://localhost:5173/canvas-recorder.html?toShow=showcase)
- ✅ [sierpiński](http://localhost:5173/canvas-recorder.html?toShow=sierpi%C5%84ski)
- ✅ [peano-fourier](http://localhost:5173/canvas-recorder.html?toShow=peano-fourier)
- ✅ [peano-arithmetic](http://localhost:5173/canvas-recorder.html?toShow=peano-arithmetic)
- ✅ [morph-test](http://localhost:5173/canvas-recorder.html?toShow=morph-test)
- ✅ [stroke-colors-test](http://localhost:5173/canvas-recorder.html?toShow=stroke-colors-test)
- ✅ [some5](http://localhost:5173/canvas-recorder.html?toShow=some5)
- ✅ [some5-reference](http://localhost:5173/canvas-recorder.html?toShow=some5-reference)
- ✅ [shadow-test](http://localhost:5173/canvas-recorder.html?toShow=shadow-test)
- ✅ [lissajous](http://localhost:5173/canvas-recorder.html?toShow=lissajous)
- ✅ [galaga](http://localhost:5173/canvas-recorder.html?toShow=galaga)
- ✅ [alpha-test](http://localhost:5173/canvas-recorder.html?toShow=alpha-test)

Then `git add properties/ && git commit`.
