/**
 * A navigation landmark whose triggers open panels of links, shown one at a
 * time in a shared popup next to the trigger.
 *
 * `NavigationMenu` is headless: it owns the ARIA and data attributes, the
 * arrow keys, the hover timing, dismissal, the popup's place in the top
 * layer and its position, and the consumer draws the markup. The consumer
 * owns which item is open, passes it as `value`, and stores what the
 * `RequestedOpen` and `RequestedClose` events ask for. A list with links
 * only needs none of this: `NavigationLinks` is the same list without
 * panels, at a fraction of the size.
 *
 * Each trigger is a disclosure button: `aria-expanded` says whether its
 * panel is open, `aria-controls` names the popup while it is, and focus
 * stays on the trigger as the panel opens. The panel holds ordinary links,
 * not menu items.
 *
 * **Anatomy**
 *
 * | Part         | Element                                              |
 * | :----------- | :--------------------------------------------------- |
 * | `root`       | `<nav>`                                              |
 * | `list`       | `<ul>` inside the root                               |
 * | `item`       | `<li>` inside the list                               |
 * | `trigger`    | `<button>` in an item, that opens its panel          |
 * | `link`       | `<a>` in an item or a panel                          |
 * | `portal`     | `<div>` in the top layer, around the parts below     |
 * | `positioner` | `<div>` placed next to the open trigger              |
 * | `popup`      | `<div>` around the panel                             |
 * | `viewport`   | `<div>` around the open item's panel                 |
 * | `arrow`      | `<div>` that points at the trigger                   |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, and the consumer adds the children. `trigger` takes
 * `{ element, value, disabled }` and `link` takes
 * `{ element, active, closeOnClick }`. The portal returns `undefined` while
 * no panel shows. Draw the portal inside the root, after the list, and the
 * open item's panel inside the viewport: `navigationMenu.value` is the item
 * it shows, which stays the last one through the exit transition. `arrow`
 * is optional.
 *
 * The portal is shown as a manual popover, so the popup sits in the top
 * layer, at the document's origin, or at the viewport's corner with
 * `positionMethod: "fixed"`. With `topLayer: false`, it renders in place,
 * `hidden` while closed. The positioner's inline style carries `left`,
 * `top` and the variables `Positioning` describes. `sideOffset` is padding
 * on the positioner's side facing the trigger, so the pointer can cross the
 * gap. The viewport sizes the popup as the panel changes, as `PreviewCard`'s
 * viewport does: `--positioner-width` and `--positioner-height` on the
 * positioner, `--popup-width` and `--popup-height` on the popup, and
 * `data-activation-direction` on the viewport while it moves between
 * triggers.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent, except the ones with a value:
 *
 * - `trigger`: `data-popup-open` while its panel is open, `data-disabled`
 * - `link`: `data-active` on the active link
 * - `positioner`: `data-open` / `data-closed`, `data-side`, `data-align`,
 *   `data-anchor-hidden`
 * - `popup`: `data-open` / `data-closed`, `data-starting-style`,
 *   `data-ending-style`, `data-side`, `data-align`
 * - `viewport`: `data-transitioning`, `data-activation-direction`
 * - `arrow`: `data-open` / `data-closed`, `data-side`, `data-align`,
 *   `data-uncentered`
 *
 * The popup stays shown until its own transitions and animations finish,
 * then closes and emits `Settled`.
 *
 * **Keyboard**
 *
 * Triggers and links share the list's arrow keys, as in `NavigationLinks`:
 * Right and Left in a horizontal menu, swapped when it is right-to-left, and
 * Down and Up in a vertical one. Enter and Space press a trigger. Down opens
 * the focused trigger's panel in a horizontal menu, and Right in a vertical
 * one, or Left when it is right-to-left. Focus stays on the trigger.
 *
 * The popup is drawn after the list, so Tab takes the panel's stops as if
 * they followed the open trigger: Tab from the trigger goes to the panel's
 * first stop, Shift+Tab from there back to the trigger, Tab from the panel's
 * last stop to what follows the trigger and asks to close, with
 * `focus-out`, and Shift+Tab from there into the panel. Tab from anywhere
 * else skips the panel. A panel with no stop leaves Tab to the browser.
 *
 * Escape asks to close, wherever focus is, and with focus in the panel focus
 * goes back to the trigger as the close starts. A press outside the root and
 * the popup asks to close, and so does focus leaving both. Neither moves
 * focus. The popup is `inert` through its exit.
 *
 * **Hover**
 *
 * The mouse resting on a trigger for `delay` milliseconds, 50 by default,
 * asks to open its panel. While a panel is open, hovering another trigger
 * switches to it at once. A panel opened by hover asks to close
 * `closeDelay` milliseconds, 50 by default, after the pointer leaves the
 * triggers and the popup, and a press on its trigger within 500 milliseconds
 * of the hover keeps it open. A touch never opens a panel by hover.
 *
 * **Limits**
 *
 * - There are no submenus, no arrow keys inside a panel, and the panels
 *   other than the open one aren't in the page.
 *
 * **Example** (A header with a Products panel and a plain Docs link)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { NavigationMenu } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const HeaderMessage = UiSchema.TaggedEnum({
 *   RequestedOpenNav: { value: Schema.String },
 *   RequestedCloseNav: {}
 * })
 *
 * const Header = Html.component({
 *   name: "Header",
 *   model: Schema.Struct({ nav: Schema.NullOr(Schema.String) }),
 *   message: HeaderMessage
 * }).make({
 *   init: () => ({ nav: "products" }),
 *   update: {
 *     RequestedOpenNav: ($, { value }) => ({ nav: value }),
 *     RequestedCloseNav: () => ({ nav: null })
 *   },
 *   view: (h, model) =>
 *     NavigationMenu(h, {
 *       props: { value: model.nav, sideOffset: 8 },
 *       onEmit: {
 *         RequestedOpen: ({ value }) => HeaderMessage.RequestedOpenNav({ value }),
 *         RequestedClose: () => HeaderMessage.RequestedCloseNav(),
 *         Settled: () => undefined
 *       },
 *       view: (navigationMenu) =>
 *         navigationMenu.root(h.nav.attr("aria-label", "Main")).children(
 *           navigationMenu.list(h.ul).children(
 *             navigationMenu.item(h.li).children(
 *               navigationMenu.trigger({ element: h.button, value: "products" }).children("Products")
 *             ),
 *             navigationMenu.item(h.li).children(
 *               navigationMenu.link({ element: h.a.attr("href", "/docs") }).children("Docs")
 *             )
 *           ),
 *           navigationMenu.portal(h.div)?.children(
 *             navigationMenu.positioner(h.div).children(
 *               navigationMenu.popup(h.div.class("panel")).children(
 *                 navigationMenu.viewport(h.div).children(
 *                   navigationMenu.value === "products" &&
 *                     h.a.attr("href", "/products/ui").children("UI")
 *                 )
 *               )
 *             )
 *           )
 *         )
 *     })
 * })
 *
 * // The open trigger controls the popup, whose links are plain links.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Header, {}))
 * const controls = /<button[^>]* aria-expanded="true"[^>]* aria-controls="([^"]+)"[^>]*>Products/.exec(html)
 * if (controls === null) throw new Error("Products doesn't control an open panel")
 * if (!html.includes(`id="${controls[1]}"`)) throw new Error("the controlled popup is missing")
 * if (html.includes("role=\"menuitem\"")) throw new Error("a panel link is a menu item")
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import type * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as UiSchema from "@effect/ui/UiSchema"
import * as UiStruct from "@effect/ui/UiStruct"
import * as View from "@effect/ui/View"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { DirectionProvider } from "./DirectionProvider.ts"
import {
  type Attributed,
  attrSelector,
  flag,
  type Keyed,
  ownStyle
} from "./internal/attributes.ts"
import { provided } from "./internal/direction.ts"
import {
  activeOf,
  elementOf,
  isHTMLElement,
  tabStopsIn
} from "./internal/dom.ts"
import { watchHoverArea } from "./internal/hoverArea.ts"
import { onEscape } from "./internal/interaction.ts"
import {
  itemAttribute,
  linkAttrs,
  makeTrackArrowKeys,
  opensPanel
} from "./internal/navigation.ts"
import { listenOutside } from "./internal/outside.ts"
import { makeTrackPresence } from "./internal/presence.ts"
import { layered, portalStyle } from "./internal/topLayer.ts"
import {
  statusOf,
  transitionAttrs,
  type TransitionStatus
} from "./internal/transition.ts"
import {
  stepViewport,
  TrackViewport,
  ViewportChange,
  viewportContent,
  ViewportTransition
} from "./internal/viewport.ts"
import * as Positioning from "./Positioning.ts"

/**
 * Controls which item's panel is open, how the menu runs, and where the
 * popup appears.
 *
 * **Details**
 *
 * - `value`: the `value` of the trigger whose panel is open, or `null`.
 *   Required: the consumer owns it.
 * - `orientation`: `"horizontal"` by default, where Right and Left move
 *   focus and Down opens a panel. `"vertical"` uses Down and Up, and Right.
 * - `delay`: milliseconds the mouse rests on a trigger before its panel
 *   opens, 50 by default.
 * - `closeDelay`: milliseconds after the pointer leaves the triggers and the
 *   popup before a panel opened by hover closes, 50 by default.
 * - `side`, `align`, `sideOffset`, `alignOffset`, `collisionAvoidance`,
 *   `collisionBoundary`, `collisionPadding`, `sticky`, `arrowPadding`,
 *   `disableAnchorTracking`, `positionMethod`, `anchor` and `topLayer`: as
 *   `Positioning` describes them. The popup shows below the trigger by
 *   default.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const NavigationMenuProps = Schema.Struct({
  value: Schema.NullOr(Schema.String),
  orientation: Schema.optional(Schema.Literals(["horizontal", "vertical"])),
  delay: Schema.optional(Schema.Number),
  closeDelay: Schema.optional(Schema.Number),
  ...Positioning.PositionerFields
})

/**
 * The props of a `NavigationMenu`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NavigationMenuProps = typeof NavigationMenuProps.Type

/**
 * Why a navigation menu asks to open a panel: a press on its trigger, the
 * mouse resting on it, or the key that opens it.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const NavigationMenuOpenReason = Schema.Literals([
  "trigger-press",
  "trigger-hover",
  "list-navigation"
])

/**
 * Why a navigation menu asks to open a panel.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NavigationMenuOpenReason = typeof NavigationMenuOpenReason.Type

/**
 * Why a navigation menu asks to close: a second press on the trigger, the
 * pointer leaving a panel opened by hover, a press outside, Escape, focus
 * leaving, or a press on a link with `closeOnClick`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const NavigationMenuDismissReason = Schema.Literals([
  "trigger-press",
  "trigger-hover",
  "outside-press",
  "escape-key",
  "focus-out",
  "link-press"
])

/**
 * Why a navigation menu asks to close.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NavigationMenuDismissReason =
  typeof NavigationMenuDismissReason.Type

/**
 * `RequestedOpen` asks for the panel of the trigger with `value` to open,
 * with the reason. It is also emitted while another panel is open.
 * `RequestedClose` asks for the open panel to close, with the reason. The
 * consumer decides whether to change `value`. `Settled` reports that the
 * transitions and animations of an open or a close finished.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const NavigationMenuEvents = UiSchema.TaggedEnum({
  RequestedOpen: { value: Schema.String, reason: NavigationMenuOpenReason },
  RequestedClose: { reason: NavigationMenuDismissReason },
  Settled: { open: Schema.Boolean }
})

/**
 * What a `NavigationMenu` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NavigationMenuEvents = typeof NavigationMenuEvents.Type

/**
 * Where a navigation menu's popup is in its transitions: `"starting"` for
 * the first frame after it opens, `"ending"` while it closes, `null`
 * otherwise.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type NavigationMenuTransitionStatus = TransitionStatus

const NavigationMenuMessage = UiSchema.TaggedEnum({
  EnteredTrigger: { value: Schema.String },
  LeftTrigger: {},
  TouchedTrigger: {},
  PressedTrigger: { value: Schema.String },
  PressedOpenKey: { value: Schema.String },
  PressedLink: {},
  LeftHoverArea: {},
  ReturnedToHoverArea: {},
  PressedOutside: {},
  PressedEscape: {},
  FocusedOutside: {},
  ShowedValue: { value: Schema.String },
  CompletedWaitBeforeOpening: { value: Schema.String },
  CompletedWaitBeforeClosing: {},
  CompletedPatience: {},
  ShowedPortal: {},
  RenderedFirstFrame: {},
  FinishedTransition: { open: Schema.Boolean },
  ChangedViewport: { change: ViewportChange },
  ChangedPlacement: { placement: Positioning.Placement }
})

type NavigationMenuMessage = typeof NavigationMenuMessage.Type

const NavigationMenuModel = Schema.Struct({
  touched: Schema.Boolean,
  away: Schema.Boolean,
  request: Schema.NullOr(Schema.Struct({
    value: Schema.String,
    reason: NavigationMenuOpenReason
  })),
  reason: Schema.NullOr(NavigationMenuOpenReason),
  patient: Schema.Boolean,
  // Whether the close being shown returns focus to the trigger.
  restoreFocus: Schema.Boolean,
  value: Schema.NullOr(Schema.String),
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  transition: Schema.NullOr(ViewportTransition),
  placement: Schema.NullOr(Positioning.Placement)
})

type NavigationMenuModel = typeof NavigationMenuModel.Type

type NavigationMenuUpdate = Component.Update<
  NavigationMenuModel,
  NavigationMenuMessage,
  NavigationMenuEvents,
  NavigationMenuProps
>

const sleep = (delay: number) => Effect.sleep(Duration.millis(delay))

const wait = <M>(name: string, message: M) =>
  Command.make(
    name,
    { args: { delay: Schema.Number }, mode: "switch" },
    ({ delay }) => Effect.as(sleep(delay), message)
  )

const WaitBeforeOpening = Command.make(
  "WaitBeforeOpening",
  { args: { delay: Schema.Number, value: Schema.String }, mode: "switch" },
  ({ delay, value }) =>
    Effect.as(
      sleep(delay),
      NavigationMenuMessage.CompletedWaitBeforeOpening({ value })
    )
)

const WaitBeforeClosing = wait(
  "WaitBeforeClosing",
  NavigationMenuMessage.CompletedWaitBeforeClosing()
)

// A press this soon after a hover opened the panel keeps it open.
const WaitPatience = wait(
  "WaitPatience",
  NavigationMenuMessage.CompletedPatience()
)

const escape = onEscape(NavigationMenuMessage.PressedEscape())

const TrackNavigationMenuPresence = makeTrackPresence<NavigationMenuMessage>(
  "TrackNavigationMenuPresence",
  {
    showed: NavigationMenuMessage.ShowedPortal,
    started: NavigationMenuMessage.RenderedFirstFrame,
    finished: (open) => NavigationMenuMessage.FinishedTransition({ open })
  }
)

// The open panel's reason, and the press guard after a hover opened it.
const opened = (
  model: NavigationMenuModel,
  $: NavigationMenuUpdate,
  reason: NavigationMenuOpenReason | null
) =>
  $.set(model).evolve({
    request: null,
    reason,
    patient: reason === "trigger-hover"
  }).run(
    reason === "trigger-hover"
      ? WaitPatience.make({ delay: 500 })
      : Command.interrupt(WaitPatience)
  )

// A request for another panel is held until `value` shows the consumer took
// it, so a turned-down switch leaves the open panel as it was.
const openFor = (
  model: NavigationMenuModel,
  $: NavigationMenuUpdate,
  value: string,
  reason: NavigationMenuOpenReason
) => {
  const next = UiStruct.evolve(model, {
    restoreFocus: false,
    transition: $.props.value === null ? null : model.transition
  })
  return ($.props.value === value
    ? opened(next, $, reason)
    : $.set(next).evolve({ request: { value, reason } })).run(
      Command.interrupt(WaitBeforeOpening),
      Command.interrupt(WaitBeforeClosing)
    ).emit(NavigationMenuEvents.RequestedOpen({ value, reason }))
}

const dismiss = (
  $: NavigationMenuUpdate,
  reason: NavigationMenuDismissReason
) =>
  $.props.value === null
    ? $.model
    : $.evolve({ restoreFocus: reason === "escape-key", request: null }).run(
      Command.interrupt(WaitBeforeClosing)
    ).emit(NavigationMenuEvents.RequestedClose({ reason }))

// The popup shows `value`, so a request the consumer took applies.
const showed = (
  model: NavigationMenuModel,
  $: NavigationMenuUpdate,
  value: string
) =>
  opened(
    UiStruct.evolve(model, { value }),
    $,
    model.request?.value === value ? model.request.reason : null
  )

const triggerAttribute = "data-navigation-menu-trigger"

const triggersOf = (scope: string) =>
  attrSelector(itemAttribute, scope) + `[${triggerAttribute}]`

const triggerOf = (scope: string, value: string) =>
  attrSelector(itemAttribute, scope) + attrSelector(triggerAttribute, value)

const rootAttribute = "data-navigation-menu"

// The open key on a trigger whose panel is closed asks to open it.
const TrackNavigationList = makeTrackArrowKeys(
  "TrackNavigationList",
  (list, event, keys) => {
    if (event.defaultPrevented || !opensPanel(list, event, keys)) return
    const trigger = elementOf(event.target)?.closest(triggersOf(keys.scope))
    const value = trigger?.getAttribute(triggerAttribute)
    if (value == null || trigger!.getAttribute("aria-expanded") === "true") {
      return
    }
    event.preventDefault()
    return NavigationMenuMessage.PressedOpenKey({ value })
  }
)

const TrackPanelArgs = Schema.Struct({
  position: Positioning.TrackPositionArgs,
  scope: Schema.String,
  value: Schema.String
})

type TrackPanelArgs = typeof TrackPanelArgs.Type

// Tab goes through the page with the panel just after its trigger, though
// the popup is drawn after the list. Returns whether Tab left the panel
// past its end, which closes it.
const bridgeTab = (
  node: HTMLElement,
  trigger: HTMLElement,
  event: KeyboardEvent
): boolean => {
  const page = tabStopsIn(node.ownerDocument.body)
  const panel = page.filter((stop) => node.contains(stop))
  const outside = page.filter((stop) => !node.contains(stop))
  const after = outside.indexOf(trigger) + 1
  const focused = activeOf(node.ownerDocument)
  if (panel.length === 0 || after === 0 || !isHTMLElement(focused)) {
    return false
  }
  const order = [...outside.slice(0, after), ...panel, ...outside.slice(after)]
  const step = event.shiftKey ? -1 : 1
  const at = order.indexOf(focused)
  const next = at === -1 ? undefined : order[at + step]
  const native = page[page.indexOf(focused) + step]
  if (next === undefined) {
    // Tab leaves the page, but the browser would step into the panel first,
    // so the panel is inert until the key's default action has run.
    if (native !== undefined && node.contains(native) && !node.inert) {
      node.inert = true
      setTimeout(() => {
        node.inert = false
      }, 0)
    }
    return false
  }
  if (next !== native) {
    event.preventDefault()
    next.focus()
  }
  return !event.shiftKey && node.contains(focused) && !node.contains(next)
}

const watchPanel = (
  node: HTMLElement,
  args: TrackPanelArgs,
  changes: Stream.Stream<TrackPanelArgs>
) =>
  Stream.callback<NavigationMenuMessage>((queue) => {
    const document = node.ownerDocument
    let current = args
    const send = (message: NavigationMenuMessage) => {
      Queue.offerUnsafe(queue, message)
    }
    // The portal is drawn inside the root.
    const root = node.closest(attrSelector(rootAttribute, args.scope)) ?? node
    const triggers = triggersOf(args.scope)
    const inside = (target: EventTarget | null) => {
      const element = elementOf(target)
      return element !== null && root.contains(element)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Tab" || event.defaultPrevented || event.ctrlKey ||
        event.altKey || event.metaKey
      ) return
      const trigger = root.querySelector<HTMLElement>(
        triggerOf(current.scope, current.value)
      )
      // Focus leaving the root closes the panel already.
      if (
        trigger !== null && bridgeTab(node, trigger, event) &&
        inside(document.activeElement)
      ) send(NavigationMenuMessage.FocusedOutside())
    }
    const controller = new AbortController()
    const { signal } = controller
    return Effect.acquireRelease(
      Effect.sync(() => {
        listenOutside(document, signal, {
          open: () => true,
          inside,
          pressed: () => send(NavigationMenuMessage.PressedOutside()),
          left: () => send(NavigationMenuMessage.FocusedOutside())
        })
        document.addEventListener("keydown", onKeyDown, { signal })
        watchHoverArea(node, signal, () => triggers, (away) =>
          send(
            away
              ? NavigationMenuMessage.LeftHoverArea()
              : NavigationMenuMessage.ReturnedToHoverArea()
          ))
      }).pipe(
        Effect.tap(() =>
          Effect.forkScoped(Stream.runForEach(changes, (next) =>
            Effect.sync(() => {
              if (next.value !== current.value) {
                send(NavigationMenuMessage.ShowedValue({ value: next.value }))
              }
              current = next
            })))
        )
      ),
      () =>
        Effect.sync(() => controller.abort())
    )
  })

const TrackNavigationPanel = Mount.makeStream(
  "TrackNavigationPanel",
  { args: TrackPanelArgs },
  (node: HTMLElement, args, changes) =>
    Stream.merge(
      watchPanel(node, args, changes),
      Positioning.trackPosition(
        node,
        args.position,
        Stream.map(changes, (next) => next.position)
      ).pipe(
        Stream.map((placement) =>
          NavigationMenuMessage.ChangedPlacement({ placement })
        )
      )
    )
)

/**
 * A headless navigation menu with panels. Call it with the consumer's `h`
 * and a `view` closure that draws the root, the list and its items with
 * triggers and links, and the portal with the parts inside it.
 *
 * **Details**
 *
 * `trigger({ element, value, disabled })` returns `element`: `value` names
 * the item, and is what `RequestedOpen` carries and `value` takes.
 * `link({ element, active, closeOnClick })` returns `element`: `active`
 * marks the link to the page being shown, as in `NavigationLinks`, and
 * `closeOnClick` asks to close the open panel, with `link-press`, when the
 * link is pressed, without returning focus to the trigger. Both are `false` when left
 * out.
 *
 * The parts also return plain values for markup that depends on them:
 * `value`, the item the popup shows, through its exit transition; `open`;
 * `mounted`, whether the popup shows; `transitionStatus`; `openReason`;
 * and `side` and `align`, where the popup is.
 *
 * Each part's attributes win over the ones the consumer set on the builder
 * it passes in, including the ones a state leaves absent: `type`,
 * `disabled`, `aria-expanded` and `aria-disabled` on the trigger;
 * `aria-current` on the link; `popover` or `hidden` on the portal; `id`
 * and `role` on the positioner; `id` on the popup; `id` and
 * `aria-hidden` on the arrow; the data attributes on every part; and
 * `data-navigation-item` and `data-navigation-menu-trigger`, which the list
 * tells its triggers and links by, and `data-navigation-menu`, which the
 * root is found by. The trigger adds the popup's id to the consumer's
 * `aria-controls` while its panel is open. The viewport's children are
 * drawn inside its `data-current` container. The portal's box and the positioner's and the
 * arrow's position are added after the consumer's inline style. A handler
 * the consumer adds to a part runs after the menu's own.
 *
 * Two menus under one parent each need a `key`.
 *
 * It emits `RequestedOpen`, `RequestedClose` and `Settled`.
 *
 * On the server and on a host that doesn't run mounts, an open panel
 * renders, but isn't placed.
 *
 * History restore saves nothing of it: after Back, forward or a reload it
 * starts from `init`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const NavigationMenu = Html.component({
  name: "NavigationMenu",
  props: NavigationMenuProps,
  model: NavigationMenuModel,
  message: NavigationMenuMessage,
  events: NavigationMenuEvents,
  reads: {
    provider: { owner: DirectionProvider, optional: true }
  },
  restore: false
}).make({
  init: () => ({
    touched: false,
    away: true,
    request: null,
    reason: null,
    patient: false,
    restoreFocus: false,
    value: null,
    mounted: false,
    started: false,
    transition: null,
    placement: null
  }),
  update: {
    EnteredTrigger: ($, { value }) => {
      const next = UiStruct.evolve($.model, { away: false })
      if ($.props.value === null) {
        return next.touched ? next : $.set(next).run(
          WaitBeforeOpening.make({ delay: $.props.delay ?? 50, value })
        )
      }
      return $.props.value === value || next.touched
        ? $.set(next).run(Command.interrupt(WaitBeforeClosing))
        : openFor(next, $, value, "trigger-hover")
    },
    LeftTrigger: ($) =>
      $.evolve({ touched: false }).run(
        Command.interrupt(WaitBeforeOpening)
      ),
    TouchedTrigger: ($) =>
      $.evolve({ touched: true }).run(Command.interrupt(WaitBeforeOpening)),
    PressedTrigger: ($, { value }) =>
      $.props.value === value && !$.model.patient
        ? dismiss($, "trigger-press")
        : openFor($.model, $, value, "trigger-press"),
    PressedOpenKey: ($, { value }) =>
      openFor($.model, $, value, "list-navigation"),
    PressedLink: ($) => dismiss($, "link-press"),
    LeftHoverArea: ($) => {
      const next = UiStruct.evolve($.model, { away: true })
      return $.props.value !== null && next.reason === "trigger-hover"
        ? $.set(next).run(
          WaitBeforeClosing.make({ delay: $.props.closeDelay ?? 50 })
        )
        : next
    },
    ReturnedToHoverArea: ($) =>
      $.evolve({ away: false }).run(Command.interrupt(WaitBeforeClosing)),
    PressedOutside: ($) => dismiss($, "outside-press"),
    PressedEscape: ($) => dismiss($, "escape-key"),
    FocusedOutside: ($) => dismiss($, "focus-out"),
    ShowedValue: ($, { value }) => showed($.model, $, value),
    CompletedWaitBeforeOpening: ($, { value }) =>
      $.props.value === null && !$.model.touched
        ? openFor($.model, $, value, "trigger-hover")
        : $.model,
    CompletedWaitBeforeClosing: ($) =>
      $.model.away && $.model.reason === "trigger-hover"
        ? dismiss($, "trigger-hover")
        : $.model,
    CompletedPatience: ($) => $.evolve({ patient: false }),
    ShowedPortal: ($) =>
      $.props.value === null
        ? $.evolve({ mounted: true })
        : showed(
          UiStruct.evolve($.model, { mounted: true, restoreFocus: false }),
          $,
          $.props.value
        ),
    RenderedFirstFrame: ($) =>
      $.props.value === null ? $.model : $.evolve({ started: true }),
    FinishedTransition: ($, { open }) => {
      if (open !== ($.props.value !== null)) return $.model
      if (open) return $.emit(NavigationMenuEvents.Settled({ open }))
      return $.model.mounted
        ? $.evolve({ mounted: false, started: false, transition: null }).emit(
          NavigationMenuEvents.Settled({ open })
        )
        : $.model
    },
    ChangedViewport: ($, { change }) =>
      stepViewport($.model, change, $.props.value !== null),
    ChangedPlacement: ($, { placement }) => $.evolve({ placement })
  },
  subscriptions: ({ props }) => props.value === null ? [] : [escape],
  parts: (p, model) => {
    const props = p.props
    const open = props.value !== null
    const shown = open || model.mounted
    const value = props.value ?? (shown ? model.value : null)
    const transitionStatus: NavigationMenuTransitionStatus = statusOf(model, {
      open
    })
    const scope = p.id("menu")
    const positionerId = p.id("positioner")
    const popupId = p.id("popup")
    const arrowId = p.id("arrow")
    const placement = model.placement
    const triggerSelector = value === null
      ? triggersOf(scope)
      : triggerOf(scope, value)
    const tracked = Positioning.trackArgs(props, {
      side: "bottom",
      anchorSelector: triggerSelector,
      arrowId,
      offsetAsPadding: true
    })
    const side = placement?.side ?? tracked.options.side
    const align = placement?.align ?? tracked.options.align
    const transition = open ? model.transition : null

    const placed = <B extends Attributed<B>>(builder: B): B =>
      builder.attrs({ "data-side": side, "data-align": align })
    const states = <B extends Attributed<B>>(builder: B): B =>
      placed(builder).attrs({
        "data-open": flag(open),
        "data-closed": flag(!open)
      })

    const triggerPart = p.part(
      "button",
      (b, item: string, disabled: boolean) => {
        const expanded = props.value === item
        const button = b
          .attrs({
            type: "button",
            "aria-expanded": String(expanded),
            "aria-controls": expanded ? popupId : undefined,
            "aria-disabled": undefined,
            "data-popup-open": flag(expanded),
            "data-disabled": flag(disabled),
            [itemAttribute]: scope,
            [triggerAttribute]: item
          })
          .disabled(disabled)
        return disabled ? button : button
          .on("click", NavigationMenuMessage.PressedTrigger({ value: item }))
          .on("pointerdown", ({ pointerType }) =>
            pointerType === "mouse"
              ? undefined
              : NavigationMenuMessage.TouchedTrigger())
          .on(
            "mouseenter",
            NavigationMenuMessage.EnteredTrigger({ value: item })
          )
          .on("mouseleave", NavigationMenuMessage.LeftTrigger())
      }
    )
    const trigger = View.wrapPart(
      triggerPart,
      <B extends View.PartTarget<"button">>(options: {
        /** The trigger's element. */
        readonly element: B
        /** The item the trigger opens, as `RequestedOpen` reports it. */
        readonly value: string
        /** Whether the trigger ignores presses, hover and focus. */
        readonly disabled?: boolean | undefined
      }): ReturnType<B["attr"]> =>
        triggerPart(options.element, options.value, options.disabled === true)
    )

    const linkPart = p.part("a", (b, active: boolean, close: boolean) => {
      const link = linkAttrs(b, scope, active)
      return close
        ? link.on("click", NavigationMenuMessage.PressedLink())
        : link
    })
    const link = View.wrapPart(
      linkPart,
      <B extends View.PartTarget<"a">>(options: {
        /** The link's element. */
        readonly element: B
        /** Whether the link is to the page being shown. */
        readonly active?: boolean | undefined
        /** Whether a press on the link asks to close the open panel. */
        readonly closeOnClick?: boolean | undefined
      }): ReturnType<B["attr"]> =>
        linkPart(
          options.element,
          options.active === true,
          options.closeOnClick === true
        )
    )

    const topLayer = tracked.topLayer !== false
    const portalBox = portalStyle(topLayer, tracked.positionMethod)
    // Drawn only while it shows.
    const portalPart = p.part(
      "div",
      (b) =>
        layered(b, topLayer, true).forward(ownStyle(portalBox)).onMount(
          TrackNavigationMenuPresence({
            open,
            mounted: model.mounted,
            started: model.started,
            holdExit: false,
            popupId,
            trigger: triggerSelector,
            restore: model.restoreFocus
          })
        )
    )
    const portal = View.wrapPart(
      portalPart,
      <B extends View.PartTarget<"div">>(
        element: B
      ): ReturnType<B["attr"]> | undefined =>
        shown ? portalPart(element) : undefined
    )

    const positionerStyle = Positioning.positionerStyle(tracked.positionMethod)
    const positionerPart = p.part("div", (b) => {
      const decorated = states(b)
        .attrs({
          id: positionerId,
          role: "presentation",
          "data-anchor-hidden": flag(open && placement?.anchorHidden)
        })
        .forward(ownStyle(positionerStyle))
      return props.value === null ? decorated : decorated.onMount(
        TrackNavigationPanel({ position: tracked, scope, value: props.value })
      )
    })
    const positioner = View.wrapPart(
      positionerPart,
      <B extends Keyed<"div">>(element: B): ReturnType<B["attr"]> =>
        positionerPart(element.key(positionerId))
    )

    const popup = p.part(
      "div",
      (b) =>
        transitionAttrs(placed(b), open, transitionStatus).attr("id", popupId)
    )

    const arrowStyle = Positioning.arrowStyle(side)
    const arrow = p.part("div", (b) =>
      states(b)
        .attrs({
          id: arrowId,
          "aria-hidden": "true",
          "data-uncentered": flag(placement?.arrowUncentered)
        })
        .forward(ownStyle(arrowStyle)))

    // Drawn inside the portal, so only while it shows.
    const viewport = p.part("div", (b) =>
      b
        .attrs({
          "data-activation-direction": transition?.direction ?? undefined,
          "data-transitioning": flag(transition !== null)
        })
        .forward((node) => viewportContent(node, value ?? "", transition))
        .onMount(
          TrackViewport({
            open,
            trigger: triggerSelector,
            side,
            positionerId,
            transitioning: transition !== null
          }).pipe(
            Mount.map((change) =>
              NavigationMenuMessage.ChangedViewport({ change })
            )
          )
        ))

    return {
      value,
      open,
      mounted: shown,
      transitionStatus,
      openReason: open ? model.reason : null,
      side,
      align,
      root: p.part("nav", (b) => b.attr(rootAttribute, scope)),
      list: p.part("ul", (b) =>
        b.onMount(
          TrackNavigationList({
            scope,
            vertical: props.orientation === "vertical",
            rtl: provided(p.reads.provider)
          })
        )),
      item: p.part("li", (b) => b),
      trigger,
      link,
      portal,
      positioner,
      popup,
      viewport,
      arrow
    }
  }
})
