import { Component, UiSchema, type View } from "@effect/ui"
import { Checkbox, CheckboxGroup, type CheckboxGroupEvents, type CheckboxGroupProps } from "@effect/ui-kit"
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

describe("CheckboxGroup", () => {
  it("the root returns the builder it was given, of any tag, with the consumer's message type and the children's requirements", () => {
    Component.define({ name: "App", scoped: false, model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        CheckboxGroup(h, {
          props: { value: ["a"], allValues: ["a", "b"] },
          view: (checkboxGroup) => {
            expect(checkboxGroup.value).type.toBe<ReadonlyArray<string>>()
            expect(checkboxGroup.disabled).type.toBe<boolean>()
            expect(checkboxGroup.root(h.fieldset)).type.toBe<Element<"fieldset">>()
            const root = checkboxGroup.root(h.div.onClick(Msg.Clicked())).children(
              Checkbox(h, { props: { parent: true }, view: (checkbox) => checkbox.root(h.button) }),
              Checkbox(h, { key: "a", props: { value: "a" }, view: (checkbox) => checkbox.root(h.button) }),
              needsClock
            )
            expect(root).type.toBe<Element<"div", Clock>>()
            return root
          }
        })
    })
  })

  it("the group and checkbox need no service, and the group emits Updated and requires value", () => {
    expect<Component.Headless.Requirements<typeof CheckboxGroup>>().type.toBe<never>()
    expect<Component.Headless.Requirements<typeof Checkbox>>().type.toBe<never>()
    expect<CheckboxGroupEvents>().type.toBe<{ readonly _tag: "Updated"; readonly value: ReadonlyArray<string> }>()
    expect({ value: [] }).type.toBeAssignableTo<CheckboxGroupProps>()
    expect({ allValues: ["a"] }).type.not.toBeAssignableTo<CheckboxGroupProps>()
  })
})
