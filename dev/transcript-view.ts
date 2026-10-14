import type { Showable, SoundClip } from "../src/showable.ts";
import { type TranscriptWord, wordFlag } from "./transcript-align.ts";

// MARK: Types

/** One sound clip, as the view needs to know it. */
export type TranscriptViewClip = {
  readonly clip: SoundClip;
  readonly owner: Showable;
  /** When the clip starts, in the Visual Editor root's time. */
  readonly startMs: number;
  /** How long it plays, or undefined while its file hasn't been decoded. */
  readonly lengthMs: number | undefined;
};

/** What the view needs from the Visual Editor.  It never reaches into canvas-recorder.ts directly. */
export type TranscriptViewHooks = {
  /** Every sound clip under the root, in order of time. */
  clips(): readonly TranscriptViewClip[];
  /**
   * A file's transcript, a line saying how it's coming along, or undefined
   * when transcripts are off.
   */
  transcript(
    source: string,
  ): { readonly words: readonly TranscriptWord[]; readonly madeAt: number } | string | undefined;
  /** Put the playhead here, in the root's time. */
  seek(rootMs: number): void;
  /** Select this clip, as clicking it on the timeline does. */
  selectClip(clip: SoundClip): void;
  /** The sound clip that's selected, if any. */
  selectedClip(): SoundClip | undefined;
  /**
   * Cut `fromMs`–`toMs` (the owner's time) out of `clip`.  See
   * `cutOutOfSoundClip()`.
   */
  cutOut(target: TranscriptViewClip, fromMs: number, toMs: number, closeGap: boolean): void;
};

/** One word on screen. */
type ViewWord = {
  readonly word: TranscriptWord;
  readonly target: TranscriptViewClip;
  /** False for a word the clip doesn't play:  trimmed off, or cut out. */
  readonly played: boolean;
  /** The word's times in the root's time. */
  readonly startMs: number;
  readonly endMs: number;
  readonly cutBeforeMs: number;
  readonly cutAfterMs: number;
  readonly element: HTMLSpanElement;
};

// MARK: Settings

/** Remembered per browser.  Off by default:  it's clutter until you want it. */
const SHOW_CUT_KEY = "transcriptView.showCut";
const CLOSE_GAP_KEY = "transcriptView.closeGap";

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Remembering is only a convenience.
  }
}

// MARK: Words

/** A pause this long starts a new paragraph. */
const PARAGRAPH_PAUSE_MS = 1000;

function seconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/** The hover text:  everything known about the word. */
function describe(view: Omit<ViewWord, "element">): string {
  const { word, target, played } = view;
  const kind =
    word.timing === "letters"
      ? "Whisper left this out; the letter model heard it"
      : word.timing === "whisper"
        ? "Whisper's word and Whisper's rough times"
        : "Whisper's word, timed by the letter model";
  const owner = target.owner.userEditableDescription ?? target.owner.description;
  const flag = wordFlag(word);
  return [
    `“${word.text}”  ${played ? "" : "(not played:  trimmed or cut out)"}`.trim(),
    ...(flag === "left out"
      ? ["⚠ Probably a mistake:  a repeat, a false start or an um."]
      : flag === "doubtful"
        ? ["⚠ Worth a listen:  the letter model heard something else."]
        : []),
    kind,
    `heard:  “${word.heard ?? ""}”`,
    `confidence:  ${word.confidence.toFixed(2)}`,
    `video:  ${seconds(view.startMs)}–${seconds(view.endMs)} s  (cut points ${seconds(view.cutBeforeMs)}–${seconds(view.cutAfterMs)})`,
    `file:  ${seconds(word.startMs)}–${seconds(word.endMs)} s`,
    `clip:  ${owner} · ${target.clip.notes || target.clip.source}`,
  ].join("\n");
}

/**
 * How the playhead is marked:  the CSS class for the word the playhead is in,
 * or, like a text cursor, a bar in the gap just after or just before it.
 */
const PLAYHEAD_CLASSES = {
  in: "current",
  after: "playhead-after",
  before: "playhead-before",
} as const;

// MARK: The view

