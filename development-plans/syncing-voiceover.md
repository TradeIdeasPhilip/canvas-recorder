# Syncing Voiceover

_Originally 6/27/2026.  Trimmed 10/15/2026 to what's still left.  The original is in git
history._

The problem:  fitting a voiceover to animation that already exists, and the animation to the
voiceover.  `some5` is the motivating case, and it's still in progress.

## Done since the original

- **The chapter selector no longer does everything.**  The Visual Editor's root and the play
  limits are separate, with **Keep play limits** for looping one section while editing another.
  See [historical/chapter-selector.md](historical/chapter-selector.md).
- **Sound clips in the GUI:**
  - on the timeline, with drag, trim and snapping to the quiet moments between words
  - in the schedule editor, with an Owner menu to rehome a clip without moving it in time
  - Paste from Sound Explorer, ✂ Split, and ✂ Cut out of the transcript
- **Transcripts,** with the 📖 Text view, the playhead in the text, and red and orange flags
  for likely mistakes.
- **Inserting time:**
  - every schedule editor has a **Durations** mode, where a change ripples through all later
    keyframes
  - In Series ripples by nature
- **Freezing the first or last frame** (a GUI `addMargins()`):  Wrap a component in a
  **Padding** component, which can hold or hide it before and after, and shift its start.
- **Transitions:**  In Series has Slide Left, Cross Fade, Hold Previous and Hold Next.
- **Fixed components:**  `Showable` has its fixed list alongside the editable one.
- **Schedules in progress, not ms** (`progressAxisLabel`).
- **The console:**
  - `philDebug.VisualEditor.rootComponent`, `selectedComponent` and `localTimeMs`
  - `philDebug.chapterList` and `philDebug.refreshSounds()`
- **The riemann-surfaces-3d way, in practice.**  That project synced a narrated tour to its
  animation by keeping named times in a `MOMENTS` table (`src/narration.ts`).  Each time has a
  comment quoting the words it lines up with, and each is adjusted with the transcript and the
  timeline side by side.  It worked well, and it needed nothing new from the editor.

## What's left

### 1. Retiming:  slow down, speed up, freeze, with easing

This is the one `some5` needs.  Some of its slides must slow down, speed up, or stop completely,
in step with the voiceover, and ideally ease into and out of each change, not jerk.  Changing a
slide's duration only changes its overall speed.

**Proposal:  a Retime component,** a wrapper like Padding, applied with **Wrap Component** to any
slide or component.
- **One number schedule, "Inner Time":**  outside time in, the wrapped component's time out.
  Keyframes at the same value make a freeze.  Easing between keyframes makes the speed change
  smoothly.
- **Its duration is its last keyframe's time,** so stretching it pushes everything after it in
  a series later.
- **Durations mode** makes it pleasant:  edit "hold here for 2 s" and everything after moves.
- **Inner Time could be shown as progress (0–1)** instead of ms, which is the original idea of
  a "time vs time" schedule.  Ms is probably easier to line up with the slide's own keyframes.
- **`globalTime` is untouched,** so color cycling and the like keep running through a freeze.

Effort:  small, a few hours.  It's mostly Padding's plumbing with a schedule in the middle.
Pass `getFramePromises()` through with the mapped time, so video clips inside still record
correctly.

### 2. The rest of the chapter selector

[historical/chapter-selector.md](historical/chapter-selector.md) lists three stages that aren't
built:
- **Typed play limits:**  each end follows a component, or is a typed number.  The render
  dialog uses the same limits.
- **A breadcrumb** of what's active at the playhead.
- **Removable components as the Visual Editor's root.**

That file is in `historical/`, but those stages are still open.

### 3. Smaller ideas, still open

- **`discrete()` on every schedule helper:**  `{ value, progress }`, for a discrete schedule
  that still needs to know how far through the current value it is.  The original brainstorm
  wanted this for an in-series "Slide" schedule.  Retiming may make it unnecessary.
- **Recording the voiceover in the same app.**  Today it's recorded elsewhere, then brought in
  as sound clips and transcripts.  Low priority.
