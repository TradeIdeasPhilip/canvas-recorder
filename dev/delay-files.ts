/**
 * Lets you simulate slow-loading resources (fonts, images, videos, …) during
 * development, to exercise {@link Showable.getFramePromises} and the code
 * that awaits it.
 *
 * A page-scoped service worker (`delay-files-sw.js`, in `public/`) intercepts
 * fetches and delays any URL listed in that file's `whatToDelay` map by a
 * fixed number of milliseconds; everything else passes straight through.
 * Edit `whatToDelay` directly in that file to choose what to delay.
 *
 * URL flags, read once at startup:
 * - `?delayFiles=1` — register the service worker (if needed) and start
 *   delaying matching requests.  A service worker never controls the page
 *   load that first registers it, so the first time this has ever run in a
 *   given browser profile, this reloads the page once automatically so the
 *   *next* load is actually intercepted.
 * - `?refreshThread=1` — use this after editing `delay-files-sw.js`.  Forces
 *   the browser to check for a new version of the script, then reloads into
 *   `?delayFiles=1` (dropping `refreshThread`, so the reload doesn't loop).
 *
 * Neither flag does anything if the URL has neither — the service worker is
 * never registered during normal use.
 */
export async function setupDelayFiles(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const refreshThread = params.has("refreshThread");
  const delayFiles = params.has("delayFiles");
  if (!refreshThread && !delayFiles) {
    return;
  }
  if (!("serviceWorker" in navigator)) {
    console.warn(
      "?delayFiles / ?refreshThread requested, but this browser has no navigator.serviceWorker.",
    );
    return;
  }

  const registration = await navigator.serviceWorker.register(
    "./delay-files-sw.js",
  );
  if (refreshThread) {
    // Pick up any edits to delay-files-sw.js since the last registration.
    await registration.update();
  }
  await navigator.serviceWorker.ready;

  if (refreshThread || !navigator.serviceWorker.controller) {
    // Either explicitly asked to refresh, or this is the first time this
    // service worker has ever been registered in this profile — it can't
    // control the page load that installs it, so reload once to get an
    // intercepted load.  Swap to ?delayFiles=1 so the reload can't loop.
    params.delete("refreshThread");
    params.set("delayFiles", "1");
    location.replace(`${location.pathname}?${params}${location.hash}`);
  }
}
