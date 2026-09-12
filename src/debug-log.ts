/**
 * A tiny, DOM-free logging ring buffer.
 *
 * The point of this file: {@link debugLog} must be safe to call from a hot
 * path (e.g. once per RAF tick) without spamming the browser console or
 * touching the DOM.  It's just an array push.  Something else -- currently
 * `dev/canvas-recorder.ts` -- polls {@link getNewDebugLogEntries} on its own
 * slow timer and renders the result, so the cost of *displaying* a log line
 * is fully decoupled from the cost of *emitting* one.
 */

export type DebugLogEntry = {
  readonly time: number;
  readonly tag: string;
  readonly message: string;
};

const MAX_ENTRIES = 2000;
const entries: DebugLogEntry[] = [];
let nextUnreadIndex = 0;

export function debugLog(tag: string, message: string): void {
  entries.push({ time: performance.now(), tag, message });
  if (entries.length > MAX_ENTRIES) {
    const excess = entries.length - MAX_ENTRIES;
    entries.splice(0, excess);
    nextUnreadIndex = Math.max(0, nextUnreadIndex - excess);
  }
}

/**
 * Returns every entry added since the last call, then advances the
 * bookmark.  Meant to be polled on a slow timer, not once per frame.
 */
export function getNewDebugLogEntries(): readonly DebugLogEntry[] {
  const start = Math.min(nextUnreadIndex, entries.length);
  const result = entries.slice(start);
  nextUnreadIndex = entries.length;
  return result;
}
