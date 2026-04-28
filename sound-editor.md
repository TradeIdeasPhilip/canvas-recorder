# Sound Editor

Dev log:Sunday april 26, 2026
I'm in the process of adding a voiceover.
It should be trivial, but it's more than annoying.

I'm jumping around too much.
I need an integrated experience.
The timeline is the obvious place for that, whenever that comes into existence.

distribute() --
The idea is wonderful.
But it really needs to be a feature of the timeline.
Still available as code, but that's not the main case.

Breaking things up in general is very hard, harder than it should be.
The current solution (stand alone sound editor with no video, http://localhost:5173/sound-explorer.html) is okay when I get the entire scene in one clip.
I.e. the easiest cases, and these are not rare.
But if I want to split a scene's audio into small pieces and do small adjustments, that's very painful.
Any normal video editor's timeline could solve this problem pretty easily.

Just center it in the scene is a common request.

Add 500ms before the sound, 1000ms after the sound, then adjust the video to that length is another common request.

I'm jumping around a lot in the code trying to find out how long a scene is and how to change that.
It's so different in so many examples.
Eventually we'll need a standard interface where the content code and the visual editor and negotiate
That's big, but probably not hard.
It will be similar to the other facets of the visual editor.
We will need some new `Showable` containers, because our current solutions are all **read only**.
I want to think carefully about the non-read-only parts!

I really like parts of the current audio editor.
It's temping to start from here, and just add a video viewer.
We'd still need some controls, like the list of chapters and subchapters.
But maybe we'd need fewer controls and definitely we could optimize the user experience for this case.
I want to turn some of the main viewer page into reusable objects that could be on a lot of pages, and this is a good place to start.

volume!
I was hoping to avoid this one.
Today I recorded at the wrong volume.
That's another issue, my computer changes the volume sometimes and I'm currently recording using mac's built in voice memos app.
And it doesn't show me the level indicator.
I forget to go to the system systems
And it's annoying when I do, I have to go through several steps including ignoring the big red you-have-mail light telling me that I can add apple "intelligence".
This is the exact _opposite_ of _integrated_ tools.
Is there a web API to tell me the current level?
Is that built into the web api for recording (like a lot recording UIs, but not the one I'm using)?
All the other APIs are available and straightforward, but I didn't think about this case so I haven't checked yet.

Note: At some point I plan to add recording into this platform.
Save things in the something-something-filesystem,
I have notes elsewhere,
I good place to store blobs, tied to the host, similar to other storage,
The user is _not_ involved at all, except maybe to authorize `persist`.

Back to my original request.
I had a very good recording that was way too quiet.
I just needed to adjust the volume.
Again, that's a pretty standard video editor feature, often found on the timeline.

Is there a way to do that automatically?
Mostly I just want to put my voiceovers into a consistent state.
I'd still want the option to adjust, but mostly to tweak things that the automatic system did.

Absolutely I am making small tweaks to the sound and the video.
I'm changing both to work well together.
I have not gone as far as I'd like to today.
When I have a better editor I'd like to fuss over the details more.
We've made a lot of progress in this regard, but still more to go.

https://github.com/TradeIdeasPhilip/canvas-recorder/commit/df0911578a7174b1bca4121e2643e46004c07ef5
This commit added the voiceover to the showcase,
what I've been describing here.
About 1/2 of the recording was used; the other half was mistakes or quite space between scenes; this is typical.
I was mostly happy with the result, much better than I could have done a year or two ago, but if it was easier I would have made more changes, tiny improvements.
The resulting code is a bit of mess.
I tried a lot of different tactics.

---

## Notes: Microphone Input Level (added 2026-04-28)

**Plan: disable AGC, add a manual level monitor.**

`getUserMedia` defaults to `autoGainControl: true`, which lets the browser/OS
automatically adjust the mic level. This caused a problem: another program changed
the system default, and our recordings came out inconsistent. Disabling AGC gives
us raw, predictable samples instead.

```ts
getUserMedia({ audio: { autoGainControl: false } });
```

With AGC off, the OS input volume setting is authoritative. That makes our
own level monitor load-bearing — it's how the user knows to fix the system volume.

**Implementation plan:**

- Connect the `MediaStream` from `getUserMedia` to an `AnalyserNode` (the Web Audio API spelling, with the British 's')
- Call `getFloatTimeDomainData()` each animation frame, compute RMS
- Draw a simple red/yellow/green bar (or equivalent) in the recording UI

**On quality:** recording too quietly does lose quality — quantization noise stays
fixed while the signal shrinks, so boosting after the fact raises the noise floor
too. On modern 24-bit Mac hardware the effect is minor for "a little quiet" but
audible for very quiet recordings (peak ≲ 0.05). Better to catch it at record time.

**Web pages cannot set the OS input volume** — that requires native OS APIs
(CoreAudio on Mac). We can only monitor and tell the user to fix it themselves.
The red/yellow/green indicator is how we communicate that.
