# Save one tree per video

**Status: Complete**

## Context

A video is one root `Showable` tree. Every entry in `src/dynamic-exports.ts` exports a single
root object, and `dev/canvas-recorder.ts:140` loads exactly one of them.

But persistence stores **one record per chapter**, keyed by
`selectableKey(sel)` = `` `${toShowKey}|${sel.description}` `` (`dev/canvas-recorder.ts:~2915`).
That came from the design in `development-plans/saving-and-undoing.md` and
`smarter-save-status.md`, which assumed a video was "a handful of independent top-level
components." `smarter-save-status.md:17` still reads "**TODO** We need better terminology" —
the terminology never settled because the concept stopped being coherent.

What actually happened: `dump()` (`~:1160`) flattens the *whole* tree into `chapterList`, so
every slide became its own "savable unit". Now that durations are editable from the Visual
Editor, everything is one connected tree and the splitting has no subject left to split.

**Why the split existed, and why that reason is gone.** Before the Load window, a savable unit
*was* the scope of an undo — the only way to roll something back was to restore one whole unit,
so the granularity of storage had to match the granularity you wanted to undo. The Load window
removed that coupling: it applies to whatever the chapter selector has selected
(`_dialogSelectItem` → `currentSaveTarget()` `:3013`), so undo scope is now a GUI concern and can
be anything. The small pieces did serve a real purpose; that purpose is obsolete.

Goal: make the stored unit match reality — one tree per video, keyed by `toShowKey`.

This plan has two phases. **Phase 0** builds a one-click "Save All" button and a checklist so the
pre-refactor baseline can be captured across all 12 videos without 36 hand-driven dialogs; it also
removes the now-redundant "Restore Defaults" button. **Phase 1** is the refactor itself. A copy of
this document belongs in `development-plans/` alongside the others.

## Evidence

**The file format is already one tree per video.** Every save file on disk has exactly *one*
top-level key:

| file | top-level keys | the single key |
|---|---|---|
| `some5.json` | 1 | `some5\|SoME5 » shadow` |
| `showcase.json` | 1 | `showcase\|Showcase` |
| `shadow-test.json` | 1 | `shadow-test\|Shadow Test » shadow` |
| all three `*-ts-defaults.json` | 1 | same keys |

`showcase.json`'s one entry holds a nested tree 3 levels deep containing 56 nodes. The flat map
has never held more than one element. `buildJsonSnapshot` (`:6094`) consults
`buildFixedDescendantSet()` (`:6097`), which suppresses every chapter that is a fixed descendant
of another — and since everything is one connected tree, that is everything except the root.

**The nested node type is essentially complete.** Across the three real files, nodes carry
`schedules`, `scalars`, `components` (replaceable, with `registryKey`), `fixedComponents`,
`duration`, `soundClips`, `userEditableDescription`, `description`. `SerializedFixedChild`
(`src/snapshot.ts:20`) is already a full recursive node, and `serializeFixedComponents` /
`applyFixedComponents` (`src/snapshot.ts:156` / `:191`) already recurse correctly. **The tree
serializer exists, works, and is what your files already contain.**

One caveat, verified and important: the *replaceable* branch of that recursion,
`serializeComponents` (`src/snapshot.ts:97-109`), does not emit `fixedComponents` or
`soundClips`. See the first entry under Risks — it is the one thing that could lose data, and it
is already losing it in your JSON files today.

**The two formats disagree about what a unit is.** There are **13** `for (const item of
chapterList)` loops; only **2** consult `buildFixedDescendantSet()` (`:2746` `captureDefaults`,
`:6097` `buildJsonSnapshot`). The other 11 — including `initFromDB` `:2819`,
`saveScheduleState` `:2919`, `_autosaveAllDirty` `:3033`, `saveOnUnload` `:3076` — do not. So a
nested slide gets a flat IndexedDB history record *and* an embedded copy inside its ancestor's
record. Two writers; restore order picks the winner. That inconsistency is the root of the
"Restore TypeScript defaults does nothing" bug fixed earlier today, and `findTsDefaults` /
`findNestedTsDefaults` (`:2646-2697`, ~50 lines) exist purely to compensate for it.

