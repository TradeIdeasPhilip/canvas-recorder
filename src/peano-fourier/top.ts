import { MakeShowableInSeries } from "../showable";
import { fourierIntro } from "./fourier-intro";
import { peanoFourier } from "./peano-fourier";
import { peanoIterations } from "./peano-iterations";

export const top = MakeShowableInSeries.all("Peano vs. Fourier", [
  peanoIterations,
  fourierIntro,
  peanoFourier,
]);
