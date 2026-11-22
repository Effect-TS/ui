/**
 * An input that filters a list of options as the user types, and picks one
 * or more of them.
 *
 * `Combobox` is headless: it owns the keyboard and pointer behaviour, the
 * filtering, focus, placement, the data attributes and the form inputs, and
 * the consumer draws the markup. The consumer owns whether the popup is
 * open, what's selected and the input's text, passes them as `open`,
 * `value` and `inputValue`, and stores what the `RequestedOpen`,
 * `RequestedClose`, `Picked` and `RequestedInputValue` events ask for.
 * Values are strings, and `items` lists every option with its label. The
 * combobox filters them and hands back `combobox.items`, the ones to draw.
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
 *   RequestedOpenFruit: {},
 *   RequestedCloseFruit: {},
 *   PickedFruit: { fruit: Schema.NullOr(Schema.String) },
 *   RequestedInputValueFruit: { text: Schema.String }
 * })
 *
 * const Picker = Component.define({
 *   name: "Picker",
 *   scoped: false,
 *   model: Schema.Struct({ open: Schema.Boolean, fruit: Schema.NullOr(Schema.String), text: Schema.String }),
 *   message: PickerMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ open: false, fruit: "banana", text: "Banana" }),
 *   update: {
 *     RequestedOpenFruit: (model) => ({ ...model, open: true }),
 *     RequestedCloseFruit: (model) => ({ ...model, open: false }),
 *     PickedFruit: (model, { fruit }) => ({ ...model, fruit }),
 *     RequestedInputValueFruit: (model, { text }) => ({ ...model, text })
 *   },
 *   view: (model, h) =>
 *     Field(h, {
 *       props: { filled: model.fruit !== null },
 *       view: (field) =>
 *         Combobox(h, {
 *           props: { open: model.open, value: model.fruit, inputValue: model.text, items: fruits, name: "fruit" },
 *           onEmit: {
 *             RequestedOpen: () => PickerMessage.RequestedOpenFruit(),
 *             RequestedClose: () => PickerMessage.RequestedCloseFruit(),
 *             Picked: ({ value }) => PickerMessage.PickedFruit({ fruit: typeof value === "string" ? value : null }),
 *             RequestedInputValue: ({ inputValue }) => PickerMessage.RequestedInputValueFruit({ text: inputValue }),
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
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import * as Engine from "./internal/combobox.ts"
import { type TextFilter, textFilter } from "./internal/filter.ts"
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
export const ComboboxItem = Engine.Item

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
export const ComboboxInteraction = Engine.Interaction

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
export const ComboboxChangeReason = Engine.ChangeReason

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
export const ComboboxHighlightReason = Engine.HighlightReason

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
export const ComboboxFilterMode = Engine.FilterMode

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
 *   `RequestedOpen` and `RequestedClose`.
 * - `inputValue`: the input's text. The combobox only asks, with
 *   `RequestedInputValue`.
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
 * What a `Combobox` emits.
 *
 * **Details**
 *
 * - `RequestedOpen`: asks for `open` to be true.
 * - `RequestedClose`: asks for `open` to be false.
 * - `Picked`: asks for `value` to be `value`, the whole new selection.
 * - `RequestedInputValue`: asks for `inputValue` to be `inputValue`. A
 *   single pick asks for the picked label, and after the popup closes the
 *   combobox asks for the selected label back, or for empty text with
 *   `multiple` or `inputInPopup`.
 * - `Highlighted`: reports that the highlighted item changed, to `value` at
 *   `index` in `combobox.items`, or to none with `null` and `-1`. For a
 *   virtualized list to scroll to it.
 * - `Settled`: reports that the popup's transitions ended, after it
 *   opened or closed.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const ComboboxEvents = UiSchema.TaggedEnum({
  RequestedOpen: { reason: ComboboxChangeReason },
  RequestedClose: { reason: ComboboxChangeReason },
  Picked: { value: ComboboxValue, reason: ComboboxChangeReason },
  RequestedInputValue: { inputValue: Schema.String, reason: ComboboxChangeReason },
  Highlighted: { value: Schema.NullOr(Schema.String), index: Schema.Number, reason: ComboboxHighlightReason },
  Settled: { open: Schema.Boolean }
})

/**
 * What a `Combobox` emits.
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
export type ComboboxTransitionStatus = Engine.TransitionStatus

/**
 * A run of items to draw under one group label: the items whose `group`
 * is `key`, in order, and the same items split into rows by their
 * `row`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface ComboboxGroup extends Engine.Group {}

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
export interface ComboboxFilter extends TextFilter {}

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
export const makeComboboxFilter = (locale?: string | undefined): ComboboxFilter => textFilter(locale)

const emits: Engine.Emits<ComboboxEvents> = {
  requestedOpen: (reason) => ComboboxEvents.RequestedOpen({ reason }),
  requestedClose: (reason) => ComboboxEvents.RequestedClose({ reason }),
  picked: (value, reason) => ComboboxEvents.Picked({ value, reason }),
  edited: (inputValue, reason) => ComboboxEvents.RequestedInputValue({ inputValue, reason }),
  highlighted: (value, index, reason) => ComboboxEvents.Highlighted({ value, index, reason }),
  settled: (open) => ComboboxEvents.Settled({ open })
}

const engine = Engine.make("Combobox", (props: ComboboxProps): Engine.Settings<ComboboxEvents> => ({ ...props, emits }))

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
  scoped: false,
  props: ComboboxProps,
  model: Engine.Model,
  message: Engine.Message,
  events: ComboboxEvents,
  elements: Html
}).make({
  init: Engine.init,
  update: engine.update,
  parts: engine.parts
})
