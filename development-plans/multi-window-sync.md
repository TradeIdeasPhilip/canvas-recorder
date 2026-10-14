# Multi-Window Sync

_Idea and assessment, 10/8/2026.  Not scheduled._

Several windows open on the same video stay in sync with each other's changes, the way
[sound-explorer.html](../sound-explorer.html) already does.

## Use cases

- **Two editors, one video.**  Edit one scene in one window and another scene in a second
  window, while a third plays a loop through both.  The same thing as two views of one image
  in Paint Shop Pro, or one file open in both halves of VS Code.
- **A display that doesn't fit the layout.**  A prototype, a one-off, a rarely used panel:
  open another window instead of finding room in the existing HTML.
- **The accidental duplicate tab.**  The same video open twice without realizing it.  This
  has already happened once, and explained some mysterious behaviour just before it.  It was
  also the main reason Sound Explorer got this feature.

## The design, as proposed

1. **Start of a batch.**  When the first change of a batch starts the autosave timer, tell
   every other window.  Send one message per batch, not one per change.  Other windows show a
   clearly noticeable, non-disruptive status light: "another window is editing".
   - **Advisory only.**  There is no lock.  A window that dies mid-batch leaves nothing
     to clean up; the light just expires.
2. **End of a batch.**  When a window saves to IndexedDB (and, optionally, to its synced files),
   tell every other window, and they bring themselves up to date.
3. **Conflicts.**  If this window has unsaved changes when another window's save arrives,
   don't save over it, because that would set off more changes.  Instead:
   - Put this window's state into the history as an entry just *older* than the incoming one,
     without notifying anyone.
   - Suggest the Load window as the way to merge.
   - Nothing is lost:  both states are in Load.
4. **No unnecessary changes.**  Applying another window's save must not disturb what this
   window is doing.  If you're editing component A here and component B changes elsewhere,
   A's editor stays exactly as it was.

## Assessment

How Sound Explorer does it, for comparison:  `localStorage` plus the browser's `storage` event
(`dev/sound-explorer.ts:988`).  That's simple because a `localStorage` write is synchronous,
and the browser itself tells every other same-origin window about it.  IndexedDB has no
equivalent, so the messaging has to be added; `BroadcastChannel` is the standard API.

| # | Item | Effort | Certainty |
|---|---|---|---|
| 1 | Messaging:  one `BroadcastChannel` per video key | Small | High |
| 2 | "Another window is editing" light that expires on its own | Small | High |
| 3 | Not echoing:  applying a remote change must not re-save or re-broadcast | Small | High |
| 4 | Is a write visible to other windows yet? | None:  not a real problem | High |
| 5 | IndexedDB connection hygiene | Small | High |
| 6 | Synced files when several windows sync the same file | Small | High |
| 7 | Conflicts:  stash local state in history, point to Load | Small–Medium | High |
| 8 | Applying a remote state without rebuilding everything | **Medium** | Medium–High |
| 9 | Keeping the GUI steady:  selection, scroll, focus, open dialogs | **Medium** | **Medium** |

Items 1–7 are plumbing.  Items 8 and 9 are where the cost is.

### Details behind the table

**1, 2.**  The first change of a batch is easy to detect:  it's when `markDirty()`
(`dev/canvas-recorder.ts`) finds no autosave timer running.  Note that the timer is a 5 s
*debounce*, so a long editing session is one long batch.  The light should be refreshed by a
throttled "still editing" message, and expire a few seconds after the last one.  Send a
"closed" message on `pagehide` too, so a clean exit clears it immediately.

**3, echo loops.**  Applying the incoming state goes through the normal setters, which call
`scheduleHasChanged()` and `markDirty()`.  So set the baseline (`_baselineTreeJson`) to the
incoming state, and suppress the "editing" broadcast, while applying.  Otherwise windows bounce
the same change back and forth.  Easy, but it has to be designed in from the start.

**4, "we're never sure when a write is visible".**  That isn't really the case.  Once an
IndexedDB transaction's `complete` event fires, every connection, in every window, sees the
data.  `writeVideoHistory()` already resolves on `complete`, so a broadcast sent after awaiting
it is safe.  The refresh problem remembered here was different:  `beforeunload` can't wait for
async work, so that last write often never committed at all.

Simplest of all:  put the whole tree *in the message*.  `BroadcastChannel` uses structured
clone, and even `some5` is only about 170 KB.  IndexedDB stays the record, but receivers never
need to read it.

**5, connection hygiene — already a latent issue.**  `openScheduleDB()` opens a new connection
on every call, never closes one, and has no `onversionchange` handler.  Any other open window
therefore blocks the next schema upgrade, which is exactly what the `onblocked` message added
for v3 and v4 warns about.  The fix is to cache one connection and close it on
`versionchange`, asking for a reload.  This is worth doing on its own.

