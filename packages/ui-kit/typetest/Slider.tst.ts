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
      view: (field) => {
        const child = Slider(h, {
          props: { value: 40, disabled: field.disabled },
          view: (slider) => {
            expect(slider.root(h.div)).type.toBe<Div<never>>()
            expect(slider.value(h.output)).type.toBe<Output<never>>()
            expect(slider.track(h.span).children(needsClock)).type.toBe<Span<Clock>>()
            expect(slider.indicator(h.span)).type.toBe<Span<never>>()
            expect(slider.control(h.div).children(needsClock)).type.toBe<Div<Clock>>()
            expect(slider.values).type.toBe<ReadonlyArray<number>>()
            expect(slider.orientation).type.toBe<"horizontal" | "vertical">()
            expect(slider.thumb({ element: h.span, input: h.input })).type.toBe<Span<never>>()
            const thumb = slider.thumb({
              element: h.span.onClick(Msg.Clicked()),
              input: field.control(h.input.onMount(NeedsClock()))
            })
            expect(thumb).type.toBe<Span<Clock>>()
            return slider.root(h.div).children(thumb)
          }
        })
        expect<View.Requirements<typeof child>>().type.toBe<Clock>()
        return child
      }
    })
  })

  it("requires a numeric value or range, the correct native elements and a thumb input", () => {
    expect(Slider).type.not.toBeCallableWith(h, { props: { value: "40" }, view: () => h.div })
    Slider(h, {
      props: { value: [10, 20] },
      view: (slider) => {
        expect(slider.thumb).type.not.toBeCallableWith({ element: h.div, input: h.button })
        expect(slider.thumb).type.not.toBeCallableWith({ element: h.div })
        expect(slider.thumb).type.not.toBeCallableWith(h.div)
        expect(slider.value).type.not.toBeCallableWith(h.div)
        expect(slider.control).type.not.toBeCallableWith(h.span)
        return slider.root(h.div)
      }
    })
  })
})
