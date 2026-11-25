import { describe, expect, it } from "@effect/vitest"
import { test } from "./Excerpt.ts"

const source = `describe("Counter", () => {
  it("adds", () => {
    expect(1 + 1).toBe(2)
  })

  it.effect("resets", () =>
    Effect.gen(function*() {
      yield* reset
    }))

  it.effect("stops", () =>
    Effect.gen(function*() {
      yield* stop
    }))
})
`

describe("test", () => {
  it("takes one test whether or not it ends at its own indent", () => {
    expect(test("adds")(source)).toBe(
      `it("adds", () => {\n  expect(1 + 1).toBe(2)\n})`
    )
    expect(test("resets")(source)).toBe(
      `it.effect("resets", () =>\n  Effect.gen(function*() {\n    yield* reset\n  }))`
    )
    expect(test("stops")(source)).toBe(
      `it.effect("stops", () =>\n  Effect.gen(function*() {\n    yield* stop\n  }))`
    )
  })
})
