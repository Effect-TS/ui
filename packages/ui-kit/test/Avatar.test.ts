import type { Component } from "@effect/ui"
import { View } from "@effect/ui"
import { Avatar, AvatarLoadImage, type AvatarProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

// The least markup the parts need: a root with the image and the fallback,
// of which at most one shows.
const standIn = {
  elements: Html,
  view: (
    s: Component.Headless.Parts<typeof Avatar>,
    h: View.Helper<never, AvatarProps> & View.Tags<Html.Elements, never>
  ) =>
    s.root(h.span.class("avatar")).children(
      s.image(h.img.attr("alt", "Ada Lovelace")),
      s.fallback({ element: h.span.class("fallback"), children: ["AL"] })
    )
}

const image = Locator.tag("img")
const fallback = Locator.attr("class", "fallback")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

describe("Avatar", () => {
  it.effect("the root loads the image, which shows once it loads, and the fallback shows until then or when it fails", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Avatar, { src: "/ada.png" }, standIn)
      s.expectMount(AvatarLoadImage({ src: "/ada.png" }))
      assert.isUndefined(s.query(image))
      assert.strictEqual(Locator.textOf(s.get(fallback)), "AL")
      s.mounted(AvatarLoadImage, { source: { src: "/ada.png" }, status: "loaded" })
      assert.deepStrictEqual(s.get(image).attrs, { alt: "Ada Lovelace", src: "/ada.png" })
      assert.isUndefined(s.query(fallback))
      // A new source loads again, with the fallback in the meantime.
      s.props({ src: "/grace.png" })
        .expectMount(AvatarLoadImage({ src: "/grace.png" }))
      assert.isUndefined(s.query(image))
      assert.isDefined(s.query(fallback))
      s.mounted(AvatarLoadImage, { source: { src: "/grace.png" }, status: "error" })
      assert.isUndefined(s.query(image))
      assert.isDefined(s.query(fallback))
      // Without a source, there is nothing to load, and the fallback shows.
      s.props({})
      assert.isDefined(s.query(fallback))
    }))

  it("the parts report the image's status, which a load for another source doesn't settle", () => {
    const status = (settled: unknown, props: AvatarProps) =>
      Story.parts(Avatar, { model: { settled, delayElapsed: true }, props }).imageLoadingStatus
    assert.strictEqual(status(null, { src: "/ada.png" }), "loading")
    assert.strictEqual(status({ source: { src: "/ada.png" }, status: "loaded" }, { src: "/ada.png" }), "loaded")
    assert.strictEqual(status({ source: { src: "/ada.png" }, status: "loaded" }, { src: "/grace.png" }), "loading")
    assert.strictEqual(status({ source: { src: "/ada.png" }, status: "error" }, { src: "/ada.png" }), "error")
    assert.strictEqual(status(null, {}), "error")
    assert.strictEqual(status(null, { srcSet: "/ada.png 2x" }), "loading")
  })

  it.effect("the fallback waits for its delay, and then shows whenever the image isn't loaded", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Avatar, { src: "/ada.png", fallbackDelay: 600 }, standIn)
      s.expectMount(AvatarLoadImage({ src: "/ada.png" }))
      assert.isUndefined(s.query(fallback))
      assert.deepStrictEqual(s.subscriptions, ["fallbackDelay:600"])
      s.subscription("fallbackDelay:600", { _tag: "ElapsedFallbackDelay" })
      assert.deepStrictEqual(s.subscriptions, [])
      assert.isDefined(s.query(fallback))
    }))

  it("the image takes only an <img>, and the root and the fallback only a <span>", () => {
    const s = Story.parts(Avatar, {
      model: { settled: { source: { src: "/ada.png" }, status: "loaded" }, delayElapsed: true },
      props: { src: "/ada.png" }
    })
    assert.throws(() => s.image(h.span as any), /a part for <img> was given <span>/)
    assert.throws(() => s.root(h.div as any), /a part for <span> was given <div>/)
    assert.throws(() => s.fallback({ element: h.div as any }), /a part for <span> was given <div>/)
  })

  it("the image keeps the consumer's attributes, but its own win, present or absent", () => {
    const element = h.img
      .class("photo")
      .attr("alt", "Ada Lovelace")
      .attr("src", "/other.png")
      .attr("srcset", "/other.png 2x")
      .attr("sizes", "10vw")
      .attr("crossorigin", "use-credentials")
      .attr("referrerpolicy", "origin")
    const shown = (props: AvatarProps) =>
      Story.parts(Avatar, { model: { settled: { source: props, status: "loaded" }, delayElapsed: true }, props })
        .image(element)?.attrs
    assert.deepStrictEqual(shown({ src: "/ada.png" }), { class: "photo", alt: "Ada Lovelace", src: "/ada.png" })
    assert.deepStrictEqual(
      shown({
        src: "/ada.png",
        srcSet: "/ada.png 2x",
        sizes: "5vw",
        crossOrigin: "anonymous",
        referrerPolicy: "no-referrer"
      }),
      {
        class: "photo",
        alt: "Ada Lovelace",
        src: "/ada.png",
        srcset: "/ada.png 2x",
        sizes: "5vw",
        crossorigin: "anonymous",
        referrerpolicy: "no-referrer"
      }
    )
  })
})
