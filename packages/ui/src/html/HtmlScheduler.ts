/**
 * A Scheduler for the browser, which keeps fiber work from holding up the
 * page's rendering and input.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Duration from "effect/Duration"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Scheduler from "effect/Scheduler"

/**
 * The options of `make` and `layer`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options {
  /**
   * How long one task runs fiber work before it gives the browser a turn:
   * 5 milliseconds by default.
   */
  readonly budget?: Duration.Input | undefined
}

/**
 * Makes a Scheduler that runs fiber work in time slices, in browser tasks.
 *
 * **When to use**
 *
 * Use to run Effects in the page outside `BrowserHost.mount`, which uses one
 * when the caller hasn't provided a Scheduler.
 *
 * **Details**
 *
 * Every fiber shares one queue. A task runs queued fiber work until `budget`
 * is spent, then leaves the rest for the next task, so the browser can render
 * and handle input in between. A fiber running when the task's budget runs
 * out yields, as it does after `Scheduler.MaxOpsBeforeYield` operations.
 * Work queued during a task runs in the next one. A fiber resumed outside a
 * task of this Scheduler, by a `fetch` for example, runs in what is left of
 * the last budget. Once that is spent it starts a budget of its own, unless
 * fiber work is already waiting for a task, in which case it joins that work.
 *
 * Tasks are posted with `scheduler.postTask` where the browser has it,
 * `MessageChannel` otherwise, and `setTimeout` in environments that have
 * neither.
 *
 * Lower priorities run first, and equal ones in the order they were queued.
 * Effect queues everything at priority 0, and `Effect.yieldNowWith(priority)`
 * moves a fiber to another priority. The sign picks how the work competes
 * with the page:
 *
 * | Priority | Runs | `postTask` priority |
 * | --- | --- | --- |
 * | below 0 | before other fiber work | `"user-blocking"` |
 * | 0 | in order | `"user-visible"` |
 * | above 0 | only when no other fiber work is queued | `"background"` |
 *
 * A fiber that yields because the budget ran out resumes at the priority it
 * was queued at. So `yield* Effect.yieldNowWith(1)` keeps CPU-bound work in
 * the background until the fiber next waits on something or yields
 * explicitly, after which it is back at 0. Fibers it forks or wakes start
 * at 0.
 *
 * **Gotchas**
 *
 * A single synchronous step can't be split: an `Effect.sync` that runs for
 * 200 milliseconds blocks the page for 200 milliseconds. Move such work to a
 * Worker. Background work runs only when nothing else is queued, so it
 * waits for as long as other fiber work keeps arriving.
 *
 * **Example** (Indexing in the background)
 *
 * ```ts
 * import { HtmlScheduler } from "@effect/ui/html"
 * import { Effect } from "effect"
 *
 * declare const documents: ReadonlyArray<string>
 * declare const index: (document: string) => Effect.Effect<void>
 *
 * const reindex = Effect.gen(function*() {
 *   yield* Effect.yieldNowWith(1)
 *   for (const document of documents) yield* index(document)
 * })
 *
 * Effect.runFork(reindex.pipe(Effect.provide(HtmlScheduler.layer())))
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = (options?: Options): Scheduler.Scheduler =>
  new HtmlScheduler(Duration.toMillis(options?.budget ?? 5))

/** @internal */
export const makeDefault = (): Scheduler.Scheduler => new HtmlScheduler(5)