**Much of the code already thinks whole-video.** The `files` store is scoped by `videoKey`. The
user-visible dirty asterisk is whole-video: `:2638` does
`JSON.stringify(buildJsonSnapshot()) !== _lastKnownJsonBody`. `diffNode` (`:2384`) works by
recursive tree walk with the flat map bolted on the front. The per-key layer is a vestigial
index over a tree format that already works.

**Weight:** roughly 900–1500 lines of per-key bookkeeping against 300–460 lines of actual
serialization — about 3:1.

## Design

One record per video, keyed by `toShowKey`.

```jsonc
{
  "formatVersion": 2,
  "videoKey": "showcase",
  "tree": { /* the existing recursive node: schedules, scalars,
              components, fixedComponents, duration, soundClips, ... */ }
}
```

`tree` is exactly today's `SerializedFixedChild` shape — no new serialization code.

**Addressing a node for scoped apply.** Walk the live tree and the serialized tree in parallel,
pairing children by `description`, the way `applyFixedComponents` (`src/snapshot.ts:191`)
already does. `findNestedTsDefaults` (`:2646`) already *is* this function — rename it
`findSerializedNode(liveNode, serializedNode, wanted)` and keep it; only the `findTsDefaults`
wrapper (`:2676`) around it goes away.

Do *not* introduce a path-string key. Three reasons:
- `dump()` collapses single-child chains (`:1173-1188`), so a structural path changes shape
  whenever a sibling's duration goes to zero — it is unstable as a stored key.
- A path re-encodes a parent/child link the live tree already has.
- Parallel walking makes description collisions *sibling-local* instead of global, and
  `serializeFixedComponents` already warns on that case (`src/snapshot.ts:162`). A rename then
  loses one node instead of orphaning a whole record.

**The Load dialog keeps scoping to the chapter selector.** `_dialogSelectItem` applies to
`currentSaveTarget()` (`:3013`), which is the selected chapter. That is a GUI property and does
not change. Selecting a snapshot locates the corresponding node in the stored tree and applies
just that subtree.

## What changes

**Delete outright**
- `buildFixedDescendantSet()` `:2722` — nothing to deduplicate once there is one record.
- `findTsDefaults` `:2676` — the wrapper only; its inner walk survives as `findSerializedNode`.
- The `seen`/`selectableKey` preamble in all 13 `chapterList` loops.
- `MarkerHistoryEntry.kind: "json"` — declared but never written.
- The ts-defaults marker and `writeMarkerIfNeeded` `:2703` — `loadDefaultsAction` instead applies
  the defaults tree and marks dirty, so autosave writes a real snapshot.

**Simplify**
- `selectableKey()` `:2915` → the record key is just `toShowKey`. Keep the function only if
  something still needs per-node identity; expect it to disappear.
- `saveScheduleState` `:2919` → serialize the root once.
- `initFromDB` `:2793`, `saveOnUnload` `:3067`, `_autosaveAllDirty` `:3031`,
  `buildJsonSnapshot` `:6094`, `applyJsonSnapshot` `:6296`, `applyJsonSnapshotFromFile` `:6339`,
  `loadDefaultsAction` `:6475` → one serialize / one apply, no loop.
- `isDirty` `:2586` → one comparison for the video. The whole-video comparison at `:2638`
  already exists; collapse the two mechanisms into it.
- `buildDiffText` `:2502-2515` → drop the flat driver, start `diffNode` at the root.
- `loadSources`, `loadedSnapshots`, `tsDefaults` → single values, not maps.

**Keep unchanged**
- All of `src/snapshot.ts`'s value serialization: `serializeSchedules`, `serializeScalars`,
  `serializeFixedComponents`, `applySnapshot`, `applyScalarSnapshot`, `applyFixedComponents`,
  `applyJsonEntry`.
- The `files` store and active-file handling — already whole-video.
- `diffNode` and `generateComponentCode`.

**Conditionally changed**
- `serializeComponents` (`src/snapshot.ts:88`) — unchanged *only if* the step-1 reachability
  assertion comes back clean. If it fires, teach it to recurse into `fixedComponents` and
  `soundClips` as a separate, self-contained fix before step 3. See Risks.

