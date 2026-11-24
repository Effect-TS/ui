import { Component, View } from "@effect/ui"
import { OpenTui } from "@effect/ui-opentui"
import { TestOpenTuiEvents } from "@effect/ui-opentui/testing"
import { TestHost } from "@effect/ui/testing"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"

const unregister = Effect.sync(() =>
  (View.registerElements as (
    elements: View.Vocabulary<any> | undefined
  ) => void)(undefined)
)

describe("@effect/ui-opentui/register", () => {
  it.effect("registers OpenTui tags globally on h", () =>
    Effect.gen(function*() {
      expect(View.registeredElements()).toBeUndefined()

      yield* Effect.promise(() => import("@effect/ui-opentui/register"))
      expect(View.registeredElements()).toBe(OpenTui)

      const Hello = Component.define({
        name: "Hello",
        model: Schema.Void,
        message: Schema.Never
      }).make({
        init: () => undefined,
        update: () => undefined,
        view: (h) => h.box.style({ border: true }).children(h.text("hello"))
      })

      const root = yield* TestHost.mount(Hello, {})
      yield* TestHost.settle
      expect(root.text()).toBe("hello")
    }).pipe(
      Effect.provide(Layer.merge(TestHost.layer(), TestOpenTuiEvents.layer)),
      Effect.ensuring(unregister)
    ))
})
