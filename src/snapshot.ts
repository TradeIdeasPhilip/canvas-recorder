import { ease, easeIn, easeOut } from "./interpolate";
import {
  applyScalarSnapshot,
  applySnapshot,
  ScalarInfo,
  ScheduleInfo,
  SerializedKf,
  SerializedScalar,
  SerializedSchedule,
  Showable,
  SoundClip,
} from "./showable";
import { SerializedChild, buildComponents } from "./slide-components/serialize";

/**
 * Serialized state of one {@link Showable.fixedComponents} item.
 * Matched by `description` on restore (no `registryKey` needed — the object
 * already exists in TypeScript; only its editable state is persisted).
 */
export type SerializedFixedChild = {
  description: string;
  schedules?: SerializedSchedule[];
  scalars?: SerializedScalar[];
  components?: SerializedChild[];
  fixedComponents?: SerializedFixedChild[];
  duration?: number;
  soundClips?: SoundClip[];
  userEditableDescription?: string;
};

/** File format: one entry per selectable that has editable state. No timestamps. */
export type JsonFileEntry = {
  schedules?: SerializedSchedule[];
  scalars?: SerializedScalar[];
  components?: SerializedChild[];
  /** Editable state of {@link Showable.fixedComponents} items, matched by description. */
  fixedComponents?: SerializedFixedChild[];
  userEditableDescription?: string;
  duration?: number;
  soundClips?: SoundClip[];
};

export function easeName(
  fn: ((t: number) => number) | undefined,
): string | undefined {
  if (!fn) return undefined;
  if (fn === ease) return "ease";
  if (fn === easeIn) return "easeIn";
  if (fn === easeOut) return "easeOut";
  return "hold";
}

export function serializeSchedules(
  schedules: readonly ScheduleInfo[],
): SerializedSchedule[] {
  return schedules.map((info) => {
    const kfs = info.schedule;
    if (kfs.length === 1 && kfs[0].time === 0 && !kfs[0].easeAfter) {
      return {
        description: info.description,
        type: info.type,
        value: kfs[0].value,
      };
    }
    return {
      description: info.description,
      type: info.type,
      keyframes: kfs.map((kf) => {
        const entry: SerializedKf = { time: kf.time, value: kf.value };
        const name = easeName(kf.easeAfter);
        if (name) entry.easeAfter = name;
        return entry;
      }),
    };
  });
}

export function serializeScalars(
  scalars: readonly ScalarInfo[],
): SerializedScalar[] {
  return scalars.map((info) => ({
    description: info.description,
    type: info.type,
    value: info.value,
  }));
}

export function serializeComponents(components: Showable[]): SerializedChild[] {
  return components.flatMap((child) => {
    const rk = child.registryKey;
    if (!rk) {
      console.warn(
        `serializeComponents: replaceable child "${child.description}" has no registryKey — it will be lost on save/restore.`,
      );
      return [];
    }
    const entry: SerializedChild = {
      registryKey: rk,
      schedules: child.schedules?.length
        ? serializeSchedules(child.schedules)
        : [],
    };
    if (child.scalars?.length) entry.scalars = serializeScalars(child.scalars);
    if (child.replaceableComponents !== undefined)
      entry.components = serializeComponents(child.replaceableComponents.get());
    if (child.userEditableDescription !== undefined)
      entry.userEditableDescription = child.userEditableDescription;
    if (child.setDuration !== undefined) entry.duration = child.duration;
    return [entry];
  });
}

function getFixedComponents(parent: Showable) {
  return (
    parent.children?.flatMap(({ replaceable, child }) =>
      replaceable ? [] : child,
    ) ?? []
  );
}

/**
 * Describe an object's parents in a way suitable for a debug message.
 * @param showable Describe the parents of this object.
 * @returns A string with a list of descriptions and class names.
 */
function describeAncestors(showable: Showable) {
  const pieces = new Array<string>();
  for (
    let parent = showable.parent;
    parent !== undefined;
    parent = parent.parent
  ) {
    let itemDescription = "";
    if ("description" in parent) {
      if (typeof parent.description == "string") {
        itemDescription = parent.description;
      }
    }
    if ("constructor" in parent) {
      if (itemDescription != "") {
        itemDescription += " ";
      }
      itemDescription += `[${parent.constructor.name}]`;
    }
    if (itemDescription == "") {
      itemDescription = "⁇";
    }
    pieces.unshift(itemDescription);
  }
  return pieces.join(" ≫ ");
}

