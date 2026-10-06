import { Showable, SoundClip } from "../src/showable.ts";

/**
 * Helpers for sound clips in the Visual Editor:  who owns them, when they
 * play, moving them between owners, and pasting them from Sound Explorer.
 *
 * A sound clip's `startMsIntoScene` is relative to the start of the Showable
 * that owns it.  There's no other linking:  a clip moves when its owner moves,
 * and that's all.  See development-plans/timeline-editor.md.
 */

// MARK: Owners

/** A Showable that can hold sound clips, and where it sits in time. */
export type SoundOwner = {
  readonly owner: Showable;
  /** When `owner` starts, relative to the root passed to {@link soundOwners}. */
  readonly startMs: number;
  /** Descriptions from the root down, for menus. */
  readonly path: string;
};

function displayName(showable: Showable): string {
  return showable.userEditableDescription ?? showable.description;
}

/**
 * Every Showable under `root` (including `root`) whose `soundClips` is
 * defined, in tree order.  That's what makes a Showable a place a sound can
 * live, even when its list is empty.
 *
 * This is the same walk the audio builder does, so the start times agree with
 * what you hear.  A Showable that appears more than once in the tree is listed
 * at its first appearance only.
 */
export function soundOwners(root: Showable): SoundOwner[] {
  const result: SoundOwner[] = [];
  const seen = new Set<Showable>();
  function walk(item: Showable, startMs: number, path: string): void {
    if (seen.has(item)) return;
    seen.add(item);
    if (item.soundClips !== undefined) {
      result.push({ owner: item, startMs, path });
    }
    for (const { child, start } of item.children ?? []) {
      walk(child, startMs + start, `${path} ▸ ${displayName(child)}`);
    }
  }
  walk(root, 0, displayName(root));
  return result;
}

/**
 * When `target` starts, relative to `root`.  `undefined` if it isn't in the tree.
 * Uses the same walk as {@link soundOwners}.
 */
export function startWithin(root: Showable, target: Showable): number | undefined {
  function walk(item: Showable, startMs: number): number | undefined {
    if (item === target) return startMs;
    for (const { child, start } of item.children ?? []) {
      const found = walk(child, startMs + start);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  return walk(root, 0);
}

/** The owner whose `soundClips` holds `clip`, or undefined. */
export function ownerOf(
  owners: readonly SoundOwner[],
  clip: SoundClip,
): SoundOwner | undefined {
  return owners.find(({ owner }) => owner.soundClips?.includes(clip));
}

/**
 * Move `clip` from one owner to another without changing when it plays:
 * its start is re-expressed relative to the new owner.
 *
 * The result may start before the new owner does, or after it ends.  Both are
 * legal.
 */
export function rehomeSoundClip(
  clip: SoundClip,
  from: SoundOwner,
  to: SoundOwner,
): void {
  if (from.owner === to.owner) return;
  const fromList = from.owner.soundClips;
  const toList = to.owner.soundClips;
  if (!fromList || !toList) return;
  const index = fromList.indexOf(clip);
  if (index < 0) return;
  fromList.splice(index, 1);
  clip.startMsIntoScene = tidyMs(
    clip.startMsIntoScene + from.startMs - to.startMs,
  );
  toList.push(clip);
}

/** Round away floating point dust, so the fields show 1234.5 and not 1234.4999999999998. */
export function tidyMs(ms: number): number {
  return Math.round(ms * 1e6) / 1e6;
}

// MARK: Paste

/**
 * Sound clips from text copied out of Sound Explorer, or from anywhere else
 * that writes them the way we do.  Accepts any of:
 *
 * * "Copy One":  one object, possibly with the notes in a `// "…"` comment.
 * * "Copy All":  `const soundClips: {…}[] = [ {…}, {…} ];`
 * * Plain JSON:  one object, or an array of them, e.g. from a saved file.
 *
 * Anything without a `source` is skipped.  Returns an empty array when
 * nothing usable was found.
 */
export function parseSoundClips(text: string): SoundClip[] {
  let s = text;
  // "Copy All" starts with a type annotation full of braces.  Skip to the array.
  const arrayStart = /=\s*\[/.exec(s);
  if (arrayStart) s = s.slice(arrayStart.index + arrayStart[0].length - 1);
  const result: SoundClip[] = [];
  for (const objectText of topLevelObjects(s)) {
    const clip = parseOneClip(objectText);
    if (clip) result.push(clip);
  }
  return result;
}

/** The text of each outermost `{…}` in `s`, ignoring braces inside strings. */
function topLevelObjects(s: string): string[] {
  const found: string[] = [];
  let depth = 0;
  let start = -1;
  let inString: string | undefined;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === inString) inString = undefined;
    } else if (ch === '"' || ch === "'") {
      inString = ch;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0) found.push(s.slice(start, i + 1));
    }
  }
  return found;
}

function parseOneClip(objectText: string): SoundClip | undefined {
  // "Copy One" keeps the notes in a comment:  // "Worthy of further study…"
  const commentNotes = /^\s*\/\/\s*"(.*)"\s*$/m.exec(objectText)?.[1];
  const json = objectText
    // Whole-line comments only, so a URL containing // survives.
    .replace(/^\s*\/\/.*$/gm, "")
    // Odd pieces are double-quoted strings, left exactly as they are, so
    // notes like "first, then: …" can't be mistaken for a key.
    .split(/("(?:[^"\\]|\\.)*")/)
    .map((piece, index) =>
      index % 2
        ? piece
        : piece
            // Quote bare keys.
            .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
            // Trailing commas.
            .replace(/,(\s*})/g, "$1"),
    )
    .join("");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  const number = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const source = parsed.source;
  if (typeof source !== "string" || source === "") return undefined;
  const clip: SoundClip = {
    source,
    startMsIntoScene: number(parsed.startMsIntoScene) ?? 0,
  };
  const startMsIntoClip = number(parsed.startMsIntoClip);
  if (startMsIntoClip !== undefined) clip.startMsIntoClip = startMsIntoClip;
  const lengthMs = number(parsed.lengthMs);
  if (lengthMs !== undefined) clip.lengthMs = lengthMs;
  const notes =
    typeof parsed.notes === "string" ? parsed.notes.trim() : commentNotes;
  if (notes) clip.notes = notes;
  return clip;
}
