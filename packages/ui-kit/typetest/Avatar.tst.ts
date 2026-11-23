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
    Component.define({ name: "App", scoped: false, model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Avatar(h, {
          props: { src: "/ada.png" },
          view: (avatar) => {
            expect(avatar.imageLoadingStatus).type.toBe<"loading" | "loaded" | "error">()
            expect(avatar.root(h.span.class("avatar"))).type.toBe<AvatarSpan<Msg>>()
            expect(avatar.image(h.img.attr("alt", "Ada"))).type.toBe<AvatarImg<Msg> | undefined>()
            expect(avatar.fallback(h.span.onClick(Msg.Clicked()))).type.toBe<AvatarSpan<Msg> | undefined>()
            const fallback = avatar.fallback(h.span)?.children("AL", needsClock)
            expect(fallback).type.toBe<AvatarSpan<Msg, Clock> | undefined>()
            const root = avatar.root(h.span).children(avatar.image(h.img), fallback)
            expect(root).type.toBe<AvatarSpan<Msg, Clock>>()
            return root
          }
        })
    })
  })

  it("root and fallback take only a span builder, and image only an img builder", () => {
    Component.define({ name: "App", scoped: false, model: Schema.Null, message: Msg, elements: Html }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        Avatar(h, {
          props: {},
          view: (avatar) => {
            expect(avatar.root).type.not.toBeCallableWith(h.div)
            expect(avatar.root).type.not.toBeCallableWith({ element: h.span })
            // An object with an `attr` method isn't a builder.
            expect(avatar.root).type.not.toBeCallableWith({ attr: () => 1 })
            expect(avatar.image).type.not.toBeCallableWith(h.span)
            expect(avatar.image).type.not.toBeCallableWith({ element: h.img })
            expect(avatar.fallback).type.not.toBeCallableWith(h.div)
            expect(avatar.fallback).type.not.toBeCallableWith({ element: h.span })
            return avatar.root(h.span)
          }
        })
    })
  })

  it("the avatar needs no service", () => {
    expect<Component.Headless.Requirements<typeof Avatar>>().type.toBe<never>()
  })
})