/**
 * The transcript as readable text:  the other way to look at the timeline's
 * sound clips.  One paragraph per clip, in order of time, with a new
 * paragraph at long pauses.
 *
 * * **Follows the playhead.**  The word being spoken is highlighted.  While
 *   playing, the view scrolls to keep it in sight, but only if it was in sight
 *   a moment ago:  scroll away to read, and it leaves you alone.  When it's out
 *   of sight, an arrow at the top or bottom says which way it is; click it to
 *   go there and follow again.
 * * **Click a word** to select its clip and put the playhead just before it.
 *   Dragging selects text instead, for copying.  Cmd+F works.
 * * **Hover a word** for everything known about it.
 * * **What Whisper left out** is shown in [brackets] on red, and **words
 *   worth a listen** on orange.  The timeline uses the same colors.  See
 *   `wordFlag()`.
 * * **Show cut words** adds, dimmed and struck through, the parts of each file
 *   that no clip plays, right where they were cut.
 * * **✂ Cut out** removes the selected words from their clip.
 *
 * Everything is rebuilt only when the clips or transcripts change; each frame
 * just moves the highlight.
 */
export class TranscriptView {
  readonly element: HTMLDivElement;
  readonly #scroll: HTMLDivElement;
  readonly #status: HTMLSpanElement;
  readonly #showCut: HTMLInputElement;
  readonly #cutButton: HTMLButtonElement;
  readonly #jumpUp: HTMLButtonElement;
  readonly #jumpDown: HTMLButtonElement;

  /** Played words in order of time, for finding the playhead. */
  #played: ViewWord[] = [];
  /** Every word on screen, in the order shown. */
  #all: ViewWord[] = [];
  readonly #byElement = new Map<Element, ViewWord>();
  readonly #clipElements = new Map<SoundClip, HTMLElement>();
  #key = "";

  /** Where the playhead is:  the word being spoken, or in a pause, the last word before it. */
  #current: ViewWord | undefined;
  /** The word carrying the playhead mark, and which mark.  See {@link PLAYHEAD_CLASSES}. */
  #marked: { readonly view: ViewWord; readonly className: string } | undefined;
  /** For following the playhead:  was its word in sight at the last update? */
  #wasVisible = true;
  #wasPlaying = false;
  /** Scroll events before this time came from us, not the user. */
  #ourScrollUntil = 0;
  #playMs = 0;

