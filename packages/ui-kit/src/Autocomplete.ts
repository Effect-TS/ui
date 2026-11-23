/**
 * An input that suggests completions from a list as the user types, and
 * keeps whatever text the user enters.
 *
 * `Autocomplete` is headless: it owns the keyboard and pointer behaviour,
 * the filtering, focus, placement and the data attributes, and the consumer
 * draws the markup. The consumer owns whether the popup is open and the
 * input's text, passes them as `open` and `value`, and stores what the
 * `RequestedOpen`, `RequestedClose` and `Updated` events ask for. Unlike a
 * `Combobox` it selects nothing: the text is the value, and picking an
 * item puts its label in the input and closes the popup. `items` lists
 * every suggestion with its label. The autocomplete filters them and hands
 * back `autocomplete.items`, the ones to draw.
 *
 * **Anatomy**
 *
 * | Part         | Element                                                |
 * | :----------- | :----------------------------------------------------- |
 * | `inputGroup` | `<div>` around the input and its buttons, the anchor |
 * | `input`      | `<input>`, the combobox                               |
 * | `trigger`    | `<button>` that toggles the popup                     |
 * | `icon`       | `<span>` inside the trigger                           |
 * | `clear`      | `<button>` that clears the text                       |
 * | `value`      | `<span>` that shows the text                          |
 * | `backdrop`   | `<div>`, a manual popover under the positioner        |
 * | `positioner` | `<div>`, a manual popover placed by the autocomplete  |
 * | `popup`      | `<div>` inside the positioner                         |
 * | `arrow`      | `<div>` inside the popup                              |
 * | `list`       | `<div>` around the items                              |
 * | `row`        | `<div>` around a row of items, with `grid`           |
 * | `item`       | `<div>`, one per drawn value, inside the list         |
 * | `group`      | `<div>` around items                                  |
 * | `groupLabel` | `<div>` inside a group                                |
 * | `separator`  | `<div>` between items                                 |
 * | `empty`      | `<div>`, its children drawn while no item matches     |
 * | `status`     | `<div>`, a live region for a message such as a count  |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, and the consumer adds the children. `item` takes an options
 * object, `{ element, value }`, and keys its element with the value, and
 * `group` and `groupLabel` take `{ element, group }`, where `group` is the
 * `group` of the items inside. `clear` takes `{ element }` and returns
 * `undefined` while the text is empty; a `keepMounted` field keeps it
 * drawn. `empty` drops its children while the list has items, so the live
 * region stays in the page.
 *
 * Draw `autocomplete.items`, not `items`: it's the filtered list, which
 * keeps its contents while the popup animates out. `autocomplete.groups`
 * splits it by each item's `group`, dropping groups with nothing left, and
 * each group's `rows` splits it again by `row`, for `grid`. Every value
 * drawn with `item` has to be in `items` or `filteredItems`.
 *
 * Focus stays in the input: the highlighted item is named by
 * `aria-activedescendant`, and presses on the trigger, the clear button and
 * the items don't take focus. In a `Field`, draw it as
 * `autocomplete.input(field.control(h.input))` and name it with
 * `field.label`.
 *
 * `mode` sets how the text and the list relate. With `"list"` the text
 * filters the items. With `"both"` it filters them too, and the arrow keys
 * show the highlighted item's label in the input until the user types,
 * picks or closes the popup; `value` keeps the typed text, which is what
 * filters. `"inline"` shows the label the same way without filtering, and
 * `"none"` neither filters nor shows it.
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
 * - `inputGroup`: as on the input, without `data-required`
 * - `trigger`: as on the input
 * - `icon`: `data-popup-open`
 * - `clear`: `data-popup-open`, `data-disabled`, `data-visible`
 * - `backdrop`: `data-open` / `data-closed`, `data-starting-style`,
 *   `data-ending-style`
 * - `positioner`: as on the backdrop, and `data-side`, `data-align`,
 *   `data-anchor-hidden`, `data-empty`
 * - `popup`: as on the positioner
 * - `arrow`: as on the backdrop, and `data-side`, `data-align`,
 *   `data-uncentered`
 * - `list`: `data-empty`
 * - `item`: `data-highlighted`, `data-disabled`
 * - `separator`: `data-orientation`
 *
 * **Keyboard**
 *
 * In the input, ArrowDown and ArrowUp open the popup, and then move the
 * highlight; with `autoHighlight` opening highlights the first or, for
 * ArrowUp, the last item. Past either end the highlight leaves the list,
 * and the next press wraps around; with `loopFocus: false` it stops at the
 * ends. Enter picks the highlighted item, and with nothing highlighted it
 * closes the popup on its keyup, leaving the keydown to submit a form.
 * Space picks the highlighted item while the input is empty. Escape closes
 * the popup, and on a closed autocomplete clears the text. Typing opens the
 * popup. Keys pressed while an IME composes text are left alone. With
 * `grid`, ArrowLeft and ArrowRight move between the items of a row once one
 * is highlighted, mirrored by `dir: "rtl"`.
 *
 * **Form**
 *
 * The input is the form control: `name`, `form` and `required` go on it,
 * so the text is submitted and validated as typed. With `inputInPopup`
 * the input isn't always drawn, so the trigger is wrapped in a
 * `display: contents` span that holds a visually hidden input with them
 * and the text instead. With
 * `submitOnItemClick`, picking an item submits that form, the one named
 * by `form` or around the autocomplete, once the picked label is drawn.
 *
 * **Limits**
 *
 * Props can't hold functions, so `filter` names a matcher and a consumer
 * with its own filter passes the result as `filteredItems`, or sets
 * `filter: "none"` and filters the `items` it passes, as for results
 * fetched while typing. `makeAutocompleteFilter` gives the autocomplete's
 * matchers to a consumer's own filter. There are no `default*` props or
 * refs, no portal, and items are `{ value, label }` rather than any object.
 *
 * **Example** (A search box whose text is in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Autocomplete } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const tags = [
 *   { value: "effect", label: "effect" },
 *   { value: "schema", label: "schema" },
 *   { value: "stream", label: "stream" }
 * ]
 *
 * const SearchMessage = UiSchema.TaggedEnum({
 *   RequestedOpenSuggestions: {},
 *   RequestedCloseSuggestions: {},
 *   UpdatedQuery: { query: Schema.String }
 * })
 *
 * const Search = Component.define({
 *   name: "Search",
 *   scoped: false,
 *   model: Schema.Struct({ open: Schema.Boolean, query: Schema.String }),
 *   message: SearchMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ open: false, query: "str" }),
 *   update: {
 *     RequestedOpenSuggestions: (_model, _message, $) => $.evolve({ open: true }),
 *     RequestedCloseSuggestions: (_model, _message, $) => $.evolve({ open: false }),
 *     UpdatedQuery: (_model, { query }, $) => $.evolve({ query })
 *   },
 *   view: (model, h) =>
 *     h.form(
 *       Autocomplete(h, {
 *         props: { open: model.open, value: model.query, items: tags, name: "q" },
 *         onEmit: {
 *           RequestedOpen: () => SearchMessage.RequestedOpenSuggestions(),
 *           RequestedClose: () => SearchMessage.RequestedCloseSuggestions(),
 *           Updated: ({ value }) => SearchMessage.UpdatedQuery({ query: value }),
 *           Highlighted: () => undefined,
 *           Settled: () => undefined
 *         },
 *         view: (autocomplete) =>
 *           h.div(
 *             autocomplete.inputGroup(h.div).children(
 *               autocomplete.input(h.input.attr("aria-label", "Search tags")),
 *               autocomplete.clear({ element: h.button })?.children("×")
 *             ),
 *             autocomplete.positioner(h.div).children(
 *               autocomplete.popup(h.div).children(
 *                 autocomplete.empty(h.div).children("No tags"),
 *                 autocomplete.list(h.div).children(
 *                   ...autocomplete.items.map(({ label, value }) =>
 *                     autocomplete.item({ element: h.div, value }).children(label)
 *                   )
 *                 )
 *               )
 *             )
 *           )
 *       })
 *     )
 * })
 *
 * // The input is the form field, and holds the typed text.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Search, {}))
 * if (!/<input[^>]* name="q"/.test(html) || !/<input[^>]* value="str"/.test(html)) {
 *   throw new Error("the input doesn't hold the query")
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
import * as Struct from "effect/Struct"
import type { Combobox } from "./Combobox.ts"
import * as Engine from "./internal/combobox.ts"
import { type TextFilter, textFilter } from "./internal/filter.ts"
import * as Positioning from "./Positioning.ts"

/**
 * One suggestion of an `Autocomplete`.
 *
 * **Details**
 *
 * - `value`: what identifies the item, in `Highlighted`. Unique among the
 *   items.
 * - `label`: the text matched while filtering, and put in the input when
 *   the item is picked.
 * - `disabled`: the item can be highlighted but not picked.
 * - `group`: the key of the group it's drawn in, for
 *   `autocomplete.groups`.
 * - `row`: the row it's drawn in, for `grid`. Neighbouring items of a
 *   group with the same `row` share a row.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const AutocompleteItem = Engine.Item

/**
 * One suggestion of an `Autocomplete`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AutocompleteItem = typeof AutocompleteItem.Type

/**
 * Why an `Autocomplete` asks to open, close or change its text.
 *
 * **Details**
 *
 * - `"trigger-press"`: a press on the trigger
 * - `"input-press"`: a press on the input or the input group
 * - `"outside-press"`: a press outside the autocomplete and the popup,
 *   other than on a scrollbar
 * - `"item-press"`: an item was picked, with the pointer or the keyboard
 * - `"close-press"`: the visually hidden dismiss button in the popup, for
 *   screen readers
 * - `"escape-key"`: Escape in the input
 * - `"list-navigation"`: ArrowDown or ArrowUp opened the popup
 * - `"focus-out"`: focus left the autocomplete and the popup
 * - `"input-change"`: the user edited the input's text
 * - `"input-clear"`: the user emptied the input
 * - `"clear-press"`: the clear button
 * - `"cancel-open"`: the press that opened it was released away from the
 *   trigger and the popup
 * - `"none"`: anything else, such as Enter with nothing highlighted
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const AutocompleteChangeReason = Engine.TextReason

/**
 * Why an `Autocomplete` asks to open, close or change its text.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AutocompleteChangeReason = typeof AutocompleteChangeReason.Type

/**
 * What moved the highlight: `"keyboard"`, `"pointer"`, or `"none"` for
 * the autocomplete itself, as when it opens or the list changes.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const AutocompleteHighlightReason = Engine.HighlightReason

/**
 * What moved the highlight.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AutocompleteHighlightReason = typeof AutocompleteHighlightReason.Type

/**
 * How an `Autocomplete` matches its items against the text.
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
export const AutocompleteFilterMode = Engine.FilterMode

/**
 * How an `Autocomplete` matches its items against the text.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AutocompleteFilterMode = typeof AutocompleteFilterMode.Type

/**
 * How an `Autocomplete`'s text relates to its list.
 *
 * **Details**
 *
 * - `"list"`: the text filters the items
 * - `"both"`: the text filters the items, and the arrow keys show the
 *   highlighted item's label in the input
 * - `"inline"`: every item is drawn, and the arrow keys show the
 *   highlighted item's label in the input
 * - `"none"`: every item is drawn, and the input only shows the text
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const AutocompleteMode = Schema.Literals(["list", "both", "inline", "none"])

/**
 * How an `Autocomplete`'s text relates to its list.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AutocompleteMode = typeof AutocompleteMode.Type

/**
 * The props of an `Autocomplete`.
 *
 * **Details**
 *
 * - `open`: whether the popup shows. The autocomplete only asks, with
 *   `RequestedOpen` and `RequestedClose`.
 * - `value`: the input's text. The autocomplete only asks, with
 *   `Updated`.
 * - `items`: every suggestion, in the order they're drawn.
 * - `mode`: how the text relates to the list, as `AutocompleteMode`
 *   describes. `"list"` when left out.
 * - `filter`: how the text matches the items, with `mode` `"list"` or
 *   `"both"`. `"contains"` when left out.
 * - `filteredItems`: the items to draw, from the consumer's own filter,
 *   in place of `filter`.
 * - `locale`: the locale the filter compares in. The runtime's when left
 *   out.
 * - `limit`: the most items drawn. All of them when left out.
 * - `autoHighlight`: typing highlights the first match, so Enter picks
 *   it, and opening with the arrow keys highlights the first or last item.
 *   `"always"` also highlights the first item whenever the list shows.
 *   False when left out.
 * - `keepHighlight`: the highlight stays when the pointer leaves the
 *   list. False when left out.
 * - `highlightItemOnHover`: the pointer highlights the item it's over.
 *   True when left out.
 * - `loopFocus`: the arrow keys go past the ends of the list and around.
 *   True when left out.
 * - `openOnInputClick`: a press on the input opens the popup. False when
 *   left out.
 * - `submitOnItemClick`: picking an item submits the autocomplete's form.
 *   False when left out.
 * - `inline`: the list is drawn without a popup and is always expanded.
 *   False when left out.
 * - `inputInPopup`: the input is drawn inside the popup, and the trigger
 *   is the combobox that opens it. The `value` part shows the text in the
 *   trigger. False when left out.
 * - `grid`: the items are drawn in rows, by their `row`, and the list is
 *   a grid. False when left out.
 * - `virtualized`: the consumer draws only some of the items, so the
 *   autocomplete doesn't scroll the highlighted one into view; scroll to it
 *   on `Highlighted`. False when left out.
 * - `disabled`, `readOnly`, `required`, `name`, `form`: as on a native
 *   `<input>`, and put on the input. A read-only autocomplete opens and
 *   can be browsed but not changed.
 * - `id`: the input's id, unless the builder has one. Generated when left
 *   out.
 * - `dir`: the writing direction, for the horizontal arrow keys. `"ltr"`
 *   when left out.
 * - `modal`: while open, the page doesn't scroll and a press outside only
 *   closes the popup. False when left out.
 * - `holdExit`: keeps the closing popup shown, for an exit animation the
 *   consumer ends by clearing it.
 * - the `Positioning.PositionerFields`, for the popup. `side` is
 *   `"bottom"` when left out, and the anchor is the input group, or the
 *   input without one.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const AutocompleteProps = Schema.Struct({
  open: Schema.Boolean,
  value: Schema.String,
  items: Schema.Array(AutocompleteItem),
  mode: Schema.optional(AutocompleteMode),
  filter: Schema.optional(AutocompleteFilterMode),
  filteredItems: Schema.optional(Schema.Array(AutocompleteItem)),
  locale: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number),
  autoHighlight: Schema.optional(Schema.Union([Schema.Boolean, Schema.Literal("always")])),
  keepHighlight: Schema.optional(Schema.Boolean),
  highlightItemOnHover: Schema.optional(Schema.Boolean),
  loopFocus: Schema.optional(Schema.Boolean),
  openOnInputClick: Schema.optional(Schema.Boolean),
  submitOnItemClick: Schema.optional(Schema.Boolean),
  inline: Schema.optional(Schema.Boolean),
  inputInPopup: Schema.optional(Schema.Boolean),
  grid: Schema.optional(Schema.Boolean),
  virtualized: Schema.optional(Schema.Boolean),
  disabled: Schema.optional(Schema.Boolean),
  readOnly: Schema.optional(Schema.Boolean),
  required: Schema.optional(Schema.Boolean),
  name: Schema.optional(Schema.String),
  form: Schema.optional(Schema.String),
  id: Schema.optional(Schema.String),
  dir: Schema.optional(Schema.Literals(["ltr", "rtl"])),
  modal: Schema.optional(Schema.Boolean),
  holdExit: Schema.optional(Schema.Boolean),
  ...Positioning.PositionerFields
})

/**
 * The props of an `Autocomplete`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AutocompleteProps = typeof AutocompleteProps.Type

/**
 * What an `Autocomplete` emits.
 *
 * **Details**
 *
 * - `RequestedOpen`: asks for `open` to be true.
 * - `RequestedClose`: asks for `open` to be false.
 * - `Updated`: asks for `value` to be `value`, the new text. A pick asks
 *   for the picked label.
 * - `Highlighted`: reports that the highlighted item changed, to `value` at
 *   `index` in `autocomplete.items`, or to none with `null` and `-1`. For a
 *   virtualized list to scroll to it.
 * - `Settled`: reports that the popup's transitions ended, after it
 *   opened or closed.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const AutocompleteEvents = UiSchema.TaggedEnum({
  RequestedOpen: { reason: AutocompleteChangeReason },
  RequestedClose: { reason: AutocompleteChangeReason },
  Updated: { value: Schema.String, reason: AutocompleteChangeReason },
  Highlighted: {
    value: Schema.NullOr(Schema.String),
    index: Schema.Number,
    reason: AutocompleteHighlightReason
  },
  Settled: { open: Schema.Boolean }
})

/**
 * What an `Autocomplete` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AutocompleteEvents = typeof AutocompleteEvents.Type

/**
 * Where an autocomplete's popup is in its transitions: `"starting"` for
 * the first frame after it opens, `"ending"` while it closes, `null`
 * otherwise.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AutocompleteTransitionStatus = Engine.TransitionStatus

/**
 * A run of items to draw under one group label: the items whose `group`
 * is `key`, in order, and the same items split into rows by their
 * `row`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface AutocompleteGroup extends Engine.Group {}

/**
 * The matchers an `Autocomplete` filters with, for a consumer's own
 * filter.
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
export interface AutocompleteFilter extends TextFilter {}

/**
 * The `AutocompleteFilter` for a locale, the runtime's when left out. It's
 * cached, so calling it for each render is cheap.
 *
 * **Example** (Filtering suggestions the consumer fetched)
 *
 * ```ts
 * import { makeAutocompleteFilter } from "@effect/ui-kit"
 *
 * const filter = makeAutocompleteFilter("fr")
 * filter.contains("Crème brûlée", "creme") // true
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const makeAutocompleteFilter = (locale?: string | undefined): AutocompleteFilter => textFilter(locale)

const emits: Engine.Emits<AutocompleteEvents> = {
  requestedOpen: (reason) => AutocompleteEvents.RequestedOpen({ reason }),
  requestedClose: (reason) => AutocompleteEvents.RequestedClose({ reason }),
  edited: (value, reason) => AutocompleteEvents.Updated({ value, reason }),
  highlighted: (value, index, reason) => AutocompleteEvents.Highlighted({ value, index, reason }),
  settled: (open) => AutocompleteEvents.Settled({ open })
}

const engine = Engine.make("Autocomplete", (props: AutocompleteProps): Engine.Settings<AutocompleteEvents> => {
  const { value, ...rest } = props
  return { ...rest, inputValue: value, openOnInputClick: props.openOnInputClick ?? false, emits }
})

/**
 * An autocomplete: an input that suggests completions from a list as the
 * user types.
 *
 * **Details**
 *
 * The parts also return plain values for markup that depends on them:
 * `open`, `mounted` (the popup shows, through its exit transition),
 * `transitionStatus`, `inline`, `disabled`, `readOnly`, `required`,
 * `side` and `align` (where the popup ended up), `highlighted` (the
 * value of the highlighted item), `openMethod`, which is `null` once the
 * popup closes, `items` (the filtered items to draw), `groups` and
 * `listEmpty`.
 *
 * Each part writes the attributes and handles the events that the
 * `Combobox` part of the same name does, listed under {@link Combobox},
 * over the ones the consumer set on the builder before the part. As
 * nothing is selected, the items have no `aria-selected`. Without
 * `inputInPopup`, the input also takes `name`, `form` and `required`.
 *
 * It emits `RequestedOpen`, `RequestedClose`, `Updated`, `Highlighted`
 * and `Settled`.
 *
 * History restore saves nothing of it: after Back, forward or a reload it
 * starts from `init`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Autocomplete = Component.define({
  name: "Autocomplete",
  scoped: false,
  props: AutocompleteProps,
  model: Engine.Model,
  message: Engine.Message,
  events: AutocompleteEvents,
  restore: false,
  elements: Html
}).make({
  init: Engine.init,
  update: engine.update,
  parts: (model, p) =>
    Struct.omit(engine.parts(model, p), [
      "selected",
      "selectedItems",
      "placeholder",
      "multiple",
      "label",
      "chips",
      "chip",
      "chipRemove",
      "itemIndicator",
      "finalFocus"
    ])
})
