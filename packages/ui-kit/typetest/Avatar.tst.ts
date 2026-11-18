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
  it("root and image return the chain, and fallback infers the message type and the children's requirements", () => {
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
            expect(s.image(h.img)).type.toBe<
              Html.VoidElement<Msg, never, Html.EventsOf<"img">, HTMLImageElement, "img"> | undefined
            >()
            expect(s.fallback({ element: h.span })).type.toBe<View.Element<Msg, never> | undefined>()
            const fallback = s.fallback({
              element: h.span.onClick(Msg.make({ _tag: "Clicked" })),
              children: ["AL", needsClock]
            })
            expect(fallback).type.toBe<View.Element<Msg, Clock> | undefined>()
            return s.root(h.span).children(s.image(h.img), fallback)
          }
        })
    })
  })

  it("root and fallback take only a span, and image only an img", () => {
    Component.define({ name: "App", model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Avatar(h, {
          key: "a",
          props: {},
          view: (s) => {
            expect(s.root).type.not.toBeCallableWith(h.div)
            expect(s.image).type.not.toBeCallableWith(h.span)
            expect(s.fallback).type.not.toBeCallableWith({ element: h.div })
            expect(s.fallback).type.not.toBeCallableWith(h.span)
            return s.root(h.span)
          }
        })
    })
  })
})