  constructor(private readonly hooks: TranscriptViewHooks) {
    this.element = document.createElement("div");
    this.element.id = "transcriptView";

    const toolbar = document.createElement("div");
    toolbar.className = "tv-toolbar";
    const showCutLabel = document.createElement("label");
    showCutLabel.title =
      "Also show, dimmed and struck through, the parts of each file that no clip plays:  " +
      "what was trimmed off or cut out, right where it was.";
    this.#showCut = document.createElement("input");
    this.#showCut.type = "checkbox";
    this.#showCut.checked = readFlag(SHOW_CUT_KEY, false);
    this.#showCut.addEventListener("input", () => {
      writeFlag(SHOW_CUT_KEY, this.#showCut.checked);
      this.#key = "";
      this.update(this.#playMs, false);
    });
    showCutLabel.append(this.#showCut, " Show cut words");
    this.#cutButton = document.createElement("button");
    this.#cutButton.type = "button";
    this.#cutButton.textContent = "✂ Cut out";
    this.#cutButton.disabled = true;
    this.#cutButton.addEventListener("click", () => void this.#cutSelection());
    this.#status = document.createElement("span");
    this.#status.className = "tv-status";
    toolbar.append(showCutLabel, this.#cutButton, this.#status);

    const body = document.createElement("div");
    body.className = "tv-body";
    this.#scroll = document.createElement("div");
    this.#scroll.className = "tv-scroll";
    this.#jumpUp = this.#makeJump("↑ playhead", "tv-jump up");
    this.#jumpDown = this.#makeJump("↓ playhead", "tv-jump down");
    body.append(this.#scroll, this.#jumpUp, this.#jumpDown);
    this.element.append(toolbar, body);

    this.#scroll.addEventListener("click", (event) => this.#click(event));
    this.#scroll.addEventListener("scroll", () => {
      if (performance.now() < this.#ourScrollUntil) return;
      // The user scrolled.  Following resumes once the playhead's word is back in sight.
      this.#wasVisible = this.#current ? this.#isVisible(this.#current) : true;
    });
    let selectionPending = false;
    document.addEventListener("selectionchange", () => {
      if (selectionPending || this.element.hidden) return;
      selectionPending = true;
      requestAnimationFrame(() => {
        selectionPending = false;
        this.#drawCutButton();
      });
    });
  }

  #makeJump(text: string, className: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.title = "Scroll to the playhead, and follow it again while playing.";
    button.hidden = true;
    button.addEventListener("click", () => {
      if (this.#current) this.#scrollTo(this.#current);
      this.#wasVisible = true;
    });
    return button;
  }

  get hidden(): boolean {
    return this.element.hidden === true;
  }

  set hidden(hidden: boolean) {
    this.element.hidden = hidden;
    if (!hidden) {
      // Show where the playhead is right away.
      this.#wasPlaying = false;
      this.#wasVisible = true;
    }
  }

  /**
   * Call every frame.  Rebuilds if the clips or their transcripts changed,
   * then moves the highlight and, while playing, follows the playhead.
   * @param playMs The playhead, in the root's time.
   * @param playing True while playing.
   */
  update(playMs: number, playing: boolean): void {
    if (this.element.hidden) return;
    this.#playMs = playMs;
    this.#rebuildIfNeeded();
    this.#drawSelectedClip();
    const { anchor, side } = this.#wordAt(playMs);
    const className = side && PLAYHEAD_CLASSES[side];
    if (anchor !== this.#marked?.view || className !== this.#marked?.className) {
      this.#marked?.view.element.classList.remove(this.#marked.className);
      if (anchor && className) anchor.element.classList.add(className);
      this.#marked = anchor && className ? { view: anchor, className } : undefined;
    }
    this.#current = anchor;
    if (!anchor) {
      this.#jumpUp.hidden = this.#jumpDown.hidden = true;
      this.#wasPlaying = playing;
      return;
    }
    let visible = this.#isVisible(anchor);
    // Follow only if it was in sight a moment ago, or playback just started.
    if (playing && !visible && (this.#wasVisible || !this.#wasPlaying)) {
      this.#scrollTo(anchor);
      visible = true;
    }
    this.#wasVisible = visible;
    this.#wasPlaying = playing;
    const above = !visible && this.#isAbove(anchor);
    this.#jumpUp.hidden = visible || !above;
    this.#jumpDown.hidden = visible || above;
  }

  // MARK: Building

  #rebuildIfNeeded(): void {
    const clips = this.hooks.clips();
    const transcripts = clips.map(({ clip }) => this.hooks.transcript(clip.source));
    const key = JSON.stringify([
      this.#showCut.checked,
      clips.map(({ clip, startMs, lengthMs }, i) => {
        const t = transcripts[i];
        return [
          clip.source,
          startMs,
          clip.startMsIntoClip ?? 0,
          lengthMs ?? null,
          clip.notes ?? "",
          typeof t === "object" ? t.madeAt : (t ?? null),
        ];
      }),
    ]);
    if (key === this.#key) return;
    this.#key = key;
    this.#build(clips, transcripts);
  }

  #build(
    clips: readonly TranscriptViewClip[],
    transcripts: ReturnType<TranscriptViewHooks["transcript"]>[],
  ): void {
    this.#scroll.replaceChildren();
    this.#played = [];
    this.#all = [];
    this.#byElement.clear();
    this.#clipElements.clear();
    this.#current = undefined;
    this.#marked = undefined;

    if (clips.length === 0) {
      this.#status.textContent = "No sound clips here.";
      return;
    }
    if (transcripts.every((t) => t === undefined)) {
      this.#status.textContent = "Transcripts are off.  Turn on 🗣 Transcripts.";
      return;
    }
    this.#status.textContent = "";

    /** The file range each clip plays. */
    const range = (target: TranscriptViewClip) => {
      const from = target.clip.startMsIntoClip ?? 0;
      return { from, to: target.lengthMs === undefined ? Infinity : from + target.lengthMs };
    };
    const plays = (target: TranscriptViewClip, word: TranscriptWord) => {
      const { from, to } = range(target);
      return word.endMs > from && word.startMs < to;
    };

    // Each clip's words:  the ones it plays, plus, with Show cut words, the
    // words of its file that no clip plays.  Each of those is shown once:
    // just before the first clip (in the file) that starts after it, or else
    // after the clip that ends last before it.
    const wordsFor = new Map<TranscriptViewClip, { word: TranscriptWord; played: boolean }[]>();
    for (const target of clips) wordsFor.set(target, []);
    const sources = new Set(clips.map(({ clip }) => clip.source));
    for (const source of sources) {
      const index = clips.findIndex(({ clip }) => clip.source === source);
      const transcript = transcripts[index];
      if (typeof transcript !== "object") continue;
      const ofFile = clips.filter(({ clip }) => clip.source === source);
      for (const word of transcript.words) {
        const playing = ofFile.filter((target) => plays(target, word));
        for (const target of playing) wordsFor.get(target)!.push({ word, played: true });
        if (playing.length > 0 || !this.#showCut.checked) continue;
        const after = ofFile
          .filter((target) => range(target).from >= word.endMs)
          .sort((a, b) => range(a).from - range(b).from)[0];
        const before = ofFile
          .filter((target) => range(target).to <= word.startMs)
          .sort((a, b) => range(b).to - range(a).to)[0];
        const home = after ?? before;
        if (home) wordsFor.get(home)!.push({ word, played: false });
      }
    }

    clips.forEach((target, i) => {
      const section = document.createElement("div");
      section.className = "tv-clip";
      const head = document.createElement("div");
      head.className = "tv-clip-head";
      const owner = target.owner.userEditableDescription ?? target.owner.description;
      const name = target.clip.notes || decodeURIComponent(target.clip.source.split("/").pop() ?? "");
      head.textContent = `${seconds(target.startMs)} s · ${owner} · ${name}`;
      head.title = "Click to select this clip.";
      head.addEventListener("click", () => this.hooks.selectClip(target.clip));
      section.append(head);
      this.#clipElements.set(target.clip, section);

      const transcript = transcripts[i];
      if (typeof transcript !== "object") {
        const note = document.createElement("div");
        note.className = "tv-note";
        note.textContent = transcript || "transcript not ready";
        section.append(note);
        this.#scroll.append(section);
        return;
      }
      const words = wordsFor.get(target)!.sort((a, b) => a.word.startMs - b.word.startMs);
      if (words.length === 0) {
        const note = document.createElement("div");
        note.className = "tv-note";
        note.textContent = "(no words)";
        section.append(note);
      }
      const shift = target.startMs - range(target).from;
      let paragraph: HTMLParagraphElement | undefined;
      let previousEnd = -Infinity;
      for (const { word, played } of words) {
        if (!paragraph || word.startMs - previousEnd > PARAGRAPH_PAUSE_MS) {
          paragraph = document.createElement("p");
          paragraph.className = "tv-para";
          section.append(paragraph);
        } else {
          paragraph.append(" ");
        }
        previousEnd = word.endMs;
        const element = document.createElement("span");
        element.className = "tv-word";
        const flag = wordFlag(word);
        if (flag === "left out") element.classList.add("recovered");
        if (flag === "doubtful") element.classList.add("doubtful");
        if (!played) element.classList.add("cut");
        element.textContent = word.timing === "letters" ? `[${word.text}]` : word.text;
        const view = {
          word,
          target,
          played,
          startMs: word.startMs + shift,
          endMs: word.endMs + shift,
          cutBeforeMs: word.cutBeforeMs + shift,
          cutAfterMs: word.cutAfterMs + shift,
        };
        element.title = describe(view);
        const viewWord: ViewWord = { ...view, element };
        paragraph.append(element);
        this.#all.push(viewWord);
        this.#byElement.set(element, viewWord);
        if (played) this.#played.push(viewWord);
      }
      this.#scroll.append(section);
    });
    this.#played.sort((a, b) => a.cutBeforeMs - b.cutBeforeMs);
    this.#drawCutButton();
  }

  #drawSelectedClip(): void {
    const selected = this.hooks.selectedClip();
    for (const [clip, element] of this.#clipElements) {
      element.classList.toggle("selected", clip === selected);
    }
  }

  // MARK: The playhead

  /**
   * Where `ms` is in the words.
   * * `anchor`:  the last word whose cut point has passed, or the first word
   *   before any have.  This is what scrolling, the arrows and the playhead
   *   mark go by.
   * * `side`:  whether `ms` is inside the anchor, in the pause after it, or
   *   before it (only before the very first word).
   */
  #wordAt(ms: number): { anchor?: ViewWord; side?: keyof typeof PLAYHEAD_CLASSES } {
    const words = this.#played;
    let low = 0;
    let high = words.length - 1;
    let found: ViewWord | undefined;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (words[middle].cutBeforeMs <= ms) {
        found = words[middle];
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (!found) return words.length ? { anchor: words[0], side: "before" } : {};
    return { anchor: found, side: ms < found.cutAfterMs ? "in" : "after" };
  }

  #isVisible(view: ViewWord): boolean {
    const word = view.element.getBoundingClientRect();
    const box = this.#scroll.getBoundingClientRect();
    return word.bottom > box.top && word.top < box.bottom;
  }

  #isAbove(view: ViewWord): boolean {
    return view.element.getBoundingClientRect().top < this.#scroll.getBoundingClientRect().top;
  }

