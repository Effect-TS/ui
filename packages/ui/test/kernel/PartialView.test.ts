import { Component, type MessageLog } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const Leaf = Component.define({
  name: "Leaf",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.text("leaf")
})

// Its view starts a child, then places a slot, which a root has no content for: placing it throws.
const Half = Component.define({
  name: "Half",
  model: Schema.Boolean,
  message: Schema.Boolean,
  elements: Html,
  slots: ["body"]
}).make({
  init: () => false,
  update: (_, broken) => broken,
  view: (h, broken) => broken ? h.div(Leaf(h, {}), h.slots.body) : h.p("whole")
})

const tags = (log: ReadonlyArray<MessageLog.Entry>, path: string) =>
  log.flatMap((entry) =>
    "path" in entry && entry.path === path ? [entry._tag] : []
  )

describe("a view that throws partway", () => {
  it.effect("closes the children it had started", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Half, {})
      yield* TestHost.settle
      root.send(true)
      yield* Effect.exit(TestHost.settle)
      assert.deepStrictEqual(tags(root.log(), "/Half"), [
        "Mounted",
        "Update",
        "Failed",
        "Unmounted"
      ])
      assert.deepStrictEqual(tags(root.log(), "/Half/Leaf[]"), [
        "Mounted",
        "Unmounted"
      ])
    }).pipe(Effect.provide(TestHost.layer())))
})
