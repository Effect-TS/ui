import { Component, Mount, UiSchema, View } from "@effect/ui"
import {
  Field,
  makeRadioGroup,
  RadioGroup,
  type RadioGroupEvents,
  RadioGroupItem
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const NeedsClock = Mount.make(
  "NeedsClock",
  { args: {} },
  () => Clock.use(() => Effect.succeed(Component.noop))
)

const Msg = UiSchema.TaggedEnum({ Picked: { value: Schema.String } })
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Div<R> = Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">
type Button<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>
type Span<R> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"span">,
  HTMLSpanElement,
  "span"
>

const h = View.makeHelper<Msg, {}, Html.Elements>({}, Html)

describe("RadioGroup", () => {
  it("the exported schemas keep their concrete field schemas", () => {
    expect(RadioGroupItem.fields.value).type.toBe<typeof Schema.String>()
    expect(RadioGroupItem.make).type.not.toBeCallableWith({ value: 42 })
  })

  it("needs no provider: its read of a DirectionProvider is optional", () => {
    expect<Component.Headless.Requirements<typeof RadioGroup>>().type.toBe<
      never
    >()
  })

  it("each part preserves its builder, message type and requirements", () => {
    Field(h, {
      view: (field) => {
        const child = RadioGroup(h, {
          props: {
            value: "ssd",
            items: [{ value: "ssd" }, { value: "hdd", disabled: true }],
            disabled: field.disabled,
            invalid: field.invalid
          },
          onEmit: {
            Picked: (event) => {
              expect(event).type.toBe<RadioGroupEvents>()
              return Msg.Picked({ value: event.value })
            }
          },
          view: (radioGroup) => {
            expect(radioGroup.root(field.group(h.div)).children(needsClock))
              .type.toBe<Div<Clock>>()
            expect(
              radioGroup.radio({
                element: field.member(h.button.onMount(NeedsClock())),
                value: "ssd"
              })
            )
              .type.toBe<Button<Clock>>()
            expect(
              radioGroup.indicator({
                element: h.span.onMount(NeedsClock()),
                value: "ssd",
                keepMounted: true
              })
            )
              .type.toBe<Span<Clock> | undefined>()
            expect(radioGroup.value).type.toBe<string | null>()
            expect(radioGroup.disabled).type.toBe<boolean>()
            expect(radioGroup.readOnly).type.toBe<boolean>()
            expect(radioGroup.required).type.toBe<boolean>()
            expect(radioGroup.invalid).type.toBe<boolean>()
            return radioGroup.root(h.div).children(
              radioGroup.radio({
                element: h.button.onMount(NeedsClock()),
                value: "ssd"
              }).children(
                radioGroup.indicator({ element: h.span, value: "ssd" })
              )
            )
          }
        })
        expect<View.Requirements<typeof child>>().type.toBe<Clock>()
        return child
      }
    })
  })

  it("rejects invalid props and wrong part arguments or tags", () => {
    expect(RadioGroup).type.not.toBeCallableWith(h, {
      props: { value: 123, items: [] },
      view: () => h.div
    })
    expect(RadioGroup).type.not.toBeCallableWith(h, {
      props: { value: null },
      view: () => h.div
    })
    RadioGroup(h, {
      props: { value: null, items: [{ value: "ssd" }] },
      view: (radioGroup) => {
        expect(radioGroup.root).type.not.toBeCallableWith(h.span)
        expect(radioGroup.radio).type.not.toBeCallableWith({
          element: h.div,
          value: "ssd"
        })
        expect(radioGroup.radio).type.not.toBeCallableWith({
          element: h.button
        })
        expect(radioGroup.indicator).type.not.toBeCallableWith({
          element: h.div,
          value: "ssd"
        })
        expect(radioGroup.indicator).type.not.toBeCallableWith({
          element: h.span
        })
        return radioGroup.root(h.div)
      }
    })
  })

  it("makeRadioGroup types the value, items, parts and Picked with its schema", () => {
    const Scope = Schema.Literals(["All", "League", "Cup"])
    const ScopeMsg = UiSchema.TaggedEnum({ PickedScope: { scope: Scope } })
    const h = View.makeHelper<typeof ScopeMsg.Type, {}, Html.Elements>(
      {},
      Html
    )
    const ScopeRadioGroup = makeRadioGroup({ value: Scope })
    const items = Scope.literals.map((value) => ({ value }))
    ScopeRadioGroup(h, {
      props: { value: "All", items },
      onEmit: { Picked: ({ value }) => ScopeMsg.PickedScope({ scope: value }) },
      view: (radioGroup) => {
        expect(radioGroup.value).type.toBe<typeof Scope.Type | null>()
        expect(radioGroup.radio).type.not.toBeCallableWith({
          element: h.button,
          value: "Other"
        })
        return radioGroup.root(h.div)
      }
    })
    expect(ScopeRadioGroup).type.not.toBeCallableWith(h, {
      props: { value: "Other", items },
      view: () => h.div
    })
    expect(ScopeRadioGroup).type.not.toBeCallableWith(h, {
      props: { value: null, items: [{ value: "Other" }] },
      view: () => h.div
    })
  })
})
