import { Component, UiSchema, type View } from "@effect/ui"
import { Checkbox, Field, Input, type InputElement, Switch } from "@effect/ui-kit"
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
          view: (f) => {
            expect(f.legend(h.div)).type.toBe<Element<"div">>()
            expect(f.group(h.fieldset)).type.toBe<Element<"fieldset">>()
            expect(f.member(h.input)).type.toBe<InputElement<Msg>>()
            expect(f.focused).type.toBe<boolean>()
            expect(f.label(h.label.class("label"))).type.toBe<Element<"label">>()
            expect(f.control(h.input)).type.toBe<InputElement<Msg>>()
            expect(f.control(h.textarea.onClick(Msg.Clicked()))).type.toBe<Element<"textarea">>()
            expect(f.control(h.select)).type.toBe<Element<"select">>()
            expect(f.control(h.button)).type.toBe<Element<"button">>()
            expect(f.description(h.p).children(needsClock)).type.toBe<Element<"p", Clock>>()
            const error = f.error(h.div)?.children("Required", needsClock)
            expect(error).type.toBe<Element<"div", Clock> | undefined>()
            const root = f.root(h.section).children(f.label(h.label), f.control(h.input), error)
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
          view: (f) => {
            expect(Input(h, { element: f.control(h.input), props: { value: "" } })).type.toBe<InputElement<Msg>>()
            return f.root(h.div).children(
              Checkbox(h, { props: { checked: false }, view: (s) => s.root(f.control(h.button)) }),
              Switch(h, { props: { checked: false }, view: (s) => s.root(f.control(h.button)) })
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
          view: (f) => {
            expect(f.label).type.not.toBeCallableWith(h.span)
            expect(f.label).type.not.toBeCallableWith({ element: h.label })
            expect(f.control).type.not.toBeCallableWith(h.div)
            expect(f.control).type.not.toBeCallableWith({ element: h.input })
            expect(f.member).type.not.toBeCallableWith(h.div)
            expect(f.description).type.not.toBeCallableWith({ element: h.p })
            expect(f.error).type.not.toBeCallableWith({ element: h.div })
            return f.root(h.div)
          }
        })
    })
  })

  it("a field needs no service", () => {
    expect<Component.Headless.Requirements<typeof Field>>().type.toBe<never>()
  })
})
