/**
 * A button that opens a list of options, showing the selected one.
 *
 * `Select` is headless: it owns the keyboard and pointer behaviour, focus,
 * placement, the data attributes and the form inputs, and the consumer draws
 * the markup. The consumer owns whether the popup is open and what's
 * selected, passes them as `open` and `value`, and stores what the
 * `Opened`, `Dismissed` and `Picked` events report. Values are strings,
 * and `items` lists every option with its label, in the order they're
 * drawn.
 *
 * **Anatomy**
 *
 * | Part              | Element                                              |
 * | :---------------- | :--------------------------------------------------- |
 * | `label`           | `<div>` that names the trigger                       |
 * | `trigger`         | `<button>` that opens the popup                      |
 * | `value`           | `<span>` inside the trigger, the selected label      |
 * | `icon`            | `<span>` inside the trigger                          |
 * | `backdrop`        | `<div>`, a manual popover under the positioner       |
 * | `positioner`      | `<div>`, a manual popover placed by the select       |
 * | `popup`           | `<div>` inside the positioner                        |
 * | `list`            | `<div>` inside the popup, when it holds more than items |
 * | `arrow`           | `<div>` inside the popup                             |
 * | `item`            | `<div>`, one per value, inside the popup or the list |
 * | `itemText`        | `<div>` inside an item, its label                    |
 * | `itemIndicator`   | `<span>` inside an item, shown while it's selected   |
 * | `group`           | `<div>` around items                                 |
 * | `groupLabel`      | `<div>` inside a group                               |
 * | `separator`       | `<div>` between items                                |
 * | `scrollUpArrow`   | `<div>` inside the popup                             |
 * | `scrollDownArrow` | `<div>` inside the popup                             |
 * | `finalFocus`      | any focusable element, focused on close              |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, and the consumer adds the children. `item`, `itemIndicator`,
 * `group` and `groupLabel` take the item's value or the group's key as
 * well. `arrow`, `itemIndicator` and the scroll arrows return `undefined`
 * while they're hidden; `keepMounted` keeps the indicator and the scroll
 * arrows drawn. Every `item` value has to be in `items`, and `item` keys
 * its element with the value.
 *
 * In a `Field`, wrap the trigger and the positioner in `field.focusWithin`
 * and draw the trigger with `field.member`, so focus moving into the popup
 * doesn't mark the field touched. Name it with `select.label`, not a field
 * label: `select.label` names the trigger, and a click on it focuses the
 * trigger without opening.
 *
 * The positioner is a manual popover, so it renders in the top layer and
 * needs no portal. The browser gives a popover a border, padding, a
 * background and `overflow: auto`, so reset those on the positioner and
 * the backdrop and style the popup instead.
 *
 * **CSS variables**
 *
 * Set on the positioner:
 *
 * - `--anchor-width`, `--anchor-height`: the trigger's size
 * - `--available-width`, `--available-height`: the space between the
 *   trigger and the edge of the collision boundary, for a `max-height`
 *
 * Set on the popup: `--transform-origin`, the point the popup grows from.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent, except `data-side`,
 * `data-align`, `data-popup-side`, `data-direction` and
 * `data-orientation`, which hold a value:
 *
 * - `trigger`: `data-popup-open`, `data-pressed`, `data-popup-side`,
 *   `data-disabled`, `data-readonly`, `data-required`,
 *   `data-placeholder`
 * - `value`: `data-placeholder`
 * - `icon`: `data-popup-open`
 * - `backdrop`: `data-open` / `data-closed`, `data-starting-style`,
 *   `data-ending-style`
 * - `positioner`: `data-open` / `data-closed`, `data-starting-style`,
 *   `data-ending-style`, `data-side`, `data-align`, `data-anchor-hidden`
 * - `popup`, `arrow`: as on the positioner, without
 *   `data-anchor-hidden`; the arrow adds `data-uncentered`
 * - `item`: `data-selected`, `data-highlighted`, `data-disabled`
 * - `separator`: `data-orientation`
 * - `scrollUpArrow`, `scrollDownArrow`: `data-direction`, `data-side`,
 *   `data-visible`
 *
 * `data-side` is `none` while the popup is aligned with the trigger.
 *
 * **Keyboard**
 *
 * On the trigger, Enter, Space, ArrowDown and ArrowUp open the popup and
 * move focus to the selected item, or to the first or, for ArrowUp, the
 * last item. Typing a letter selects the next matching item without
 * opening. In the popup, ArrowDown, ArrowUp, Home and End move between
 * items, disabled ones included, and typing moves to the next item whose
 * label starts with what's typed, skipping disabled ones. Enter and Space
 * pick the focused item. Escape closes the popup, and Shift+Tab closes it
 * and returns focus to the trigger.
 *
 * **Placement**
 *
 * By default the popup covers the trigger, with the selected item over the
 * trigger's text, and grows as its list scrolls. It falls back to placing
 * the popup below the trigger when the trigger is within 20px of the top
 * or bottom of the viewport, when there's no room for the popup's
 * `min-height` (100px when unset), and for a select opened by touch.
 * While aligned, the positioner's `margin-top` and `margin-bottom` in CSS
 * are the gaps it keeps to the top and bottom of the viewport, 10px each
 * when unset. A margin of 0 puts it against that edge, also when the 0
 * comes from a reset such as `* { margin: 0 }`. A resize of the window
 * closes an aligned popup. Set
 * `alignItemWithTrigger: false` to always place it next to the trigger,
 * where the `Positioning` props apply and it flips when it doesn't fit.
 *
 * **Form**
 *
 * With `name`, `required` or `autoComplete`, the trigger is wrapped in
 * a `display: contents` span that holds a visually hidden input, so
 * `required` blocks a form's submission, the browser can autofill it, and
 * the value is submitted. A `multiple` select submits one hidden input per
 * value. A `modal` select locks the page's scroll and blocks presses
 * outside, except on the trigger. An empty string counts as no value.
 *
 * **Example** (A theme picker in a field, with the open state and the value in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Field, Select } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const themes = [
 *   { value: "light", label: "Light" },
 *   { value: "dark", label: "Dark" },
 *   { value: "system", label: "System" }
 * ]
 *
 * const SettingsMessage = UiSchema.TaggedEnum({
 *   ToggledThemes: { open: Schema.Boolean },
 *   PickedTheme: { theme: Schema.String }
 * })
 *
 * const Settings = Component.define({
 *   name: "Settings",
 *   model: Schema.Struct({ open: Schema.Boolean, theme: Schema.String }),
 *   message: SettingsMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ open: false, theme: "system" }),
 *   update: {
 *     ToggledThemes: (model, { open }) => ({ ...model, open }),
 *     PickedTheme: (model, { theme }) => ({ ...model, theme })
 *   },
 *   view: (model, h) =>
 *     Field(h, {
 *       props: { filled: true },
 *       view: (field) =>
 *         Select(h, {
 *           props: { open: model.open, value: model.theme, items: themes, name: "theme" },
 *           onEmit: {
 *             Opened: () => SettingsMessage.ToggledThemes({ open: true }),
 *             Dismissed: () => SettingsMessage.ToggledThemes({ open: false }),
 *             Picked: ({ value }) => SettingsMessage.PickedTheme({ theme: String(value) }),
 *             Settled: () => undefined
 *           },
 *           view: (select) =>
 *             field.root(h.div).children(
 *               select.label(h.div).children("Theme"),
 *               field.focusWithin(h.div).children(
 *                 select.trigger(field.member(h.button)).children(select.value(h.span), select.icon(h.span).children("▾")),
 *                 select.positioner(h.div).children(
 *                   select.popup(h.div).children(
 *                     ...themes.map(({ label, value }) =>
 *                       select.item(h.div, value).children(
 *                         select.itemText(h.div).children(label),
 *                         select.itemIndicator(h.span, value)?.children("✓")
 *                       )
 *                     )
 *                   )
 *                 )
 *               )
 *             )
 *         })
 *     })
 * })
 *
 * // The trigger is a combobox that shows the selected theme.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Settings, {}))
 * if (!/<button[^>]* role="combobox"[^>]*>.*System/.test(html)) throw new Error("the trigger doesn't show the theme")
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
import * as UiStruct from "@effect/ui/UiStruct"
import * as View from "@effect/ui/View"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { type Attributed, flag, idSelector, noSelect, separatorAttrs, withStyle } from "./internal/attributes.ts"
import { blockers, cutPath } from "./internal/blocker.ts"
import { byAttribute } from "./internal/dom.ts"
import { formInputs } from "./internal/formInputs.ts"
import { methodOf } from "./internal/interaction.ts"
import { stepped } from "./internal/list.ts"
import { holdScroll } from "./internal/modal.ts"
import { listenOutside } from "./internal/outside.ts"
import { clamp } from "./internal/range.ts"
import { raiseAbove } from "./internal/topLayer.ts"
import { frameOf, settling, statusOf, transitionAttrs } from "./internal/transition.ts"
import { available, printable, typeahead } from "./internal/typeahead.ts"
import * as Positioning from "./Positioning.ts"

/**
 * One option of a `Select`: the value it submits, the text the trigger shows
 * and typeahead matches, and whether it can be picked.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const SelectItem = Schema.Struct({
  value: Schema.String,
  label: Schema.String,
  disabled: Schema.optional(Schema.Boolean)
})

/**
 * One option of a `Select`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SelectItem = typeof SelectItem.Type

/**
 * What a `Select` holds: one value, the values of a `multiple` select, or
 * `null` for none. An empty string counts as no value too.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const SelectValue = Schema.NullOr(Schema.Union([Schema.String, Schema.Array(Schema.String)]))

/**
 * What a `Select` holds.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SelectValue = typeof SelectValue.Type

/**
 * How the select was opened or closed: `"keyboard"` for a key or a click
 * from no pointer.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const SelectInteraction = Schema.Literals(["mouse", "touch", "pen", "keyboard"])

/**
 * How the select was opened or closed.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SelectInteraction = typeof SelectInteraction.Type

/**
 * Why a `Select` asks to open, close or change its value.
 *
 * **Details**
 *
 * - `"trigger-press"`: a press, or Enter or Space, on the trigger
 * - `"list-navigation"`: ArrowDown or ArrowUp on the closed trigger
 * - `"item-press"`: an item was picked
 * - `"outside-press"`: a press outside the trigger and the popup, other
 *   than on a scrollbar
 * - `"escape-key"`: Escape in the popup
 * - `"focus-out"`: focus left the trigger and the popup, or Shift+Tab in
 *   the popup
 * - `"cancel-open"`: the press that opened it was released away from the
 *   trigger and the popup
 * - `"window-resize"`: the window resized while the popup covered the
 *   trigger
 * - `"none"`: typeahead on the closed trigger, autofill, or focus coming
 *   back to the trigger while the popup covers it
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const SelectChangeReason = Schema.Literals([
  "trigger-press",
  "list-navigation",
  "item-press",
  "outside-press",
  "escape-key",
  "focus-out",
  "cancel-open",
  "window-resize",
  "none"
])

/**
 * Why a `Select` asks to open, close or change its value.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SelectChangeReason = typeof SelectChangeReason.Type

/**
 * The props of a `Select`.
 *
 * **Details**
 *
 * - `open`: whether the popup shows. The select only asks, with `Opened`
 *   and `Dismissed`.
 * - `items`: every option, in the order they're drawn. Navigation,
 *   typeahead and the trigger's text read them, so list each item drawn.
 * - `value`: the selected value, or values with `multiple`. `null` when
 *   left out. The select only asks, with `Picked`.
 * - `multiple`: more than one item can be selected, and picking one
 *   leaves the popup open. False when left out.
 * - `placeholder`: the trigger's text while nothing is selected.
 * - `disabled`, `readOnly`, `required`: as on a native `<select>`.
 *   A read-only select opens and can be browsed but not changed.
 * - `name`, `form`, `autoComplete`: the form field.
 * - `id`: the trigger's id. Generated when left out.
 * - `modal`: while open, the page doesn't scroll and a press outside only
 *   closes the popup. True when left out.
 * - `highlightItemOnHover`: the pointer highlights the item it's over.
 *   True when left out.
 * - `alignItemWithTrigger`: the popup covers the trigger, with the
 *   selected item over the trigger's text. True when left out. It's off for
 *   a select opened by touch, and falls back to placing the popup next to
 *   the trigger when there isn't room.
 * - `finalFocus`: on close, focus goes back to the trigger, or to a
 *   `finalFocus` part. False leaves it where it is. True when left out.
 * - `holdExit`: keeps the closing popup shown, for an exit animation the
 *   consumer ends by clearing it.
 * - the `Positioning.PositionerFields`, for the popup when it isn't
 *   aligned with the trigger. `side` is `"bottom"` when left out.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const SelectProps = Schema.Struct({
  open: Schema.Boolean,
  items: Schema.Array(SelectItem),
  value: Schema.optional(SelectValue),
  multiple: Schema.optional(Schema.Boolean),
  placeholder: Schema.optional(Schema.String),
  disabled: Schema.optional(Schema.Boolean),
  readOnly: Schema.optional(Schema.Boolean),
  required: Schema.optional(Schema.Boolean),
  name: Schema.optional(Schema.String),
  form: Schema.optional(Schema.String),
  autoComplete: Schema.optional(Schema.String),
  id: Schema.optional(Schema.String),
  modal: Schema.optional(Schema.Boolean),
  highlightItemOnHover: Schema.optional(Schema.Boolean),
  alignItemWithTrigger: Schema.optional(Schema.Boolean),
  finalFocus: Schema.optional(Schema.Boolean),
  holdExit: Schema.optional(Schema.Boolean),
  ...Positioning.PositionerFields
})

/**
 * The props of a `Select`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SelectProps = typeof SelectProps.Type

/**
 * What a `Select` asks of its parent.
 *
 * **Details**
 *
 * - `Opened`: set `open` to true.
 * - `Dismissed`: set `open` to false.
 * - `Picked`: set `value` to `value`, the whole new selection.
 * - `Settled`: the popup's transitions ended, after it opened or closed.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const SelectEvents = UiSchema.TaggedEnum({
  Opened: { reason: SelectChangeReason },
  Dismissed: { reason: SelectChangeReason },
  Picked: { value: SelectValue, reason: SelectChangeReason },
  Settled: { open: Schema.Boolean }
})

/**
 * What a `Select` asks of its parent.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SelectEvents = typeof SelectEvents.Type

/**
 * Where a select's popup is in its transitions: `"starting"` for the
 * first frame after it opens, `"ending"` while it closes, `null` otherwise.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type SelectTransitionStatus = "starting" | "ending" | null

const Message = UiSchema.TaggedEnum({
  PressedTrigger: { pointerType: Schema.String },
  ReleasedTrigger: {},
  ClickedTrigger: { pointerType: Schema.String },
  PressedTriggerKey: { key: Schema.String },
  ClickedLabel: {},
  FocusedInput: {},
  Autofilled: { value: Schema.String },
  PressedPopupKey: { key: Schema.String },
  ReleasedSpace: {},
  EnteredItem: { value: Schema.String },
  LeftItem: {},
  PressedItem: {},
  ReleasedItem: { value: Schema.String, pointerType: Schema.String },
  ClickedItem: { value: Schema.String, pointerType: Schema.String },
  CompletedWaitBeforeResetTyping: {},
  ShowedPopup: {},
  RenderedFirstFrame: {},
  FinishedTransition: { open: Schema.Boolean },
  ChangedPlacement: { placement: Positioning.Placement },
  PressedOutside: { pointerType: Schema.String },
  FocusedOutside: {},
  FocusedTrigger: {},
  ReleasedPointer: { outside: Schema.Boolean },
  ResizedWindow: {},
  FellBack: {},
  ChangedScrollArrows: { up: Schema.Boolean, down: Schema.Boolean },
  ScrolledByArrow: {},
  AllowedRelease: {},
  DraggedPointer: {}
})

type Message = typeof Message.Type

const Model = Schema.Struct({
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  openMethod: Schema.NullOr(SelectInteraction),
  closeMethod: Schema.NullOr(SelectInteraction),
  focusLeft: Schema.Boolean,
  active: Schema.NullOr(Schema.String),
  activeByKey: Schema.Boolean,
  typed: Schema.String,
  typedFrom: Schema.Number,
  matched: Schema.Number,
  spaceDown: Schema.Boolean,
  placement: Schema.NullOr(Positioning.Placement),
  fellBack: Schema.Boolean,
  scrollUp: Schema.Boolean,
  scrollDown: Schema.Boolean,
  pressing: Schema.Boolean,
  pressedItem: Schema.Boolean,
  releaseSelected: Schema.Boolean,
  releaseUnselected: Schema.Boolean
})

type Model = typeof Model.Type

type SelectUpdate = Component.Update<Model, Message, SelectEvents, SelectProps>

const Trigger = Html.ref("SelectTrigger", "button")

const WaitBeforeResetTyping = Command.make(
  "WaitBeforeResetTyping",
  { args: {}, mode: "switch" },
  () => Effect.as(Effect.sleep(Duration.millis(750)), Message.CompletedWaitBeforeResetTyping())
)

const valuesOf = (props: SelectProps): ReadonlyArray<string> =>
  props.value == null ? [] : typeof props.value === "string" ? [props.value] : props.value

const filledOf = (props: SelectProps): boolean =>
  props.multiple === true ? valuesOf(props).length > 0 : valuesOf(props).some((value) => value !== "")

const selectedIndexOf = (props: SelectProps): number => {
  const values = valuesOf(props)
  return props.items.findIndex((item) => values.includes(item.value))
}

const indexOf = (props: SelectProps, value: string | null): number =>
  value === null ? -1 : props.items.findIndex((item) => item.value === value)

const alignedOf = (model: Model, props: SelectProps): boolean =>
  props.alignItemWithTrigger !== false && !model.fellBack && model.openMethod !== "touch"

const typing = (model: Model): boolean => model.typed !== ""

const startOf = (model: Model, props: SelectProps): number => {
  const selected = selectedIndexOf(props)
  return selected !== -1 ? selected : indexOf(props, model.active)
}

const open = (
  model: Model,
  $: SelectUpdate,
  reason: SelectChangeReason,
  method: SelectInteraction,
  key?: string
) => {
  const props = $.props
  const items = props.items
  let active = selectedIndexOf(props)
  if (active === -1 && items.length > 0) {
    if (method === "keyboard") active = key === "ArrowUp" ? items.length - 1 : 0
    else if (props.alignItemWithTrigger !== false && method !== "touch" && props.highlightItemOnHover !== false) {
      active = 0
    }
  }
  return $.set({
    ...model,
    openMethod: method,
    closeMethod: null,
    focusLeft: false,
    active: items[active]?.value ?? null,
    activeByKey: method === "keyboard",
    typed: "",
    spaceDown: false,
    fellBack: false,
    pressing: reason === "trigger-press" && (method === "mouse" || method === "pen"),
    pressedItem: false,
    releaseSelected: false,
    releaseUnselected: false
  }).emit(SelectEvents.Opened({ reason }))
}

const dismiss = (
  model: Model,
  $: SelectUpdate,
  reason: SelectChangeReason,
  method: SelectInteraction | null,
  focusLeft = false
) =>
  $.props.open
    ? $.set({ ...model, closeMethod: method, focusLeft, pressing: false, spaceDown: false }).emit(
      SelectEvents.Dismissed({ reason })
    )
    : model

const toggle = (model: Model, $: SelectUpdate, method: SelectInteraction) =>
  $.props.disabled === true
    ? model
    : $.props.open
    ? dismiss(model, $, "trigger-press", method)
    : open(model, $, "trigger-press", method)

const pick = (model: Model, $: SelectUpdate, value: string, method: SelectInteraction) => {
  const props = $.props
  const item = props.items.find((candidate) => candidate.value === value)
  if (!available(item) || props.disabled === true || props.readOnly === true) return model
  const next = { ...model, active: value, pressedItem: false }
  if (props.multiple === true) {
    const current = valuesOf(props)
    const values = current.includes(value) ? current.filter((other) => other !== value) : [...current, value]
    return $.set(next).emit(SelectEvents.Picked({ value: values, reason: "item-press" }))
  }
  return $.set({ ...next, closeMethod: method, focusLeft: false, pressing: false })
    .emit(SelectEvents.Picked({ value, reason: "item-press" }))
    .emit(SelectEvents.Dismissed({ reason: "item-press" }))
}

const highlight = (model: Model, props: SelectProps, index: number): Model => {
  const item = props.items[index]
  return item === undefined ? model : { ...model, active: item.value, activeByKey: true }
}

const hover = (model: Model, active: string | null): Model =>
  model.active === active ? model : { ...model, active, activeByKey: false }

const typeKey = (model: Model, $: SelectUpdate, key: string) => {
  const props = $.props
  const { index, next } = typeahead(model, key, props.items, startOf(model, props))
  const item = props.items[index]
  const moved = props.open && item !== undefined ? { active: item.value, activeByKey: true } : undefined
  const typed = $.set({ ...model, ...next, ...moved }).run(WaitBeforeResetTyping({}))
  return item === undefined || props.open || valuesOf(props).includes(item.value)
    ? typed
    : typed.emit(SelectEvents.Picked({ value: item.value, reason: "none" }))
}

const focusTrigger = (_model: Model, _message: unknown, $: SelectUpdate) =>
  $.run(Html.Focus({ ref: Trigger }).pipe(Command.asNoop))

const tolerance = 1

const maxScrollOf = (scroller: HTMLElement): number => Math.max(0, scroller.scrollHeight - scroller.clientHeight)

const normalized = (value: number, max: number): number => {
  if (max <= 0) return 0
  const clamped = clamp(value, 0, max)
  return clamped <= tolerance ? 0 : max - clamped <= tolerance ? max : clamped
}

const maxHeightOf = (style: CSSStyleDeclaration): number =>
  style.maxHeight.endsWith("px") ? parseFloat(style.maxHeight) || Infinity : Infinity

const arrowScrollTop = (
  items: ReadonlyArray<HTMLElement>,
  up: boolean,
  scrollTop: number,
  clientHeight: number,
  arrowHeight: number,
  maxScrollTop: number
): number => {
  if (up) {
    let first = 0
    const visibleTop = scrollTop + arrowHeight - tolerance
    for (let i = 0; i < items.length; i++) {
      if (items[i]!.offsetTop >= visibleTop) {
        first = i
        break
      }
    }
    const target = Math.max(0, first - 1)
    const item = items[target]
    return target < first && item !== undefined ? normalized(item.offsetTop - arrowHeight, maxScrollTop) : 0
  }
  let last = items.length - 1
  const visibleBottom = scrollTop + clientHeight - arrowHeight + tolerance
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    if (item.offsetTop + item.offsetHeight > visibleBottom) {
      last = Math.max(0, i - 1)
      break
    }
  }
  const target = Math.min(items.length - 1, last + 1)
  const item = items[target]
  return target > last && item !== undefined
    ? normalized(item.offsetTop + item.offsetHeight - clientHeight + arrowHeight, maxScrollTop)
    : maxScrollTop
}

const transformResets = [
  ["transform", "none"],
  ["scale", "1"],
  ["translate", "0 0"]
] as const

const override = (element: HTMLElement, name: string, value: string, priority = ""): () => void => {
  const before = element.style.getPropertyValue(name)
  const beforePriority = element.style.getPropertyPriority(name)
  element.style.setProperty(name, value, priority)
  return () => {
    if (before === "") element.style.removeProperty(name)
    else element.style.setProperty(name, before, beforePriority)
  }
}

const withoutTransforms = (element: HTMLElement): () => void => {
  const undos = transformResets.map(([name, value]) => override(element, name, value, "important"))
  return () => undos.forEach((undo) => undo())
}

const webkit = (): boolean =>
  typeof navigator !== "undefined" && /AppleWebKit/.test(navigator.userAgent) &&
  !/Chrome|Chromium|Edg|Android/.test(navigator.userAgent)

const TrackSelectArgs = {
  position: Positioning.TrackPositionArgs,
  open: Schema.Boolean,
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  holdExit: Schema.Boolean,
  aligned: Schema.Boolean,
  lock: Schema.Boolean,
  touch: Schema.Boolean,
  active: Schema.NullOr(Schema.String),
  scroll: Schema.Boolean,
  pressing: Schema.Boolean,
  finalFocus: Schema.Boolean,
  focusLeft: Schema.Boolean,
  closeMethod: Schema.NullOr(SelectInteraction),
  triggerId: Schema.String,
  popupId: Schema.String,
  listId: Schema.String,
  alignId: Schema.NullOr(Schema.String)
}

type TrackSelectArgs = Schema.Struct<typeof TrackSelectArgs>["Type"]

const watch = (node: HTMLElement, args: TrackSelectArgs, changes: Stream.Stream<TrackSelectArgs>) =>
  Stream.callback<Message>((queue) => {
    const document = node.ownerDocument
    const view = document.defaultView
    const html = document.documentElement
    const frame = frameOf(view)
    let current = args
    const send = (message: Message) => Queue.offerUnsafe(queue, message)
    const trigger = (): HTMLElement | null => document.getElementById(current.triggerId)
    const popup = (): HTMLElement => document.getElementById(current.popupId) ?? node
    const scroller = (): HTMLElement => document.getElementById(current.listId) ?? popup()
    const blocking = (target: Node): boolean => target instanceof Element && target.hasAttribute("data-select-blocker")
    const inside = (target: Node): boolean =>
      (node.contains(target) && !blocking(target)) || trigger()?.contains(target) === true

    const saved = new Map<HTMLElement, Map<string, () => void>>()
    const write = (element: HTMLElement, name: string, value: string) => {
      let own = saved.get(element)
      if (own === undefined) saved.set(element, own = new Map())
      if (own.has(name)) element.style.setProperty(name, value)
      else own.set(name, override(element, name, value))
    }
    let placed = false
    let reachedMax = false
    const clear = () => {
      for (const own of saved.values()) own.forEach((undo) => undo())
      saved.clear()
      placed = false
      reachedMax = false
    }

    let shownUp = false
    let shownDown = false
    const arrows = () => {
      const element = scroller()
      const max = maxScrollOf(element)
      const top = normalized(element.scrollTop, max)
      const up = top > 0
      const down = top < max
      if (up === shownUp && down === shownDown) return
      shownUp = up
      shownDown = down
      send(Message.ChangedScrollArrows({ up, down }))
    }

    const cut = () => {
      const layer = Array.from(node.children).find(blocking) as HTMLElement | undefined
      const anchor = trigger()
      if (layer === undefined || anchor === null) return
      write(layer, "clip-path", cutPath([anchor.getBoundingClientRect()]))
    }

    const gaps = (style: CSSStyleDeclaration): readonly [top: number, bottom: number] => {
      const top = parseFloat(style.marginTop)
      const bottom = parseFloat(style.marginBottom)
      if (top !== 0 && bottom !== 0) return [top || 10, bottom || 10]
      // An unset margin is `auto`, which reads as 0px like a margin set to 0, until
      // the box is held to both edges and its `auto` margins take the space left.
      const undo = [override(node, "top", "0px"), override(node, "bottom", "0px"), override(node, "height", "0px")]
      const heldTop = parseFloat(style.marginTop)
      const heldBottom = parseFloat(style.marginBottom)
      undo.forEach((restore) => restore())
      return [top === 0 && heldTop === 0 ? 0 : top || 10, bottom === 0 && heldBottom === 0 ? 0 : bottom || 10]
    }

    const align = () => {
      const anchor = trigger()
      const list = popup()
      if (anchor === null || view === null || !current.open || !current.aligned || placed) return
      placed = true
      const restore = withoutTransforms(list)
      try {
        const text = current.alignId === null
          ? null
          : document.getElementById(current.alignId)?.querySelector<HTMLElement>("[data-select-item-text]") ?? null
        const value = anchor.querySelector<HTMLElement>("[data-select-value]")
        const positionerStyle = view.getComputedStyle(node)
        const popupStyle = view.getComputedStyle(list)
        const rtl = positionerStyle.direction === "rtl"
        const triggerRect = anchor.getBoundingClientRect()
        const positionerRect = node.getBoundingClientRect()
        const element = scroller()
        const scrollHeight = element.scrollHeight
        const borderBottom = parseFloat(popupStyle.borderBottomWidth) || 0
        const [marginTop, marginBottom] = gaps(positionerStyle)
        const minHeight = parseFloat(positionerStyle.minHeight) || 100
        const maxPopupHeight = maxHeightOf(popupStyle)
        const viewportHeight = html.clientHeight - marginTop - marginBottom
        const viewportWidth = html.clientWidth
        const beneath = viewportHeight - triggerRect.bottom + triggerRect.height
        let left = rtl ? triggerRect.right - positionerRect.width : triggerRect.left
        let offsetY = 0
        let textRect: DOMRect | undefined
        if (text !== null && value !== null) {
          const valueRect = value.getBoundingClientRect()
          textRect = text.getBoundingClientRect()
          left = positionerRect.left + (rtl ? valueRect.right - textRect.right : valueRect.left - textRect.left)
          const valueCenter = valueRect.top - triggerRect.top + valueRect.height / 2
          const textCenter = textRect.top - positionerRect.top + textRect.height / 2
          offsetY = textCenter - valueCenter
        }
        const ideal = beneath + offsetY + marginTop + borderBottom
        let height = Math.min(viewportHeight, ideal)
        const maxHeight = viewportHeight - marginTop - marginBottom
        const scrollTop = ideal - height
        write(node, "left", clamp(left, 5, viewportWidth - 5 - positionerRect.width) + "px")
        write(node, "height", height + "px")
        write(node, "max-height", "none")
        write(node, "margin-top", marginTop + "px")
        write(node, "margin-bottom", marginBottom + "px")
        write(list, "height", "100%")
        const maxScrollTop = maxScrollOf(element)
        const fromTop = scrollTop >= maxScrollTop - tolerance
        if (fromTop) height = Math.min(viewportHeight, positionerRect.height) - (scrollTop - maxScrollTop)
        const fallBack = triggerRect.top < 20 || triggerRect.bottom > viewportHeight - 20 ||
          Math.ceil(height) + tolerance < Math.min(scrollHeight, minHeight)
        // WebKit misplaces the popup while the page is pinch-zoomed.
        const zoomed = (view.visualViewport?.scale ?? 1) !== 1 && webkit()
        if (fallBack || zoomed) {
          clear()
          send(Message.FellBack())
          return
        }
        if (fromTop) {
          write(node, "top", positionerRect.height >= maxHeight ? "0px" : Math.max(0, viewportHeight - ideal) + "px")
          write(node, "height", height + "px")
          element.scrollTop = maxScrollOf(element)
        } else {
          write(node, "top", "auto")
          write(node, "bottom", "0px")
          element.scrollTop = scrollTop
        }
        if (textRect !== undefined) {
          const y = positionerRect.height > 0
            ? ((textRect.top + textRect.height / 2 - positionerRect.top) / positionerRect.height) * 100
            : 50
          write(list, "--transform-origin", "50% " + clamp(y, 0, 100) + "%")
        }
        if (Math.max(minHeight, height) === viewportHeight || height >= maxPopupHeight) reachedMax = true
      } finally {
        restore()
      }
    }

    const grow = () => {
      if (!placed || reachedMax || !current.aligned || view === null) return
      const fromTop = node.style.top === "0px"
      const fromBottom = node.style.bottom === "0px"
      if (!fromTop && !fromBottom) return
      const element = scroller()
      const height = node.getBoundingClientRect().height
      const positionerStyle = view.getComputedStyle(node)
      const available = Math.min(
        html.clientHeight - parseFloat(positionerStyle.marginTop) - parseFloat(positionerStyle.marginBottom),
        maxHeightOf(view.getComputedStyle(popup()))
      )
      const scrollTop = element.scrollTop
      const maxScrollTop = maxScrollOf(element)
      const diff = fromTop ? maxScrollTop - scrollTop : scrollTop
      const next = Math.min(height + diff, available)
      if (diff <= tolerance) {
        const delta = clamp(diff, 0, available - height)
        if (delta > 0) write(node, "height", height + delta + "px")
        element.scrollTop = fromTop ? maxScrollTop : 0
        if (available - (height + delta) <= tolerance) reachedMax = true
        return
      }
      let target: number | null = null
      if (available - next > tolerance) target = fromTop ? Infinity : 0
      else if (fromBottom && scrollTop < maxScrollTop) target = scrollTop - (diff - (height + diff - available))
      const rounded = Math.ceil(next)
      if (rounded !== 0) write(node, "height", rounded + "px")
      if (target !== null) {
        const clamped = clamp(target, 0, maxScrollOf(element))
        if (Math.abs(element.scrollTop - clamped) > tolerance) element.scrollTop = clamped
      }
      if (rounded >= available - tolerance) reachedMax = true
    }

    const focusActive = (scroll: boolean) => {
      if (!current.open) return
      const item = current.active === null ? null : document.getElementById(current.active)
      if (item === null) {
        if (document.activeElement !== popup()) popup().focus({ preventScroll: true })
        return
      }
      if (document.activeElement !== item) item.focus({ preventScroll: true })
      if (scroll) item.scrollIntoView({ block: "nearest" })
    }

    const reveal = () =>
      frame(() => {
        if (current.open && current.active !== null) {
          document.getElementById(current.active)?.scrollIntoView({ block: "nearest" })
        }
      })

    let release: (() => void) | undefined
    const hold = () => {
      release?.()
      release = current.open && current.lock ? holdScroll(node, current.touch) : undefined
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const opening = () => {
      send(Message.ShowedPopup())
      node.inert = false
      clear()
      clearTimeout(timer)
      timer = setTimeout(() => send(Message.AllowedRelease()), 400)
      cut()
      align()
      arrows()
      focusActive(false)
      if (!current.aligned) reveal()
      if (!current.started) frame(() => frame(() => send(Message.RenderedFirstFrame())))
    }

    const closing = () => {
      clearTimeout(timer)
      stopArrow()
      const focused = document.activeElement
      const lost = focused === null || focused === document.body || node.contains(focused)
      if (current.finalFocus && (lost || !current.focusLeft)) {
        const marked = byAttribute(document, "data-final-focus", current.popupId)
        const back = marked ?? trigger()
        if (back !== null && (marked !== null || lost)) {
          back.focus({ preventScroll: true, focusVisible: current.closeMethod === "keyboard" } as FocusOptions)
        }
      } else if (focused instanceof HTMLElement && node.contains(focused)) {
        focused.blur()
      }
      node.inert = true
    }

    let arrowTimer: ReturnType<typeof setTimeout> | undefined
    const stopArrow = () => {
      clearTimeout(arrowTimer)
      arrowTimer = undefined
    }
    const unhighlight = () => {
      if (current.active !== null) send(Message.ScrolledByArrow())
    }
    const scrollBy = (arrow: Element, up: boolean) => {
      const step = () => {
        const element = scroller()
        unhighlight()
        const max = maxScrollOf(element)
        const top = normalized(element.scrollTop, max)
        if (top !== element.scrollTop) element.scrollTop = top
        if (top === (up ? 0 : max)) return stopArrow()
        const items = Array.from(element.querySelectorAll<HTMLElement>("[role=\"option\"]"))
        if (items.length > 0) {
          element.scrollTop = arrowScrollTop(
            items,
            up,
            top,
            element.clientHeight,
            (arrow as HTMLElement).offsetHeight || 0,
            max
          )
        }
        arrowTimer = setTimeout(step, 40)
      }
      arrowTimer = setTimeout(step, 40)
    }

    const onPointerDown = () => {
      dragY = 0
    }
    const onMouseUp = (event: MouseEvent) => {
      dragY = 0
      if (!current.pressing) return
      const target = event.target as Node | null
      const anchor = trigger()
      let outside = target !== null && !inside(target)
      if (outside && anchor !== null) {
        const r = anchor.getBoundingClientRect()
        if (
          event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom
        ) {
          outside = false
        }
      }
      send(Message.ReleasedPointer({ outside }))
    }
    let dragY = 0
    let dragged = false
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.buttons !== 1 || dragged) return
      if (!(event.target instanceof Element) || event.target.closest("[role=\"option\"]") === null) return
      dragY += event.movementY
      if (dragY ** 2 >= 64) {
        dragged = true
        send(Message.DraggedPointer())
      }
    }
    const onMouseMove = (event: MouseEvent) => {
      const arrow = event.target instanceof Element ? event.target.closest("[data-select-scroll-arrow]") : null
      if (arrow === null || !node.contains(arrow)) return stopArrow()
      if ((event.movementX === 0 && event.movementY === 0) || arrowTimer !== undefined) return
      unhighlight()
      scrollBy(arrow, arrow.getAttribute("data-select-scroll-arrow") === "up")
    }
    const onMouseDown = (event: MouseEvent) => {
      if (event.target instanceof Node && blocking(event.target)) event.preventDefault()
    }
    const onFocusIn = (event: FocusEvent) => {
      if (current.open && current.aligned && event.target === trigger()) send(Message.FocusedTrigger())
    }
    const onScroll = (event: Event) => {
      if (event.target !== scroller()) return
      grow()
      arrows()
    }
    const onResize = () => {
      if (current.open && current.aligned) send(Message.ResizedWindow())
    }

    const transition = settling(node, popup, frame, (open) => send(Message.FinishedTransition({ open })))

    const onChange = (next: TrackSelectArgs) => {
      const previous = current
      current = next
      if (next.open !== previous.open || next.lock !== previous.lock || next.touch !== previous.touch) hold()
      if (previous.aligned && !next.aligned) {
        clear()
        cut()
        if (previous.open) reveal()
      }
      if (previous.open && !next.open) closing()
      else if (!previous.open && next.open) {
        dragged = false
        opening()
      } else if (next.open && next.active !== previous.active) focusActive(next.scroll)
      transition.follow(previous, next)
    }

    const controller = new AbortController()
    const { signal } = controller

    return Effect.acquireRelease(
      Effect.sync(() => {
        listenOutside(document, signal, {
          open: () => current.open,
          inside,
          pressed: (pointerType) => send(Message.PressedOutside({ pointerType })),
          focused: () => send(Message.FocusedOutside())
        })
        document.addEventListener("pointerdown", onPointerDown, { capture: true, signal })
        document.addEventListener("mouseup", onMouseUp, { capture: true, signal })
        document.addEventListener("focusin", onFocusIn, { capture: true, signal })
        node.addEventListener("pointermove", onPointerMove, { signal })
        node.addEventListener("mousemove", onMouseMove, { signal })
        node.addEventListener("mouseleave", stopArrow, { signal })
        node.addEventListener("mousedown", onMouseDown, { signal })
        node.addEventListener("scroll", onScroll, { capture: true, passive: true, signal })
        view?.addEventListener("resize", onResize, { signal })
        hold()
        raiseAbove(node)
        if (current.open) opening()
        else node.inert = true
      }).pipe(
        Effect.tap(() => Effect.forkScoped(Stream.runForEach(changes, (next) => Effect.sync(() => onChange(next)))))
      ),
      () =>
        Effect.sync(() => {
          controller.abort()
          clearTimeout(timer)
          stopArrow()
          release?.()
          release = undefined
          transition.cancel()
          clear()
          node.inert = false
        })
    )
  })

const TrackSelect = Mount.makeStream(
  "TrackSelect",
  { args: TrackSelectArgs },
  (node: HTMLElement, args, changes) =>
    Stream.merge(
      watch(node, args, changes),
      Positioning.trackPosition(node, args.position, Stream.map(changes, (next) => next.position)).pipe(
        Stream.map((placement) => Message.ChangedPlacement({ placement }))
      )
    )
)

const blocking = blockers("data-select-blocker")

const alignedBox =
  "position:fixed;inset:auto;margin-left:0;margin-right:0;--available-width:100vw;--available-height:100vh"

const backdropBox = "position:fixed;inset:0;width:auto;height:auto;max-width:none;max-height:none;margin:0;" + noSelect

const scrolling = "position:relative;max-height:100%;overflow-x:hidden;overflow-y:auto;scrollbar-width:none"

/**
 * A select: a button that opens a list of options, the selected one shown on
 * the button.
 *
 * **Details**
 *
 * The parts also return plain values for markup that depends on them:
 * `open`, `mounted` (the popup shows, through its exit transition),
 * `transitionStatus`, `selected` (the `value` prop, or `null`),
 * `placeholder` (nothing is selected), `disabled`, `readOnly`,
 * `required`, `multiple`, `side` and `align` (where the popup ended up,
 * `side` being `"none"` while it's aligned with the trigger),
 * `alignedWithTrigger`, `highlighted` (the value of the item with focus) and
 * `openMethod`, which is `null` once the popup closes.
 *
 * The label, the trigger, the popup, the list, the arrow, the items and the
 * group labels set their own `id`s, over any on the builder, for the ARIA
 * attributes that point at them. Give the trigger an `id` with the `id`
 * prop.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Select = Component.define({
  name: "Select",
  props: SelectProps,
  model: Model,
  message: Message,
  events: SelectEvents,
  elements: Html
}).make({
  init: () => ({
    mounted: false,
    started: false,
    openMethod: null,
    closeMethod: null,
    focusLeft: false,
    active: null,
    activeByKey: false,
    typed: "",
    typedFrom: -1,
    matched: -1,
    spaceDown: false,
    placement: null,
    fellBack: false,
    scrollUp: false,
    scrollDown: false,
    pressing: false,
    pressedItem: false,
    releaseSelected: false,
    releaseUnselected: false
  }),
  update: {
    PressedTrigger: (model, { pointerType }, $) => toggle(model, $, methodOf(pointerType)),
    ReleasedTrigger: (_model, _message, $) => $.evolve({ pressing: false }),
    ClickedTrigger: (model, { pointerType }, $) => toggle(model, $, methodOf(pointerType)),
    PressedTriggerKey: (model, { key }, $) => {
      const props = $.props
      if (props.disabled === true) return model
      if (key === "ArrowDown" || key === "ArrowUp") {
        return props.open ? model : open(model, $, "list-navigation", "keyboard", key)
      }
      if (!props.open && (props.readOnly === true || props.multiple === true)) return model
      return typeKey(model, $, key)
    },
    ClickedLabel: focusTrigger,
    FocusedInput: focusTrigger,
    Autofilled: (model, { value }, $) => {
      const props = $.props
      if (props.disabled === true || props.readOnly === true || props.multiple === true) return model
      const lower = value.toLowerCase()
      const item = props.items.find((candidate) => candidate.value.toLowerCase() === lower) ??
        props.items.find((candidate) => candidate.label.toLowerCase() === lower)
      return item === undefined || valuesOf(props).includes(item.value)
        ? model
        : $.emit(SelectEvents.Picked({ value: item.value, reason: "none" }))
    },
    PressedPopupKey: (model, { key }, $) => {
      const props = $.props
      if (!props.open) return model
      const last = props.items.length - 1
      const at = indexOf(props, model.active)
      switch (key) {
        case "ArrowDown":
          return highlight(model, props, stepped(at, last, 1, "none"))
        case "ArrowUp":
          return highlight(model, props, stepped(at, last, -1, "none"))
        case "Home":
          return highlight(model, props, 0)
        case "End":
          return highlight(model, props, last)
        case "Enter":
          return model.active === null ? model : pick(model, $, model.active, "keyboard")
        case "Escape":
          return dismiss(model, $, "escape-key", "keyboard")
        case "Tab":
          return dismiss(model, $, "focus-out", "keyboard")
        case " ":
          return typing(model) ? typeKey(model, $, key) : $.evolve({ spaceDown: true })
        default:
          return typeKey(model, $, key)
      }
    },
    ReleasedSpace: (model, _message, $) => {
      if (!model.spaceDown) return model
      const next = { ...model, spaceDown: false }
      return $.props.open && model.active !== null ? pick(next, $, model.active, "keyboard") : next
    },
    EnteredItem: (model, { value }) => hover(model, value),
    LeftItem: (model) => hover(model, null),
    PressedItem: (_model, _message, $) => $.evolve({ pressedItem: true }),
    ReleasedItem: (model, { pointerType, value }, $) => {
      if (model.pressedItem || !$.props.open) return model
      const selected = valuesOf($.props).includes(value)
      if (selected ? !model.releaseSelected : !model.releaseUnselected) return model
      return pick(model, $, value, methodOf(pointerType))
    },
    ClickedItem: (model, { pointerType, value }, $) => {
      const next = UiStruct.evolve(model, { pressedItem: false })
      if (!$.props.open) return next
      return pointerType === "touch" || pointerType === "" || model.pressedItem
        ? pick(next, $, value, methodOf(pointerType))
        : next
    },
    CompletedWaitBeforeResetTyping: (_model, _message, $) => $.evolve({ typed: "" }),
    ShowedPopup: (_model, _message, $) =>
      $.evolve($.props.open ? { mounted: true, closeMethod: null, focusLeft: false } : { mounted: true }),
    RenderedFirstFrame: (model, _message, $) => $.props.open ? $.evolve({ started: true }) : model,
    FinishedTransition: (model, { open }, $) => {
      if (open !== $.props.open) return model
      if (open) return $.emit(SelectEvents.Settled({ open }))
      return model.mounted && $.props.holdExit !== true
        ? $.evolve({
          mounted: false,
          started: false,
          fellBack: false,
          scrollUp: false,
          scrollDown: false,
          pressedItem: false
        }).emit(SelectEvents.Settled({ open }))
        : model
    },
    ChangedPlacement: (_model, { placement }, $) => $.evolve({ placement }),
    PressedOutside: (model, { pointerType }, $) => dismiss(model, $, "outside-press", methodOf(pointerType)),
    FocusedOutside: (model, _message, $) => dismiss(model, $, "focus-out", null, true),
    FocusedTrigger: (model, _message, $) => alignedOf(model, $.props) ? dismiss(model, $, "none", null) : model,
    ReleasedPointer: (model, { outside }, $) => {
      if (!model.pressing) return model
      const next = { ...model, pressing: false }
      return outside ? dismiss(next, $, "cancel-open", "mouse") : next
    },
    ResizedWindow: (model, _message, $) => alignedOf(model, $.props) ? dismiss(model, $, "window-resize", null) : model,
    FellBack: (_model, _message, $) => $.evolve({ fellBack: true }),
    ChangedScrollArrows: (_model, { down, up }, $) => $.evolve({ scrollUp: up, scrollDown: down }),
    ScrolledByArrow: (model) => hover(model, null),
    AllowedRelease: (_model, _message, $) => $.evolve({ releaseSelected: true, releaseUnselected: true }),
    DraggedPointer: (_model, _message, $) => $.evolve({ releaseUnselected: true })
  },
  parts: (model, p) => {
    const props = p.props
    const open = props.open
    const shown = open || model.mounted
    const transitionStatus: SelectTransitionStatus = statusOf(model, props)
    const disabled = props.disabled === true
    const readOnly = props.readOnly === true
    const required = props.required === true
    const multiple = props.multiple === true
    const values = valuesOf(props)
    const chosen = new Set(values)
    const filled = filledOf(props)
    const aligned = alignedOf(model, props)
    const modal = props.modal !== false
    const touch = model.openMethod === "touch"
    const triggerId = props.id ?? p.id("trigger")
    const labelId = p.id("label")
    const popupId = p.id("popup")
    const listId = p.id("list")
    const arrowId = p.id("arrow")
    const itemId = (value: string) => p.id("item", value)
    const groupLabelId = (group: string) => p.id("group-label", group)
    const tracked = Positioning.trackArgs(props, {
      side: "bottom",
      collisionAvoidance: Positioning.dropdownCollisionAvoidance,
      anchorSelector: idSelector(triggerId),
      arrowId,
      leaveCoordinates: aligned
    })
    const position = aligned ? { ...tracked, disableAnchorTracking: props.disableAnchorTracking ?? true } : tracked
    const side = model.placement?.side ?? tracked.options.side
    const align = model.placement?.align ?? tracked.options.align
    const shownSide = aligned ? "none" : side
    const items = new Map(props.items.map((item) => [item.value, item] as const))
    const itemOf = (value: string): SelectItem => {
      const item = items.get(value)
      if (item === undefined) throw new Error("Select: no item in the items prop has the value \"" + value + "\"")
      return item
    }
    const text = !filled && props.placeholder !== undefined
      ? props.placeholder
      : values.map((value) => items.get(value)?.label ?? value).join(", ")
    const hovers = open && props.highlightItemOnHover !== false
    const highlighted = model.active
    let labelled = false
    let listed = false

    const states = <B extends Attributed<B>>(builder: B): B => transitionAttrs(builder, open, transitionStatus)
    const placed = <B extends Attributed<B>>(builder: B): B =>
      states(builder).attr("data-side", shownSide).attr("data-align", align)

    const inputs = formInputs(p, {
      name: props.name,
      form: props.form,
      autoComplete: props.autoComplete,
      required,
      readOnly,
      disabled,
      multiple,
      values,
      filled
    }, { focused: Message.FocusedInput(), autofilled: (value) => Message.Autofilled({ value }) })
    const inputsBox = new Html.Element<Message>("span").attr("style", "display:contents")

    const label = p.part("div", (b) => {
      labelled = true
      return b.attr("id", labelId).onClick(Message.ClickedLabel())
    })

    const trigger = p.part("button", (b) =>
      b.ref(Trigger)
        .attr("id", triggerId)
        .attr("type", "button")
        .attr("role", "combobox")
        .attr("aria-haspopup", "listbox")
        .attr("aria-expanded", String(open))
        .attr("aria-readonly", readOnly ? "true" : undefined)
        .attr("aria-required", required ? "true" : undefined)
        .attr("aria-disabled", undefined)
        .attr("data-popup-open", flag(open))
        .attr("data-pressed", flag(open))
        .attr("data-popup-side", shown ? side : undefined)
        .attr("data-disabled", flag(disabled))
        .attr("data-readonly", flag(readOnly))
        .attr("data-required", flag(required))
        .attr("data-placeholder", flag(!filled))
        .disabled(disabled)
        .on("mousedown", ({ button, pointerType }) =>
          button === 0 && pointerType !== "touch" ? Message.PressedTrigger({ pointerType }) : undefined)
        .on("mouseup", Message.ReleasedTrigger())
        .onClick(({ pointerType }) =>
          pointerType === "" || pointerType === "touch" ? Message.ClickedTrigger({ pointerType }) : undefined
        )
        .onKeyDown(
          ({ alt, composing, ctrl, key, meta }) =>
            composing
              ? undefined
              : key === "ArrowDown" || key === "ArrowUp" ||
                  (printable(key, alt, ctrl, meta) && (key !== " " || typing(model)))
              ? Message.PressedTriggerKey({ key })
              : undefined,
          { preventDefault: true }
        )
        .forward((node) => {
          const named = node
            .attr("aria-controls", open ? (listed ? listId : popupId) : undefined)
            .attr("aria-labelledby", node.attrs["aria-labelledby"] ?? (labelled ? labelId : undefined))
          return inputs.length === 0 ? named : inputsBox.children(named, ...inputs)
        }))

    const value = p.part("span", (b) =>
      b.attr("data-select-value", "")
        .attr("data-placeholder", flag(!filled))
        .forward((node) => node.children.length > 0 ? node : node.children(text)))

    const icon = p.part("span", (b) => b.attr("aria-hidden", "true").attr("data-popup-open", flag(open)))

    const backdrop = p.part("div", (b) =>
      states(b)
        .attr("role", "presentation")
        .popover("manual", shown)
        .forward((node) =>
          node.attr("style", withStyle(node.attrs.style, open ? backdropBox : backdropBox + ";pointer-events:none"))
        ))

    const positionerStyle = aligned ? alignedBox : Positioning.positionerStyle(tracked.positionMethod)
    const positioner = p.part("div", (b) => {
      const decorated = placed(b)
        .attr("role", "presentation")
        .attr("data-anchor-hidden", flag(shown && !aligned && model.placement?.anchorHidden))
        .popover("manual", shown)
        .forward((node) => node.attr("style", withStyle(node.attrs.style, positionerStyle)))
      const layered = modal ? decorated.children(open ? blocking.open : blocking.closed) : decorated
      if (!shown) return layered
      const alignItem = props.items.find((item) => chosen.has(item.value)) ?? props.items[0]
      return layered.onMount(
        TrackSelect({
          position,
          open,
          mounted: model.mounted,
          started: model.started,
          holdExit: props.holdExit === true,
          aligned,
          lock: open && (modal || aligned),
          touch,
          active: open && highlighted !== null && items.has(highlighted) ? itemId(highlighted) : null,
          scroll: model.activeByKey,
          pressing: model.pressing,
          finalFocus: props.finalFocus !== false,
          focusLeft: model.focusLeft,
          closeMethod: model.closeMethod,
          triggerId,
          popupId,
          listId,
          alignId: alignItem === undefined ? null : itemId(alignItem.value)
        })
      )
    })

    const listbox = <B extends Attributed<B>>(builder: B): B =>
      builder
        .attr("role", "listbox")
        .attr("aria-multiselectable", multiple ? "true" : undefined)
        .attr("aria-readonly", readOnly ? "true" : undefined)

    const popup = p.part("div", (b) =>
      placed(b)
        .attr("id", popupId)
        .attr("tabindex", "-1")
        .onKeyDown(
          ({ alt, composing, ctrl, key, meta, shift }) =>
            composing
              ? undefined
              : key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End" ||
                  key === "Enter" || key === "Escape" || (key === "Tab" && shift) || printable(key, alt, ctrl, meta)
              ? Message.PressedPopupKey({ key })
              : undefined,
          { preventDefault: true }
        )
        .onKeyUp(({ key }) => key === " " ? Message.ReleasedSpace() : undefined)
        .forward((node) => {
          const own = listed ? node.attr("role", "presentation") : listbox(node)
          return aligned && !listed ? own.attr("style", withStyle(node.attrs.style, scrolling)) : own
        }))

    const list = p.part("div", (b) => {
      listed = true
      const own = listbox(b).attr("id", listId)
      return aligned ? own.forward((node) => node.attr("style", withStyle(node.attrs.style, scrolling))) : own
    })

    const arrowStyle = Positioning.arrowStyle(side)
    const arrowPart = p.part("div", (b) =>
      placed(b)
        .attr("id", arrowId)
        .attr("aria-hidden", "true")
        .attr("data-uncentered", flag(model.placement?.arrowUncentered))
        .forward((node) => node.attr("style", withStyle(node.attrs.style, arrowStyle))))
    const arrow = View.wrapPart(
      arrowPart,
      <B extends View.PartTarget<"div">>(element: B): ReturnType<B["attr"]> | undefined =>
        aligned ? undefined : arrowPart(element)
    )

    const itemPart = p.part("div", (b, value: string) => {
      const option = itemOf(value)
      const selected = chosen.has(value)
      const active = highlighted === value
      const off = option.disabled === true
      return b
        .attr("id", itemId(value))
        .attr("role", "option")
        .attr("aria-selected", String(selected))
        .attr("aria-disabled", off ? "true" : undefined)
        .attr("tabindex", open && active ? "0" : "-1")
        .attr("data-selected", flag(selected))
        .attr("data-highlighted", flag(active))
        .attr("data-disabled", flag(off))
        .on("mouseenter", () => hovers ? Message.EnteredItem({ value }) : undefined)
        .on("mouseleave", () => hovers ? Message.LeftItem() : undefined)
        .on("mousedown", Message.PressedItem())
        .on(
          "mouseup",
          ({ pointerType }) => pointerType === "touch" ? undefined : Message.ReleasedItem({ value, pointerType })
        )
        .onClick(({ pointerType }) => Message.ClickedItem({ value, pointerType }))
    })
    const item = View.wrapPart(
      itemPart,
      <B extends View.PartTarget<"div"> & { readonly key: (key: string) => View.PartTarget<"div"> }>(
        element: B,
        value: string
      ): ReturnType<B["attr"]> => itemPart(element.key(value), value)
    )

    const itemText = p.part("div", (b) => b.attr("data-select-item-text", ""))

    const indicatorPart = p.part("span", (b) => b.attr("aria-hidden", "true"))
    const itemIndicator = View.wrapPart(
      indicatorPart,
      <B extends View.PartTarget<"span">>(
        element: B,
        value: string,
        keepMounted?: boolean
      ): ReturnType<B["attr"]> | undefined =>
        chosen.has(itemOf(value).value) || keepMounted === true ? indicatorPart(element) : undefined
    )

    const group = p.part("div", (b, key: string) => b.attr("role", "group").attr("aria-labelledby", groupLabelId(key)))
    const groupLabel = p.part("div", (b, key: string) => b.attr("id", groupLabelId(key)).attr("aria-hidden", "true"))
    const separator = p.part("div", (b) => separatorAttrs(b, "horizontal"))

    const scrollArrow = (direction: "up" | "down") => {
      const visible = (direction === "up" ? model.scrollUp : model.scrollDown) && !touch && shown
      const part = p.part("div", (b) =>
        b.attr("aria-hidden", "true")
          .attr("data-select-scroll-arrow", direction)
          .attr("data-direction", direction)
          .attr("data-side", shownSide)
          .attr("data-visible", flag(visible))
          .forward((node) => node.attr("style", withStyle(node.attrs.style, "position:absolute"))))
      return View.wrapPart(
        part,
        <B extends View.PartTarget<"div">>(element: B, keepMounted?: boolean): ReturnType<B["attr"]> | undefined =>
          visible || keepMounted === true ? part(element) : undefined
      )
    }

    const finalFocus = p.part((b) => b.attr("data-final-focus", popupId))

    return {
      open,
      mounted: shown,
      transitionStatus,
      selected: props.value ?? null,
      placeholder: !filled,
      disabled,
      readOnly,
      required,
      multiple,
      side: shownSide,
      align,
      alignedWithTrigger: shown && aligned,
      highlighted,
      openMethod: open ? model.openMethod : null,
      label,
      trigger,
      value,
      icon,
      backdrop,
      positioner,
      popup,
      list,
      arrow,
      item,
      itemText,
      itemIndicator,
      group,
      groupLabel,
      separator,
      scrollUpArrow: scrollArrow("up"),
      scrollDownArrow: scrollArrow("down"),
      finalFocus
    }
  }
})
