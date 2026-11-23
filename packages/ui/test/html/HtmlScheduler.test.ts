import { HtmlScheduler } from "@effect/ui/html"
import { afterEach, describe, expect, it, vi } from "@effect/vitest"
import { Context, Deferred, Effect, Scheduler } from "effect"

type Lane = "user-blocking" | "user-visible" | "background"

const browser = (transport: "postTask" | "MessageChannel" = "postTask") => {
  let time = 0
  const posted: Array<{ readonly run: () => void; readonly priority: Lane | "message" }> = []
  vi.spyOn(performance, "now").mockImplementation(() => time)
  if (transport === "postTask") {
    vi.stubGlobal("scheduler", {
      postTask: (run: () => void, options: { readonly priority: Lane }) => {
        posted.push({ run, priority: options.priority })
        return Promise.resolve()
      }
    })
  } else {
    vi.stubGlobal(
      "MessageChannel",
      class {
        readonly port1 = { onmessage: () => {} }
        readonly port2 = { postMessage: () => posted.push({ run: () => this.port1.onmessage(), priority: "message" }) }
      }
    )
  }
  const scheduler = HtmlScheduler.make({ budget: 5 })
  return {
    posted,
    elapsed: () => time,
    advance: (ms: number) => {
      time += ms
    },
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

  it("gives a fiber resumed outside its tasks a budget of its own", () => {
    const { advance, fork, posted, work } = browser()
    let resume: (effect: Effect.Effect<unknown>) => void = () => {}
    const fiber = fork(Effect.callback<unknown>((f) => {
      resume = f
    }))
    advance(10)
    resume(Effect.forEach(Array.from({ length: 3 }), () => work(1)))
    expect(fiber.pollUnsafe()?._tag).toBe("Success")
    expect(posted).toEqual([])
  })

  it("flush runs everything queued, however long it takes", () => {
    const { fork, work } = browser()
    const fiber = fork(Effect.yieldNow.pipe(Effect.andThen(Effect.forEach(Array.from({ length: 20 }), () => work(1)))))
    fiber.currentDispatcher.flush()
    expect(fiber.pollUnsafe()?._tag).toBe("Success")
  })

  it("posts one message at a time without postTask", () => {
    const { elapsed, fork, next, posted, work } = browser("MessageChannel")
    const log: Array<string> = []
    fork(
      Effect.yieldNowWith(1).pipe(
        Effect.andThen(Effect.forEach(Array.from({ length: 20 }), () => work(1))),
        Effect.andThen(Effect.sync(() => log.push("background")))
      )
    )
    fork(Effect.yieldNow.pipe(Effect.andThen(Effect.sync(() => log.push("normal")))))
    expect(posted.length).toBe(1)
    const slices = [elapsed()]
    while (posted.length > 0) slices.push(next())
    expect(log).toEqual(["normal", "background"])
    expect(Math.max(...slices)).toBeLessThanOrEqual(6)
  })
})
