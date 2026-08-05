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
} from "./showable";
import { buildComponents, SerializedChild } from "./slide-components";

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
  }
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
}
