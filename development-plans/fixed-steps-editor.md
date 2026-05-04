# Fixed-Steps Schedule Editor — Design Notes

## The pattern

A very common animation pattern in this codebase: a single `Keyframe<number>[]` schedule where values are forced integers 0, 1, 2, ..., N. The float output selects both the current stage (integer part) and how far into the transition (fractional part). Examples:

- `handwritingSchedule` in the outline slide: each bullet draws in from 0→1 progress
- Fourier scenes in `sierpiński.ts`: `getAnimationRules(terms, keyframes)` where `keyframes = [0,1,2,...,N]`; `numberOfSteps = keyframes.length - 1` (fencepost!)

The key difference from a free numeric schedule: **values are not editable, only times are**, and times must stay ordered (no reordering allowed, unlike a normal keyframe editor).

## Proposed ScheduleInfo type

```typescript
| {
    readonly type: "stepped";
    readonly stepCount: number;   // N — editor knows valid range [0..N], enforces fencepost
    readonly schedule: Keyframe<number>[];  // values are 0,1,...,N; only times are user-editable
  }
```

## Editor behavior

- Surface **segment durations** (time differences), not absolute times
- Ripple edit by default: adjusting segment K shifts all subsequent keyframes by the same delta
- Clamp to prevent segment collapsing below 0 (or a configurable minimum)
- For the outline slide specifically, consider collapsing to N pairs of `{drawMs, pauseMs}` since that's the logical unit

## soundClips connection

- `Selectable.soundClips` already works (used in production sierpiński video)
- Currently hardcoded in source; any change requires restart
- Hot-reload should be feasible: the audio init routine already builds from a `soundClips` array — just call it again after editing
- **Sync drift problem**: if you drag a stepped-schedule segment, any soundClips manually aligned to that stage will silently drift
  - Option A: add `linkedToStepIndex?: number` to soundClip — clip follows stage's start time automatically
  - Option B: show both on a shared timeline, adjust manually (simpler data model; `distribute()` helper already exists for this)

## Open questions before implementing

- What is the current signature of the audio initialization function — does it take `soundClips` directly or walk the `Selectable` tree?
- Should the editor UI show segment durations inline in the existing keyframe panel, or does this warrant a separate timeline-style view?
- Is N always known statically at scene-creation time? (Yes for Fourier groups and bullet lists; enforcing this at the type level may help.)
