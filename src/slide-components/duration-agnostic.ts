import { Scalar } from "../showable";
import { Mutable } from "../utility";
import { InParallelComponent, ParallelChildInfo } from "./in-parallel";

/**
 * I like this as a base class for a lot of generic containers.
 * Like MultiTextComponent where you can already add subcomponents and it is naive to duration.
 * The basic text components have a duration of 0, requesting nothing, but running as long as they are scheduled to run.
 * Like the items added by the Visual Editor.
 * *Any component* can be a parent because that's useful for prototyping.
 * If a custom component is duration agnostic, use this as the base.
 *
 * That said, most of the time we will need to set the duration of a text or rectangle or arrow component.
 * And we might as well take care of that here, in a base class aimed at duration-agnostic components like these.
 * The minDuration property is a nice generic way to allow children to request time or to let the Visual Editor change this.
 * I can see minDuration as something that the Visual Editor eventually looks for and automatically adds a marker on the timeline so the user can drag it.
 * Consider adding {@link Padding} as a parent because it will allow the Visual Editor to change the start time using the timeline.
 */
export class DurationAgnosticComponent extends InParallelComponent {
  readonly minDurationScalar: Scalar<"number">;
  protected override recomputeDuration(children: Mutable<ParallelChildInfo>[]) {
    return Math.max(
      super.recomputeDuration(children),
      this.minDurationScalar.value,
    );
  }
  constructor(description: string) {
    super(description);
    this.minDurationScalar = this.makeNotifyingScalar(
      "number",
      "Min Duration",
      0,
    );
    this.scalars.push(this.minDurationScalar);
  }
}
