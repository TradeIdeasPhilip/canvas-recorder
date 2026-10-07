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
import { componentRegistry } from "./slide-components/registry";
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

/**
 * The editable state of one selectable, as accepted by {@link applyJsonEntry}.
 *
 * This used to be the file format (a map of these, one per chapter).  Files are now a single
 * {@link VideoSnapshot}; a {@link SerializedFixedChild} is structurally a superset of this, so
 * any node of a saved tree can be passed straight to {@link applyJsonEntry}.
 */
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
    if (child.soundClips !== undefined)
      entry.soundClips = child.soundClips.map((c) => ({ ...c }));
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

// MARK: Matching siblings

/**
 * For each of `items`, its counterpart in `others`:  the one with the same
 * description.  When several siblings share a description, they pair up in
 * order:  the 2nd "note" with the 2nd "note".
 *
 * This is how a saved component finds its live one, and its TypeScript
 * default.  Descriptions aren't unique.  Matching on the first one with that
 * name used to hand every saved "note" to the first live "note", so a reload
 * scrambled same-named siblings.  That still happens if the TypeScript adds,
 * removes or reorders same-named siblings, since order is all there is to go on.
 */
export function counterparts<
  A extends { description: string },
  B extends { description: string },
>(items: readonly A[], others: readonly B[]): (B | undefined)[] {
  const byDescription = new Map<string, B[]>();
  for (const other of others) {
    let group = byDescription.get(other.description);
    if (!group) byDescription.set(other.description, (group = []));
    group.push(other);
  }
  const seen = new Map<string, number>();
  return items.map((item) => {
    const n = seen.get(item.description) ?? 0;
    seen.set(item.description, n + 1);
    return byDescription.get(item.description)?.[n];
  });
}

/** Serializes {@link Showable.fixedComponents} — TypeScript-defined items whose
 *  structure is fixed but whose editable state (schedules, scalars, sub-components)
 *  should be persisted and restored by matching on `description`. */
