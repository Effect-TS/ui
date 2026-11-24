/**
 * A user's picture with a fallback, such as initials or an icon, while the
 * picture loads or if it fails.
 *
 * `Avatar` is a headless component: it loads the image and waits out the
 * fallback delay, so it needs an instance.
 *
 * **Anatomy**
 *
 * | Part       | Element | Behavior                                         |
 * | :--------- | :------ | :----------------------------------------------- |
 * | `root`     | `<span>` | Holds the image and the fallback.                |
 * | `image`    | `<img>`  | Shown once the current source loads.             |
 * | `fallback` | `<span>` | Shown after the delay if the image isn't loaded. |
 *
 * Place the image and fallback inside the root. Each part takes an element
 * builder and returns it, or `undefined` if the part is hidden. Use
 * `fallback(h.span)?.children([...])` to supply the fallback content.
 * Give the image an `alt` and the fallback text or a label for its icon.
 *
 * **Loading behavior**
 *
 * Set the image source and `fallbackDelay` on the avatar. The avatar loads
 * the source through `HtmlImages.Images` before the image part is rendered, so
 * `loading="lazy"` on that part does not defer the request. The delay
 * defaults to zero.
 *
 * Use `imageLoadingStatus` in the view to style the parts. A source starts
 * as `"loading"` (including on the server), then becomes `"loaded"` or
 * `"error"`. A missing source is `"error"` immediately. The parts switch
 * without enter or exit transitions.
 *
 * **Data attributes**
 *
 * None.
 *
 * **Keyboard**
 *
 * None: an avatar isn't interactive.
 *
 * **Example** (A user's picture, with their initials until it loads)
 *
 * ```ts import.meta.vitest
 * import { Component } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Avatar } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const Profile = Component.define({
 *   name: "Profile",
 *   model: Schema.Null,
 *   message: Schema.Never,
 *   elements: Html
 * }).make({
 *   init: () => null,
 *   update: ($) => $.model,
 *   view: (h) =>
 *     Avatar(h, {
 *       props: { src: "/ada.png" },
 *       view: (avatar) =>
 *         avatar.root(h.span.class(["avatar"])).children([
 *           avatar.image(h.img.attr("alt", "Ada Lovelace")),
 *           avatar.fallback(h.span.class(["initials"]))?.children(["AL"])
 *         ])
 *     })
 * })
 *
 * // The server can't load the image, so it draws the fallback.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Profile, {}))
 * if (!html.includes(`<span class="initials">AL</span>`) || html.includes("<img")) {
 *   throw new Error("the server didn't draw the fallback in place of the image")
 * }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as HtmlImages from "@effect/ui/html/HtmlImages"
import * as Subscription from "@effect/ui/Subscription"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

// What the avatar loads and the image draws. Two images with the same
// fields are the same load.
const Source = Schema.Struct({
  src: Schema.optional(Schema.String),
  srcSet: Schema.optional(Schema.String),
  sizes: Schema.optional(Schema.String),
  crossOrigin: Schema.optional(
    Schema.Literals(["anonymous", "use-credentials"])
  ),
  referrerPolicy: Schema.optional(Schema.String)
})
type Source = typeof Source.Type
const sourceFields = Object.keys(Source.fields) as ReadonlyArray<keyof Source>

/**
 * The image source and fallback delay for an `Avatar`.
 *
 * **Details**
 *
 * - `src`, `srcSet`, `sizes`, `crossOrigin` and `referrerPolicy`: the
 *   image, as the `<img>` attributes of the same names. The avatar loads
 *   it, and the image part sets them. Without a `src` or a `srcSet`, the
 *   status is `"error"` immediately.
 * - `fallbackDelay`: how long, in milliseconds, the fallback waits before
 *   it shows, so a fast image doesn't flash it. `0` by default. Once it
 *   has passed, the fallback shows whenever the image isn't loaded.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const AvatarProps = Schema.Struct({
  ...Source.fields,
  fallbackDelay: Schema.optional(Schema.Number)
})

/**
 * The props of an `Avatar`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AvatarProps = typeof AvatarProps.Type

/**
 * Where the avatar's image stands: `"loading"` until it settles, then
 * `"loaded"` or `"error"`. An image without a `src` or a `srcSet` is
 * `"error"`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AvatarImageLoadingStatus = "loading" | "loaded" | "error"

const Report = Schema.Struct({
  source: Source,
  status: Schema.Literals(["loading", "loaded", "error"])
})
type Report = typeof Report.Type

// The last report of the `image` subscription, for the source it was about.
// It reports every source, a missing one included, so a result never
// outlives a change of source: going back to a source that loaded before is
// loading until its new load settles. The fallback's delay passes once.
const AvatarModel = Schema.Struct({
  report: Schema.NullOr(Report),
  delayElapsed: Schema.Boolean
})

const AvatarMessage = UiSchema.TaggedEnum({
  ChangedImageStatus: Report.fields,
  ElapsedFallbackDelay: {}
})

// The props' source, without the fields they leave out or set to
// `undefined`, so both are the same source.
const sourceOf = ({ fallbackDelay: _, ...source }: AvatarProps): Source =>
  Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined)
  )

const hasImage = (source: Source): boolean => !!source.src || !!source.srcSet

const sameSource = Schema.toEquivalence(Source)

const statusOf = (
  report: Report | null,
  source: Source
): AvatarImageLoadingStatus =>
  !hasImage(source)
    ? "error"
    : report !== null && sameSource(report.source, source)
    ? report.status
    : "loading"

// Reports `"loading"`, then how the load settled. A missing source is
// `"error"` at once.
const loadImage = (source: Source) =>
  Subscription.make(
    "image",
    sourceFields.map((field) => source[field] ?? null),
    () => {
      const report = (status: AvatarImageLoadingStatus) =>
        AvatarMessage.ChangedImageStatus({ source, status })
      return hasImage(source)
        ? Stream.concat(
          Stream.make(report("loading")),
          Stream.fromEffect(
            HtmlImages.Images.use((images) => images.load(source))
          ).pipe(Stream.map(report))
        )
        : Stream.make(report("error"))
    }
  )

// Removed from the consumer's finished image before the part writes them,
// so they come last and in this order: a browser may start fetching as soon
// as `src` is set, so the request policy, `sizes` and `srcset` go before it.
const imageAttributes = [
  "crossorigin",
  "referrerpolicy",
  "sizes",
  "srcset",
  "src"
]

/**
 * A `<span>` the avatar's root and fallback accept, from the consumer's
 * `h.span`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AvatarSpan<Msg, R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"span">,
  HTMLSpanElement,
  "span"
>

/**
 * An `<img>` the avatar's image accepts, from the consumer's `h.img`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AvatarImg<Msg, R = never> = Html.VoidElement<
  Msg,
  R,
  Html.EventsOf<"img">,
  HTMLImageElement,
  "img"
>

/**
 * A headless avatar. Call it with the consumer's `h` and a `view` closure
 * that draws the root with `avatar.root(h.span)`, with the image,
 * `avatar.image(h.img)`, and the fallback, `avatar.fallback(h.span)?.children([...])`,
 * as its children.
 *
 * **Details**
 *
 * The avatar loads the image through `HtmlImages.Images`, and the image shows
 * once it has loaded. Until then, or when it fails, the fallback shows,
 * after `fallbackDelay`. On the server, and on a host without a loader,
 * the image never loads, so the fallback shows. A `TestHost` test settles
 * the load with `TestImages` from `@effect/ui/html/testing`.
 *
 * The image's own attributes win over the consumer's, set before the part
 * or chained after it: `src`, `srcset`, `sizes`, `crossorigin` and
 * `referrerpolicy`, including the ones the props leave out. The image
 * writes them when it's built, so the shown image is the one the avatar
 * loaded. They come after the consumer's attributes, with `src` last,
 * because a browser may start fetching as soon as `src` is set.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Avatar = Component.define({
  name: "Avatar",
  props: AvatarProps,
  model: AvatarModel,
  message: AvatarMessage,
  elements: Html
}).make({
  init: ({ props }) => ({
    report: null,
    delayElapsed: !((props.fallbackDelay ?? 0) > 0)
  }),
  update: {
    ChangedImageStatus: ($, { source, status }) =>
      $.evolve({ report: { source, status } }),
    ElapsedFallbackDelay: ($) => $.evolve({ delayElapsed: true })
  },
  subscriptions: ({ model, props }) => [
    loadImage(sourceOf(props)),
    !model.delayElapsed &&
    Subscription.make(
      "fallbackDelay",
      props.fallbackDelay ?? 0,
      (delay) =>
        Stream.fromEffect(Effect.sleep(delay)).pipe(
          Stream.as(AvatarMessage.ElapsedFallbackDelay())
        )
    )
  ],
  parts: (p, model) => {
    const source = sourceOf(p.props)
    const status = statusOf(model.report, source)
    const root = p.part("span", (b) => b)
    // Written when the image is built, after whatever the consumer chained,
    // so the shown image is the one the avatar loaded, with `src` last.
    const image = p.part(
      "img",
      (b) =>
        b.forward((node) =>
          imageAttributes.reduce((out, name) => out.attr(name, undefined), node)
            .attrs({
              crossorigin: source.crossOrigin,
              referrerpolicy: source.referrerPolicy,
              sizes: source.sizes,
              srcset: source.srcSet,
              src: source.src
            })
        )
    )
    const fallback = p.part("span", (b) => b)
    const showsFallback = status !== "loaded" && model.delayElapsed
    return {
      imageLoadingStatus: status,
      root: <Msg, R = never>(element: AvatarSpan<Msg, R>): AvatarSpan<Msg, R> =>
        root(element),
      // The image and the fallback are applied before they're dropped, so a
      // wrong tag throws in every state.
      image: <Msg, R = never>(
        element: AvatarImg<Msg, R>
      ): AvatarImg<Msg, R> | undefined => {
        const shown = image(element)
        return status === "loaded" ? shown : undefined
      },
      fallback: <Msg, R = never>(
        element: AvatarSpan<Msg, R>
      ): AvatarSpan<Msg, R> | undefined => {
        const shown = fallback(element)
        return showsFallback ? shown : undefined
      }
    }
  }
})
