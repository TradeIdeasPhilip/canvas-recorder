import { MakeShowableInSeries, Showable } from "./showable";
import { makeShadowDemo, DEFAULT_SLIDE_DURATION_MS } from "./shadow-test";

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

for (let i = 1; i <= 10; i++) {
  slideList.add(makeEmptySlide(`Slide ${i}`));
}

export const some5 = makeShadowDemo({
  base: slideList.build(),
  background: "white",
  dotColor: "#ccc",
  dx: 0.2,
  dy: 0.2,
});
