/**
 * A row of menus, such as File, Edit and View along the top of an editor,
 * that the arrow keys move through as one control.
 *
 * `Menubar` is headless: it keeps one of its triggers in the page's Tab
 * order, moves focus between them, and tells each `Menu` drawn inside it
 * that it sits in a menubar. Each menu is an ordinary `Menu` call inside
 * the root, and the consumer owns which one is open, as for any `Menu`.
 *
 * **Anatomy**
 *
 * | Part   | Element                   |
 * | :----- | :------------------------ |
 * | `root` | `<div>` around the menus  |
 *
 * The root takes the consumer's builder and returns it, and the consumer
 * draws the menus inside it. It adds no markup. A menu inside a menubar
 * draws its `trigger` and `positioner` as it would anywhere else: the
 * trigger becomes a `menuitem` of the menubar, the popup opens below it,
 * or beside it in a vertical menubar, and lines up with its start.
 *
 * **Data attributes**
 *
 * On the root, `data-orientation` holds the orientation, and these are
 * present with an empty value or absent:
 *
 * - `data-modal`
 * - `data-has-submenu-open`: while one of its menus is open
 *
 * A menu's parts keep their `Menu` data attributes. When the open menu
 * moves to another trigger from the keyboard or the pointer, the
 * positioner and the popup of the menu that opens get
 * `data-instant="group"`, and so do those of the menu that closes when
 * focus moves to the other one: turn the transitions off then.
 *
 * **Keyboard**
 *
 * One trigger is in the page's Tab order: the one that last had focus, or
 * the first enabled one. On a trigger, ArrowRight and ArrowLeft, or
 * ArrowDown and ArrowUp in a vertical menubar, move focus to the next and
 * the previous trigger, and Home and End to the first and the last.
 * Focusing a trigger opens nothing. Enter and Space open its menu, and so
 * do ArrowDown and ArrowUp, on the first or the last item, or, in a
 * vertical menubar, the arrow key that points away from the bar.
 *
 * In an open menu of a horizontal menubar, ArrowRight and ArrowLeft open
 * the next and the previous menu, unless the highlighted item opens a
 * submenu or the key closes the submenu that has focus. In a vertical
 * menubar the arrow key that points back at the bar closes the menu.
 * Escape closes it, and focus goes back to its trigger.
 *
 * **Pointer**
 *
 * A press on a trigger opens its menu, and another press closes it.
 * Hovering a trigger opens nothing until one of the menus is open: then
 * hovering another trigger opens its menu at once, and the open one
 * closes.
 *
 * **Usage**
 *
 * Keep which menu is open as one value in the Model. A menu that closes
 * because another one opened can report `RequestedClose` after the other's
 * `RequestedOpen`, so clear the value only while it still names the menu that
 * reports it.
 *
 * Draw each menu's trigger and positioner inside the root: the menubar
 * finds its triggers there, in document order. A menu's own `modal`,
 * `openOnHover` and `delay` don't apply in a menubar. The menubar's
 * `modal` does, and the triggers and the empty parts of the bar stay
 * clickable over the modal layer. A disabled menubar disables every menu
 * in it. The writing direction is read from the root's computed
 * `direction`.
 *
 * **Example** (A File and an Edit menu, with the open one in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Menu, Menubar } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const menus = [
 *   { name: "File", items: [{ value: "new", label: "New" }, { value: "save", label: "Save" }] },
 *   { name: "Edit", items: [{ value: "undo", label: "Undo" }, { value: "redo", label: "Redo" }] }
 * ]
 *
 * const EditorMessage = UiSchema.TaggedEnum({
 *   RequestedOpenMenu: { menu: Schema.String },
 *   RequestedCloseMenu: { menu: Schema.String },
 *   PickedAction: { value: Schema.String }
 * })
 *
 * const Editor = Component.define({
 *   name: "Editor",
 *   scoped: false,
 *   model: Schema.Struct({ open: Schema.NullOr(Schema.String) }),
 *   message: EditorMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ open: null }),
 *   update: {
 *     RequestedOpenMenu: ($, { menu }) => $.evolve({ open: menu }),
 *     RequestedCloseMenu: ($, { menu }) => $.model.open === menu ? $.evolve({ open: null }) : $.model,
 *     PickedAction: ($) => $.model
 *   },
 *   view: (h, model) =>
 *     Menubar(h, {
 *       props: {},
 *       view: (menubar) =>
 *         menubar.root(h.div.class("menubar")).children(
 *           ...menus.map(({ items, name }) =>
 *             Menu(h, {
 *               key: name,
 *               props: { open: model.open === name, items },
 *               onEmit: {
 *                 RequestedOpen: () => EditorMessage.RequestedOpenMenu({ menu: name }),
 *                 RequestedClose: () => EditorMessage.RequestedCloseMenu({ menu: name }),
 *                 Picked: ({ value }) => EditorMessage.PickedAction({ value }),
 *                 Highlighted: () => undefined,
 *                 RequestedQuery: () => undefined,
 *                 Settled: () => undefined
 *               },
 *               view: (menu) =>
 *                 h.div(
 *                   menu.trigger({ element: h.button }).children(name),
 *                   menu.positioner(h.div).children(
 *                     menu.popup(h.div).children(
 *                       ...items.map((item) => menu.item({ element: h.div, value: item.value }).children(item.label))
 *                     )
 *                   )
 *                 )
 *             })
 *           )
 *         )
 *     })
 * })
 *
 * // The bar is a menubar, and each trigger is one of its items.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Editor, {}))
 * if (!/<div[^>]* role="menubar"/.test(html)) throw new Error("the root isn't a menubar")
 * if (!/<button[^>]* role="menuitem"[^>]*>Edit</.test(html)) throw new Error("the trigger isn't a menubar item")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { flag } from "./internal/attributes.ts"
import { isHTMLElement } from "./internal/dom.ts"
import { arrowKeys, Orientation, stepped } from "./internal/list.ts"
import { barTriggers, MenubarMenu, MenubarMessage, MenubarShared, triggerAttribute } from "./internal/menubar.ts"

/**
 * The props of a `Menubar`.
 *
 * **Details**
 *
 * - `orientation`: `"horizontal"`, the default, moves between the
 *   triggers with ArrowRight and ArrowLeft, and `"vertical"` with
 *   ArrowDown and ArrowUp.
 * - `modal`: while a menu is open, the page doesn't scroll and a press
 *   outside the menubar and the menu only closes the menu. True when left
 *   out.
 * - `disabled`: every menu in the menubar ignores the user.
 * - `loopFocus`: the arrow keys wrap from the last trigger to the first.
 *   True when left out.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenubarProps = Schema.Struct({
  orientation: Schema.optional(Orientation),
  modal: Schema.optional(Schema.Boolean),
  disabled: Schema.optional(Schema.Boolean),
  loopFocus: Schema.optional(Schema.Boolean)
})

/**
 * The props of a `Menubar`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenubarProps = typeof MenubarProps.Type

const MenubarModel = Schema.Struct({
  menus: Schema.Array(MenubarMenu),
  triggers: Schema.Array(Schema.String),
  rtl: Schema.Boolean,
  highlighted: Schema.NullOr(Schema.String),
  current: Schema.NullOr(Schema.String),
  opening: Schema.NullOr(Schema.String),
  moves: Schema.Number
})

type MenubarModel = typeof MenubarModel.Type

const orientationOf = (props: MenubarProps) => props.orientation ?? "horizontal"

const stateOf = (model: MenubarModel, props: MenubarProps) => ({
  orientation: orientationOf(props),
  modal: props.modal !== false,
  disabled: props.disabled === true,
  hasSubmenuOpen: openOf(model)
})

const tabStopOf = (model: MenubarModel): string | null =>
  model.highlighted !== null && model.triggers.includes(model.highlighted)
    ? model.highlighted
    : model.triggers[0] ?? null

const openOf = (model: MenubarModel): boolean => model.menus.some((menu) => menu.open && menu.trigger !== null)

const TrackMenubar = Mount.makeStream(
  "TrackMenubar",
  { args: { highlighted: Schema.NullOr(Schema.String), moves: Schema.Number } },
  (node: unknown, initial, changes) =>
    Stream.callback<MenubarMessage>((queue) =>
      Effect.gen(function*() {
        if (!isHTMLElement(node)) return
        const document = node.ownerDocument
        const view = document.defaultView
        let found = ""
        const scan = () => {
          const triggers = barTriggers(node)
            .filter((trigger) => trigger.id !== "" && !trigger.hasAttribute("disabled"))
            .map((trigger) => trigger.id)
          const rtl = view?.getComputedStyle(node).direction === "rtl"
          const next = JSON.stringify([triggers, rtl])
          if (next === found) return
          found = next
          Queue.offerUnsafe(queue, MenubarMessage.FoundTriggers({ triggers, rtl }))
        }
        const selector = `[${triggerAttribute}]`
        const holdsTrigger = (changed: Node) =>
          isHTMLElement(changed) && (changed.matches(selector) || changed.querySelector(selector) !== null)
        const Observer = view?.MutationObserver
        const observer = Observer === undefined ? undefined : new Observer((records) => {
          if (
            records.some((record) =>
              record.type === "attributes" || Array.from(record.addedNodes).some(holdsTrigger) ||
              Array.from(record.removedNodes).some(holdsTrigger)
            )
          ) scan()
        })
        observer?.observe(node, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["id", "disabled", triggerAttribute]
        })
        scan()
        yield* Effect.addFinalizer(() => Effect.sync(() => observer?.disconnect()))
        let moves = initial.moves
        yield* Stream.runForEach(changes, (next) =>
          Effect.sync(() => {
            if (next.moves === moves) return
            moves = next.moves
            const target = next.highlighted === null ? null : document.getElementById(next.highlighted)
            target?.focus({ focusVisible: true } as FocusOptions)
          })).pipe(Effect.forkScoped)
      })
    )
)

/**
 * A headless menubar. Call it with the consumer's `h`, the `props`, and a
 * `view` closure that draws the root with `menubar.root(h.div)` and a
 * `Menu` inside it for each menu.
 *
 * **Details**
 *
 * The parts also return `orientation`, `modal`, `disabled` and
 * `hasSubmenuOpen`, whether one of its menus is open, for markup that
 * depends on them.
 *
 * The root writes `role="menubar"`, `aria-orientation` and its data
 * attributes over what the consumer set on the builder before the part.
 * A trigger in the menubar writes `role="menuitem"` and `tabindex` over
 * the consumer's, besides what a `Menu` trigger writes.
 *
 * The menubar shares its state with the menus in its `view` closure,
 * which is how a `Menu` inside reads it. It emits nothing: each menu
 * reports its own `RequestedOpen` and `RequestedClose`.
 *
 * History restore saves nothing of it: after Back, forward or a reload it
 * starts from `init`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Menubar = Component.define({
  name: "Menubar",
  scoped: false,
  props: MenubarProps,
  model: MenubarModel,
  message: MenubarMessage,
  shares: {
    value: (model, props) => ({
      ...stateOf(model, props),
      rtl: model.rtl,
      current: model.current,
      tabStop: tabStopOf(model),
      opening: model.opening
    }),
    schema: MenubarShared,
    receives: ["Navigated", "FocusedTrigger"],
    collects: {
      schema: MenubarMenu,
      onChange: (menus) => MenubarMessage.ChangedMenus({ menus })
    }
  },
  restore: false,
  elements: Html
}).make({
  init: () => ({
    menus: [],
    triggers: [],
    rtl: false,
    highlighted: null,
    current: null,
    opening: null,
    moves: 0
  }),
  update: {
    ChangedMenus: ($, { menus }) => {
      const opened = menus.find((menu) =>
        menu.open && menu.trigger !== null &&
        !$.model.menus.some((before) => before.open && before.trigger === menu.trigger)
      )
      return opened?.trigger != null
        ? { ...$.model, menus, current: opened.trigger, highlighted: opened.trigger }
        : { ...$.model, menus }
    },
    FoundTriggers: ($, { rtl, triggers }) => ({ ...$.model, triggers, rtl }),
    Navigated: ($, { from, key, open }) => {
      const props = $.props
      if (props.disabled === true) return $.model
      const triggers = $.model.triggers
      const last = triggers.length - 1
      const start = from ?? $.model.current ?? $.model.highlighted
      const at = start === null ? -1 : triggers.indexOf(start)
      const nav = arrowKeys(orientationOf(props), $.model.rtl)
      const index = key === "Home"
        ? 0
        : key === "End"
        ? last
        : key === nav.next || key === nav.previous
        ? stepped(at, last, key === nav.next ? 1 : -1, props.loopFocus !== false ? "wrap" : "none")
        : -1
      const target = triggers[index]
      if (target === undefined || target === start) return $.model
      return { ...$.model, highlighted: target, opening: open ? target : null, moves: $.model.moves + 1 }
    },
    FocusedTrigger: ($, { trigger }) => ({ ...$.model, highlighted: trigger, opening: null })
  },
  parts: (p, model) => {
    const state = stateOf(model, p.props)
    const { hasSubmenuOpen, modal, orientation } = state
    return {
      ...state,
      root: p.part("div", (b) =>
        b
          .attrs({
            role: "menubar",
            "aria-orientation": orientation,
            "data-orientation": orientation,
            "data-modal": flag(modal),
            "data-has-submenu-open": flag(hasSubmenuOpen)
          })
          .onMount(TrackMenubar({ highlighted: model.highlighted, moves: model.moves })))
    }
  }
})
