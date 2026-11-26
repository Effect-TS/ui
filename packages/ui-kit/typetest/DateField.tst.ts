import { Component, Mount, UiSchema, View } from "@effect/ui"
import { DateField, type DateFieldEvents, Field } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, type DateTime, Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const NeedsClock = Mount.make(
  "NeedsClock",
  { args: {} },
  () => Clock.use(() => Effect.succeed(Component.noop))
)

const Msg = UiSchema.TaggedEnum({
  CommittedDate: { date: Schema.NullOr(Schema.DateTimeUtc) }
})
type Msg = typeof Msg.Type

type Input<R> = Html.VoidElement<
  Msg,
  R,
  Html.EventsOf<"input">,
  HTMLInputElement,
  "input"
>

const h = View.makeHelper<Msg, {}, Html.Elements>({}, Html)

declare const utcDate: DateTime.Utc
declare const zonedDate: DateTime.Zoned

describe("DateField", () => {
  it("preserves the consumer's input builder, requirements, and part values", () => {
    expect<Component.Headless.Requirements<typeof DateField>>().type.toBe<
      never
    >()
    Field(h, {
      view: (field) => {
        const child = DateField(h, {
          props: { value: zonedDate, disabled: field.disabled },
          view: (dateField) => {
            expect(dateField.input(h.input)).type.toBe<Input<never>>()
            expect(dateField.value).type.toBe<DateTime.Utc | null>()
            expect(dateField.inputValue).type.toBe<string>()
            expect(dateField.pattern).type.toBe<string>()
            expect(dateField.disabled).type.toBe<boolean>()
            expect(dateField.readOnly).type.toBe<boolean>()
            expect(dateField.required).type.toBe<boolean>()
            const input = dateField.input(
              field.control(h.input.onMount(NeedsClock()))
            )
            expect(input).type.toBe<Input<Clock>>()
            return field.root(h.div).children(input)
          }
        })
        expect<View.Requirements<typeof child>>().type.toBe<Clock>()
        return child
      }
    })
  })

  it("emits Committed with a normalized DateTime.Utc or null", () => {
    DateField(h, {
      props: { value: utcDate, locale: ["en-GB", "en"] },
      onEmit: {
        Committed: (event) => {
          expect(event.date).type.toBe<DateTime.Utc | null>()
          return Msg.CommittedDate({ date: event.date })
        }
      },
      view: (dateField) => dateField.input(h.input)
    })
    expect<Extract<DateFieldEvents, { _tag: "Committed" }>["date"]>().type
      .toBe<DateTime.Utc | null>()
  })

  it("requires a DateTime or null value and an input element", () => {
    expect(DateField).type.not.toBeCallableWith(h, {
      props: { value: "2026-11-26" },
      view: () => h.div
    })
    expect(DateField).type.not.toBeCallableWith(h, {
      props: { value: new Date() },
      view: () => h.div
    })
    expect(DateField).type.not.toBeCallableWith(h, {
      props: {},
      view: () => h.div
    })
    DateField(h, {
      props: { value: null },
      view: (dateField) => {
        expect(dateField.input).type.not.toBeCallableWith(h.div)
        expect(dateField.input).type.not.toBeCallableWith({ element: h.input })
        return dateField.input(h.input)
      }
    })
  })
})
