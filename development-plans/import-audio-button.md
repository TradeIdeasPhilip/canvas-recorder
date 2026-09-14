# Import Audio from Video

## Background

When a `VideoClipComponent` plays a video, its audio track is currently ignored.
Mac screen recordings and other video files have an audio track that is the natural
soundtrack for that clip. Importing it should be a one-click operation.

We worked out the Mediabunny API in a prior session.
The key insight is that `decodeAudioData()` (used by `AudioBuilder`) ignores
MP4/MOV edit lists, while Mediabunny's `AudioBufferSink.buffers()` honors them.
That is how Mac screen recordings encode the audio/video start-time offset.
Rather than use `AudioBufferSink` for the import itself, we only need Mediabunny
for metadata (specifically `InputTrack.getFirstTimestamp()`), then hand the URL
to the existing `AudioBuilder` / `SoundClip` pipeline.

## Where the Button Goes

Add a custom info panel for `VideoClipComponent`, analogous to `buildSlideComponentPanel`
in `dev/slide-panel.ts`. It will appear in the Visual Editor's schedule editor pane
whenever a `VideoClipComponent` is the selected item — the same slot that
`buildSlideComponentPanel` occupies for `SlideComponent`.

The panel shows:
- A brief status line (see below)
- An **"Import audio"** button

## Status Line

Open the video with Mediabunny (`Input` + `getPrimaryAudioTrack()`) when the URL
changes and cache the result. Display one of:

| State | Status text | Button |
|---|---|---|
| URL empty | *(no URL set)* | disabled |
| URL loading | Loading… | disabled |
| No audio track | No audio track | disabled |
| Audio track found | Audio: `{channels}`ch · `{sampleRate}`Hz | enabled |
| Error opening file | *(error message)* | disabled |

"No audio track" is a common case (some video files have no audio). Treat it
as normal, not an error. The user sees it immediately in the status line without
having to click anything.

## What "Import" Does

When the user clicks **Import audio**:

1. Call `InputTrack.getFirstTimestamp()` on the audio track (already open).
   This returns the edit-list-adjusted presentation start, in seconds.
   A negative value (e.g. −0.080s) means the first 80ms of the raw decoded
   audio precedes the video's presentation timeline and should be skipped.
   `editListOffsetMs = Math.max(0, -firstTimestamp * 1000)`

2. Build a `SoundClip`:
   ```typescript
   {
     source: videoClip.urlScalar.value,
     startMsIntoScene: 0,        // user adjusts in the Sound Clips editor
     startMsIntoClip: editListOffsetMs + videoClip.startMsIntoClipScalar.value,
     lengthMs: videoClip.endMsIntoClipScalar.value - videoClip.startMsIntoClipScalar.value,
     notes: "imported from video",
   }
   ```

3. Push it into the root Showable's `soundClips` array (must be non-`undefined`
   first — initialize to `[]` if needed).

4. Call the same `afterStructureChange()` callback used by the existing Sound Clips
   "+ Add" button so audio rebuilds and the editor redraws.

The `startMsIntoScene` defaults to 0. The user adjusts it in the existing Sound
Clips editor if the video clip does not start at time 0 in the scene.

### What "clip to align with video" means

- `startMsIntoClip` positions the audio read-head at the point in the decoded
  file that corresponds to the video clip's display window.
- `lengthMs` trims the end to match exactly the visible portion of the video clip.
- If the user has trimmed the video (e.g. `startMsIntoClip = 500`), the audio
  is also trimmed to that same window, so they stay in sync.

## Edge Cases

| Case | Behavior |
|---|---|
| No audio track in file | Status: "No audio track". Button disabled. Common case. |
| URL not yet set | Status: *(empty)*. Button disabled. |
| Multiple-edit-list warning | Mediabunny already prints a console warning (see `video-clip.ts`). Only the first edit is used. Same quirks as the video display. |
| Audio ends before video | `lengthMs` is set by the video clip window, so the SoundClip ends when the video clip ends. If the actual audio is shorter, silence plays for the tail — same behavior as any other short clip. |
| Audio starts after video begins | Rare in practice. `startMsIntoClip` would be a larger positive value. The SoundClip still works but there will be silence at the start within the scene. |
| User clicks Import multiple times | Each click adds another SoundClip entry. The user deletes extras with the existing "✕" button in the Sound Clips editor. |

## Implementation Plan

1. **`src/slide-components/video-clip.ts`** — add `openAudioInfo(url)` helper:
   - Opens `Input` with the URL, calls `getPrimaryAudioTrack()`, calls
     `getFirstTimestamp()` on success.
   - Returns `{ channels, sampleRate, firstTimestampMs } | null` (null = no track).
   - Export this function so the panel can call it.

2. **`dev/video-clip-panel.ts`** (new file) — `buildVideoClipPanel(videoClip, rootShowable, onChange)`:
   - Async status fetch on construction / URL change.
   - Renders the status line and Import button.
   - On button click: build the SoundClip as described above, push into
     `rootShowable.soundClips`, call `onChange()`.

3. **`dev/canvas-recorder.ts`** — in `updateScheduleEditor()`:
   - Add an `instanceof VideoClipComponent` branch alongside the existing
     `instanceof SlideComponent` branch.
   - Call `buildVideoClipPanel(comp, rootSelectable, afterStructureChange)`.
   - The `rootSelectable` is already in scope as the `selectable` variable.

## What Already Exists (No Changes Needed)

- `SoundClip` type in `src/showable.ts` — already has `startMsIntoClip` and `lengthMs`.
- `_buildSoundClipEditor` in `dev/canvas-recorder.ts` — already renders the
  imported clip in the Sound Clips section.
- `AudioBuilder` in `dev/audio-builder.ts` — already handles `startMsIntoClip`
  and `lengthMs` trimming via `fetch()` + `decodeAudioData()`. Does not need
  to know about edit lists; that's already handled by `startMsIntoClip`.
- Mediabunny is already imported in `video-clip.ts`; just need to add
  `AudioBufferSink` or just `input.getPrimaryAudioTrack()`.

## Not in Scope

- Importing audio from a file that is *not* already open as a `VideoClipComponent`.
  (Use the Sound Clips "+ Add" flow for that case.)
- Adjusting `startMsIntoScene` automatically based on scene position.
  The user does this in the Sound Clips editor.
- Volume normalization (tracked in `development-plans/sound-editor.md`).
