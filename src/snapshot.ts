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
};

/** File format: one entry per selectable that has editable state. No timestamps. */
export type JsonFileEntry = {
  schedules?: SerializedSchedule[];
  scalars?: SerializedScalar[];
  components?: SerializedChild[];
  /** Editable state of {@link Showable.fixedComponents} items, matched by description. */
  fixedComponents?: SerializedFixedChild[];
  userEditableDescription?: string;
};

export function easeName(fn: ((t: number) => number) | undefined): string | undefined {
  if (!fn) return undefined;
  if (fn === ease) return "ease";
  if (fn === easeIn) return "easeIn";
  if (fn === easeOut) return "easeOut";
  return "hold";
}

export function serializeSchedules(
  schedules: readonly ScheduleInfo[],
): SerializedSchedule[] {
  return schedules.map((info) => ({
    description: info.description,
    type: info.type,
    keyframes: info.schedule.map((kf) => {
      const entry: SerializedKf = { time: kf.time, value: kf.value };
      const name = easeName(kf.easeAfter);
      if (name) entry.easeAfter = name;
      return entry;
    }),
  }));
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
    if (!rk) return [];
    const entry: SerializedChild = {
      registryKey: rk,
      schedules: child.schedules?.length
        ? serializeSchedules(child.schedules)
        : [],
    };
    if (child.scalars?.length) entry.scalars = serializeScalars(child.scalars);
    if (child.components !== undefined)
      entry.components = serializeComponents(child.components);
    if (child.userEditableDescription !== undefined)
      entry.userEditableDescription = child.userEditableDescription;
    return [entry];
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
    if (child.scalars?.length)
      entry.scalars = serializeScalars(child.scalars);
    if (child.components !== undefined)
      entry.components = serializeComponents(child.components);
    if (child.fixedComponents?.length)
      entry.fixedComponents = serializeFixedComponents(child.fixedComponents);
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
    if (child.components !== undefined && sc.components !== undefined) {
      child.components.length = 0;
      child.components.push(...buildComponents(sc.components));
    }
    if (child.fixedComponents?.length && sc.fixedComponents?.length)
      applyFixedComponents(child.fixedComponents, sc.fixedComponents);
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
  if (selectable.components !== undefined && entry.components !== undefined) {
    selectable.components.length = 0;
    selectable.components.push(...buildComponents(entry.components));
  }
  if (selectable.fixedComponents?.length && entry.fixedComponents?.length) {
    applyFixedComponents(selectable.fixedComponents, entry.fixedComponents);
  }
  selectable.userEditableDescription = entry.userEditableDescription;
}
