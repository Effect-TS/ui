/**
 * A button that opens a list of actions, links, checkbox and radio items,
 * and submenus.
 *
 * `Menu` is headless: it owns the keyboard and pointer behaviour, focus,
 * placement and the data attributes, and the consumer draws the markup.
 * The consumer owns whether the popup is open, passes it as `open`, and
 * stores what `RequestedOpen` and `RequestedClose` ask for. `Picked` reports
 * the item the user chose. `items` lists every item with its label, in the
 * order they're drawn, for navigation, typeahead and filtering.
 *
 * **Anatomy**
 *
 * | Part                    | Element                                                 |
 * | :---------------------- | :------------------------------------------------------ |
 * | `trigger`               | `<button>` that opens the popup, one or several         |
 * | `contextTrigger`        | `<div>` that opens it at the pointer on a right click   |
 * | `submenuTrigger`        | `<div>` of the parent menu's item that opens a submenu  |
 * | `backdrop`              | `<div>`, a manual popover under the positioner          |
 * | `positioner`            | `<div>`, a manual popover placed by the menu            |
 * | `popup`                 | `<div>` inside the positioner                           |
 * | `viewport`              | `<div>` inside the popup, around content that changes   |
 * | `list`                  | `<div>` inside the popup, around the items of a filter  |
 * | `arrow`                 | `<div>` inside the popup                                |
 * | `item`                  | `<div>`, one per value                                  |
 * | `linkItem`              | `<a>`, one per value                                    |
 * | `checkboxItem`          | `<div>`, one per value                                  |
 * | `checkboxItemIndicator` | `<span>` inside a checkbox item, shown while checked    |
 * | `radioGroup`            | `<div>` around radio items, with the checked value      |
 * | `radioItem`             | `<div>` inside a radio group, one per value             |
 * | `radioItemIndicator`    | `<span>` inside a radio item, shown while checked       |
 * | `group`                 | `<div>` around items                                    |
 * | `groupLabel`            | `<div>` inside a group                                  |
 * | `separator`             | `<div>` between items                                   |
 * | `input`                 | `<input>` inside the popup that filters the items       |
 * | `clear`                 | `<button>` that empties the input                       |
 * | `empty`                 | `<div>` shown while the filter matches nothing          |
 * | `finalFocus`            | any focusable element, focused on close                 |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, and the consumer adds the children. `trigger` takes optional
 * `MenuTriggerOptions`. The items take their value,
 * `checkboxItem` whether it's checked, and `group` and `groupLabel` the
 * group's key. `item` closes the menu when picked and the others don't;
 * a last `closeOnClick` argument changes that. The indicators, `clear`
 * and `empty` return `undefined` while they're hidden, and `keepMounted`
 * keeps an indicator drawn. Every item value has to be in `items`, and an
 * item keys its element with the value.
 *
 * A submenu is another `Menu` drawn inside the parent's popup, with the
 * parent's item value as `parentItem`. Apply both parts to the item that
 * opens it, `menu.item(submenu.submenuTrigger(h.div), value)`, and own its
 * `open` like the root's. Picking an item in a submenu closes every menu
 * above it.
 *
 * The positioner is a manual popover, so it renders in the top layer and
 * needs no portal. The browser gives a popover a border, padding, a
 * background and `overflow: auto`, so reset those on the positioner and
 * the backdrop and style the popup instead.
 *
 * **CSS variables**
 *
 * Set on the positioner, so the popup inherits them: `--anchor-width`,
 * `--anchor-height`, `--available-width`, `--available-height` and
 * `--transform-origin`. With a viewport, the positioner also gets
 * `--positioner-width` and `--positioner-height`, the popup's size.
 *
 * When the viewport moves to another trigger, the popup's `--popup-width`
 * and `--popup-height` go from its old size to its new one and back to
 * `auto` once its transitions finish. Size the popup with them and
 * transition `width` and `height` to animate it. The outgoing content
 * sits in a `data-previous` element with the old size as `--popup-width`
 * and `--popup-height`, next to the `data-current` one.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent, except `data-side`,
 * `data-align`, `data-instant`, `data-activation-direction` and
 * `data-orientation`, which hold a value:
 *
 * - `trigger`, `submenuTrigger`: `data-popup-open`, `data-pressed`,
 *   `data-disabled`
 * - `contextTrigger`: `data-popup-open`, `data-pressed`
 * - `backdrop`: `data-open` / `data-closed`, `data-starting-style`,
 *   `data-ending-style`
 * - `positioner`: as the backdrop, and `data-side`, `data-align`,
 *   `data-anchor-hidden`, `data-instant`
 * - `popup`: as the positioner, without `data-anchor-hidden`, and
 *   `data-nested`
 * - `arrow`: `data-side`, `data-align`, `data-uncentered`
 * - `viewport`: `data-activation-direction`, such as `"right down"`,
 *   `data-transitioning`, `data-instant`
 * - the items: `data-highlighted`, `data-disabled`; checkbox and radio
 *   items and their indicators add `data-checked` / `data-unchecked`
 * - `input`: `data-highlighted` while it has focus and no item does
 * - `separator`: `data-orientation`
 *
 * `data-instant` is `"click"` when the menu opened or closed from the
 * keyboard, `"dismiss"` after Escape, and `"trigger-change"` once the
 * popup has moved to another trigger: turn the transitions off then.
 *
 * **Keyboard**
 *
 * On the trigger, Enter and Space open the popup, and ArrowDown and
 * ArrowUp open it on the first or the last enabled item. In the popup the
 * arrow keys of its `orientation`, Home and End move between items,
 * disabled ones included, and typing moves to the next item whose label
 * starts with what's typed. Enter and Space pick the highlighted item.
 * On a submenu trigger, the arrow key towards the submenu, Enter and
 * Space open it, and in the submenu the arrow key back closes it. Escape
 * closes the popup, or with `closeParentOnEsc` the whole menu, and Tab
 * closes it and moves focus on from the trigger.
 *
 * With a filter, focus stays in the input and the highlighted item is its
 * `aria-activedescendant`. The arrow keys move the highlight, Enter picks
 * the item, and Space picks it while the input is empty. Home and End
 * move the caret once there's text.
 *
 * **Pointer**
 *
 * A mouse press opens the popup, and a release over an item more than
 * 200ms later picks it. With `openOnHover`, which a submenu has by
 * default, resting on the trigger for `delay` opens it, and the popup
 * closes `closeDelay` after the pointer leaves both, unless it's crossing
 * to the popup. On the way to a submenu, the parent's items don't react.
 * Hovering another trigger of an open menu moves the popup to it at once.
 * A trigger's own options override the menu's. A press within 500ms of a
 * hover open keeps it open. A `modal` menu, the default for a
 * root menu not opened by hovering, locks the page's scroll and blocks
 * presses outside, except on the trigger.
 *
 * A right click on a `contextTrigger` opens the popup at the pointer, and a
 * touch held still on it for 500ms opens it under the finger, as a
 * `ContextMenu` does. A menu opened that way is modal, blocks the whole
 * page, closes on Tab and gives focus back to the element that had it, and
 * a menu opened from its `trigger` behaves as above. The Menu key and
 * Shift+F10 open it against the `contextTrigger`.
 *
 * **Limits**
 *
 * The menu doesn't read its items from the rendered elements, so `items`
 * lists them. A trigger carries no payload: `RequestedOpen` reports its
 * `triggerId`, so draw the content for that trigger. `filter` picks a
 * built-in match; for another, pass `filter: null` and draw only the
 * items that match. `MenuTrigger` draws a trigger outside the view. The
 * writing direction is read from the trigger's computed `direction`.
 *
 * **Example** (An edit menu with a checkbox item and a submenu, with the open states in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Menu } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const actions = [
 *   { value: "copy", label: "Copy" },
 *   { value: "wrap", label: "Wrap lines" },
 *   { value: "share", label: "Share" }
 * ]
 * const targets = [{ value: "email", label: "Email" }]
 *
 * const EditorMessage = UiSchema.TaggedEnum({
 *   RequestedOpenMenu: {},
 *   RequestedCloseMenu: {},
 *   RequestedOpenShare: {},
 *   RequestedCloseShare: {},
 *   PickedAction: { value: Schema.String, checked: Schema.optional(Schema.Boolean) }
 * })
 *
 * const Editor = Component.define({
 *   name: "Editor",
 *   scoped: false,
 *   model: Schema.Struct({ open: Schema.Boolean, share: Schema.Boolean, wrap: Schema.Boolean }),
 *   message: EditorMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ open: false, share: false, wrap: true }),
 *   update: {
 *     RequestedOpenMenu: (model) => ({ ...model, open: true }),
 *     RequestedCloseMenu: (model) => ({ ...model, open: false }),
 *     RequestedOpenShare: (model) => ({ ...model, share: true }),
 *     RequestedCloseShare: (model) => ({ ...model, share: false }),
 *     PickedAction: (model, { checked, value }) => value === "wrap" ? { ...model, wrap: checked === true } : model
 *   },
 *   view: (model, h) => {
 *     const events = {
 *       Picked: ({ checked, value }: { readonly value: string; readonly checked?: boolean | undefined }) =>
 *         EditorMessage.PickedAction({ value, checked }),
 *       Highlighted: () => undefined,
 *       RequestedQuery: () => undefined,
 *       Settled: () => undefined
 *     }
 *     return Menu(h, {
 *       props: { open: model.open, items: actions },
 *       onEmit: {
 *         ...events,
 *         RequestedOpen: () => EditorMessage.RequestedOpenMenu(),
 *         RequestedClose: () => EditorMessage.RequestedCloseMenu()
 *       },
 *       view: (menu) =>
 *         h.div(
 *           menu.trigger(h.button).children("Edit"),
 *           menu.positioner(h.div).children(
 *             menu.popup(h.div).children(
 *               menu.item(h.div, "copy").children("Copy"),
 *               menu.checkboxItem(h.div, "wrap", model.wrap).children(
 *                 menu.checkboxItemIndicator(h.span, "wrap")?.children("✓"),
 *                 "Wrap lines"
 *               ),
 *               menu.separator(h.div),
 *               Menu(h, {
 *                 props: { open: model.share, items: targets, parentItem: "share" },
 *                 onEmit: {
 *                   ...events,
 *                   RequestedOpen: () => EditorMessage.RequestedOpenShare(),
 *                   RequestedClose: () => EditorMessage.RequestedCloseShare()
 *                 },
 *                 view: (share) =>
 *                   h.div(
 *                     menu.item(share.submenuTrigger(h.div), "share").children("Share"),
 *                     share.positioner(h.div).children(
 *                       share.popup(h.div).children(share.item(h.div, "email").children("Email"))
 *                     )
 *                   )
 *               })
 *             )
 *           )
 *         )
 *     })
 *   }
 * })
 *
 * // The trigger says it opens a menu, and the checked item is drawn closed.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Editor, {}))
 * if (!/<button[^>]* aria-haspopup="menu"[^>]*>Edit</.test(html)) throw new Error("the trigger isn't a menu button")
 * if (!/role="menuitemcheckbox"[^>]* aria-checked="true"/.test(html)) throw new Error("the checkbox item isn't checked")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import {
  type Attributed,
  attrSelector,
  flag,
  idOf,
  ownStyle,
  separatorAttrs,
  withStyle
} from "./internal/attributes.ts"
import { backdropBox, blockers, cutPath } from "./internal/blocker.ts"
import { focusFinal, override } from "./internal/dom.ts"
import { type TextFilter, textFilter } from "./internal/filter.ts"
import { methodOf } from "./internal/interaction.ts"
import { arrowKeys, available, keyed, type Orientation, stepped } from "./internal/list.ts"
import { holdScroll } from "./internal/modal.ts"
import { listenOutside, releasedOutside } from "./internal/outside.ts"
import { isMac } from "./internal/platform.ts"
import { activationDirection, inSafeArea, type Point } from "./internal/safeArea.ts"
import { raiseAbove } from "./internal/topLayer.ts"
import { frameOf, settling, statusOf, transitionAttrs } from "./internal/transition.ts"
import { printable, typeahead } from "./internal/typeahead.ts"
import * as Positioning from "./Positioning.ts"

/**
 * One item of a `Menu`: the value it reports, the text typeahead and
 * filtering match, and whether it can be picked.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenuItem = Schema.Struct({
  value: Schema.String,
  label: Schema.String,
  disabled: Schema.optional(Schema.Boolean)
})

/**
 * One item of a `Menu`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuItem = typeof MenuItem.Type

/**
 * How the menu was opened or closed: `"keyboard"` for a key or a click
 * from no pointer.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenuInteraction = Schema.Literals(["mouse", "touch", "pen", "keyboard"])

/**
 * How the menu was opened or closed.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuInteraction = typeof MenuInteraction.Type

/**
 * Why a `Menu` asks to open or close.
 *
 * **Details**
 *
 * - `"trigger-press"`: a press, or Enter or Space, on the trigger, or a
 *   right click or a long press on a context trigger
 * - `"trigger-hover"`: the pointer rested on a trigger with `openOnHover`,
 *   or left a menu that hovering opened
 * - `"list-navigation"`: ArrowDown or ArrowUp on the trigger, the arrow
 *   key that opens a submenu, or the one that closes it
 * - `"item-press"`: an item was picked
 * - `"outside-press"`: a press outside the trigger and the popup, other
 *   than on a scrollbar
 * - `"escape-key"`: Escape in the popup
 * - `"focus-out"`: focus left the trigger and the popup, or Tab in the
 *   popup
 * - `"sibling-open"`: another item of the parent menu was highlighted while
 *   this submenu was open
 * - `"cancel-open"`: the press that opened it was released away from the
 *   trigger and the popup, or, for a right click, away from the popup more
 *   than 500ms later
 * - `"none"`: anything else
 *
 * A submenu that closes because its parent closed reports the parent's
 * reason.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenuChangeReason = Schema.Literals([
  "trigger-press",
  "trigger-hover",
  "list-navigation",
  "item-press",
  "outside-press",
  "escape-key",
  "focus-out",
  "sibling-open",
  "cancel-open",
  "none"
])

/**
 * Why a `Menu` asks to open or close.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuChangeReason = typeof MenuChangeReason.Type

/**
 * Why the highlighted item changed: `"keyboard"` for arrow keys, Home, End
 * and typeahead, `"pointer"` for hovering, and `"none"` for opening,
 * closing and filtering.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenuHighlightReason = Schema.Literals(["keyboard", "pointer", "none"])

/**
 * Why the highlighted item changed.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuHighlightReason = typeof MenuHighlightReason.Type

/**
 * Why the filter's query changes: `"input-change"` for typing,
 * `"input-clear"` for emptying the input, `"clear-press"` for the `clear`
 * part, and `"none"` for the menu having closed.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenuQueryReason = Schema.Literals(["input-change", "input-clear", "clear-press", "none"])

/**
 * Why the filter's query changes.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuQueryReason = typeof MenuQueryReason.Type

/**
 * How a filtering menu matches an item's label against the query:
 * anywhere in it, at its start, or at its end. Each ignores case, accents
 * and punctuation.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenuFilterMode = Schema.Literals(["contains", "startsWith", "endsWith"])

/**
 * How a filtering menu matches an item's label against the query.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuFilterMode = typeof MenuFilterMode.Type

const Orientation = Schema.Literals(["vertical", "horizontal"])

/**
 * The props of a `Menu`.
 *
 * **Details**
 *
 * - `open`: whether the popup shows. The menu only asks, with `RequestedOpen`
 *   and `RequestedClose`.
 * - `items`: every item, link, checkbox, radio and submenu trigger, in the
 *   order they're drawn. Navigation, typeahead and filtering read them.
 * - `disabled`: the trigger and the items ignore the user.
 * - `modal`: while open, the page doesn't scroll and a press outside only
 *   closes the menu. True when left out. A submenu and a menu opened by
 *   hovering are never modal.
 * - `loopFocus`: the arrow keys wrap from the last item to the first. True
 *   when left out.
 * - `orientation`: `"vertical"`, the default, moves with ArrowDown and
 *   ArrowUp, and `"horizontal"` with ArrowRight and ArrowLeft.
 * - `highlightItemOnHover`: the pointer highlights the item it's over. True
 *   when left out.
 * - `closeParentOnEsc`: in a submenu, Escape closes the whole menu and not
 *   only the submenu. False when left out.
 * - `openOnHover`: the pointer resting on the trigger for `delay`
 *   milliseconds opens the menu, and leaving the trigger and the popup
 *   closes it after `closeDelay`. False when left out, true in a submenu.
 * - `delay`, `closeDelay`: 100 and 0 when left out. A trigger's
 *   `MenuTriggerOptions` override these three for that trigger.
 * - `parentItem`: in a submenu, the value of the parent's item that opens
 *   it. A `Menu` with one, drawn inside another one's popup, is its
 *   submenu. Without one, a `Menu` drawn inside another is a menu of its
 *   own.
 * - `triggerId`: the `id` of the trigger the menu is open for, when it has
 *   several, or one drawn with `MenuTrigger`.
 * - `openMethod`, `openReason`: how a `MenuTrigger` opened it, which the
 *   menu can't see. A menu opened with `"trigger-hover"` closes when the
 *   pointer leaves.
 * - `id`: the popup's `id`, which a `MenuTrigger` points at. Generated
 *   when left out.
 * - `finalFocus`: on close, focus goes back to the trigger, or to a
 *   `finalFocus` part. False leaves it where it is. True when left out.
 * - `holdExit`: keeps the closing popup shown, for an exit animation the
 *   consumer ends by clearing it.
 * - `query`: the filter's text. Given, the menu filters its items by it,
 *   and focus stays in the `input` part. The menu only asks, with
 *   `RequestedQuery`.
 * - `filter`: how items match, `"contains"` when left out. `null` hides
 *   none: list and draw only the items that match.
 * - `locale`: the locale the filter compares text in.
 * - `autoHighlight`: filtering highlights the first matching item. True
 *   highlights it while the query isn't empty, `"always"` also when it is.
 *   False when left out.
 * - the `Positioning.PositionerFields`. `side` is `"bottom"` when left out,
 *   and `"inline-end"` with `align` `"start"` in a submenu.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenuProps = Schema.Struct({
  open: Schema.Boolean,
  items: Schema.Array(MenuItem),
  disabled: Schema.optional(Schema.Boolean),
  modal: Schema.optional(Schema.Boolean),
  loopFocus: Schema.optional(Schema.Boolean),
  orientation: Schema.optional(Orientation),
  highlightItemOnHover: Schema.optional(Schema.Boolean),
  closeParentOnEsc: Schema.optional(Schema.Boolean),
  openOnHover: Schema.optional(Schema.Boolean),
  delay: Schema.optional(Schema.Number),
  closeDelay: Schema.optional(Schema.Number),
  parentItem: Schema.optional(Schema.String),
  triggerId: Schema.optional(Schema.NullOr(Schema.String)),
  openMethod: Schema.optional(MenuInteraction),
  openReason: Schema.optional(MenuChangeReason),
  id: Schema.optional(Schema.String),
  finalFocus: Schema.optional(Schema.Boolean),
  holdExit: Schema.optional(Schema.Boolean),
  query: Schema.optional(Schema.String),
  filter: Schema.optional(Schema.NullOr(MenuFilterMode)),
  locale: Schema.optional(Schema.String),
  autoHighlight: Schema.optional(Schema.Union([Schema.Boolean, Schema.Literal("always")])),
  ...Positioning.PositionerFields
})

/**
 * The props of a `Menu`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuProps = typeof MenuProps.Type

/**
 * What a `Menu` emits.
 *
 * **Details**
 *
 * - `RequestedOpen`: asks for `open` to be true. `triggerId` is the `id` of the
 *   trigger pressed, for `triggerId`. A right click on a context trigger of an
 *   open menu sends it again, for the new point.
 * - `RequestedClose`: asks for `open` to be false.
 * - `Picked`: reports that an item was picked. `checked` is the new state of a
 *   checkbox item, and true for a radio item. It stands for the item's
 *   click, for every kind of item.
 * - `Highlighted`: reports that the highlighted item changed, to `value` or to
 *   none.
 * - `RequestedQuery`: asks for `query` to be `query`. The menu also
 *   emits it, with `reason: "none"`, to clear the query after the popup
 *   closes.
 * - `Settled`: reports that the popup's transitions ended, after it
 *   opened or closed.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const MenuEvents = UiSchema.TaggedEnum({
  RequestedOpen: { reason: MenuChangeReason, triggerId: Schema.NullOr(Schema.String) },
  RequestedClose: { reason: MenuChangeReason },
  Picked: { value: Schema.String, checked: Schema.optional(Schema.Boolean) },
  Highlighted: { value: Schema.NullOr(Schema.String), reason: MenuHighlightReason },
  RequestedQuery: { query: Schema.String, reason: MenuQueryReason },
  Settled: { open: Schema.Boolean }
})

/**
 * What a `Menu` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuEvents = typeof MenuEvents.Type

/**
 * Where a menu's popup is in its transitions: `"starting"` for the first
 * frame after it opens, `"ending"` while it closes, `null` otherwise.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuTransitionStatus = "starting" | "ending" | null

const Instant = Schema.Literals(["click", "dismiss", "trigger-change"])

/**
 * Why the popup's animations are instant: `"click"` for a menu opened or
 * closed from the keyboard, `"dismiss"` for Escape, and `"trigger-change"`
 * once the popup has moved to another trigger.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuInstant = typeof Instant.Type

const ItemKind = Schema.Literals(["item", "link", "checkbox", "radio"])

const ItemAction = Schema.Struct({
  value: Schema.String,
  kind: ItemKind,
  closeOnClick: Schema.Boolean,
  checked: Schema.Boolean
})

type ItemAction = typeof ItemAction.Type

const ParentState = Schema.Struct({
  open: Schema.Boolean,
  active: Schema.NullOr(Schema.String),
  reason: Schema.NullOr(MenuChangeReason),
  rtl: Schema.Boolean,
  orientation: Orientation,
  disabled: Schema.Boolean
})

type ParentState = typeof ParentState.Type

const Submenu = Schema.Struct({ item: Schema.String, open: Schema.Boolean })

type Submenu = typeof Submenu.Type

const MenuMessage = UiSchema.TaggedEnum({
  PressedTrigger: { key: Schema.String, triggerId: Schema.NullOr(Schema.String), pointerType: Schema.String },
  ReleasedTrigger: {},
  PressedContextTrigger: {
    key: Schema.String,
    triggerId: Schema.NullOr(Schema.String),
    x: Schema.Number,
    y: Schema.Number,
    pointerType: Schema.String
  },
  TouchedContextTrigger: {
    key: Schema.String,
    triggerId: Schema.NullOr(Schema.String),
    x: Schema.Number,
    y: Schema.Number
  },
  CancelledLongPress: {},
  CompletedWaitBeforeLongPress: {},
  CompletedWaitBeforeContextGrace: {},
  ReleasedContextPointer: { outside: Schema.Boolean },
  PressedTriggerKey: { key: Schema.String, trigger: Schema.String, triggerId: Schema.NullOr(Schema.String) },
  EnteredTrigger: {
    key: Schema.String,
    triggerId: Schema.NullOr(Schema.String),
    delay: Schema.Number,
    closeDelay: Schema.Number
  },
  LeftTrigger: {},
  CompletedWaitBeforeHoverOpen: {},
  LeftHoverArea: {},
  ReturnedToHoverArea: {},
  CompletedWaitBeforeHoverClose: {},
  CompletedWaitBeforeStickExpires: {},
  PressedSubmenuTrigger: { pointerType: Schema.String },
  ClickedSubmenuTrigger: { pointerType: Schema.String },
  PressedSubmenuTriggerKey: { key: Schema.String },
  PressedKey: { key: Schema.String, action: Schema.NullOr(ItemAction) },
  ReleasedSpace: { action: Schema.NullOr(ItemAction) },
  EnteredItem: { value: Schema.String },
  LeftItem: {},
  PressedItem: {},
  ReleasedItem: { action: ItemAction, pointerType: Schema.String },
  ClickedItem: { action: ItemAction, pointerType: Schema.String },
  CompletedWaitBeforeResetTyping: {},
  ShowedPopup: {},
  RenderedFirstFrame: {},
  FinishedTransition: { open: Schema.Boolean },
  ChangedPlacement: { placement: Positioning.Placement },
  ChangedDirection: { rtl: Schema.Boolean },
  FoundTrigger: { id: Schema.NullOr(Schema.String) },
  PressedOutside: { pointerType: Schema.String },
  FocusedOutside: {},
  TabbedOut: {},
  ReleasedPointer: { outside: Schema.Boolean },
  AllowedRelease: {},
  ChangedSubmenus: { submenus: Schema.Array(Submenu) },
  ChangedParent: { parent: ParentState },
  RequestedCloseByChild: { reason: MenuChangeReason },
  MovedViewport: { direction: Schema.String },
  SettledViewport: {},
  SettledTriggerChange: {},
  ChangedInput: { value: Schema.String },
  PressedInputKey: { key: Schema.String, modified: Schema.Boolean },
  FocusedInput: {},
  BlurredInput: {},
  PressedInput: {},
  ClickedClear: {}
})

type MenuMessage = typeof MenuMessage.Type

const MenuModel = Schema.Struct({
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  openMethod: Schema.NullOr(MenuInteraction),
  closeMethod: Schema.NullOr(MenuInteraction),
  reason: Schema.NullOr(MenuChangeReason),
  closeReason: Schema.NullOr(MenuChangeReason),
  focusLeft: Schema.Boolean,
  trigger: Schema.NullOr(Schema.String),
  hoverTrigger: Schema.NullOr(Schema.String),
  hoverTriggerId: Schema.NullOr(Schema.String),
  hoverCloseDelay: Schema.Number,
  closeDelay: Schema.Number,
  hovering: Schema.Boolean,
  stick: Schema.Boolean,
  active: Schema.NullOr(Schema.String),
  activeByKey: Schema.Boolean,
  typed: Schema.String,
  typedFrom: Schema.Number,
  matched: Schema.Number,
  spaceDown: Schema.Boolean,
  placement: Schema.NullOr(Positioning.Placement),
  pressing: Schema.Boolean,
  releaseAllowed: Schema.Boolean,
  pressedItem: Schema.Boolean,
  rtl: Schema.Boolean,
  submenus: Schema.Array(Submenu),
  instant: Schema.NullOr(Instant),
  transitioning: Schema.Boolean,
  direction: Schema.NullOr(Schema.String),
  inputFocused: Schema.Boolean,
  keyboard: Schema.Boolean,
  triggerElement: Schema.NullOr(Schema.String),
  context: Schema.Boolean,
  point: Schema.NullOr(Positioning.Rect),
  longPress: Schema.NullOr(
    Schema.Struct({ key: Schema.String, triggerId: Schema.NullOr(Schema.String), x: Schema.Number, y: Schema.Number })
  ),
  justOpened: Schema.Boolean,
  releaseArmed: Schema.Boolean
})

type MenuModel = typeof MenuModel.Type

type Base = Component.Step<MenuModel, MenuMessage, MenuEvents, never>
type MenuUpdate = Component.Update<MenuModel, MenuMessage, MenuEvents, MenuProps> & {
  readonly shared: { readonly parent?: ParentState | undefined }
  send(owner: "self", message: Extract<MenuMessage, { readonly _tag: "RequestedCloseByChild" }>): Base
}

const wait = (name: string, completed: () => MenuMessage) =>
  Command.make(
    name,
    { args: { delay: Schema.Number }, mode: "switch" },
    ({ delay }) => Effect.as(Effect.sleep(Duration.millis(delay)), completed())
  )

const WaitBeforeResetTyping = wait("WaitBeforeResetTyping", MenuMessage.CompletedWaitBeforeResetTyping)
const WaitBeforeHoverOpen = wait("WaitBeforeHoverOpen", MenuMessage.CompletedWaitBeforeHoverOpen)
const WaitBeforeHoverClose = wait("WaitBeforeHoverClose", MenuMessage.CompletedWaitBeforeHoverClose)
const WaitBeforeStickExpires = wait("WaitBeforeStickExpires", MenuMessage.CompletedWaitBeforeStickExpires)
const WaitBeforeLongPress = wait("WaitBeforeLongPress", MenuMessage.CompletedWaitBeforeLongPress)
const WaitBeforeContextGrace = wait("WaitBeforeContextGrace", MenuMessage.CompletedWaitBeforeContextGrace)

const parentOf = ({ props, shared }: {
  readonly props: MenuProps
  readonly shared: { readonly parent?: ParentState | undefined }
}): ParentState | undefined => props.parentItem === undefined ? undefined : shared.parent

const disabledOf = (input: {
  readonly props: MenuProps
  readonly shared: { readonly parent?: ParentState | undefined }
}): boolean => input.props.disabled === true || parentOf(input)?.disabled === true

const hoverOf = (props: MenuProps, nested: boolean): boolean => props.openOnHover ?? nested

const filteringOf = (props: MenuProps): boolean => props.query !== undefined

const matcherOf = (props: MenuProps): ((label: string) => boolean) | null => {
  const query = (props.query ?? "").trim()
  if (query === "" || props.filter === null) return null
  const filter: TextFilter = textFilter(props.locale)
  const match = filter[props.filter ?? "contains"]
  return (label) => match(label, query)
}

const visibleOf = (props: MenuProps, matches = matcherOf(props)): ReadonlyArray<MenuItem> =>
  matches === null ? props.items : props.items.filter((item) => matches(item.label))

const firstEnabled = (items: ReadonlyArray<MenuItem>, last = false): MenuItem | undefined => {
  const ordered = last ? [...items].reverse() : items
  return ordered.find(available) ?? ordered[0]
}

const autoHighlighted = (props: MenuProps, query: string): string | null => {
  const auto = props.autoHighlight
  if (auto === undefined || auto === false || (auto === true && query.trim() === "")) return null
  const matches = matcherOf({ ...props, query })
  return (matches === null ? props.items[0] : props.items.find((item) => matches(item.label)))?.value ?? null
}

const commit = (base: Base, before: MenuModel, after: MenuModel, reason: MenuHighlightReason) =>
  before.active === after.active
    ? base.set(after)
    : base.set(after).emit(MenuEvents.Highlighted({ value: after.active, reason }))

const open = (
  model: MenuModel,
  $: MenuUpdate,
  reason: MenuChangeReason,
  method: MenuInteraction,
  trigger: string | null,
  triggerId: string | null,
  last = false,
  context: { readonly point: Positioning.Rect | null; readonly release: boolean } | null = null
) => {
  const props = $.props
  const keyboard = method === "keyboard" && reason !== "trigger-hover"
  const active = filteringOf(props) && props.autoHighlight === "always"
    ? visibleOf(props)[0]?.value ?? null
    : keyboard
    ? firstEnabled(visibleOf(props), last)?.value ?? null
    : null
  const next: MenuModel = {
    ...model,
    openMethod: method,
    closeMethod: null,
    reason,
    focusLeft: false,
    trigger,
    hovering: reason === "trigger-hover",
    stick: reason === "trigger-hover",
    active,
    activeByKey: keyboard,
    typed: "",
    spaceDown: false,
    pressing: context === null && reason === "trigger-press" && (method === "mouse" || method === "pen"),
    releaseAllowed: false,
    pressedItem: false,
    instant: reason === "trigger-press" && method === "keyboard" ? "click" : null,
    keyboard: method === "keyboard",
    context: context !== null,
    point: context?.point ?? null,
    justOpened: context !== null,
    releaseArmed: context?.release ?? false,
    longPress: null
  }
  const opened = commit($, model, next, "none").emit(MenuEvents.RequestedOpen({ reason, triggerId }))
  return reason === "trigger-hover" ? opened.run(WaitBeforeStickExpires.make({ delay: 500 })) : opened
}

const dismiss = (
  model: MenuModel,
  $: MenuUpdate,
  reason: MenuChangeReason,
  method: MenuInteraction | null,
  focusLeft = false,
  base: Base = $
) => {
  if (!$.props.open) return base.set(model)
  const instant: MenuModel["instant"] = reason === "escape-key" || reason === "none"
    ? "dismiss"
    : method === "keyboard" && reason === "trigger-press"
    ? "click"
    : null
  return base.set({
    ...model,
    closeMethod: method,
    closeReason: reason,
    focusLeft,
    pressing: false,
    spaceDown: false,
    hovering: false,
    stick: false,
    instant
  }).emit(MenuEvents.RequestedClose({ reason }))
}

const closeTree = (
  model: MenuModel,
  $: MenuUpdate,
  reason: MenuChangeReason,
  method: MenuInteraction | null,
  first?: MenuEvents
) => {
  const base: Base = parentOf($) === undefined ? $ : $.send("self", MenuMessage.RequestedCloseByChild({ reason }))
  return dismiss(model, $, reason, method, false, first === undefined ? base : base.emit(first))
}

const isSubmenu = (model: MenuModel, value: string): boolean => model.submenus.some((submenu) => submenu.item === value)

const activate = (model: MenuModel, $: MenuUpdate, action: ItemAction, method: MenuInteraction) => {
  const props = $.props
  const item = props.items.find((candidate) => candidate.value === action.value)
  if (!props.open || !available(item) || disabledOf($) || isSubmenu(model, action.value)) {
    return $.set(model)
  }
  const next = { ...model, pressedItem: false, spaceDown: false }
  const picked = MenuEvents.Picked(
    action.kind === "checkbox"
      ? { value: action.value, checked: !action.checked }
      : action.kind === "radio"
      ? { value: action.value, checked: true }
      : { value: action.value }
  )
  if (!action.closeOnClick) return commit($, model, { ...next, active: action.value }, "none").emit(picked)
  return closeTree({ ...next, pressing: false }, $, "item-press", method, picked)
}

const navigate = (model: MenuModel, $: MenuUpdate, key: string) => {
  const props = $.props
  const items = visibleOf(props)
  if (items.length === 0) return $.set(model)
  const last = items.length - 1
  const at = model.active === null ? -1 : items.findIndex((item) => item.value === model.active)
  const direction = key === keys(props.orientation ?? "vertical", model.rtl).next ? 1 : -1
  const index = key === "Home"
    ? 0
    : key === "End"
    ? last
    : stepped(at, last, direction, props.loopFocus !== false ? "wrap" : "none")
  return commit($, model, { ...model, active: items[index]!.value, activeByKey: true }, "keyboard")
}

const typeKey = (model: MenuModel, $: MenuUpdate, key: string) => {
  const items = visibleOf($.props)
  const from = model.active === null ? -1 : items.findIndex((item) => item.value === model.active)
  const { index, next } = typeahead(model, key, items, from)
  const item = items[index]
  const moved = item === undefined ? {} : { active: item.value, activeByKey: true }
  return commit($, model, { ...model, ...next, ...moved }, "keyboard").run(WaitBeforeResetTyping.make({ delay: 500 }))
}

const keys = (orientation: Orientation, rtl: boolean) => {
  const cross = arrowKeys(orientation === "vertical" ? "horizontal" : "vertical", rtl)
  return { ...arrowKeys(orientation, rtl), open: cross.next, close: cross.previous }
}

const pressKey = (model: MenuModel, $: MenuUpdate, key: string, action: ItemAction | null) => {
  const props = $.props
  if (!props.open) return $.set(model)
  const parent = parentOf($)
  const nav = keys(props.orientation ?? "vertical", model.rtl)
  if (key === nav.next || key === nav.previous || key === "Home" || key === "End") return navigate(model, $, key)
  if (key === "Escape") {
    return props.closeParentOnEsc === true && parent !== undefined
      ? closeTree(model, $, "escape-key", "keyboard")
      : dismiss(model, $, "escape-key", "keyboard")
  }
  if (parent !== undefined && key === keys(parent.orientation, parent.rtl).close) {
    return dismiss(model, $, "list-navigation", "keyboard")
  }
  if (key === "Enter") return action === null ? $.set(model) : activate(model, $, action, "keyboard")
  if (key === " " && model.typed === "") return $.set({ ...model, spaceDown: true })
  if (key.length === 1 && !filteringOf(props)) return typeKey(model, $, key)
  return $.set(model)
}

const opensFor = (model: MenuModel, props: MenuProps, key: string | null, triggerId: string | null): boolean => {
  const active = props.triggerId ?? model.trigger
  return active === null || active === key || (triggerId !== null && active === triggerId)
}

const enterTrigger = (
  model: MenuModel,
  $: MenuUpdate,
  message: Extract<MenuMessage, { readonly _tag: "EnteredTrigger" }>
) => {
  const props = $.props
  const next = {
    ...model,
    hovering: true,
    hoverTrigger: message.key,
    hoverTriggerId: message.triggerId,
    hoverCloseDelay: message.closeDelay
  }
  if (disabledOf($)) return $.set(next)
  if (!props.open) return $.set(next).run(WaitBeforeHoverOpen.make({ delay: message.delay }))
  const stay = Command.interrupt(WaitBeforeHoverClose)
  return opensFor(model, props, message.key, message.triggerId) ? $.set(next).run(stay) : hoverOpen(next, $).run(stay)
}

const hoverOpen = (model: MenuModel, $: MenuUpdate) =>
  open(
    { ...model, closeDelay: model.hoverCloseDelay },
    $,
    "trigger-hover",
    "mouse",
    model.hoverTrigger,
    model.hoverTriggerId
  )

const pressTrigger = (
  model: MenuModel,
  $: MenuUpdate,
  method: MenuInteraction,
  key: string,
  triggerId: string | null
) => {
  const props = $.props
  if (disabledOf($)) return $.set(model)
  if (props.open && opensFor(model, props, key, triggerId)) {
    if (model.stick && model.reason === "trigger-hover") {
      return $.set({ ...model, reason: "trigger-press", stick: false, hovering: false })
        .run(Command.interrupt(WaitBeforeHoverClose))
    }
    return dismiss(model, $, "trigger-press", method)
  }
  return open(model, $, "trigger-press", method, key, triggerId)
}

const LongPressDelay = 500

const openAt = (
  model: MenuModel,
  $: MenuUpdate,
  key: string,
  triggerId: string | null,
  point: Positioning.Rect | null,
  method: MenuInteraction,
  release: boolean
) => {
  if (disabledOf($)) return $.set(model)
  return open(model, $, "trigger-press", method, key, triggerId, false, { point, release })
    .run(WaitBeforeContextGrace.make({ delay: LongPressDelay }))
}

const contextPoint = (x: number, y: number, pointerType: string): Positioning.Rect | null =>
  pointerType === "" || (x === 0 && y === 0) ? null : { x, y, width: 0, height: 0 }

const contextPlacement = (props: MenuProps, point: Positioning.Rect | null): MenuProps => {
  const align = props.align ?? "start"
  const offset = point !== null && props.side === undefined && align !== "center"
  return {
    ...props,
    align,
    sideOffset: props.sideOffset ?? (offset ? -5 : undefined),
    alignOffset: props.alignOffset ?? (offset ? 2 : undefined),
    arrowPadding: props.arrowPadding ?? 0,
    positionMethod: props.positionMethod ?? "fixed"
  }
}

const shares = (model: MenuModel, props: MenuProps): ParentState => ({
  open: props.open,
  active: model.active,
  reason: model.closeReason,
  rtl: model.rtl,
  orientation: props.orientation ?? "vertical",
  disabled: props.disabled === true
})

const TrackMenuArgs = {
  position: Positioning.TrackPositionArgs,
  open: Schema.Boolean,
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  holdExit: Schema.Boolean,
  lock: Schema.Boolean,
  touch: Schema.Boolean,
  nested: Schema.Boolean,
  initialFocus: Schema.Boolean,
  active: Schema.NullOr(Schema.String),
  scroll: Schema.Boolean,
  pressing: Schema.Boolean,
  finalFocus: Schema.Boolean,
  focusLeft: Schema.Boolean,
  closeMethod: Schema.NullOr(MenuInteraction),
  hoverClose: Schema.Boolean,
  rtl: Schema.Boolean,
  trigger: Schema.NullOr(Schema.String),
  popupId: Schema.String,
  inputId: Schema.NullOr(Schema.String),
  orientation: Orientation,
  parentOrientation: Orientation,
  side: Schema.String,
  context: Schema.Boolean,
  release: Schema.Boolean
}

type TrackMenuArgs = Schema.Struct<typeof TrackMenuArgs>["Type"]

const anyTrigger = (popupId: string) => attrSelector("data-menu-trigger", popupId)

const triggerSelector = (popupId: string) => anyTrigger(popupId) + "[data-menu-active]"

const contextSelector = (popupId: string) => attrSelector("data-menu-context", popupId) + "[data-menu-active]"

const selectorsOf = (popupId: string) => ({
  any: anyTrigger(popupId),
  active: triggerSelector(popupId) + "," + contextSelector(popupId),
  enabled: anyTrigger(popupId) + ":not([disabled])"
})

const boxOf = (element: Element) => element.getBoundingClientRect()

interface Size {
  readonly width: number
  readonly height: number
}

const setSize = (element: HTMLElement, prefix: string, size: Size | "auto" | "max-content") => {
  element.style.setProperty(prefix + "-width", typeof size === "string" ? size : size.width + "px")
  element.style.setProperty(prefix + "-height", typeof size === "string" ? size : size.height + "px")
}

const watch = (node: HTMLElement, args: TrackMenuArgs, changes: Stream.Stream<TrackMenuArgs>) =>
  Stream.callback<MenuMessage>((queue) => {
    const document = node.ownerDocument
    const view = document.defaultView
    const frame = frameOf(view)
    let current = args
    let selectors = selectorsOf(args.popupId)
    const send = (message: MenuMessage) => Queue.offerUnsafe(queue, message)
    const trigger = (): HTMLElement | null => document.querySelector<HTMLElement>(selectors.active)
    const popup = (): HTMLElement => document.getElementById(current.popupId) ?? node
    const input = (): HTMLInputElement | null =>
      current.inputId === null ? null : document.getElementById(current.inputId) as HTMLInputElement | null
    const inside = (target: Node): boolean =>
      (node.contains(target) && !blocker.is(target)) ||
      (target instanceof Element && target.closest(selectors.any) !== null)

    let cutUndo: (() => void) | undefined
    const cut = (anchor: HTMLElement | null) => {
      cutUndo?.()
      cutUndo = undefined
      const layer = Array.from(node.children).find(blocker.is) as HTMLElement | undefined
      if (layer === undefined || anchor === null || current.context) return
      cutUndo = override(layer, { "clip-path": cutPath([boxOf(anchor)]) })
    }

    const focusActive = (scroll: boolean) => {
      if (!current.open) return
      const item = current.active === null ? null : document.getElementById(current.active)
      const field = input()
      if (field !== null) {
        if (document.activeElement !== field) field.focus({ preventScroll: true })
        if (item !== null) item.scrollIntoView?.({ block: "nearest" })
        return
      }
      if (item === null) {
        if (current.initialFocus && document.activeElement !== popup() && node.contains(document.activeElement)) {
          popup().focus({ preventScroll: true })
        }
        return
      }
      if (document.activeElement !== item) item.focus({ preventScroll: true })
      if (scroll) item.scrollIntoView?.({ block: "nearest" })
    }

    let release: (() => void) | undefined
    const hold = () => {
      release?.()
      release = current.open && current.lock ? holdScroll(node, current.touch) : undefined
    }

    let rtl = args.rtl
    const direction = (anchor: HTMLElement | null) => {
      const next = view?.getComputedStyle(anchor ?? node).direction === "rtl"
      if (next !== rtl) {
        rtl = next
        send(MenuMessage.ChangedDirection({ rtl }))
      }
    }

    let triggerElement: string | null = null
    const found = (anchor: HTMLElement | null) => {
      const id = anchor?.id || null
      if (id !== triggerElement) {
        triggerElement = id
        send(MenuMessage.FoundTrigger({ id }))
      }
    }

    let before: HTMLElement | null = null
    const returnTo = () => current.context ? before : trigger()
    let timer: ReturnType<typeof setTimeout> | undefined
    const opening = () => {
      const focused = document.activeElement
      before = current.context && focused instanceof HTMLElement && !node.contains(focused) ? focused : null
      send(MenuMessage.ShowedPopup())
      node.inert = false
      clearTimeout(timer)
      if (current.pressing) timer = setTimeout(() => send(MenuMessage.AllowedRelease()), 200)
      const anchor = trigger()
      direction(anchor)
      found(anchor)
      cut(anchor)
      fit()
      const field = input()
      if (field !== null) field.focus({ preventScroll: true })
      else if (current.active !== null) focusActive(false)
      else if (current.initialFocus) popup().focus({ preventScroll: true })
      if (!current.started) frame(() => frame(() => send(MenuMessage.RenderedFirstFrame())))
    }

    const closing = () => {
      clearTimeout(timer)
      leftAt = null
      unblockParent()
      const focused = document.activeElement
      const lost = focused === null || focused === document.body || node.contains(focused)
      if (current.finalFocus && (lost || !current.focusLeft)) {
        focusFinal(document, current.popupId, returnTo(), lost, current.closeMethod === "keyboard")
      } else if (focused instanceof HTMLElement && node.contains(focused)) {
        focused.blur()
      }
      node.inert = true
    }

    const mac = isMac(view)
    const onMouseUp = (event: MouseEvent) => {
      if (current.pressing) send(MenuMessage.ReleasedPointer({ outside: releasedOutside(event, inside, trigger()) }))
      if (!current.open || !current.release) return
      const target = event.target as Node | null
      const point = current.position.anchorRect
      const moved = point == null || Math.abs(event.clientX - point.x) > 1 || Math.abs(event.clientY - point.y) > 1
      const item = mac && moved && event.button === 2 && target instanceof Element
        ? target.closest<HTMLElement>("[data-menu-item]")
        : null
      if (item !== null && node.contains(item) && item.localName !== "a" && !item.hasAttribute("aria-haspopup")) {
        item.focus({ preventScroll: true })
        item.dispatchEvent(new (view ?? globalThis).MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }))
      }
      send(MenuMessage.ReleasedContextPointer({ outside: target === null || !inside(target) }))
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!current.open || event.defaultPrevented) return
      if (event.key === "Tab" && !current.nested && !event.altKey && !event.ctrlKey && !event.metaKey) {
        const anchor = returnTo()
        node.inert = true
        if (anchor !== null) anchor.focus({ preventScroll: true })
        if (current.context || event.shiftKey || anchor === null) event.preventDefault()
        send(MenuMessage.TabbedOut())
        return
      }
      const field = input()
      if (field === null || event.target !== field || event.isComposing) return
      const item = current.active === null ? null : document.getElementById(current.active)
      const hasValue = field.value !== ""
      const plain = !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
      if (item !== null && (event.key === "Enter" || (event.key === " " && !hasValue && plain))) {
        event.preventDefault()
        event.stopPropagation()
        item.click()
        return
      }
      const nav = keys(current.orientation, rtl)
      if (current.orientation === "vertical" && (event.key === nav.next || event.key === nav.previous)) {
        event.preventDefault()
      }
      const caret = field.selectionStart === field.selectionEnd
      const atEnd = caret && field.selectionEnd === field.value.length
      const atStart = caret && field.selectionStart === 0
      if (
        plain && item !== null && item.hasAttribute("aria-haspopup") &&
        ((event.key === nav.open && (!hasValue || atEnd)) ||
          (event.key === nav.close && current.orientation === "horizontal"))
      ) {
        event.preventDefault()
        event.stopPropagation()
        item.dispatchEvent(
          new (view ?? globalThis).KeyboardEvent("keydown", { key: event.key, bubbles: true, cancelable: true })
        )
        return
      }
      if (
        plain && current.nested && event.key === keys(current.parentOrientation, rtl).close && (!hasValue || atStart)
      ) {
        event.preventDefault()
        event.stopPropagation()
        field.dispatchEvent(
          new (view ?? globalThis).KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
        )
      }
    }

    let leftAt: Point | null = null
    let away = false
    let unblock: (() => void) | undefined
    const unblockParent = () => {
      unblock?.()
      unblock = undefined
    }
    const blockParent = () => {
      if (!current.nested || unblock !== undefined) return
      const element = node.parentElement?.closest<HTMLElement>("[data-menu-popup]")
      if (element === null || element === undefined) return
      const restoreParent = override(element, { "pointer-events": "none" })
      const restoreNode = override(node, { "pointer-events": "auto" })
      unblock = () => {
        restoreParent()
        restoreNode()
      }
    }
    const onMouseEnter = (event: MouseEvent) => {
      if (!current.open || !current.hoverClose || !current.nested || leftAt === null) return
      const target = event.target
      if (!(target instanceof Node) || node.contains(target) || trigger()?.contains(target) === true) return
      if (!inSafeArea({ x: event.clientX, y: event.clientY }, leftAt, boxOf(node))) return
      blockParent()
      event.stopPropagation()
    }
    const onMouseMove = (event: MouseEvent) => {
      if (!current.open || !current.hoverClose) return
      const target = event.target as Node | null
      const anchor = trigger()
      const point = { x: event.clientX, y: event.clientY }
      const onTrigger = target instanceof Element && target.closest(selectors.enabled) !== null
      if (target !== null && (node.contains(target) || anchor?.contains(target) === true || onTrigger)) {
        if (node.contains(target)) unblockParent()
        if (anchor?.contains(target) === true) leftAt = point
        if (away) {
          away = false
          send(MenuMessage.ReturnedToHoverArea())
        }
        return
      }
      if (leftAt !== null && inSafeArea(point, leftAt, boxOf(node))) {
        blockParent()
        return
      }
      unblockParent()
      leftAt = null
      if (!away) {
        away = true
        send(MenuMessage.LeftHoverArea())
      }
    }

    let viewportKey = args.trigger
    let previousTrigger: DOMRect | null = null
    let lastCurrent: Element | null = null
    let lastSize: Size | null = null
    const viewport = (): HTMLElement | null => node.querySelector<HTMLElement>("[data-menu-viewport]")
    const sizeOf = (element: HTMLElement): Size => {
      const style = view?.getComputedStyle(element)
      const width = Number.parseFloat(style?.width ?? "") || 0
      const height = Number.parseFloat(style?.height ?? "") || 0
      return Math.round(width) !== element.offsetWidth || Math.round(height) !== element.offsetHeight
        ? { width: element.offsetWidth, height: element.offsetHeight }
        : { width, height }
    }
    const remember = (measured: boolean) => {
      const anchor = trigger()
      if (anchor !== null) previousTrigger = boxOf(anchor)
      const element = viewport()
      lastCurrent = element?.querySelector(":scope > [data-current]") ?? null
      if (element !== null && !measured) lastSize = sizeOf(popup())
    }

    let unanchor: (() => void) | undefined
    const anchorPopup = () => {
      unanchor?.()
      unanchor = undefined
      if (!current.open || viewport() === null) return
      const side = current.side
      const top = side === "top"
      const left = side === "left" || side === (current.rtl ? "inline-end" : "inline-start")
      if (!top && !left) return
      unanchor = override(popup(), {
        position: "absolute",
        [top ? "bottom" : "top"]: "0",
        [left ? "right" : "left"]: "0"
      })
    }
    const measure = (fresh: HTMLElement | null): Size => {
      const element = popup()
      setSize(element, "--popup", "auto")
      const undo = [
        override(element, { position: "static", transform: "none", scale: "1" }),
        override(node, {
          "--available-width": "max-content",
          "--available-height": "max-content",
          "--positioner-width": "max-content",
          "--positioner-height": "max-content"
        }),
        ...(fresh === null ? [] : [override(fresh, { animation: "none", transition: "none" })])
      ]
      const size = sizeOf(element)
      undo.forEach((restore) => restore())
      return size
    }
    const fit = () => {
      if (viewport() === null) return
      anchorPopup()
      setSize(node, "--positioner", measure(null))
    }
    let resizing: AbortController | undefined
    const resize = (fresh: HTMLElement | null, previous: Size | null) => {
      resizing?.abort()
      if (previous === null) return fit()
      const element = popup()
      const next = measure(fresh)
      lastSize = next
      setSize(element, "--popup", previous)
      setSize(node, "--positioner", next)
      // Reading the width flushes styles, so the transition starts from the pinned size instead of auto.
      void element.offsetWidth
      const controller = new AbortController()
      resizing = controller
      frame(() => {
        if (controller.signal.aborted) return
        setSize(element, "--popup", next)
        Promise.allSettled(element.getAnimations().map((animation) => animation.finished)).then(() => {
          if (!controller.signal.aborted) setSize(element, "--popup", "auto")
        })
      })
    }

    const morph = (anchor: HTMLElement | null) => {
      const element = viewport()
      const from = previousTrigger
      const old = lastCurrent
      const size = lastSize
      const fresh = element?.querySelector<HTMLElement>(":scope > [data-current]") ?? null
      if (element !== null) resize(fresh, size)
      if (anchor !== null && from !== null) {
        frame(() =>
          Promise.allSettled(node.getAnimations({ subtree: true }).map((animation) => animation.finished)).then(() => {
            if (current.open) send(MenuMessage.SettledTriggerChange())
          })
        )
      }
      if (element === null) return
      if (old === null || old.isConnected || from === null || anchor === null) return
      const wrapper = document.createElement("div")
      wrapper.setAttribute("data-previous", "")
      wrapper.inert = true
      wrapper.style.position = "absolute"
      if (size !== null) setSize(wrapper, "--popup", size)
      wrapper.append(...Array.from(old.childNodes))
      element.insertBefore(wrapper, element.firstChild)
      fresh?.setAttribute("data-starting-style", "")
      send(MenuMessage.MovedViewport({ direction: activationDirection(from, boxOf(anchor)) }))
      frame(() => {
        fresh?.removeAttribute("data-starting-style")
        wrapper.setAttribute("data-ending-style", "")
        const running = [...wrapper.getAnimations({ subtree: true }), ...(fresh?.getAnimations() ?? [])]
          .map((animation) => animation.finished)
        Promise.allSettled(running).then(() => {
          wrapper.remove()
          send(MenuMessage.SettledViewport())
        })
      })
    }

    const transition = settling(node, popup, frame, (open) => send(MenuMessage.FinishedTransition({ open })))

    const onChange = (next: TrackMenuArgs) => {
      const previous = current
      current = next
      if (next.popupId !== previous.popupId) selectors = selectorsOf(next.popupId)
      if (next.open !== previous.open || next.lock !== previous.lock || next.touch !== previous.touch) hold()
      if (!next.hoverClose) {
        leftAt = null
        away = false
        unblockParent()
      }
      if (previous.open && !next.open) closing()
      else if (!previous.open && next.open) opening()
      else if (next.open && next.active !== previous.active) focusActive(next.scroll)
      const switched = next.open && next.trigger !== viewportKey && viewportKey !== null && next.trigger !== null
      if (switched) {
        viewportKey = next.trigger
        const anchor = trigger()
        morph(anchor)
        found(anchor)
        cut(anchor)
      } else if (next.trigger !== null) viewportKey = next.trigger
      if (next.open && (next.side !== previous.side || next.rtl !== previous.rtl)) anchorPopup()
      if (next.open) remember(switched)
      transition.follow(previous, next)
    }

    const onTriggerLeave = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.matches(selectors.active)) {
        leftAt = { x: event.clientX, y: event.clientY }
      }
    }

    const controller = new AbortController()
    const { signal } = controller

    return Effect.acquireRelease(
      Effect.sync(() => {
        listenOutside(document, signal, {
          open: () => current.open,
          anyButton: () => current.context,
          inside,
          pressed: (pointerType) => send(MenuMessage.PressedOutside({ pointerType })),
          focused: () => send(MenuMessage.FocusedOutside())
        })
        document.addEventListener("mouseup", onMouseUp, { capture: true, signal })
        document.addEventListener("mousemove", onMouseMove, { capture: true, passive: true, signal })
        // The window sees the capture phase before the document, where the host delegates item handlers.
        if (current.nested) view?.addEventListener("mouseenter", onMouseEnter, { capture: true, signal })
        document.addEventListener("mouseout", onTriggerLeave, { capture: true, passive: true, signal })
        node.addEventListener("keydown", onKeyDown, { capture: true, signal })
        node.addEventListener("mousedown", (event) => {
          if (event.target instanceof Node && blocker.is(event.target)) event.preventDefault()
        }, { signal })
        node.addEventListener("contextmenu", (event) => {
          if (current.context) event.preventDefault()
        }, { signal })
        hold()
        raiseAbove(node)
        if (current.open) {
          opening()
          remember(false)
        } else node.inert = true
      }).pipe(
        Effect.tap(() => Effect.forkScoped(Stream.runForEach(changes, (next) => Effect.sync(() => onChange(next)))))
      ),
      () =>
        Effect.sync(() => {
          controller.abort()
          clearTimeout(timer)
          release?.()
          release = undefined
          cutUndo?.()
          unanchor?.()
          resizing?.abort()
          unblockParent()
          transition.cancel()
          node.inert = false
        })
    )
  })

const TrackMenu = Mount.makeStream(
  "TrackMenu",
  { args: TrackMenuArgs },
  (node: HTMLElement, args, changes) =>
    Stream.merge(
      watch(node, args, changes),
      Positioning.trackPosition(node, args.position, Stream.map(changes, (next) => next.position)).pipe(
        Stream.map((placement) => MenuMessage.ChangedPlacement({ placement }))
      )
    )
)

const HoverIntent = Mount.makeStream(
  "MenuTriggerHover",
  { args: { delay: Schema.Number } },
  (node: HTMLElement, args, changes) =>
    Stream.callback<void>((queue) => {
      let delay = args.delay
      let timer: ReturnType<typeof setTimeout> | undefined
      const rest = () => {
        clearTimeout(timer)
        timer = setTimeout(() => Queue.offerUnsafe(queue, undefined), delay)
      }
      const leave = () => clearTimeout(timer)
      const controller = new AbortController()
      return Effect.acquireRelease(
        Effect.sync(() => {
          node.addEventListener("mouseenter", rest, { signal: controller.signal })
          node.addEventListener("mousemove", rest, { signal: controller.signal })
          node.addEventListener("mouseleave", leave, { signal: controller.signal })
        }).pipe(
          Effect.tap(() =>
            Effect.forkScoped(Stream.runForEach(changes, (next) => Effect.sync(() => (delay = next.delay))))
          )
        ),
        () =>
          Effect.sync(() => {
            controller.abort()
            clearTimeout(timer)
          })
      )
    })
)

type Touch = { readonly _tag: "Started"; readonly x: number; readonly y: number } | { readonly _tag: "Cancelled" }

const LongPressSlop = 10

const LongPress = Mount.makeStream(
  "MenuLongPress",
  { args: {} },
  (node: HTMLElement) =>
    Stream.callback<Touch>((queue) => {
      let start: { readonly x: number; readonly y: number } | null = null
      const cancel = () => {
        if (start === null) return
        start = null
        Queue.offerUnsafe(queue, { _tag: "Cancelled" })
      }
      const onStart = (event: TouchEvent) => {
        const touch = event.touches[0]
        if (event.touches.length !== 1 || touch === undefined) return cancel()
        event.stopPropagation()
        start = { x: touch.clientX, y: touch.clientY }
        Queue.offerUnsafe(queue, { _tag: "Started", ...start })
      }
      const onMove = (event: TouchEvent) => {
        const touch = event.touches[0]
        if (event.touches.length !== 1 || touch === undefined) return cancel()
        if (
          start !== null &&
          (Math.abs(touch.clientX - start.x) > LongPressSlop || Math.abs(touch.clientY - start.y) > LongPressSlop)
        ) cancel()
      }
      const controller = new AbortController()
      return Effect.acquireRelease(
        Effect.sync(() => {
          const options = { passive: true, signal: controller.signal }
          node.addEventListener("touchstart", onStart, options)
          node.addEventListener("touchmove", onMove, options)
          node.addEventListener("touchend", cancel, options)
          node.addEventListener("touchcancel", cancel, options)
        }),
        () => Effect.sync(() => controller.abort())
      )
    })
)

const blocker = blockers("data-menu-blocker")

const hiddenBox = "display:none"

const MenuTriggerHoverDefault = 100

const triggerAttrs = <B extends Attributed<B>>(builder: B, popupId: string, open: boolean, active: boolean): B =>
  builder
    .attrs({
      "aria-haspopup": "menu",
      "aria-expanded": String(open),
      "aria-controls": open ? popupId : undefined,
      "data-popup-open": flag(open),
      "data-menu-trigger": popupId,
      "data-menu-active": flag(active)
    })

type Handles<Msg> = Html.Element<Msg, any, Html.Events, any, any>

type MsgOf<B> = B extends Handles<infer Msg> ? Msg : never

const pressable = <B extends Handles<any>>(
  builder: B,
  press: (pointerType: string) => MsgOf<B>,
  click: (pointerType: string) => MsgOf<B> = press
): B =>
  builder
    .on(
      "mousedown",
      ({ button, pointerType }: Html.PointerPayload) =>
        button === 0 && pointerType !== "touch" ? press(pointerType) : undefined
    )
    .onClick(({ pointerType }: Html.PointerPayload) =>
      pointerType === "" || pointerType === "touch" ? click(pointerType) : undefined
    )

/**
 * The options of one `trigger` part, over the menu's props of the same
 * name: `disabled` turns this trigger off, and `openOnHover`, `delay` and
 * `closeDelay` set how the pointer opens and closes the menu from it.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MenuTriggerOptions {
  readonly disabled?: boolean | undefined
  readonly openOnHover?: boolean | undefined
  readonly delay?: number | undefined
  readonly closeDelay?: number | undefined
}

/**
 * A press or a hover on a `MenuTrigger`: the trigger's `id`, if it has one,
 * how the user pressed it, and the reason to pass to the menu as
 * `openReason`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MenuTriggerPress {
  readonly triggerId: string | null
  readonly method: MenuInteraction
  readonly reason: "trigger-press" | "trigger-hover"
}

/**
 * A `<button>` builder: what `MenuTrigger` accepts as `element`, from the
 * caller's `h.button`, and what it returns.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type MenuTriggerElement<Msg, R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<"button">,
  HTMLButtonElement,
  "button"
>

/**
 * The props of a `MenuTrigger`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MenuTriggerProps {
  /** Whether the menu is open for this trigger. */
  readonly open: boolean
  /** The menu's `id`, which `aria-controls` points at while it is open. */
  readonly popupId: string
  /** The trigger takes no press and no hover. */
  readonly disabled?: boolean | undefined
  /** How long the pointer rests on the trigger before `onHover`, in milliseconds. */
  readonly delay?: number | undefined
}

