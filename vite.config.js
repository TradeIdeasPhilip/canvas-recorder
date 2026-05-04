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

export default defineConfig({
  build: {
    // If something fails in production, it should still be debuggable.
    // I am storing the source and object code on GitHub, so there are
    // no secrets to protect.
    sourcemap:true,
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
        "\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a": resolve(__dirname, "index.html"),
        "\u2002": resolve(__dirname, "canvas-recorder.html"),
        "\u2003": resolve(__dirname, "sound-explorer.html"),
      },
      output: {
        // Disable code splitting by setting manualChunks to an empty object
        // Grok suggested this but it doesn't seem to do anything.
        manualChunks: {},
      },
    },
  },
  // This is the important part.  The default configuration assumes I have access
  // to the root of the webserver, and each project will share some assets.
  base: "./",
});
