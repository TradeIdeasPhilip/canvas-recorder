import { FIGURE_SPACE } from "phil-lib/misc";
import { ShowOptions } from "../showable";
import { TraditionalTextComponent } from "./traditional-text";

/**
 * This component displays text like "0:00  0/60" to tell you the current timeInMs of this component.
 * That's minutes, seconds and (ideal) frames.
 * Values less than 0 are preceded by a negative sign.
 * Values greater than the component's duration are preceded by a plus sign.
 *
 * This component is aimed at development and debugging.
 */
export class FrameCounter extends TraditionalTextComponent {
  constructor(
    initialValues: Omit<
      NonNullable<ConstructorParameters<typeof TraditionalTextComponent>[0]>,
      "text"
    > = {},
  ) {
    initialValues.registryKey ??= "Frame Counter";
    initialValues.description ??= "Frame Counter";
    // A fixed width font so things don't jump around on the screen.
    initialValues.fontFamily ??= "Source Code Pro";
    // These are numbers and I don't know the largest number so I can't reserve space for it.
    // Right justify everything, like we normally do with numbers.
    initialValues.textAlign ??= "right";
    super(initialValues);
    this.hideSchedule(this.textSchedule);
  }
  override show(options: ShowOptions): void {
    let text = "";
    const timeInMs = options.timeInMs;
    if (timeInMs < 0) {
      text = "-";
    } else if (timeInMs > this.duration) {
      text = "+";
    }
    const minutesAndMore = Math.abs(timeInMs);
    const secondsAndMore = minutesAndMore % 60_000;
    const fractionalSeconds = secondsAndMore % 1_000;
    const minutes = (minutesAndMore - secondsAndMore) / 60_000;
    const seconds = (secondsAndMore - fractionalSeconds) / 1_000;
    // On a healthy system I'd expect the frame to increment by one (modulo 60) on each animation frame.
    // I wouldn't want to rely on that for a number of reasons, but it should per perfect for debugging.
    const frame = Math.floor((fractionalSeconds * 60) / 1_000);
    text += minutes.toLocaleString();
    text += ":";
    text += seconds.toString().padStart(2, "0");
    text += " ";
    text += frame.toString().padStart(2, FIGURE_SPACE);
    text += "/60";
    this.textSchedule.set(text);
    super.show(options);
  }
}