  /** Bring a word into sight, a third of the way down, so there's room to read ahead. */
  #scrollTo(view: ViewWord): void {
    const word = view.element.getBoundingClientRect();
    const box = this.#scroll.getBoundingClientRect();
    this.#ourScrollUntil = performance.now() + 150;
    this.#scroll.scrollTop += word.top - box.top - box.height / 3;
  }

  // MARK: Clicking and selecting

  #click(event: MouseEvent): void {
    // A drag that selected text is for copying, not seeking.
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed) return;
    const element = (event.target as Element).closest(".tv-word");
    const view = element && this.#byElement.get(element);
    if (!view || !view.played) return;
    this.hooks.selectClip(view.target.clip);
    this.hooks.seek(view.cutBeforeMs);
  }

  /** The played words the selection touches. */
  #selectedWords(): ViewWord[] {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return [];
    const range = selection.getRangeAt(0);
    if (!this.#scroll.contains(range.commonAncestorContainer)) return [];
    return this.#all.filter((view) => view.played && range.intersectsNode(view.element));
  }

  #drawCutButton(): void {
    const words = this.#selectedWords();
    const clips = new Set(words.map((view) => view.target));
    const button = this.#cutButton;
    if (words.length === 0) {
      button.disabled = true;
      button.title = "Select some words, then click here to cut them out of their clip.";
    } else if (clips.size > 1) {
      button.disabled = true;
      button.title = "The selection covers more than one clip.  Cut one clip at a time.";
    } else {
      button.disabled = false;
      button.title = `Cut ${words.length} word${words.length === 1 ? "" : "s"} out of this clip, quiet moment to quiet moment.`;
    }
  }

  async #cutSelection(): Promise<void> {
    const words = this.#selectedWords();
    const targets = new Set(words.map((view) => view.target));
    if (words.length === 0 || targets.size !== 1) return;
    const [target] = targets;
    const first = words[0];
    const last = words[words.length - 1];
    const { clip } = target;
    // Owner time:  where the clip starts in its owner, plus how far into the clip.
    const toOwner = (fileMs: number) => clip.startMsIntoScene + (fileMs - (clip.startMsIntoClip ?? 0));
    const fromMs = toOwner(first.word.cutBeforeMs);
    const toMs = toOwner(last.word.cutAfterMs);
    const closeGap = await askHowToCut(
      words.map((view) => view.element.textContent).join(" "),
      toMs - fromMs,
    );
    if (closeGap === undefined) return;
    document.getSelection()?.removeAllRanges();
    this.hooks.cutOut(target, fromMs, toMs, closeGap);
  }
}

