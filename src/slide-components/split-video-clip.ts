// Splitting a Video Clip in two, the way a video editor's razor tool does.
//
// Everything here is a pure function:  nothing passed in is modified, and the
// pieces are brand new components.  Putting them into the tree is the
// caller's job.

import { SoundClip } from "../showable";
import { serializeComponents } from "../snapshot";
import { buildComponents } from "./serialize";
import { VideoClipComponent } from "./video-clip";

/**
 * What to do with a sound clip that is playing at the split point.
 *
 * * `split`:  cut it in two at the split point; each piece gets its half.
 * * `first`:  keep it whole, on the first piece.  It plays past that piece's end.
 * * `second`:  keep it whole, on the second piece.  It starts before that piece does.
 *
 * Sounds that end before the split always go with the first piece, and sounds
 * that start after it always go with the second.
 */
export const CROSSING_CHOICES = ["split", "first", "second"] as const;
export type CrossingChoice = (typeof CROSSING_CHOICES)[number];

export type SplitResult = {
  /** From the start of the original to the split point. */
  readonly first: VideoClipComponent;
  /** From the split point to the end of the original. */
  readonly second: VideoClipComponent;
};

/**
 * How long a sound clip plays, in ms.
 *
 * A clip with no `lengthMs` plays to the end of its file, which only someone
 * who has decoded the file can know.  Without that, such a clip is taken to
 * play forever, which is the safe assumption:  it can only make a clip look
 * like it crosses the split point when it really ended earlier.
 */
export type SoundLength = (sound: SoundClip) => number;

const declaredLength: SoundLength = (sound) => sound.lengthMs ?? Infinity;

/** Round away floating point dust, so 22.166666666666668 + 1000 doesn't show up as …671 in the editor. */
function tidy(ms: number): number {
  return Math.round(ms * 1e6) / 1e6;
}

/** Is `atMs`, in the clip's own time, strictly inside it?  Splitting at either end would leave an empty piece. */
export function canSplitAt(clip: VideoClipComponent, atMs: number): boolean {
  return atMs > 0 && atMs < clip.duration;
}

/** Is this sound playing at `atMs`, and still playing just after? */
export function crossesSplit(
  sound: SoundClip,
  atMs: number,
  lengthOf: SoundLength = declaredLength,
): boolean {
  const start = sound.startMsIntoScene;
  return start < atMs && start + lengthOf(sound) > atMs;
}

/** An independent copy, made the same way saving and loading would. */
function copyOf(clip: VideoClipComponent): VideoClipComponent {
  const [copy] = buildComponents(serializeComponents([clip]));
  if (!(copy instanceof VideoClipComponent)) {
    throw new Error("Copying a Video Clip didn't produce a Video Clip.");
  }
  return copy;
}

/**
 * Split `clip` at `atMs` (its own local time) into two Video Clips that,
 * played one after the other, look and sound exactly like the original.
 *
 * * Both pieces play at the original speed.  The first shows the file from
 *   Start to the split point, the second from there to End.
 * * The Dest Rect is unchanged on screen:  the second piece's keyframes are
 *   shifted so its time 0 lines up with the split point.
 * * Each sound clip goes with whichever piece it belongs to, re-timed so it
 *   still plays at the same moment.  See {@link CrossingChoice} for the ones
 *   that are playing at the split point.
 *
 * `clip` itself is not modified.
 *
 * @param lengthOf See {@link SoundLength}.  Pass one that knows file lengths
 * when you have it.
 * @throws RangeError unless {@link canSplitAt}.
 */
export function splitVideoClip(
  clip: VideoClipComponent,
  atMs: number,
  crossing: CrossingChoice,
  lengthOf: SoundLength = declaredLength,
): SplitResult {
  if (!canSplitAt(clip, atMs)) {
    throw new RangeError(
      `Can't split a ${clip.duration} ms clip at ${atMs} ms.`,
    );
  }
  const first = copyOf(clip);
  const second = copyOf(clip);

  // MARK: Picture
  const atFileMs = tidy(clip.locationInClip(atMs));
  first.endMsIntoClipScalar.value = atFileMs;
  first.setDuration(atMs);
  second.startMsIntoClipScalar.value = atFileMs;
  second.setDuration(clip.duration - atMs);

  // The first piece can keep every keyframe:  it only ever asks about times
  // before the split.  Keyframes at negative times are fine; interpolation
  // only cares about order.
  const rectKeyframes = second.destinationRectSchedule.schedule;
  if (rectKeyframes.length === 1) {
    // Not animated.  Keep it at 0, which also keeps the saved form simple.
    rectKeyframes[0].time = 0;
  } else {
    for (const keyframe of rectKeyframes) {
      keyframe.time = tidy(keyframe.time - atMs);
    }
  }

  // MARK: Sound
  const firstSounds: SoundClip[] = [];
  const secondSounds: SoundClip[] = [];
  const toSecond = (sound: SoundClip): SoundClip => ({
    ...sound,
    startMsIntoScene: tidy(sound.startMsIntoScene - atMs),
  });
  for (const sound of clip.soundClips) {
    if (!crossesSplit(sound, atMs, lengthOf)) {
      if (sound.startMsIntoScene < atMs) {
        firstSounds.push({ ...sound });
      } else {
        secondSounds.push(toSecond(sound));
      }
      continue;
    }
    switch (crossing) {
      case "first":
        firstSounds.push({ ...sound });
        break;
      case "second":
        secondSounds.push(toSecond(sound));
        break;
      case "split": {
        const playedBefore = tidy(atMs - sound.startMsIntoScene);
        firstSounds.push({ ...sound, lengthMs: playedBefore });
        const rest: SoundClip = {
          ...sound,
          startMsIntoScene: 0,
          startMsIntoClip: tidy((sound.startMsIntoClip ?? 0) + playedBefore),
        };
        // No lengthMs means "to the end of the file", which is still right.
        if (sound.lengthMs !== undefined) {
          rest.lengthMs = tidy(sound.lengthMs - playedBefore);
        }
        secondSounds.push(rest);
        break;
      }
    }
  }
  first.soundClips = firstSounds;
  second.soundClips = secondSounds;

  return { first, second };
}
