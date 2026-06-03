import "./style.css";

const webSafeFonts = [
  "Arial",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Times New Roman",
  "Georgia",
  "Garamond",
  "Courier New",
  "Brush Script MT",
];

const requestedFonts = new Set([...await document.fonts.ready].map((ff) => ff.family))
  .values()
  .toArray();
console.log(requestedFonts)

const ul = document.createElement("ul");
document.body.append(ul);
[...webSafeFonts, ...requestedFonts].forEach((fontFamily) => {
  const li = document.createElement("li");
  ul.append(li);
  li.style.fontFamily = fontFamily;
  const span = document.createElement("span");
  span.textContent = fontFamily;
  const italicSpan = document.createElement("span");
  italicSpan.style.fontStyle = "italic";
  italicSpan.textContent = "italic";
  const obliqueSpan = document.createElement("span");
  obliqueSpan.style.fontStyle = "oblique";
  obliqueSpan.textContent = "oblique";
  const normalNumberSpan = document.createElement("span");
  const tabularNumberSpan = document.createElement("span");
  tabularNumberSpan.style.fontVariantNumeric = "tabular-nums";
  normalNumberSpan.textContent = tabularNumberSpan.textContent = "111888";
  const reversedNumberSpan = document.createElement("span");
  reversedNumberSpan.style.fontVariantNumeric = "tabular-nums";
  reversedNumberSpan.textContent = "888111"
  li.append(
    span,
    " ",
    italicSpan,
    " ",
    obliqueSpan,
    document.createElement("br"),
    normalNumberSpan,
    document.createElement("br"),
    tabularNumberSpan,
    document.createElement("br"),
    reversedNumberSpan,
  );
});

console.log([...document.fonts]);
