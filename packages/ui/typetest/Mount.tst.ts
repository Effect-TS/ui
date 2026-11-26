import { Component, Mount } from "@effect/ui"
import { Context, Effect } from "effect"
import { describe, expect, it } from "tstyche"

class Clock
  extends Context.Service<Clock, { readonly now: number }>()("Clock")
{}

describe("Mount.make", () => {
  it("takes beforeCommit only for a body that requires no services", () => {
    expect(
      Mount.make(
        "Plain",
        { args: {}, beforeCommit: true },
        () => Effect.succeed(Component.noop)
      )
    ).type.toBe<Mount.Factory<{}, typeof Component.noop>>()
    expect(Mount.make).type.not.toBeCallableWith(
      "Timed",
      { args: {}, beforeCommit: true },
      () =>
        Effect.gen(function*() {
          yield* Clock
          return Component.noop
        })
    )
    expect(Mount.make).type.toBeCallableWith(
      "Timed",
      { args: {} },
      () =>
        Effect.gen(function*() {
          yield* Clock
          return Component.noop
        })
    )
  })
})
