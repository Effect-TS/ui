import { Component, UiSchema } from "@effect/ui"
import { Input, type InputElement } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

const Msg = UiSchema.TaggedEnum({ UpdatedName: { value: Schema.String } })
const Other = UiSchema.TaggedEnum({ UpdatedOther: { value: Schema.String } })

describe("Input", () => {
  it("returns an input of the caller's message type, and rejects another tag or message", () => {
    Component.define({ name: "App", model: Schema.String, message: Msg, elements: Html }).make({
      init: () => "",
      update: (model) => model,
      view: (model, h) => {
        const onUpdate = ({ value }: { readonly value: string }) => Msg.UpdatedName({ value })
        expect(Input(h, { props: { value: model }, onUpdate })).type.toBe<InputElement<typeof Msg.Type>>()
        expect(Input).type.not.toBeCallableWith(h, { element: h.textarea, props: { value: model } })
        expect(Input).type.not.toBeCallableWith(h, {
          props: { value: model },
          onUpdate: ({ value }: { readonly value: string }) => Other.UpdatedOther({ value })
        })
        expect(Input).type.not.toBeCallableWith(h, { onUpdate })
        return Input(h, { props: { value: model }, onUpdate }).attr("aria-label", "Name")
      }
    })
  })
})
