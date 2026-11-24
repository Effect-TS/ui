import { Component, UiSchema } from "@effect/ui"
import {
  Field,
  Select,
  type SelectEvents,
  type SelectValue
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

const items = [{ value: "light", label: "Light" }]

describe("Select", () => {
  it("needs no service", () => {
    expect<Component.Headless.Requirements<typeof Select>>().type.toBe<never>()
  })

  it("picks a string, the strings of a multiple select, or nothing", () => {
    expect<Extract<SelectEvents, { readonly _tag: "Picked" }>["value"]>().type
      .toBe<SelectValue>()
    expect<SelectValue>().type.toBe<string | ReadonlyArray<string> | null>()
  })

  it("each part returns the builder it was given, and the parts that can hide return undefined too", () => {
    Component.define({
      name: "App",
      scoped: false,
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Select(h, {
          key: "s",
          props: { open: false, items },
          view: (select) => {
            expect(select.trigger(h.button.onClick(Msg.Clicked()))).type.toBe<
              Button
            >()
            expect(select.value(h.span)).type.toBe<Span>()
            expect(select.label(h.div)).type.toBe<Div>()
            expect(select.positioner(h.div)).type.toBe<Div>()
            expect(select.popup(h.div)).type.toBe<Div>()
            expect(select.item({ element: h.div, value: "light" })).type.toBe<
              Div
            >()
            expect(select.group({ element: h.div, group: "all" })).type.toBe<
              Div
            >()
            expect(select.arrow(h.div)).type.toBe<Div | undefined>()
            expect(select.itemIndicator({ element: h.span, value: "light" }))
              .type.toBe<Span | undefined>()
            expect(
              select.itemIndicator({
                element: h.span,
                value: "light",
                keepMounted: true
              })
            ).type.toBe<
              Span | undefined
            >()
            expect(select.scrollUpArrow({ element: h.div, keepMounted: true }))
              .type.toBe<Div | undefined>()
            expect(select.finalFocus(h.button)).type.toBe<Button>()
            return select.trigger(h.button)
          }
        })
    })
  })

  it("the trigger takes only a button, and an item needs its value", () => {
    Component.define({
      name: "App",
      scoped: false,
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Select(h, {
          key: "s",
          props: { open: false, items },
          view: (select) => {
            expect(select.trigger).type.not.toBeCallableWith(h.a)
            expect(select.positioner).type.not.toBeCallableWith(h.span)
            expect(select.item).type.not.toBeCallableWith({ element: h.div })
            expect(select.item).type.not.toBeCallableWith(h.div, "light")
            expect(select.scrollUpArrow).type.not.toBeCallableWith(h.div)
            return select.trigger(h.button)
          }
        })
    })
  })

  it("draws its trigger with a field's member, inside the field's focusWithin", () => {
    Component.define({
      name: "App",
      scoped: false,
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Field(h, {
          props: {},
          view: (field) =>
            Select(h, {
              key: "s",
              props: { open: false, items },
              view: (select) =>
                field.focusWithin(h.div).children(
                  select.trigger(field.member(h.button)),
                  select.positioner(h.div)
                )
            })
        })
    })
  })

  it("requires open and items", () => {
    Component.define({
      name: "App",
      scoped: false,
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => {
        // @ts-expect-error Property 'items' is missing
        Select(h, {
          key: "s",
          props: { open: false },
          view: (select) => select.trigger(h.button)
        })
        return h.div
      }
    })
  })
})
