/**
 * Work a feature defers to the flush, run before it renders, and the trees a Router is attached to, whose
 * navigation Commands run there.
 *
 * @internal
 */
import { follow } from "./fork.ts"
import type * as Kernel from "./kernel.ts"

const queues = new WeakMap<Kernel.Tree, Array<() => void>>()

/**
 * The trees a Router is attached to.
 *
 * @internal
 */
export const routed = new WeakSet<Kernel.Tree>()

/**
 * Runs `f` in the flush, before it renders, as what follows from the fact running now. Schedules a flush
 * if none is running or due.
 *
 * @internal
 */
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
  if (tree.flushing || tree.scheduled) return
  tree.scheduled = true
  tree.schedule(() => tree.ops.flush(tree))
}
