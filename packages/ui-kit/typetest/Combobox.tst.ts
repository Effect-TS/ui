import { type Component, UiSchema } from "@effect/ui"
import {
  Combobox,
  type ComboboxEvents,
  type ComboboxValue,
  Field
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

type Button = Html.Element<
  Msg,
  never,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>
type Div = Html.Element<Msg, never, Html.EventsOf<"div">, HTMLDivElement, "div">
type Span = Html.Element<
  Msg,
  never,
  Html.EventsOf<"span">,
  HTMLSpanElement,
  "span"
>
type Input = Html.VoidElement<
  Msg,
  never,
  Html.EventsOf<"input">,
  HTMLInputElement,
  "input"
>

const items = [{ value: "apple", label: "Apple" }]

describe("Combobox", () => {
  it("needs no service", () => {
    expect<Component.Headless.Requirements<typeof Combobox>>().type.toBe<
      never
    >()
  })

  it("picks a string, the strings of a multiple combobox, or nothing, and reports the text", () => {
    expect<Extract<ComboboxEvents, { readonly _tag: "Picked" }>["value"]>().type
      .toBe<ComboboxValue>()
    expect<ComboboxValue>().type.toBe<string | ReadonlyArray<string> | null>()
    expect<
      Extract<
        ComboboxEvents,
        { readonly _tag: "RequestedInputValue" }
      >["inputValue"]
    >().type.toBe<string>()
  })

  it("each part returns the builder it was given, and the parts that can hide return undefined too", () => {
    Html.component({
      name: "App",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Combobox(h, {
          key: "c",
          props: { open: false, inputValue: "", items },
          view: (combobox) => {
            expect(combobox.input(h.input)).type.toBe<Input>()
            expect(combobox.trigger(h.button.onClick(Msg.Clicked()))).type.toBe<
              Button
            >()
            expect(combobox.inputGroup(h.div)).type.toBe<Div>()
            expect(combobox.value(h.span)).type.toBe<Span>()
            expect(combobox.positioner(h.div)).type.toBe<Div>()
            expect(combobox.list(h.div)).type.toBe<Div>()
            expect(combobox.item({ element: h.div, value: "apple" })).type.toBe<
              Div
            >()
            expect(combobox.chip({ element: h.div, value: "apple" })).type.toBe<
              Div
            >()
            expect(combobox.chipRemove({ element: h.button, value: "apple" }))
              .type.toBe<Button>()
            expect(combobox.group({ element: h.div, group: "fruit" })).type
              .toBe<Div>()
            expect(combobox.clear({ element: h.button })).type.toBe<
              Button | undefined
            >()
            expect(combobox.clear({ element: h.button, keepMounted: true }))
              .type.toBe<Button | undefined>()
            expect(combobox.itemIndicator({ element: h.span, value: "apple" }))
              .type.toBe<Span | undefined>()
            return combobox.input(h.input)
          }
        })
    })
  })

  it("the input takes only an input, the trigger only a button, and an item needs its value", () => {
    Html.component({
      name: "App",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Combobox(h, {
          key: "c",
          props: { open: false, inputValue: "", items },
          view: (combobox) => {
            expect(combobox.input).type.not.toBeCallableWith(h.div)
            expect(combobox.trigger).type.not.toBeCallableWith(h.a)
            expect(combobox.item).type.not.toBeCallableWith({ element: h.div })
            expect(combobox.item).type.not.toBeCallableWith(h.div, "apple")
            expect(combobox.clear).type.not.toBeCallableWith(h.button)
            return combobox.input(h.input)
          }
        })
    })
  })

  it("draws its input with a field's control", () => {
    Html.component({
      name: "App",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Field(h, {
          props: {},
          view: (field) =>
            Combobox(h, {
              key: "c",
              props: { open: false, inputValue: "", items },
              view: (combobox) => combobox.input(field.control(h.input))
            })
        })
    })
  })

  it("requires open, inputValue and items, and filter is a literal", () => {
    Html.component({
      name: "App",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => {
        Combobox(h, {
          key: "c",
          // @ts-expect-error Property 'inputValue' is missing
          props: { open: false, items },
          view: (combobox) => combobox.input(h.input)
        })
        Combobox(h, {
          key: "d",
          props: {
            open: false,
            inputValue: "",
            items,
            // @ts-expect-error Type '(item: string) => boolean' is not assignable
            filter: (item: string) => item !== ""
          },
          view: (combobox) => combobox.input(h.input)
        })
        return h.div
      }
    })
  })
})
