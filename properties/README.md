# Properties

Saved Visual Editor state for each video, one set of files per video. These were written in
bulk by a temporary **📦 Save All 3** button while doing the
[single-tree-per-video refactor](../development-plans/single-tree-per-video.md); that button has
since been removed. The [test rig](../test-rig.html) that clicked it on every video is still
around for the next bulk job.

Three file types, all named after the video's `toShow` key:

| File | What it is |
| --- | --- |
| `<video>.json` | The saved state — the same thing 💾 [Save](../development-plans/saving-and-undoing.md#save) writes. |
| `<video>-ts-defaults.json` | The **TypeScript defaults**: the state as defined in code, before any Visual Editor changes. Same content as the "Save defaults" checkbox writes. See [Smarter Save Status](../development-plans/smarter-save-status.md#saving-the-status). |
| `<video>.txt` | A **diff**, not a log — a human-readable comparison of the live tree against the TypeScript defaults. Produced by the "Save Diffs" button. The `.txt` extension hides this, hence this table. |

All the `.json` files are format version 2: `{ "formatVersion": 2, "videoKey": …, "tree": … }`.
Version 1 files are no longer readable by the current code.

To refresh one video's files, use **💾 Save As**, the **Save defaults** checkbox, and
**Save Diffs**, pointing each at this folder.

- [showcase](http://localhost:5173/canvas-recorder.html?toShow=showcase)
- [sierpiński](http://localhost:5173/canvas-recorder.html?toShow=sierpi%C5%84ski)
- [peano-fourier](http://localhost:5173/canvas-recorder.html?toShow=peano-fourier)
- [peano-arithmetic](http://localhost:5173/canvas-recorder.html?toShow=peano-arithmetic)
- [morph-test](http://localhost:5173/canvas-recorder.html?toShow=morph-test)
- [stroke-colors-test](http://localhost:5173/canvas-recorder.html?toShow=stroke-colors-test)
- [some5](http://localhost:5173/canvas-recorder.html?toShow=some5)
- [some5-reference](http://localhost:5173/canvas-recorder.html?toShow=some5-reference)
- [shadow-test](http://localhost:5173/canvas-recorder.html?toShow=shadow-test)
- [lissajous](http://localhost:5173/canvas-recorder.html?toShow=lissajous)
- [galaga](http://localhost:5173/canvas-recorder.html?toShow=galaga)
- [alpha-test](http://localhost:5173/canvas-recorder.html?toShow=alpha-test)
