import type { Snippet } from "#domain/Snippet"
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { Comparison } from "./Comparison.ts"
import { TestLayer } from "./testing.ts"

const file = (id: string, name: string): Snippet => ({
  id,
  name,
  lines: Array.from({ length: 30 }, (_, index) => [
    { text: `const ${id}${index} = 0`, color: "" }
  ]),
  folds: []
})

const sides = [
  {
    label: "Before",
    about: "The old way",
    files: [file("before", "Before.ts")]
  },
  {
    label: "After",
    about: "The new way",
    files: [file("after", "After.ts")]
  }
]

const tab = (name: string) => HtmlLocator.role("tab", { name })
const show = HtmlLocator.role("button", { name: "Show code" })
const hide = HtmlLocator.role("button", { name: "Hide code" })

it.layer(TestLayer, { buildPerTest: true })("Comparison", (it) => {
  it.effect("shows the last side first, and the other on its tab", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Comparison, { sides })
      yield* play.expect(Locator.text("The new way")).toExist()
      yield* play.expect(Locator.text("After.ts")).toExist()
      yield* play.expect(Locator.text("Before.ts")).toBeAbsent()
      yield* play.click(tab("Before"))
      // The panel that leaves is removed once its exit has played,
      // which needs a browser, so this checks the one that arrives.
      yield* play.expect(Locator.text("The old way")).toExist()
      yield* play.expect(Locator.text("Before.ts")).toExist()
    }))

  it.effect("keeps a file open when the other side shows", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Comparison, { sides })
      yield* play.click(show)
      yield* play.expect(hide).toExist()
      yield* play.click(tab("Before"))
      yield* play.expect(Locator.text("Before.ts")).toExist()
      yield* play.expect(show).toBeAbsent()
    }))
})
