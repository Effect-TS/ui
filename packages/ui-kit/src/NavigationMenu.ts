/**
 * A navigation landmark with a list of links, where the link to the page
 * being shown is marked as the current one.
 *
 * `NavigationMenu` is headless: it owns the ARIA and data attributes and the
 * arrow keys, and the consumer draws the markup. Which link is the current
 * one is the consumer's to say, usually from the route.
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
 * so the consumer goes on chaining and adds children with `.children([...])`.
 * `link` takes `{ element, active }` and returns `element`:
 * `navigationMenu.link({ element: h.a.attr("href", "/"), active: true }).children(["Home"])`.
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
 * links of a list: Right and Left in a horizontal menu, swapped when the
 * list's text direction is right-to-left, and Down and Up in a vertical one.
 * Focus stops at the first and the last link and doesn't wrap. A link with
 * `aria-disabled="true"` is skipped, and so is one the browser won't focus,
 * such as a hidden or inert link or one without an `href`. A menu inside
 * another menu's item keeps its links to itself: the outer list's arrow keys
 * pass over them.
 *
 * An arrow key pressed with Shift, Control, Alt or Meta is left alone, and
 * so is one whose default the consumer's own `onKeyDown` cancelled. The
 * menu cancels the key's default only when focus moves, so an arrow key on
 * the last link still scrolls the page.
 *
 * **Identity**
 *
 * Two menus under one parent, such as one in the header and one in the
 * footer, each need a `key`.
 *
 * **Example** (A menu whose current link follows the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { NavigationMenu } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const pages = [{ path: "/", label: "Home" }, { path: "/docs", label: "Docs" }]
 *
 * const Header = Component.define({
 *   name: "Header",
 *   model: Schema.Struct({ path: Schema.String }),
 *   message: Schema.Never,
 *   elements: Html
 * }).make({
 *   init: () => ({ path: "/docs" }),
 *   update: ($) => $.model,
 *   view: (h, model) =>
 *     NavigationMenu(h, {
 *       view: (navigationMenu) =>
 *         navigationMenu.root(h.nav.attr("aria-label", "Main")).children([
 *           navigationMenu.list(h.ul.class(["menu"])).children(
 *             pages.map((page) =>
 *               navigationMenu.item(h.li.key(page.path)).children([
 *                 navigationMenu.link({
 *                   element: h.a.class(["link"]).attr("href", page.path),
 *                   active: page.path === model.path
 *                 }).children([page.label])
 *               ])
 *             )
 *           )
 *         ])
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
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as View from "@effect/ui/View"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { flag } from "./internal/attributes.ts"

/**
 * Props for the direction the menu's links run in.
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
export const NavigationMenuProps = Schema.Struct({
  orientation: Schema.optional(Schema.Literals(["horizontal", "vertical"]))
})

/**
 * The props of a `NavigationMenu`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NavigationMenuProps = typeof NavigationMenuProps.Type

const linkAttribute = "data-navigation-menu-link"

const TrackArrowKeys = Mount.makeStream(
  "TrackArrowKeys",
  { args: { scope: Schema.String, vertical: Schema.Boolean } },
  (node: HTMLElement, args, changes) =>
    Stream.callback<never>(() =>
      Effect.gen(function*() {
        let { vertical } = args
        const onKeyDown = (event: KeyboardEvent) => {
          if (
            event.defaultPrevented || event.shiftKey || event.ctrlKey ||
            event.altKey || event.metaKey
          ) return
          const [backward, forward] = vertical
            ? ["ArrowUp", "ArrowDown"]
            : ["ArrowLeft", "ArrowRight"]
          if (event.key !== backward && event.key !== forward) return
          const rtl = !vertical &&
            node.ownerDocument.defaultView?.getComputedStyle(node).direction ===
              "rtl"
          const links = Array.from(
            node.querySelectorAll<HTMLElement>(
              `[${linkAttribute}="${CSS.escape(args.scope)}"]`
            )
          )
          const from = links.findIndex((link) =>
            link.contains(event.target as Node | null)
          )
          if (from < 0) return
          const ahead = (event.key === forward) !== rtl
            ? links.slice(from + 1)
            : links.slice(0, from).reverse()
          const root = node.getRootNode() as Document | ShadowRoot
          const focused = root.activeElement
          const moved = ahead.some((link) => {
            if (link.getAttribute("aria-disabled") === "true") return false
            link.focus()
            return root.activeElement !== focused
          })
          if (moved) event.preventDefault()
        }
        yield* Effect.acquireRelease(
          Effect.sync(() => node.addEventListener("keydown", onKeyDown)),
          () =>
            Effect.sync(() => node.removeEventListener("keydown", onKeyDown))
        )
        yield* Stream.runForEach(changes, (next) =>
          Effect.sync(() => {
            vertical = next.vertical
          })).pipe(Effect.forkScoped)
      })
    )
)

/**
 * A headless navigation menu. Call it with the consumer's `h` and a `view`
 * closure that draws the root with `navigationMenu.root(h.nav)`, the list
 * with `navigationMenu.list(h.ul)` inside it, and a
 * `navigationMenu.item(h.li)` around each link.
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
 * link, `data-active`, and `data-navigation-menu-link`, which the list
 * tells its links by. That includes the ones a state leaves absent, so an
 * `aria-current` on the consumer's builder is removed from a link that isn't
 * active. A part writes them when it is applied, so an attribute the consumer
 * chains after `navigationMenu.link(...)` is the consumer's to answer for.
 * `href`, `tabindex`, `aria-label` and every other attribute stay the
 * consumer's.
 *
 * It emits nothing: following a link is the browser's and the router's.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const NavigationMenu = Component.define({
  name: "NavigationMenu",
  props: NavigationMenuProps,
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html
}).make({
  init: () => ({}),
  update: ($) => $.model,
  parts: (p) => {
    const scope = p.id("list")
    const link = p.part(
      "a",
      (b, active: boolean) =>
        b.attr("aria-current", active ? "page" : undefined)
          .attr("data-active", flag(active))
          .attr(linkAttribute, scope)
    )
    return {
      root: p.part("nav", (b) => b),
      list: p.part(
        "ul",
        (b) =>
          b.onMount(
            TrackArrowKeys({
              scope,
              vertical: p.props.orientation === "vertical"
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
        ): ReturnType<B["attr"]> => link(element, [active === true])
      )
    }
  }
})
