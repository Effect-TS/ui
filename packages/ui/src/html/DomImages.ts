/**
 * The image loader, for loading an image the page doesn't show yet.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"

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
  "@effect/ui/html/DomImages/Images",
  { defaultValue: () => pending }
)

const pending: Images = { load: () => Effect.never }
