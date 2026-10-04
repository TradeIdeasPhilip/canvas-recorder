import {
  applyScalarSnapshot,
  applySnapshot,
  SerializedScalar,
  SerializedSchedule,
  Showable,
  SoundClip,
} from "../showable";
import { ComponentRegistryEntry, componentRegistry } from "./registry";

export type SerializedChild = {
  registryKey: string;
  schedules: SerializedSchedule[];
  scalars?: SerializedScalar[];
  components?: SerializedChild[];
  userEditableDescription?: string;
  duration?: number;
  /**
   * Same meaning as on the fixed-child format in snapshot.ts.  A component the
   * Visual Editor added can own sound clips too — e.g. a Video Clip's imported
   * audio, which lives on the clip so it moves with the clip.
   */
  soundClips?: SoundClip[];
};

/**
 * Rebuilds a component list from a serialized snapshot (e.g. a database entry
 * pasted directly into source code).  Each entry is created via its registry
 * factory, has its `registryKey` stamped on it, schedules restored via
 * `applySnapshot`, and nested components rebuilt recursively.  Entries whose
 * `registryKey` is not found in the registry are silently skipped.
 */
export function buildComponents(snapshot: SerializedChild[]): Showable[] {
  return snapshot.flatMap((sc) => {
    const entry: ComponentRegistryEntry | undefined = componentRegistry.get(
      sc.registryKey,
    );
    if (!entry) return [];
    const child = entry.create();
    child.registryKey = sc.registryKey;
    if (sc.userEditableDescription !== undefined)
      child.userEditableDescription = sc.userEditableDescription;
    if (child.scalars?.length && sc.scalars?.length) {
      applyScalarSnapshot(child.scalars, sc.scalars);
    }
    if (sc.duration !== undefined) child.setDuration?.(sc.duration);
    if (sc.soundClips !== undefined)
      child.soundClips = sc.soundClips.map((c) => ({ ...c }));
    if (child.schedules?.length) applySnapshot(child.schedules, sc.schedules);
    if (child.replaceableComponents !== undefined && sc.components?.length) {
      child.replaceableComponents.push(...buildComponents(sc.components));
    }
    return [child];
  });
}
