import { Component, type View } from "@effect/ui"
import { Avatar } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = Schema.TaggedUnion({ Clicked: {} })
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

describe("Avatar", () => {
  it("parts return finished elements with the message type and the children's requirements, and root stacks on a builder", () => {
    Component.define({ name: "App", model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Avatar(h, {
          key: "a",
          props: { src: "/ada.png" },
          view: (s) => {
            expect(s.imageLoadingStatus).type.toBe<"loading" | "loaded" | "error">()
            expect(s.root(h.span.class("avatar"))).type.toBe<
              Html.Element<Msg, never, Html.EventsOf<"span">, HTMLSpanElement, "span">
            >()
            expect(s.image({ element: h.img })).type.toBe<View.Element<Msg, never> | undefined>()
            expect(s.fallback({ element: h.span })).type.toBe<View.Element<Msg, never> | undefined>()
            const fallback = s.fallback({
              element: h.span.onClick(Msg.make({ _tag: "Clicked" })),
              children: ["AL", needsClock]
            })
            expect(fallback).type.toBe<View.Element<Msg, Clock> | undefined>()
            const root = s.root({ element: h.span, children: [s.image({ element: h.img }), fallback] })
            expect(root).type.toBe<View.Element<Msg, Clock>>()
            return root
          }
        })
    })
  })

  it("root and fallback take only a span, image only an img, and image and fallback only the options object", () => {
    Component.define({ name: "App", model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Avatar(h, {
          key: "a",
          props: {},
          view: (s) => {
            expect(s.root).type.not.toBeCallableWith(h.div)
            expect(s.root).type.not.toBeCallableWith({ element: h.div })
            expect(s.image).type.not.toBeCallableWith({ element: h.span })
            expect(s.image).type.not.toBeCallableWith(h.img)
            expect(s.fallback).type.not.toBeCallableWith({ element: h.div })
            expect(s.fallback).type.not.toBeCallableWith(h.span)
            return s.root({ element: h.span })
          }
        })
    })
  })
})
