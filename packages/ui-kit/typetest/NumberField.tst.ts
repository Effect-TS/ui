import { Component, Mount, UiSchema, View } from "@effect/ui"
import { Field, NumberField, type NumberFieldEvents } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const NeedsClock = Mount.make(
  "NeedsClock",
  { args: {} },
  () => Clock.use(() => Effect.succeed(Component.noop))
)

const Msg = UiSchema.TaggedEnum({
  Clicked: {},
  Changed: { value: Schema.NullOr(Schema.Number) }
})
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Div<R> = Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">
type Span<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"span">,
  HTMLSpanElement,
  "span"
>
type Label<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"label">,
  HTMLLabelElement,
  "label"
>
type Button<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>
type Input<R> = Html.VoidElement<
  Msg,
  R,
  Html.EventsOf<"input">,
  HTMLInputElement,
  "input"
>

const h = View.makeHelper<Msg, {}, Html.Elements>({}, Html)

describe("NumberField", () => {
  it("preserves the consumer's builders and requirements, including those of a Field control", () => {
    expect<Component.Headless.Requirements<typeof NumberField>>().type.toBe<
      never
    >()
    Field(h, {
      view: (field) => {
        const child = NumberField(h, {
          props: { value: 40, disabled: field.disabled },
          view: (numberField) => {
            expect(numberField.root(h.div)).type.toBe<Div<never>>()
            expect(numberField.group(h.div).children(needsClock)).type.toBe<
              Div<Clock>
            >()
            expect(numberField.input(h.input)).type.toBe<Input<never>>()
            expect(numberField.decrement({ element: h.button })).type.toBe<
              Button<never>
            >()
            expect(
              numberField.increment({
                element: h.button.onClick(Msg.Clicked()),
                disabled: true
              })
            )
              .type.toBe<Button<never>>()
            expect(numberField.scrubArea({ element: h.span })).type.toBe<
              Span<never>
            >()
            expect(
              numberField.scrubArea({
                element: h.label,
                direction: "vertical",
                pixelSensitivity: 4
              })
            )
              .type.toBe<Label<never>>()
            expect(numberField.scrubAreaCursor(h.span)).type.toBe<
              Span<never> | undefined
            >()
            expect(numberField.value).type.toBe<number | null>()
            expect(numberField.inputValue).type.toBe<string>()
            expect(numberField.scrubbing).type.toBe<boolean>()
            const input = numberField.input(
              field.control(h.input.onMount(NeedsClock()))
            )
            expect(input).type.toBe<Input<Clock>>()
            return numberField.root(field.root(h.div)).children(input)
          }
        })
        expect<View.Requirements<typeof child>>().type.toBe<Clock>()
        return child
      }
    })
  })

  it("reports the value as a number or null, with the reason for it", () => {
    NumberField(h, {
      props: { value: null },
      onEmit: {
        Updated: (event) => {
          expect(event.value).type.toBe<number | null>()
          expect(event.direction).type.toBe<-1 | 1 | undefined>()
          expect(event.reason).type.toBe<
            | "input-change"
            | "input-clear"
            | "input-paste"
            | "input-blur"
            | "keyboard"
            | "increment-press"
            | "decrement-press"
            | "wheel"
            | "scrub"
            | "none"
          >()
          return Msg.Changed({ value: event.value })
        },
        Committed: (event) => {
          expect(event.reason).type.toBe<
            | "input-blur"
            | "input-clear"
            | "keyboard"
            | "increment-press"
            | "decrement-press"
            | "wheel"
            | "scrub"
          >()
          return Msg.Changed({ value: event.value })
        }
      },
      view: (numberField) => numberField.root(h.div)
    })
    expect<Extract<NumberFieldEvents, { _tag: "Committed" }>["value"]>().type
      .toBe<number | null>()
  })

  it("requires a numeric value, known format options and the correct native elements", () => {
    expect(NumberField).type.not.toBeCallableWith(h, {
      props: { value: "40" },
      view: () => h.div
    })
    expect(NumberField).type.not.toBeCallableWith(h, {
      props: {},
      view: () => h.div
    })
    expect(NumberField).type.not.toBeCallableWith(h, {
      props: { value: 1, format: { style: "money" } },
      view: () => h.div
    })
    expect(NumberField).type.not.toBeCallableWith(h, {
      props: { value: 1, step: "some" },
      view: () => h.div
    })
    NumberField(h, {
      props: {
        value: 1,
        step: "any",
        locale: ["de-CH", "de"],
        format: { style: "currency", currency: "CHF" }
      },
      view: (numberField) => {
        expect(numberField.input).type.not.toBeCallableWith(h.div)
        expect(numberField.input).type.not.toBeCallableWith({
          element: h.input
        })
        expect(numberField.decrement).type.not.toBeCallableWith(h.button)
        expect(numberField.increment).type.not.toBeCallableWith({
          element: h.div
        })
        expect(numberField.scrubArea).type.not.toBeCallableWith(h.span)
        expect(numberField.scrubArea).type.not.toBeCallableWith({
          element: h.span,
          direction: "diagonal"
        })
        expect(numberField.scrubAreaCursor).type.not.toBeCallableWith({
          element: h.span
        })
        return numberField.root(h.div)
      }
    })
  })
})
