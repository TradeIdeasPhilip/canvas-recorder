import { sleep } from "phil-lib/misc";
import "./style.css";
import "./test-rig.css";
import { getById, querySelector, querySelectorAll } from "phil-lib/client-misc";

const iframe = querySelector("iframe", HTMLIFrameElement);
const saveAllButton = getById("saveAll", HTMLButtonElement);

const MENU_URL = "canvas-recorder.html";

async function loadUrl(url: string) {
  iframe.src = url;
  // There's no perfect answer for this.
  // Give each item 2 seconds to load and initialize itself.
  await sleep(2000);
  const result = iframe.contentDocument;
  if (!result) {
    throw new Error(`Unable to load “${url}”`);
  }
  return result;
}

async function getVideoUrls(): Promise<string[]> {
  const iframeDocument = await loadUrl(MENU_URL);
  // Note:  querySelector and querySelectorAll from phil-lib don't work with iframe contents.
  const anchors = [...iframeDocument.querySelectorAll("a")];
  if (anchors.length == 0) {
    // Presumably the page didn't load right.
    throw new Error("No <a> elements found!");
  }
  return anchors.map((anchor) => anchor.href);
}

saveAllButton.addEventListener("click", async () => {
  for (const videoUrl of await getVideoUrls()) {
    const iframeDocument = await loadUrl(videoUrl);
    const buttonToPress = iframeDocument.getElementById("savePropertiesBtn");
    if (!buttonToPress) {
      // Presumably the page didn't load right.
      throw new Error("Can't find “Save All 3” button!");
    }
    buttonToPress.click();
    // Long enough for a person watching to see the status message.
    await sleep(2000);
  }
});
