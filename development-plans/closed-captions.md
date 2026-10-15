# Closed Captions

_Proposal, 10/14/2026.  Not scheduled.  Sized to finish in an afternoon._

_Updated 10/14/2026:  YouTube changed, and the priorities shifted.  The requirements didn't.
See [What changed](#what-changed)._

## What changed

**YouTube now shows its automatic captions in blocks, edited or not.**  So the original
problem (one correction switches the track to blocks) is gone.  Correcting captions in YouTube
Studio no longer costs anything.

That turns this from a fix into a choice:

- **A. Keep using YouTube Studio.**  YouTube's automatic transcript, corrected in Studio.
  No code at all.  Shown in blocks.
- **B. Build the editor here, and upload a `.ytt`.**  The design below.  Shown word by word.

**What B still has over A:**
- **Word by word, as each word is spoken.**  An uploaded `.ytt` is now the *only* way to get
  the display that's wanted.  A bonus, not a reason on its own, but most of the work is
  already done.
- **Captions follow the edit.**  They're rebuilt from the project.  Re-cut the video and
  re-export, and every fix is still there.  Fixes made in Studio belong to one upload; a new
  cut means starting over.
- **The flags guide the review.**  Red and orange words show where to look, instead of reading
  everything.
- **Fixes are saved with the project,** in git, like everything else.

**What A has over B:** it costs nothing, and it works today.

**The cheap middle step, C:** export a `.ytt` from the transcript as it is, with no editor:
steps 3 and 4 of the design, about 1.5 hours.  If the transcript is good enough, that's word
by word for free.  If it needs fixes, fix them in Studio, which turns it back into blocks:
no worse than A.  C is also a natural first step towards B, since B needs the same export.

**Test first.**  YouTube changing how it shows *its own* captions raises a new question:  does it
still show an uploaded `.ytt` word by word?  If not, the bonus is gone and A wins outright.
Step 0, test 1, settles that, and it now comes before everything else.

## Why

The original motivation, kept for the record.  The first paragraph is no longer true; see
[What changed](#what-changed).

YouTube's automatic captions are good, and they show each word as it's spoken, which is the
style wanted.  But correcting even one word in YouTube Studio switches the whole track to
blocks of text with worse timing.

This project already has nearly everything needed to do better:
- word-by-word transcripts with timings good to a frame or two
- the pauses, which the blue playhead already shows
- red and orange flags on the words most likely to be wrong
- the edit itself (clips, trims, cuts), so we know exactly where every word lands in the
  final video

What's missing is a way to fix words, and a file YouTube will accept.

The payoff is modest:  a better version of something that already works.  The cost is low,
because most of the work is done.

## The key finding:  YouTube's own format does word-by-word

- **YouTube Studio accepts `.ytt` files**, also called **SRV3** or "YouTube Timed Text":
  YouTube's own XML caption format.  Upload with **Upload file → With timing**.
  It isn't in YouTube's official list of formats, but it's the long-established route used by
  YTSubConverter, a popular open-source tool.
- **SRV3 has per-word timing.**  A `<s>` span inside a caption can have its own `t`, an offset
  in ms from the start of its caption, and it appears at that moment.  YTSubConverter's format
  notes call this karaoke:

  ```xml
  <p t="36000" d="4000"><s>Ka</s><s t="1000">ra</s><s t="2000">o</s><s t="3000">ke</s></p>
  ```

  That's the word-by-word look.  Text that hasn't been reached yet is hidden, and this works on
  mobile too.
- **A quirk:** on upload, YouTube drops a span's `t` if it equals the previous span's, which
  breaks the effect.  Keep every offset strictly increasing.
- **The official formats** (SRT, WebVTT, TTML, SCC and so on) show nothing about word-level
  timing.  An SRT is a good fallback, but it would look like today's corrected captions:  blocks.
- **Embedding captions in the MP4 doesn't help YouTube.**
  - Mediabunny can add a WebVTT subtitle track (`output.addSubtitleTrack(new TextSubtitleSource("webvtt"))`),
    about 20 lines in the recorder.
  - But nothing suggests YouTube reads subtitle tracks inside an uploaded file.  Its help pages
    only describe uploading caption files.
  - It would only help local players.  Optional, and last.
- **After uploading, don't edit the captions in Studio.**  Any change there throws away the
  timing and styling.  Fix things here and upload again.

## Positioning

Two uses:
- **Placement by speaker,** for dialog.
- **Placement away from the action:**  marking the parts of the screen that matter least at
  each moment, so captions don't cover anything important.

- **SRV3 (`.ytt`) positions each caption.**
  - A `<wp>` window position gives a point, as percentages of the video's width (`ah`) and
    height (`av`), plus an **anchor point** (`ap`, 0–8).  The anchor says which part of the
    caption's box sits on that point:  a corner, the middle of an edge, or the center.
  - Each caption names its position.  So the same format does word-by-word timing *and*
    placement.
- **WebVTT** positions too (`line:`, `position:`, `align:`).  YouTube's help says "Positioning
  is supported, but styling is limited to `<b>`, `<i>`, `<u>`."  But WebVTT has no word-by-word
  timing.
- **SRT** has no positioning.

**What happens when the viewer changes the caption size?**  The anchor point stays put, and
the box grows away from it.
- A caption anchored at its bottom-center grows **upward**.
- One anchored at its top-left grows **down and to the right**.

So positions survive any size, but the text can't be kept out of a region at every size.  The
best you can do is choose the anchor so growth goes the way that hurts least, usually away from
the important content and toward the screen's edge.

**Other caveats,** from YTSubConverter's notes:
- **Moving while the controls show:** captions anchored at the bottom move up when the
  viewer's mouse brings up the player controls.  Top-anchored ones move down.  Centered ones
  stay put.
- **Theater mode:** captions placed off-center move out toward the sides, and can even hang
  outside the video frame.
- **Android:** the app always uses its own caption size, whatever the file says.
- **Viewers can drag captions** to a new spot on desktop, I believe.  Worth confirming in a test.

## Step 0:  test videos

Before building the editor, find out what YouTube really does.  Each test is a short unlisted
upload.  Make the video and its caption file **with this project**, from the same data, so the
picture can show where each caption is *supposed* to be:  draw the target regions, labels, a
clock.

1. **Word by word, one line:**  a plain SRV3 track with per-word `t`.  Does it look like
   YouTube's own automatic captions?  On desktop, in the mobile app, and on a TV.
2. **Two lines:**  the line-repeating trick described under Building captions.  Is it close
   enough to YouTube's own scrolling?
3. **Positions:**
   - the nine anchor points, around the frame, each labeled on screen
   - a sequence that moves the captions between drawn "safe" regions

   Then check them at caption sizes 50%, 100%, 200% and 400%, with the controls showing and
   hidden, in theater mode and full screen, and in the mobile app.
4. **The same positions in WebVTT,** for comparison and as a fallback.
5. **Edge cases:**
   - two words with the same `t`, to confirm the quirk
   - very fast speech
   - long pauses
   - a caption longer than one line

Steps 1 and 3 decide most of the rest.  Test 1 confirms the format; test 3 says whether
placement is worth an editor.

**Test 1 is now the deciding test.**  Since YouTube switched its own captions to blocks, check
that an uploaded `.ytt` still shows word by word before building anything.  It's quick to run
by hand:  write the `.ytt` for a short clip by hand, or with step C's export.

## The design

### 1. Fixes, stored with the video

- **On the sound clip, keyed by file time.** Each sound clip gets an optional list of fixes,
  each one `{ fileMs, was, text }`:
  - **Where:** `fileMs` is the word's start in its file.
  - **What it was:** `was` is Whisper's word.
  - **What it should be:** `text` is the replacement.  `""` drops the word from the captions,
    and several words share the original word's time.
- **Why on the clip:**
  - Fixes are saved, diffed and undone with everything else.
  - Keyed by file time, they survive splitting, trimming and cutting.  The pieces simply carry
    the same list.
- **Re-transcribing** (a new pipeline version) makes a new transcript.  Fixes re-attach to the
  word at the same time, give or take ~60 ms, with the same `was`.  A fix that doesn't
  re-attach is listed, not silently lost.
- **One pure function** applies a clip's fixes to its transcript words.  The Text view, the
  timeline and the caption export all go through it.

### 2. Editing, in the 📖 Text view

- **Double-click a word**, or select it and press Enter, to edit it in place.
  - Enter commits, Escape cancels.
  - An empty word is removed from the captions.  It's shown struck through, but it still
    plays:  captions only.  ✂ Cut out is still the way to remove sound.
- **Fixed words get a green underline,** and their hover text shows the original.
- **Fixing a flagged word clears its flag.**
  - **Keep as is** (or Enter without changing anything) marks it reviewed.  That's a fix whose
    text equals `was`.
- **Next flagged** (and a keyboard shortcut) jumps to the next red or orange word.  It puts the
  playhead there, so you hear it.
  - This is the core of the workflow:  review the flags in order, fix or keep, done.
- **Speech Whisper left out** (red) is *not* in the captions by default.  It's nearly always a
  mistake to cut.  Editing one into real words includes it.

### 3. Building captions from the whole video

- **Which words:**
  - every sound clip in the video, mapped to video time the same way the audio builder plays
    them
  - only the words each clip actually plays
  - with the fixes applied
- **A per-clip "In captions" setting,** on by default, so music and game sound stay out.
- **Lines:**
  - Group words into captions of up to ~40 characters.
  - Break at sentence ends, at pauses over ~0.7 s, and at clip boundaries.
  - Each caption runs from its first word to its last, held up to ~1.5 s or until the next one
    starts.
- **Two lines, like YouTube's own,** as an option:  when a new line starts, the previous one
  is shown again above it, complete.  That needs two caption positions and duplicate captions
  at the upper one.  No animation, but close to YouTube's scrolling look.

### 4. Export

**💾 Captions** downloads `<video>.ytt`, plus an `.srt` as a plain fallback.  Upload it to an
unlisted test video first.

## Estimate

| Step | Effort |
|---|---|
| Fixes on sound clips, the apply function, re-attaching | ~45 min |
| Editing in Text view, Keep as is, Next flagged | ~1–1.5 h |
| Building lines, the `.ytt` writer, the `.srt` fallback | ~1 h |
| Export button, "In captions" per clip | ~30 min |
| **Total** | **~3–4 h**, plus a test upload |
| Optional:  two-line display | ~30 min |
| Optional:  a WebVTT track inside the recorded MP4, for local players | ~30 min |
| Step 0, the test videos:  a small component that draws the target regions and writes the matching caption files | ~1 h, plus uploads |
| Later, if test 3 says it's worth it:  a schedule of caption regions, a rectangle per keyframe, edited on the canvas like any Dest Rect | ~1–2 h |

**Suggested order now:**
1. Step 0, test 1.  If YouTube shows an uploaded `.ytt` in blocks, stop:  option A.
2. Option C:  building lines plus the export, ~1.5 h.  Use it on a real video.
3. Option B's editor (fixes, the Text view editing, Next flagged), if C's results show the
   transcript needs fixing often enough to be worth it.

## Risks and open questions

- **YouTube changes things.**  It just changed how its own captions display.  The word-by-word
  look of an uploaded `.ytt` could change the same way.  Test 1 checks it today, but nothing
  guarantees tomorrow.
- **The upload route is unofficial.**  `.ytt` works today, and has for years, but YouTube
  could change it.  The `.srt` fallback always works, in block form.
- **How YouTube lays out an uploaded word-by-word track** compared with its own automatic one
  (line length, two lines, scrolling) is unverified.  The test upload answers that.  The
  two-line option exists in case one line at a time looks wrong.
- **Fixes on the clip versus per file.**  Per clip is simplest and saves with the video.  The
  catch:  one file used by two *different* videos would need its fixes made twice.  That's
  unusual here.
- **Numbers and symbols:**  Whisper writes "2 plus 2 equals 4".  Whatever the fix says is
  exactly what appears.

## Sources

- YouTube Help, supported caption formats:  https://support.google.com/youtube/answer/2734698
- YTSubConverter (`.ytt` upload steps, karaoke, caveats):  https://github.com/arcusmaximus/YTSubConverter
- SRV3 format notes, including the karaoke `<s t>` example and window positions:
  https://github.com/arcusmaximus/YTSubConverter/blob/master/ytt.ytt
- WebVTT cue settings (`line`, `position`, `align`):
  https://developer.mozilla.org/en-US/docs/Web/API/WebVTT_API/Web_Video_Text_Tracks_Format
