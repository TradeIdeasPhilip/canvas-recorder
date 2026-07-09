import {
  SlideComponent,
  TRANSFORM_PLACEHOLDERS,
} from "../src/slide-components.ts";

/**
 * Build the Transform Info panel shown at the top of the schedule editor
 * when a {@link SlideComponent} is selected.  Lists active placeholders,
 * validates the template syntax, and links to the CSS transform reference.
 */
export function buildSlideComponentPanel(
  component: SlideComponent,
): HTMLElement {
  const panel = document.createElement("fieldset");
  panel.style.cssText = "border-color:#6a9e6a;margin-bottom:0.4em";
  const legend = document.createElement("legend");
  legend.textContent = "Transform Info";
  panel.append(legend);

  const template = component.transformTemplate.value;

  const usedEl = document.createElement("div");
  usedEl.textContent = "Placeholders: " + TRANSFORM_PLACEHOLDERS.join("  ");
  usedEl.style.cssText = "margin-bottom:0.3em;letter-spacing:0.1em";
  panel.append(usedEl);

  const testWith = (v: string) =>
    TRANSFORM_PLACEHOLDERS.reduce((s, p) => s.replaceAll(p, v), template);
  const statusEl = document.createElement("div");
  try {
    // Test with both 0 and 1: rotate(0) is valid but rotate(1) is not,
    // catching templates like "rotate(𝓐)" that are missing the "deg" unit.
    new DOMMatrixReadOnly(testWith("0") || "none");
    new DOMMatrixReadOnly(testWith("1") || "none");
    statusEl.textContent = "✓ Valid";
    statusEl.style.color = "green";
  } catch {
    statusEl.textContent = "✗ Syntax error";
    statusEl.style.color = "red";
  }
  panel.append(statusEl);

  const helpEl = document.createElement("div");
  helpEl.style.cssText = "font-size:0.85em;color:#666;margin-top:0.5em";
  helpEl.textContent =
    "By default the video is 16px wide and 9px tall. Other length units are not well defined.";
  const linkEl = document.createElement("a");
  linkEl.href =
    "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform";
  linkEl.textContent = "CSS transform reference ↗";
  linkEl.target = "_blank";
  linkEl.rel = "noopener";
  linkEl.style.cssText = "font-size:0.85em;display:block;margin-top:0.2em";
  panel.append(helpEl, linkEl);

  return panel;
}
