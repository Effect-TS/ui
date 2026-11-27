/**
 * Where the runtime runs its work: the Scheduler its fibers (Commands,
 * Subscriptions, Layer builds, mounts) use, and how it queues the render flush.
 * `TestHost` swaps in a queue that `settle` drains.
 *
 * @internal
 */
import * as Context from "effect/Context"
import type * as Scheduler from "effect/Scheduler"

/** @internal */
export interface Executor {
  /** The Scheduler for the runtime's fibers, or `undefined` to keep the caller's. */
  readonly scheduler: Scheduler.Scheduler | undefined
  /** Queues the render flush. */
  readonly schedule: (task: () => void) => void
}

/** @internal */
export const microtask: Executor = {
  scheduler: undefined,
  schedule: (task) => {
    Promise.resolve().then(task)
  }
}

/** @internal */
export const CurrentExecutor = Context.Reference<Executor>(
  "@effect/ui/internal/Executor",
  {
    defaultValue: () => microtask
  }
)

/**
 * Where a queued render flush goes among the fiber tasks: in its turn, before
 * all of them, after all of them and the tasks they queue, or at a place a
 * seeded generator picks.
 *
 * @internal
 */
export type Flush = "queued" | "first" | "last" | { readonly seed: number }

interface Task {
  readonly task: () => void
  readonly priority: number
}

/**
 * One queue for every fiber task and the render flush, ordered by priority
 * and then FIFO. The tree's tasks run only when it's drained.
 *
 * @internal
 */
export class TestExecutor implements Executor, Scheduler.SchedulerDispatcher {
  private tasks: Array<Task> = []
  private random: number
  readonly flushes: Flush
  readonly scheduler: Scheduler.Scheduler
  constructor(flushes: Flush = "queued") {
    this.flushes = flushes
    this.random = typeof flushes === "string" ? 0 : flushes.seed >>> 0
    this.scheduler = {
      executionMode: "sync",
      shouldYield: (fiber) =>
        fiber.currentOpCount >= fiber.cache.maxOpsBeforeYield,
      makeDispatcher: () => this
    }
  }
  schedule(task: () => void): void {
    const flushes = this.flushes
    if (flushes === "queued") return this.scheduleTask(task, 0)
    // Outside the priorities: every task goes behind `-Infinity` and ahead of `Infinity`, whenever it's queued.
    if (typeof flushes === "string") {
      return this.scheduleTask(task, flushes === "first" ? -Infinity : Infinity)
    }
    this.tasks.splice(this.next(this.tasks.length + 1), 0, {
      task,
      priority: -Infinity
    })
  }
  /** mulberry32: the same seed gives the same places. */
  private next(below: number): number {
    let t = this.random = (this.random + 0x6D2B79F5) >>> 0
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * below)
  }
  scheduleTask(task: () => void, priority: number): void {
    this.queue({ task, priority })
  }
  private queue(entry: Task): void {
    let index = this.tasks.length
    while (index > 0 && this.tasks[index - 1]!.priority > entry.priority) {
      index--
    }
    this.tasks.splice(index, 0, entry)
  }
  /**
   * The Scheduler for fibers outside the tree. Their tasks join the queue, so
   * a drain runs them in turn with the tree's, and each also gets a task on a
   * dispatcher of `wake`, which runs it if no drain has.
   */
  outside(wake: Scheduler.Scheduler): Scheduler.Scheduler {
    const woken = wake.makeDispatcher()
    const dispatcher: Scheduler.SchedulerDispatcher = {
      scheduleTask: (task, priority) => {
        const entry: Task = { task, priority }
        this.queue(entry)
        woken.scheduleTask(() => {
          // Gone when a drain ran it first.
          const index = this.tasks.indexOf(entry)
          if (index < 0) return
          this.tasks.splice(index, 1)
          task()
        }, priority)
      },
      flush: () => woken.flush()
    }
    return {
      executionMode: wake.executionMode,
      shouldYield: (fiber) => wake.shouldYield(fiber),
      makeDispatcher: () => dispatcher
    }
  }
  flush(): void {
    this.drain(Infinity)
  }
  /** Runs queued tasks, and the tasks they queue, until none are left or the budget runs out. Returns whether it finished. */
  drain(budget: number): boolean {
    let steps = 0
    while (this.tasks.length > 0) {
      if (steps++ >= budget) return false
      this.tasks.shift()!.task()
    }
    return true
  }
  get size(): number {
    return this.tasks.length
  }
}
