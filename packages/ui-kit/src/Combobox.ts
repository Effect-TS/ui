/**
 * An input that filters a list of options as the user types, and picks one
 * or more of them.
 *
 * `Combobox` is headless: it owns the keyboard and pointer behaviour, the
 * filtering, focus, placement, the data attributes and the form inputs, and
 * the consumer draws the markup. The consumer owns whether the popup is
 * open, what's selected and the input's text, passes them as `open`,
 * `value` and `inputValue`, and stores what the `Opened`, `Dismissed`,
 * `Picked` and `EditedInput` events report. Values are strings, and
 * `items` lists every option with its label. The combobox filters them and
 * hands back `combobox.items`, the ones to draw.
 *
 * **Anatomy**
 *
 * | Part            | Element                                                   |
 * | :-------------- | :-------------------------------------------------------- |
 * | `inputGroup`    | `<div>` around the input and its buttons, the anchor    |
 * | `input`         | `<input>`, the combobox                                  |
 * | `trigger`       | `<button>` that toggles the popup                        |
 * | `icon`          | `<span>` inside the trigger                              |
 * | `clear`         | `<button>` that clears the text and the value            |
 * | `chips`         | `<div>` around the chips and the input, with `multiple` |
 * | `chip`          | `<div>`, one per selected value                          |
 * | `chipRemove`    | `<button>` inside a chip                                 |
 * | `label`         | `<div>` that names the trigger, with `inputInPopup`     |
 * | `value`         | `<span>` inside the trigger, with `inputInPopup`        |
 * | `backdrop`      | `<div>`, a manual popover under the positioner           |
 * | `positioner`    | `<div>`, a manual popover placed by the combobox         |
 * | `popup`         | `<div>` inside the positioner                            |
 * | `arrow`         | `<div>` inside the popup                                 |
 * | `list`          | `<div>` around the items                                 |
 * | `row`           | `<div>` around a row of items, with `grid`              |
 * | `item`          | `<div>`, one per drawn value, inside the list            |
 * | `itemIndicator` | `<span>` inside an item, shown while it's selected       |
 * | `group`         | `<div>` around items                                     |
 * | `groupLabel`    | `<div>` inside a group                                   |
 * | `separator`     | `<div>` between items                                    |
 * | `empty`         | `<div>`, its children drawn while no item matches        |
 * | `status`        | `<div>`, a live region for a message such as a count     |
 * | `finalFocus`    | any focusable element, focused on close                   |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, and the consumer adds the children. `item`, `itemIndicator`,
 * `chip` and `chipRemove` take the value as well, and `group` and
 * `groupLabel` the group's key. `item` and `chip` key their element with
 * the value. `clear` and `itemIndicator` return `undefined` while they're
 * hidden; `keepMounted` keeps them drawn. `empty` drops its children while
 * the list has items, so the live region stays in the page.
 *
 * Draw `combobox.items`, not `items`: it's the filtered list, which keeps
 * its contents while the popup animates out. `combobox.groups` splits it
 * by each item's `group`, dropping groups with nothing left, and each
 * group's `rows` splits it again by `row`, for `grid`. Every value drawn
 * with `item` has to be in `items` or `filteredItems`.
 *
 * Focus stays in the input: the highlighted item is named by
 * `aria-activedescendant`, and presses on the trigger, the clear button,
 * the chips and the items don't take focus. In a `Field`, draw it as
 * `combobox.input(field.control(h.input))` and name it with `field.label`.
 *
 * With `inputInPopup`, the trigger is the combobox and shows the selected
 * label in `value`, the popup is a dialog, and opening moves focus to the
 * input inside it. Name the trigger with `label`.
 *
 * With `inline`, the list is drawn without a popup, as in a command
 * palette: it's always expanded, and the arrow keys move through it while
 * `open` is false.
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
 * - `--anchor-width`, `--anchor-height`: the anchor's size
 * - `--available-width`, `--available-height`: the space between the
 *   anchor and the edge of the collision boundary, for a `max-height`
 *
 * Set on the popup: `--transform-origin`, the point the popup grows from.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent, except `data-side`,
 * `data-align`, `data-popup-side` and `data-orientation`, which hold a
 * value:
 *
 * - `input`: `data-popup-open`, `data-pressed`, `data-popup-side`,
 *   `data-list-empty`, `data-disabled`, `data-readonly`,
 *   `data-required`
 * - `inputGroup`: as on the input, without `data-required`, and with
 *   `data-placeholder`
 * - `trigger`: as on the input, and `data-placeholder`
 * - `icon`: `data-popup-open`
 * - `clear`: `data-popup-open`, `data-disabled`, `data-visible`
 * - `value`: `data-placeholder`
 * - `chip`, `chipRemove`: `data-disabled`
 * - `backdrop`: `data-open` / `data-closed`, `data-starting-style`,
 *   `data-ending-style`
 * - `positioner`: as on the backdrop, and `data-side`, `data-align`,
 *   `data-anchor-hidden`, `data-empty`
 * - `popup`: as on the positioner
 * - `arrow`: as on the backdrop, and `data-side`, `data-align`,
 *   `data-uncentered`
 * - `list`: `data-empty`
 * - `item`: `data-selected`, `data-highlighted`, `data-disabled`
 * - `separator`: `data-orientation`
 *
 * **Keyboard**
 *
 * In the input, ArrowDown and ArrowUp open the popup on the selected item,
 * or on the first or, for ArrowUp, the last item, and then move the
 * highlight. Past either end the highlight leaves the list, and the next
 * press wraps around; with `loopFocus: false` it stops at the ends. Enter
 * picks the highlighted item, and with nothing highlighted it closes the
 * popup on its keyup, leaving the keydown to submit a form. Space picks the
 * highlighted item while the input is empty. Escape closes the popup, and
 * on a closed combobox clears the text and the value. Typing opens the
 * popup. Keys pressed while an IME composes text are left alone.
 *
 * With `grid`, ArrowLeft and ArrowRight move between the items of a row
 * once one is highlighted. With chips, ArrowLeft with the caret at the
 * start of the input moves focus to the last chip, and Backspace in an
 * empty input removes the last value. On a chip, ArrowLeft and ArrowRight
 * move between chips and back to the input, Backspace and Delete remove
 * it, and Enter, Space, a letter, ArrowDown and ArrowUp return to the
 * input, the arrows opening the popup. `dir: "rtl"` mirrors the
 * horizontal arrows.
 *
 * With `inputInPopup`, ArrowDown and ArrowUp on the trigger open the
 * popup, and typing a letter on the closed trigger selects the next
 * matching item without opening.
 *
 * **Form**
 *
 * With `name`, `required` or `autoComplete`, the input, or the trigger
 * with `inputInPopup`, is wrapped in a `display: contents` span that
 * holds a visually hidden input, so `required` blocks a form's submission,
 * the browser can autofill it, and the value is submitted. Autofill picks
 * the item whose value, then whose label, matches. A `multiple` combobox
 * submits one hidden input per value. An empty string counts as no value.
 *
 * **Limits**
 *
 * Props can't hold functions, so `filter` names a matcher and a consumer
 * with its own filter passes the result as `filteredItems`, or sets
 * `filter: "none"` and filters the `items` it passes, as for results
 * fetched while typing. `makeComboboxFilter` gives the combobox's matchers
 * to a consumer's own filter. There are no `default*` props or refs, no
 * portal, and items are `{ value, label }` rather than any object.
 *
 * **Example** (A fruit picker in a field, with the open state, the value and the text in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Combobox, Field } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const fruits = [
 *   { value: "apple", label: "Apple" },
 *   { value: "banana", label: "Banana" },
 *   { value: "grape", label: "Grape" }
 * ]
 *
 * const PickerMessage = UiSchema.TaggedEnum({
 *   ToggledFruits: { open: Schema.Boolean },
 *   PickedFruit: { fruit: Schema.NullOr(Schema.String) },
 *   EditedText: { text: Schema.String }
 * })
 *
 * const Picker = Component.define({
 *   name: "Picker",
 *   model: Schema.Struct({ open: Schema.Boolean, fruit: Schema.NullOr(Schema.String), text: Schema.String }),
 *   message: PickerMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ open: false, fruit: "banana", text: "Banana" }),
 *   update: {
 *     ToggledFruits: (model, { open }) => ({ ...model, open }),
 *     PickedFruit: (model, { fruit }) => ({ ...model, fruit }),
 *     EditedText: (model, { text }) => ({ ...model, text })
 *   },
 *   view: (model, h) =>
 *     Field(h, {
 *       props: { filled: model.fruit !== null },
 *       view: (field) =>
 *         Combobox(h, {
 *           props: { open: model.open, value: model.fruit, inputValue: model.text, items: fruits, name: "fruit" },
 *           onEmit: {
 *             Opened: () => PickerMessage.ToggledFruits({ open: true }),
 *             Dismissed: () => PickerMessage.ToggledFruits({ open: false }),
 *             Picked: ({ value }) => PickerMessage.PickedFruit({ fruit: typeof value === "string" ? value : null }),
 *             EditedInput: ({ inputValue }) => PickerMessage.EditedText({ text: inputValue }),
 *             Highlighted: () => undefined,
 *             Settled: () => undefined
 *           },
 *           view: (combobox) =>
 *             field.root(h.div).children(
 *               field.label(h.label).children("Fruit"),
 *               combobox.inputGroup(h.div).children(
 *                 combobox.input(field.control(h.input)),
 *                 combobox.clear(h.button)?.children("×"),
 *                 combobox.trigger(h.button).children(combobox.icon(h.span).children("▾"))
 *               ),
 *               combobox.positioner(h.div).children(
 *                 combobox.popup(h.div).children(
 *                   combobox.empty(h.div).children("No fruit found"),
 *                   combobox.list(h.div).children(
 *                     ...combobox.items.map(({ label, value }) =>
 *                       combobox.item(h.div, value).children(
 *                         label,
 *                         combobox.itemIndicator(h.span, value)?.children("✓")
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
 * // The input is a combobox that shows the selected fruit.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Picker, {}))
 * if (!/<input[^>]* role="combobox"/.test(html) || !/<input[^>]* value="Banana"/.test(html)) {
 *   throw new Error("the input doesn't show the fruit")
 * }
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
  separatorAttrs,
  visuallyHidden,
  withStyle
} from "./internal/attributes.ts"
import { backdropBox, blockers, cutPath } from "./internal/blocker.ts"
import { byAttribute, focusFinal } from "./internal/dom.ts"
import { autofillMatch, filledOf, formInputs, toggled, valuesOf } from "./internal/formInputs.ts"
import { methodOf } from "./internal/interaction.ts"
import { available, keyed, type Loop, stepped } from "./internal/list.ts"
import { hideOthers, holdScroll, nextLayerOrder } from "./internal/modal.ts"
import { listenOutside, releasedOutside } from "./internal/outside.ts"
import { raiseAbove } from "./internal/topLayer.ts"
import { frameOf, settling, statusOf, transitionAttrs } from "./internal/transition.ts"
import { printable, typeahead } from "./internal/typeahead.ts"
import * as Positioning from "./Positioning.ts"

/**
 * One option of a `Combobox`.
 *
 * **Details**
 *
 * - `value`: what's selected and submitted. Unique among the items.
 * - `label`: the text matched while filtering, put in the input when the
 *   item is picked, and shown in the `value` part.
 * - `disabled`: the item can be highlighted but not picked.
 * - `group`: the key of the group it's drawn in, for `combobox.groups`.
 * - `row`: the row it's drawn in, for `grid`. Neighbouring items of a group
 *   with the same `row` share a row.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ComboboxItem = Schema.Struct({
  value: Schema.String,
  label: Schema.String,
  disabled: Schema.optional(Schema.Boolean),
  group: Schema.optional(Schema.String),
  row: Schema.optional(Schema.Number)
})

/**
 * One option of a `Combobox`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ComboboxItem = typeof ComboboxItem.Type

/**
 * What a `Combobox` holds: the selected value, the values with
 * `multiple`, or `null` for none.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ComboboxValue = Schema.NullOr(Schema.Union([Schema.String, Schema.Array(Schema.String)]))

/**
 * What a `Combobox` holds.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ComboboxValue = typeof ComboboxValue.Type

/**
 * How the combobox was opened or closed: `"keyboard"` for a key or a
 * click from no pointer.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ComboboxInteraction = Schema.Literals(["mouse", "touch", "pen", "keyboard"])

/**
 * How the combobox was opened or closed.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ComboboxInteraction = typeof ComboboxInteraction.Type

/**
 * Why a `Combobox` asks to open, close or change its value or its text.
 *
 * **Details**
 *
 * - `"trigger-press"`: a press on the trigger
 * - `"input-press"`: a press on the input or the input group
 * - `"outside-press"`: a press outside the combobox and the popup, other
 *   than on a scrollbar
 * - `"item-press"`: an item was picked, with the pointer or the keyboard
 * - `"close-press"`: the visually hidden dismiss button in the popup, for
 *   screen readers
 * - `"escape-key"`: Escape in the input
 * - `"list-navigation"`: ArrowDown or ArrowUp opened the popup
 * - `"focus-out"`: focus left the combobox and the popup
 * - `"input-change"`: the user edited the input's text
 * - `"input-clear"`: the combobox cleared the text, or the user emptied
 *   it, which clears a single value
 * - `"clear-press"`: the clear button
 * - `"chip-remove-press"`: a chip's remove button
 * - `"cancel-open"`: the press that opened it was released away from the
 *   trigger and the popup
 * - `"none"`: anything else, such as typeahead on the trigger, autofill,
 *   Backspace removing a chip, or the selected label put back in the input
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ComboboxChangeReason = Schema.Literals([
  "trigger-press",
  "input-press",
  "outside-press",
  "item-press",
  "close-press",
  "escape-key",
  "list-navigation",
  "focus-out",
  "input-change",
  "input-clear",
  "clear-press",
  "chip-remove-press",
  "cancel-open",
  "none"
])

/**
 * Why a `Combobox` asks to open, close or change its value or its text.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ComboboxChangeReason = typeof ComboboxChangeReason.Type

/**
 * What moved the highlight: `"keyboard"`, `"pointer"`, or
 * `"none"` for the combobox itself, as when it opens or the list
 * changes.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ComboboxHighlightReason = Schema.Literals(["keyboard", "pointer", "none"])

/**
 * What moved the highlight.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ComboboxHighlightReason = typeof ComboboxHighlightReason.Type

/**
 * How a `Combobox` matches its items against the text.
 *
 * **Details**
 *
 * - `"contains"`: the label contains the text
 * - `"startsWith"`: the label starts with it
 * - `"endsWith"`: the label ends with it
 * - `"none"`: every item is drawn, for a consumer that filters `items`
 *   itself
 *
 * Matching ignores case, accents and punctuation, in the `locale`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ComboboxFilterMode = Schema.Literals(["contains", "startsWith", "endsWith", "none"])

/**
 * How a `Combobox` matches its items against the text.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ComboboxFilterMode = typeof ComboboxFilterMode.Type

/**
 * The props of a `Combobox`.
 *
 * **Details**
 *
 * - `open`: whether the popup shows. The combobox only asks, with
 *   `Opened` and `Dismissed`.
 * - `inputValue`: the input's text. The combobox only asks, with
 *   `EditedInput`.
 * - `items`: every option, in the order they're drawn.
 * - `value`: the selected value, or values with `multiple`. `null` when
 *   left out. The combobox only asks, with `Picked`.
 * - `multiple`: more than one item can be selected, and picking one
 *   leaves the popup open unless the text filtered the list. False when
 *   left out.
 * - `filter`: how the text matches the items. `"contains"` when left out.
 * - `filteredItems`: the items to draw, from the consumer's own filter,
 *   in place of `filter`.
 * - `locale`: the locale the filter compares in. The runtime's when left
 *   out.
 * - `limit`: the most items drawn. All of them when left out.
 * - `autoHighlight`: typing highlights the first match, so Enter picks
 *   it. False when left out.
 * - `highlightItemOnHover`: the pointer highlights the item it's over.
 *   True when left out.
 * - `loopFocus`: the arrow keys go past the ends of the list and around.
 *   True when left out.
 * - `openOnInputClick`: a press on the input opens the popup. True when
 *   left out.
 * - `inputInPopup`: the input is drawn inside the popup, and the trigger
 *   is the combobox. False when left out.
 * - `inline`: the list is drawn without a popup and is always expanded.
 *   False when left out.
 * - `grid`: the items are drawn in rows, by their `row`, and the list is
 *   a grid. False when left out.
 * - `virtualized`: the consumer draws only some of the items, so the
 *   combobox doesn't scroll the highlighted one into view; scroll to it on
 *   `Highlighted`. False when left out.
 * - `placeholder`: the `value` part's text while nothing is selected.
 * - `disabled`, `readOnly`, `required`: as on a native `<input>`.
 *   A read-only combobox opens and can be browsed but not changed.
 * - `name`, `form`, `autoComplete`: the form field.
 * - `id`: the input's id, or the trigger's with `inputInPopup`, unless
 *   the builder has one. Generated when left out.
 * - `dir`: the writing direction, for the horizontal arrow keys. `"ltr"`
 *   when left out.
 * - `modal`: while open, the page doesn't scroll and a press outside only
 *   closes the popup. False when left out.
 * - `finalFocus`: with `inputInPopup`, on close, focus goes back to the
 *   trigger, or to a `finalFocus` part. False leaves it where it is. True
 *   when left out.
 * - `holdExit`: keeps the closing popup shown, for an exit animation the
 *   consumer ends by clearing it.
 * - the `Positioning.PositionerFields`, for the popup. `side` is
 *   `"bottom"` when left out, and the anchor is the input group, or the
 *   input without one, or the trigger with `inputInPopup`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ComboboxProps = Schema.Struct({
  open: Schema.Boolean,
  inputValue: Schema.String,
  items: Schema.Array(ComboboxItem),
  value: Schema.optional(ComboboxValue),
  multiple: Schema.optional(Schema.Boolean),
  filter: Schema.optional(ComboboxFilterMode),
  filteredItems: Schema.optional(Schema.Array(ComboboxItem)),
  locale: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number),
  autoHighlight: Schema.optional(Schema.Boolean),
  highlightItemOnHover: Schema.optional(Schema.Boolean),
  loopFocus: Schema.optional(Schema.Boolean),
  openOnInputClick: Schema.optional(Schema.Boolean),
  inputInPopup: Schema.optional(Schema.Boolean),
  inline: Schema.optional(Schema.Boolean),
  grid: Schema.optional(Schema.Boolean),
  virtualized: Schema.optional(Schema.Boolean),
  placeholder: Schema.optional(Schema.String),
  disabled: Schema.optional(Schema.Boolean),
  readOnly: Schema.optional(Schema.Boolean),
  required: Schema.optional(Schema.Boolean),
  name: Schema.optional(Schema.String),
  form: Schema.optional(Schema.String),
  autoComplete: Schema.optional(Schema.String),
  id: Schema.optional(Schema.String),
  dir: Schema.optional(Schema.Literals(["ltr", "rtl"])),
  modal: Schema.optional(Schema.Boolean),
  finalFocus: Schema.optional(Schema.Boolean),
  holdExit: Schema.optional(Schema.Boolean),
  ...Positioning.PositionerFields
})

/**
 * The props of a `Combobox`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ComboboxProps = typeof ComboboxProps.Type

/**
 * What a `Combobox` asks of its parent.
 *
 * **Details**
 *
 * - `Opened`: set `open` to true.
 * - `Dismissed`: set `open` to false.
 * - `Picked`: set `value` to `value`, the whole new selection.
 * - `EditedInput`: set `inputValue` to `inputValue`. A single pick
 *   reports the picked label, and after the popup closes the combobox puts
 *   the selected label back, or clears the text with `multiple` or
 *   `inputInPopup`.
 * - `Highlighted`: the highlighted item changed, to `value` at `index` in
 *   `combobox.items`, or to none with `null` and `-1`. For a virtualized
 *   list to scroll to it.
 * - `Settled`: the popup's transitions ended, after it opened or closed.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ComboboxEvents = UiSchema.TaggedEnum({
  Opened: { reason: ComboboxChangeReason },
  Dismissed: { reason: ComboboxChangeReason },
  Picked: { value: ComboboxValue, reason: ComboboxChangeReason },
  EditedInput: { inputValue: Schema.String, reason: ComboboxChangeReason },
  Highlighted: { value: Schema.NullOr(Schema.String), index: Schema.Number, reason: ComboboxHighlightReason },
  Settled: { open: Schema.Boolean }
})

/**
 * What a `Combobox` asks of its parent.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ComboboxEvents = typeof ComboboxEvents.Type

/**
 * Where a combobox's popup is in its transitions: `"starting"` for the
 * first frame after it opens, `"ending"` while it closes, `null`
 * otherwise.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type ComboboxTransitionStatus = "starting" | "ending" | null

/**
 * A run of items to draw under one group label: the items whose `group`
 * is `key`, in order, and the same items split into rows by their
 * `row`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ComboboxGroup {
  readonly key: string | undefined
  readonly items: ReadonlyArray<ComboboxItem>
  readonly rows: ReadonlyArray<ReadonlyArray<ComboboxItem>>
}

/**
 * The matchers a `Combobox` filters with, for a consumer's own filter.
 *
 * **Details**
 *
 * Each takes an item's text and the query, and ignores case, accents and
 * punctuation. An empty query matches everything.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ComboboxFilter {
  readonly contains: (text: string, query: string) => boolean
  readonly startsWith: (text: string, query: string) => boolean
  readonly endsWith: (text: string, query: string) => boolean
}

const filters = new Map<string, ComboboxFilter>()

/**
 * The `ComboboxFilter` for a locale, the runtime's when left out. It's
 * cached, so calling it for each render is cheap.
 *
 * **Example** (Filtering items the consumer fetched)
 *
 * ```ts
 * import { makeComboboxFilter } from "@effect/ui-kit"
 *
 * const filter = makeComboboxFilter("fr")
 * filter.startsWith("Éclair", "ecl") // true
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const makeComboboxFilter = (locale?: string | undefined): ComboboxFilter => {
  const cached = filters.get(locale ?? "")
  if (cached !== undefined) return cached
  const collator = new Intl.Collator(locale, { usage: "search", sensitivity: "base", ignorePunctuation: true })
  const same = (a: string, b: string) => collator.compare(a, b) === 0
  const filter: ComboboxFilter = {
    contains: (text, query) => {
      if (query === "") return true
      for (let at = 0; at <= text.length - query.length; at++) {
        if (same(text.slice(at, at + query.length), query)) return true
      }
      return false
    },
    startsWith: (text, query) => query === "" || same(text.slice(0, query.length), query),
    endsWith: (text, query) =>
      query === "" || (text.length >= query.length && same(text.slice(text.length - query.length), query))
  }
  filters.set(locale ?? "", filter)
  return filter
}

const Message = UiSchema.TaggedEnum({
  PressedInput: { pointerType: Schema.String },
  PressedGroup: { pointerType: Schema.String },
  ChangedInput: { value: Schema.String, inputType: Schema.String, composing: Schema.Boolean },
  PressedInputKey: { key: Schema.String, chips: Schema.Boolean },
  ReleasedInputKey: { key: Schema.String },
  FocusedInput: {},
  BlurredInput: {},
  PressedTrigger: { pointerType: Schema.String },
  ReleasedTrigger: {},
  ClickedTrigger: { pointerType: Schema.String },
  PressedTriggerKey: { key: Schema.String },
  ClickedLabel: {},
  FocusedFormInput: {},
  Autofilled: { value: Schema.String },
  PressedClear: {},
  RemovedChip: { value: Schema.String, reason: ComboboxChangeReason },
  OpenedFromChip: { key: Schema.String },
  EnteredItem: { value: Schema.String },
  LeftItem: {},
  PressedItem: { value: Schema.String },
  ReleasedItem: { value: Schema.String, button: Schema.Number },
  ClickedItem: { value: Schema.String, pointerType: Schema.String },
  PressedDismiss: {},
  CompletedWaitBeforeResetTyping: {},
  ShowedPopup: {},
  RenderedFirstFrame: {},
  FinishedTransition: { open: Schema.Boolean },
  ChangedPlacement: { placement: Positioning.Placement },
  PressedOutside: { pointerType: Schema.String },
  FocusedOutside: {},
  ReleasedPointer: { outside: Schema.Boolean }
})

type Message = typeof Message.Type

const Model = Schema.Struct({
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  openMethod: Schema.NullOr(ComboboxInteraction),
  closeMethod: Schema.NullOr(ComboboxInteraction),
  focusLeft: Schema.Boolean,
  active: Schema.NullOr(Schema.String),
  activeByKey: Schema.Boolean,
  autoFirst: Schema.Boolean,
  saved: Schema.NullOr(Schema.String),
  queryChanged: Schema.Boolean,
  closeQuery: Schema.NullOr(Schema.String),
  pressedItem: Schema.NullOr(Schema.String),
  pressing: Schema.Boolean,
  typed: Schema.String,
  typedFrom: Schema.Number,
  matched: Schema.Number,
  placement: Schema.NullOr(Positioning.Placement)
})

type Model = typeof Model.Type

type ComboboxUpdate = Component.Update<Model, Message, ComboboxEvents, ComboboxProps>

const Input = Html.ref("ComboboxInput", "input")
const Trigger = Html.ref("ComboboxTrigger", "button")
const Chip = Html.ref("ComboboxChip", "div")

const WaitBeforeResetTyping = Command.make(
  "WaitBeforeResetTyping",
  { args: {}, mode: "switch" },
  () => Effect.as(Effect.sleep(Duration.millis(750)), Message.CompletedWaitBeforeResetTyping())
)

const lockedOf = (props: ComboboxProps): boolean => props.disabled === true || props.readOnly === true

const navigableOf = (props: ComboboxProps): boolean => props.open || props.inline === true

const itemOf = (props: ComboboxProps, value: string): ComboboxItem | undefined =>
  props.items.find((item) => item.value === value) ?? props.filteredItems?.find((item) => item.value === value)

const selectedLabelOf = (props: ComboboxProps): string => {
  if (props.multiple === true) return ""
  const value = valuesOf(props)[0]
  return value === undefined || value === "" ? "" : itemOf(props, value)?.label ?? value
}

const queryOf = (model: Model, props: ComboboxProps, open: boolean): string =>
  !open && model.closeQuery !== null ? model.closeQuery : props.inputValue.trim()

const bypassed = (model: Model, props: ComboboxProps, query: string): boolean => {
  if (props.multiple === true || model.queryChanged || query === "") return false
  const label = selectedLabelOf(props)
  return label.length === query.length && makeComboboxFilter(props.locale).contains(label, query)
}

const shownOf = (model: Model, props: ComboboxProps, open = props.open): ReadonlyArray<ComboboxItem> => {
  const query = queryOf(model, props, open)
  const bypass = bypassed(model, props, query)
  if (props.filteredItems !== undefined && !bypass) return props.filteredItems
  const filter = props.filter ?? "contains"
  const match = makeComboboxFilter(props.locale)
  const text = bypass ? "" : query
  const limit = props.limit ?? -1
  const shown: Array<ComboboxItem> = []
  for (const item of props.items) {
    if (limit > -1 && shown.length >= limit) break
    if (filter === "none" || match[filter](item.label, text)) shown.push(item)
  }
  return shown
}

const highlightedOf = (model: Model, shown: ReadonlyArray<ComboboxItem>): string | null =>
  model.active !== null && shown.some((item) => item.value === model.active)
    ? model.active
    : model.autoFirst
    ? shown[0]?.value ?? null
    : null

const rowsOf = (items: ReadonlyArray<ComboboxItem>): ReadonlyArray<ReadonlyArray<number>> => {
  const rows: Array<Array<number>> = []
  items.forEach((item, index) => {
    const before = items[index - 1]
    const last = rows[rows.length - 1]
    if (
      last !== undefined && before !== undefined && item.row !== undefined && before.row === item.row &&
      before.group === item.group
    ) last.push(index)
    else rows.push([index])
  })
  return rows
}

const groupsOf = (items: ReadonlyArray<ComboboxItem>): ReadonlyArray<ComboboxGroup> => {
  const groups: Array<{ key: string | undefined; items: Array<ComboboxItem> }> = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last !== undefined && last.key === item.group) last.items.push(item)
    else groups.push({ key: item.group, items: [item] })
  }
  return groups.map(({ items, key }) => ({
    key,
    items,
    rows: rowsOf(items).map((row) => row.map((index) => items[index]!))
  }))
}

type ComboboxStep = Component.Step<Model, Message, ComboboxEvents>

const focus = (step: ComboboxStep, ref: typeof Input | typeof Trigger | typeof Chip): ComboboxStep =>
  step.run(Html.Focus({ ref }).pipe(Command.asNoop))

const focusInput = (_model: Model, _message: unknown, $: ComboboxUpdate) =>
  focus($, $.props.inputInPopup === true && !$.props.open ? Trigger : Input)

const rewrite = (
  step: ComboboxStep,
  props: ComboboxProps,
  inputValue: string,
  reason: ComboboxChangeReason
): ComboboxStep =>
  props.inputValue === inputValue ? step : step.emit(ComboboxEvents.EditedInput({ inputValue, reason }))

const highlight = (
  step: ComboboxStep,
  shown: ReadonlyArray<ComboboxItem>,
  value: string | null,
  reason: ComboboxHighlightReason,
  byKey = false
): ComboboxStep => {
  const before = highlightedOf(step.model, shown)
  const next = step.evolve({ active: value, activeByKey: byKey, autoFirst: false })
  return before === value ? next : next.emit(
    ComboboxEvents.Highlighted({
      value,
      index: value === null ? -1 : shown.findIndex((item) => item.value === value),
      reason
    })
  )
}

const unhighlight = (
  step: ComboboxStep,
  props: ComboboxProps,
  reason: ComboboxHighlightReason,
  listed = step.model
): ComboboxStep =>
  step.model.active === null && !step.model.autoFirst
    ? step.evolve({ activeByKey: false })
    : highlight(step, shownOf(listed, props), null, reason)

const open = (
  step: ComboboxStep,
  props: ComboboxProps,
  reason: ComboboxChangeReason,
  method: ComboboxInteraction,
  key?: string
): ComboboxStep => {
  if (props.open || props.disabled === true) return step
  let next = step
  let inputValue = props.inputValue
  const closeQuery = next.model.closeQuery
  if (closeQuery !== null) {
    const typed = reason === "input-change"
    const label = selectedLabelOf(props)
    const clears = !typed && props.inputInPopup === true && props.inline !== true && inputValue !== "" &&
      (inputValue.trim() === closeQuery || inputValue === label)
    const matchesSelected = props.multiple !== true && props.inputInPopup !== true && inputValue === label
    if (!typed && (clears || inputValue === "" || matchesSelected)) next = next.evolve({ queryChanged: false })
    next = next.evolve({ closeQuery: null })
    if (clears) {
      next = rewrite(next, props, "", "input-clear")
      inputValue = ""
    }
  }
  next = next.evolve({
    openMethod: method,
    closeMethod: null,
    focusLeft: false,
    pressedItem: null,
    typed: "",
    pressing: reason === "trigger-press" && props.inputInPopup === true && (method === "mouse" || method === "pen")
  }).emit(ComboboxEvents.Opened({ reason }))
  const shown = shownOf(next.model, { ...props, open: true, inputValue }, true)
  let target: string | null = null
  if (reason !== "input-change" && !next.model.queryChanged) {
    const chosen = new Set(valuesOf(props))
    target = shown.find((item) => chosen.has(item.value))?.value ?? null
    if (target === null && reason === "list-navigation") {
      target = (key === "ArrowUp" ? shown[shown.length - 1] : shown[0])?.value ?? null
    }
  }
  next = highlight(next, shown, target, method === "keyboard" ? "keyboard" : "none", method === "keyboard")
  return reason === "input-change" && props.autoHighlight === true ? next.evolve({ autoFirst: true }) : next
}

const dismiss = (
  step: ComboboxStep,
  props: ComboboxProps,
  reason: ComboboxChangeReason,
  method: ComboboxInteraction | null,
  focusLeft = false
): ComboboxStep => {
  if (!props.open) return step
  let next = step
  const inline = props.inline === true
  if (next.model.queryChanged) {
    const query = props.inputValue.trim()
    if (!inline) next = next.evolve({ closeQuery: query })
    if (props.multiple !== true) {
      if (query === "") next = next.evolve({ queryChanged: false })
    } else {
      if (props.inputInPopup === true) next = unhighlight(next, props, "none")
      if (props.inputInPopup !== true || inline) next = rewrite(next, props, "", "input-clear")
    }
  }
  return next.evolve({ closeMethod: method, focusLeft, pressing: false }).emit(ComboboxEvents.Dismissed({ reason }))
}

const toggle = (step: ComboboxStep, props: ComboboxProps, method: ComboboxInteraction): ComboboxStep =>
  props.disabled === true
    ? step
    : props.open
    ? dismiss(step, props, "trigger-press", method)
    : open(step, props, "trigger-press", method)

const pick = (step: ComboboxStep, props: ComboboxProps, value: string, method: ComboboxInteraction): ComboboxStep => {
  const item = itemOf(props, value)
  if (item === undefined || !available(item) || lockedOf(props)) return step
  if (props.multiple === true) {
    const picked = step.emit(ComboboxEvents.Picked({ value: toggled(valuesOf(props), value), reason: "item-press" }))
    if (props.inputValue.trim() === "") return picked
    return props.inputInPopup === true
      ? rewrite(picked, props, "", "input-clear")
      : dismiss(picked, props, "item-press", method)
  }
  const picked = step.emit(ComboboxEvents.Picked({ value, reason: "item-press" }))
  return dismiss(
    props.inputInPopup === true ? picked : rewrite(picked, props, item.label, "item-press"),
    props,
    "item-press",
    method
  )
}

const clear = (step: ComboboxStep, props: ComboboxProps, reason: ComboboxChangeReason): ComboboxStep => {
  const cleared = rewrite(step, props, "", reason)
  return filledOf(props)
    ? cleared.emit(ComboboxEvents.Picked({ value: props.multiple === true ? [] : null, reason }))
    : cleared
}

const navigate = (
  step: ComboboxStep,
  props: ComboboxProps,
  shown: ReadonlyArray<ComboboxItem>,
  key: string
): ComboboxStep => {
  const highlighted = highlightedOf(step.model, shown)
  const at = shown.findIndex((item) => item.value === highlighted)
  const last = shown.length - 1
  const loops = props.loopFocus !== false
  const loop: Loop = !loops ? "none" : props.autoHighlight === true ? "wrap" : "escape"
  let index: number
  if (props.grid === true && (key === "ArrowLeft" || key === "ArrowRight")) {
    index = stepped(at, last, (key === "ArrowRight") !== (props.dir === "rtl") ? 1 : -1, loops ? "wrap" : "none")
  } else if (props.grid === true && at !== -1) {
    const rows = rowsOf(shown)
    const row = rows.findIndex((cells) => cells.includes(at))
    const column = rows[row]!.indexOf(at)
    const next = rows[stepped(row, rows.length - 1, key === "ArrowDown" ? 1 : -1, loop)]
    index = next === undefined ? -1 : next[Math.min(column, next.length - 1)]!
  } else {
    index = stepped(at, last, key === "ArrowDown" ? 1 : -1, loop)
  }
  return highlight(step, shown, shown[index]?.value ?? null, "keyboard", true)
}

const edit = (
  step: ComboboxStep,
  props: ComboboxProps,
  value: string,
  inputType: string,
  composing: boolean
): ComboboxStep => {
  if (lockedOf(props)) return step
  const query = value.trim()
  const auto = props.autoHighlight === true
  const navigable = navigableOf(props)
  const inPopup = props.inputInPopup === true
  let next = step
  if (composing) {
    if (value === "" && props.openOnInputClick === false && !inPopup) next = dismiss(next, props, "input-clear", null)
    if (!props.open && query !== "") return open(next, props, "input-change", "keyboard")
    return navigable && !(auto && query !== "") ? unhighlight(next, props, "none", step.model) : next
  }
  const typed = inputType !== "" && inputType !== "insertReplacementText"
  next = next.emit(ComboboxEvents.EditedInput({ inputValue: value, reason: "input-change" }))
  if (typed) {
    if (query !== "") next = next.evolve({ queryChanged: true })
    if (props.open) next = next.evolve({ closeQuery: null })
  }
  if (value === "" && !inPopup) {
    if (props.multiple !== true && filledOf(props)) {
      next = next.emit(ComboboxEvents.Picked({ value: null, reason: "input-clear" }))
    }
    if (props.openOnInputClick === false) next = dismiss(next, props, "input-clear", null)
  }
  if (!props.open && typed && query !== "") {
    return open(next, { ...props, inputValue: value }, "input-change", "keyboard")
  }
  if (auto && typed) return next.evolve({ active: null, autoFirst: query !== "" })
  return navigable ? unhighlight(next, props, "none", step.model) : next
}

const removeChip = (
  step: ComboboxStep,
  props: ComboboxProps,
  value: string,
  reason: ComboboxChangeReason
): ComboboxStep => {
  if (lockedOf(props)) return step
  const values = valuesOf(props)
  if (!values.includes(value)) return step
  const removed = unhighlight(step, props, "keyboard").emit(
    ComboboxEvents.Picked({ value: values.filter((other) => other !== value), reason })
  )
  return reason === "chip-remove-press" ? focus(removed, Input) : removed
}

const hover = ($: ComboboxUpdate, value: string | null) =>
  $.props.highlightItemOnHover === false || !navigableOf($.props)
    ? $
    : value === null
    ? unhighlight($, $.props, "pointer")
    : highlight($, shownOf($.model, $.props), value, "pointer")

const pressInputKey = (step: ComboboxStep, props: ComboboxProps, key: string, chips: boolean): ComboboxStep => {
  const values = valuesOf(props)
  switch (key) {
    case "ArrowDown":
    case "ArrowUp":
      return navigableOf(props)
        ? navigate(step, props, shownOf(step.model, props), key)
        : open(step, props, "list-navigation", "keyboard", key)
    case "ArrowLeft":
    case "ArrowRight": {
      if (props.grid === true && navigableOf(props)) {
        const shown = shownOf(step.model, props)
        if (highlightedOf(step.model, shown) !== null) return navigate(step, props, shown, key)
      }
      return chips && values.length > 0 ? focus(step, Chip.at(values[values.length - 1]!)) : step
    }
    case "Enter":
    case " ": {
      const highlighted = highlightedOf(step.model, shownOf(step.model, props))
      return highlighted === null ? step : pick(step, props, highlighted, "keyboard")
    }
    case "Escape":
      return props.open ? dismiss(step, props, "escape-key", "keyboard") : clear(step, props, "escape-key")
    case "Backspace":
      return values.length > 0 ? removeChip(step, props, values[values.length - 1]!, "none") : step
    default:
      return step
  }
}

const ListArgs = Schema.Struct({
  active: Schema.NullOr(Schema.String),
  scroll: Schema.Boolean,
  query: Schema.String,
  virtualized: Schema.Boolean
})

type ListArgs = typeof ListArgs.Type

const scrollsY = (element: HTMLElement): boolean => {
  const view = element.ownerDocument.defaultView
  return view !== null && element.scrollHeight - element.clientHeight > 1 &&
    /auto|scroll|overlay/.test(view.getComputedStyle(element).overflowY)
}

const following = (document: Document, list: () => HTMLElement | null) => {
  const frame = frameOf(document.defaultView)
  let current: ListArgs | null = null
  const reveal = () =>
    frame(() => {
      if (current !== null && current.active !== null && !current.virtualized) {
        document.getElementById(current.active)?.scrollIntoView({ block: "nearest" })
      }
    })
  const toTop = () => {
    for (let at = list(); at !== null; at = at.parentElement) {
      if (scrollsY(at)) {
        at.scrollTop = 0
        return
      }
      if (at.hasAttribute("data-combobox-positioner")) return
    }
  }
  return (next: ListArgs | null) => {
    const previous = current
    current = next
    if (next === null || next.virtualized) return
    if (previous === null) reveal()
    else {
      if (next.query !== previous.query) toTop()
      if (next.active !== previous.active && next.scroll) reveal()
    }
  }
}

const TrackComboboxArgs = {
  position: Positioning.TrackPositionArgs,
  open: Schema.Boolean,
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  holdExit: Schema.Boolean,
  inputInPopup: Schema.Boolean,
  modal: Schema.Boolean,
  hide: Schema.Boolean,
  touch: Schema.Boolean,
  pressing: Schema.Boolean,
  finalFocus: Schema.Boolean,
  focusLeft: Schema.Boolean,
  closeMethod: Schema.NullOr(ComboboxInteraction),
  owner: Schema.String,
  popupId: Schema.String,
  listId: Schema.String,
  list: ListArgs
}

type TrackComboboxArgs = Schema.Struct<typeof TrackComboboxArgs>["Type"]

const blocking = blockers("data-combobox-blocker")

const watch = (node: HTMLElement, args: TrackComboboxArgs, changes: Stream.Stream<TrackComboboxArgs>) =>
  Stream.callback<Message>((queue) => {
    const document = node.ownerDocument
    const view = document.defaultView
    const frame = frameOf(view)
    let current = args
    const send = (message: Message) => Queue.offerUnsafe(queue, message)
    const popup = (): HTMLElement => document.getElementById(current.popupId) ?? node
    const list = (): HTMLElement | null => document.getElementById(current.listId)
    const owned = (): Array<HTMLElement> =>
      Array.from(document.querySelectorAll<HTMLElement>(attrSelector("data-combobox-inside", current.owner)))
    const find = (name: string): HTMLElement | null => byAttribute(document, name, current.owner)
    const inside = (target: Node): boolean =>
      (node.contains(target) && !blocking.is(target)) || owned().some((element) => element.contains(target))

    const cut = () => {
      const layer = Array.from(node.children).find(blocking.is) as HTMLElement | undefined
      if (layer === undefined) return
      const holes = owned().filter((element) => !node.contains(element)).map((element) =>
        element.getBoundingClientRect()
      )
      layer.style.setProperty("clip-path", cutPath(holes))
    }

    const order = nextLayerOrder()
    let release: (() => void) | undefined
    const hold = () => {
      release?.()
      release = undefined
      if (!current.open) return
      const unlock = current.modal ? holdScroll(node, current.touch) : undefined
      const shown = current.hide ? hideOthers(node, order, owned()) : undefined
      release = () => {
        unlock?.()
        shown?.()
      }
    }

    const opening = () => {
      send(Message.ShowedPopup())
      node.inert = false
      cut()
      if (current.inputInPopup) {
        const input = popup().querySelector<HTMLElement>(attrSelector("data-combobox-input", current.owner))
        ;(current.touch || input === null ? popup() : input).focus({ preventScroll: true })
      }
      if (!current.started) frame(() => frame(() => send(Message.RenderedFirstFrame())))
    }

    const closing = () => {
      const focused = document.activeElement
      const lost = focused === null || focused === document.body || node.contains(focused)
      if (current.inputInPopup && current.finalFocus && (lost || !current.focusLeft)) {
        focusFinal(document, current.popupId, find("data-combobox-trigger"), lost, current.closeMethod === "keyboard")
      } else if (focused instanceof HTMLElement && node.contains(focused)) {
        if (current.inputInPopup) focused.blur()
        else find("data-combobox-input")?.focus({ preventScroll: true })
      }
      node.inert = true
    }

    const onMouseUp = (event: MouseEvent) => {
      if (!current.pressing) return
      send(Message.ReleasedPointer({ outside: releasedOutside(event, inside, find("data-combobox-trigger")) }))
    }
    const onFocusIn = (event: FocusEvent) => {
      if (current.inputInPopup || current.touch || !current.open) return
      const target = event.target as Node | null
      if (target !== null && (target === popup() || list()?.contains(target) === true)) {
        find("data-combobox-input")?.focus({ preventScroll: true })
      }
    }
    const onMouseDown = (event: MouseEvent) => {
      if (event.target instanceof Node && blocking.is(event.target)) event.preventDefault()
    }

    const transition = settling(node, popup, frame, (open) => send(Message.FinishedTransition({ open })))
    const follow = following(document, list)

    const onChange = (next: TrackComboboxArgs) => {
      const previous = current
      current = next
      if (
        next.open !== previous.open || next.modal !== previous.modal || next.hide !== previous.hide ||
        next.touch !== previous.touch
      ) hold()
      if (previous.open && !next.open) closing()
      else if (!previous.open && next.open) opening()
      transition.follow(previous, next)
      follow(next.open ? next.list : null)
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
        document.addEventListener("mouseup", onMouseUp, { capture: true, signal })
        node.addEventListener("focusin", onFocusIn, { signal })
        node.addEventListener("mousedown", onMouseDown, { signal })
        hold()
        raiseAbove(node)
        if (current.open) opening()
        else node.inert = true
        follow(current.open ? current.list : null)
      }).pipe(
        Effect.tap(() => Effect.forkScoped(Stream.runForEach(changes, (next) => Effect.sync(() => onChange(next)))))
      ),
      () =>
        Effect.sync(() => {
          controller.abort()
          release?.()
          release = undefined
          transition.cancel()
          node.inert = false
        })
    )
  })

const TrackCombobox = Mount.makeStream(
  "TrackCombobox",
  { args: TrackComboboxArgs },
  (node: HTMLElement, args, changes) =>
    Stream.merge(
      watch(node, args, changes),
      Positioning.trackPosition(node, args.position, Stream.map(changes, (next) => next.position)).pipe(
        Stream.map((placement) => Message.ChangedPlacement({ placement }))
      )
    )
)

const TrackList = Mount.makeStream(
  "TrackComboboxList",
  { args: { list: ListArgs } },
  (node: HTMLElement, args, changes) =>
    Stream.callback<Message>(() => {
      const follow = following(node.ownerDocument, () => node)
      return Effect.sync(() => follow(args.list)).pipe(
        Effect.andThen(Effect.forkScoped(Stream.runForEach(changes, (next) => Effect.sync(() => follow(next.list)))))
      )
    })
)

const TrackChips = Mount.makeStream(
  "TrackComboboxChips",
  { args: { owner: Schema.String, rtl: Schema.Boolean, locked: Schema.Boolean } },
  (node: HTMLElement, args, changes) =>
    Stream.callback<Message>((queue) => {
      let current = args
      const send = (message: Message) => Queue.offerUnsafe(queue, message)
      const chips = () =>
        Array.from(node.querySelectorAll<HTMLElement>("[data-combobox-chip]")).filter((chip) =>
          chip.closest("[data-combobox-chips]") === node
        )
      const input = () => byAttribute(node.ownerDocument, "data-combobox-input", current.owner)
      const onKeyDown = (event: KeyboardEvent) => {
        const chip = event.target
        if (
          event.defaultPrevented || current.locked || event.isComposing || !(chip instanceof HTMLElement) ||
          !chip.hasAttribute("data-combobox-chip")
        ) return
        const all = chips()
        const index = all.indexOf(chip)
        if (index === -1) return
        const move = (target: HTMLElement | undefined) => (target ?? input())?.focus()
        const [previous, next] = current.rtl ? ["ArrowRight", "ArrowLeft"] : ["ArrowLeft", "ArrowRight"]
        const key = event.key
        if (key === previous || key === next) {
          event.preventDefault()
          move(all[key === previous ? index - 1 : index + 1])
        } else if (key === "Backspace" || key === "Delete") {
          event.preventDefault()
          move(index >= all.length - 1 ? all[index - 1] : all[index + 1])
          send(Message.RemovedChip({ value: chip.getAttribute("data-combobox-chip") ?? "", reason: "none" }))
        } else if (key === "Enter" || key === " ") {
          event.preventDefault()
          move(undefined)
        } else if (key === "ArrowDown" || key === "ArrowUp") {
          event.preventDefault()
          send(Message.OpenedFromChip({ key }))
          move(undefined)
        } else if (printable(key, event.altKey, event.ctrlKey, event.metaKey)) {
          move(undefined)
        }
      }
      const controller = new AbortController()
      return Effect.acquireRelease(
        Effect.sync(() => node.addEventListener("keydown", onKeyDown, { signal: controller.signal })).pipe(
          Effect.tap(() =>
            Effect.forkScoped(Stream.runForEach(changes, (next) =>
              Effect.sync(() => {
                current = next
              })))
          )
        ),
        () => Effect.sync(() => controller.abort())
      )
    })
)

/**
 * A combobox: an input that filters a list of options as the user types.
 *
 * **Details**
 *
 * The parts also return plain values for markup that depends on them:
 * `open`, `mounted` (the popup shows, through its exit transition),
 * `transitionStatus`, `inline`, `selected` (the `value` prop, or
 * `null`), `selectedItems` (the selected values with their labels, for
 * chips), `placeholder` (nothing is selected), `disabled`, `readOnly`,
 * `required`, `multiple`, `side` and `align` (where the popup ended
 * up), `highlighted` (the value of the highlighted item), `openMethod`,
 * which is `null` once the popup closes, `items` (the filtered items to
 * draw), `groups` and `listEmpty`.
 *
 * The input, the popup, the list, the arrow, the items and the group labels
 * set their own `id`s for the ARIA attributes that point at them. The
 * input keeps an `id` already on its builder, as from `field.control`,
 * and the `id` prop sets it otherwise.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Combobox = Component.define({
  name: "Combobox",
  props: ComboboxProps,
  model: Model,
  message: Message,
  events: ComboboxEvents,
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
    autoFirst: false,
    saved: null,
    queryChanged: false,
    closeQuery: null,
    pressedItem: null,
    pressing: false,
    typed: "",
    typedFrom: -1,
    matched: -1,
    placement: null
  }),
  update: {
    PressedInput: (_model, { pointerType }, $) => open($, $.props, "input-press", methodOf(pointerType)),
    PressedGroup: (model, { pointerType }, $) => {
      const props = $.props
      if (props.disabled === true) return model
      const focused = focus($, Input)
      return props.openOnInputClick === false ? focused : open(focused, props, "input-press", methodOf(pointerType))
    },
    ChangedInput: (_model, { composing, inputType, value }, $) => edit($, $.props, value, inputType, composing),
    PressedInputKey: (_model, { chips, key }, $) => pressInputKey($, $.props, key, chips),
    ReleasedInputKey: (_model, { key }, $) =>
      key === "Enter" ? dismiss($, $.props, "none", "keyboard") : clear($, $.props, "escape-key"),
    FocusedInput: (model, _message, $) =>
      model.saved === null
        ? model
        : highlight($, shownOf(model, $.props), model.saved, "none").evolve({ saved: null }),
    BlurredInput: (model, _message, $) => {
      const shown = shownOf(model, $.props)
      const highlighted = highlightedOf(model, shown)
      return highlighted === null ? model : highlight($, shown, null, "none").evolve({ saved: highlighted })
    },
    PressedTrigger: (_model, { pointerType }, $) =>
      toggle($.props.inputInPopup === true ? $ : focus($, Input), $.props, methodOf(pointerType)),
    ReleasedTrigger: (_model, _message, $) => $.evolve({ pressing: false }),
    ClickedTrigger: (_model, { pointerType }, $) => toggle($, $.props, methodOf(pointerType)),
    PressedTriggerKey: (model, { key }, $) => {
      const props = $.props
      if (props.disabled === true) return model
      if (key === "ArrowDown" || key === "ArrowUp") {
        const opened = open($, props, "list-navigation", "keyboard", key)
        return props.inputInPopup === true ? opened : focus(opened, Input)
      }
      const values = valuesOf(props)
      const { index, next } = typeahead(
        model,
        key,
        props.items,
        props.items.findIndex((item) => values.includes(item.value))
      )
      const item = props.items[index]
      const typed = $.evolve(next).run(WaitBeforeResetTyping({}))
      return item === undefined || values.includes(item.value)
        ? typed
        : typed.emit(ComboboxEvents.Picked({ value: item.value, reason: "none" }))
    },
    ClickedLabel: focusInput,
    FocusedFormInput: focusInput,
    Autofilled: (model, { value }, $) => {
      const props = $.props
      if (lockedOf(props) || props.multiple === true) return model
      const item = autofillMatch(props.items, value)
      if (item === undefined || valuesOf(props).includes(item.value)) return model
      const picked = $.emit(ComboboxEvents.Picked({ value: item.value, reason: "none" }))
      return props.inputInPopup === true ? picked : rewrite(picked, props, item.label, "none")
    },
    PressedClear: (model, _message, $) =>
      lockedOf($.props) ? model : focus(clear(unhighlight($, $.props, "pointer"), $.props, "clear-press"), Input),
    RemovedChip: (_model, { reason, value }, $) => removeChip($, $.props, value, reason),
    OpenedFromChip: (_model, { key }, $) => open($, $.props, "list-navigation", "keyboard", key),
    EnteredItem: (_model, { value }, $) => hover($, value),
    LeftItem: (_model, _message, $) => hover($, null),
    PressedItem: (_model, { value }, $) => $.evolve({ pressedItem: value }),
    ReleasedItem: (model, { button, value }, $) => {
      const props = $.props
      const next = $.evolve({ pressedItem: null })
      if (model.pressedItem === value || button !== 0 || !navigableOf(props)) return next
      return highlightedOf(model, shownOf(model, props)) === value ? pick(next, props, value, "mouse") : next
    },
    ClickedItem: (_model, { pointerType, value }, $) => pick($, $.props, value, methodOf(pointerType)),
    PressedDismiss: (_model, _message, $) => dismiss($, $.props, "close-press", null),
    CompletedWaitBeforeResetTyping: (_model, _message, $) => $.evolve({ typed: "" }),
    ShowedPopup: (_model, _message, $) =>
      $.evolve($.props.open ? { mounted: true, closeMethod: null, focusLeft: false } : { mounted: true }),
    RenderedFirstFrame: (model, _message, $) => $.props.open ? $.evolve({ started: true }) : model,
    FinishedTransition: (model, { open }, $) => {
      const props = $.props
      if (open !== props.open) return model
      if (open) return $.emit(ComboboxEvents.Settled({ open }))
      if (!model.mounted || props.holdExit === true) return model
      const rest = props.inputInPopup === true ? "" : selectedLabelOf(props)
      const closed = unhighlight($, props, "none").evolve({
        mounted: false,
        started: false,
        queryChanged: false,
        closeQuery: null,
        pressedItem: null,
        pressing: false
      })
      return rewrite(closed, props, rest, rest === "" ? "input-clear" : "none").emit(ComboboxEvents.Settled({ open }))
    },
    ChangedPlacement: (_model, { placement }, $) => $.evolve({ placement }),
    PressedOutside: (_model, { pointerType }, $) => dismiss($, $.props, "outside-press", methodOf(pointerType)),
    FocusedOutside: (_model, _message, $) => dismiss($, $.props, "focus-out", null, true),
    ReleasedPointer: (model, { outside }, $) => {
      if (!model.pressing) return model
      const next = $.evolve({ pressing: false })
      return outside ? dismiss(next, $.props, "cancel-open", "mouse") : next
    }
  },
  parts: (model, p) => {
    const props = p.props
    const open = props.open
    const inline = props.inline === true
    const inPopup = props.inputInPopup === true
    const navigable = open || inline
    const shown = open || model.mounted
    const transitionStatus: ComboboxTransitionStatus = statusOf(model, props)
    const disabled = props.disabled === true
    const readOnly = props.readOnly === true
    const required = props.required === true
    const multiple = props.multiple === true
    const grid = props.grid === true
    const modal = props.modal === true
    const values = valuesOf(props)
    const chosen = new Set(values)
    const filled = filledOf(props)
    const items = shownOf(model, props)
    const listEmpty = items.length === 0
    const highlighted = navigable || model.mounted ? highlightedOf(model, items) : null
    const known = new Map([...(props.filteredItems ?? []), ...props.items].map((item) => [item.value, item] as const))
    const owner = p.id("combobox")
    const inputId = inPopup ? p.id("input") : props.id ?? p.id("input")
    const triggerId = inPopup ? props.id ?? p.id("trigger") : p.id("trigger")
    const labelId = p.id("label")
    const popupId = p.id("popup")
    const listId = p.id("list")
    const arrowId = p.id("arrow")
    const itemId = (value: string) => p.id("item", value)
    const groupLabelId = (group: string) => p.id("group-label", group)
    const tracked = Positioning.trackArgs(props, {
      side: "bottom",
      collisionAvoidance: Positioning.dropdownCollisionAvoidance,
      anchorSelector: inPopup
        ? attrSelector("data-combobox-trigger", owner)
        : attrSelector("data-combobox-group", owner) + "," + attrSelector("data-combobox-input", owner),
      arrowId
    })
    const side = model.placement?.side ?? tracked.options.side
    const align = model.placement?.align ?? tracked.options.align
    const popupSide = shown ? side : undefined
    const selectedItems = values.map((value) => known.get(value) ?? { value, label: value })
    const text = !filled && props.placeholder !== undefined
      ? props.placeholder
      : selectedItems.map((item) => item.label).join(", ")
    const hovers = navigable && props.highlightItemOnHover !== false
    const listArgs: ListArgs = {
      active: highlighted === null ? null : itemId(highlighted),
      scroll: model.activeByKey,
      query: props.inputValue,
      virtualized: props.virtualized === true
    }
    const dismissable = !inline && (!inPopup || modal)
    let labelled = false
    let chipsDrawn = false

    const inside = <B extends Attributed<B>>(builder: B): B => builder.attr("data-combobox-inside", owner)
    const states = <B extends Attributed<B>>(builder: B): B => transitionAttrs(builder, open, transitionStatus)
    const placed = <B extends Attributed<B>>(builder: B): B =>
      states(builder).attr("data-side", side).attr("data-align", align)
    const control = <B extends Attributed<B>>(builder: B): B =>
      builder
        .attr("data-popup-open", flag(open))
        .attr("data-pressed", flag(open))
        .attr("data-popup-side", popupSide)
        .attr("data-list-empty", flag(listEmpty))
        .attr("data-disabled", flag(disabled))
        .attr("data-readonly", flag(readOnly))

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
    }, { focused: Message.FocusedFormInput(), autofilled: (value) => Message.Autofilled({ value }) })
    const inputsBox = new Html.Element<Message>("span").attr("style", "display:contents")

    const dismissPart = p.part("span", (b) =>
      inside(b)
        .attr("role", "button")
        .attr("aria-label", "Dismiss")
        .attr("hidden", flag(!open))
        .attr("style", visuallyHidden)
        .onClick(Message.PressedDismiss()))

    const label = p.part("div", (b) => {
      labelled = true
      return b.attr("id", labelId).onClick(Message.ClickedLabel())
    })

    const value = p.part("span", (b) =>
      b.attr("data-placeholder", flag(!filled))
        .forward((node) => node.children.length > 0 ? node : node.children(text)))

    const pressGroup = ({ button, pointerType }: Html.PointerPayload) =>
      button === 0 ? Message.PressedGroup({ pointerType }) : undefined

    const inputGroup = p.part("div", (b) =>
      inside(control(b))
        .attr("role", "group")
        .attr("data-combobox-group", owner)
        .attr("data-placeholder", flag(!filled))
        .on("mousedown", pressGroup, { preventDefault: true }))

    const keyHandled = (key: string, selectionStart: number | null): boolean => {
      switch (key) {
        case "ArrowDown":
        case "ArrowUp":
          return true
        case "ArrowLeft":
        case "ArrowRight":
          return (grid && navigable && highlighted !== null) ||
            (!readOnly && chipsDrawn && values.length > 0 && selectionStart === 0 &&
              key === (props.dir === "rtl" ? "ArrowRight" : "ArrowLeft"))
        case "Enter":
          return navigable && highlighted !== null
        case " ":
          return !readOnly && open && props.inputValue === ""
        case "Escape":
          return open || (!readOnly && !inline && !model.mounted && (props.inputValue !== "" || filled))
        case "Backspace":
          return !readOnly && chipsDrawn && props.inputValue === "" && values.length > 0
        default:
          return false
      }
    }

    const input = p.part("input", (b) => {
      const decorated = inside(control(b))
        .ref(Input)
        .attr("data-combobox-input", owner)
        .attr("data-required", flag(required))
        .attr("value", props.inputValue)
        .value(props.inputValue)
        .attr("role", "combobox")
        .attr("aria-expanded", String(navigable))
        .attr("aria-haspopup", grid ? "grid" : "listbox")
        .attr("aria-controls", navigable ? listId : undefined)
        .attr("aria-autocomplete", readOnly ? "none" : "list")
        .attr("aria-activedescendant", navigable && highlighted !== null ? itemId(highlighted) : undefined)
        .attr("aria-readonly", readOnly ? "true" : undefined)
        .attr("aria-required", required ? "true" : undefined)
        .attr("autocomplete", "off")
        .attr("spellcheck", "false")
        .attr("autocorrect", "off")
        .attr("autocapitalize", "none")
        .attr("readonly", flag(readOnly))
        .disabled(disabled)
        .on(
          "mousedown",
          ({ button, pointerType }) =>
            button === 0 && !inPopup && !open && !disabled && props.openOnInputClick !== false
              ? Message.PressedInput({ pointerType })
              : undefined
        )
        .on("input", ({ composing, inputType, value }) => Message.ChangedInput({ value, inputType, composing }))
        .on(
          "compositionend",
          ({ value }) => Message.ChangedInput({ value, inputType: "insertCompositionText", composing: false })
        )
        .onKeyDown(
          ({ alt, composing, ctrl, key, meta, selectionStart, shift }) =>
            composing || alt || ctrl || meta || shift || disabled || !keyHandled(key, selectionStart)
              ? undefined
              : Message.PressedInputKey({ key, chips: chipsDrawn }),
          { preventDefault: true }
        )
        // Enter with nothing highlighted closes on keyup, so its keydown can still submit the form, and an
        // inline list clears on Escape's keyup, so its keydown can still close a dialog around it.
        .on("keyup", ({ key }) =>
          (key === "Enter" && open && !inline && highlighted === null) ||
            (key === "Escape" && inline && !readOnly && (props.inputValue !== "" || filled))
            ? Message.ReleasedInputKey({ key })
            : undefined)
      const focusable = inline
        ? decorated.on("focusin", Message.FocusedInput()).on("focusout", Message.BlurredInput())
        : decorated
      return focusable.forward((node) => {
        const named = node.attrs.id === undefined ? node.attr("id", inputId) : node
        return inPopup || inputs.length === 0 ? named : inputsBox.children(named, ...inputs)
      })
    })

    const trigger = p.part("button", (b) => {
      const decorated = inside(control(b))
        .ref(Trigger)
        .attr("type", "button")
        .attr("data-combobox-trigger", owner)
        .attr("data-required", flag(required))
        .attr("data-placeholder", flag(!filled))
        .attr("aria-expanded", String(open))
        .attr("aria-haspopup", inPopup ? "dialog" : "listbox")
        .attr("aria-controls", open ? (inPopup ? popupId : listId) : undefined)
        .disabled(disabled)
        .on(
          "mousedown",
          ({ button, pointerType }) =>
            button === 0 && pointerType !== "touch" ? Message.PressedTrigger({ pointerType }) : undefined,
          { preventDefault: !inPopup }
        )
        .on("mouseup", Message.ReleasedTrigger())
        .onClick(({ pointerType }) =>
          pointerType === "" || pointerType === "touch" ? Message.ClickedTrigger({ pointerType }) : undefined
        )
        .onKeyDown(
          ({ alt, composing, ctrl, key, meta }) =>
            composing
              ? undefined
              : key === "ArrowDown" || key === "ArrowUp" ||
                  (inPopup && !multiple && !open && !readOnly && printable(key, alt, ctrl, meta) &&
                    (key !== " " || model.typed !== ""))
              ? Message.PressedTriggerKey({ key })
              : undefined,
          { preventDefault: true }
        )
      if (!inPopup) return decorated.attr("tabindex", "-1")
      return decorated
        .attr("role", "combobox")
        .attr("aria-required", required ? "true" : undefined)
        .attr("aria-readonly", readOnly ? "true" : undefined)
        .forward((node) => {
          const named = node.attr("id", node.attrs.id ?? triggerId)
            .attr("aria-labelledby", node.attrs["aria-labelledby"] ?? (labelled ? labelId : undefined))
          return inputs.length === 0 ? named : inputsBox.children(named, ...inputs)
        })
    })

    const icon = p.part("span", (b) => b.attr("aria-hidden", "true").attr("data-popup-open", flag(open)))

    const clearPart = p.part("button", (b) =>
      inside(b)
        .attr("type", "button")
        .attr("tabindex", "-1")
        .attr("data-popup-open", flag(open))
        .attr("data-disabled", flag(disabled))
        .attr("data-visible", flag(filled))
        .disabled(disabled)
        .on("mousedown", () => undefined, { preventDefault: "always" })
        .onClick(Message.PressedClear()))
    const clearButton = View.wrapPart(
      clearPart,
      <B extends View.PartTarget<"button">>(element: B, keepMounted?: boolean): ReturnType<B["attr"]> | undefined =>
        filled || keepMounted === true ? clearPart(element) : undefined
    )

    const chips = p.part("div", (b) => {
      chipsDrawn = true
      return inside(b)
        .attr("role", values.length > 0 ? "toolbar" : undefined)
        .attr("data-combobox-chips", owner)
        .on("mousedown", pressGroup, { preventDefault: true })
        .onMount(TrackChips({ owner, rtl: props.dir === "rtl", locked: disabled || readOnly }))
    })

    const chipPart = p.part("div", (b, value: string) =>
      b.ref(Chip.at(value))
        .attr("tabindex", "-1")
        .attr("data-combobox-chip", value)
        .attr("aria-disabled", disabled ? "true" : undefined)
        .attr("aria-readonly", readOnly ? "true" : undefined)
        .attr("data-disabled", flag(disabled)))
    const chip = keyed(chipPart)

    const chipRemove = p.part("button", (b, value: string) =>
      inside(b)
        .attr("type", "button")
        .attr("tabindex", "-1")
        .attr("data-disabled", flag(disabled))
        .disabled(disabled)
        .on("mousedown", () => undefined, { preventDefault: "always" })
        .onClick(Message.RemovedChip({ value, reason: "chip-remove-press" })))

    const backdrop = p.part("div", (b) =>
      states(b)
        .attr("role", "presentation")
        .popover("manual", shown)
        .forward((node) =>
          node.attr("style", withStyle(node.attrs.style, open ? backdropBox : backdropBox + ";pointer-events:none"))
        ))

    const positionerStyle = Positioning.positionerStyle(tracked.positionMethod)
    const positioner = p.part("div", (b) => {
      const decorated = placed(b)
        .attr("role", "presentation")
        .attr("data-combobox-positioner", owner)
        .attr("data-anchor-hidden", flag(shown && model.placement?.anchorHidden))
        .attr("data-empty", flag(listEmpty))
        .popover("manual", shown)
        .forward((node) => {
          const styled = node.attr("style", withStyle(node.attrs.style, positionerStyle))
          return dismissable
            ? styled.children(
              dismissPart(new Html.Element<never, never, Html.EventsOf<"span">, HTMLSpanElement, "span">("span"))
            )
            : styled
        })
      const layered = modal ? decorated.children(open ? blocking.open : blocking.closed) : decorated
      if (!shown) return layered
      return layered.onMount(
        TrackCombobox({
          position: tracked,
          open,
          mounted: model.mounted,
          started: model.started,
          holdExit: props.holdExit === true,
          inputInPopup: inPopup,
          modal,
          hide: dismissable,
          touch: model.openMethod === "touch",
          pressing: model.pressing,
          finalFocus: props.finalFocus !== false,
          focusLeft: model.focusLeft,
          closeMethod: model.closeMethod,
          owner,
          popupId,
          listId,
          list: listArgs
        })
      )
    })

    const popup = p.part("div", (b) =>
      placed(b)
        .attr("id", popupId)
        .attr("role", inPopup ? "dialog" : "presentation")
        .attr("tabindex", "-1")
        .attr("data-anchor-hidden", flag(shown && model.placement?.anchorHidden))
        .attr("data-empty", flag(listEmpty))
        .forward((node) =>
          inPopup && labelled
            ? node.attr("aria-labelledby", node.attrs["aria-labelledby"] ?? labelId)
            : node
        ))

    const arrowStyle = Positioning.arrowStyle(side)
    const arrow = p.part("div", (b) =>
      placed(b)
        .attr("id", arrowId)
        .attr("aria-hidden", "true")
        .attr("data-uncentered", flag(model.placement?.arrowUncentered))
        .forward((node) => node.attr("style", withStyle(node.attrs.style, arrowStyle))))

    const list = p.part("div", (b) => {
      const decorated = b.attr("id", listId)
        .attr("role", grid ? "grid" : "listbox")
        .attr("tabindex", "-1")
        .attr("aria-multiselectable", multiple ? "true" : undefined)
        .attr("aria-readonly", !grid && readOnly ? "true" : undefined)
        .attr("data-empty", flag(listEmpty))
      return inline ? decorated.onMount(TrackList({ list: listArgs })) : decorated
    })

    const row = p.part("div", (b) => b.attr("role", "row"))

    const itemPart = p.part("div", (b, value: string) => {
      const option = known.get(value)
      if (option === undefined) {
        throw new Error("Combobox: no item in the items prop has the value \"" + value + "\"")
      }
      const selected = chosen.has(value)
      const active = highlighted === value
      const off = option.disabled === true
      return b
        .attr("id", itemId(value))
        .attr("role", grid ? "gridcell" : "option")
        .attr("aria-selected", String(selected))
        .attr("aria-disabled", off ? "true" : undefined)
        .attr("data-selected", flag(selected))
        .attr("data-highlighted", flag(active))
        .attr("data-disabled", flag(off))
        .on("mouseenter", () => hovers ? Message.EnteredItem({ value }) : undefined)
        .on("mouseleave", () => hovers ? Message.LeftItem() : undefined)
        .on("mousedown", Message.PressedItem({ value }), { preventDefault: "always" })
        .on(
          "mouseup",
          ({ button, pointerType }) => pointerType === "touch" ? undefined : Message.ReleasedItem({ value, button })
        )
        .onClick(({ pointerType }) => off ? undefined : Message.ClickedItem({ value, pointerType }))
    })
    const item = keyed(itemPart)

    const indicatorPart = p.part("span", (b) => b.attr("aria-hidden", "true"))
    const itemIndicator = View.wrapPart(
      indicatorPart,
      <B extends View.PartTarget<"span">>(
        element: B,
        value: string,
        keepMounted?: boolean
      ): ReturnType<B["attr"]> | undefined =>
        chosen.has(value) || keepMounted === true ? indicatorPart(element) : undefined
    )

    const group = p.part(
      "div",
      (b, key: string) => b.attr("role", grid ? "rowgroup" : "group").attr("aria-labelledby", groupLabelId(key))
    )
    const groupLabel = p.part("div", (b, key: string) => b.attr("id", groupLabelId(key)).attr("aria-hidden", "true"))
    const separator = p.part("div", (b) => separatorAttrs(b, "horizontal"))

    const live = <B extends Attributed<B>>(builder: B): B =>
      builder.attr("role", "status").attr("aria-live", "polite").attr("aria-atomic", "true")
    const empty = p.part(
      "div",
      (b) => live(b).forward((node) => listEmpty ? node : { ...View.build(node, []), children: [] })
    )
    const status = p.part("div", (b) => live(b))

    const finalFocus = p.part((b) => b.attr("data-final-focus", popupId))

    return {
      open,
      mounted: shown,
      transitionStatus,
      inline,
      selected: props.value ?? null,
      selectedItems,
      placeholder: !filled,
      disabled,
      readOnly,
      required,
      multiple,
      side,
      align,
      highlighted,
      openMethod: open ? model.openMethod : null,
      items,
      groups: groupsOf(items),
      listEmpty,
      label,
      value,
      inputGroup,
      input,
      trigger,
      icon,
      clear: clearButton,
      chips,
      chip,
      chipRemove,
      backdrop,
      positioner,
      popup,
      arrow,
      list,
      row,
      item,
      itemIndicator,
      group,
      groupLabel,
      separator,
      empty,
      status,
      finalFocus
    }
  }
})
