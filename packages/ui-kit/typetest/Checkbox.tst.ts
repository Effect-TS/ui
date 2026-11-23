import { Component, UiSchema, type View } from "@effect/ui"
import { Checkbox } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Button<R> = Html.Element<Msg, R, Html.EventsOf<"button">, HTMLButtonElement, "button">
type Span<R> = Html.Element<Msg, R, Html.EventsOf<"span">, HTMLSpanElement, "span">

describe("Checkbox", () => {
  it("each part returns the builder it was given, with the consumer's message type and the children's requirements", () => {
    Component.define({ name: "App", scoped: false, model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Checkbox(h, {
          props: { checked: false },
          view: (checkbox) => {
            expect(checkbox.root(h.button)).type.toBe<Button<never>>()
            expect(checkbox.indicator(h.span.class("tick")).children(needsClock)).type.toBe<Span<Clock>>()
            const root = checkbox.root(h.button.onClick(Msg.Clicked()))
              .children(checkbox.indicator(h.span), needsClock)
            expect(root).type.toBe<Button<Clock>>()
            return root
          }
        })
    })
  })

  it("root takes only a button, and indicator only a span", () => {
    Component.define({ name: "App", scoped: false, model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Checkbox(h, {
          props: { checked: false },
          view: (checkbox) => {
            expect(checkbox.root).type.not.toBeCallableWith(h.span)
            expect(checkbox.root).type.not.toBeCallableWith({ element: h.button })
            expect(checkbox.indicator).type.not.toBeCallableWith(h.div)
            return checkbox.root(h.button)
          }
        })
    })
  })
})
