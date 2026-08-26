import { philDebug } from "../src/utility";

const SW_URL = "./delay-files-sw.js";

/**
 * This function will report the status of the service worker.
 * It will return immediately.
 * It will register a listener that will report when the service worker is ready.
 *
 * This file lets you simulate slow-loading resources (fonts, images, videos, …) during
 * development, to exercise {@link Showable.getFramePromises} and the code
 * that awaits it.
 *
 * A service worker (`delay-files-sw.js`, in `public/`) intercepts
 * fetches and delays any URL listed in that file's `whatToDelay` map by a
 * fixed number of milliseconds; everything else passes straight through.
 * Edit `whatToDelay` directly in that file to choose what to delay.
 *
 * Use window.philDebug.loadServiceWorker() to start the process or to load
 * a newer version.
 *
 * Use window.philDebug.unloadServiceWorker() to remove the service worker.
 * In practice I don't do this much.
 * The files I care about are usually cached where the resource request never even gets to an HTTP request.
 */
export function watchServiceWorkerReady(): void {
  if (!("serviceWorker" in navigator)) {
    console.warn("Service workers not supported");
    return;
  }

  navigator.serviceWorker.getRegistration().then((registration) => {
    if (!registration) {
      console.log("No service worker registered.");
    }
    // Else wait for `ready` to resolve.
  });

  const controller = navigator.serviceWorker.controller;

  navigator.serviceWorker.ready.then((registration) => {
    // This only happens if and when the service worker is ready.
    // Otherwise the promise will hang forever.
    console.log("[SW] status", {
      registered: true,
      scope: registration.scope,
      activeScript: registration.active?.scriptURL ?? null,
      controllingThisPage: !!controller,
      controllerScript: controller?.scriptURL ?? null,
    });

    if (!controller) {
      console.warn(
        "[SW] A worker is registered/active, but this page is NOT controlled " +
          "(common after Empty Cache and Hard Reload). Do a normal reload.",
      );
    }
  });
}

/** Register or update a service worker and report when it is safe to use. */
async function loadServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    console.warn("[SW] not supported");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_URL);
    console.log("[SW] register() succeeded", registration.scope);

    // Force an update check (useful when you just changed the file on the server)
    try {
      await registration.update();
      console.log("[SW] update() check finished");
    } catch (e) {
      console.warn("[SW] update() failed", e);
    }

    // Wait until there is an active worker for this registration
    const readyReg = await navigator.serviceWorker.ready;
    console.log(
      "[SW] safe to use — active:",
      readyReg.active?.scriptURL ?? "(none)",
    );

    // Optional: also wait until *this page* is controlled
    // (only needed if you care about fetch interception on this tab)
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        );
      });
      console.log("[SW] this page is now controlled");
    }

    return readyReg;
  } catch (err) {
    console.error("[SW] load failed", err);
    return null;
  }
}

/** Unregister the service worker for this scope. */
async function unloadServiceWorker(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) {
    console.warn("[SW] not supported");
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    if (!registration) {
      console.log("[SW] nothing to unload");
      return false;
    }

    const ok = await registration.unregister();
    console.log(ok ? "[SW] unregistered" : "[SW] unregister() returned false");
    return ok;
  } catch (err) {
    console.error("[SW] unload failed", err);
    return false;
  }
}

// --- wire up debug helpers ---
philDebug.loadServiceWorker = loadServiceWorker;
philDebug.unloadServiceWorker = unloadServiceWorker;

// Note:  A lot of these `await`s seem unnecessary.
// Normally the service worker is finished initializing before the initial HTML and
// JavaScript are loaded, and the service worker could actually monitor or change
// those pages.
// Reloading the service worker is also very fast,
// faster than I could manually start the next step of my testing.