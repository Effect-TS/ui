import { follow } from "./fork.ts"
import * as Kernel from "./kernel.ts"

const queues = new WeakMap<Kernel.Tree, Array<() => void>>()

/** @internal */
export const routed = new WeakSet<Kernel.Tree>()

/** @internal */
export const defer = (tree: Kernel.Tree, f: () => void): void => {
  let due = queues.get(tree)
  if (due === undefined) {
    const queue: Array<() => void> = due = []
    queues.set(tree, queue)
    const work = tree.work
    tree.work = (idle) => {
      if (queue.length === 0) return work?.(idle) === true
      queue.shift()!()
      return true
    }
  }
  const run = follow(tree)
  due.push(() => run(f))
  Kernel.wake(tree)
}
