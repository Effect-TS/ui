/**
 * A menu that opens at the pointer on a right click, or after a long press
 * on a touch screen, over an area of the page.
 *
 * `ContextMenu` is a function over a headless `Menu`: the parts, the
 * events, the items, submenus, focus and transitions are the `Menu`'s.
 * Its `trigger` is the area that opens it, and it is always modal: while
 * open, the rest of the page is hidden from assistive technology. The
 * consumer owns whether it is open, passes it as `open`, and stores what
 * `RequestedOpen` and `RequestedClose` ask for.
 *
 * **Anatomy**
 *
 * | Part                    | Element                                                |
 * | :---------------------- | :----------------------------------------------------- |
 * | `trigger`               | `<div>`, the area a right click or a long press opens  |
 * | `backdrop`              | `<div>`, a manual popover under the positioner         |
 * | `positioner`            | `<div>`, a manual popover placed at the pointer        |
 * | `popup`                 | `<div>` inside the positioner                          |
 * | `arrow`                 | `<div>` inside the popup                               |
 * | `item`                  | `<div>`, one per value                                 |
 * | `linkItem`              | `<a>`, one per value                                   |
 * | `checkboxItem`          | `<div>`, one per value                                 |
 * | `checkboxItemIndicator` | `<span>` inside a checkbox item, shown while checked   |
 * | `radioGroup`            | `<div>` around radio items, with the checked value     |
 * | `radioItem`             | `<div>` inside a radio group, one per value            |
 * | `radioItemIndicator`    | `<span>` inside a radio item, shown while checked      |
 * | `group`                 | `<div>` around items                                   |
 * | `groupLabel`            | `<div>` inside a group                                 |
 * | `separator`             | `<div>` between items                                  |
 * | `finalFocus`            | any focusable element, focused on close                |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, as in a `Menu`. A submenu is a `Menu` with `parentItem`, drawn
 * inside the popup and opened from an item with `submenu.submenuTrigger`.
 *
 * **Data attributes**
 *
 * The `Menu`'s, and on the `trigger`: `data-popup-open` and `data-pressed`
 * while the menu is open from it, each with an empty value or absent.
 *
 * **Keyboard**
 *
 * The Menu key and Shift+F10 open it from the keyboard, placed against the
 * trigger, with the first enabled item highlighted. The trigger gets
 * `tabindex="0"` so the keyboard can reach it, unless the builder sets
 * its own `tabindex`. In the popup the keys
 * are the `Menu`'s. Escape and Tab close it, and focus goes back to the
 * element that had it before the menu opened.
 *
 * **Pointer**
 *
 * A right click on the trigger opens the menu at the pointer, and the
 * browser's own menu doesn't show there, on the backdrop or over the popup.
 * A touch held still for 500ms opens it under the finger. Moving it more
 * than 10px, a second finger, or lifting it first cancels that. On macOS,
 * releasing the right button over an item picks it, unless the pointer is
 * still where the menu opened. Releasing it away from the popup more than
 * 500ms after the menu opened closes it, with `cancel-open`. After a long
 * press, a press outside is ignored for 500ms.
 *
 * **Limits**
 *
 * It has no filter and no viewport: a `Menu` with a `contextTrigger` part
 * has both. It renders a `Menu`, so a context menu and a menu under one
 * parent each take a `key`, and a `Scene` of the consumer names it `Menu`.
 *
 * **Example** (A context menu over a file row)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { ContextMenu } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const actions = [
 *   { value: "rename", label: "Rename" },
 *   { value: "delete", label: "Delete" }
 * ]
 *
 * const FileMessage = UiSchema.TaggedEnum({
 *   RequestedOpenMenu: {},
 *   RequestedCloseMenu: {},
 *   PickedAction: { value: Schema.String }
 * })
 *
 * const File = Html.component({
 *   name: "File",
 *   model: Schema.Struct({ open: Schema.Boolean }),
 *   message: FileMessage
 * }).make({
 *   init: () => ({ open: false }),
 *   update: {
 *     RequestedOpenMenu: ($) => $.evolve({ open: true }),
 *     RequestedCloseMenu: ($) => $.evolve({ open: false }),
 *     PickedAction: ($) => $.model
 *   },
 *   view: (h, model) =>
 *     ContextMenu(h, {
 *       props: { open: model.open, items: actions },
 *       onEmit: {
 *         RequestedOpen: () => FileMessage.RequestedOpenMenu(),
 *         RequestedClose: () => FileMessage.RequestedCloseMenu(),
 *         Picked: ({ value }) => FileMessage.PickedAction({ value }),
 *         Highlighted: () => undefined,
 *         Settled: () => undefined
 *       },
 *       view: (contextMenu) =>
 *         h.div(
 *           contextMenu.trigger(h.div.class("row")).children("report.pdf"),
 *           contextMenu.positioner(h.div).children(
 *             contextMenu.popup(h.div).children(
 *               actions.map(({ label, value }) => contextMenu.item({ element: h.div, value }).children(label))
 *             )
 *           )
 *         )
 *     })
 * })
 *
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(File, {}))
 * if (!/<div class="row"[^>]*>report\.pdf</.test(html)) throw new Error("the trigger isn't the consumer's row")
 * if (!/role="menuitem"[^>]*>Rename</.test(html)) throw new Error("the items aren't menu items")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Component from "@effect/ui/Component"
import type * as View from "@effect/ui/View"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Struct from "effect/Struct"
import { Menu, type MenuEvents, MenuProps } from "./Menu.ts"

/**
 * Controls whether the context menu is open, its items and its placement:
 * a `Menu`'s props without the ones for a button, hovering, submenus and
 * filtering.
 *
 * **Details**
 *
 * - `open`, `items`, `disabled`, `loopFocus`, `orientation`,
 *   `highlightItemOnHover`, `id`, `finalFocus` and `holdExit`: as for a
 *   `Menu`. `disabled` also lets the browser's own menu show.
 * - the `Positioning.PositionerFields`. `side` is `"bottom"` and `align`
 *   `"start"` when left out. Opened at the pointer with `side` left out and
 *   `align` not `"center"`, `sideOffset` is -5 and `alignOffset` 2, so the
 *   popup's corner sits under the pointer. `arrowPadding` is 0
 *   and `positionMethod` `"fixed"` when left out. The popup slides along
 *   the pointer's side to stay inside the boundary, unless
 *   `collisionAvoidance.side` is `"flip"`. With `topLayer: false`, the menu
 *   is drawn in place, as for a `Menu`, and `positionMethod` is
 *   `"absolute"` when left out, so the menu stays inside the area's
 *   clipping ancestors.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ContextMenuProps = MenuProps.mapFields(
  Struct.omit([
    "modal",
    "openOnHover",
    "delay",
    "closeDelay",
    "closeParentOnEsc",
    "parentItem",
    "triggerId",
    "openMethod",
    "openReason",
    "query",
    "filter",
    "locale",
    "autoHighlight"
  ])
)

/**
 * The props of a `ContextMenu`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ContextMenuProps = typeof ContextMenuProps.Type

/**
 * What a `ContextMenu` emits: a `Menu`'s events without `RequestedQuery`, since
 * it has no filter. `RequestedOpen` carries the `id` the consumer gave the
 * trigger as `triggerId`, or `null`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ContextMenuEvents = Exclude<
  MenuEvents,
  { readonly _tag: "RequestedQuery" }
>

type MenuParts = Component.Headless.Parts<typeof Menu>

/**
 * What a `ContextMenu`'s `view` gets: a `Menu`'s parts and plain values,
 * with its `contextTrigger` as `trigger` and without the parts for a
 * button, a submenu trigger, a viewport and a filter.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ContextMenuParts =
  & Omit<
    MenuParts,
    | "trigger"
    | "contextTrigger"
    | "submenuTrigger"
    | "viewport"
    | "list"
    | "input"
    | "clear"
    | "empty"
    | "nested"
    | "nothingMatches"
    | "transitioning"
    | "activationDirection"
  >
  & { readonly trigger: MenuParts["contextTrigger"] }

const omittedParts = [
  "trigger",
  "contextTrigger",
  "submenuTrigger",
  "viewport",
  "list",
  "input",
  "clear",
  "empty",
  "nested",
  "nothingMatches",
  "transitioning",
  "activationDirection"
] as const satisfies ReadonlyArray<
  Exclude<keyof MenuParts, keyof ContextMenuParts> | "trigger"
>

const handlers = <Msg>(
  onEmit: View.Child.Options<ContextMenuProps, ContextMenuEvents, Msg>["onEmit"]
): View.Child.Options<MenuProps, MenuEvents, Msg>["onEmit"] =>
  onEmit === undefined
    ? undefined
    : typeof onEmit === "function"
    ? (event) => event._tag === "RequestedQuery" ? undefined : onEmit(event)
    : { ...onEmit, RequestedQuery: () => undefined }

/**
 * A headless context menu. Call it as a `Menu`, with the consumer's `h`, a
 * `key` when it needs one, `props`, `onEmit` and a `view` closure that
 * draws the area with `contextMenu.trigger` and the menu with
 * `contextMenu.positioner` and the parts inside it.
 *
 * **Details**
 *
 * It renders a `Menu` whose `contextTrigger` part is the `trigger`. Every
 * open is `trigger-press`, and `RequestedClose` carries `item-press`,
 * `outside-press`, `escape-key`, `focus-out` or `cancel-open`.
 *
 * Several triggers can open one context menu, such as one per row of a
 * list: give each an `id`, and `RequestedOpen` reports which one as
 * `triggerId`. A right click on another trigger while it's open opens it
 * there. A context menu drawn inside another one's trigger takes the right
 * clicks on its own trigger.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const ContextMenu = <Msg, RV = never, RF = never>(
  h: View.Helper<Msg, unknown>,
  options:
    & View.Child.Options<ContextMenuProps, ContextMenuEvents, NoInfer<Msg>>
    & {
      /** Shown if the context menu fails, until its key changes. Without it, it is blank. */
      readonly fallback?:
        | ((
          result: AsyncResult.Failure<never, unknown>
        ) => View.Content<NoInfer<Msg>, RF>)
        | undefined
      /** The context menu's whole view, from its parts. */
      readonly view: (parts: ContextMenuParts) => View.Content<NoInfer<Msg>, RV>
    }
): ReturnType<typeof Menu<Msg, RV, RF>> =>
  Menu<Msg, RV, RF>(h, {
    ...options,
    onEmit: handlers(options.onEmit),
    view: (menu) =>
      options.view({
        ...Struct.omit(menu, omittedParts),
        trigger: menu.contextTrigger
      })
  })
