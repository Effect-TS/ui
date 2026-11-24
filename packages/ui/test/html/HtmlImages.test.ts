// @vitest-environment happy-dom
import { Component } from "@effect/ui"
import { BrowserHost, Html, HtmlImages } from "@effect/ui/html"
import { TestImages } from "@effect/ui/html/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Schema } from "effect"

describe("HtmlImages.Images", () => {
  it.effect("BrowserHost's loads in its document, and an image without pixels is an error", () =>
    Effect.gen(function*() {
      const context = yield* Layer.build(BrowserHost.layer())
      const load = (src: string) =>
        HtmlImages.Images.use((images) => images.load({ src })).pipe(
          Effect.provide(context)
        )
      assert.strictEqual(
        yield* load("data:image/gif;base64,R0lGODlhAQABAAAAACw="),
        "loaded"
      )
      assert.strictEqual(yield* load("/missing.png"), "error")
    }).pipe(Effect.scoped))

  it.effect("TestImages settles the loads of a source, and throws for one with none pending", () =>
    Effect.gen(function*() {
      const images = TestImages.make()
      const fiber = yield* Effect.forkChild(
        images.load({ src: "/ada.png", sizes: undefined })
      )
      yield* Effect.yieldNow
      assert.throws(
        () => images.settle({ src: "/grace.png" }, "loaded"),
        `TestImages: no load of {"src":"/grace.png"} is pending; pending: [{"src":"/ada.png"}]`
      )
      images.settle({ src: "/ada.png" }, "error")
      assert.strictEqual(yield* Fiber.join(fiber), "error")
    }))

  it.effect("direct Images reads resolve the browser document in BrowserHost.mountEffect and honor overrides", () =>
    Effect.gen(function*() {
      const Page = Component.define({
        name: "ImagePage",
        props: Schema.Struct({ status: Schema.String }),
        model: Schema.String,
        message: Schema.Never,
        elements: Html
      }).make({
        init: ($) => $.props.status,
        update: ($) => $.model,
        view: (h, status) => h.p(status)
      })
      const app = document.body.appendChild(document.createElement("div"))
      yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
      const readStatus = Effect.gen(function*() {
        const images = yield* HtmlImages.Images
        return {
          status: yield* images.load({
            src: "data:image/gif;base64,R0lGODlhAQABAAAAACw="
          })
        }
      })
      const root = yield* BrowserHost.mountEffect(Page, readStatus, app)
      assert.strictEqual(root.model(), "loaded")

      const custom = yield* BrowserHost.mountEffect(
        Page,
        readStatus.pipe(
          Effect.provideService(HtmlImages.Images, {
            load: () => Effect.succeed("error")
          })
        ),
        app
      )
      assert.strictEqual(custom.model(), "error")
    }).pipe(Effect.scoped))
})