/** Serializes {@link Showable.fixedComponents} — TypeScript-defined items whose
 *  structure is fixed but whose editable state (schedules, scalars, sub-components)
 *  should be persisted and restored by matching on `description`. */
export function serializeFixedComponents(
  fixedComponents: readonly Showable[],
): SerializedFixedChild[] {
  const seen = new Set<string>();
  for (const child of fixedComponents) {
    if (seen.has(child.description)) {
      console.warn(
        `serializeFixedComponents: duplicate fixed-child description "${child.description}" — only the first will be restored on load.`,
        describeAncestors(child),
      );
    }
    seen.add(child.description);
  }
  return fixedComponents.map((child) => {
    const entry: SerializedFixedChild = { description: child.description };
    if (child.schedules?.length)
      entry.schedules = serializeSchedules(child.schedules);
    if (child.scalars?.length) entry.scalars = serializeScalars(child.scalars);
    if (child.replaceableComponents !== undefined)
      entry.components = serializeComponents(child.replaceableComponents.get());
    const fixedComponents = getFixedComponents(child);
    if (fixedComponents.length)
      entry.fixedComponents = serializeFixedComponents(fixedComponents);
    if (child.setDuration !== undefined) entry.duration = child.duration;
    if (child.soundClips !== undefined)
      entry.soundClips = child.soundClips.map((c) => ({ ...c }));
    if (child.userEditableDescription !== undefined)
      entry.userEditableDescription = child.userEditableDescription;
    return entry;
  });
}

/** Restores saved state into an existing `fixedComponents` array.
 *  Each saved entry is matched to a live item by `description`; unmatched
 *  entries are silently ignored (e.g. after a TypeScript rename). */
export function applyFixedComponents(
  fixedComponents: readonly Showable[],
  serialized: SerializedFixedChild[],
): void {
  for (const sc of serialized) {
    const child = fixedComponents.find((c) => c.description === sc.description);
    if (!child) continue;
    if (child.scalars?.length && sc.scalars?.length)
      applyScalarSnapshot(child.scalars, sc.scalars);
    if (child.schedules?.length && sc.schedules?.length)
      applySnapshot(child.schedules, sc.schedules);
    if (
      child.replaceableComponents !== undefined &&
      sc.components !== undefined
    ) {
      child.replaceableComponents.replace(buildComponents(sc.components));
    }
    const childFixedComponents = getFixedComponents(child);
    if (childFixedComponents.length && sc.fixedComponents?.length)
      applyFixedComponents(childFixedComponents, sc.fixedComponents);
    if (sc.duration !== undefined) child.setDuration?.(sc.duration);
    if (sc.soundClips !== undefined)
      child.soundClips = sc.soundClips.map((c) => ({ ...c }));
    if (sc.userEditableDescription !== undefined)
      child.userEditableDescription = sc.userEditableDescription;
  }
}

// MARK: Saved-file format

/** Bumped when the on-disk shape changes. Version 1 was a flat map of selectableKey → entry. */
export const SNAPSHOT_FORMAT_VERSION = 2;

/**
 * The on-disk shape of a saved video.
 *
 * Deliberately carries no timestamp: the dirty flag compares a freshly built snapshot against
 * the last body written, so anything that changes on every build would make the file look
 * permanently dirty.  The save time lives on the `files` IndexedDB record instead.
 */
export type VideoSnapshot = {
  formatVersion: number;
  videoKey: string;
  tree: SerializedFixedChild;
};

/** Is this parsed JSON a version-2+ snapshot rather than a legacy flat map? */
export function isVideoSnapshot(parsed: unknown): parsed is VideoSnapshot {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    typeof (parsed as VideoSnapshot).formatVersion === "number" &&
    typeof (parsed as VideoSnapshot).tree === "object"
  );
}

// MARK: Whole-tree serialization
//
// See development-plans/single-tree-per-video.md.  A video is one `Showable` tree, so its
// saved form is one node.  `SerializedFixedChild` is already exactly "one tree node", so these
// are thin wrappers over the recursive functions above rather than new serialization code.

/** Serialize an entire video as a single tree node. */
export function serializeTree(root: Showable): SerializedFixedChild {
  return serializeFixedComponents([root])[0];
}

/** Apply a whole-video tree produced by {@link serializeTree} back onto the live root. */
export function applyTree(root: Showable, tree: SerializedFixedChild): void {
  applyFixedComponents([root], [tree]);
}

