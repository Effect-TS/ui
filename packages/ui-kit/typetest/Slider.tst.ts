import { Component, Mount, UiSchema, type View } from "@effect/ui"
import { Field, Slider } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Effect, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const NeedsClock = Mount.make("NeedsClock", { args: {} }, () => Clock.use(() => Effect.succeed(Component.noop)))

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Div<R> = Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">
type Span<R> = Html.Element<Msg, R, Html.EventsOf<"span">, HTMLSpanElement, "span">
type Output<R> = Html.Element<Msg, R, Html.EventsOf<"output">, HTMLOutputElement, "output">

const App = Component.define({ name: "App", model: Schema.Null, message: Msg, elements: Html })

describe("Slider", () => {
  it("each part returns the builder it was given, with the consumer's message type and the children's requirements", () => {
    App.make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Slider(h, {
          props: { value: 40 },
          view: (s) => {
            expect(s.root(h.div)).type.toBe<Div<never>>()
            expect(s.value(h.output)).type.toBe<Output<never>>()
            expect(s.track(h.span).children(needsClock)).type.toBe<Span<Clock>>()
            expect(s.indicator(h.span)).type.toBe<Span<never>>()
            expect(s.thumb({ element: h.span.onClick(Msg.Clicked()), input: h.input })).type.toBe<Span<never>>()
            const control = s.control(h.div).children(
              s.track(h.div).children(s.thumb({ element: h.div, input: h.input.attr("aria-label", "Volume") })),
              needsClock
            )
            expect(control).type.toBe<Div<Clock>>()
            expect(s.values).type.toBe<ReadonlyArray<number>>()
            expect(s.orientation).type.toBe<"horizontal" | "vertical">()
            return s.root(h.div).children(control)
          }
        })
    })
  })

  it("a thumb needs what its input needs", () => {
    App.make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => {
        const slider = Slider(h, {
          props: { value: 40 },
          view: (s) => {
            const thumb = s.thumb({ element: h.div, input: h.input.onMount(NeedsClock()) })
            expect(thumb).type.toBe<Div<Clock>>()
            return s.root(h.div).children(thumb)
          }
        })
        expect<View.Requirements<typeof slider>>().type.toBe<Clock>()
        return slider
      }
    })
  })

  it("a single thumb's input can be a Field's control", () => {
    App.make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Field(h, {
          view: (f) =>
            Slider(h, {
              props: { value: 40, disabled: f.disabled },
              view: (s) => s.thumb({ element: h.div, input: f.control(h.input), index: 0 })
            })
        })
    })
  })

  it("thumb takes an input, value an output and control a div, and the thumb's options are required", () => {
    App.make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
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

  it("needs nothing to run", () => {
    expect<Component.Headless.Requirements<typeof Slider>>().type.toBe<never>()
  })

  it("value is a number or an array of numbers", () => {
    App.make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => {
        expect(Slider).type.not.toBeCallableWith(h, { props: { value: "40" }, view: () => h.div })
        return Slider(h, { props: { value: [1, 2] }, view: (s) => s.root(h.div) })
      }
    })
  })
})
