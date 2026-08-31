import { ReadOnlyRect } from "phil-lib/misc";
import { makeLineFontRatio } from "../glib/line-font";
import { ParagraphLayout } from "../glib/paragraph-layout";
import {
  ColorScheduleInfo,
  RectangleScheduleInfo,
  StringScheduleInfo,
  NumberScheduleInfo,
  SelectScheduleInfo,
} from "../schedule-helper";
import { ShowOptions } from "../showable";
import { DurationAgnosticComponent } from "./duration-agnostic";
import { Keyframe } from "../interpolate";
import { Font } from "../glib/letters-base";

type CachedFont = {
  readonly font: Font;
  readonly size: number;
  readonly boldness: number;
  readonly obliqueness: number;
};

export class TextComponent extends DurationAgnosticComponent {
  readonly registryKey = "Text";
  readonly colorSchedule = new ColorScheduleInfo("Color", "#888");
  readonly rectSchedule = new RectangleScheduleInfo("Rect", {
    x: 2,
    y: 2,
    width: 6,
    height: 4,
  });
  readonly textSchedule = new StringScheduleInfo("Text", "Type Here");
  readonly sizeSchedule = new NumberScheduleInfo("Size", 1);
  readonly boldnessSchedule = new NumberScheduleInfo("Boldness", 1);
  readonly obliquenessSchedule = new NumberScheduleInfo("Obliqueness", 0);
  readonly alignmentSchedule = new SelectScheduleInfo("Alignment", "left", [
    "left",
    "center",
    "right",
    "justify",
  ]);
  override readonly replaceableComponents = undefined;
  constructor(
    initialValues: {
      description?: string;
      minDuration?: number;
      color?: string | readonly Keyframe<string>[];
      rect?: ReadOnlyRect | readonly Keyframe<ReadOnlyRect>[];
      text?: string | readonly Keyframe<string>[];
      size?: number | readonly Keyframe<number>[];
      boldness?: number | readonly Keyframe<number>[];
      obliqueness?: number | readonly Keyframe<number>[];
      // I have mixed feelings on the complicated type definition.
      // It is exactly what it needs to be, and it avoids any duplicated code or namespace pollution.
      // But it is long and complicated.
      // Final thoughts:  It was only complicated the first time.
      // You could clone this any number of times with different classes and properties.
      alignmentSchedule?: Parameters<
        TextComponent["alignmentSchedule"]["set"]
      >[0];
    } = {},
  ) {
    super(initialValues.description ?? "Text");
    if (initialValues.minDuration !== undefined) {
      this.minDurationScalar.value = initialValues.minDuration;
    }
    this.schedules.push(
      this.colorSchedule,
      this.rectSchedule,
      this.textSchedule,
      this.sizeSchedule,
      this.boldnessSchedule,
      this.obliquenessSchedule,
      this.alignmentSchedule,
    );
    if (initialValues.color !== undefined) {
      this.colorSchedule.set(initialValues.color);
    }
    if (initialValues.rect !== undefined) {
      this.rectSchedule.set(initialValues.rect);
    }
    if (initialValues.text !== undefined) {
      this.textSchedule.set(initialValues.text);
    }
    if (initialValues.size !== undefined) {
      this.sizeSchedule.set(initialValues.size);
    }
    if (initialValues.boldness !== undefined) {
      this.boldnessSchedule.set(initialValues.boldness);
    }
    if (initialValues.obliqueness !== undefined) {
      this.obliquenessSchedule.set(initialValues.obliqueness);
    }
    if (initialValues.alignmentSchedule !== undefined) {
      this.alignmentSchedule.set(initialValues.alignmentSchedule);
    }
  }
  #cachedFont: undefined | CachedFont;
  #cachedPath:
    | undefined
    | {
        readonly cachedFont: CachedFont;
        readonly width: number;
        readonly text: string;
        readonly alignment: TextComponent["alignmentSchedule"]["choices"][0];
        readonly path: Path2D;
      };
  override show(options: ShowOptions) {
    const { context, timeInMs } = options;
    const color = this.colorSchedule.at(timeInMs);
    const rect = this.rectSchedule.at(timeInMs);
    const text = this.textSchedule.at(timeInMs);
    const size = this.sizeSchedule.at(timeInMs);
    const boldness = this.boldnessSchedule.at(timeInMs);
    const obliqueness = this.obliquenessSchedule.at(timeInMs);
    const alignment = this.alignmentSchedule.at(timeInMs);
    context.strokeStyle = color;
    if (
      !this.#cachedFont ||
      this.#cachedFont.size != size ||
      this.#cachedFont.boldness != boldness ||
      this.#cachedFont.obliqueness != obliqueness
    ) {
      const font = makeLineFontRatio(size, boldness).oblique(obliqueness);
      this.#cachedFont = { font, size, boldness, obliqueness };
    }
    if (
      !this.#cachedPath ||
      this.#cachedPath.cachedFont != this.#cachedFont ||
      this.#cachedPath.width != rect.width ||
      this.#cachedPath.text != text ||
      this.#cachedPath.alignment != alignment
    ) {
      const path = ParagraphLayout.singlePathShape({
        font: this.#cachedFont.font,
        text,
        width: rect.width,
        alignment,
      }).canvasPath;
      const cachedFont = this.#cachedFont;
      this.#cachedPath = {
        cachedFont,
        path,
        text,
        width: rect.width,
        alignment,
      };
    }
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = this.#cachedFont.font.strokeWidth;
    const matrix = context.getTransform();
    context.translate(rect.x, rect.y);
    context.stroke(this.#cachedPath.path);
    context.setTransform(matrix);
  }
}