/**
 * Provides a Scheduler made by `make`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer = (options?: Options): Layer.Layer<never> =>
  Layer.succeed(Scheduler.Scheduler, make(options))

interface Task {
  readonly run: () => void
  readonly priority: number
  readonly fiber: number | undefined
}

interface Bucket {
  readonly priority: number
  tasks: Array<Task>
}

type Lane = "user-blocking" | "user-visible" | "background"

const laneOf = (priority: number): Lane =>
  priority < 0
    ? "user-blocking"
    : priority === 0
    ? "user-visible"
    : "background"

interface TaskScheduler {
  readonly postTask: (
    task: () => void,
    options: { readonly priority: Lane }
  ) => Promise<unknown>
}

const now = (): number => performance.now()

class HtmlScheduler
  implements Scheduler.Scheduler, Scheduler.SchedulerDispatcher
{
  readonly executionMode = "async"
  readonly budget: number
  private queue: Array<Bucket> = []
  private deadline = -Infinity
  private active: Task | undefined = undefined
  private keep: number | undefined = undefined
  private sampled = -1
  private sampledAt = 0
  private sampledTime = 0
  private stride = 1
  private readonly pending = new Set<Lane>()
  private channel: MessageChannel | undefined = undefined

  constructor(budget: number) {
    this.budget = budget
  }

  shouldYield(fiber: Fiber.Fiber<unknown, unknown>): boolean {
    const count = fiber.currentOpCount
    if (count >= fiber.cache.maxOpsBeforeYield) return this.yieldInLane(fiber)
    const fresh = fiber.id !== this.sampled || count <= this.sampledAt
    if (!fresh && count < this.sampledAt + this.stride) return false
    const time = now()
    if (time >= this.deadline) {
      if (!fresh || this.active !== undefined || this.pending.size > 0) {
        return this.yieldInLane(fiber)
      }
      this.deadline = time + this.budget
    }
    if (fresh) {
      this.stride = 1
    } else {
      const perOp = (time - this.sampledTime) / (count - this.sampledAt)
      this.stride = Math.max(
        1,
        Math.min(
          this.stride * 2,
          32,
          Math.floor((this.deadline - time) / perOp / 2)
        )
      )
    }
    this.sampled = fiber.id
    this.sampledAt = count
    this.sampledTime = time
    return false
  }

  private yieldInLane(fiber: Fiber.Fiber<unknown, unknown>): boolean {
    this.keep = this.active?.fiber === fiber.id
      ? this.active.priority
      : undefined
    return true
  }

  makeDispatcher(): Scheduler.SchedulerDispatcher {
    return this
  }

  scheduleTask(run: () => void, priority: number): void {
    if (this.keep !== undefined) {
      priority = this.keep
      this.keep = undefined
    }
    bucketAt(this.queue, priority).tasks.push({
      run,
      priority,
      fiber: Fiber.getCurrent()?.id
    })
    if (this.active === undefined) this.post(laneOf(priority))
  }

  private post(lane: Lane): void {
    const tasks =
      (globalThis as { readonly scheduler?: Partial<TaskScheduler> }).scheduler
    if (typeof tasks?.postTask === "function") {
      if (this.pending.has(lane)) return
      this.pending.add(lane)
      tasks.postTask(() => {
        this.pending.delete(lane)
        this.drain(
          now() + this.budget,
          lane === "user-blocking" ? -1 : lane === "user-visible" ? 0 : 1
        )
      }, { priority: lane })
    } else if (this.pending.size === 0) {
      this.pending.add(lane)
      if (typeof MessageChannel === "function") {
        if (this.channel === undefined) {
          this.channel = new MessageChannel()
          this.channel.port1.onmessage = this.run
        }
        this.channel.port2.postMessage(undefined)
      } else {
        setTimeout(this.run, 0)
      }
    }
  }

  private readonly run = (): void => {
    this.pending.clear()
    this.drain(now() + this.budget)
  }

  private drain(deadline: number, lowest = 1): void {
    const outer = this.active
    const batch = this.queue
    this.queue = []
    this.deadline = deadline
    let b = 0
    let i = 0
    try {
      for (; b < batch.length; b++, i = 0) {
        if (Math.sign(batch[b]!.priority) > lowest) return
        const tasks = batch[b]!.tasks
        while (i < tasks.length) {
          const task = tasks[i]!
          if (
            task.priority > 0 && this.queue.length > 0 &&
            this.queue[0]!.priority <= 0
          ) return
          this.active = task
          i++
          task.run()
          if (now() >= deadline) return
        }
      }
    } finally {
      this.active = outer
      for (; b < batch.length; b++, i = 0) {
        const bucket = batch[b]!
        if (i < bucket.tasks.length) {
          const queued = bucketAt(this.queue, bucket.priority)
          queued.tasks = bucket.tasks.slice(i).concat(queued.tasks)
        }
      }
      for (const bucket of this.queue) this.post(laneOf(bucket.priority))
    }
  }

  flush(): void {
    const deadline = this.deadline
    try {
      while (this.queue.length > 0) this.drain(Infinity)
    } finally {
      this.deadline = deadline
    }
  }
}

const bucketAt = (queue: Array<Bucket>, priority: number): Bucket => {
  let index = queue.length
  while (index > 0 && queue[index - 1]!.priority > priority) index--
  const found = queue[index - 1]
  if (found !== undefined && found.priority === priority) return found
  const bucket: Bucket = { priority, tasks: [] }
  queue.splice(index, 0, bucket)
  return bucket
}
