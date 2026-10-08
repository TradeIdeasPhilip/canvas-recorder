import { readFileSync } from "fs";
import { resolve } from "path";
import { defineConfig } from "vite";

// Help for this config file:
// https://vitejs.dev/config/#config-intellisense

// I copy this file to every new project.
//
// Notice 3 things:
// • The "target" defaults to esnext.
// • Customize the "input" with your html files.
// • The directory structure is perfect for publishing with GitHub Pages.
//
// More details: https://www.youtube.com/watch?v=8VJIBguoneM

/**
 * Keep ONNX Runtime's WebAssembly out of docs/.
 *
 * onnxruntime-web, inside the transcript worker, names its .wasm file as
 * `new URL("ort-wasm-….wasm", import.meta.url)`, so Vite copies the file into
 * the build:  26 MB.  But that's only a fallback for when no wasmPaths is set,
 * and Transformers.js always sets one, to the same file on jsdelivr.  This
 * points the fallback at jsdelivr too, so nothing is copied and nothing changes.
 */
function onnxWasmFromCdn() {
  return {
    name: "onnx-wasm-from-cdn",
    apply: "build",
    // Before Vite's own handling of `new URL(…, import.meta.url)`.
    enforce: "pre",
    transform(code, id) {
      const packageRoot = /^(.*\/node_modules\/onnxruntime-web)\/dist\//.exec(id)?.[1];
      if (!packageRoot) return null;
      // The exact version Transformers.js loads from the CDN.
      const { version } = JSON.parse(
        readFileSync(`${packageRoot}/package.json`, "utf8"),
      );
      const cdn = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/`;
      const result = code.replace(
        /new URL\((["'])(ort-[^"']+\.wasm)\1,\s*import\.meta\.url\)/g,
        (_match, _quote, file) => `new URL(${JSON.stringify(cdn + file)})`,
      );
      return result === code ? null : { code: result, map: null };
    },
  };
}

export default defineConfig({
  build: {
    // If something fails in production, it should still be debuggable.
    // I am storing the source and object code on GitHub, so there are
    // no secrets to protect.
    sourcemap: "inline",
    chunkSizeWarningLimit: 5000,
    target: "esnext",
    // This works well with GitHub pages.  GitHub can put everything in the docs directory on the web.
    outDir: "docs",
    rollupOptions: {
      input: {
        // The property names are only used in one place (as far as I can tell).
        // Some of the names of _internal_ files will be based on these names.  These are the same
        // files that have hashes in their file names.  A user would never see these unless he was
        // looking at the page source, the dev tools, etc.  I.e. the property names don't matter.
        // So I have fun with them.
        index: resolve(__dirname, "index.html"),
        "canvas-recorder": resolve(__dirname, "canvas-recorder.html"),
        "sound-explorer": resolve(__dirname, "sound-explorer.html"),
        "random-tests": resolve(__dirname, "random-tests.html"),
        "media-browser": resolve(__dirname, "media-browser.html"),
        "test-rig": resolve(__dirname, "test-rig.html"),
      },
      output: {
        // Extract shared library modules into a separate sync chunk so that
        // dynamically-imported video chunks (showcase, morph-test, etc.) don't
        // statically depend on the main entry chunk, which is async (top-level
        // await). A static import of an async module blocks evaluation until
        // that module finishes — creating a deadlock when the async entry is
        // itself awaiting the dynamic import of that video chunk.
        //
        // This also keeps chunk boundaries stable across rebuilds (see
        // development-plans/ci-pages-deploy.md): anything Rollup would
        // otherwise auto-split on its own heuristic can get reshuffled --
        // and re-hashed -- by a change anywhere else in the dependency
        // graph, even when a given chunk's own content didn't change.
        // Explicitly bucketing everything below avoids that.
        manualChunks(id) {
          const libPaths = [
            "/src/showable.",
            "/src/interpolate.",
            // slide-components.ts was later split into slide-components/*.ts;
            // matching the directory (trailing slash) instead of the old
            // single-file prefix (trailing dot) so this still actually hits.
            "/src/slide-components/",
            "/src/slow-image-sources.",
            "/src/utility.",
            "/src/stroke-colors.",
            "/src/binary-search.",
            "/src/corner-rounder.",
            "/src/glib/",
          ];
          if (libPaths.some((p) => id.includes(p))) {
            return "lib";
          }
          // Third-party dependencies: bucket them all into one stable
          // "vendor" chunk instead of leaving them to Rollup's automatic
          // (and less predictable) chunk-splitting heuristic.
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
  },
  worker: {
    // The transcript worker (dev/transcribe-worker.ts) uses dynamic imports,
    // which the default "iife" worker format can't bundle.
    format: "es",
    plugins: () => [onnxWasmFromCdn()],
  },
  // This is the important part.  The default configuration assumes I have access
  // to the root of the webserver, and each project will share some assets.
  base: "./",
});