## Migration

Old files are trivially convertible because they already have one key:

```ts
// delete once the files on disk are all version 2
function readAnyFormat(json: unknown): Node {
  if (hasFormatVersion(json)) return json.tree;
  const keys = Object.keys(json);           // historically always length 1
  if (keys.length === 1) return json[keys[0]];
  // defensive: >1 key has never occurred, but merge rather than lose data
  return mergeLegacyEntries(json);
}
```

Every save writes version 2. Keep the reader in one clearly-marked function so it can be deleted
later.

## Phase 0 — baseline tooling (build this first, before any refactor)

Capturing a baseline by hand across 12 videos is ~36 dialogs and easy to get wrong. Automate it.

### A. "Save All" button

New button beside "Save Diffs" (`canvas-recorder.html:39`). Writes all three properties files for
the current video to `properties/`, with no dialogs.

- **Directory access:** one-time `showDirectoryPicker()` to grant
  `canvas-recorder/properties/`; store the handle in the existing `files` store under filename
  `__properties-dir__` with **no `videoKey`**. Verified safe: `readAllFileRecords` (`:2031`) and
  `readActiveFileRecord` (`:1959`) both filter on `r.videoKey === videoKey`, so a record without
  one is invisible to the Load dialog and to active-file logic. Widen `FileRecord.handle`
  (`:1943`) to include `FileSystemDirectoryHandle`.
  Because `properties/` is shared across videos this is **one grant for all 12**.
- **Writing:** `dirHandle.getFileHandle(name, { create: true })` → `createWritable()`. No picker,
  so the three existing picker `id`s (`json-state`, `defaults-auto-save`, `diff-save`) keep their
  own remembered directories untouched.
- **Permission:** re-check with `queryPermission({mode:"readwrite"})`, escalate to
  `requestPermission`, and fall back to the directory picker if denied.
- **Order:** state `.json` → defaults `.json` → diff `.txt`, each awaited. Report progress in a
  status line (`✓ showcase: state, defaults, diff → properties/`); that replaces the final dialog
  as the end-of-chain signal.
- **Filenames unchanged:** `${toShowKey}.json`, `${toShowKey}-ts-defaults.json`, `${toShowKey}.txt`.
- **Semantics:** the state `.json` behaves like **Save Copy As** — it must NOT repoint
  `_activeFileRecord` at `properties/`, since this is a snapshot, not a new working file.
- **Do not** reuse the "Save defaults" checkbox toggle to force a path: toggling it off calls
  `deleteFileRecord(DEFAULTS_AUTO_SAVE_KEY)` (`:2193`) and would discard the existing auto-save
  binding. Write the defaults file directly instead.

The fourth picker, `video-save` (`:816`, `canvas-recording.mp4`), is recorded video output, not a
properties file — out of scope.

### B. `properties/README.md`

Two sections. First, a brief description naming the three file types — `.json` (saved state),
`-ts-defaults.json` (TypeScript defaults), `.txt` (**the diff** — not obvious from the extension)
— each linking to more detail. Second, a TODO checklist of the 12 videos, each a link to
`http://localhost:5173/canvas-recorder.html?toShow=<key>` with the video name as the link text.

### C. Remove the "Restore Defaults" button

Delete `loadDefaultsBtn` (`canvas-recorder.html:25`) and `loadDefaultsAction` (`:6475`). Restoring
everything is now just the Load dialog with the root selected — no special case needed, and the
button was wide. This also removes one of the 13 `chapterList` loops before the refactor starts.

## Sequencing

Each step leaves the editor working and hand-testable.

0. **Capture a baseline for every video — blocking.** Only 3 of the 12 videos in
   `src/dynamic-exports.ts` have a `.json` file today; the other 9 have state that exists *only*
   in IndexedDB, which is exactly what steps 4+ touch.

   Using the Phase 0 button: open each video at `canvas-recorder.html?toShow=<key>` and click
   **Save All** once. Work down the checklist in `properties/README.md`:

   `showcase`, `sierpiński`, `peano-fourier`, `peano-arithmetic`, `morph-test`,
   `stroke-colors-test`, `some5`, `some5-reference`, `shadow-test`, `lissajous`, `galaga`,
   `alpha-test`

   Then `git commit properties/`, and record the Dump DB output (`readAllHistory`, caller
   `:6073`) so there is a record of how many history records each video had.

   This is both the rollback and the reference for step 2's gate. **Do not start step 1 until
   this is done and committed.**
