/**
 * A file on disk kept identical to something in memory:  "Sync to file".
 *
 * The program's own saves live in IndexedDB.  A synced file is an *export* for
 * git, diff and VS Code, rewritten every time IndexedDB is, so it is never
 * stale.  See development-plans/saving-and-undoing.md.
 *
 * Three rules, all enforced here so every synced file behaves the same:
 *
 * 1. **Idempotent.**  {@link SyncedFile.request} means "make the file match
 *    memory".  Calling it when they already match costs one small read.
 * 2. **Never clobber.**  If the file on disk isn't what we last wrote, someone
 *    else changed it (git checkout, an edit in VS Code).  We don't write; we
 *    say so, and offer Overwrite (and Open, where that makes sense).
 * 3. **No corrupt files.**  `createWritable()` writes to a swap file
 *    (`<name>.crswap` in Chrome) that replaces the real file only when
 *    `close()` finishes.  A write that never finishes — say, one started as
 *    the page unloads — leaves the old file intact, just stale, and the next
 *    request() catches it up.
 */

/** What a synced file remembers between sessions. */
export type SyncRecord = {
  readonly filename: string;
  readonly handle: FileSystemFileHandle;
  /** The checkbox.  Remembered even when off, to suggest the same file next time. */
  readonly enabled: boolean;
  /**
   * Exactly what we last wrote, or `undefined` if we don't know.  This is how
   * we tell our own file from one somebody else has changed.
   */
  readonly lastWrittenBody?: string;
};

export type SyncedFileOptions = {
  readonly checkbox: HTMLInputElement;
  /** Shows the filename and the state.  Must not be inside the checkbox's `<label>`, because it holds buttons. */
  readonly status: HTMLElement;
  readonly picker: {
    readonly id: string;
    readonly types: FilePickerAcceptType[];
    readonly defaultName: () => string;
  };
  /** The contents the file should have, right now. */
  readonly render: () => string;
  readonly load: () => Promise<SyncRecord | undefined>;
  readonly store: (record: SyncRecord) => Promise<void>;
  /**
   * When present, a conflict also offers Open:  replace what's in memory with
   * the file's contents.  Only makes sense for a file that *is* the work, not
   * one derived from it.
   */
  readonly open?: (content: string) => void | Promise<void>;
  /** Show " *" while memory is ahead of the file, i.e. between an edit and its save. */
  readonly showPending?: boolean;
};

type State =
  | { kind: "starting" }
  | { kind: "off" }
  | { kind: "synced" }
  | { kind: "needs-permission" }
  | { kind: "conflict" }
  | { kind: "error"; message: string };

export class SyncedFile {
  readonly #options: SyncedFileOptions;
  #record: SyncRecord | undefined;
  #state: State = { kind: "starting" };
  readonly #ready: Promise<void>;
  /** A sync is running.  Requests made meanwhile set {@link #again} instead of starting a second one. */
  #running = false;
  #again = false;
  /** The next sync may overwrite a file someone else changed:  the user said so. */
  #forceNext = false;

