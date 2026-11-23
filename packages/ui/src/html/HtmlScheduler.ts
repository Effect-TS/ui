/**
 * A Scheduler for the browser, which keeps fiber work from holding up the
 * page's rendering and input.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Duration from "effect/Duration"
import type * as Fiber from "effect/Fiber"
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
 * and handle input in between. A fiber yields once its own work passes the
 * budget too, or after `Scheduler.MaxOpsBeforeYield` operations, whichever
 * comes first. Work queued during a task runs in the next one. A fiber
 * resumed outside a task of this Scheduler, by a `fetch` for example, starts
 * a budget of its own.
 *
 * Tasks are posted with `scheduler.postTask` where the browser has it, and
 * otherwise with a `MessageChannel`.
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
 * A fiber that yields because it spent the budget resumes at the priority it
 * was running at. So `yield* Effect.yieldNowWith(1)` keeps CPU-bound work in
 * the background until the fiber next waits on something or yields
 * explicitly, after which it is back at 0. Fibers it forks start at 0.
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
  new HtmlScheduler(Duration.toMillis(Duration.fromInputUnsafe(options?.budget ?? 5)))

/**
 * Provides a Scheduler made by `make`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer = (options?: Options): Layer.Layer<never> => Layer.succeed(Scheduler.Scheduler, make(options))

interface Bucket {
  readonly priority: number
  tasks: Array<() => void>
}

type Lane = "user-blocking" | "user-visible" | "background"

const laneOf = (priority: number): Lane =>
  priority < 0 ? "user-blocking" : priority === 0 ? "user-visible" : "background"

interface TaskScheduler {
  readonly postTask: (task: () => void, options: { readonly priority: Lane }) => Promise<unknown>
}

const now = (): number => performance.now()

class HtmlScheduler implements Scheduler.Scheduler, Scheduler.SchedulerDispatcher {
  readonly executionMode = "async"
  readonly budget: number
  private queue: Array<Bucket> = []
  private deadline = -Infinity
  private draining = false
  private running: number | undefined = undefined
  private keep: number | undefined = undefined
  private sampled: Fiber.Fiber<unknown, unknown> | undefined = undefined
  private sampledAt = 0
  private sampledTime = 0
  private nextSample = 0
  private stride = 1
  private readonly pending = new Set<Lane>()
  private readonly post: (lane: Lane) => void

  constructor(budget: number) {
    this.budget = budget
    const tasks = (globalThis as { readonly scheduler?: Partial<TaskScheduler> }).scheduler
    if (typeof tasks?.postTask === "function") {
      const scheduler = tasks as TaskScheduler
      this.post = (lane) => {
        if (this.pending.has(lane)) return
        this.pending.add(lane)
        scheduler.postTask(() => {
          this.pending.delete(lane)
          this.run()
        }, { priority: lane })
      }
    } else {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => {
        this.pending.clear()
        this.run()
      }
      this.post = (lane) => {
        if (this.pending.size > 0) return
        this.pending.add(lane)
        channel.port2.postMessage(undefined)
      }
    }
  }

  shouldYield(fiber: Fiber.Fiber<unknown, unknown>): boolean {
    const count = fiber.currentOpCount
    if (count >= fiber.cache.maxOpsBeforeYield) return this.yieldInLane()
    if (fiber !== this.sampled || count < this.sampledAt) {
      this.sampled = fiber
      this.sampledAt = 0
    } else if (count < this.nextSample) {
      return false
    }
    const time = now()
    if (time >= this.deadline) {
      if (count !== 1 || this.draining || this.pending.size > 0) return this.yieldInLane()
      this.deadline = time + this.budget
    }
    if (this.sampledAt === 0) {
      this.stride = 1
    } else {
      const perOp = (time - this.sampledTime) / (count - this.sampledAt)
      this.stride = Math.max(1, Math.min(this.stride * 2, 32, Math.floor((this.deadline - time) / perOp)))
    }
    this.nextSample = count + this.stride
    this.sampledAt = count
    this.sampledTime = time
    return false
  }

  private yieldInLane(): boolean {
    this.keep = this.running
    return true
  }

  makeDispatcher(): Scheduler.SchedulerDispatcher {
    return this
  }

  scheduleTask(task: () => void, priority: number): void {
    if (this.keep !== undefined) {
      priority = this.keep
      this.keep = undefined
    }
    bucketAt(this.queue, priority).tasks.push(task)
    if (!this.draining) this.post(laneOf(priority))
  }

  private run(): void {
    const batch = this.queue
    this.queue = []
    this.draining = true
    this.deadline = now() + this.budget
    let b = 0
    let i = 0
    try {
      for (; b < batch.length; b++, i = 0) {
        const bucket = batch[b]!
        while (i < bucket.tasks.length) {
          if ((b > 0 || i > 0) && now() >= this.deadline) return
          if (bucket.priority > 0 && this.queue.length > 0 && this.queue[0]!.priority <= 0) return
          this.running = bucket.priority
          bucket.tasks[i++]!()
        }
      }
    } finally {
      this.running = undefined
      this.draining = false
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
    while (this.queue.length > 0) {
      const batch = this.queue
      this.queue = []
      for (const bucket of batch) {
        for (const task of bucket.tasks) task()
      }
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
