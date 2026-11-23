import { Component, UiSchema, type View } from "@effect/ui"
import { ToggleGroup } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = UiSchema.TaggedEnum({ ToggledAlign: { value: Schema.Array(Schema.String) }, Clicked: {} })
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Button<R> = Html.Element<Msg, R, Html.EventsOf<"button">, HTMLButtonElement, "button">
type Div<R> = Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">

const props = { value: ["left"], items: [{ value: "left" }, { value: "right" }] }

describe("ToggleGroup", () => {
  it("each part returns the builder it was given, with the consumer's message type and the children's requirements", () => {
    Component.define({ name: "App", scoped: false, model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        ToggleGroup(h, {
          props,
          onEmit: ({ value }) => Msg.ToggledAlign({ value }),
          view: (toggleGroup) => {
            expect(toggleGroup.item({ element: h.button, value: "left" })).type.toBe<Button<never>>()
            expect(toggleGroup.item({ element: h.button.onClick(Msg.Clicked()), value: "right" }).children(needsClock))
              .type.toBe<Button<Clock>>()
            const root = toggleGroup.root(h.div.class("group")).children(
              toggleGroup.item({ element: h.button, value: "left" }),
              needsClock
            )
            expect(root).type.toBe<Div<Clock>>()
            return root
          }
        })
    })
  })

  it("root takes only a div, item only a button with a value, and onEmit only the consumer's message", () => {
    Component.define({ name: "App", scoped: false, model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => {
        expect(ToggleGroup).type.not.toBeCallableWith(h, {
          props,
          onEmit: () => UiSchema.TaggedEnum({ Other: {} }).Other(),
          view: (toggleGroup: Component.Headless.Parts<typeof ToggleGroup>) => toggleGroup.root(h.div)
        })
        expect(ToggleGroup).type.not.toBeCallableWith(h, {
          props: { value: [] },
          view: (toggleGroup: Component.Headless.Parts<typeof ToggleGroup>) => toggleGroup.root(h.div)
        })
        return ToggleGroup(h, {
          props,
          view: (toggleGroup) => {
            expect(toggleGroup.root).type.not.toBeCallableWith(h.span)
            expect(toggleGroup.root).type.not.toBeCallableWith({ element: h.div })
            expect(toggleGroup.item).type.not.toBeCallableWith({ element: h.div, value: "left" })
            expect(toggleGroup.item).type.not.toBeCallableWith({ element: h.button })
            expect(toggleGroup.item).type.not.toBeCallableWith(h.button, "left")
            return toggleGroup.root(h.div)
          }
        })
      }
    })
  })
})
