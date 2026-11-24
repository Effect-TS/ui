/**
 * Tells the components inside it which way the text runs, so a control
 * whose keys follow the reading direction, such as a one-time code field's
 * Left and Right arrows, moves the right way in a right-to-left layout.
 *
 * `DirectionProvider` is a headless component with no parts of its own. It
 * draws no element, keeps no state and emits nothing: it shares
 * `{ direction }` with the components in its `view` closure.
 *
 * **Anatomy**
 *
 * It has no parts. The `view` closure returns the content, and gets
 * `directionProvider.direction` for markup that depends on it:
 * `DirectionProvider(h, { props: { direction: "rtl" }, view: (directionProvider) => h.div.attr("dir", directionProvider.direction).children(...) })`.
 *
 * **Data attributes**
 *
 * None.
 *
 * **Keyboard**
 *
 * None of its own. A component inside that reads it swaps the keys that
 * follow the reading direction: in a right-to-left layout Left goes to the
 * next item and Right to the previous one.
 *
 * **Usage**
 *
 * The provider doesn't write the `dir` attribute and doesn't read it
 * either. Set `dir` on an element yourself, on `<html>` or on the one the
 * `view` closure returns, so the browser lays the text out the same way.
 * A component with no provider above it is left-to-right.
 *
 * A component reads the nearest provider above it, at any depth, so one
 * provider around the app is enough, and a provider around one region
 * overrides it there.
 *
 * **Example** (A right-to-left region)
 *
 * ```ts import.meta.vitest
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { DirectionProvider } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const Page = Html.component({
 *   name: "Page",
 *   model: Schema.Struct({}),
 *   message: Schema.Never
 * }).make({
 *   init: () => ({}),
 *   update: ($) => $.model,
 *   view: (h) =>
 *     DirectionProvider(h, {
 *       props: { direction: "rtl" },
 *       view: (directionProvider) => h.main.attr("dir", directionProvider.direction).children("مرحبا")
 *     })
 * })
 *
 * // The provider draws nothing itself: the consumer's element carries the direction.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Page, {}))
 * if (!html.includes('<main dir="rtl">')) throw new Error("the region isn't right-to-left")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Html from "@effect/ui/html/Html"
import * as Schema from "effect/Schema"

/**
 * The reading direction of text: left-to-right or right-to-left.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DirectionProviderDirection = Schema.Literals(["ltr", "rtl"])

/**
 * The reading direction of text.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DirectionProviderDirection = typeof DirectionProviderDirection.Type

/**
 * Props for a `DirectionProvider`.
 *
 * **Details**
 *
 * - `direction`: the reading direction the components inside follow,
 *   `"ltr"` by default.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const DirectionProviderProps = Schema.Struct({
  direction: Schema.optional(DirectionProviderDirection)
})

/**
 * The props of a `DirectionProvider`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type DirectionProviderProps = typeof DirectionProviderProps.Type

/**
 * A headless provider of the reading direction. Call it with the consumer's
 * `h`, the `props`, and a `view` closure that returns the content.
 *
 * **Details**
 *
 * It owns no element, so it writes no attribute and handles no event. The
 * `view` closure gets `direction`, and the components inside it read the
 * same value as shared state.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const DirectionProvider = Html.component({
  name: "DirectionProvider",
  props: DirectionProviderProps,
  model: Schema.Struct({}),
  message: Schema.Never,

  shares: {
    value: (_model, props) => ({ direction: props.direction ?? "ltr" }),
    schema: Schema.Struct({ direction: DirectionProviderDirection })
  }
}).make({
  init: () => ({}),
  update: ($) => $.model,
  parts: (p) => ({ direction: p.props.direction ?? "ltr" })
})
