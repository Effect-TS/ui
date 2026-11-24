import { Component, UiSchema, type View } from "@effect/ui"
import { Progress, type ProgressStatus } from "@effect/ui-kit"
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

describe("Progress", () => {
  it("each part returns the builder it was given, with the consumer's message type and the children's requirements", () => {
    Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Progress(h, {
          props: { value: null },
          view: (progress) => {
            expect(progress.status).type.toBe<ProgressStatus>()
            expect(progress.percentage).type.toBe<number | null>()
            expect(progress.valueText).type.toBe<string | undefined>()
            expect(progress.label(h.span)).type.toBe<Span<never>>()
            expect(progress.value(h.span.class(["pct"])).children([needsClock]))
              .type.toBe<Span<Clock>>()
            expect(progress.track(h.div)).type.toBe<Div<never>>()
            const root = progress.root(h.div.onClick(Msg.Clicked()))
              .children([
                progress.track(h.div).children([progress.indicator(h.div)]),
                needsClock
              ])
            expect(root).type.toBe<Div<Clock>>()
            return root
          }
        })
    })
  })

  it("root, track and indicator take only a div, and label and value only a span", () => {
    Component.define({
      name: "App",
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Progress(h, {
          props: { value: 40 },
          view: (progress) => {
            expect(progress.root).type.not.toBeCallableWith(h.span)
            expect(progress.root).type.not.toBeCallableWith({ element: h.div })
            expect(progress.track).type.not.toBeCallableWith(h.span)
            expect(progress.indicator).type.not.toBeCallableWith(h.span)
            expect(progress.label).type.not.toBeCallableWith(h.label)
            expect(progress.value).type.not.toBeCallableWith(h.div)
            return progress.root(h.div)
          }
        })
    })
  })
})
