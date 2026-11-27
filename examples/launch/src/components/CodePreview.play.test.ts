import type { Snippet } from "#domain/Snippet"
import { Html } from "@effect/ui/html"
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { assert, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Code } from "./Code.ts"
import { scrolls, TestLayer } from "./testing.ts"

const file = (id: string): Snippet => ({
  id,
  name: "File.ts",
  lines: Array.from({ length: 30 }, (_, index) => [
    { text: `const line${index} = 0`, color: "" }
  ]),
  folds: []
})

const preview = { start: 2, end: 16 }

const Alone = Html.component({
  name: "Alone",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    h.main.children(
      (["first", "second"] as const).map((id) =>
        h.section.key(id).attr("aria-label", id).children(
          Code(h, file(id), { preview })
        )
      )
    )
})

const inside = (id: string, locator: Locator.Locator) =>
  Locator.inside(HtmlLocator.role("region", { name: id }), locator)
const show = HtmlLocator.role("button", { name: "Show code" })
const hide = HtmlLocator.role("button", { name: "Hide code" })

it.layer(TestLayer, { buildPerTest: true })(
  "CodePreview",
  (it) => {
    it.effect("opens a file on its own, and scrolls to it when it closes", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Alone, {})
        yield* play.expect(show).toHaveCount(2)
        yield* play.click(inside("first", show))
        yield* play.expect(inside("first", hide)).toExist()
        yield* play.expect(inside("second", show)).toExist()
        scrolls.length = 0
        yield* play.click(inside("first", hide))
        yield* play.expect(show).toHaveCount(2)
        // Closing brings the top of the file back into view.
        assert.deepStrictEqual(scrolls, [{ block: "nearest" }])
      }))
  }
)
