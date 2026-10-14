# Transcript Mode In Timeline

**Status (10/14/2026):** Built, along with the "cut out" step below.  Type-checked; the cutting
logic was tested in Node; not yet tried in a browser.  See [What was built](#what-was-built).

## The request

The transcript looks good in the timeline but its never perfect.
At best you can only see a few words at a time before you start losing words in the middle.
And if you are focused on the words, the current display is very inefficient.

It seems like we should be able to switch modes.
Use the same space and only show one display or the other.
The transcript will look like text with wordwrap and possibly even hard returns for the paragraph boundaries.
It will be searchable and scrollable and copyable.
And this view will continuously show you the position of the playhead and it will let you jump to a position very easily, like the standard timeline.

Note the possible conflict.
We might be trying to read part of the transcript and/or about to click on something to jump to it, and the autoscroll kicks in and we lost our place.
We've dealt with this before, and I don't remember the details, but you didn't add any explicit buttons.
(However, that would also be an option.)

In addition to the auto scroll we should use color (or some css property) to highlight the current word.
Also, if the current word is scrolled off screen, there should be some way to know if it is before or after what's scrolled into view.
That might be a button that is also an arrow and jumps to the current playhead and reenables autoscroll, or maybe just an autoscroll checkbox.
I don't care about the details as long as it's easy to use.

## Decisions

- **Clips don't overlap,** for all practical purposes.  So the text is simply one paragraph per
  sound clip, in order of time.
- **"What did I cut?"** is wanted:  the parts of each file that no clip plays, dimmed and
  optional.
- **All the metadata goes in the hover text.**
- **Build it as HTML, not on a canvas,** so search (Cmd+F), copy and word wrap come free.

## What was built

**📖 Text**, next to 🗣 Transcripts, swaps the timeline for the transcript as text, in the same
place.  It starts 240 px tall; drag its bottom corner to make it taller.  The choice is
remembered per browser.

- **Layout:**  one section per sound clip under the Visual Editor root, in order of time.
  - Each section is headed with its start time, owner and notes or file name.  Click the heading
    to select the clip.
  - A pause of over a second starts a new paragraph.
- **The playhead:**
  - The word being spoken is highlighted.
  - While playing, the view follows it, by the timeline's rule:  only if it was in sight a
    moment ago, or playback just started.  Scroll away to read, and it leaves you alone until
    the playhead's word comes back into view.
  - When the word is out of sight, **↑ playhead** or **↓ playhead** appears at the top or
    bottom.  Clicking it scrolls there and resumes following.
- **Click a word** to select its clip and put the playhead at the quiet moment just before it,
  as on the timeline.  A drag selects text instead, for copying.
- **Hover a word** for everything known about it:  timing source, what the letter model
  heard, confidence, video and file times, cut points, and clip.
- **Styling** (from `wordFlag()` in `transcript-align.ts`, shared with the timeline and the 💾 JSON):
  - **Red:**  speech Whisper left out, [bracketed].  Almost always a mistake.  The first real
    find:  "And normally that would [be] [that] [would] sound okay." in the Galaga script.
    Whisper hid exactly the words that needed cutting.  *Failure is success.*
  - **Orange:**  words worth a listen.  Whisper wrote them, but the letter model heard
    something else, or nothing.
  - **The timeline** paints the same words red or orange, at least 3 px wide, so they show
    even when zoomed out too far for labels.
- **Show cut words** (off by default, remembered) adds, dimmed and struck through, the words of
  each file that no clip plays.  Each appears once, right where it was cut:  just before the
  first clip (in file order) that starts after it, or after the clip that ends last before it.
  So a trimmed start shows at the start of its clip, and a cut-out middle shows between the
  two pieces.

### Cut out (the recommended next step)

Select some words, then **✂ Cut out**.

- The cut runs from the quiet moment before the first selected word to the quiet moment after
  the last.
- A dialog shows the words and the length, and asks:
  - **Close the gap:**  the rest of *this clip* moves earlier.  Other sound clips and the
    picture don't move.
  - **Leave a gap** of silence.

  The choice is remembered.
- The selection must stay within one clip.  Dimmed (cut) words in it are ignored.
- **Notes:**  if the notes were filled in by 📝, each remaining piece gets its own.
- **Undo** is the usual Load / history dialog.

The pure function is `cutOutOfSoundClip()` in `src/slide-components/split-video-clip.ts`, next to
`splitSoundClip()`.  It's tested in Node for a middle cut (both ways), trims at either end, a cut
covering the whole clip, and a clip with no length (playing to the end of its file).

### Files

- `dev/transcript-view.ts`:  the view, the selection, and the cut dialog.
- `dev/canvas-recorder.ts`:  "MARK: Transcripts" creates it and supplies the hooks.
  `showFrame()` updates it each frame.  It rebuilds only when the clips or transcripts change.
- `dev/canvas-recorder.css`:  "Transcript view".

### Not done

- Search is the browser's own Cmd+F.  A dedicated search box could come later.
- Clicking a dimmed word does nothing.  It could someday restore the cut words.