// MARK: The cut dialog

/**
 * Confirm a cut, and ask whether to close the gap.
 * @returns true to close the gap, false to leave it, undefined to cancel.
 */
function askHowToCut(text: string, lengthMs: number): Promise<boolean | undefined> {
  const dialog = document.createElement("dialog");
  dialog.style.cssText = "min-width:26em;max-width:40em;padding:1em";
  const heading = document.createElement("h3");
  heading.style.margin = "0 0 0.4em 0";
  heading.textContent = "✂ Cut Out Words";
  const quote = document.createElement("div");
  quote.style.cssText =
    "margin-bottom:0.6em;padding:0.4em;background:#f4f4f4;border-radius:3px;max-height:8em;overflow:auto";
  quote.textContent = `“${text}”`;
  const length = document.createElement("div");
  length.style.cssText = "font-size:0.85em;color:#555;margin-bottom:0.6em";
  length.textContent = `${(lengthMs / 1000).toFixed(3)} s, from the quiet moment before the first word to the quiet moment after the last.`;

  const fieldset = document.createElement("fieldset");
  fieldset.style.cssText = "margin:0 0 1em 0";
  const legend = document.createElement("legend");
  legend.textContent = "Afterwards";
  fieldset.append(legend);
  const closeGapChecked = readFlag(CLOSE_GAP_KEY, true);
  const radio = (value: boolean, label: string, title: string) => {
    const wrapper = document.createElement("label");
    wrapper.style.cssText = "display:block";
    wrapper.title = title;
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "transcriptCutGap";
    input.checked = value === closeGapChecked;
    wrapper.append(input, " ", label);
    fieldset.append(wrapper);
    return input;
  };
  const closeInput = radio(
    true,
    "Close the gap:  the rest of this clip moves earlier",
    "Only the rest of this clip moves.  Other sound clips and the picture stay where they are.",
  );
  radio(false, "Leave a gap of silence", "Nothing moves.");

  const buttons = document.createElement("div");
  buttons.style.cssText = "display:flex;gap:0.5em;justify-content:flex-end";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "Cut";
  buttons.append(cancelBtn, okBtn);
  dialog.append(heading, quote, length, fieldset, buttons);

  let result: boolean | undefined;
  okBtn.addEventListener("click", () => {
    result = closeInput.checked;
    writeFlag(CLOSE_GAP_KEY, result);
    dialog.close();
  });
  cancelBtn.addEventListener("click", () => dialog.close());
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(result);
    });
    document.body.append(dialog);
    dialog.showModal();
    okBtn.focus();
  });
}
