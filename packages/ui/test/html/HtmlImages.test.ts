// @vitest-environment happy-dom
import { BrowserHost, HtmlImages } from "@effect/ui/html"
import { TestImages } from "@effect/ui/html/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Layer } from "effect"

describe("HtmlImages.Images", () => {
  it.effect("BrowserHost's loads in its document, and an image without pixels is an error", () =>
    Effect.gen(function*() {
      const context = yield* Layer.build(BrowserHost.layer())
      const load = (src: string) =>
        HtmlImages.Images.use((images) => images.load({ src })).pipe(Effect.provide(context))
      assert.strictEqual(yield* load("data:image/gif;base64,R0lGODlhAQABAAAAACw="), "loaded")
      assert.strictEqual(yield* load("/missing.png"), "error")
    }).pipe(Effect.scoped))

  it.effect("TestImages settles the loads of a source, and throws for one with none pending", () =>
    Effect.gen(function*() {
      const images = TestImages.make()
      const fiber = yield* Effect.forkChild(images.load({ src: "/ada.png", sizes: undefined }))
      yield* Effect.yieldNow
      assert.throws(
        () => images.settle({ src: "/grace.png" }, "loaded"),
        `TestImages: no load of {"src":"/grace.png"} is pending; pending: [{"src":"/ada.png"}]`
      )
      images.settle({ src: "/ada.png" }, "error")
      assert.strictEqual(yield* Fiber.join(fiber), "error")
    }))
})
