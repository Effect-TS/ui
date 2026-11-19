import { Component, UiSchema, type View } from "@effect/ui"
import { Meter, type MeterProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Div<R> = Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">
type Span<R> = Html.Element<Msg, R, Html.EventsOf<"span">, HTMLSpanElement, "span">

describe("Meter", () => {
  it("each part returns the builder it was given, with the consumer's message type and the children's requirements", () => {
    Component.define({ name: "App", lifetime: "view", model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Meter(h, {
          props: { value: 40 },
          view: (s) => {
            expect(s.percentage).type.toBe<number>()
            expect(s.valueText).type.toBe<string>()
            expect(s.label(h.span).children(needsClock)).type.toBe<Span<Clock>>()
            expect(s.value(h.span.onClick(Msg.Clicked()))).type.toBe<Span<never>>()
            expect(s.track(h.div)).type.toBe<Div<never>>()
            expect(s.indicator(h.div)).type.toBe<Div<never>>()
            const root = s.root(h.div).children(s.label(h.span), needsClock)
            expect(root).type.toBe<Div<Clock>>()
            return root
          }
        })
    })
  })

  it("root, track and indicator take only a div, and label and value only a span", () => {
    Component.define({ name: "App", lifetime: "view", model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Meter(h, {
          props: { value: 40 },
          view: (s) => {
            expect(s.root).type.not.toBeCallableWith(h.span)
            expect(s.root).type.not.toBeCallableWith({ element: h.div })
            expect(s.track).type.not.toBeCallableWith(h.span)
            expect(s.indicator).type.not.toBeCallableWith(h.span)
            expect(s.label).type.not.toBeCallableWith(h.div)
            expect(s.value).type.not.toBeCallableWith(h.div)
            return s.root(h.div)
          }
        })
    })
  })

  it("value is a required number, never null", () => {
    expect({ value: 40 }).type.toBeAssignableTo<MeterProps>()
    expect({ max: 10 }).type.not.toBeAssignableTo<MeterProps>()
    expect({ value: null }).type.not.toBeAssignableTo<MeterProps>()
  })
})
