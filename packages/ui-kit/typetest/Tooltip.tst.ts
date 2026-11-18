import { Component } from "@effect/ui"
import { Tooltip } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

const Msg = Schema.TaggedUnion({ Clicked: {} })
type Msg = typeof Msg.Type

type Button = Html.Element<Msg, never, Html.EventsOf<"button">, HTMLButtonElement, "button">
type Div = Html.Element<Msg, never, Html.EventsOf<"div">, HTMLDivElement, "div">

describe("Tooltip", () => {
  it("each part returns the builder it was given, with the consumer's message type", () => {
    Component.define({ name: "App", model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Tooltip(h, {
          key: "t",
          props: { open: false },
          view: (s) => {
            const trigger = s.trigger(h.button.class("tool").onClick(Msg.make({ _tag: "Clicked" })))
            expect(trigger).type.toBe<Button>()
            expect(s.positioner(h.div)).type.toBe<Div>()
            expect(s.popup(h.div)).type.toBe<Div>()
            expect(s.arrow(h.div)).type.toBe<Div>()
            return h.span(trigger.children("B"), s.positioner(h.div).children(s.popup(h.div).children("Bold")))
          }
        })
    })
  })

  it("the trigger takes only a button, and the other parts only a div", () => {
    Component.define({ name: "App", model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Tooltip(h, {
          key: "t",
          props: { open: false },
          view: (s) => {
            expect(s.trigger).type.not.toBeCallableWith(h.a)
            expect(s.positioner).type.not.toBeCallableWith(h.span)
            expect(s.popup).type.not.toBeCallableWith(h.span)
            expect(s.arrow).type.not.toBeCallableWith(h.span)
            return s.trigger(h.button)
          }
        })
    })
  })
})
