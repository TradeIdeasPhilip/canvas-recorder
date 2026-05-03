import { MakeShowableInSeries, Showable } from "./showable";

const DURATION_MS = 10_000;

const circles = [
  { cx: 4, cy: 2, r: 2, rgb: [220, 50, 50] },
  { cx: 12, cy: 2, r: 2, rgb: [50, 200, 50] },
  { cx: 4, cy: 7, r: 2, rgb: [50, 100, 220] },
  { cx: 12, cy: 7, r: 2, rgb: [0, 0, 0] },
];

/**
 * This is a minimal test to prove that we can produce a movie with an alpha channel.
 *
 * Note that the web version of this program cannot save files with an alpha channel.
 * You need to use the node version of this program to properly create this video.
 */
const scene: Showable = {
  description: "Alpha test — 4 circles",
  duration: DURATION_MS,
  show({ context, timeInMs }) {
    // Canvas is already cleared to transparent by context.reset() in the harness.
    const angle = (timeInMs / DURATION_MS) * 2 * Math.PI;

    for (const { cx, cy, r, rgb } of circles) {
      const [R, G, B] = rgb;
      const opaque = `rgb(${R}, ${G}, ${B})`;

      // Clipped gradient fill with rotating direction
      context.save();
      context.beginPath();
      context.arc(cx, cy, r, 0, 2 * Math.PI);
      context.clip();
      context.translate(cx, cy);
      context.rotate(angle);
      const gradient = context.createLinearGradient(-r, 0, r, 0);
      gradient.addColorStop(0, `rgba(${R}, ${G}, ${B}, 0.8)`);
      gradient.addColorStop(1, `rgba(${R}, ${G}, ${B}, 0)`);
      context.fillStyle = gradient;
      context.fillRect(-r, -r, 2 * r, 2 * r);
      context.restore();

      // Thick opaque stroke
      context.beginPath();
      context.arc(cx, cy, r, 0, 2 * Math.PI);
      context.strokeStyle = opaque;
      context.lineWidth = 0.15;
      context.stroke();
    }
  },
};

const slideList = new MakeShowableInSeries("Alpha test");
slideList.add(scene);

export const alphaTest = slideList.build();
