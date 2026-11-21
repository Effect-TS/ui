import { Component, UiSchema, View } from "@effect/ui"
import { Avatar, type AvatarProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { TestImages } from "@effect/ui/html/testing"
import { Locator, Scene, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"

const standIn = {
  elements: Html,
  view: (
    avatar: Component.Headless.Parts<typeof Avatar>,
    h: View.Helper<never, AvatarProps> & View.Tags<Html.Elements, never>
  ) =>
    avatar.root(h.span.attr("data-status", avatar.imageLoadingStatus)).children(
      avatar.image(h.img),
      avatar.fallback(h.span.class("fallback"))?.children("AL")
    )
}

const image = Locator.tag("img")
const fallback = Locator.attr("class", "fallback")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

describe("Avatar", () => {
  it.effect("the fallback waits for its delay, and then shows whenever the image isn't loaded", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Avatar, { src: "/ada.png", fallbackDelay: 600 }, standIn)
      assert.isUndefined(s.query(fallback))
      s.subscription("fallbackDelay:600", { _tag: "ElapsedFallbackDelay" })
      assert.isDefined(s.query(fallback))
    }))

  it.effect("on TestHost, the fallback shows until the current source's load settles, even if an old load settles as the source changes", () =>
    Effect.gen(function*() {
      const ada = { src: "/ada.png" }
      const grace = { src: "/grace.png" }
      const Message = UiSchema.TaggedEnum({ Picked: { src: Schema.String } })
      const Page = Component.define({
        name: "Page",
        scoped: false,
        model: Schema.String,
        message: Message,
        elements: Html
      }).make({
        init: () => ada.src,
        update: { Picked: (_, { src }) => src },
        view: (src, h) =>
          Avatar(h, {
            props: { src },
            view: (avatar) =>
              avatar.root(h.span.attr("data-status", avatar.imageLoadingStatus)).children(
                avatar.image(h.img),
                avatar.fallback(h.span.class("fallback"))
              )
          })
      })
      const root = yield* TestHost.mount(Page, {}, {
        frames: (root) => [root.query(image) && "image", root.query(fallback) && "fallback"].filter(Boolean).join("+")
      })
      yield* TestHost.settle
      // Ada's load settles after the page picks Grace, but before it renders.
      root.send(Message.Picked(grace))
      yield* TestImages.load(ada)
      root.send(Message.Picked(ada))
      yield* TestHost.settle
      assert.deepStrictEqual(root.frames(), ["fallback"])
      yield* TestImages.load(ada)
      yield* TestHost.settle
      root.send(Message.Picked({ src: "" }))
      yield* TestHost.settle
      root.send(Message.Picked(ada))
      yield* TestHost.settle
      assert.isDefined(root.query(Locator.attr("data-status", "loading")))
      assert.deepStrictEqual(root.frames(), ["fallback", "image", "fallback"])
    }).pipe(Effect.provide(Layer.merge(TestHost.layer(), TestImages.layer))))

  it("the image keeps the consumer's attributes, but its own win, present or absent, before the part or after, and come last with src after the rest", () => {
    const element = h.img
      .class("photo")
      .attr("alt", "Ada Lovelace")
      .attr("src", "/other.png")
      .attr("srcset", "/other.png 2x")
      .attr("sizes", "10vw")
      .attr("crossorigin", "use-credentials")
      .attr("referrerpolicy", "origin")
    const shown = (props: AvatarProps) => {
      const avatar = Story.parts(Avatar, {
        model: { report: { source: props, status: "loaded" }, delayElapsed: true },
        props
      })
      // A source attribute chained after the part loses too.
      return View.build(avatar.image(element)!.attr("src", "/chained.png").attr("title", "Ada"), []).attrs
    }
    assert.deepStrictEqual(shown({ src: "/ada.png" }), {
      class: "photo",
      alt: "Ada Lovelace",
      title: "Ada",
      src: "/ada.png"
    })
    const attrs = shown({
      src: "/ada.png",
      srcSet: "/ada.png 2x",
      sizes: "5vw",
      crossOrigin: "anonymous",
      referrerPolicy: "no-referrer"
    })
    // The host applies entries in order; setting src can start the fetch.
    assert.deepStrictEqual(Object.entries(attrs), [
      ["class", "photo"],
      ["alt", "Ada Lovelace"],
      ["title", "Ada"],
      ["crossorigin", "anonymous"],
      ["referrerpolicy", "no-referrer"],
      ["sizes", "5vw"],
      ["srcset", "/ada.png 2x"],
      ["src", "/ada.png"]
    ])
  })
})
