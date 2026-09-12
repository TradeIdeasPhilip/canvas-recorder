# Issue

We are currently storing video clips in the /public directory so they are convenient and available to the software.
But we don't want to store big files in git.

See also development-plans/ci-pages-deploy.md -- that's the other half of "stop putting large files in git" (the `docs/` build output instead of source video). Different problem, same motivation.

## Alternative: Local Files

We already know how to handle local files from a GUI perspective.
We are good at reading them and we are good at saving the file handles, so the user doesn't have to approve every attempt to reuse the same file.

These files would probably stay in my `/Users/philipsmolen/Documents/Screen\ Shots/` or `/Users/philipsmolen/Downloads/` folder where they were created.

## Blobs

Mediabunny cannot directly handle a url that starts with `file:`.
This would cause various issues.

Mediabunny's documentation recommends [BlobSource](https://mediabunny.dev/guide/reading-media-files#blobsource) as the best way to read a file (when running in a browser).

## Our Internal List of Files

Somewhere we need a list of relevant file handles.
Ideally this would be set up like some type of cache.
Any number of objects can request the same video file by name.

We will store the file name in various places like JSON files, the clipboard, and local strings.
Those cannot contain file handles, only file names.
So we will need our own list of file handles.
Given a filename we should be able to look up the file handle, possibly creating a new one or fixing an expired one as we go.
The list of file handles will presumably be short so we don't need to optimize the lookup operation.

### GUI for Internal List of Files

Note that we already have http://localhost:5173/media-browser.html as a way to review available files.
It would be nice if this could share the same database as http://localhost:5173/canvas-recorder.html?toShow=shadow-test.
Also, when the user selects a file in the Visual Editor, he should have the option to pick a new file, to type an HTTP or HTTPS url, or to select an existing file from this new list.

### Checking in Advance

`Showable.getFramePromises()` is generally aimed at things with a small delay.
For example, my Google fonts and my local (but http) images will take a few frames to load.
This also has the ability to report a _fatal_ error.

I don't want to sit around and watch the computer and wait for it to use each file for the first time to make sure I have permissions to use that file!
I want to walk away once I hit the start button.

I have lots of thoughts on the subject, but none of the solutions are perfect.
Ideally (but not necessarily) the project would know exactly which sections of the video file we are saving and it could verify that it has an open file handle for each before it starts any other work.

Most of the time on my system all of the permissions stay in tact.
(I think I only saw Chrome discard previous permissions when I was explicitly testing for that and I told it to discard some permissions.)
At the same time we could check if files have been moved or deleted.

This is "on my radar" as a possible problem.
For the moment, let's just see if it comes up as a common problem or not.

One concrete idea for this, since it comes up again above: once "Our Internal List of Files" exists, a "verify everything before you start" pre-flight becomes cheap -- walk that list and call `queryPermission()` (escalating to `requestPermission()` only if needed) on every entry *before* kicking off a long unattended render, instead of finding out a handle went stale when the render loop happens to reach that clip. That reuses the same list this doc already wants for lookup, it doesn't need its own separate bookkeeping.

## A few more notes, from the assistant's side (9/6/2026)

Confirmed feasible independently, and the design above holds up -- `BlobSource` is a straight swap for `UrlSource` in the `Input` we already build, and `FrameSource`/`CanvasSink`/`VideoClipComponent` don't care which `Source` backs it. A few things not yet written down:

- **Portability**: a `FileSystemFileHandle` only means something in the browser profile that granted it. It won't follow a project to another machine or another browser profile the way a URL does. Worth treating local-file references as a personal/this-machine convenience, not something a finished, shareable project config can lean on.
- **CORS is a non-issue here** -- actually a small win over URLs. Local files have no origin at all, so none of the `crossOrigin="anonymous"` / canvas-tainting handling that `UrlSource` needed applies.
- **Drag-and-drop** could be a nice, lower-friction *addition* alongside the "normal, simple" file-picker button (`DataTransferItem.getAsFileSystemHandle()` in Chromium gives a real, storable handle from a drop, not just a one-shot `File`). Not a replacement for the picker -- a drop can't be silently reopened next session without a stored handle -- just a quicker path for the common case of dragging something straight from a Finder window that's already open.
- **Node side (`record/cli-record.ts`, `cli-info.ts`) is unaffected** -- `FileSystemFileHandle`/`BlobSource` are browser-only concepts. Node already has its own, separate local-file story via Mediabunny's `FilePathSource`, no conflict, nothing to unify.

## Status 9/9/2026

This looks easy and low risk and helpful.
I'll probably get back to this project sooner rather than later.
