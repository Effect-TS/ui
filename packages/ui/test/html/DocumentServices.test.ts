// @vitest-environment happy-dom
import { assert, describe, it } from "@effect/vitest"
import { Context, Effect, Layer, Schema } from "effect"
import { vi } from "vitest"

const timeout = Effect.promise(() =>
  new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 50))
)

const refusePicker = Effect.acquireRelease(
  Effect.sync(() => {
    const proto = window.HTMLInputElement.prototype as HTMLInputElement
    proto.showPicker = function() {
      throw new DOMException("No user activation", "NotAllowedError")
    }
  }),
  () =>
    Effect.sync(() =>
      delete (window.HTMLInputElement.prototype as Partial<HTMLInputElement>)
        .showPicker
    )
)

describe("BrowserHost document services", { concurrent: false }, () => {
  it.effect("resolve Images and Files even when those modules are imported after mount, work detached, and honor overrides", () =>
    Effect.gen(function*() {
      yield* refusePicker
      vi.resetModules()

      const [Component, BrowserHost, Html] = yield* Effect.promise(() =>
        Promise.all([
          import("@effect/ui/Component"),
          import("@effect/ui/html/BrowserHost"),
          import("@effect/ui/html/Html")
        ])
      )

      const Page = Component.define({
        name: "LateServicePage",
        props: Schema.Struct({ summary: Schema.String }),
        model: Schema.String,
        message: Schema.Never,
        elements: Html
      }).make({
        init: ($) => $.props.summary,
        update: ($) => $.model,
        view: (h, summary) => h.p(summary)
      })

      const app = document.body.appendChild(document.createElement("div"))
      yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))

      let mounted: Context.Context<never> | undefined
      yield* BrowserHost.mountEffect(
        Page,
        Effect.context<never>().pipe(
          Effect.map((context) => {
            mounted = context
            return { summary: "mounted" }
          })
        ),
        app
      )
      const layered = yield* Layer.build(BrowserHost.layer())

      const [HtmlImages, HtmlFiles] = yield* Effect.promise(() =>
        Promise.all([
          import("@effect/ui/html/HtmlImages"),
          import("@effect/ui/html/HtmlFiles")
        ])
      )

      const pixel = { src: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" }
      const mountedImages = Context.get(
        mounted as Context.Context<typeof HtmlImages.Images.Identifier>,
        HtmlImages.Images
      )
      const layeredImages = Context.get(layered, HtmlImages.Images)
      const mountedFiles = Context.get(
        mounted as Context.Context<typeof HtmlFiles.Files.Identifier>,
        HtmlFiles.Files
      )
      const layeredFiles = Context.get(layered, HtmlFiles.Files)

      assert.strictEqual(
        yield* Effect.race(mountedImages.load(pixel), timeout),
        "loaded"
      )
      assert.strictEqual(
        yield* Effect.race(layeredImages.load(pixel), timeout),
        "loaded"
      )
      assert.deepStrictEqual(
        yield* Effect.race(mountedFiles.pick({}), timeout),
        { opened: false, files: [] }
      )
      assert.deepStrictEqual(
        yield* Effect.race(layeredFiles.pick({}), timeout),
        { opened: false, files: [] }
      )

      const readBoth = Effect.gen(function*() {
        const images = yield* HtmlImages.Images
        const files = yield* HtmlFiles.Files
        const status = yield* images.load(pixel)
        const picked = yield* files.pick({})
        return { summary: `${status}:${picked.opened}` }
      })
      const custom = yield* BrowserHost.mountEffect(
        Page,
        readBoth.pipe(
          Effect.provideService(HtmlImages.Images, {
            load: () => Effect.succeed("error")
          }),
          Effect.provideService(HtmlFiles.Files, {
            pick: () => Effect.succeed({ opened: true, files: [] })
          })
        ),
        app
      )
      assert.strictEqual(custom.model(), "error:true")
    }).pipe(Effect.scoped))
})
