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

## Playback (10/3/2026)

Not the panel itself, but the same component, and too much was found to leave it in a conversation.
Both power modes matter:  the power cord comes and goes all day, and unplugging halves the display rate (60 Hz → 30 Hz) as well as slowing the CPU.

### Two bugs behind the red X

In `RafFrameSource` (src/slide-components/video-clip.ts):

1. **A reseek empties the cache immediately**, before the new stream has produced a frame.
   The X means "the cache is empty", so every reseek shows one.
   Fix:  keep showing the old frames (they'll get the orange "behind" mark) until the new stream's first frame lands, then switch.
2. **At most one frame is fetched per call to `get()`**, i.e. per screen refresh.
   Nothing asks for the next frame when one arrives, so the read rate is tied to the display rate, not to what the video needs.
   The Galaga recording averages ~53 fps:  at 60 Hz that barely keeps up, at 30 Hz it falls behind ~0.4 s every second, which trips the 0.5 s reseek threshold, which shows bug 1's X.
   Fix:  keep requesting from inside the `.then` until the cache is full.

Bug 1 was fixed first, deliberately, because bug 2 made it happen constantly and so easy to test.
Both are now fixed (10/4/2026).
In a simulation of a 30 Hz screen and a 60 fps file, frames on time went from 0 of 115 to 115 of 115, with no reseeks.
When the decoder is genuinely too slow, frames are marked late and it still reseeks, but there is never an X.

Still open, small:  the "too far ahead" test compares the request with the newest frame's *start*.
Screen recordings have variable frame rates, with single frames lasting up to 3.3 s while the screen is still.
Mid-file the read-ahead hides this, but at the end of a stream it can reseek over and over while already showing the right frame.
Invisible, but wasted work.  Compare with the frame's end (`timestamp + duration`) instead.

(Not a bug:  in shadow-test every clip's `get()` runs twice per frame because the halftone shadow draws its content twice, once for the shadow mask.)

### Verdict:  fast enough, nothing more needed (10/4/2026)

With the two bug fixes above, playback with standard APIs is good, which was the bet when the
clip was first planned.  Jumping around shows a small, unobtrusive delay.  Plugged in, the Galaga
recording plays at **3×** with no orange marks.  At **9–10×** the mark is orange constantly, but
playback is still smooth and glitch free, and the rest of the GUI stays completely live.

**Nothing else is required, now or in the foreseeable future.**  The ideas below — cheap ones
and clever ones — are kept only as a record, in case a much larger file, a slower machine, or a
need for fast-forward previews ever changes that.

Why 3× is clean and 10× is orange, using the constants in `video-clip.ts`:

- Every frame in the file is decoded at any speed; frames are never skipped.  The recording
  averages ~53 fps, so 3× needs ~160 decoded frames a second and 10× needs ~530, each copied
  into a new 2880×1800 canvas.
- The orange mark means more than `CLOSE_ENOUGH_MARK_THRESHOLD_MS` (100 ms) off, measured in
  *clip* time.  At 3× that is 33 ms of real time, about two screen refreshes of slack.  At 10× it
  is 10 ms, less than one 60 Hz refresh (16.7 ms), so any frame arriving a single refresh late is
  orange.
- The read-ahead holds `MAX_FRAMES` = 5 frames, ~83 ms of 60 fps clip time.  At 10× that is
  8 ms of real time, not even one refresh of buffer.  And `MAX_SKIP_SECONDS` = 0.5 s of clip time
  is 50 ms at 10×, so falling three refreshes behind triggers a reseek.

So constant orange at 10× is expected from both the threshold and the queue length.  It costs
nothing that matters:  the mark only describes live preview.  Recording reads every frame
exactly and waits for it, so a 10× clip records perfectly.

### Measured, not assumed

| | Galaga Screen Recording.mov | QuickTime-cut recording | frame counter.mp4 |
|---|---|---|---|
| Codec | H.264 | H.264 | HEVC |
| Keyframes | every ~1 s (median 0.98, max 5.0) | 1–3.75 s | every 5 s |
| Keyframe vs other frame | 69 KB vs 6.3 KB | 536 KB vs 11.9 KB | 97 KB vs 10.7 KB |
| B-frames | ~half the frames | yes | none |
| Frame rate | variable: 60 fps while things change, up to 3.3 s per frame when still | variable | constant 60 |

- The linear cost of seeking holds for Mac screen recordings:  every frame decodes from the keyframe before it, and B-frames depend on later frames too.
- But their keyframes are ~5× denser than the HEVC export the original seek tests used, so a random seek costs at most ~1 s of decoding, ~0.5 s on average.
- So the 0.5 s reseek threshold is often a loss:  it restarts from a keyframe *behind* where we already are.
- ProRes (and MJPEG) make every frame a keyframe.  Phone and camera footage varies by device — measure rather than assume.

### Cheap performance ideas, to try before anything clever — not needed (see Verdict)

Every frame in the file is decoded no matter what the display rate is.
On top of that, each decoded frame is copied into a brand new full-resolution canvas (2880×1800, ~20 MB) whether or not it is ever shown.

- **`poolSize`** on the `CanvasSink`, so canvases are reused instead of allocated.
  It's disabled today because `RafFrameSource` holds up to `MAX_FRAMES` canvases at once and a smaller pool would overwrite one still on screen.
  Any pool comfortably larger than `MAX_FRAMES` is safe.
- **`width` / `height` on the `CanvasSink` in live mode**, close to the size of the preview, instead of full resolution.
  The canvas typically gets about a third of the screen's width:  ~960 device pixels on the MacBook Air, so the video is drawn ~860 px wide against 2880 in the file.
  That's roughly 3× too wide, or about 10× the pixels needed.
  Recording still needs full resolution, which is fine:  live mode and recording already use separate frame sources.
- `CanvasSink.canvasesAtTimestamps()` would skip the canvas copy for frames that are never shown, but not the decoding, and it's awkward.
  Only if the two ideas above aren't enough.

## Deferred

- **Fast seek, then refine** — not needed (see Verdict).  Kept for the record.
  `canvases(t)` already decodes forward from the keyframe before `t`, but discards every frame before `t`.
  Starting the stream at that keyframe's own timestamp instead shows the keyframe immediately (approximate), then each closer frame as it decodes, ending at the exact one:  one stream, no second seek.
  With ~1 s between keyframes that's at most about a second of refinement.
  Pair it with a smarter reseek rule:  only reseek when the target's keyframe is *ahead* of where we already are; otherwise keep reading.
  Building blocks:  `EncodedPacketSink.getKeyPacket(t)` and `getNextKeyPacket(packet)`.
  (The "fast seek" remembered from the docs was the browser's `HTMLMediaElement.fastSeek()`, which is allowed to land near the target instead of on it, and only applies to `<video>`.  Chrome may never have implemented it:  check `"fastSeek" in HTMLMediaElement.prototype`.)
- Keyframe spacing as a line in the panel's statistics.

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
