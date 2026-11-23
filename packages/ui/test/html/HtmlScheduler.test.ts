import { HtmlScheduler } from "@effect/ui/html"
import { afterEach, describe, expect, it, vi } from "@effect/vitest"
import { Context, Deferred, Effect, Fiber, Scheduler } from "effect"

type Lane = "user-blocking" | "user-visible" | "background"

const browser = () => {
  let time = 0
  const posted: Array<{ readonly run: () => void; readonly priority: Lane }> = []
  vi.spyOn(performance, "now").mockImplementation(() => time)
  vi.stubGlobal("scheduler", {
    postTask: (run: () => void, options: { readonly priority: Lane }) => {
      posted.push({ run, priority: options.priority })
      return Promise.resolve()
    }
  })
  const scheduler = HtmlScheduler.make({ budget: 5 })
  return {
    posted,
    elapsed: () => time,
    work: (ms: number) =>
      Effect.sync(() => {
        time += ms
      }),
    fork: <A>(effect: Effect.Effect<A>) => Effect.runForkWith(Context.make(Scheduler.Scheduler, scheduler))(effect),
    next: () => {
      const start = time
      posted.shift()!.run()
      return time - start
    }
  }
}

describe("HtmlScheduler", { concurrent: false }, () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("runs fiber work in slices", () => {
    const { elapsed, fork, next, posted, work } = browser()
    const fiber = fork(Effect.all([
      Effect.forEach(Array.from({ length: 100 }), () => work(1), { discard: true }),
      Effect.forEach(Array.from({ length: 100 }), () => work(1), { concurrency: "unbounded", discard: true })
    ], { concurrency: 2 }))
    const slices = [elapsed()]
    while (posted.length > 0) slices.push(next())
    expect(fiber.pollUnsafe()?._tag).toBe("Success")
    expect(Math.max(...slices)).toBeLessThanOrEqual(6)
  })

  it("runs lower priorities first, and keeps a fiber that spends its budget at its priority", () => {
    const { fork, next, posted, work } = browser()
    const log: Array<string> = []
    fork(Effect.gen(function*() {
      yield* Effect.yieldNowWith(1)
      for (let i = 0; i < 20; i++) yield* work(1)
      log.push("background")
    }))
    fork(Effect.yieldNowWith(-1).pipe(Effect.andThen(Effect.sync(() => log.push("urgent")))))
    fork(Effect.yieldNow.pipe(Effect.andThen(Effect.sync(() => log.push("normal")))))
    expect(posted.map((task) => task.priority)).toEqual(["background", "user-blocking", "user-visible"])
    next()
    expect(log).toEqual(["urgent", "normal"])
    expect(posted.map((task) => task.priority)).toEqual(["user-blocking", "user-visible", "background"])
    fork(Effect.yieldNow.pipe(Effect.andThen(Effect.sync(() => log.push("later")))))
    while (posted.length > 0) next()
    expect(log).toEqual(["urgent", "normal", "later", "background"])
  })

  it("runs work forked by background work before more background work", () => {
    const { fork, next, posted } = browser()
    const log: Array<string> = []
    const background = (name: string, effect: Effect.Effect<unknown> = Effect.void) =>
      fork(Effect.yieldNowWith(1).pipe(Effect.andThen(effect), Effect.andThen(Effect.sync(() => log.push(name)))))
    background("first", Effect.forkDetach(Effect.sync(() => log.push("forked"))))
    background("second")
    while (posted.length > 0) next()
    expect(log).toEqual(["first", "forked", "second"])
  })

  it("puts a fiber woken by background work back at priority 0 when it spends the budget", () => {
    const { fork, next, posted, work } = browser()
    const woken = Deferred.makeUnsafe<void>()
    fork(Deferred.await(woken).pipe(Effect.andThen(Effect.forEach(Array.from({ length: 10 }), () => work(1)))))
    fork(Effect.yieldNowWith(1).pipe(Effect.andThen(Deferred.succeed(woken, undefined))))
    next()
    expect(posted.map((task) => task.priority)).toEqual(["user-visible"])
  })

  it("gives the event loop a turn between slices without postTask", async () => {
    const scheduler = HtmlScheduler.make({ budget: 5 })
    const busy = Effect.sync(() => {
      const end = performance.now() + 1
      while (performance.now() < end) continue
    })
    let steps = 0
    const timer = new Promise<number>((resolve) => setTimeout(() => resolve(steps), 0))
    const fiber = Effect.runForkWith(Context.make(Scheduler.Scheduler, scheduler))(
      Effect.forEach(Array.from({ length: 50 }), () => Effect.andThen(busy, Effect.sync(() => steps++)), {
        discard: true
      })
    )
    expect(await timer).toBeLessThan(50)
    await Effect.runPromise(Fiber.join(fiber))
  })
})
