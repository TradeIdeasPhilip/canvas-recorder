// Service worker for testing slow-loading resources (fonts, images, etc.)
// during development.  See dev/delay-files.ts for how this gets registered
// and enabled (?delayFiles=1 / ?refreshThread=1 in the page URL).
//
// After editing this file, reload the page with ?refreshThread=1 once so the
// browser picks up the new version instead of running the cached one.

/**
 * Exact URL -> delay in milliseconds.
 * Any request whose URL isn't an exact match here passes straight through.
 * @type {Map<string, number>}
 */
const whatToDelay = new Map([
  //["https://store.dftba.com/cdn/shop/files/3b1b-piplushieplump-site-2.jpg",5000]
  ["https://fonts.gstatic.com/s/bevan/v26/4iCj6KZ0a9NXjG8TWCvZtUSIL4U.woff2",5000],
  ["https://fonts.gstatic.com/s/bevan/v26/4iCj6KZ0a9NXjG8dWCvZtUSI.woff2",3000]
]);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const delayMs = whatToDelay.get(event.request.url);
  if (delayMs === undefined) {
    return;
  }
  event.respondWith(
    new Promise((resolve) => setTimeout(resolve, delayMs)).then(() =>
      fetch(event.request),
    ),
  );
});
