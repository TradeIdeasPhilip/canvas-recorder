# `ffprobe` Replacement

The goal is to make a command line program to dump details of any video file.

This is intended as a replacement for [ffprobe](https://ffmpeg.org/ffprobe.html) which shows some useful info, but it's hard to read and it's missing some important stuff.

This is intended to be quick and easy.
I've been looking over the documentation from Mediabunny.
I'm just calling the various status functions that are available, and printing the result.

I wrote most of this specification off the top of my head.
Some of the details might be off, but this is close.

## Calling It

`npm run info filename.mp4` should do the trick.
(More command line options are listed below.)
Make it run from `tsx`, like the other command line programs in this project.

## Main Program Structure

Something like:

```ts
/**
 * See the `--` option, below.
 * It works like `--` in a lot of command line programs.
 */
let ignoreFlags = false;
/**
 * If fast is true, then `track.computeFrameRateMetrics()` uses
 * the default `targetPacketCount`.
 * Otherwise (the default) will set `targetPacketCount` to `Number.MAX_SAFE_INTEGER`.
 * This might affect other requests, too.
 * Any API call with "compute" in the name will probably be skipped for fast mode.
 *
 * See `--fast` and `--full`, below.
 */
let fast = false;
if (commandLineArguments.length == 0) {
  // print help.
} else {
  commandLineArguments.forEach((argument) => {
    if (argument == "--" && !ignoreFlags) {
      ignoreFlags == true;
    } else if (argument == "--fast" && !ignoreFlags) {
      fast = true;
    } else if (argument == "--full" && !ignoreFlags) {
      fast = false;
    } else {
      // Look at this file.
    }
  });
}
```

The inputs can be file names or urls.
If an argument starts with http: or https: (case insensitive) assume it's a url.
Otherwise it's a file.
(Unless there's an easier way to do that.)

## Data to Request

I read over the [API documentation for Mediabunny](https://mediabunny.dev/) and selected the information that looked interesting to me.
I'm sure there will be updates over time, but this is a good starting point.

Iterate over every track in the file.
For each file show:

- The start time.
- The duration.

For each track in the files show:

- The track number (which starts at 1 for some reason).
- Start time and duration.
- The type of track (video, audio, captions)
- The disposition of the track.

For video tracks, also show:

- The same things we are already showing in random-tests.{html,ts}:
  - track.computeFrameRateMetrics()
  - track.canBeTransparent() (Label should include "canBeTransparent" _and_ "alpha" in the output.)
  - track.getTimeResolution()
- Encoding info. Off the top of my head there were at least three related requests:
  - Format (e.g. ProRes)
  - Full argument "string" from the encoder.
  - There was at least one more.

## Implementation Notes

This works.
Run it with `npm run info -- "public/frame counter.mp4"`.
The `--` is required for npm to pass args through.
