import { UiSchema, type View } from "@effect/ui"
import { Meter, type MeterProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
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

describe("Meter", () => {
  it("each part returns the builder it was given, with the consumer's message type and the children's requirements", () => {
    Html.component({
      name: "App",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Meter(h, {
          props: { value: 40 },
          view: (meter) => {
            expect(meter.percentage).type.toBe<number>()
            expect(meter.valueText).type.toBe<string>()
            expect(meter.label(h.span).children(needsClock)).type.toBe<
              Span<Clock>
            >()
            expect(meter.value(h.span.onClick(Msg.Clicked()))).type.toBe<
              Span<never>
            >()
            expect(meter.track(h.div)).type.toBe<Div<never>>()
            expect(meter.indicator(h.div)).type.toBe<Div<never>>()
            const root = meter.root(h.div).children(
              meter.label(h.span),
              needsClock
            )
            expect(root).type.toBe<Div<Clock>>()
            return root
          }
        })
    })
  })

  it("root, track and indicator take only a div, and label and value only a span", () => {
    Html.component({
      name: "App",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Meter(h, {
          props: { value: 40 },
          view: (meter) => {
            expect(meter.root).type.not.toBeCallableWith(h.span)
            expect(meter.root).type.not.toBeCallableWith({ element: h.div })
            expect(meter.track).type.not.toBeCallableWith(h.span)
            expect(meter.indicator).type.not.toBeCallableWith(h.span)
            expect(meter.label).type.not.toBeCallableWith(h.div)
            expect(meter.value).type.not.toBeCallableWith(h.div)
            return meter.root(h.div)
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
