import { Component, Renderer, type View } from "@effect/ui"
import { BrowserHost } from "@effect/ui/html"
import { type Effect, Schema, type Scope } from "effect"
import { describe, expect, it } from "tstyche"
import { Counter } from "../test/fixtures/components.ts"

// Compiled with `exactOptionalPropertyTypes` off (see tsconfig.typetest-loose.json).
describe("without exactOptionalPropertyTypes", () => {
  it("a host-neutral root needs no host", () => {
    expect(Renderer.mount(Counter, { initial: 0 }, null)).type.toBe<
      Effect.Effect<
        Renderer.Root<{ readonly count: number }, typeof Counter.message.Type>,
        never,
        Renderer.Renderer | Scope.Scope
      >
    >()
    expect(BrowserHost.mount).type.toBeCallableWith(
      Counter,
      { initial: 0 },
      document.body
    )
  })

  it("a widened vocabulary is not host-neutral", () => {
    const elements: View.Vocabulary = { name: "any", tags: {} }
    const Widened = Component.define({
      name: "Widened",
      model: Schema.Number,
      message: Schema.Never,
      elements
    }).make({
      init: () => 0,
      update: ($) => $.model,
      view: (h) => h.text("")
    })
    expect(BrowserHost.mount).type.not.toBeCallableWith(
      Widened,
      {},
      document.body
    )
  })
})