export function serializeFixedComponents(
  fixedComponents: readonly Showable[],
): SerializedFixedChild[] {
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
 *  Each saved entry is matched to a live item with {@link counterparts};
 *  unmatched entries are silently ignored (e.g. after a TypeScript rename). */
export function applyFixedComponents(
  fixedComponents: readonly Showable[],
  serialized: SerializedFixedChild[],
): void {
  const live = counterparts(serialized, fixedComponents);
  for (const [index, sc] of serialized.entries()) {
    const child = live[index];
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
  const liveChildren = getFixedComponents(liveParent);
  const matches = counterparts(liveChildren, serializedChildren);
  for (const [index, child] of liveChildren.entries()) {
    const match = matches[index];
    if (!match) continue;
    const found = findSerializedNode(child, match, wanted);
    if (found) return found;
  }
  return undefined;
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

// MARK: Leaving out defaults
//
// Saved files list only what differs from the defaults, the way the diff file
// always has.  There are two kinds of default:
//
// * A component the Visual Editor added starts as a brand new one from the
//   registry, so its defaults are that brand new component.  Leaving those out
//   needs nothing else:  loading starts from a brand new component anyway.
// * A component built in TypeScript starts the way the TypeScript built it,
//   so its defaults are the TypeScript defaults captured at startup.  Loading
//   has to put those back first, which is what fillTreeDefaults() is for.
//
// The TypeScript defaults file is the one thing written in full.

/** How applySnapshot() and applyScalarSnapshot() match a saved item to a live one. */
function keyOf(item: { description: string; type: string }): string {
  return `${item.type}\0${item.description}`;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The items in `current` that differ from their match in `defaults`, or undefined if none do. */
function withoutDefaults<T extends { description: string; type: string }>(
  current: readonly T[] | undefined,
  defaults: readonly T[] | undefined,
): T[] | undefined {
  if (!current) return undefined;
  const result = current.filter((item) => {
    const match = defaults?.find((d) => keyOf(d) === keyOf(item));
    return !match || !sameJson(match, item);
  });
  return result.length ? result : undefined;
}

/** `defaults`, with each item replaced by its match from `stored`.  The inverse of {@link withoutDefaults}. */
function withDefaults<T extends { description: string; type: string }>(
  stored: readonly T[] | undefined,
  defaults: readonly T[] | undefined,
): T[] | undefined {
  if (!defaults) return stored && [...stored];
  if (!stored) return [...defaults];
  const result = defaults.map(
    (d) => stored.find((s) => keyOf(s) === keyOf(d)) ?? d,
  );
  // Saved items the code no longer has.  Harmless; applying ignores them.
  for (const s of stored) {
    if (!defaults.some((d) => keyOf(d) === keyOf(s))) result.push(s);
  }
  return result;
}

/** Cache for {@link registryDefault}.  null means "no such registry key". */
const registryDefaults = new Map<string, SerializedChild | null>();

/**
 * A brand new component of this kind, serialized.  Computed the first time
 * it's asked for and cached, since serializing happens on every save.
 */
export function registryDefault(
  registryKey: string,
): SerializedChild | undefined {
  let cached = registryDefaults.get(registryKey);
  if (cached === undefined) {
    const fresh = componentRegistry.get(registryKey)?.create();
    if (fresh) fresh.registryKey = registryKey;
    cached = fresh ? (serializeComponents([fresh])[0] ?? null) : null;
    registryDefaults.set(registryKey, cached);
  }
  return cached ?? undefined;
}

/**
 * Leave out of each component whatever a brand new one of its kind already
 * has.  Recursive.  Nothing is lost, because {@link buildComponents} starts
 * from a brand new component.
 */
export function omitComponentDefaults(
  children: readonly SerializedChild[],
): SerializedChild[] {
  return children.map((child) => {
    const fresh = registryDefault(child.registryKey);
    if (!fresh) return child;
    const result: SerializedChild = { registryKey: child.registryKey };
    const schedules = withoutDefaults(child.schedules, fresh.schedules);
    if (schedules) result.schedules = schedules;
    const scalars = withoutDefaults(child.scalars, fresh.scalars);
    if (scalars) result.scalars = scalars;
    if (child.components !== undefined) {
      const components = omitComponentDefaults(child.components);
      if (!sameJson(components, omitComponentDefaults(fresh.components ?? []))) {
        result.components = components;
      }
    }
    if (child.userEditableDescription !== undefined) {
      result.userEditableDescription = child.userEditableDescription;
    }
    if (child.duration !== undefined && child.duration !== fresh.duration) {
      result.duration = child.duration;
    }
    if (
      child.soundClips !== undefined &&
      !sameJson(child.soundClips, fresh.soundClips)
    ) {
      result.soundClips = child.soundClips;
    }
    return result;
  });
}

/**
 * The parts of `tree` that differ from `defaults`, the TypeScript defaults.
 * A component whose saved form would be nothing but its description is left
 * out entirely.  Components the Visual Editor added are trimmed with
 * {@link omitComponentDefaults}.
 *
 * Undo with {@link fillTreeDefaults} before applying.
 */
export function omitTreeDefaults(
  tree: SerializedFixedChild,
  defaults: SerializedFixedChild | undefined,
): SerializedFixedChild {
  const result: SerializedFixedChild = { description: tree.description };
  const schedules = withoutDefaults(tree.schedules, defaults?.schedules);
  if (schedules) result.schedules = schedules;
  const scalars = withoutDefaults(tree.scalars, defaults?.scalars);
  if (scalars) result.scalars = scalars;
  if (tree.components !== undefined) {
    const components = omitComponentDefaults(tree.components);
    if (
      defaults?.components === undefined ||
      !sameJson(components, omitComponentDefaults(defaults.components))
    ) {
      result.components = components;
    }
  }
  if (tree.fixedComponents) {
    const children = tree.fixedComponents;
    const childDefaults = counterparts(children, defaults?.fixedComponents ?? []);
    const trimmed = children.map((child, index) =>
      omitTreeDefaults(child, childDefaults[index]),
    );
    // Drop the components that didn't change, except one that shares its
    // description with a later sibling that did.  That one stays, as just its
    // description, so the nth "note" still lines up with the nth "note".
    const lastChanged = new Map<string, number>();
    for (const [index, child] of trimmed.entries()) {
      if (Object.keys(child).length > 1) lastChanged.set(child.description, index);
    }
    const kept = trimmed.filter(
      (child, index) => index <= (lastChanged.get(child.description) ?? -1),
    );
    if (kept.length) result.fixedComponents = kept;
  }
  if (tree.duration !== undefined && tree.duration !== defaults?.duration) {
    result.duration = tree.duration;
  }
  if (
    tree.soundClips !== undefined &&
    !sameJson(tree.soundClips, defaults?.soundClips)
  ) {
    result.soundClips = tree.soundClips;
  }
  if (
    tree.userEditableDescription !== undefined &&
    tree.userEditableDescription !== defaults?.userEditableDescription
  ) {
    result.userEditableDescription = tree.userEditableDescription;
  }
  return result;
}

/**
 * Put back everything {@link omitTreeDefaults} left out, so the result can be
 * applied with {@link applyTree} or {@link applyJsonEntry}, which only change
 * what they're given.
 *
 * A tree saved before defaults were left out already has everything, so this
 * returns the same thing for it.
 *
 * The result shares nothing with either input.  Applying it makes its values
 * live, and the TypeScript defaults must never change underneath us.
 */
export function fillTreeDefaults(
  tree: SerializedFixedChild,
  defaults: SerializedFixedChild | undefined,
): SerializedFixedChild {
  return structuredClone(fillNode(tree, defaults));
}

function fillNode(
  tree: SerializedFixedChild,
  defaults: SerializedFixedChild | undefined,
): SerializedFixedChild {
  if (!defaults) return tree;
  const result: SerializedFixedChild = { description: tree.description };
  const schedules = withDefaults(tree.schedules, defaults.schedules);
  if (schedules) result.schedules = schedules;
  const scalars = withDefaults(tree.scalars, defaults.scalars);
  if (scalars) result.scalars = scalars;
  const components = tree.components ?? defaults.components;
  if (components) result.components = components;
  const stored = tree.fixedComponents ?? [];
  const childDefaults = defaults.fixedComponents ?? [];
  const storedFor = counterparts(childDefaults, stored);
  const fixedComponents = childDefaults.map((d, index) =>
    fillNode(storedFor[index] ?? { description: d.description }, d),
  );
  // Saved components the code no longer has.  Harmless; applying ignores them.
  for (const s of stored) {
    if (!storedFor.includes(s)) fixedComponents.push(s);
  }
  if (fixedComponents.length) result.fixedComponents = fixedComponents;
  const duration = tree.duration ?? defaults.duration;
  if (duration !== undefined) result.duration = duration;
  const soundClips = tree.soundClips ?? defaults.soundClips;
  if (soundClips) result.soundClips = soundClips;
  const userEditableDescription =
    tree.userEditableDescription ?? defaults.userEditableDescription;
  if (userEditableDescription !== undefined) {
    result.userEditableDescription = userEditableDescription;
  }
  return result;
}
