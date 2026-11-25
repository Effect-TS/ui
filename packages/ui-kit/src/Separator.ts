/**
 * A horizontal or vertical divider between sections of content.
 *
 * `Separator` is a view function. It keeps no state, so it takes no `key`.
 *
 * **Anatomy**
 *
 * `Separator` returns a single `<div>` builder. It uses `h.div` by default.
 * Pass `element` to share the divider with another part. Chain classes,
 * attributes and children on the result: `Separator(h).class("rule")`.
 *
 * **Data attributes**
 *
 * - `data-orientation`: `"horizontal"` or `"vertical"`.
 *
 * **Keyboard**
 *
 * None: a separator is not focusable.
 *
 * **Limits**
 *
 * `Separator` is a static divider, not a draggable splitter carrying
 * `aria-valuenow`.
 *
 * **Example** (A row of links with a vertical separator)
 *
 * ```ts import.meta.vitest
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Separator } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const Nav = Html.component({
 *   name: "Nav",
 *   model: Schema.Null,
 *   message: Schema.Never
 * }).make({
 *   init: () => null,
 *   update: ($) => $.model,
 *   view: (h) =>
 *     h.nav(
 *       h.a.attr("href", "/docs").children("Docs"),
 *       Separator(h, { props: { orientation: "vertical" } }).class("rule"),
 *       h.a.attr("href", "/blog").children("Blog")
 *     )
 * })
 *
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Nav, {}))
 * if (!/<div class="rule"[^>]* role="separator"[^>]* aria-orientation="vertical"/.test(html)) {
 *   throw new Error("the separator doesn't carry the consumer's class and vertical role")
 * }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Html from "@effect/ui/html/Html"
import { separatorAttrs } from "./internal/attributes.ts"

/**
 * The direction of a `Separator`.
 *
 * **Details**
 *
 * - `orientation`: `"horizontal"` by default.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface SeparatorProps {
  readonly orientation?: "horizontal" | "vertical" | undefined
}

/**
 * A `<div>` builder: what `Separator` accepts as `element`, from the
 * caller's `h.div`, and what it returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SeparatorElement<Msg, R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"div">,
  HTMLDivElement,
  "div"
>

/**
 * A static divider between sections of content. Call it with the caller's
 * `h`, then chain classes or attributes on the returned `<div>` builder.
 *
 * **Details**
 *
 * `Separator` returns the builder it was given, or `h.div`, and writes its
 * own attributes in `forward`, when the element is built. So they win over
 * the caller's, set on `element` or chained after the call: `role`,
 * `aria-orientation` and `data-orientation`. A purely decorative divider
 * keeps the caller's `role="none"` or `role="presentation"`, and drops
 * `aria-orientation`, so a screen reader skips it. `Separator` reserves no
 * event, so the caller's other attributes, handlers and children stay.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Separator = <Msg, R = never>(
  h: { readonly div: SeparatorElement<Msg> },
  options: {
    /** The caller's `h.div`, to stack a part on it. `h.div` when left out. */
    readonly element?: SeparatorElement<Msg, R> | undefined
    readonly props?: SeparatorProps | undefined
  } = {}
): SeparatorElement<Msg, R> => {
  const element: SeparatorElement<Msg, R> = options.element ?? h.div
  const orientation = options.props?.orientation ?? "horizontal"
  return element.forward((node) => {
    const role = node.elementAttrs.role
    const own = separatorAttrs(node, orientation)
    return role === "none" || role === "presentation"
      ? own.attrs({ role, "aria-orientation": undefined })
      : own
  })
}
