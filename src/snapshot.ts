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

/** File format: one entry per selectable that has editable state. No timestamps. */
export type JsonFileEntry = {
  schedules?: SerializedSchedule[];
  scalars?: SerializedScalar[];
  components?: SerializedChild[];
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
  selectable.userEditableDescription = entry.userEditableDescription;
}
