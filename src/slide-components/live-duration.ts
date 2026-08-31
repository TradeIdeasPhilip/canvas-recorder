import { InParallelComponent, ParallelChildInfo } from "./in-parallel";

/**
 * This is a convenient base class for any component that wants to have children.
 * It takes care of the interfaces and implementation of having children.
 *
 * The duration is an input.
 * The constructor takes an initial value and it can be changed with setDuration();
 * See {@link ComponentWithFixedDuration} if you want the duration to be immutable.
 *
 * A subclass can override show() and call super.show() whenever it is time to display the children.
 * Or override showChild() to make changes to the way we display specific children or to mix other operation in between showing various children.
 */
export class ComponentWithLiveDuration extends InParallelComponent {
  #requestedDuration: number;
  setDuration(newDuration: number) {
    // It is explicitly assumed that a component can clamp this value into range.
    newDuration = Math.max(0, newDuration);
    if (newDuration != this.#requestedDuration) {
      this.#requestedDuration = newDuration;
      this.scheduleHasChanged();
    }
  }
  protected override recomputeDuration(children: readonly ParallelChildInfo[]) {
    return this.#requestedDuration;
  }
  constructor(description: string, duration: number) {
    super(description);
    this.#requestedDuration = duration;
  }
}
