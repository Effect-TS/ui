import { describe, expect, it } from "@effect/vitest"
import { declaration, test, withImports } from "./Excerpt.ts"

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

describe("declaration", () => {
  it("matches typed and untyped const declarations", () => {
    const typed =
      `const alice: User = {\n  name: "alice"\n}\n\nconst url = "/login"\n`
    expect(declaration("alice")(typed)).toBe(
      `const alice: User = {\n  name: "alice"\n}`
    )
    expect(declaration("url")(typed)).toBe(`const url = "/login"`)
  })
})

describe("withImports", () => {
  it("keeps only the imports and specifiers referenced in the excerpt", () => {
    const file =
      `import { assert, describe, it } from "@effect/vitest"
import { Counter } from "./Counter.ts"
import { Counter as Unused } from "./Other.ts"

describe("Counter", () => {
  it("works", () => {
    assert.ok(Counter)
  })
})
`
    expect(withImports(test("works"))(file)).toBe(
      `import { assert, it } from "@effect/vitest"
import { Counter } from "./Counter.ts"

it("works", () => {
  assert.ok(Counter)
})`
    )
  })
})
