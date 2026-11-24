import { Component, Mount, UiSchema, View } from "@effect/ui"
import {
  type DirectionProvider,
  Field,
  OTPField,
  type OTPFieldEvents
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Effect, Redacted } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const NeedsClock = Mount.make(
  "NeedsClock",
  { args: {} },
  () => Clock.use(() => Effect.succeed(Component.noop))
)

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Div<R> = Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">
type Input<R> = Html.VoidElement<
  Msg,
  R,
  Html.EventsOf<"input">,
  HTMLInputElement,
  "input"
>

const h = View.makeHelper<Msg, {}, Html.Elements>({}, Html)

describe("OTPField", () => {
  it("needs no provider: its read of a DirectionProvider is optional", () => {
    expect<Component.Headless.Requirements<typeof OTPField>>().type.toBe<
      never
    >()
    expect<Component.Headless.Requirements<typeof DirectionProvider>>().type
      .toBe<never>()
  })

  it("each part returns the builder it was given, with the consumer's message type and requirements", () => {
    Field(h, {
      view: (field) => {
        const child = OTPField(h, {
          props: {
            value: Redacted.make("12"),
            length: 6,
            disabled: field.disabled
          },
          onEmit: {
            Updated: (event) => {
              expect(event.value).type.toBe<Redacted.Redacted<string>>()
              expect(event.reason).type.toBe<
                "input-change" | "input-clear" | "input-paste" | "keyboard"
              >()
              return Msg.Clicked()
            },
            Completed: (event) => {
              expect(event).type.toBe<
                Extract<OTPFieldEvents, { readonly _tag: "Completed" }>
              >()
              expect(event.value).type.toBe<Redacted.Redacted<string>>()
              expect(event.reason).type.toBe<"input-change" | "input-paste">()
              return undefined
            },
            Rejected: (event) => {
              expect(event.value).type.toBe<Redacted.Redacted<string>>()
              return undefined
            }
          },
          view: (otpField) => {
            expect(otpField.root(h.div.onClick(Msg.Clicked()))).type.toBe<
              Div<never>
            >()
            expect(otpField.root(field.group(h.div)).children([needsClock]))
              .type
              .toBe<Div<Clock>>()
            expect(otpField.input({ element: h.input, index: 0 })).type.toBe<
              Input<never>
            >()
            expect(
              otpField.input({
                element: field.member(h.input.onMount(NeedsClock())),
                index: 1
              })
            )
              .type.toBe<Input<Clock>>()
            expect(otpField.value).type.toBe<Redacted.Redacted<string>>()
            expect(otpField.length).type.toBe<number>()
            expect(otpField.complete).type.toBe<boolean>()
            return otpField.root(h.div).children([
              otpField.input({
                element: h.input.onMount(NeedsClock()),
                index: 2
              })
            ])
          }
        })
        expect<View.Requirements<typeof child>>().type.toBe<Clock>()
        return child
      }
    })
  })

  it("requires a redacted string value, a length, an input for each slot and its index", () => {
    expect(OTPField).type.not.toBeCallableWith(h, {
      props: { value: "123456", length: 6 },
      view: () => h.div
    })
    expect(OTPField).type.not.toBeCallableWith(h, {
      props: { value: 123456, length: 6 },
      view: () => h.div
    })
    expect(OTPField).type.not.toBeCallableWith(h, {
      props: { value: Redacted.make("") },
      view: () => h.div
    })
    expect(OTPField).type.not.toBeCallableWith(h, {
      props: { value: Redacted.make(""), length: 6, validationType: "hex" },
      view: () => h.div
    })
    OTPField(h, {
      props: { value: Redacted.make(""), length: 6 },
      view: (otpField) => {
        expect(otpField.input).type.not.toBeCallableWith({
          element: h.div,
          index: 0
        })
        expect(otpField.input).type.not.toBeCallableWith({
          element: h.textarea,
          index: 0
        })
        expect(otpField.input).type.not.toBeCallableWith({ element: h.input })
        expect(otpField.input).type.not.toBeCallableWith(h.input)
        return otpField.root(h.div)
      }
    })
  })
})