1. **Add the new types and helpers; change nothing else.** `serializeTree()` / `applyTree()`
   wrappers over the existing recursive functions, plus `findSerializedNode`. Add a temporary
   `philDebug` assertion that every `chapterList[i].selectable` is reachable in `serializeTree()`
   and `console.error`s the ones that are not. **This is the gate for the coverage gap below —
   do not proceed past step 2 until it reports nothing.**
2. **Switch `tsDefaults` to a single tree** and repoint `applyTsDefaults`, the `buildDiffText`
   driver, and `buildDefaultsSnapshot`. **Gate: the new Save Diffs output must be byte-identical
   to step 0's.** That is the closest thing to a regression test available here. If it differs,
   stop and find out why.
3. **Switch the JSON file to version 2** (reader still accepts both). Lowest risk — the file
   already contains one tree. Save As → reload → intact; load the step-0 legacy file → intact.
4. **Add a new IndexedDB store for whole-video records.** Bump to v3 and add a `videos` store
   (keyPath `videoKey`). **Leave the old `history` store in place, untouched and unread** — that
   is the rollback. Verify: edit → wait 5s → reload survives; edit → close tab → reopen survives.
5. **Convert the Load dialog** to whole-video entries with subtree-scoped apply. Verify preview,
   Cancel reverts, Keep persists, and scope still follows the chapter selector.
6. **Collapse dirty tracking** onto the existing whole-video comparison at `:2638`.
7. **Delete `buildFixedDescendantSet` and the remaining loops.** Click every button once.
8. **Later, separately:** delete the legacy reader, and only then the old `history` store.

## Risks

- **Coverage gap in `serializeComponents` — highest risk, and pre-existing.**
  `serializeComponents` (`src/snapshot.ts:97-109`) emits `registryKey`, `schedules`, `scalars`,
  nested `components`, `userEditableDescription` and `duration` — but **not** `fixedComponents`
  and **not** `soundClips`, unlike `serializeFixedComponents` (`:169-185`). So any state hanging
  off a *replaceable* component is already absent from the JSON file today. It survives only
  because such a node also gets its own flat IndexedDB record, which serializes it fully. Collapse
  to root-only storage and that cover disappears.
  This is a bug that already exists in your saved files, not one this refactor introduces — but
  this refactor is what would make it bite. **The step-1 reachability assertion and the step-2
  byte-identical diff are the two gates; both must pass before step 3.** If the assertion fires,
  fix `serializeComponents` to recurse into `fixedComponents`/`soundClips` first, as its own
  separate change.
- **Losing saved work in the IndexedDB change (step 4).** De-risk: add the new store *alongside*
  the old one and never delete `history` in the same release. Commit the three JSON files first —
  they are tracked in git. Add `req.onblocked` logging at `:1925`; a second open tab on v2 will
  otherwise block the upgrade silently.
- **Size.** One whole tree replaces ~30 small records. `showcase.json` is 32 KB and `some5.json`
  is 166 KB, and `MAX_HISTORY_ENTRIES` is 20 — so the history could reach several MB for `some5`.
  Keep 20 initially, check the actual byte size in devtools, drop to 10 if needed. Separately, the
  `sessionStorage` unload backup (`:3206`) now holds one large blob against a ~5 MB quota: wrap
  that `setItem` in try/catch, since the DB write has already happened and losing the backup is
  survivable.
- **Undo history granularity changes.** Snapshots become whole-video. The *apply* stays
  subtree-scoped, so "revert just this slide" still works — but the list of timestamps in the
  Load dialog becomes the same regardless of which chapter is selected, where today each chapter
  has its own list. This is a real, visible behavior change.
