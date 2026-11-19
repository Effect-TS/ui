/**
 * A user's picture with a fallback, such as initials or an icon, while the
 * picture loads or if it fails.
 *
 * **Anatomy**
 *
 * | Part       | Element | Behavior                                         |
 * | :--------- | :------ | :----------------------------------------------- |
 * | `root`     | `<span>` | Starts loading the image when mounted.           |
 * | `image`    | `<img>`  | Shown once the current source loads.             |
 * | `fallback` | `<span>` | Shown after the delay if the image isn't loaded. |
 *
 * Place the image and fallback inside the root. Each part takes an element
 * builder and returns it, or `undefined` if the part is hidden. Use
 * `fallback(h.span)?.children(...)` to supply the fallback content.
 * Give the image an `alt` and the fallback text or a label for its icon.
 *
 * **Loading behavior**
 *
 * Set the image source and `fallbackDelay` on the avatar. The root loads
 * the source before the image part is rendered, so `loading="lazy"` on
 * that part does not defer the request. The delay defaults to zero.
 *
 * Use `imageLoadingStatus` in the view to style the parts. A source starts
 * as `"loading"` (including on the server), then becomes `"loaded"` or
 * `"error"`. A missing source is `"error"` immediately. The parts set no
 * state data attributes and switch without enter or exit transitions.
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
 *   update: (model) => model,
 *   view: (_model, h) =>
 *     Avatar(h, {
 *       key: "avatar",
 *       props: { src: "/ada.png" },
 *       view: (s) =>
 *         s.root(h.span.class("avatar")).children(
 *           s.image(h.img.attr("alt", "Ada Lovelace")),
 *           s.fallback(h.span.class("initials"))?.children("AL")
 *         )
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
import * as Mount from "@effect/ui/Mount"
import * as Subscription from "@effect/ui/Subscription"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

// What the root loads and the image draws. Two images with the same fields
// are the same load.
const Source = Schema.Struct({
  src: Schema.optional(Schema.String),
  srcSet: Schema.optional(Schema.String),
  sizes: Schema.optional(Schema.String),
  crossOrigin: Schema.optional(Schema.Literals(["anonymous", "use-credentials"])),
  referrerPolicy: Schema.optional(Schema.String)
})
type Source = typeof Source.Type

/**
 * The image source and fallback delay for an `Avatar`.
 *
 * **Details**
 *
 * - `src`, `srcSet`, `sizes`, `crossOrigin` and `referrerPolicy`: the
 *   image, as the `<img>` attributes of the same names. The root loads
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

// The mount's last report, for the source it was about. The mount reports
// every source it gets, a missing one included, so a result never outlives
// a change of source: going back to a source that loaded before is loading
// until its new load settles. The fallback's delay passes once.
const Model = Schema.Struct({
  report: Schema.NullOr(Report),
  delayElapsed: Schema.Boolean
})

const Message = UiSchema.TaggedEnum({
  ChangedImageStatus: Report.fields,
  ElapsedFallbackDelay: {}
})

// The props' source, without the fields they leave out or set to
// `undefined`, so both are the same source.
const sourceOf = ({ fallbackDelay: _, ...source }: AvatarProps): Source =>
  Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined))

const hasImage = (source: Source): boolean => !!source.src || !!source.srcSet

// The comparison the runtime makes to tell whether the mount's args, and so
// the source it loads, changed.
const sameSource = Schema.toEquivalence(Source)

const statusOf = (report: Report | null, source: Source): AvatarImageLoadingStatus =>
  !hasImage(source)
    ? "error"
    : report !== null && sameSource(report.source, source)
    ? report.status
    : "loading"

// Load the source in a detached <img>. A cached image may already be complete.
const load = (document: Document, source: Source) =>
  Effect.callback<Report>((resume) => {
    const image = document.createElement("img")
    const settle = (status: "loaded" | "error") => resume(Effect.succeed({ source, status }))
    if (source.referrerPolicy !== undefined) image.referrerPolicy = source.referrerPolicy
    image.crossOrigin = source.crossOrigin ?? null
    if (source.sizes !== undefined) image.sizes = source.sizes
    if (source.srcSet !== undefined) image.srcset = source.srcSet
    if (source.src !== undefined) image.src = source.src
    if (image.complete) return settle(image.naturalWidth > 0 ? "loaded" : "error")
    image.onload = () => settle("loaded")
    image.onerror = () => settle("error")
    return Effect.sync(() => {
      image.onload = null
      image.onerror = null
    })
  })

/**
 * The root's mount: it loads each image source the root renders with, and
 * reports each one as `"loading"` and then how its load settled, dropping
 * the load of a source the root no longer has. A missing source is
 * reported as `"error"` at once.
 *
 * **When to use**
 *
 * Use to name the load in a `Scene` of an avatar's parts: acknowledge it
 * with `expectMount`, or end it with
 * `mounted(AvatarLoadImage, { source, status })`. It never runs on the
 * server or in `TestHost`.
 *
 * @stability experimental
 * @category mounts
 * @since 0.1.0
 */
