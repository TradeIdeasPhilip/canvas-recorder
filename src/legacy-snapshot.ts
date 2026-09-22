/**
 * Reader for the pre-version-2 saved-file format.
 *
 * Version 1 was a flat map of `"<videoKey>|<description>"` → entry, which in practice always
 * held exactly one entry: the root.  `buildJsonSnapshot` suppressed every chapter that was a
 * fixed descendant of another, and since a video is one connected tree, that was everything
 * except the root.  Every saved file on disk was checked and all of them had exactly one key.
 *
 * Nothing writes this format any more.  Once the files you care about have been re-saved,
 * delete this file and the single `parseLegacySnapshot` call in dev/canvas-recorder.ts.
 *
 * See development-plans/single-tree-per-video.md.
 */

import { JsonFileEntry, SerializedFixedChild } from "./snapshot";

/**
 * Convert a version-1 flat map into a single tree node.
 *
 * @param parsed Parsed JSON that is *not* a {@link VideoSnapshot}.
 * @param rootKey The `selectableKey` of the video's root, used to pick the right entry.
 * @param rootDescription The root's description.  A v1 entry has no `description` of its own,
 * and `applyFixedComponents` matches on exactly that, so it has to be supplied here.
 * @returns The tree, or undefined if the file held nothing usable.
 */
export function parseLegacySnapshot(
  parsed: unknown,
  rootKey: string,
  rootDescription: string,
): SerializedFixedChild | undefined {
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const map = parsed as Record<string, JsonFileEntry>;
  const keys = Object.keys(map);
  if (keys.length === 0) return undefined;

  let chosen = keys.find((k) => k === rootKey);
  if (chosen === undefined && keys.length === 1) chosen = keys[0];
  if (chosen === undefined) {
    // Never observed in any real file.  Rather than guess at a merge, take nothing and say so
    // loudly -- a silent partial load is how this format caused trouble in the first place.
    console.error(
      `Legacy snapshot has ${keys.length} top-level keys and none match the root "${rootKey}". ` +
        `Not loading it. Keys: ${keys.join(", ")}`,
    );
    return undefined;
  }
  const dropped = keys.filter((k) => k !== chosen);
  if (dropped.length) {
    console.warn(
      `Legacy snapshot had ${dropped.length} extra top-level key(s) beyond the root; ` +
        `they duplicate state already nested inside the root and were ignored: ${dropped.join(", ")}`,
    );
  }
  return { ...map[chosen], description: rootDescription };
}