**6, synced files — probably a bug today, with duplicate tabs.**  `SyncedFile`
(`dev/synced-file.ts`) loads its record once and keeps `lastWrittenBody` in memory.  Its
"never clobber" rule compares the file on disk with that remembered body.  So when window A
writes the synced file, window B's memory goes stale.  The next time B syncs, it sees A's write
as an outside edit and reports "⚠ changed on disk".  That may be some of the mysterious
behaviour seen with the accidental duplicate tab.

The fix is for each sync to re-read its record from IndexedDB, which is where `store()` keeps
it.  Possibly also only the window that saved should write the files.

**7, conflicts.**  `isVideoDirty()` already answers "does this window have unsaved changes?"
The stash is `saveVideoStateToDb()` with an explicit timestamp and no broadcast.  One catch:
startup restores `entries.at(-1)`, the *last array element*, not the newest timestamp.  So the
stashed entry has to be inserted *before* the incoming one in the array, not just given an
older timestamp.  The Load dialog sorts by timestamp, so it will show both.

**8, applying without rebuilding.**  Today every apply rebuilds:

- `applySnapshot()` (`src/showable.ts`) empties each schedule array and refills it with *new*
  keyframe objects.
- `applyFixedComponents()` (`src/snapshot.ts`) replaces each replaceable child list with new
  components from `buildComponents()`.

So after any apply, `selectedSlideChild`, the ✎ edit-mode keyframe (`editingRectKf` and
friends), and every `*SyncCallbacks` map point at objects that no longer exist.

What's needed is a *diff-apply* that walks the live tree and the incoming tree together,
the way `findSerializedNode()` does:

- touch only the schedules, scalars, durations and sound clips whose serialized form differs
- for a replaceable child list, keep the existing objects and recurse into them when the
  `registryKey` sequence matches, and rebuild only that one list when it doesn't

This is one new function next to `applyFixedComponents()`.  It's feasible because, since the
single-tree refactor, every piece of state goes through one uniform format.  Under the old
per-chapter records this would have been much harder.

The residual risk is components with private state that serialization doesn't capture:
caches, and `RootComponentEditor`s like the one in `some5`.  They already survive Load,
so probably fine, but unverified.

**9, keeping the GUI steady — the most uncertain item.**  There is no existing trick here.
Today `refreshGUI("structure")` sets `selectedSlideChild = null` and rebuilds both editors from
scratch.  That's acceptable after your own action, and wrong for a change from somewhere else.
With item 8 keeping objects alive:

- Rebuild an editor only if *its* component's data changed.  The `*SyncCallbacks` maps already
  update inputs in place without a rebuild; that is the nearest thing to a trick, and it
  covers some fields.
- Keep the selection by object identity, falling back to its path in the tree.
- **While a dialog is open** (color picker, font picker, Load, Insert/Wrap), defer the merge
  until it closes, with the status light showing "update waiting".  That is far cheaper and
  more predictable than deciding whether a dialog is still relevant, and it costs only a short
  delay.
- Focus inside a rebuilt editor is the hard case.  It only arises when the other window
  changed the very component you're editing here, which is a conflict in all but name.

### Item 9 is also wanted for Vite reloads

_Added 10/12/2026._  The same "put the GUI back the way it was" problem comes up without a
second window:  **every time Vite forces a full page reload.**  That happens on most saves of a
source file, and it's a frequent, long-standing annoyance.

- **What survives a reload today.**  `saveState()` (`dev/canvas-recorder.ts`) writes the left
  side and the canvas to `sessionStorage` on the way out:
  - the chapter, playhead, playing or not, and the "on section end" choice
  - zoom and pan, quality, and splitter sizes

  The tree's data survives too, through the unload backup.
- **What's lost.** The whole right side:
  - which component is selected
  - which keyframes are in ✎ or 👁 mode
  - which schedules are in Durations mode
  - scroll positions in the component tree and the schedule editor
  - which field had focus, and where the caret was
- **Harder than sync in one way.** After a reload every object is new, so nothing can be kept
  by identity.  Everything has to be found again by **path**:
  - the sibling-by-description walk `findSerializedNode()` already does
  - then a schedule's description, then a keyframe's index

  Durations mode, for example, is a `WeakSet` of `ScheduleInfo` objects today, so it would
  need a path-based key.
- **Easier than sync in another.** There's nothing to merge, because it's this window's own
  state.  The one twist is that the reload usually happened *because the TypeScript changed*,
  so some paths may not resolve any more.  Fall back quietly:
  - select the nearest ancestor that still exists
  - drop a ✎ whose keyframe is gone

### One mechanism for both

Build a **GUI state snapshot**, captured and applied by path, and use it in both places:

- **Reload:** capture in `saveState()`, apply after `initFromDB()`.  This needs none of the
  multi-window work, so it's useful on its own, immediately.