/**
 * A button that opens a menu drawn somewhere else, such as in another
 * component. Call it with the caller's `h`, whether the menu is open for
 * this trigger, the menu's `id` as `popupId`, and what a press sends as
 * `onPress`, then chain the label.
 *
 * **Details**
 *
 * It sets `aria-haspopup="menu"`, `aria-expanded`, `data-popup-open`,
 * `data-pressed`, and `aria-controls` while the menu is open, in
 * `forward`, so they win over the caller's. Give the menu the same `id`,
 * and the trigger's `id` as the menu's `triggerId`: the menu then places
 * its popup against the trigger, a press on it isn't a press outside, and
 * focus goes back to it when the menu closes.
 *
 * A mouse press sends `onPress` on `mousedown`, as the menu's own trigger
 * does, and a touch, Enter or Space on `click`. `onHover` is sent once the
 * pointer has rested on the trigger for `delay` milliseconds, 100 when left
 * out. Each is a message or a function of the press, which carries the
 * trigger's `id`, how the user pressed it and why. Pass the method and the
 * reason to the menu as `openMethod` and `openReason`: a menu opened with
 * `"trigger-hover"` closes when the pointer leaves it and the trigger.
 *
 * Given `onPress`, a `mousedown` or `click` handler of the caller's own
 * throws at render: pass the message as `onPress`. Given `onHover`, it
 * reserves the element's mount slot, so the caller can't set another mount
 * on it.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const MenuTrigger = <Msg, R = never>(
  h: { readonly button: MenuTriggerElement<Msg> },
  options: {
    /** The caller's `h.button`, to stack a part on it. `h.button` when left out. */
    readonly element?: MenuTriggerElement<Msg, R> | undefined
    readonly props: MenuTriggerProps
    /** What a press sends. */
    readonly onPress?: NoInfer<Msg> | ((press: MenuTriggerPress) => NoInfer<Msg>) | undefined
    /** What resting the pointer on the trigger sends. */
    readonly onHover?: NoInfer<Msg> | ((press: MenuTriggerPress) => NoInfer<Msg>) | undefined
  }
): MenuTriggerElement<Msg, R> => {
  const element: MenuTriggerElement<Msg, R> = options.element ?? h.button
  const { onHover, onPress } = options
  const { disabled, open, popupId } = options.props
  return element.forward((node) => {
    if (onPress !== undefined && (node.handlers.click !== undefined || node.handlers.mousedown !== undefined)) {
      throw new Error(
        "MenuTrigger: the element already handles mousedown or click, which MenuTrigger would replace. Send the message from onPress"
      )
    }
    const triggerId = idOf(node)
    const message = (
      handler: NoInfer<Msg> | ((press: MenuTriggerPress) => NoInfer<Msg>),
      method: MenuInteraction,
      reason: MenuTriggerPress["reason"]
    ): Msg =>
      typeof handler === "function"
        ? (handler as (press: MenuTriggerPress) => Msg)({ triggerId, method, reason })
        : handler
    const button = triggerAttrs(node.attr("type", "button"), popupId, open, open)
      .attrs({ "data-pressed": flag(open), "data-disabled": flag(disabled) })
      .disabled(disabled === true)
    const pressed = onPress === undefined || disabled === true
      ? button
      : pressable(button, (pointerType) => message(onPress, methodOf(pointerType), "trigger-press"))
    return onHover === undefined || disabled === true || open
      ? pressed
      : pressed.onMount(
        HoverIntent({ delay: options.props.delay ?? MenuTriggerHoverDefault }).pipe(
          Mount.map(() => message(onHover, "mouse", "trigger-hover"))
        )
      )
  })
}