- **Losing per-key timestamp arbitration.** Today one chapter can come from the file while
  another comes from the DB (`:6352`). Note this is arguably a bug: a file missing some keys is
  never rejected (`:6309, 6348, 6163, 6463` all `continue`), so "load this file" can silently
  produce a half-file / half-DB video. Replacing it with whole-video arbitration is a
  correctness improvement, but it *is* a change.
- **Duplicate descriptions.** Today the `seen` guard silently drops the later node. Parallel-walk
  matching has the same weakness one level down. Out of scope to fix, but worth a warning where
  `applyFixedComponents` already warns (`src/snapshot.ts:159`).

## Verification

No test runner; verify by hand in the browser at
`http://localhost:5173/canvas-recorder.html?toShow=showcase`.

1. `npx tsc --noEmit` clean after each step.
2. **The two gates, in order** (see Risks): step 1's reachability assertion reports nothing, and
   step 2's Save Diffs output is byte-identical to the step-0 baseline (`diff` the two `.txt`
   files). These are the only regression detectors available; do not skip them.
3. Round-trip: edit a lattice/slide value → Save → reload page → value persists.
4. Scoped apply: select a nested slide, open Load, pick an older snapshot → only that slide
   changes; siblings untouched.
5. The bug from today: select a nested slide → Load → "TypeScript defaults" → it actually
   restores.
6. Old-file compatibility: load the committed `showcase.json` (version 1) and confirm it applies,
   then save and confirm the file becomes version 2.
7. Dirty status: change something → asterisk appears; change it back → asterisk clears.
8. Check `some5` as well as `showcase` — it is the largest real project (166 KB, uses replaceable
   `components` with `registryKey`).

## Status 9/23/2026

Steps 0–7 are done. `dev/canvas-recorder.ts` lost roughly 500 lines, and all 13
`for (const item of chapterList)` loops are gone. Baseline, format switch, and IndexedDB change
are in commits 56c37df, 1b7b76f and 34bd300.

**Correction to step 6.** The plan said to collapse the two dirty flags into one. That was
wrong: they compare against different baselines, and both are needed.

- `isVideoDirty()` compares against the last load from, or save to, IndexedDB. It drives
  autosave.
- The asterisk in `updateJsonSaveStatus()` compares against the last body written to the active
  file.

After an autosave the first is clean and the second is still dirty, which is correct. What did
collapse was the bookkeeping: `loadSources` and `loadedSnapshots` were maps that only ever held
the root's key, and are now the single variables `_loadSource` and `_baselineTreeJson`. Both
flags now use the same serialization.

**The coverage gate passed for all 12 videos** (208 selectables), so `serializeComponents` was
left unchanged. The gate was temporary and has been removed.

**Bugs found along the way:**

- The Load dialog read files on its own path and would have shown "(not in file)" for every
  version-2 file.
- Cancel/Revert applied a whole-video snapshot to whichever chapter was selected.
- The dirty check and the history dedup serialized differently (only one included
  `userEditableDescription`), so a renamed component read as dirty forever.
- `_preDialogSource` was looked up by the selected chapter's key, which after step 4 was never
  set for anything but the root.
- `initFromDBComplete` was written but never read, even before this refactor.

### Step 8 — done 9/23/2026

- Removed the version-1 file reader (`src/legacy-snapshot.ts`). Every tracked state file had
  already been re-saved as version 2. To open a version-1 file, check out an earlier commit
  and re-save it there.
- IndexedDB is now v4. The per-chapter `history` store is deleted, and so are
  `HistoryRecord`, `DataHistoryEntry`, and `readAllHistory`.
- Removed the temporary **📦 Save All 3** button, about 180 lines. The v4 upgrade also deletes
  the `__properties-dir__` record it left in the `files` store. `test-rig.html` is kept for
  future bulk jobs.
- "never saved" now shows `*` when the state differs from the TypeScript defaults, like an
  untitled document.

**Not done, deliberately:** migrating the per-chapter records into the `videos` store. Step 4
created `videos` empty. Any video whose edits lived only in IndexedDB, with no active file,
therefore fell back to its defaults on first load after the upgrade. The only affected browser
was the author's, and those videos were scratch work backed up in git, so the migration was
skipped rather than written after the fact.
