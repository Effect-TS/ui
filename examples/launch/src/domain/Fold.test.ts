import { describe, expect, it } from "@effect/vitest"
import { before, bodies, none } from "./Fold.ts"

const source = `const Def = Html.component({
  name: "Counter"
})

// Starts at zero.
const init = Def.init(() => ({
  count: 0
}))

export const update = Def.update(($, message) =>
  // Every Message goes through here.
  Message.match(message, {
    Clicked: () => $.evolve({ count: 1 })
  })
)

function view(h: H) {
  return h.div

    .children("Count")
}

const label =
  "Count"

const total = 3

export const Counter = Def.make({ init, update, view })`

const lines = source.split("\n")

const folded = (...names: ReadonlyArray<string>) =>
  bodies(...names)(source).map(({ end, label, start }) => [
    label,
    lines.slice(start, end)
  ])

describe("bodies", () => {
  it("folds what is between a declaration's first line and its closing line", () => {
    expect(folded("init", "update", "view")).toEqual([
      ["init", ["  count: 0"]],
      ["update", [
        "  // Every Message goes through here.",
        "  Message.match(message, {",
        "    Clicked: () => $.evolve({ count: 1 })",
        "  })"
      ]],
      ["view", ["  return h.div", "", "    .children(\"Count\")"]]
    ])
  })

  it("folds to the last line of a declaration that has no closing line", () => {
    expect(folded("label")).toEqual([["label", ["  \"Count\""]]])
  })

  it("lists the folds from the top down, whatever order they are named in", () => {
    expect(
      bodies("view", "init")(source).map(({ label }) => label)
    ).toEqual(["init", "view"])
  })

  it("rejects a name that nothing declares at the top level", () => {
    expect(() => bodies("count")(source)).toThrow(
      "No top-level declaration named \"count\""
    )
    expect(() => bodies("in")(source)).toThrow(
      "No top-level declaration named \"in\""
    )
  })

  it("rejects a declaration that fits on one line", () => {
    expect(() => bodies("total")(source)).toThrow(
      "\"total\" has no body to fold"
    )
    expect(() => bodies("Counter")(source)).toThrow(
      "\"Counter\" has no body to fold"
    )
  })
})

describe("none", () => {
  it("folds nothing", () => {
    expect(none(source)).toEqual([])
  })
})

describe("before", () => {
  it("folds every line before the matching prefix", () => {
    const snippet =
      `import { it } from "@effect/vitest"\n\nconst x = 1\n\nit.effect("runs", () => {})`
    expect(before("it.effect(", "Imports and setup")(snippet))
      .toEqual([
        { label: "Imports and setup", start: 0, end: 4 }
      ])
  })

  it("returns no folds when the prefix is on the first line", () => {
    expect(
      before("it.effect(", "Setup")(`it.effect("runs", () => {})`)
    )
      .toEqual([])
  })

  it("rejects a prefix that does not appear", () => {
    expect(() => before("it.effect(", "Setup")(source)).toThrow(
      "No line starting with \"it.effect(\""
    )
  })
})