- **Sync:** capture before applying another window's tree, apply afterwards.  That turns
  stage 2's blunt full rebuild into something close to stage 3's smooth apply, *without* item
  8's diff-apply.  Item 8 then matters only for keeping focus and half-typed text in an
  editor that is rebuilt.

| Item | Effort | Certainty |
|---|---|---|
| Snapshot and restore selection, ✎ / 👁, Durations mode, scroll | Small–Medium | High |
| Restore focus and caret position | Small | Medium |
| Graceful fallback when the TypeScript changed | Small | High |

This raises its priority.  It could be done first, before any of the multi-window plumbing.

### Review:  the low-hanging fruit (10/13/2026)

The common case after a reload is a tree identical to the one before it.  The next most common
is a small, local change.  When something odd happens, landing somewhere reasonable is good
enough.  With those expectations, most of this is small.

**An existing bug first.**  Today's restore runs *before* the saved tree is restored.
- `initFromDB()` is async, but the block that reads `sessionStorage` runs synchronously at the
  end of module load.  So the chapter index and the playhead are applied to the *TypeScript
  default* tree.
- When the saved tree differs, they land in the wrong place.  `galaga` is the clear example:
  its Video Clip only exists in saved state.
  - The saved chapter index points at a different entry, or falls back to 0.
  - The playhead is clamped to the TypeScript tree's limits.  Galaga's TypeScript duration is
    0, so it restarts at 0 every time.
- **Fix:** keep reading `sessionStorage` where it is, before `sessionStorage.clear()`, but
  *apply* it after `initFromDB()` and the JSON fallback have finished.  The canvas is hidden
  until then anyway, so nothing visible is lost.  Every step below depends on this one.

**A path helper, about 30 lines.**  Locate a Showable as a list of child indices from `toShow`,
recording each step's name (`userEditableDescription ?? description`).  To find it again, walk
the indices:
- If the child at an index has a different name, look for a sibling with the saved name.
- If there's none, stop.  The result is the deepest ancestor that still exists, which is the
  "reasonable state" fallback.

The steps, in order of value for the effort:

| # | Step | Effort | Notes |
|---|---|---|---|
| 1 | Apply the restore after `initFromDB()`.  Root and play limits by **path** instead of list index. | Small | Fixes the bug above.  The chapter list changes shape often now. |
| 2 | **Selected component** by path, then `selectInChapter()` | Small | The biggest win. |
| 3 | **Scroll positions** of `#componentsEditor .components-list` and `#bottom-right` | Trivial | Apply after step 2 rebuilds the editors. |
| 4 | **Focus and caret.**  Save the focused field's position among the schedule editor's inputs, textareas and selects, plus its value and selection.  Restore focus only if the field at that position holds the same value. | Small | The value check makes a wrong guess harmless, so certainty goes from Medium to High.  The half-typed text is already safe:  every keystroke goes into the tree. |
| 5 | **✎ / 👁 and Durations** for the selected component's schedules, saved as (schedule description, keyframe index), then one rebuild of the schedule editor.  Same for the Text Frame panel's state on a selected Multi Text. | Small–Medium | Touches several variables (rect, point, arrow, lattice), each simple. |
| 6 | **Selected sound clip:**  owner path plus index | Small | Lower value. |

**Not worth doing yet:**
- state for components that aren't selected
- dialogs that were open during the reload
- the timeline's zoom

Steps 1–3 are a good first commit.  They fix the bug and restore the selection.  Step 4 then
covers the "I was typing when Vite reloaded" case.

## Suggested order

Each stage is useful on its own:

0. **GUI state snapshot** (small–medium).  See "One mechanism for both", and the step-by-step
   list in "Review:  the low-hanging fruit".  It fixes Vite reloads on its own, and stages 2
   and 3 reuse it.
1. **Plumbing and warning** (small, high certainty).  Items 1–7.  When another window saves, show
   "newer changes from another window", with a **Load latest** button that uses today's full
   apply.  This fixes the accidental-duplicate-tab case, item 6's false conflicts, and the
   blocked upgrades.
2. **Automatic apply, but blunt** (small).  Apply automatically when this window has no unsaved
   changes, using the existing full rebuild.  That's perfect for the "third window just
   playing" case, and for a separate display window, since neither has an editor in use.
3. **Smooth apply** (medium).  Items 8 and 9.  This is what the two-editors case needs.
   With stage 0 done, most of item 9 is already there, and what's left is mostly item 8.

## Not a concern

- Different windows on different chapters, zooms or playback positions:  only the tree is
  shared.
- `sessionStorage` (the unload backup) is per tab already.
- Different videos in different windows:  one channel per video key.
- The shared history:  saves from every window interleave in Load.  That's arguably a feature:
  Load becomes the merge tool the conflict design relies on.
