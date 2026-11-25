import type { Snippet } from "#domain/Snippet"
import { Html } from "@effect/ui/html"
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { Code } from "./Code.ts"
import { CodeGroup } from "./CodeGroup.ts"

const file = (id: string): Snippet => ({
  id,
  name: "File.ts",
  lines: Array.from({ length: 30 }, (_, index) => [
    { text: `const line${index} = 0`, color: "" }
  ]),
  folds: []
})

const preview = { start: 2, end: 16 }

// Two sides of a comparison: a file on each side in row 0, and one
// more in row 1.
const Comparison = Html.component({
  name: "Comparison",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    CodeGroup(h, {
      view: () =>
        h.main.children(
          ...(["left/0", "right/0", "left/1"] as const).map((id) =>
            h.section.key(id).attr("aria-label", id).children(
              Code(h, file(id), {
                preview,
                row: id.endsWith("1") ? 1 : 0
              })
            )
          )
        )
    })
})

const Alone = Html.component({
  name: "Alone",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    h.main.children(
      ...(["first", "second"] as const).map((id) =>
        h.section.key(id).attr("aria-label", id).children(
          Code(h, file(id), { preview })
        )
      )
    )
})

// The test host has no page to scroll, so the test stands in for the
// element operations and records each scroll.
const scrolls: Array<Html.ScrollOptions> = []
const TestLayer = Layer.merge(
  TestHost.layer(),
  Layer.succeed(Html.Host, {
    focus: () => {},
    blur: () => {},
    scrollIntoView: (_element, options) => {
      scrolls.push(options)
    },
    measure: () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    }),
    select: () => {},
    requestSubmit: () => false,
    showPicker: () => false
  })
)

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

    it.effect("opens and closes the files of one row together", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Comparison, {})
        yield* play.expect(show).toHaveCount(3)
        yield* play.click(inside("left/0", show))
        yield* play.expect(inside("left/0", hide)).toExist()
        yield* play.expect(inside("right/0", hide)).toExist()
        yield* play.expect(inside("left/1", show)).toExist()
        yield* play.click(inside("right/0", hide))
        yield* play.expect(show).toHaveCount(3)
      }))
  }
)
