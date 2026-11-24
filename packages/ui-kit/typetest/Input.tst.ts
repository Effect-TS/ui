import { UiSchema } from "@effect/ui"
import { Input, type InputElement } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = UiSchema.TaggedEnum({ UpdatedName: { value: Schema.String } })
// An input whose mount needs a service, as a stacked part's might.
declare const needsClock: InputElement<typeof Msg.Type, Clock>

const Other = UiSchema.TaggedEnum({ UpdatedOther: { value: Schema.String } })

describe("Input", () => {
  it("returns an input of the caller's message type, keeps the element's requirements, and rejects another tag or message", () => {
    Html.component({
      name: "App",
      model: Schema.String,
      message: Msg
    }).make({
      init: () => "",
      update: ($) => $.model,
      view: (h, model) => {
        const onUpdate = ({ value }: { readonly value: string }) =>
          Msg.UpdatedName({ value })
        expect(Input(h, { props: { value: model }, onUpdate })).type.toBe<
          InputElement<typeof Msg.Type>
        >()
        expect(
          Input(h, { element: needsClock, props: { value: model }, onUpdate })
        ).type.toBe<
          InputElement<typeof Msg.Type, Clock>
        >()
        expect(Input).type.not.toBeCallableWith(h, {
          element: h.textarea,
          props: { value: model }
        })
        expect(Input).type.not.toBeCallableWith(h, {
          props: { value: model },
          onUpdate: ({ value }: { readonly value: string }) =>
            Other.UpdatedOther({ value })
        })
        expect(Input).type.not.toBeCallableWith(h, { onUpdate })
        return Input(h, { props: { value: model }, onUpdate }).attr(
          "aria-label",
          "Name"
        )
      }
    })
  })
})
