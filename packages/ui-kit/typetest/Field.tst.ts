import { Component, UiSchema, type Validation, type View } from "@effect/ui"
import {
  Checkbox,
  Field,
  type FieldProps,
  fieldValidationProps,
  Input,
  type InputElement,
  Switch
} from "@effect/ui-kit"
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

describe("Field", () => {
  it("each part returns the builder it was given, with the consumer's message type and the children's requirements", () => {
    Component.define({ name: "App", scoped: false, model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Field(h, {
          props: { described: true },
          view: (field) => {
            expect(field.legend(h.div)).type.toBe<Element<"div">>()
            expect(field.group(h.fieldset)).type.toBe<Element<"fieldset">>()
            expect(field.focusWithin(h.div)).type.toBe<Element<"div">>()
            expect(field.member(h.input)).type.toBe<InputElement<Msg>>()
            expect(field.focused).type.toBe<boolean>()
            expect(field.label(h.label.class("label"))).type.toBe<Element<"label">>()
            expect(field.control(h.input)).type.toBe<InputElement<Msg>>()
            expect(field.control(h.textarea.onClick(Msg.Clicked()))).type.toBe<Element<"textarea">>()
            expect(field.control(h.select)).type.toBe<Element<"select">>()
            expect(field.control(h.button)).type.toBe<Element<"button">>()
            expect(field.description(h.p).children(needsClock)).type.toBe<Element<"p", Clock>>()
            const error = field.error(h.div)?.children("Required", needsClock)
            expect(error).type.toBe<Element<"div", Clock> | undefined>()
            const root = field.root(h.section).children(field.label(h.label), field.control(h.input), error)
            expect(root).type.toBe<Element<"section", Clock>>()
            return root
          }
        })
    })
  })

  it("the control is another kit call's element", () => {
    Component.define({ name: "App", scoped: false, model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Field(h, {
          view: (field) => {
            expect(Input(h, { element: field.control(h.input), props: { value: "" } })).type.toBe<InputElement<Msg>>()
            return field.root(h.div).children(
              Checkbox(h, { props: { checked: false }, view: (checkbox) => checkbox.root(field.control(h.button)) }),
              Switch(h, { props: { checked: false }, view: (parts) => parts.root(field.control(h.button)) })
            )
          }
        })
    })
  })

  it("the label takes only a label, and the control only a form control", () => {
    Component.define({ name: "App", scoped: false, model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Field(h, {
          view: (field) => {
            expect(field.label).type.not.toBeCallableWith(h.span)
            expect(field.label).type.not.toBeCallableWith({ element: h.label })
            expect(field.control).type.not.toBeCallableWith(h.div)
            expect(field.control).type.not.toBeCallableWith({ element: h.input })
            expect(field.member).type.not.toBeCallableWith(h.div)
            expect(field.description).type.not.toBeCallableWith({ element: h.p })
            expect(field.error).type.not.toBeCallableWith({ element: h.div })
            return field.root(h.div)
          }
        })
    })
  })

  it("a field needs no service", () => {
    expect<Component.Headless.Requirements<typeof Field>>().type.toBe<never>()
  })

  it("fieldValidationProps accepts any Validation.Field and spreads into FieldProps", () => {
    const props = fieldValidationProps({} as Validation.Field<boolean>)
    expect(props).type.toBe<{ readonly invalid: boolean | undefined; readonly filled: boolean }>()
    expect({ ...props, disabled: true }).type.toBeAssignableTo<FieldProps>()
  })
})
