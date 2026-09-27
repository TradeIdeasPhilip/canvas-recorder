import { componentRegistry } from "../src/slide-components/registry.ts";

/** Where the last choice for each purpose is remembered, so the next dialog starts there. */
const STORAGE_PREFIX = "componentPicker.last.";

function readLastChoice(purpose: string): string | undefined {
  try {
    return localStorage.getItem(STORAGE_PREFIX + purpose) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeLastChoice(purpose: string, key: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + purpose, key);
  } catch {
    // Storage can be unavailable (private windows, blocked site data).  Remembering the
    // last choice is only a convenience.
  }
}

/**
 * Ask the user to choose a component from the registry.
 *
 * Shows a modal list of `choices` with the selected item's description beside it.
 * Arrow keys move the selection, Enter or a double-click accepts, Escape cancels.
 *
 * @param options.title The action, e.g. "Insert New Child".
 * @param options.subtitle What it applies to, e.g. `Inside "Scene List"`.
 * @param options.purpose Which remembered choice to start from and update.
 * @param options.choices Registry keys, in display order.
 * @returns The chosen registry key, or undefined if the user cancelled.
 */
export function pickComponent(options: {
  title: string;
  subtitle: string;
  purpose: "insert" | "wrap";
  choices: readonly string[];
}): Promise<string | undefined> {
  const { title, subtitle, purpose, choices } = options;

  const dialog = document.createElement("dialog");
  dialog.className = "component-picker";
  dialog.style.cssText = "min-width:36em;padding:1em";

  const heading = document.createElement("h3");
  heading.style.margin = "0 0 0.2em 0";
  heading.textContent = title;

  const hint = document.createElement("div");
  hint.style.cssText =
    "margin-bottom:0.6em;font-size:0.85em;color:#555;font-style:italic";
  hint.textContent = subtitle;

  const body = document.createElement("div");
  body.style.cssText = "display:flex;gap:0.8em;margin-bottom:1em";

  const list = document.createElement("ul");
  list.tabIndex = 0;
  list.style.cssText =
    "list-style:none;padding:0;margin:0;min-width:14em;max-height:22em;overflow-y:auto;border:1px solid #ccc;border-radius:4px";

  const description = document.createElement("div");
  description.style.cssText =
    "flex:1;min-width:14em;max-width:22em;font-size:0.9em;line-height:1.4";

  body.append(list, description);

  const buttons = document.createElement("div");
  buttons.style.cssText = "display:flex;gap:0.5em;justify-content:flex-end";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "OK";
  buttons.append(cancelBtn, okBtn);

  dialog.append(heading, hint, body, buttons);

  const items = choices.map((key) => {
    const li = document.createElement("li");
    li.textContent = key;
    li.style.cssText =
      "padding:0.35em 0.6em;cursor:pointer;border-bottom:1px solid #eee";
    list.append(li);
    return li;
  });

  let selectedIndex = -1;
  function select(index: number) {
    if (index < 0 || index >= choices.length) return;
    selectedIndex = index;
    items.forEach((li, i) => li.classList.toggle("selected", i === index));
    items[index].scrollIntoView({ block: "nearest" });
    const key = choices[index];
    const name = document.createElement("b");
    name.style.cssText = "font-style:italic;font-family:Bevan,Georgia,serif";
    name.textContent = key;
    const text = document.createElement("p");
    text.style.margin = "0.4em 0 0 0";
    text.textContent =
      componentRegistry.get(key)?.description ?? "(No description yet.)";
    description.replaceChildren(name, text);
  }

  function accept() {
    if (selectedIndex < 0) return;
    dialog.close(choices[selectedIndex]);
  }

  items.forEach((li, i) => {
    li.addEventListener("click", () => select(i));
    li.addEventListener("dblclick", () => {
      select(i);
      accept();
    });
  });
  list.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      select(selectedIndex + 1);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      select(selectedIndex - 1);
      e.preventDefault();
    } else if (e.key === "Enter") {
      accept();
      e.preventDefault();
    }
  });
  okBtn.addEventListener("click", accept);
  cancelBtn.addEventListener("click", () => dialog.close(""));
  okBtn.disabled = choices.length === 0;

  const remembered = readLastChoice(purpose);
  const startAt = remembered === undefined ? -1 : choices.indexOf(remembered);
  select(startAt >= 0 ? startAt : 0);

  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      const key = dialog.returnValue || undefined;
      if (key !== undefined) writeLastChoice(purpose, key);
      dialog.remove();
      resolve(key);
    });
    document.body.append(dialog);
    dialog.showModal();
    list.focus();
  });
}
