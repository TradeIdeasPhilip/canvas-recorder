import { LCommand, PathShape } from "./glib/path-shape";
import { MakeShowableInSeries, Showable } from "./showable";
import { strokeColors } from "./stroke-colors";

const SCREEN_ASPECT = 16 / 10;
const CENTER_WIDTH = 9 * SCREEN_ASPECT; // 14.4
const SIDE_WIDTH = (16 - CENTER_WIDTH) / 2; // 0.8
const RIGHT_X = SIDE_WIDTH + CENTER_WIDTH; // 15.2

const DURATION_MS = 10_000;
const A = 7;
const B = 1;
const DELTA = Math.PI / 2;
const STEPS = 600;

function makeLissajousPath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): PathShape {
  const commands = [];
  for (let i = 0; i < STEPS; i++) {
    const t0 = (i / STEPS) * 2 * Math.PI;
    const t1 = ((i + 1) / STEPS) * 2 * Math.PI;
    const x0 = cx + rx * Math.sin(A * t0 + DELTA);
    const y0 = cy + ry * Math.sin(B * t0);
    const x1 = cx + rx * Math.sin(A * t1 + DELTA);
    const y1 = cy + ry * Math.sin(B * t1);
    commands.push(new LCommand(x0, y0, x1, y1));
  }
  return new PathShape(commands);
}

const leftPath = makeLissajousPath(
  SIDE_WIDTH / 2,
  4.5,
  SIDE_WIDTH / 2 * 0.9,
  4.4,
);
const rightPath = makeLissajousPath(
  RIGHT_X + SIDE_WIDTH / 2,
  4.5,
  SIDE_WIDTH / 2 * 0.9,
  4.4,
);

const scene: Showable = {
  description: "Lissajous — side strips",
  duration: DURATION_MS,
  show({ context, timeInMs }) {
    context.fillStyle = "black";
    context.fillRect(0, 0, 16, 9);

    context.lineWidth = 0.025;
    context.lineJoin = "round";
    context.lineCap = "round";

    // 2 complete color cycles over the full duration → seamless loop
    const relativeOffset = (timeInMs / DURATION_MS) * 2;

    // Left strip
    context.save();
    context.beginPath();
    context.rect(0, 0, SIDE_WIDTH, 9);
    context.clip();
    strokeColors({ context, pathShape: leftPath, relativeOffset, repeatCount: 3 });
    context.restore();

    // Right strip
    context.save();
    context.beginPath();
    context.rect(RIGHT_X, 0, SIDE_WIDTH, 9);
    context.clip();
    strokeColors({ context, pathShape: rightPath, relativeOffset, repeatCount: 3 });
    context.restore();


  },
};

const slideList = new MakeShowableInSeries("Lissajous");
slideList.add(scene);

export const lissajous = slideList.build();
