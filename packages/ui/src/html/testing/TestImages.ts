/**
 * A fake `HtmlImages.Images` for whole-app tests, so a test decides how each
 * image load settles, without a document, in Node too.
 *
 * Provide `layer` next to `TestHost.layer()`. Every load stays pending
 * until `load` or `fail` settles the loads of its source. Run
 * `TestHost.settle` after it to see the update.
 *
 * **Example** (Loading a photo in a whole-app test)
 *
 * ```ts import.meta.vitest
 * import { Component, Subscription, UiSchema } from "@effect/ui"
 * import { HtmlImages, Html } from "@effect/ui/html"
 * import { TestImages } from "@effect/ui/html/testing"
 * import { TestHost } from "@effect/ui/testing"
 * import { Effect, Layer, Schema, Stream } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ Settled: { status: Schema.Literals(["loaded", "error"]) } })
 *
 * const Photo = Component.define({
 *   name: "Photo",
 *   scoped: false,
 *   model: Schema.String,
 *   message: Message,
 *   elements: Html
 * }).make({
 *   init: () => "loading",
 *   update: { Settled: (_, { status }) => status },
 *   view: (h, status) => h.p(status),
 *   subscriptions: () => [
 *     Subscription.make(
 *       "photo",
 *       Stream.fromEffect(HtmlImages.Images.use((images) => images.load({ src: "/ada.png" }))).pipe(
 *         Stream.map((status) => Message.Settled({ status }))
 *       )
 *     )
 *   ]
 * })
 *
 * Effect.gen(function*() {
 *   const root = yield* TestHost.mount(Photo, {})
 *   yield* TestHost.settle
 *   yield* TestImages.load({ src: "/ada.png" })
 *   yield* TestHost.settle
 *   root.model() // => "loaded"
 * }).pipe(Effect.provide(Layer.merge(TestHost.layer(), TestImages.layer)), Effect.scoped, Effect.runPromise)
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HtmlImages from "../HtmlImages.ts"

/**
 * The `TestImages` service: the fake's control.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface TestImages {
  /**
   * Settles every pending load of `source` with `status`. Sources with the
   * same fields are the same. Throws, listing the pending sources, when
   * none is of `source`.
   */
  readonly settle: (source: HtmlImages.ImageSource, status: "loaded" | "error") => void
}

/**
 * The `TestImages` service.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export const TestImages: Context.Service<TestImages, TestImages> = Context.Service<TestImages>(
  "@effect/ui/html/testing/TestImages"
)

interface Pending {
  readonly source: string
  readonly settle: (status: "loaded" | "error") => void
}

const encode = ({ crossOrigin, referrerPolicy, sizes, src, srcSet }: HtmlImages.ImageSource): string =>
  JSON.stringify({ src, srcSet, sizes, crossOrigin, referrerPolicy })

/**
 * Makes a fake loader and its control. `layer` provides a new one per
 * build.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = (): HtmlImages.Images & TestImages => {
  const pending = new Set<Pending>()
  return {
    load: (source) =>
      Effect.callback((resume) => {
        const entry: Pending = { source: encode(source), settle: (status) => resume(Effect.succeed(status)) }
        pending.add(entry)
        return Effect.sync(() => {
          pending.delete(entry)
        })
      }),
    settle: (source, status) => {
      const key = encode(source)
      const matching = Array.from(pending).filter((entry) => entry.source === key)
      if (matching.length === 0) {
        const sources = [...new Set(Array.from(pending, (entry) => entry.source))].join(", ")
        throw new Error(`TestImages: no load of ${key} is pending; pending: [${sources}]`)
      }
      for (const entry of matching) {
        pending.delete(entry)
        entry.settle(status)
      }
    }
  }
}

/**
 * Provides a fake `HtmlImages.Images` with its control, `TestImages`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer: Layer.Layer<TestImages> = Layer.effectContext(
  Effect.sync(() => {
    const images = make()
    return Context.make(TestImages, images).pipe(Context.add(HtmlImages.Images, images))
  })
)

/**
 * Settles the pending loads of `source` as `"loaded"`.
 *
 * @stability experimental
 * @category testing
 * @since 0.1.0
 */
export const load = (source: HtmlImages.ImageSource): Effect.Effect<void, never, TestImages> =>
  TestImages.useSync((images) => images.settle(source, "loaded"))

/**
 * Settles the pending loads of `source` as `"error"`.
 *
 * @stability experimental
 * @category testing
 * @since 0.1.0
 */
export const fail = (source: HtmlImages.ImageSource): Effect.Effect<void, never, TestImages> =>
  TestImages.useSync((images) => images.settle(source, "error"))