/**
 * Text matching as a filtering menu does it, for a `filter: null` menu that
 * filters its own items: `contains`, `startsWith` and `endsWith` of a text
 * and a query, ignoring case, accents and punctuation by default.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MenuFilter {
  readonly contains: (text: string, query: string) => boolean
  readonly startsWith: (text: string, query: string) => boolean
  readonly endsWith: (text: string, query: string) => boolean
}

/**
 * Makes a `MenuFilter` for `locale`, the runtime's when left out, and
 * `Intl.Collator` options over the defaults: search usage, base
 * sensitivity, punctuation ignored.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const menuFilter = (
  options: Intl.CollatorOptions & { readonly locale?: string | undefined } = {}
): MenuFilter => {
  const { locale, ...collator } = options
  return textFilter(locale, collator)
}

/**
 * A menu: a button that opens a list of actions, links, checkbox and radio
 * items, and submenus.
 *
 * **Details**
 *
 * The parts also return plain values for markup that depends on them:
 * `open`, `mounted` (the popup shows, through its exit transition),
 * `transitionStatus`, `nested` (it's a submenu), `side` and `align`
 * (where the popup ended up), `highlighted` (the value of the highlighted
 * item), `openMethod`, which is `null` once the popup closes,
 * `transitioning` and `activationDirection` for the viewport, and
 * `nothingMatches`, whether a filter matches no item.
 *
 * A trigger reports the `id` the consumer gave it in `RequestedOpen`: set it
 * on the builder before the part. One without gets a generated `id`. The
 * menu remembers the trigger that opened it, or follows `triggerId`: only
 * that one reports it open and anchors the popup. Pressing another one while
 * the menu is open asks it to open for that one.
 *
 * The popup, the list, the items, the group labels and the arrow set their
 * own `id`s, over any on the builder, for the ARIA attributes that point at
 * them.
 *
 * History restore saves nothing of it: after Back, forward or a reload it
 * starts from `init`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Menu = Component.define({
  name: "Menu",
  scoped: false,
  props: MenuProps,
  model: MenuModel,
  message: MenuMessage,
  events: MenuEvents,
  shares: {
    value: shares,
    receives: ["RequestedCloseByChild"],
    collects: {
      schema: Submenu,
      onChange: (submenus) =>
        MenuMessage.ChangedSubmenus({ submenus: submenus.filter((submenu) => submenu.item !== "") })
    }
  },
  shared: {
    parent: {
      owner: "self",
      optional: true,
      report: (_model, props) => ({ item: props.parentItem ?? "", open: props.open }),
      onChange: (parent) => MenuMessage.ChangedParent({ parent })
    }
  },
  restore: false,
  elements: Html
}).make({
  init: () => ({
    mounted: false,
    started: false,
    openMethod: null,
    closeMethod: null,
    reason: null,
    closeReason: null,
    focusLeft: false,
    trigger: null,
    hoverTrigger: null,
    hoverTriggerId: null,
    hoverCloseDelay: 0,
    closeDelay: 0,
    hovering: false,
    stick: false,
    active: null,
    activeByKey: false,
    typed: "",
    typedFrom: -1,
    matched: -1,
    spaceDown: false,
    placement: null,
    pressing: false,
    releaseAllowed: false,
    pressedItem: false,
    rtl: false,
    submenus: [],
    instant: null,
    transitioning: false,
    direction: null,
    inputFocused: false,
    keyboard: false,
    triggerElement: null,
    context: false,
    point: null,
    longPress: null,
    justOpened: false,
    releaseArmed: false
  }),
  update: {
    PressedTrigger: (model, { key, pointerType, triggerId }, $) =>
      pressTrigger(model, $, methodOf(pointerType), key, triggerId),
    ReleasedTrigger: (_model, _message, $) => $.evolve({ pressing: false }),
    PressedContextTrigger: (model, { key, pointerType, triggerId, x, y }, $) =>
      openAt(model, $, key, triggerId, contextPoint(x, y, pointerType), methodOf(pointerType), true),
    TouchedContextTrigger: (model, { key, triggerId, x, y }, $) =>
      disabledOf($)
        ? model
        : $.set({ ...model, longPress: { key, triggerId, x, y } }).run(
          WaitBeforeLongPress.make({ delay: LongPressDelay })
        ),
    CancelledLongPress: (model, _message, $) =>
      model.longPress === null
        ? model
        : $.set({ ...model, longPress: null }).run(Command.interrupt(WaitBeforeLongPress)),
    CompletedWaitBeforeLongPress: (model, _message, $) => {
      const press = model.longPress
      if (press === null) return model
      const point = { x: press.x, y: press.y, width: 10, height: 10 }
      return openAt(model, $, press.key, press.triggerId, point, "touch", false)
    },
    CompletedWaitBeforeContextGrace: (_model, _message, $) => $.evolve({ justOpened: false }),
    ReleasedContextPointer: (model, { outside }, $) => {
      if (!model.releaseArmed) return model
      const next = { ...model, releaseArmed: false }
      return outside && !model.justOpened ? dismiss(next, $, "cancel-open", "mouse") : $.set(next)
    },
    PressedTriggerKey: (model, { key, trigger, triggerId }, $) =>
      $.props.open || disabledOf($)
        ? model
        : open(model, $, "list-navigation", "keyboard", trigger, triggerId, key === "ArrowUp"),
    EnteredTrigger: (model, message, $) => enterTrigger(model, $, message),
    LeftTrigger: (model, _message, $) =>
      $.set($.props.open ? model : { ...model, hovering: false }).run(Command.interrupt(WaitBeforeHoverOpen)),
    CompletedWaitBeforeHoverOpen: (model, _message, $) =>
      $.props.open || !model.hovering || disabledOf($) ? model : hoverOpen(model, $),
    LeftHoverArea: (model, _message, $) =>
      $.props.open && model.reason === "trigger-hover"
        ? $.set({ ...model, hovering: false }).run(WaitBeforeHoverClose.make({ delay: model.closeDelay }))
        : model,
    ReturnedToHoverArea: (model, _message, $) =>
      $.set({ ...model, hovering: true }).run(Command.interrupt(WaitBeforeHoverClose)),
    CompletedWaitBeforeHoverClose: (model, _message, $) =>
      $.props.open && model.reason === "trigger-hover" && !model.hovering &&
        !model.submenus.some((submenu) => submenu.open)
        ? dismiss(model, $, "trigger-hover", "mouse")
        : model,
    CompletedWaitBeforeStickExpires: (_model, _message, $) => $.evolve({ stick: false }),
    PressedSubmenuTrigger: (model, { pointerType }, $) =>
      hoverOf($.props, true) ? model : pressTrigger(model, $, methodOf(pointerType), "submenu", null),
    ClickedSubmenuTrigger: (model, { pointerType }, $) =>
      pressTrigger(model, $, methodOf(pointerType), "submenu", null),
    PressedSubmenuTriggerKey: (model, { key }, $) => {
      const parent = parentOf($)
      if ($.props.open || parent === undefined || disabledOf($)) return model
      const reason = key === keys(parent.orientation, parent.rtl).open ? "list-navigation" : "trigger-press"
      return open(model, $, reason, "keyboard", "submenu", null)
    },
    PressedKey: (model, { action, key }, $) => pressKey(model, $, key, action),
    ReleasedSpace: (model, { action }, $) => {
      if (!model.spaceDown) return model
      const next = { ...model, spaceDown: false }
      return action !== null && $.props.open ? activate(next, $, action, "keyboard") : next
    },
    EnteredItem: (model, { value }, $) =>
      $.props.open && $.props.highlightItemOnHover !== false && model.active !== value
        ? commit($, model, { ...model, active: value, activeByKey: false }, "pointer")
        : model,
    LeftItem: (model, _message, $) =>
      model.active === null || model.submenus.some((submenu) => submenu.open && submenu.item === model.active) ||
        filteringOf($.props)
        ? model
        : commit($, model, { ...model, active: null, activeByKey: false }, "pointer"),
    PressedItem: (_model, _message, $) => $.evolve({ pressedItem: true }),
    ReleasedItem: (model, { action, pointerType }, $) =>
      model.pressing && model.releaseAllowed && !model.pressedItem && action.kind !== "link"
        ? activate({ ...model, pressing: false }, $, action, methodOf(pointerType))
        : model,
    ClickedItem: (model, { action, pointerType }, $) => activate(model, $, action, methodOf(pointerType)),
    CompletedWaitBeforeResetTyping: (_model, _message, $) => $.evolve({ typed: "" }),
    ShowedPopup: (_model, _message, $) =>
      $.evolve($.props.open ? { mounted: true, closeMethod: null, focusLeft: false } : { mounted: true }),
    RenderedFirstFrame: (model, _message, $) => $.props.open ? $.evolve({ started: true }) : model,
    FinishedTransition: (model, { open }, $) => {
      if (open !== $.props.open) return model
      if (open) return $.emit(MenuEvents.Settled({ open }))
      if (!model.mounted || $.props.holdExit === true) return model
      const closed = $.set({
        ...model,
        mounted: false,
        started: false,
        pressedItem: false,
        active: null,
        transitioning: false,
        direction: null,
        instant: model.instant === "trigger-change" ? null : model.instant
      }).emit(MenuEvents.Settled({ open }))
      const highlighted = model.active === null
        ? closed
        : closed.emit(MenuEvents.Highlighted({ value: null, reason: "none" }))
      return $.props.query !== undefined && $.props.query !== ""
        ? highlighted.emit(MenuEvents.RequestedQuery({ query: "", reason: "none" }))
        : highlighted
    },
    ChangedPlacement: (_model, { placement }, $) => $.evolve({ placement }),
    ChangedDirection: (_model, { rtl }, $) => $.evolve({ rtl }),
    FoundTrigger: (_model, { id }, $) => $.evolve({ triggerElement: id }),
    PressedOutside: (model, { pointerType }, $) =>
      model.context && model.justOpened && model.openMethod === "touch"
        ? model
        : dismiss(model, $, "outside-press", methodOf(pointerType)),
    FocusedOutside: (model, _message, $) => dismiss(model, $, "focus-out", null, true),
    TabbedOut: (model, _message, $) => dismiss(model, $, "focus-out", "keyboard", true),
    ReleasedPointer: (model, { outside }, $) => {
      if (!model.pressing) return model
      const next = { ...model, pressing: false }
      return outside ? dismiss(next, $, "cancel-open", "mouse") : next
    },
    AllowedRelease: (model, _message, $) => model.pressing ? $.evolve({ releaseAllowed: true }) : model,
    ChangedSubmenus: (_model, { submenus }, $) => $.evolve({ submenus }),
    ChangedParent: (model, { parent }, $) => {
      if ($.props.parentItem === undefined) return model
      const next = parent.rtl === model.rtl ? model : { ...model, rtl: parent.rtl }
      if (!$.props.open) return next
      if (!parent.open) return dismiss(next, $, parent.reason ?? "none", null)
      if (parent.active !== null && parent.active !== $.props.parentItem) {
        return dismiss(next, $, "sibling-open", null)
      }
      return next
    },
    RequestedCloseByChild: (model, { reason }, $) =>
      $.props.open ? closeTree(model, $, reason, reason === "escape-key" ? "keyboard" : null) : model,
    MovedViewport: (_model, { direction }, $) => $.evolve({ transitioning: true, direction, instant: null }),
    SettledViewport: (_model, _message, $) => $.evolve({ transitioning: false }),
    SettledTriggerChange: (model, _message, $) => $.props.open ? $.evolve({ instant: "trigger-change" }) : model,
    ChangedInput: (model, { value }, $) => {
      const props = $.props
      if (!props.open) return model
      const reason = value === "" ? "input-clear" : "input-change"
      const next = { ...model, active: autoHighlighted(props, value), activeByKey: false }
      return commit($, model, next, "none").emit(MenuEvents.RequestedQuery({ query: value, reason }))
    },
    PressedInputKey: (model, { key, modified }, $) => {
      const props = $.props
      const next = model.keyboard ? model : { ...model, keyboard: true }
      if (!props.open || modified) return next
      const hasValue = (props.query ?? "") !== ""
      const nav = keys(props.orientation ?? "vertical", model.rtl)
      if (key === nav.next || key === nav.previous) {
        if (props.orientation === "horizontal" && hasValue && model.active === null) return next
        return navigate(next, $, key)
      }
      if (key === "Home" || key === "End") {
        return model.active !== null && !hasValue ? navigate(next, $, key) : next
      }
      if (key === "Escape") return pressKey(next, $, key, null)
      return next
    },
    FocusedInput: (_model, _message, $) => $.evolve({ inputFocused: true }),
    BlurredInput: (_model, _message, $) => $.evolve({ inputFocused: false }),
    PressedInput: (model, _message, $) => model.keyboard ? $.evolve({ keyboard: false }) : model,
    ClickedClear: (model, _message, $) => {
      const props = $.props
      if (!props.open || (props.query ?? "") === "") return model
      const next = { ...model, active: autoHighlighted(props, ""), activeByKey: false }
      return commit($, model, next, "none").emit(MenuEvents.RequestedQuery({ query: "", reason: "clear-press" }))
    }
  },
  parts: (model, p) => {
    const props = p.props
    const parent = parentOf(p)
    const nested = parent !== undefined
    const open = props.open
    const shown = open || model.mounted
    const transitionStatus: MenuTransitionStatus = statusOf(model, props)
    const disabled = disabledOf(p)
    const orientation = props.orientation ?? "vertical"
    const rtl = nested ? parent.rtl : model.rtl
    const hover = hoverOf(props, nested)
    const openReason = props.openReason ?? model.reason
    const openMethod = props.openMethod ?? model.openMethod
    const hovered = openReason === "trigger-hover"
    const context = !nested && model.context
    const modal = !nested && (context || (props.modal !== false && !hovered))
    const popupId = props.id ?? p.id("popup")
    const listId = p.id("list")
    const inputId = p.id("input")
    const arrowId = p.id("arrow")
    const itemId = (value: string) => p.id("item", value)
    const groupLabelId = (group: string) => p.id("group-label", group)
    const activeTrigger = props.triggerId ?? model.trigger
    const filtering = filteringOf(props)
    const matches = matcherOf(props)
    const visible = new Set(visibleOf(props, matches))
    const empty = filtering && (props.query ?? "").trim() !== "" && visible.size === 0
    const tracked = Positioning.trackArgs(
      nested ? { ...props, align: props.align ?? "start" } : context ? contextPlacement(props, model.point) : props,
      {
        side: nested ? "inline-end" : "bottom",
        collisionAvoidance: nested ? Positioning.popupCollisionAvoidance : Positioning.dropdownCollisionAvoidance,
        anchorSelector: context ? contextSelector(popupId) : triggerSelector(popupId),
        anchorRect: context ? model.point : null,
        shiftCrossAxis: context,
        arrowId
      }
    )
    const side = model.placement?.side ?? tracked.options.side
    const align = model.placement?.align ?? tracked.options.align
    const items = new Map(props.items.map((item) => [item.value, item] as const))
    const itemOf = (value: string): MenuItem => {
      const item = items.get(value)
      if (item === undefined) throw new Error("Menu: no item in the items prop has the value \"" + value + "\"")
      return item
    }
    const highlighted = open ? model.active : null
    const hovers = open && props.highlightItemOnHover !== false
    const instant = shown ? model.instant ?? undefined : undefined
    const checks = new Map<string, boolean>()
    let radio: string | null = null
    let triggers = 0
    let labelledBy: string | undefined = context ? undefined : props.triggerId ?? model.triggerElement ?? undefined
    let listed = false
    let inputDrawn = false

    const states = <B extends Attributed<B>>(builder: B): B => transitionAttrs(builder, open, transitionStatus)
    const placed = <B extends Attributed<B>>(builder: B): B =>
      states(builder).attrs({ "data-side": side, "data-align": align })

    const hoverOpens = <B extends Handles<MenuMessage>>(
      builder: B,
      key: string,
      triggerId: string | null,
      options: MenuTriggerOptions
    ): B =>
      builder.on(
        "mouseenter",
        MenuMessage.EnteredTrigger({
          key,
          triggerId,
          delay: options.delay ?? props.delay ?? MenuTriggerHoverDefault,
          closeDelay: options.closeDelay ?? props.closeDelay ?? 0
        })
      ).on("mouseleave", MenuMessage.LeftTrigger())

    const triggerPart = p.part("button", (b, key: string, triggerId: string | null, options: MenuTriggerOptions) => {
      const active = activeTrigger === null ? key === p.id("trigger", 0) || triggers === 1 : activeTrigger === key ||
        activeTrigger === triggerId
      if (active) labelledBy = key
      const off = disabled || options.disabled === true
      const attributed = triggerAttrs(
        b.attrs({ id: key, type: "button" }),
        popupId,
        open && active,
        shown && active
      )
        .attrs({ "data-pressed": flag(open && active), "data-disabled": flag(off) })
        .disabled(off)
      if (options.disabled === true) return attributed
      const own = pressable(attributed, (pointerType) => MenuMessage.PressedTrigger({ key, triggerId, pointerType }))
        .on("mouseup", MenuMessage.ReleasedTrigger())
        .onKeyDown(
          ({ composing, key: pressed }) =>
            !composing && (pressed === "ArrowDown" || pressed === "ArrowUp")
              ? MenuMessage.PressedTriggerKey({ key: pressed, trigger: key, triggerId })
              : undefined,
          { preventDefault: true }
        )
      return options.openOnHover ?? hover ? hoverOpens(own, key, triggerId, options) : own
    })
    const trigger = View.wrapPart(
      triggerPart,
      <B extends View.PartTarget<"button">>(element: B, options: MenuTriggerOptions = {}): ReturnType<B["attr"]> => {
        const id = idOf(element)
        triggers++
        return triggerPart(element, id ?? p.id("trigger", triggers - 1), id, options)
      }
    )

    let contextTriggers = 0
    const contextTriggerPart = p.part("div", (b, key: string, triggerId: string | null) => {
      const active = context && (activeTrigger === key || (triggerId !== null && activeTrigger === triggerId))
      const marked = b
        .attrs({
          "data-menu-context": popupId,
          "data-menu-active": flag(shown && active),
          "data-popup-open": flag(open && active),
          "data-pressed": flag(open && active)
        })
        .forward(ownStyle("-webkit-touch-callout:none"))
      if (disabled) return marked
      return marked
        .on(
          "contextmenu",
          ({ pointerType, x, y }) => MenuMessage.PressedContextTrigger({ key, triggerId, x, y, pointerType }),
          { preventDefault: true }
        )
        .onMount(
          LongPress({}).pipe(
            Mount.map((touch) =>
              touch._tag === "Started"
                ? MenuMessage.TouchedContextTrigger({ key, triggerId, x: touch.x, y: touch.y })
                : MenuMessage.CancelledLongPress()
            )
          )
        )
    })
    const contextTrigger = View.wrapPart(
      contextTriggerPart,
      <B extends View.PartTarget<"div">>(element: B): ReturnType<B["attr"]> => {
        const id = idOf(element)
        contextTriggers++
        return contextTriggerPart(element, id ?? p.id("context", contextTriggers - 1), id)
      }
    )

    const submenuTriggerPart = p.part("div", (b) => {
      const parentKeys = keys(parent?.orientation ?? "vertical", rtl)
      const own = pressable(
        triggerAttrs(b, popupId, open, shown).attr("data-disabled", flag(disabled)),
        (pointerType) => MenuMessage.PressedSubmenuTrigger({ pointerType }),
        (pointerType) => MenuMessage.ClickedSubmenuTrigger({ pointerType })
      )
        .onKeyDown(
          ({ composing, key }) =>
            !composing && (key === parentKeys.open || key === "Enter" || key === " ")
              ? MenuMessage.PressedSubmenuTriggerKey({ key })
              : undefined,
          { preventDefault: true }
        )
      return hover ? hoverOpens(own, "submenu", null, {}) : own
    })
    const submenuTrigger = View.wrapPart(
      submenuTriggerPart,
      <B extends View.PartTarget<"div">>(element: B): ReturnType<B["attr"]> => {
        if (!nested) throw new Error("Menu: submenuTrigger is for a Menu drawn inside another Menu's popup")
        return submenuTriggerPart(element)
      }
    )

    const withoutNativeMenu = <B extends Handles<MenuMessage>>(builder: B): B =>
      context && !disabled ? builder.on("contextmenu", () => undefined, { preventDefault: "always" }) : builder

    const backdrop = p.part("div", (b) =>
      withoutNativeMenu(states(b))
        .attr("role", "presentation")
        .popover("manual", shown && !nested)
        .forward((node) =>
          node.attr(
            "style",
            withStyle(node.elementAttrs.style, open && !hovered ? backdropBox : backdropBox + ";pointer-events:none")
          )
        ))

    const positionerStyle = Positioning.positionerStyle(tracked.positionMethod)
    const positioner = p.part("div", (b) => {
      const decorated = placed(b)
        .attrs({
          role: "presentation",
          "data-anchor-hidden": flag(shown && model.placement?.anchorHidden),
          "data-instant": instant
        })
        .popover("manual", shown)
        .forward((node) => node.attr("style", withStyle(node.elementAttrs.style, positionerStyle)))
      const layered = modal ? decorated.children(open ? blocker.open : blocker.closed) : decorated
      if (!shown) return layered
      return layered.onMount(
        TrackMenu({
          position: tracked,
          open,
          mounted: model.mounted,
          started: model.started,
          holdExit: props.holdExit === true,
          lock: open && modal,
          touch: openMethod === "touch",
          nested,
          initialFocus: !hovered && !(nested && openMethod !== "keyboard"),
          active: highlighted !== null && items.has(highlighted) ? itemId(highlighted) : null,
          scroll: model.activeByKey,
          pressing: model.pressing,
          finalFocus: props.finalFocus !== false,
          focusLeft: model.focusLeft,
          closeMethod: model.closeMethod,
          hoverClose: open && hovered,
          rtl,
          trigger: activeTrigger,
          popupId,
          inputId: filtering ? inputId : null,
          orientation,
          parentOrientation: parent?.orientation ?? "vertical",
          side,
          context,
          release: context && model.releaseArmed
        })
      )
    })

    const menuRole = <B extends Attributed<B>>(builder: B): B =>
      builder.attrs({ role: "menu", "aria-orientation": orientation === "horizontal" ? "horizontal" : undefined })

    const keyMessage = (action: ItemAction | null) => ({ alt, composing, ctrl, key, meta }: Html.KeyPayload) =>
      composing || (key === "Enter" && action?.kind === "link")
        ? undefined
        : key.startsWith("Arrow") || key === "Home" || key === "End" || key === "Enter" || key === "Escape" ||
            printable(key, alt, ctrl, meta)
        ? MenuMessage.PressedKey({ key, action })
        : undefined

    const popup = p.part("div", (b) =>
      placed(b)
        .attrs({
          id: popupId,
          tabindex: "-1",
          "data-menu-popup": "",
          "data-nested": flag(nested),
          "data-instant": instant
        })
        .onKeyDown(keyMessage(null), { preventDefault: true })
        .onKeyUp(({ key }) => key === " " ? MenuMessage.ReleasedSpace({ action: null }) : undefined)
        .forward((node) =>
          listed || inputDrawn
            ? node.attr("role", "presentation")
            : menuRole(node).attr("aria-labelledby", node.elementAttrs["aria-labelledby"] ?? labelledBy)
        ))

    const list = p.part("div", (b) => {
      listed = true
      return menuRole(b)
        .attrs({ id: listId, tabindex: "-1" })
        .forward((node) => node.attr("aria-labelledby", node.elementAttrs["aria-labelledby"] ?? labelledBy))
    })

    const arrowStyle = Positioning.arrowStyle(side)
    const arrow = p.part("div", (b) =>
      placed(b)
        .attrs({
          id: arrowId,
          "aria-hidden": "true",
          "data-uncentered": flag(model.placement?.arrowUncentered)
        })
        .forward((node) => node.attr("style", withStyle(node.elementAttrs.style, arrowStyle))))

    const viewport = p.part("div", (b) =>
      b.attrs({
        "data-menu-viewport": "",
        "data-activation-direction": model.direction ?? undefined,
        "data-transitioning": flag(model.transitioning),
        "data-instant": instant
      })
        .forward((node) => {
          const built = View.build(node, [])
          const current = new Html.Element<never>("div").key("current-" + (activeTrigger ?? "")).attr(
            "data-current",
            ""
          )
          return { ...built, children: [View.build(current, built.children as ReadonlyArray<View.Node<never>>)] }
        }))

    const itemAttrs = <H extends HTMLElement, T extends "div" | "a">(
      b: Html.Element<MenuMessage, never, Html.Events, H, T>,
      value: string,
      role: string,
      action: ItemAction
    ) => {
      const item = itemOf(value)
      const shownItem = matches === null || visible.has(item)
      const active = highlighted === value
      const off = item.disabled === true || disabled
      const submenuOpen = model.submenus.some((submenu) => submenu.open && submenu.item === value)
      const own = b
        .attrs({
          id: itemId(value),
          role,
          "aria-disabled": off ? "true" : undefined,
          tabindex: open && !filtering && (active || submenuOpen) ? "0" : "-1",
          "data-highlighted": flag(active),
          "data-disabled": flag(off),
          hidden: flag(!shownItem),
          "data-menu-item": value
        })
        .on("mouseenter", () => hovers && !active ? MenuMessage.EnteredItem({ value }) : undefined)
        .on("mouseleave", () => hovers ? MenuMessage.LeftItem() : undefined)
        .on("mousedown", MenuMessage.PressedItem())
        .on(
          "mouseup",
          ({ pointerType }) => pointerType === "touch" ? undefined : MenuMessage.ReleasedItem({ action, pointerType })
        )
        .onClick(({ pointerType }) => MenuMessage.ClickedItem({ action, pointerType }))
        .onKeyDown(keyMessage(action), { preventDefault: true })
        .onKeyUp(({ key }) => key === " " ? MenuMessage.ReleasedSpace({ action }) : undefined)
      return shownItem ? own : own.forward((node) => node.attr("style", withStyle(node.elementAttrs.style, hiddenBox)))
    }

    const checkedAttrs = <B extends Attributed<B>>(builder: B, checked: boolean): B =>
      builder
        .attrs({
          "aria-checked": String(checked),
          "data-checked": flag(checked),
          "data-unchecked": flag(!checked)
        })

    const item = keyed(
      p.part(
        "div",
        (b, value: string, closeOnClick?: boolean) =>
          itemAttrs(b, value, "menuitem", { value, kind: "item", closeOnClick: closeOnClick ?? true, checked: false })
      )
    )

    const linkItem = keyed(
      p.part(
        "a",
        (b, value: string, closeOnClick?: boolean) =>
          itemAttrs(b, value, "menuitem", { value, kind: "link", closeOnClick: closeOnClick ?? false, checked: false })
      )
    )

    const checkboxItem = keyed(
      p.part("div", (b, value: string, checked: boolean, closeOnClick?: boolean) => {
        checks.set(value, checked)
        return checkedAttrs(
          itemAttrs(b, value, "menuitemcheckbox", {
            value,
            kind: "checkbox",
            closeOnClick: closeOnClick ?? false,
            checked
          }),
          checked
        )
      })
    )

    const radioGroup = p.part("div", (b, value: string | null) => {
      radio = value
      return b.attrs({ role: "group", "data-disabled": flag(disabled) })
    })

    const radioItem = keyed(
      p.part("div", (b, value: string, closeOnClick?: boolean) => {
        const checked = radio === value
        checks.set(value, checked)
        return checkedAttrs(
          itemAttrs(b, value, "menuitemradio", { value, kind: "radio", closeOnClick: closeOnClick ?? false, checked }),
          checked
        )
      })
    )

    const indicator = () => {
      const part = p.part(
        "span",
        (b, value: string) =>
          checkedAttrs(b.attr("aria-hidden", "true"), checks.get(value) === true)
            .attr("data-disabled", flag(itemOf(value).disabled === true || disabled))
      )
      return View.wrapPart(
        part,
        <B extends View.PartTarget<"span">>(
          element: B,
          value: string,
          keepMounted?: boolean
        ): ReturnType<B["attr"]> | undefined =>
          checks.get(itemOf(value).value) === true || keepMounted === true ? part(element, value) : undefined
      )
    }

    const group = p.part("div", (b, key: string) =>
      b.attrs({ role: "group", "aria-labelledby": groupLabelId(key) })
        .forward((node) => matches === null || hasShownItem(View.build(node, [])) ? node : node.attr("hidden", "")))
    const groupLabel = p.part("div", (b, key: string) => b.attr("id", groupLabelId(key)))
    const separator = p.part("div", (b) => separatorAttrs(b, "horizontal"))

    const input = p.part("input", (b) => {
      inputDrawn = true
      const query = props.query ?? ""
      return b
        .attrs({
          id: inputId,
          type: "text",
          role: "searchbox",
          inputmode: "search",
          autocomplete: "off",
          spellcheck: "false",
          autocorrect: "off",
          autocapitalize: "none",
          "aria-activedescendant": highlighted !== null && items.has(highlighted) ? itemId(highlighted) : undefined,
          "aria-controls": listId,
          "data-highlighted": flag(model.inputFocused && (!model.keyboard || highlighted === null)),
          value: query
        })
        .value(query)
        .disabled(disabled)
        .on("input", ({ value }) => MenuMessage.ChangedInput({ value }))
        .onKeyDown(({ alt, composing, ctrl, key, meta, shift }) =>
          composing ? undefined : MenuMessage.PressedInputKey({ key, modified: alt || ctrl || meta || shift })
        )
        .on("mousedown", MenuMessage.PressedInput())
        .onFocus(MenuMessage.FocusedInput())
        .onBlur(MenuMessage.BlurredInput())
    })

    const clearPart = p.part("button", (b) =>
      b.attrs({
        type: "button",
        tabindex: "-1",
        "aria-hidden": "true",
        "data-disabled": flag(disabled)
      })
        .disabled(disabled)
        .on("mousedown", MenuMessage.PressedInput(), { preventDefault: "always" })
        .onClick(MenuMessage.ClickedClear()))
    const clear = View.wrapPart(
      clearPart,
      <B extends View.PartTarget<"button">>(element: B): ReturnType<B["attr"]> | undefined =>
        (props.query ?? "") === "" ? undefined : clearPart(element)
    )

    const emptyPart = p.part(
      "div",
      (b) => b.attrs({ role: "status", "aria-live": "polite", "aria-atomic": "true" })
    )
    const emptyState = View.wrapPart(
      emptyPart,
      <B extends View.PartTarget<"div">>(element: B): ReturnType<B["attr"]> | undefined =>
        empty ? emptyPart(element) : undefined
    )

    const finalFocus = p.part((b) => b.attr("data-final-focus", popupId))

    return {
      open,
      mounted: shown,
      transitionStatus,
      nested,
      side,
      align,
      highlighted,
      openMethod: open ? openMethod : null,
      transitioning: model.transitioning,
      activationDirection: model.direction,
      nothingMatches: empty,
      trigger,
      contextTrigger,
      submenuTrigger,
      backdrop,
      positioner,
      popup,
      list,
      arrow,
      viewport,
      item,
      linkItem,
      checkboxItem,
      checkboxItemIndicator: indicator(),
      radioGroup,
      radioItem,
      radioItemIndicator: indicator(),
      group,
      groupLabel,
      separator,
      input,
      clear,
      empty: emptyState,
      finalFocus
    }
  }
})

const hasShownItem = (node: View.Element<any, any>): boolean =>
  node.children.some((child) =>
    child._tag === "Element" &&
    ((child.attrs.role?.startsWith("menuitem") === true && child.attrs.hidden === undefined) || hasShownItem(child))
  )
