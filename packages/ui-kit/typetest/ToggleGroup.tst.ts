import { type Component, UiSchema, View } from "@effect/ui"
import { makeToggleGroup, ToggleGroup } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = UiSchema.TaggedEnum({
  ToggledAlign: { value: Schema.Array(Schema.String) },
  Clicked: {}
})
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Button<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>
type Div<R> = Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">

const props = {
  value: ["left"],
  items: [{ value: "left" }, { value: "right" }]
}

describe("ToggleGroup", () => {
  it("each part returns the builder it was given, with the consumer's message type and the children's requirements", () => {
    Html.component({
      name: "App",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        ToggleGroup(h, {
          props,
          onEmit: ({ value }) => Msg.ToggledAlign({ value }),
          view: (toggleGroup) => {
            expect(toggleGroup.item({ element: h.button, value: "left" })).type
              .toBe<Button<never>>()
            expect(
              toggleGroup.item({
                element: h.button.on("click", Msg.Clicked()),
                value: "right"
              }).children(needsClock)
            )
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
    Html.component({
      name: "App",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => {
        expect(ToggleGroup).type.not.toBeCallableWith(h, {
          props,
          onEmit: () => UiSchema.TaggedEnum({ Other: {} }).Other(),
          view: (toggleGroup: Component.Headless.Parts<typeof ToggleGroup>) =>
            toggleGroup.root(h.div)
        })
        expect(ToggleGroup).type.not.toBeCallableWith(h, {
          props: { value: [] },
          view: (toggleGroup: Component.Headless.Parts<typeof ToggleGroup>) =>
            toggleGroup.root(h.div)
        })
        return ToggleGroup(h, {
          props,
          view: (toggleGroup) => {
            expect(toggleGroup.root).type.not.toBeCallableWith(h.span)
            expect(toggleGroup.root).type.not.toBeCallableWith({
              element: h.div
            })
            expect(toggleGroup.item).type.not.toBeCallableWith({
              element: h.div,
              value: "left"
            })
            expect(toggleGroup.item).type.not.toBeCallableWith({
              element: h.button
            })
            expect(toggleGroup.item).type.not.toBeCallableWith(h.button, "left")
            return toggleGroup.root(h.div)
          }
        })
      }
    })
  })

  it("makeToggleGroup types the value, items, parts and Toggled with its schema", () => {
    const Align = Schema.Literals(["left", "right"])
    const AlignMsg = UiSchema.TaggedEnum({
      Aligned: { value: Schema.Array(Align) }
    })
    const h = View.makeHelper<typeof AlignMsg.Type, {}, Html.Elements>(
      {},
      Html
    )
    const AlignToggleGroup = makeToggleGroup({ value: Align })
    const items = Align.literals.map((value) => ({ value }))
    AlignToggleGroup(h, {
      props: { value: ["left"], items },
      onEmit: ({ value }) => AlignMsg.Aligned({ value }),
      view: (toggleGroup) => {
        expect(toggleGroup.item).type.not.toBeCallableWith({
          element: h.button,
          value: "center"
        })
        return toggleGroup.root(h.div)
      }
    })
    expect(AlignToggleGroup).type.not.toBeCallableWith(h, {
      props: { value: ["center"], items },
      view: () => h.div
    })
    expect(AlignToggleGroup).type.not.toBeCallableWith(h, {
      props: { value: [], items: [{ value: "center" }] },
      view: () => h.div
    })
  })
})
