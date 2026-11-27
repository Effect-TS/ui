/**
 * A navigation landmark with a list of links, where the link to the page
 * being shown is marked as the current one.
 *
 * `NavigationLinks` is headless: it owns the ARIA and data attributes and the
 * arrow keys, and the consumer draws the markup. Which link is the current
 * one is the consumer's to say, usually from the route. For triggers that
 * open panels of links, use `NavigationMenu`.
 *
 * **Anatomy**
 *
 * | Part   | Element                 |
 * | :----- | :---------------------- |
 * | `root` | `<nav>`                 |
 * | `list` | `<ul>` inside the root  |
 * | `item` | `<li>` inside the list  |
 * | `link` | `<a>` inside an item    |
 *
 * `root`, `list` and `item` each take the consumer's builder and return it,
 * so the consumer goes on chaining and adds children with `.children(...)`.
 * `link` takes `{ element, active }` and returns `element`:
 * `navigationLinks.link({ element: h.a.attr("href", "/"), active: true }).children("Home")`.
 * The `href` is the consumer's to set. No part adds markup.
 *
 * Naming the landmark is the consumer's job. On a page with more than one
 * `<nav>`, give each root an `aria-label` or `aria-labelledby`, so a screen
 * reader can tell them apart.
 *
 * **Data attributes**
 *
 * - `link`: `data-active`, present with an empty value on the active link
 *   and absent on the others
 *
 * **Keyboard**
 *
 * Every link stays in the Tab order and Enter follows the focused one, as
 * the browser does for any link. The arrow keys also move focus between the
 * links of a list: Right and Left in a horizontal list, swapped when it is
 * right-to-left, and Down and Up in a vertical one. The list follows the
 * nearest `DirectionProvider` above it or, without one, the list's CSS
 * `direction`.
 * Focus stops at the first and the last link and doesn't wrap. A link with
 * `aria-disabled="true"` is skipped, and so is one the browser won't focus,
 * such as a hidden or inert link or one without an `href`. A list inside
 * another list's item keeps its links to itself: the outer list's arrow keys
 * pass over them.
 *
 * An arrow key pressed with Shift, Control, Alt or Meta is left alone, and
 * so is one whose default the consumer's own `keydown` handler cancelled. The
 * list cancels the key's default only when focus moves, so an arrow key on
 * the last link still scrolls the page.
 *
 * **Identity**
 *
 * Two lists under one parent, such as one in the header and one in the
 * footer, each need a `key`.
 *
 * **Example** (A list whose current link follows the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { NavigationLinks } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const pages = [{ path: "/", label: "Home" }, { path: "/docs", label: "Docs" }]
 *
 * const Header = Html.component({
 *   name: "Header",
 *   model: Schema.Struct({ path: Schema.String }),
 *   message: Schema.Never
 * }).make({
 *   init: () => ({ path: "/docs" }),
 *   update: ($) => $.model,
 *   view: (h, model) =>
 *     NavigationLinks(h, {
 *       view: (navigationLinks) =>
 *         navigationLinks.root(h.nav.attr("aria-label", "Main")).children(
 *           navigationLinks.list(h.ul.class("menu")).children(
 *             pages.map((page) =>
 *               navigationLinks.item(h.li.key(page.path)).children(
 *                 navigationLinks.link({
 *                   element: h.a.class("link").attr("href", page.path),
 *                   active: page.path === model.path
 *                 }).children(page.label)
 *               )
 *             )
 *           )
 *         )
 *     })
 * })
 *
 * // The link to the page being shown is the only current one.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Header, {}))
 * if (!/<a class="link"[^>]* aria-current="page"[^>]*>Docs</.test(html)) throw new Error("Docs isn't the current link")
 * if (html.split("aria-current").length !== 2) throw new Error("more than one link is current")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Html from "@effect/ui/html/Html"
import * as View from "@effect/ui/View"
import * as Schema from "effect/Schema"
import { DirectionProvider } from "./DirectionProvider.ts"
import { provided } from "./internal/direction.ts"
import { linkAttrs, TrackArrowKeys } from "./internal/navigation.ts"

/**
 * Props for the direction the links run in.
 *
 * **Details**
 *
 * - `orientation`: `"horizontal"` by default, where Right and Left move
 *   focus between the links. `"vertical"` uses Down and Up.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const NavigationLinksProps = Schema.Struct({
  orientation: Schema.optional(Schema.Literals(["horizontal", "vertical"]))
})

/**
 * The props of a `NavigationLinks`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NavigationLinksProps = typeof NavigationLinksProps.Type

/**
 * A headless list of navigation links. Call it with the consumer's `h` and a `view`
 * closure that draws the root with `navigationLinks.root(h.nav)`, the list
 * with `navigationLinks.list(h.ul)` inside it, and a
 * `navigationLinks.item(h.li)` around each link.
 *
 * **Details**
 *
 * `link({ element, active })` returns `element`, and `active` is `false`
 * when left out. `root(nav)`, `list(ul)` and `item(li)` each return the
 * builder they were given. The consumer chains classes, attributes, handlers
 * and children on the result. No part sets a handler, so every event is the
 * consumer's to handle. The list's arrow keys are a mount on a layer of its
 * own, so the consumer's `onMount` on the list stays.
 *
 * The link's own attributes win over the ones the consumer set on the
 * builder before the part: `aria-current`, which is `page` on the active
 * link, `data-active`, and `data-navigation-item`, which the list
 * tells its links by. That includes the ones a state leaves absent, so an
 * `aria-current` on the consumer's builder is removed from a link that isn't
 * active. A part writes them when it is applied, so an attribute the consumer
 * chains after `navigationLinks.link(...)` is the consumer's to answer for.
 * `href`, `tabindex`, `aria-label` and every other attribute stay the
 * consumer's.
 *
 * It emits nothing: following a link is the browser's and the router's.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const NavigationLinks = Html.component({
  name: "NavigationLinks",
  props: NavigationLinksProps,
  model: Schema.Struct({}),
  message: Schema.Never,
  reads: {
    provider: { owner: DirectionProvider, optional: true }
  }
}).make({
  init: () => ({}),
  update: ($) => $.model,
  parts: (p) => {
    const scope = p.id("list")
    const link = p.part(
      "a",
      (b, active: boolean) => linkAttrs(b, scope, active)
    )
    return {
      root: p.part("nav", (b) => b),
      list: p.part(
        "ul",
        (b) =>
          b.onMount(
            TrackArrowKeys({
              scope,
              vertical: p.props.orientation === "vertical",
              rtl: provided(p.reads.provider)
            })
          )
      ),
      item: p.part("li", (b) => b),
      link: View.wrapPart(
        link,
        <B extends View.PartTarget<"a">>(
          { active, element }: {
            readonly element: B
            readonly active?: boolean | undefined
          }
        ): ReturnType<B["attr"]> => link(element, active === true)
      )
    }
  }
})
