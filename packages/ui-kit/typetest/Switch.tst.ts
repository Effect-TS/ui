import { Component, UiSchema, type View } from "@effect/ui"
import { Switch } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = UiSchema.TaggedEnum({
  Clicked: {},
  Toggled: { checked: Schema.Boolean }
})
type Msg = typeof Msg.Type
const Other = UiSchema.TaggedEnum({ Pressed: {} })

declare const needsClock: View.Child<never, Clock>

describe("Switch", () => {
  it("returns what view returns, with the consumer's message type and the children's requirements", () => {
    Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => {
        const root = Switch(h, {
          props: { checked: false },
          onToggle: ({ checked }) => Msg.Toggled({ checked }),
          view: (parts) => {
            type Button<R> = Html.Element<
              Msg,
              R,
              Html.EventsOf<"button">,
              HTMLButtonElement,
              "button"
            >
            // Each part returns the builder it was given, for children or another call's `element`.
            expect(parts.root(h.button)).type.toBe<Button<never>>()
            expect(parts.thumb(h.span.class("thumb")).children(needsClock)).type
              .toBe<
                Html.Element<
                  Msg,
                  Clock,
                  Html.EventsOf<"span">,
                  HTMLSpanElement,
                  "span"
                >
              >()
            return parts.root(h.button.on("focus", Msg.Clicked()))
              .children(parts.thumb(h.span.class("thumb")), needsClock)
          }
        })
        expect(root).type.toBe<
          Html.Element<
            Msg,
            Clock,
            Html.EventsOf<"button">,
            HTMLButtonElement,
            "button"
          >
        >()
        return root
      }
    })
  })

  it("root takes only a button, thumb only a span, and onToggle only the consumer's message", () => {
    Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => {
        expect(Switch).type.not.toBeCallableWith(h, {
          props: { checked: false },
          onToggle: () => Other.Pressed(),
          view: () => h.br
        })
        return Switch(h, {
          props: { checked: false },
          view: (parts) => {
            expect(parts.root).type.not.toBeCallableWith(h.span)
            expect(parts.root).type.not.toBeCallableWith({ element: h.button })
            expect(parts.thumb).type.not.toBeCallableWith(h.div)
            return parts.root(h.button)
          }
        })
      }
    })
  })
})
