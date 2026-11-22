import { Component, UiSchema } from "@effect/ui"
import { Autocomplete, type AutocompleteEvents, type AutocompleteMode, Field } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

type Button = Html.Element<Msg, never, Html.EventsOf<"button">, HTMLButtonElement, "button">
type Div = Html.Element<Msg, never, Html.EventsOf<"div">, HTMLDivElement, "div">
type Span = Html.Element<Msg, never, Html.EventsOf<"span">, HTMLSpanElement, "span">
type Input = Html.VoidElement<Msg, never, Html.EventsOf<"input">, HTMLInputElement, "input">

const items = [{ value: "apple", label: "Apple" }]

describe("Autocomplete", () => {
  it("needs no service", () => {
    expect<Component.Headless.Requirements<typeof Autocomplete>>().type.toBe<never>()
  })

  it("reports the text and never a selection", () => {
    expect<Extract<AutocompleteEvents, { readonly _tag: "Updated" }>["value"]>().type.toBe<string>()
    expect<AutocompleteEvents["_tag"]>().type.toBe<"Opened" | "Dismissed" | "Updated" | "Highlighted" | "Settled">()
    expect<Extract<AutocompleteEvents, { readonly _tag: "Updated" }>["reason"]>().type.not.toBeAssignableFrom<
      "chip-remove-press"
    >()
    expect<AutocompleteMode>().type.toBe<"list" | "both" | "inline" | "none">()
  })

  it("each part returns the builder it was given, and clear can return undefined", () => {
    Component.define({ name: "App", scoped: false, model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Autocomplete(h, {
          key: "a",
          props: { open: false, value: "", items },
          view: (autocomplete) => {
            expect(autocomplete.input(h.input)).type.toBe<Input>()
            expect(autocomplete.trigger(h.button.onClick(Msg.Clicked()))).type.toBe<Button>()
            expect(autocomplete.inputGroup(h.div)).type.toBe<Div>()
            expect(autocomplete.value(h.span)).type.toBe<Span>()
            expect(autocomplete.positioner(h.div)).type.toBe<Div>()
            expect(autocomplete.list(h.div)).type.toBe<Div>()
            expect(autocomplete.item(h.div, "apple")).type.toBe<Div>()
            expect(autocomplete.group(h.div, "fruit")).type.toBe<Div>()
            expect(autocomplete.clear(h.button)).type.toBe<Button | undefined>()
            expect(autocomplete).type.not.toHaveProperty("chips")
            expect(autocomplete).type.not.toHaveProperty("itemIndicator")
            expect(autocomplete).type.not.toHaveProperty("selected")
            return autocomplete.input(h.input)
          }
        })
    })
  })

  it("draws its input with a field's control", () => {
    Component.define({ name: "App", scoped: false, model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Field(h, {
          props: {},
          view: (field) =>
            Autocomplete(h, {
              key: "a",
              props: { open: false, value: "", items },
              view: (autocomplete) => autocomplete.input(field.control(h.input))
            })
        })
    })
  })

  it("requires open, value and items, and has no selection props", () => {
    Component.define({ name: "App", scoped: false, model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => {
        Autocomplete(h, {
          key: "a",
          // @ts-expect-error Property 'value' is missing
          props: { open: false, items },
          view: (autocomplete) => autocomplete.input(h.input)
        })
        Autocomplete(h, {
          key: "b",
          // @ts-expect-error Object literal may only specify known properties
          props: { open: false, value: "", items, multiple: true },
          view: (autocomplete) => autocomplete.input(h.input)
        })
        return h.div
      }
    })
  })
})
