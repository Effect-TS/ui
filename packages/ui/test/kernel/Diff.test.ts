import { Component } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const Leaf = Component.define({
  name: "Leaf",
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
})
  .make({
    init: () => null,
    update: ($) => $.model,
    view: (h) => h.p("leaf")
  })

// An element and a child with one key, and an unkeyed sibling first, so the list's middle is diffed.
const List = Component.define({
  name: "List",
  model: Schema.Boolean,
  message: Schema.Boolean,
  elements: Html
}).make({
  init: () => false,
  update: (_, flipped) => flipped,
  view: (h, flipped) =>
    h.ul(
      flipped
        ? [Leaf(h, { key: "x" }), h.li.key("x").children("row")]
        : [h.li("first"), h.li.key("x").children("row"), Leaf(h, { key: "x" })]
    )
})

describe("the list diff", () => {
  it.effect("tells an element's key from a child's", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(List, {})
      const row = root.get(Locator.text("row", { exact: true }))
      const leaf = root.get(Locator.text("leaf", { exact: true }))
      root.send(true)
      yield* TestHost.settle
      assert.strictEqual(root.text(), "leafrow")
      assert.strictEqual(root.get(Locator.text("row", { exact: true })), row)
      assert.strictEqual(root.get(Locator.text("leaf", { exact: true })), leaf)
    }).pipe(Effect.provide(TestHost.layer())))
})
