import { Component, Mount, UiSchema, View } from "@effect/ui"
import { Field, Slider } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Effect } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const NeedsClock = Mount.make("NeedsClock", { args: {} }, () => Clock.use(() => Effect.succeed(Component.noop)))

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Div<R> = Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">
type Span<R> = Html.Element<Msg, R, Html.EventsOf<"span">, HTMLSpanElement, "span">
type Output<R> = Html.Element<Msg, R, Html.EventsOf<"output">, HTMLOutputElement, "output">

const h = View.makeHelper<Msg, {}, Html.Elements>({}, Html)

describe("Slider", () => {
  it("preserves the consumer's builders and requirements, including those of a Field control inside a thumb", () => {
    expect<Component.Headless.Requirements<typeof Slider>>().type.toBe<never>()
    Field(h, {
      view: (f) => {
        const slider = Slider(h, {
          props: { value: 40, disabled: f.disabled },
          view: (s) => {
            expect(s.root(h.div)).type.toBe<Div<never>>()
            expect(s.value(h.output)).type.toBe<Output<never>>()
            expect(s.track(h.span).children(needsClock)).type.toBe<Span<Clock>>()
            expect(s.indicator(h.span)).type.toBe<Span<never>>()
            expect(s.control(h.div).children(needsClock)).type.toBe<Div<Clock>>()
            expect(s.values).type.toBe<ReadonlyArray<number>>()
            expect(s.orientation).type.toBe<"horizontal" | "vertical">()
            expect(s.thumb({ element: h.span, input: h.input })).type.toBe<Span<never>>()
            const thumb = s.thumb({
              element: h.span.onClick(Msg.Clicked()),
              input: f.control(h.input.onMount(NeedsClock()))
            })
            expect(thumb).type.toBe<Span<Clock>>()
            return s.root(h.div).children(thumb)
          }
        })
        expect<View.Requirements<typeof slider>>().type.toBe<Clock>()
        return slider
      }
    })
  })

  it("requires a numeric value or range, the correct native elements and a thumb input", () => {
    expect(Slider).type.not.toBeCallableWith(h, { props: { value: "40" }, view: () => h.div })
    Slider(h, {
      props: { value: [10, 20] },
      view: (s) => {
        expect(s.thumb).type.not.toBeCallableWith({ element: h.div, input: h.button })
        expect(s.thumb).type.not.toBeCallableWith({ element: h.div })
        expect(s.thumb).type.not.toBeCallableWith(h.div)
        expect(s.value).type.not.toBeCallableWith(h.div)
        expect(s.control).type.not.toBeCallableWith(h.span)
        return s.root(h.div)
      }
    })
  })
})
