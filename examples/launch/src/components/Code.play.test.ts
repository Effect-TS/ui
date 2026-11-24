import { bodies } from "#domain/Fold"
import { Snippet } from "#domain/Snippet"
import { Component } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Code } from "./Code.ts"

const code = `const init = Def.init(() => ({
  count: 0
}))`

const file = (id: string, folds: Snippet["folds"]): Snippet => ({
  id,
  name: "Counter.ts",
  lines: code.split("\n").map((text) => [{ text, color: "" }]),
  folds
})

const files = [
  file("intro/Counter.ts", []),
  file("split/Counter.ts", bodies("init")(code)),
  file("parts/Counter.ts", bodies("init")(code))
]

const Page = Component.define({
  name: "Page",
  props: Schema.Struct({ files: Schema.Array(Snippet) }),
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    h.main.children(
      ...h.props.files.map((snippet) =>
        h.section.key(snippet.id).attr("aria-label", snippet.id)
          .children(Code(h, snippet))
      )
    )
})

const inside = (id: string, locator: Locator.Locator) =>
  Locator.inside(HtmlLocator.role("region", { name: id }), locator)
const toggle = HtmlLocator.role("button", {
  name: "init body, 1 line"
})
const expanded = Locator.attr("aria-expanded", "true")
const count = Locator.text("count: 0")

it.layer(TestHost.layer(), { buildPerTest: true })("Code", (it) => {
  it.effect("shows a file without folds whole, with nothing to press", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Page, { files })
      yield* play.expect(
        inside("intro/Counter.ts", HtmlLocator.role("button"))
      ).toBeAbsent()
      yield* play.expect(inside("intro/Counter.ts", count)).toExist()
    }))

  it.effect("keeps the folds of two files with one name apart", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Page, { files })
      yield* play.expect(count).toHaveCount(1)
      yield* play.click(inside("split/Counter.ts", toggle))
      yield* play.expect(inside("split/Counter.ts", expanded))
        .toExist()
      yield* play.expect(inside("split/Counter.ts", count)).toExist()
      yield* play.expect(inside("parts/Counter.ts", expanded))
        .toBeAbsent()
      yield* play.expect(inside("parts/Counter.ts", count))
        .toBeAbsent()
      yield* play.click(inside("split/Counter.ts", toggle))
      yield* play.expect(expanded).toBeAbsent()
      yield* play.expect(count).toHaveCount(1)
    }))
})
