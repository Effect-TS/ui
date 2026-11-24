/**
 * The image loader, for loading an image the page doesn't show yet.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as documentServices from "./internal/documentServices.ts"

/**
 * An image to load, as the `<img>` attributes of the same names.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ImageSource {
  readonly src?: string | undefined
  readonly srcSet?: string | undefined
  readonly sizes?: string | undefined
  readonly crossOrigin?: "anonymous" | "use-credentials" | undefined
  readonly referrerPolicy?: string | undefined
}

/**
 * Loads images the page doesn't show, such as to show an `<img>` only once
 * its source has loaded.
 *
 * **Details**
 *
 * `load` settles with `"loaded"` or `"error"`, and interrupting it drops
 * the load. `BrowserHost.layer` provides one that loads in a detached
 * `<img>` of its document. The default never settles, so on a host without
 * a document an image stays loading. A test settles loads with `TestImages`
 * from `@effect/ui/html/testing`.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface Images {
  readonly load: (source: ImageSource) => Effect.Effect<"loaded" | "error">
}

/**
 * The image loader. It defaults to one whose loads never settle.
 *
 * @stability experimental
 * @category references
 * @since 0.1.0
 */
export const Images: Context.Reference<Images> = Context.Reference<Images>(
  "@effect/ui/html/HtmlImages/Images",
  { defaultValue: () => pending }
)

const pending: Images = { load: () => Effect.never }

const imagesOf = (document: Document): Images => ({
  load: (source) =>
    Effect.callback((resume) => {
      const image = document.createElement("img")
      const settle = (status: "loaded" | "error") =>
        resume(Effect.succeed(status))
      if (source.referrerPolicy !== undefined) {
        image.referrerPolicy = source.referrerPolicy
      }
      image.crossOrigin = source.crossOrigin ?? null
      if (source.sizes !== undefined) image.sizes = source.sizes
      if (source.srcSet !== undefined) image.srcset = source.srcSet
      if (source.src !== undefined) image.src = source.src
      if (image.complete) {
        return settle(image.naturalWidth > 0 ? "loaded" : "error")
      }
      image.onload = () => settle("loaded")
      image.onerror = () => settle("error")
      return Effect.sync(() => {
        image.onload = null
        image.onerror = null
      })
    })
})

documentServices.register((context, env) =>
  Context.add(context, Images, imagesOf(env.document))
)
