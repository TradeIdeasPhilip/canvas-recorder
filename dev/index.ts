import { assertNonNullable } from "phil-lib/misc.ts";
import { draw } from "../src/top.ts";
import { AnimationLoop, getById } from "phil-lib/client-misc.ts";
import "./style.css";

//document.body.append(magicWords());



const canvas = getById("main", HTMLCanvasElement);
const context = assertNonNullable(canvas.getContext("2d"));

let offset = NaN;
new AnimationLoop((timeInMS: number) => {
  if (isNaN(offset)) {
    offset = timeInMS;
  }
  timeInMS -= offset;
  context.reset();
  draw(timeInMS, context);
});