export const AvatarLoadImage = Mount.makeStream(
  "AvatarLoadImage",
  { args: Source },
  (node: Element, _args, changes) =>
    changes.pipe(Stream.switchMap((source): Stream.Stream<Report> =>
      hasImage(source)
        ? Stream.concat(
          Stream.make({ source, status: "loading" as const }),
          Stream.fromEffect(load(node.ownerDocument, source))
        )
        : Stream.make({ source, status: "error" as const })
    ))
)

const loadImage = (source: Source) =>
  AvatarLoadImage(source).pipe(Mount.map((report) => Message.ChangedImageStatus({ ...report })))

// Removed from the consumer's finished image before the part writes them,
// so they come last and in this order: a browser may start fetching as soon
// as `src` is set, so the request policy, `sizes` and `srcset` go before it.
const imageAttributes = ["crossorigin", "referrerpolicy", "sizes", "srcset", "src"]

/**
 * A `<span>` the avatar's root and fallback accept, from the consumer's
 * `h.span`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AvatarSpan<Msg, R = never> = Html.Element<Msg, R, Html.EventsOf<"span">, HTMLSpanElement, "span">

/**
 * An `<img>` the avatar's image accepts, from the consumer's `h.img`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AvatarImg<Msg, R = never> = Html.VoidElement<Msg, R, Html.EventsOf<"img">, HTMLImageElement, "img">

/**
 * A headless avatar. Call it with the consumer's `h` and a `view` closure
 * that draws the root with `s.root(h.span)`, with the image,
 * `s.image(h.img)`, and the fallback, `s.fallback(h.span)?.children(...)`,
 * as its children.
 *
 * **Details**
 *
 * The root loads the image in the browser, and the image shows once it
 * has loaded. Until then, or when it fails, the fallback shows, after
 * `fallbackDelay`. On the server, and on a host that doesn't run mounts,
 * the image never loads, so the fallback shows.
 *
 * The image's own attributes win over the consumer's, set before the part
 * or chained after it: `src`, `srcset`, `sizes`, `crossorigin` and
 * `referrerpolicy`, including the ones the props leave out. The image
 * writes them when it's built, so the shown image is the one the root
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
  model: Model,
  message: Message,
  elements: Html
}).make({
  init: ({ props }) => ({
    report: null,
    delayElapsed: !((props.fallbackDelay ?? 0) > 0)
  }),
  update: {
    ChangedImageStatus: (model, { source, status }) => ({ ...model, report: { source, status } }),
    ElapsedFallbackDelay: (model) => ({ ...model, delayElapsed: true })
  },
  subscriptions: (model, props) => [
    !model.delayElapsed &&
    Subscription.make(
      "fallbackDelay",
      props.fallbackDelay ?? 0,
      (delay) => Stream.fromEffect(Effect.sleep(delay)).pipe(Stream.as(Message.ElapsedFallbackDelay()))
    )
  ],
  parts: (model, p) => {
    const source = sourceOf(p.props)
    const status = statusOf(model.report, source)
    const root = p.part("span", (b) => b.onMount(loadImage(source)))
    // Written when the image is built, after whatever the consumer chained,
    // so the shown image is the one the root loaded, with `src` last.
    const image = p.part(
      "img",
      (b) =>
        b.forward((node) =>
          imageAttributes.reduce((out, name) => out.attr(name, undefined), node)
            .attr("crossorigin", source.crossOrigin)
            .attr("referrerpolicy", source.referrerPolicy)
            .attr("sizes", source.sizes)
            .attr("srcset", source.srcSet)
            .attr("src", source.src)
        )
    )
    const fallback = p.part("span", (b) => b)
    const showsFallback = status !== "loaded" && model.delayElapsed
    return {
      imageLoadingStatus: status,
      root: View.wrapPart(root, <Msg, R = never>(element: AvatarSpan<Msg, R>): AvatarSpan<Msg, R> => root(element)),
      // The image and the fallback are applied before they're dropped, so a
      // wrong tag throws in every state.
      image: <Msg, R = never>(element: AvatarImg<Msg, R>): AvatarImg<Msg, R> | undefined => {
        const shown = image(element)
        return status === "loaded" ? shown : undefined
      },
      fallback: <Msg, R = never>(element: AvatarSpan<Msg, R>): AvatarSpan<Msg, R> | undefined => {
        const shown = fallback(element)
        return showsFallback ? shown : undefined
      }
    }
  }
})
