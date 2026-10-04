# Video Clip Panel

The "Video File" panel at the top of the Visual Editor's schedule editor (bottom right) whenever a `VideoClipComponent` is selected.
Code: [dev/video-clip-panel.ts](../dev/video-clip-panel.ts).
Shared probing and sizing math: [src/slide-components/video-info.ts](../src/slide-components/video-info.ts), also used by [media-browser.html](../media-browser.html).

This consolidates notes that were spread across [import-audio-button.md](import-audio-button.md), the media browser, [visual-editor.md](visual-editor.md) ("Taking stock, 5/5/2026") and [timeline-editor.md](timeline-editor.md).

## Iteration 1 (10/2/2026)

Everything updates on every keystroke, like the URL field already does for the live canvas.
Reading a file's statistics takes a few milliseconds on the local dev server, and it shares the open the canvas is already doing, so it costs nothing extra.

### Statistics

- Status: Loading… / ✓ Ready / a quiet grey "Not found".
  A missing file is the normal state while typing a name, so it isn't shown as an error.
- Container, duration of the video track (ms and m:ss.fff).
- Video: size, codec, frame rate (sampled, not a whole-file scan), first timestamp if it isn't 0.
- Audio: none, or channels · sample rate · codec, and its offset if it isn't 0.
- Derived from the clip's own settings:
  - **Speed.**
    A clip shows End − Start of the file in Duration of the scene.
    If those differ, the video plays faster or slower, which used to happen silently.
  - How much of the file is used, and a warning when End is past the end of the file.
  - **Pixels**: output pixels per source pixel at 240 px/unit.
    1× is pixel perfect.
    Above 1× is upscaled and will look soft.

### Buttons

- **Whole file**: Start = 0, End = file length, and Duration to match, so it plays in real time.
  Because the clip usually sits in an In Series timeline, everything after it moves.
- **Play at 1×**: Duration = End − Start.
  Only shown when the speed isn't already 1×.
- **Fit canvas**, **Cover canvas**: canvas relative, centered.
- **Native pixels**: one video pixel per output pixel, keeping the rectangle's center.
- **Shrink to video**: shrinks the Dest Rect to the area the video actually covers inside it.
  `VideoClipComponent` letterboxes inside whatever rectangle it gets, so a wrong shape never distorts anything — it just leaves the handles floating in empty space.
- The size buttons change the only Dest Rect keyframe, or the one in ✎ edit mode when there are several.

### Shift-drag

Shift-dragging a corner already locked the aspect ratio, to the rectangle's *starting* shape.
For a Video Clip's Dest Rect it now locks to the shape of the video.
Every other rectangle behaves exactly as before.

### Import audio

Built from [import-audio-button.md](import-audio-button.md), with two changes.

**The sound clip lives on the Video Clip, not on the scene.**
`initAudio()` walks the whole tree adding up each child's start time, so a sound clip on the clip with `startMsIntoScene: 0` plays exactly when the clip does.
It keeps doing that when you insert or resize an earlier clip in the timeline.
On the scene, every such edit would quietly put all later audio out of sync.
This needed one fix:  components added by the Visual Editor didn't save their `soundClips` (fixed children always did).
They do now.
The trade-off is that imported audio doesn't appear in the scene's Sound Clips list; the panel owns it instead (Import, Re-import, Remove).

**The offset works in both directions.**
`decodeAudioData()` ignores the edit list, so decoded position `p` plays at presentation time `p + firstTimestamp`.
The doc's `max(0, -firstTimestamp)` covers a negative offset (audio starts early, skip some).
It drops a positive one, which turns out not to be rare:

| File | Audio offset |
|---|---|
| Galaga Screen Recording.mov | −22 ms |
| Screen_Recording_2026-09-05_at_8.55.17_AM.mov (cut in QuickTime) | **+141 ms** |
| frame counter.mp4 | 0 |

A positive offset now delays the sound clip in the scene by that much instead of starting it early.

Rules:

- Disabled unless the clip plays at 1×.
  `AudioBuilder` can't change the speed of a sound, so anything else would drift.
- Re-import replaces the imported clip; it never adds a second one.
- The panel says **out of date** when Start, End or the URL no longer match what was imported.

## Please test

1. `?toShow=galaga`, select the Video Clip, retype the URL one character at a time.
2. **Whole file**:  Start, End and the tree's Duration all change, the timeline moves, Speed reads 1×.
3. Type into End:  Speed changes on each keystroke; **Play at 1×** fixes it.
4. Each size button, and Shift-drag on a corner in ✎ mode.  Then Shift-drag something that isn't a video, to check it still keeps its own shape.
5. **Import audio**, listen, then insert a clip *before* it and listen again.  Reload the page; the audio should still be there.  Change Start to see "out of date".
6. `media-browser.html` still probes and sizes clips the way it did.

## Deferred

- **Set Start / End = playhead.**
  The media browser had these and they are the next most valuable thing.
  It needs a mapping from global time to clip time for a component nested anywhere in the tree.
- **Audio that follows the trim automatically**, derived from the clip instead of stored as a copy.
  That would retire "out of date" entirely.
- An exact frame rate from a whole-file scan, behind a button.  Too slow for every keystroke.
- **Multi-segment edit lists.**
  Files cut in QuickTime (like the 8.55.17 recording) have several edits; Mediabunny only uses the first for the picture, and `decodeAudioData()` ignores all of them.
  Imported audio may drift after the cut.
  The panel should detect and say so.  For now: `ffmpeg -i input.mov -c copy output.mp4`.
- Thumbnails of the first and last frame.
- Picking a clip from the Media Browser instead of typing a URL.
- Repeating a clip to fill time (visual-editor.md).
- Local files ([loading-video-clips-from-local-files.md](loading-video-clips-from-local-files.md)).
- Imported audio on the timeline's sound row, and in "Save Diffs" code generation.
- Hiding properties that a mode makes irrelevant.  Same editor limitation as the Multi Text auto sizing properties.
