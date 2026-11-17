import { Component, type View } from "@effect/ui"
import { Switch } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = Schema.TaggedUnion({ Clicked: {} })
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

describe("Switch", () => {
  it("root infers the consumer's message type and the children's requirements, and thumb returns the chain", () => {
    Component.define({ name: "App", model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Switch(h, {
          key: "s",
          props: { checked: false },
          view: (s) => {
            expect(s.thumb(h.span.class("thumb"))).type.toBe<
              Html.Element<Msg, never, Html.EventsOf<"span">, HTMLSpanElement, "span">
            >()
            expect(s.root({ element: h.button })).type.toBe<View.Element<Msg, never>>()
            const root = s.root({
              element: h.button.onClick(Msg.make({ _tag: "Clicked" })),
              children: [s.thumb(h.span), needsClock]
            })
            expect(root).type.toBe<View.Element<Msg, Clock>>()
            return root
          }
        })
    })
  })

  it("root takes only a button, in an options object", () => {
    Component.define({ name: "App", model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Switch(h, {
          key: "s",
          props: { checked: false },
          view: (s) => {
            expect(s.root).type.not.toBeCallableWith({ element: h.span })
            expect(s.root).type.not.toBeCallableWith(h.button)
            expect(s.thumb).type.not.toBeCallableWith(h.div)
            return s.root({ element: h.button })
          }
        })
    })
  })
})
