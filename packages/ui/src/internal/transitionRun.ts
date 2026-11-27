import { defer } from "./due.ts"
import * as Kernel from "./kernel.ts"

class Running implements Kernel.Transitions {
  readonly tree: Kernel.Tree
  readonly start: (update: () => void, types: ReadonlyArray<string>) => void
  types: Set<string> | undefined = undefined
  holding = false
  starting = false
  stilled = false
  waiting: Array<() => void> = []
  constructor(
    tree: Kernel.Tree,
    start: (update: () => void, types: ReadonlyArray<string>) => void
  ) {
    this.tree = tree
    this.start = start
  }
  request(types: ReadonlyArray<string>): void {
    if (this.holding) return
    const set = this.types ??= new Set()
    for (const type of types) set.add(type)
  }
  still(): void {
    this.stilled = true
    // A flush always follows, so the flag never outlives the navigation.
    Kernel.wake(this.tree)
  }
  waits(inst: Kernel.Instance): boolean {
    if (!this.holding && this.types === undefined) return false
    for (let at = inst.parent; at !== undefined; at = at.parent) {
      if (at.dirty) return true
    }
    return false
  }
  wait(f: () => void): void {
    this.waiting.push(f)
  }
  hold(): boolean {
    const types = this.types
    const stilled = this.stilled
    this.stilled = false
    if (types === undefined) return false
    this.types = undefined
    this.holding = this.starting = true
    // Stilled, the flush goes on as when the host declines to animate.
    if (stilled) this.resume()
    else this.start(() => this.resume(), [...types])
    this.starting = false
    return this.holding
  }
  settle(): void {
    this.types = undefined
    this.resume()
  }
  resume(): void {
    if (!this.holding) return
    this.holding = false
    const tree = this.tree
    if (tree.closed) return
    const waiting = this.waiting
    this.waiting = []
    for (let index = 0; index < waiting.length; index++) {
      defer(tree, waiting[index]!)
    }
    if (!this.starting) Kernel.flush(tree)
  }
}

/** @internal */
export const make =
  (start: (update: () => void, types: ReadonlyArray<string>) => void) =>
  (tree: Kernel.Tree): Kernel.Transitions => new Running(tree, start)
