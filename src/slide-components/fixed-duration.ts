import { InParallelComponent, ParallelChildInfo } from "./in-parallel";

/**
 * This is a convenient base class for any component that wants to have children.
 * It takes care of the interfaces and implementation of having children.
 *
 * The duration is immutable.
 * The constructor takes an initial value and it can never change;
 * See {@link ComponentWithLiveDuration} or {@link DurationAgnosticComponent} if you want to change the duration in the Visual Editor.
 *
 * TODO the following paragraph is confusing *and* out of date.
 * A subclass override show() and call super.show() whenever it is time to display the children.
 * Or override showChild() to make changes to the way we display specific children or to mix other operation in between showing various children.
 */
export class ComponentWithFixedDuration extends InParallelComponent {
  readonly #requestedDuration: number;
  protected override recomputeDuration(children: readonly ParallelChildInfo[]) {
    return this.#requestedDuration;
  }
  constructor(description: string, duration: number) {
    super(description);
    this.#requestedDuration = duration;
  }
}
