import { type Component, UiSchema, type View } from "@effect/ui"
import { Field, Fieldset, type FieldsetProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Element<K extends keyof HTMLElementTagNameMap, R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<K>,
  HTMLElementTagNameMap[K],
  K
>

describe("Fieldset", () => {
  it("each part returns the builder it was given, with the consumer's message type and the children's requirements", () => {
    Html.component({
      name: "App",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Fieldset(h, {
          props: { disabled: true },
          view: (fieldset) => {
            expect(fieldset.disabled).type.toBe<boolean>()
            expect(fieldset.legend(h.div.on("click", Msg.Clicked()))).type.toBe<
              Element<"div">
            >()
            expect(fieldset.legend(h.legend)).type.toBe<Element<"legend">>()
            const root = fieldset.root(h.fieldset.class("billing")).children(
              fieldset.legend(h.div),
              Field(h, {
                view: (field) =>
                  field.root(h.div).children(field.control(h.input))
              }),
              needsClock
            )
            expect(root).type.toBe<Element<"fieldset", Clock>>()
            return root
          }
        })
    })
  })

  it("the root takes only a fieldset", () => {
    Html.component({
      name: "App",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Fieldset(h, {
          view: (fieldset) => {
            expect(fieldset.root).type.not.toBeCallableWith(h.div)
            expect(fieldset.root).type.not.toBeCallableWith({
              element: h.fieldset
            })
            expect(fieldset.legend).type.not.toBeCallableWith({
              element: h.div
            })
            return fieldset.root(h.fieldset)
          }
        })
    })
  })

  it("a fieldset needs no service, and disabled is an optional boolean", () => {
    expect<Component.Headless.Requirements<typeof Fieldset>>().type.toBe<
      never
    >()
    expect({}).type.toBeAssignableTo<FieldsetProps>()
    expect({ disabled: null }).type.not.toBeAssignableTo<FieldsetProps>()
  })
})
