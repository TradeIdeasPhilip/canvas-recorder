import { MakeShowableInSeries, Showable } from "../showable";
import { makeShadowDemo, DEFAULT_SLIDE_DURATION_MS } from "../shadow-test";
import { myRainbow } from "../glib/my-rainbow";
import { buildComponents, componentRegistry } from "../slide-components";
import slide1 from "./slide1.json";

const colorfulBox: Showable = {
  description: "Colorful Box",
  duration: 0,
  show({ context }) {
    context.lineWidth = 0.1;
    context.lineCap = "square";
    context.strokeStyle = myRainbow.myBlue;
    context.beginPath();
    context.moveTo(-1, -1);
    context.lineTo(1, -1);
    context.stroke();
    context.strokeStyle = myRainbow.cssBlue;
    context.beginPath();
    context.moveTo(-1, -1);
    context.lineTo(-1, 1);
    context.stroke();
    context.strokeStyle = myRainbow.orange;
    context.beginPath();
    context.moveTo(-1, 1);
    context.lineTo(1, 1);
    context.stroke();
    context.strokeStyle = myRainbow.red;
    context.beginPath();
    context.moveTo(1, -1);
    context.lineTo(1, 1);
    context.stroke();
    context.strokeStyle = myRainbow.magenta;
    context.beginPath();
    context.moveTo(-1, 0);
    context.lineTo(1, 0);
    context.stroke();
    context.strokeStyle = myRainbow.violet;
    context.beginPath();
    context.moveTo(0, -1);
    context.lineTo(0, 1);
    context.stroke();
  },
};

componentRegistry.set("Colorful Box", () => colorfulBox);

function makeEmptySlide(description: string): Showable {
  return {
    description,
    duration: DEFAULT_SLIDE_DURATION_MS,
    components: [],
    show(options) {
      for (const child of this.components!) child.show(options);
    },
  };
}

const slideList = new MakeShowableInSeries("SoME5");

{
  const slide: Showable = {
    description: "Slide 1",
    duration: DEFAULT_SLIDE_DURATION_MS,
    components: buildComponents(slide1),
    show(options) {
      for (const child of this.components!) child.show(options);
    },
  };
  slideList.add(slide);
}

for (let i = 2; i <= 10; i++) {
  slideList.add(makeEmptySlide(`Slide ${i}`));
}

export const some5 = makeShadowDemo({
  base: slideList.build(),
  background: "white",
  dotColor: "#ccc",
  dx: 0.2,
  dy: 0.2,
});
