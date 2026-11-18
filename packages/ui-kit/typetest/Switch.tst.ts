import { Component, type View } from "@effect/ui"
import { Switch } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = Schema.TaggedUnion({ Clicked: {}, Toggled: { checked: Schema.Boolean } })
type Msg = typeof Msg.Type
const Other = Schema.TaggedUnion({ Pressed: {} })

declare const needsClock: View.Child<never, Clock>

describe("Switch", () => {
  it("returns what view returns, with the consumer's message type and the children's requirements", () => {
    Component.define({ name: "App", model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => {
        const root = Switch(h, {
          props: { checked: false },
          onToggle: ({ checked }) => Msg.make({ _tag: "Toggled", checked }),
          view: (s) => {
            expect(s.root({ element: h.button })).type.toBe<View.Element<Msg, never>>()
            // Finished with `children`, or the builder for another call's `element`.
            expect(s.thumb({ element: h.span, children: [needsClock] })).type.toBe<View.Element<Msg, Clock>>()
            expect(s.thumb(h.span.class("thumb"))).type.toBe<
              Html.Element<Msg, never, Html.EventsOf<"span">, HTMLSpanElement, "span">
            >()
            return s.root({
              element: h.button.on("focus", Msg.make({ _tag: "Clicked" })),
              children: [s.thumb(h.span.class("thumb")), needsClock]
            })
          }
        })
        expect(root).type.toBe<View.Element<Msg, Clock>>()
        return root
      }
    })
  })

  it("root takes only a button in an options object, and onToggle only the consumer's message", () => {
    Component.define({ name: "App", model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => {
        expect(Switch).type.not.toBeCallableWith(h, {
          props: { checked: false },
          onToggle: () => Other.make({ _tag: "Pressed" }),
          view: () => h.br
        })
        return Switch(h, {
          props: { checked: false },
          view: (s) => {
            expect(s.root).type.not.toBeCallableWith({ element: h.span })
            expect(s.root).type.not.toBeCallableWith(h.button)
            expect(s.thumb).type.not.toBeCallableWith(h.div)
            expect(s.thumb).type.not.toBeCallableWith({ element: h.div })
            return s.root({ element: h.button })
          }
        })
      }
    })
  })
})
