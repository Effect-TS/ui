import { Component, UiSchema, type View } from "@effect/ui"
import { Avatar, type AvatarImg, type AvatarSpan } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = UiSchema.TaggedEnum({ Clicked: {} })
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

describe("Avatar", () => {
  it("each part returns the builder it was given, and children keep their requirements", () => {
    Component.define({ name: "App", model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Avatar(h, {
          props: { src: "/ada.png" },
          view: (s) => {
            expect(s.imageLoadingStatus).type.toBe<"loading" | "loaded" | "error">()
            expect(s.root(h.span.class("avatar"))).type.toBe<AvatarSpan<Msg>>()
            expect(s.image(h.img.attr("alt", "Ada"))).type.toBe<AvatarImg<Msg> | undefined>()
            expect(s.fallback(h.span.onClick(Msg.Clicked()))).type.toBe<AvatarSpan<Msg> | undefined>()
            const fallback = s.fallback(h.span)?.children("AL", needsClock)
            expect(fallback).type.toBe<AvatarSpan<Msg, Clock> | undefined>()
            const root = s.root(h.span).children(s.image(h.img), fallback)
            expect(root).type.toBe<AvatarSpan<Msg, Clock>>()
            return root
          }
        })
    })
  })

  it("root and fallback take only a span builder, and image only an img builder", () => {
    Component.define({ name: "App", model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        Avatar(h, {
          props: {},
          view: (s) => {
            expect(s.root).type.not.toBeCallableWith(h.div)
            expect(s.root).type.not.toBeCallableWith({ element: h.span })
            // An object with an `attr` method isn't a builder.
            expect(s.root).type.not.toBeCallableWith({ attr: () => 1 })
            expect(s.image).type.not.toBeCallableWith(h.span)
            expect(s.image).type.not.toBeCallableWith({ element: h.img })
            expect(s.fallback).type.not.toBeCallableWith(h.div)
            expect(s.fallback).type.not.toBeCallableWith({ element: h.span })
            return s.root(h.span)
          }
        })
    })
  })

  it("the root's mount needs no service", () => {
    expect<Component.Headless.Requirements<typeof Avatar>>().type.toBe<never>()
  })
})