/**
 * Locate the serialized node corresponding to `wanted`, by walking the live tree and the
 * serialized tree together and pairing children by description.
 *
 * This is how a whole-video snapshot gets applied to just one selected chapter.  Matching
 * sibling-by-sibling rather than by a stored path keeps description collisions local to one
 * sibling group, and survives the chapter-list reshaping that `dump()` does when a duration
 * changes.
 *
 * @returns The matching node, or undefined when `wanted` is not in this tree.
 */
export function findSerializedNode(
  liveParent: Showable,
  serializedParent: SerializedFixedChild | undefined,
  wanted: Showable,
): SerializedFixedChild | undefined {
  if (!serializedParent) return undefined;
  if (liveParent === wanted) return serializedParent;
  const serializedChildren = serializedParent.fixedComponents;
  if (!serializedChildren?.length) return undefined;
  for (const child of getFixedComponents(liveParent)) {
    const match = serializedChildren.find(
      (s) => s.description === child.description,
    );
    if (!match) continue;
    const found = findSerializedNode(child, match, wanted);
    if (found) return found;
  }
  return undefined;
}

// MARK: Coverage check

/**
 * Why a selectable would not survive a round trip through {@link serializeTree}.
 *
 * - `unreachable` — nothing about it is written at all.
 * - `lossy` — it is reached through {@link serializeComponents}, which omits `fixedComponents`
 *   and `soundClips`, so those parts of it are dropped.
 */
export type CoverageProblem = {
  description: string;
  reason: "unreachable" | "lossy";
  detail: string;
};

/**
 * Check that every selectable really is covered by a single whole-tree save.
 *
 * Today each chapter also gets its own flat IndexedDB record, which serializes it in full and
 * so hides the gap in {@link serializeComponents}.  Collapsing to one record removes that
 * cover, so this must come back empty before the switch is safe.
 */
export function findCoverageProblems(
  root: Showable,
  selectables: readonly Showable[],
): CoverageProblem[] {
  /** "full" = serialized with fidelity; "partial" = reached via serializeComponents. */
  const coverage = new Map<Showable, "full" | "partial">();
  const walk = (node: Showable, level: "full" | "partial") => {
    const existing = coverage.get(node);
    // "full" wins if a node is reachable both ways.
    if (existing === "full" || (existing === "partial" && level === "partial")) {
      return;
    }
    coverage.set(node, level);
    // serializeFixedComponents recurses into fixed children; serializeComponents does not
    // emit them at all, so under a "partial" node they are simply not written.
    if (level === "full") {
      for (const child of getFixedComponents(node)) walk(child, "full");
    }
    for (const child of node.replaceableComponents?.get() ?? []) {
      walk(child, "partial");
    }
  };
  walk(root, "full");

  const problems: CoverageProblem[] = [];
  for (const selectable of selectables) {
    const level = coverage.get(selectable);
    if (level === undefined) {
      problems.push({
        description: selectable.description,
        reason: "unreachable",
        detail: "not reached from the root by serializeTree()",
      });
    } else if (level === "partial") {
      const lost: string[] = [];
      if (getFixedComponents(selectable).length) lost.push("fixedComponents");
      if (selectable.soundClips?.length) lost.push("soundClips");
      if (lost.length) {
        problems.push({
          description: selectable.description,
          reason: "lossy",
          detail: `reached via serializeComponents(), which drops ${lost.join(" and ")}`,
        });
      }
    }
  }
  return problems;
}

/** Apply a {@link JsonFileEntry} to a selectable in-place. */
export function applyJsonEntry(
  selectable: Showable,
  entry: JsonFileEntry,
): void {
  if (selectable.scalars?.length && entry.scalars?.length) {
    applyScalarSnapshot(selectable.scalars, entry.scalars);
  }
  if (selectable.schedules?.length && (entry.schedules?.length ?? 0) > 0) {
    applySnapshot(selectable.schedules, entry.schedules!);
  }

  if (
    selectable.replaceableComponents !== undefined &&
    entry.components !== undefined
  ) {
    selectable.replaceableComponents.replace(buildComponents(entry.components));
  }
  const selectableFixedComponents = getFixedComponents(selectable);
  if (selectableFixedComponents?.length && entry.fixedComponents?.length) {
    applyFixedComponents(selectableFixedComponents, entry.fixedComponents);
  }
  if (entry.duration !== undefined) selectable.setDuration?.(entry.duration);
  selectable.userEditableDescription = entry.userEditableDescription;
  if (entry.soundClips !== undefined && selectable.soundClips !== undefined) {
    selectable.soundClips.length = 0;
    selectable.soundClips.push(...entry.soundClips.map((c) => ({ ...c })));
  }
}
