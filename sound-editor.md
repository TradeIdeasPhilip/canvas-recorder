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
