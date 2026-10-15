# Instant Startup

_Trimmed 10/14/2026.  Most of the original brainstorm has been built:  slides, sound clips and
attaching them to the timeline, rehoming, a text form for sound clips, the timeline editor, the
keyframe editors with on-canvas dragging, the IndexedDB "HyperCard" object store with JSON in
git, the component registry, and splitting the library from the videos.  That material is in
git history.  What's left is below._

## The goal

Starting something new should feel like Word or Delphi.  Open the app and get a blank document,
ready to edit.  You can play it, and even record it, before saving.  Nothing asks for a file or
directory name until you save.  A reasonable default template is there, easy to change, and
usually left alone.

Today a new video means a new npm project.  That's right for a serious production with custom
TypeScript, and too much for a quick idea, a strawman, or a video built only from the standard
components.

**Wanted:**  go to a web app, click **New video**, and start working.

The original inspiration still describes the product.  It's like
[OBS's Browser Source](https://obsproject.com/kb/browser-source), but for a video editor:
- **Simple enough for my dad to use,** by offering only the features that matter:  cutting and
  rearranging recorded video and audio, plus text and arrows.
- **Open to any TypeScript** as a component.

## Most of the pieces exist

- **The component registry** builds any standard component from the GUI.  A video made only of
  registry components needs no TypeScript at all.
- **Per-video state** already lives in IndexedDB, with history, Load, and JSON files.
- **The diff `.txt` is already code.**  It turns everything made in the GUI into TypeScript,
  including components registered by other projects.  So a video can *graduate*:  start in the
  web app, and when it needs custom code, paste the generated code into a new npm project.
- **The library** (`canvas-recorder-lib`) is already how a project hosts the player.

## What's missing

- **A video that isn't defined by code.**  Its root is an empty container, and everything in
  it comes from saved state.  The `galaga` video is nearly this already.
- **A project list in place of `?toShow=`:**  New, Open, Rename, Delete, Duplicate, plus Import
  and Export as JSON.  With no project requested, you get a new, unnamed one, Delphi style.
  Switching projects should be easy.
- **A hosted build,** say on GitHub Pages, with no local setup.
- **Media files.**  A hosted app can't read `public/`.  Sound, video and images have to come
  from the user's disk (the File System Access API, as the synced files already do) or be
  copied into browser storage.  This is probably the biggest piece of design work.

## Ideas from the original that aren't built yet

- **More attachment points than start and end, visible in the Visual Editor.**  A component
  could offer named moments for sounds and other things to attach to.
  - **A working alternative already exists, in code.**  `riemann-surfaces-3d` keeps a
    `MOMENTS` table in `src/narration.ts`:  named times, each with a comment quoting the
    words it lines up with ("z waves on '…your input, Z,'").  Moving a moment is a one-line
    edit, made by asking Claude while looking at the transcript and the timeline.  It never
    needed the timeline to know about it.
  - Explicit attachment points in the editor would still be nice, but there are options.
  - Related:  the play limits in [chapter-selector.md](chapter-selector.md), which will be able
    to follow a component's edges.
- **Keyframes on the timeline,** as in a typical video editor:  see where they are, and drag them.
- **Placing a component by drawing its rectangle,** like dropping a control onto a form in
  Delphi or Visual Basic, in place of picking from the Insert dialog and then setting a Dest
  Rect.
- **Sliders for exploring,** in interactive use.  A schedule with one keyframe may already be
  enough.
- **Decided against:  code inside the configuration,** HyperCard style.  Examples:
  `lerp(67%, chapter2.end(), chapter3.start())` typed where a time goes, a custom easing written
  as a string, or `x*x` typed into the function graph.
  - **Why not:** code in a string loses everything TypeScript and the IDE give:  type
    checking, autocomplete, refactoring, going to a definition.  And it raises the question of
    running code from someone else's project.
  - **What we do instead:** a registry that maps names to real functions.  The function graph
    is the model:  you pick a function by name in the Visual Editor, and the function itself
    is ordinary TypeScript.
- **Templates and snippets:**  [showcase.ts](../src/showcase.ts) as a gallery to start a slide
  or a whole video from, in place of copying sample code.  For example, a standard title font
  and title position, so every scene matches before the content is done.
