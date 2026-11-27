import { defer } from "./due.ts"
import * as Kernel from "./kernel.ts"

class Running implements Kernel.Transitions {
  readonly tree: Kernel.Tree
  readonly start: (update: () => void, types: ReadonlyArray<string>) => void
  types: Set<string> | undefined = undefined
  holding = false
  starting = false
  stilled = 0
  waiting: Array<() => void> = []
  constructor(
    tree: Kernel.Tree,
    start: (update: () => void, types: ReadonlyArray<string>) => void
  ) {
    this.tree = tree
    this.start = start
  }
  request(types: ReadonlyArray<string>): void {
    if (this.holding || this.stilled > 0) return
    const set = this.types ??= new Set()
    for (const type of types) set.add(type)
  }
  still(on: boolean): void {
    if (on) {
      this.stilled++
      this.types = undefined
      if (!this.holding) this.drain(true)
    } else if (this.stilled > 0) {
      this.stilled--
    }
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
    if (types === undefined) return false
    this.types = undefined
    this.holding = this.starting = true
    this.start(() => this.resume(), [...types])
    this.starting = false
    return this.holding
  }
  settle(): void {
    this.types = undefined
    this.resume()
  }
  drain(quiet: boolean): void {
    const tree = this.tree
    if (tree.closed) return
    const waiting = this.waiting
    if (waiting.length === 0) return
    this.waiting = []
    for (let index = 0; index < waiting.length; index++) {
      const f = waiting[index]!
      defer(
        tree,
        quiet
          ? () => {
            this.stilled++
            try {
              f()
            } finally {
              this.stilled--
            }
          }
          : f
      )
    }
  }
  resume(): void {
    if (!this.holding) return
    this.holding = false
    this.drain(false)
    if (!this.starting && !this.tree.closed) Kernel.flush(this.tree)
  }
}

/** @internal */
export const make =
  (start: (update: () => void, types: ReadonlyArray<string>) => void) =>
  (tree: Kernel.Tree): Kernel.Transitions => new Running(tree, start)