  constructor(options: SyncedFileOptions) {
    this.#options = options;
    options.checkbox.disabled = true;
    this.#ready = options.load().then(
      (record) => {
        this.#record = record;
        options.checkbox.checked = record?.enabled === true;
        options.checkbox.disabled = false;
        this.#state = { kind: record?.enabled ? "synced" : "off" };
        this.#draw();
      },
      (error) => {
        this.#state = { kind: "error", message: String(error) };
        this.#draw();
      },
    );
    options.checkbox.addEventListener("change", () => {
      if (options.checkbox.checked) {
        void this.#enable();
      } else {
        void this.#disable();
      }
    });
    this.#draw();
  }

  /** The file being synced, or `undefined` when the checkbox is off. */
  get handle(): FileSystemFileHandle | undefined {
    return this.#record?.enabled ? this.#record.handle : undefined;
  }

  /** The name of the file being synced, or `undefined` when the checkbox is off. */
  get filename(): string | undefined {
    return this.#record?.enabled ? this.#record.filename : undefined;
  }

  /**
   * Make the file match memory, if this file is being synced.  Safe to call at
   * any time and as often as you like:  a burst of requests produces one write
   * of the latest state.
   */
  request(force = false): void {
    this.#again = true;
    this.#forceNext ||= force;
    if (this.#running) return;
    this.#running = true;
    void (async () => {
      try {
        await this.#ready;
        while (this.#again) {
          this.#again = false;
          const force = this.#forceNext;
          this.#forceNext = false;
          await this.#syncOnce(force);
        }
      } finally {
        this.#running = false;
      }
    })();
  }

  /** Redraw, e.g. to show or clear the pending " *" after an edit.  Cheap; does no I/O. */
  refreshStatus(): void {
    this.#draw();
  }

  // MARK: The sync itself

  async #syncOnce(force: boolean): Promise<void> {
    const record = this.#record;
    if (!record?.enabled) {
      this.#state = { kind: "off" };
      this.#draw();
      return;
    }
    const { handle } = record;
    try {
      // After a restart the browser only remembers "granted" if the user chose
      // "Allow on every visit".  Asking again needs a click — see #draw().
      if ((await handle.queryPermission({ mode: "readwrite" })) !== "granted") {
        this.#state = { kind: "needs-permission" };
        this.#draw();
        return;
      }
      const body = this.#options.render();
      const onDisk = await (await handle.getFile()).text();
      if (onDisk !== body) {
        if (!force && onDisk !== record.lastWrittenBody) {
          // Rule 2.  This also covers a record from before syncing existed,
          // where we don't know what we last wrote:  we only write once the
          // file is known to be ours.
          this.#state = { kind: "conflict" };
          this.#draw();
          return;
        }
        const writable = await handle.createWritable();
        await writable.write(body);
        await writable.close();
      }
      if (record.lastWrittenBody !== body) {
        await this.#remember({ ...record, lastWrittenBody: body });
      }
      this.#state = { kind: "synced" };
    } catch (error) {
      console.warn(`Sync to "${record.filename}" failed:`, error);
      this.#state = { kind: "error", message: describe(error) };
    }
    this.#draw();
  }

  async #remember(record: SyncRecord): Promise<void> {
    this.#record = record;
    await this.#options.store(record);
  }

  // MARK: The checkbox and the buttons

  async #enable(): Promise<void> {
    const { checkbox, picker } = this.#options;
    const ask = (startIn?: FileSystemHandle) =>
      window.showSaveFilePicker({
        id: picker.id,
        suggestedName: this.#record?.filename ?? picker.defaultName(),
        ...(startIn && { startIn }),
        types: picker.types,
      });
    let handle: FileSystemFileHandle;
    try {
      try {
        handle = await ask(this.#record?.handle);
      } catch (error) {
        // Starting next to a file that has since been deleted can make the
        // picker itself fail.  Starting anywhere is better than not at all.
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        handle = await ask();
      }
    } catch (error) {
      checkbox.checked = false;
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        this.#state = { kind: "error", message: describe(error) };
      }
      this.#draw();
      return;
    }
    // Choosing a file in the save picker is consent to replace it, so the
    // first write doesn't need to know what was there before.
    await this.#remember({ filename: handle.name, handle, enabled: true });
    this.request(true);
  }

  async #disable(): Promise<void> {
    if (this.#record) {
      await this.#remember({ ...this.#record, enabled: false });
    }
    this.#state = { kind: "off" };
    this.#draw();
  }

  async #allow(): Promise<void> {
    const handle = this.handle;
    if (!handle) return;
    // Must run inside the click:  requestPermission() needs a user gesture.
    if ((await handle.requestPermission({ mode: "readwrite" })) === "granted") {
      this.request();
    }
  }

  /** Conflict, resolved in favor of the file:  load it, and from then on treat it as ours. */
  async #openFromDisk(): Promise<void> {
    const record = this.#record;
    const open = this.#options.open;
    if (!record || !open) return;
    try {
      const content = await (await record.handle.getFile()).text();
      // Before opening, because opening saves, and that save syncs.
      await this.#remember({ ...record, lastWrittenBody: content });
      await open(content);
    } catch (error) {
      this.#state = { kind: "error", message: describe(error) };
      this.#draw();
      return;
    }
    this.request();
  }

  // MARK: Drawing

  #draw(): void {
    const { status, showPending, render } = this.#options;
    status.replaceChildren();
    status.style.color = "";
    status.style.cursor = "";
    status.title = "";
    status.onclick = null;
    const name = this.#record?.filename ?? "";
    const text = (s: string) => status.append(s);
    const button = (label: string, title: string, action: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.title = title;
      b.style.marginLeft = "0.3em";
      b.addEventListener("click", (event) => {
        event.stopPropagation();
        action();
      });
      status.append(b);
    };

    switch (this.#state.kind) {
      case "starting":
        text("…");
        status.style.color = "gray";
        break;
      case "off":
        text("off");
        status.style.color = "gray";
        break;
      case "synced": {
        const pending =
          showPending && render() !== this.#record?.lastWrittenBody;
        text(`${name} ${pending ? "*" : "✓"}`);
        status.style.color = pending ? "darkorange" : "";
        status.title = pending
          ? "Your latest change will be written in a moment"
          : `In sync with ${name}`;
        break;
      }
      case "needs-permission":
        text(`${name} ⚠ click to allow`);
        status.style.color = "darkorange";
        status.style.cursor = "pointer";
        status.title =
          "The browser needs your permission again to write this file. " +
          'Choosing "Allow on every visit" stops it asking.';
        status.onclick = () => void this.#allow();
        break;
      case "conflict":
        text(`${name} ⚠ changed on disk`);
        status.style.color = "darkorange";
        status.title =
          "Something else changed this file since it was last synced, so it hasn't been overwritten.";
        button(
          "Overwrite",
          `Replace ${name} with the current state`,
          () => this.request(true),
        );
        if (this.#options.open) {
          button(
            "Open",
            `Load ${name} into the editor instead.  The current state stays in Load, so this can be undone.`,
            () => void this.#openFromDisk(),
          );
        }
        break;
      case "error":
        text(`${name} ⚠ couldn't write — click to retry`);
        status.style.color = "red";
        status.style.cursor = "pointer";
        status.title = this.#state.message;
        status.onclick = () => this.request();
        break;
    }
  }
}

function describe(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotFoundError") {
      return "The file is gone.  Uncheck the box and check it again to pick a new one.";
    }
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
