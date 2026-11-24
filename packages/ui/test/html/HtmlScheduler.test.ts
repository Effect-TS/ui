import { HtmlScheduler } from "@effect/ui/html"
import { afterEach, describe, expect, it, vi } from "@effect/vitest"
import { Deferred, Effect } from "effect"

type Lane = "user-blocking" | "user-visible" | "background"

const hostOrder = ["user-blocking", "user-visible", "background", "message"]

const browser = (
  transport: "postTask" | "MessageChannel" | "setTimeout" = "postTask"
) => {
  let time = 0
  const posted: Array<
    { readonly run: () => void; readonly priority: Lane | "message" }
  > = []
  vi.spyOn(performance, "now").mockImplementation(() => time)
  if (transport === "postTask") {
    vi.stubGlobal("scheduler", {
      postTask: (run: () => void, options: { readonly priority: Lane }) => {
        posted.push({ run, priority: options.priority })
        return Promise.resolve()
      }
    })
  } else if (transport === "MessageChannel") {
    vi.stubGlobal("scheduler", undefined)
    vi.stubGlobal(
      "MessageChannel",
      class {
        readonly port1 = { onmessage: () => {} }
        readonly port2 = {
          postMessage: () =>
            posted.push({
              run: () => this.port1.onmessage(),
              priority: "message"
            })
        }
      }
    )
  } else {
    vi.stubGlobal("scheduler", undefined)
    vi.stubGlobal("MessageChannel", undefined)
    vi.stubGlobal(
      "setTimeout",
      (run: () => void) => posted.push({ run, priority: "message" })
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
    fork: <A>(effect: Effect.Effect<A>) =>
      Effect.runFork(effect, { scheduler }),
    page: (run: () => void) => posted.push({ run, priority: "user-visible" }),
    next: () => {
      const start = time
      const index = posted.reduce(
        (best, task, i) =>
          hostOrder.indexOf(task.priority) <
              hostOrder.indexOf(posted[best]!.priority)
            ? i
            : best,
        0
      )
      posted.splice(index, 1)[0]!.run()
      return time - start
    }
  }
}

describe("HtmlScheduler", { concurrent: false }, () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each(["MessageChannel", "setTimeout"] as const)(
    "slices sequential and concurrent work, and falls back to %s",
    (transport) => {
      const { elapsed, fork, next, posted, work } = browser(transport)
      const log: Array<string> = []
      fork(
        Effect.yieldNowWith(1).pipe(
          Effect.andThen(
            Effect.forEach(Array.from({ length: 100 }), () => work(1), {
              discard: true
            })
          ),
          Effect.andThen(Effect.sync(() => log.push("background")))
        )
      )
      fork(
        Effect.forEach(Array.from({ length: 100 }), () => work(1), {
          concurrency: "unbounded",
          discard: true
        }).pipe(
          Effect.andThen(Effect.sync(() => log.push("normal")))
        )
      )
      expect(posted.length).toBe(1)
      const slices = [elapsed()]
      while (posted.length > 0) slices.push(next())
      expect(log).toEqual(["normal", "background"])
      expect(Math.max(...slices)).toBeLessThanOrEqual(6)
    }
  )

  it("runs each priority in a host task of its own, and keeps a fiber that spends its budget at its priority", () => {
    const { fork, next, page, posted, work } = browser()
    const log: Array<string> = []
    fork(Effect.gen(function*() {
      yield* Effect.yieldNowWith(1)
      for (let i = 0; i < 8; i++) yield* work(1)
      log.push("background")
    }))
    fork(
      Effect.yieldNowWith(-1).pipe(
        Effect.andThen(Effect.sync(() => log.push("urgent")))
      )
    )
    page(() => log.push("page"))
    fork(
      Effect.yieldNow.pipe(
        Effect.andThen(Effect.sync(() => log.push("normal")))
      )
    )
    expect(posted.map((task) => task.priority)).toEqual([
      "background",
      "user-blocking",
      "user-visible",
      "user-visible"
    ])
    next()
    next()
    next()
    next()
    expect(log).toEqual(["urgent", "page", "normal"])
    fork(
      Effect.yieldNow.pipe(Effect.andThen(Effect.sync(() => log.push("later"))))
    )
    expect(posted.map((task) => task.priority)).toEqual([
      "background",
      "user-visible"
    ])
    while (posted.length > 0) next()
    expect(log).toEqual(["urgent", "page", "normal", "later", "background"])
  })

  it("runs work forked or woken by background work at priority 0", () => {
    const { fork, next, posted, work } = browser()
    const log: Array<string> = []
    const woken = Deferred.makeUnsafe<void>()
    fork(
      Deferred.await(woken).pipe(
        Effect.andThen(
          Effect.forEach(Array.from({ length: 10 }), () => work(1))
        ),
        Effect.andThen(Effect.sync(() => log.push("woken")))
      )
    )
    const background = (
      name: string,
      effect: Effect.Effect<unknown> = Effect.void
    ) =>
      fork(
        Effect.yieldNowWith(1).pipe(
          Effect.andThen(effect),
          Effect.andThen(Effect.sync(() => log.push(name)))
        )
      )
    background(
      "first",
      Effect.forkDetach(Effect.sync(() => log.push("forked")))
    )
    background("second", Deferred.succeed(woken, undefined))
    background("third")
    expect(next()).toBe(0)
    while (posted.length > 0) next()
    expect(log).toEqual(["first", "forked", "woken", "third", "second"])
  })

  it("gives a fiber resumed outside its tasks a budget of its own unless work is already queued", () => {
    const { advance, fork, posted, work } = browser()
    const callback = () => {
      let resume: (effect: Effect.Effect<unknown>) => void = () => {}
      const fiber = fork(Effect.callback<unknown>((f) => {
        resume = f
      }))
      return { fiber, resume }
    }
    const idle = callback()
    advance(10)
    idle.resume(Effect.forEach(Array.from({ length: 3 }), () => work(1)))
    expect(idle.fiber.pollUnsafe()?._tag).toBe("Success")
    expect(posted).toEqual([])

    const busy = callback()
    fork(Effect.yieldNow)
    advance(10)
    busy.resume(Effect.forEach(Array.from({ length: 3 }), () => work(1)))
    expect(busy.fiber.pollUnsafe()).toBeUndefined()
  })

  it("flush drains queued work without yielding on time, and leaves an outer task's budget and lane intact", () => {
    const { fork, next, posted, work } = browser()
    const log: Array<string> = []
    const bg = fork(Effect.gen(function*() {
      yield* Effect.yieldNowWith(1)
      fork(
        Effect.yieldNow.pipe(
          Effect.andThen(
            Effect.forEach(Array.from({ length: 10 }), () => work(1))
          ),
          Effect.andThen(Effect.sync(() => log.push("flushed-1")))
        )
      )
      fork(
        Effect.yieldNow.pipe(
          Effect.andThen(Effect.sync(() => log.push("flushed-2")))
        )
      )
      bg.currentDispatcher.flush()
      for (let i = 0; i < 3; i++) yield* work(1)
      log.push("background")
    }))
    next()
    expect(log).toEqual(["flushed-1", "flushed-2"])
    fork(
      Effect.yieldNow.pipe(
        Effect.andThen(Effect.sync(() => log.push("normal")))
      )
    )
    while (posted.length > 0) next()
    expect(log).toEqual(["flushed-1", "flushed-2", "normal", "background"])
  })
})
