import { Component, UiSchema, type View } from "@effect/ui"
import { Toggle, type ToggleElement } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = UiSchema.TaggedEnum({ ToggledBold: { pressed: Schema.Boolean } })
const Other = UiSchema.TaggedEnum({ PressedOther: {} })

declare const needsClock: View.Child<never, Clock>

describe("Toggle", () => {
  it("returns a button of the consumer's message type, whose chained children keep their requirements", () => {
    Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => {
        const onToggle = ({ pressed }: { readonly pressed: boolean }) =>
          Msg.ToggledBold({ pressed })
        expect(Toggle(h, { props: { pressed: false }, onToggle })).type.toBe<
          ToggleElement<typeof Msg.Type>
        >()
        expect(
          Toggle(h, { props: { pressed: false } }).children("B", needsClock)
        ).type.toBe<
          ToggleElement<typeof Msg.Type, Clock>
        >()
        expect(Toggle).type.not.toBeCallableWith(h, {
          props: { pressed: false },
          element: h.span
        })
        expect(Toggle).type.not.toBeCallableWith(h, {
          props: { pressed: false },
          onToggle: () => Other.PressedOther()
        })
        expect(Toggle).type.not.toBeCallableWith(h, { onToggle })
        expect(Toggle).type.not.toBeCallableWith(h, { props: {} })
        return Toggle(h, { props: { pressed: false }, onToggle }).children("B")
      }
    })
  })
})
