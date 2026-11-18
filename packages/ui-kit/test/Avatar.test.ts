import type { Component } from "@effect/ui"
import { View } from "@effect/ui"
import { Avatar, AvatarLoadImage, type AvatarProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

const standIn = {
  elements: Html,
  view: (
    s: Component.Headless.Parts<typeof Avatar>,
    h: View.Helper<never, AvatarProps> & View.Tags<Html.Elements, never>
  ) =>
    s.root(h.span.attr("data-status", s.imageLoadingStatus)).children(
      s.image(h.img),
      s.fallback(h.span.class("fallback"))?.children("AL")
    )
}

const image = Locator.tag("img")
const fallback = Locator.attr("class", "fallback")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

describe("Avatar", () => {
  it.effect("a restored source shows the fallback until its new load settles", () =>
    Effect.gen(function*() {
      const ada = { src: "/ada.png" }
      const loaded = { source: ada, status: "loaded" } as const
      const s = yield* Scene.make(Avatar, ada, standIn)
      s.mounted(AvatarLoadImage(ada), loaded)
      assert.isDefined(s.query(image))

      for (
        const report of [{ source: {}, status: "error" }, { source: { src: "/grace.png" }, status: "loading" }] as const
      ) {
        s.props(report.source).mounted(AvatarLoadImage(report.source), report).props(ada)
        assert.isDefined(s.query(Locator.attr("data-status", "loading")))
        assert.isUndefined(s.query(image))
        assert.isDefined(s.query(fallback))
        s.mounted(AvatarLoadImage(ada), loaded)
        assert.isDefined(s.query(image))
        assert.isUndefined(s.query(fallback))
      }
    }))

  it.effect("the fallback waits for its delay, and then shows whenever the image isn't loaded", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Avatar, { src: "/ada.png", fallbackDelay: 600 }, standIn)
      s.expectMount(AvatarLoadImage({ src: "/ada.png" }))
      assert.isUndefined(s.query(fallback))
      s.subscription("fallbackDelay:600", { _tag: "ElapsedFallbackDelay" })
      assert.isDefined(s.query(fallback))
    }))

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
      const s = Story.parts(Avatar, {
        model: { report: { source: props, status: "loaded" }, delayElapsed: true },
        props
      })
      // A source attribute chained after the part loses too.
      return View.build(s.image(element)!.attr("src", "/chained.png").attr("title", "Ada"), []).attrs
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
