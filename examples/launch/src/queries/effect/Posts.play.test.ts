import { Component } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { TestClock } from "effect/testing"
import { Posts } from "./Posts.ts"

const titles = ["Foldkit Joins Effect", "How Foldkit 0.x evolves into Effect UI"]

const TwoPosts = Component.define({
  name: "TwoPosts",
  scoped: false,
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html
}).make({
  init: () => ({}),
  update: ($) => $.model,
  view: (h) => h.div.children(Posts(h, { key: "first" }), Posts(h, { key: "second" }))
})

it.layer(TestHost.layer(), { buildPerTest: true })("Effect UI posts", (it) => {
  it.effect("shows Loading posts, then the titles", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Posts, {})
      yield* play.expect(Locator.text("Loading posts")).toExist()
      yield* TestClock.adjust("300 millis")
      for (const title of titles) {
        yield* play.expect(Locator.text(title)).toExist()
      }
    }))

  it.effect("two instances share one fetch", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(TwoPosts, {})
      yield* TestClock.adjust("300 millis")
      for (const title of titles) {
        yield* play.expect(Locator.text(title)).toHaveCount(2)
      }
      assert.strictEqual(play.root.fetches().length, 1)
    }))
})
