import type { Component, Mount, View } from "@effect/ui"
import {
  Combobox,
  type ComboboxEvents,
  type ComboboxItem,
  type ComboboxProps,
  makeComboboxFilter
} from "@effect/ui-kit"
import { DomCommand, Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type Parts = Component.Headless.Parts<typeof Combobox>
type H = View.Helper<never, ComboboxProps> & View.Tags<Html.Elements, never>

const fruits: ReadonlyArray<ComboboxItem> = [
  { value: "apple", label: "Apple" },
  { value: "apricot", label: "Apricot" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry", disabled: true },
  { value: "grape", label: "Grape" }
]

const standIn = {
  elements: Html,
  view: (combobox: Parts, h: H) =>
    h.div(
      combobox.inputGroup(h.div.class("group")).children(
        combobox.input(h.input.class("input")),
        combobox.clear(h.button.class("clear"))?.children("×"),
        combobox.trigger(h.button.class("trigger")).children(combobox.icon(h.span.class("icon")).children("▾"))
      ),
      combobox.positioner(h.div.class("positioner")).children(
        combobox.popup(h.div.class("popup")).children(
          combobox.empty(h.div.class("empty")).children("No fruit found"),
          combobox.list(h.div.class("list")).children(
            ...combobox.items.map(({ label, value }) =>
              combobox.item(h.div.attr("data-testid", value), value).children(
                label,
                combobox.itemIndicator(h.span.class("check"), value)?.children("✓")
              )
            )
          )
        )
      ),
      combobox.status(h.div.class("status")).children(combobox.items.length + " fruits")
    )
}

const chipsStandIn = {
  elements: Html,
  view: (combobox: Parts, h: H) =>
    h.div(
      combobox.chips(h.div.class("chips")).children(
        ...combobox.selectedItems.map(({ label, value }) =>
          combobox.chip(h.div.attr("data-testid", "chip-" + value), value).children(
            label,
            combobox.chipRemove(h.button.attr("data-testid", "remove-" + value), value).children("×")
          )
        ),
        combobox.input(h.input.class("input"))
      ),
      combobox.positioner(h.div.class("positioner")).children(
        combobox.popup(h.div.class("popup")).children(
          combobox.list(h.div.class("list")).children(
            ...combobox.items.map(({ label, value }) =>
              combobox.item(h.div.attr("data-testid", value), value).children(label)
            )
          )
        )
      )
    )
}

const inPopupStandIn = {
  elements: Html,
  view: (combobox: Parts, h: H) =>
    h.div(
      combobox.label(h.div.class("label")).children("Fruit"),
      combobox.trigger(h.button.class("trigger")).children(combobox.value(h.span.class("value"))),
      combobox.positioner(h.div.class("positioner")).children(
        combobox.popup(h.div.class("popup")).children(
          combobox.input(h.input.class("input")),
          combobox.list(h.div.class("list")).children(
            ...combobox.items.map(({ label, value }) =>
              combobox.item(h.div.attr("data-testid", value), value).children(label)
            )
          )
        )
      )
    )
}

const gridStandIn = {
  elements: Html,
  view: (combobox: Parts, h: H) =>
    h.div(
      combobox.input(h.input.class("input")),
      combobox.list(h.div.class("list")).children(
        ...combobox.groups.flatMap((group) =>
          group.rows.map((cells) =>
            combobox.row(h.div.class("row")).children(
              ...cells.map(({ label, value }) => combobox.item(h.div.attr("data-testid", value), value).children(label))
            )
          )
        )
      )
    )
}

const input = Locator.attr("class", "input")
const group = Locator.attr("class", "group")
const trigger = Locator.attr("class", "trigger")
const clearButton = Locator.attr("class", "clear")
const positioner = Locator.attr("class", "positioner")
const popup = Locator.attr("class", "popup")
const list = Locator.attr("class", "list")
const empty = Locator.attr("class", "empty")
const item = (value: string) => Locator.testId(value)

const pointer = (pointerType: string, button = 0) => ({ button, x: 0, y: 0, pointerType })
const key = (key: string, extra: object = {}) => ({
  key,
  shift: false,
  ctrl: false,
  alt: false,
  meta: false,
  composing: false,
  selectionStart: null,
  selectionEnd: null,
  ...extra
})
const typed = (value: string, inputType = "insertText", composing = false) => ({
  value,
  inputType,
  composing,
  checked: false
})

type Tracked = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const trackedOn = (locator: Locator.Locator) => (s: Rendered): Tracked =>
  (s.get(locator) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as Tracked
const tracked = trackedOn(positioner)
const chipsTracked = trackedOn(Locator.attr("class", "chips"))
const sent = (tag: string, fields: object = {}) => ({ _tag: tag, ...fields }) as never

const partsOf = (s: { readonly parts: (f: (combobox: Parts) => void) => unknown }): Parts => {
  let parts: Parts | undefined
  s.parts((combobox) => {
    parts = combobox
  })
  return parts!
}

const opened = (reason: string) => ({ _tag: "Opened", reason }) as ComboboxEvents
const dismissed = (reason: string) => ({ _tag: "Dismissed", reason }) as ComboboxEvents
const picked = (value: string | ReadonlyArray<string> | null, reason = "item-press") =>
  ({ _tag: "Picked", value, reason }) as ComboboxEvents
const edited = (inputValue: string, reason = "input-change") =>
  ({ _tag: "EditedInput", inputValue, reason }) as ComboboxEvents
const highlighted = (value: string | null, index: number, reason = "keyboard") =>
  ({ _tag: "Highlighted", value, index, reason }) as ComboboxEvents
const settled = (open: boolean) => ({ _tag: "Settled", open }) as ComboboxEvents
const values = (s: { readonly parts: (f: (combobox: Parts) => void) => unknown }) =>
  partsOf(s).items.map((item) => item.value)

const base: ComboboxProps = { open: false, inputValue: "", items: fruits }

const shown = Effect.fnUntraced(function*(props: ComboboxProps, view: typeof standIn = standIn) {
  const s = yield* HtmlScene.make(Combobox, props, view)
  s.mounted(tracked(s), sent("ShowedPopup"))
  return s
})

describe("Combobox", () => {
  it.effect("draws combobox semantics, hidden form input and clear button", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(
        Combobox,
        { ...base, name: "fruit", value: "banana", inputValue: "Banana" },
        standIn
      )
      assert.deepInclude(s.get(input).attrs, {
        role: "combobox",
        "aria-expanded": "false",
        "aria-haspopup": "listbox",
        "aria-autocomplete": "list",
        autocomplete: "off",
        value: "Banana"
      })
      assert.isUndefined(s.get(input).attrs?.["aria-controls"])
      assert.deepInclude(s.get(group).attrs, { role: "group" })
      assert.deepInclude(s.get(trigger).attrs, { type: "button", tabindex: "-1", "aria-expanded": "false" })
      assert.deepInclude(s.get(list).attrs, { role: "listbox", tabindex: "-1" })
      assert.deepInclude(s.get(item("banana")).attrs, { role: "option", "aria-selected": "true", "data-selected": "" })
      assert.deepInclude(s.get(item("cherry")).attrs, { "aria-disabled": "true", "data-disabled": "" })
      assert.deepInclude(s.get(Locator.attr("name", "fruit")).attrs, { value: "banana", "aria-hidden": "true" })
      assert.deepInclude(s.get(Locator.attr("class", "status")).attrs, { role: "status", "aria-live": "polite" })
      assert.strictEqual(Locator.textOf(s.get(empty)), "")
      assert.deepInclude(s.get(clearButton).attrs, { type: "button", tabindex: "-1", "data-visible": "" })
      s.fire(clearButton, "mousedown", pointer("mouse")).expectIgnored().expectDefaultPrevented()
      s.fire(clearButton, "click", pointer("mouse")).emitted(edited("", "clear-press"), picked(null, "clear-press"))
      s.resolve(DomCommand.Focus, { found: true })
      s.props({ ...base, name: "fruit" })
      assert.isUndefined(s.query(clearButton))
    }))

  it.effect("keeps the name, form and required a consumer puts on the input", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Combobox, base, {
        elements: Html,
        view: (combobox: Parts, h: H) =>
          combobox.input(h.input.class("input").attr("name", "query").attr("form", "search").attr("required", ""))
      })
      assert.deepInclude(s.get(input).attrs, { name: "query", form: "search", required: "" })
    }))

  it.effect("typing opens and filters; autofill reports without opening; composition waits for compositionend", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Combobox, base, standIn)
      s.fire(input, "input", typed("Apple", "insertReplacementText")).emitted(edited("Apple"))
      s.fire(input, "input", typed("ba", "")).emitted(edited("ba"))
      s.fire(input, "input", typed("ap")).emitted(edited("ap"), opened("input-change"))
      s.props({ ...base, open: true, inputValue: "ap" }).mounted(tracked(s), sent("ShowedPopup"))
      assert.deepStrictEqual(values(s), ["apple", "apricot", "grape"])
      assert.isNull(partsOf(s).highlighted)
      assert.deepInclude(s.get(input).attrs, { "aria-expanded": "true", "aria-controls": s.get(list).attrs?.id })
      s.fire(input, "input", typed("zz")).emitted(edited("zz"))
      s.props({ ...base, open: true, inputValue: "zz" })
      assert.isTrue(partsOf(s).listEmpty)
      assert.strictEqual(Locator.textOf(s.get(empty)), "No fruit found")
      assert.deepInclude(s.get(positioner).attrs, { "data-empty": "" })
      s.props(base)
      s.fire(input, "input", typed("り", "insertCompositionText", true)).emitted(opened("input-change"))
      s.props({ ...base, open: true }).mounted(tracked(s), sent("ShowedPopup"))
      s.fire(input, "compositionend", { value: "りんご" }).emitted(edited("りんご"))
    }))

  it.effect("filters by mode, limit, filteredItems and drops empty groups", () =>
    Effect.gen(function*() {
      const open = { ...base, open: true, inputValue: "a" }
      const s = yield* shown(open)
      assert.deepStrictEqual(values(s), ["apple", "apricot", "banana", "grape"])
      s.props({ ...open, filter: "startsWith" })
      assert.deepStrictEqual(values(s), ["apple", "apricot"])
      s.props({ ...open, filter: "endsWith", inputValue: "e" })
      assert.deepStrictEqual(values(s), ["apple", "grape"])
      s.props({ ...open, filter: "none" })
      assert.strictEqual(values(s).length, 5)
      s.props({ ...open, limit: 2 })
      assert.deepStrictEqual(values(s), ["apple", "apricot"])
      s.props({ ...open, value: "grape", filteredItems: [{ value: "grape", label: "Filtered Grape" }] })
      assert.deepStrictEqual(values(s), ["grape"])
      assert.strictEqual(partsOf(s).selectedItems[0]?.label, "Grape")
      const grouped = [
        { value: "apple", label: "Apple", group: "fruit" },
        { value: "kale", label: "Kale", group: "vegetable" },
        { value: "leek", label: "Leek", group: "vegetable" }
      ]
      s.props({ ...base, items: grouped, inputValue: "ka", open: true })
      assert.deepStrictEqual(
        partsOf(s).groups.map((g) => [g.key, g.items.map((i) => i.value)]),
        [["vegetable", ["kale"]]]
      )
    }))

  it.effect("pointer opens from input, group or trigger, hovers items, and picks on release", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Combobox, base, standIn)
      s.fire(input, "mousedown", pointer("mouse")).emitted(opened("input-press")).expectDefaultPrevented(false)
      s.props({ ...base, open: true }).mounted(tracked(s), sent("ShowedPopup"))
      s.fire(input, "mousedown", pointer("mouse")).expectIgnored()
      s.fire(item("banana"), "mouseenter").emitted(highlighted("banana", 2, "pointer"))
      s.fire(item("banana"), "mouseleave").emitted(highlighted(null, -1, "pointer"))
      s.fire(item("grape"), "mouseenter").emitted(highlighted("grape", 4, "pointer"))
      s.fire(item("grape"), "mouseup", pointer("mouse")).emitted(
        picked("grape"),
        edited("Grape", "item-press"),
        dismissed("item-press")
      )
      s.fire(item("cherry"), "click", pointer("mouse")).expectIgnored()
      s.fire(trigger, "mousedown", pointer("mouse")).emitted(dismissed("trigger-press")).expectDefaultPrevented()
      s.resolve(DomCommand.Focus, { found: true })
      s.props(base)
      s.fire(group, "mousedown", pointer("mouse")).emitted(opened("input-press"), highlighted(null, -1, "none"))
        .expectDefaultPrevented()
      s.resolve(DomCommand.Focus, { found: true })
      s.fire(trigger, "mousedown", pointer("touch")).expectIgnored()
      s.fire(trigger, "click", pointer("touch")).emitted(opened("trigger-press"))
      s.props({ ...base, open: true, highlightItemOnHover: false })
      assert.strictEqual(partsOf(s).openMethod, "touch")
      s.fire(item("banana"), "mouseenter").expectIgnored()
      s.props({ ...base, open: false, openOnInputClick: false })
      s.fire(input, "mousedown", pointer("mouse")).expectIgnored()
    }))

  it.effect("keyboard opens on the selected or end item, loops or clamps, and skips modified keys", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Combobox, base, standIn)
      s.fire(input, "keydown", key("ArrowDown")).emitted(opened("list-navigation"), highlighted("apple", 0))
        .expectDefaultPrevented()
      s.props({ ...base, open: true }).mounted(tracked(s), sent("ShowedPopup"))
      assert.deepInclude(s.get(item("apple")).attrs, { "data-highlighted": "" })
      s.fire(input, "keydown", key("Escape")).emitted(dismissed("escape-key"))
      s.props(base)
      s.mounted(tracked(s), sent("FinishedTransition", { open: false })).emitted(
        highlighted(null, -1, "none"),
        settled(false)
      )
      s.fire(input, "keydown", key("ArrowUp")).emitted(opened("list-navigation"), highlighted("grape", 4))
      s.props({ ...base, open: true }).mounted(tracked(s), sent("ShowedPopup"))
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted(null, -1))
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("apple", 0))
      s.fire(input, "keydown", key("ArrowUp")).emitted(highlighted(null, -1))
      s.props({ ...base, open: true, loopFocus: false })
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("apple", 0))
      s.fire(input, "keydown", key("ArrowUp")).expectDefaultPrevented()
      assert.strictEqual(partsOf(s).highlighted, "apple")
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("apricot", 1))
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("banana", 2))
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("cherry", 3))
      s.fire(input, "keydown", key("Enter")).expectDefaultPrevented()
      s.fire(input, "keydown", key("Home")).expectIgnored()
      s.fire(input, "keydown", key("ArrowDown", { shift: true })).expectIgnored()
      s.fire(input, "keydown", key("Escape")).emitted(dismissed("escape-key"))
      s.props({ ...base, value: "banana", inputValue: "Banana" })
      s.mounted(tracked(s), sent("FinishedTransition", { open: false })).emitted(
        highlighted(null, -1, "none"),
        settled(false)
      )
      s.fire(input, "keydown", key("ArrowUp")).emitted(opened("list-navigation"), highlighted("banana", 2))
      s.props({ ...base, value: "banana", inputValue: "Banana", open: true }).mounted(tracked(s), sent("ShowedPopup"))
      assert.strictEqual(values(s).length, 5)
    }))

  it.effect("autoHighlight, Enter, Space and Escape pick, dismiss or clear", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Combobox, { ...base, autoHighlight: true }, standIn)
      s.fire(input, "input", typed("an")).emitted(edited("an"), opened("input-change"))
      s.props({ ...base, autoHighlight: true, open: true, inputValue: "an" }).mounted(tracked(s), sent("ShowedPopup"))
      assert.strictEqual(s.get(input).attrs?.["aria-activedescendant"], s.get(item("banana")).attrs?.id)
      s.fire(input, "keydown", key("Enter")).emitted(
        picked("banana"),
        edited("Banana", "item-press"),
        dismissed("item-press")
      ).expectDefaultPrevented()
      s.props(base)
      s.mounted(tracked(s), sent("FinishedTransition", { open: false })).emitted(
        highlighted(null, -1, "none"),
        settled(false)
      )
      s.props({ ...base, open: true }).mounted(tracked(s), sent("ShowedPopup"))
      s.fire(input, "keydown", key("Enter")).expectIgnored()
      s.fire(input, "keyup", key("Enter")).emitted(dismissed("none"))
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("apple", 0))
      s.fire(input, "keyup", key("Enter")).expectIgnored()
      s.fire(input, "keydown", key(" ")).emitted(
        picked("apple"),
        edited("Apple", "item-press"),
        dismissed("item-press")
      ).expectDefaultPrevented()
      s.props({ ...base, open: true, inputValue: "a" })
      s.fire(input, "keydown", key(" ")).expectIgnored()
      s.props({ ...base, value: "banana", inputValue: "Banana" })
      s.mounted(tracked(s), sent("FinishedTransition", { open: false })).emitted(
        highlighted(null, -1, "none"),
        settled(false)
      )
      s.fire(input, "keydown", key("Escape")).emitted(edited("", "escape-key"), picked(null, "escape-key"))
        .expectDefaultPrevented()
      s.props(base)
      s.fire(input, "keydown", key("Escape")).expectIgnored()
      s.props({ ...base, value: "banana", inputValue: "Banana", readOnly: true })
      s.fire(input, "keydown", key("Escape")).expectIgnored()
    }))

  it.effect("freezes the filter during exit, restores the selected label on dismiss, and deselects when cleared", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Combobox, base, standIn)
      s.fire(input, "input", typed("ap")).emitted(edited("ap"), opened("input-change"))
      s.props({ ...base, open: true, inputValue: "ap" }).mounted(tracked(s), sent("ShowedPopup"))
      s.fire(item("apricot"), "click", pointer("mouse")).emitted(
        picked("apricot"),
        edited("Apricot", "item-press"),
        dismissed("item-press")
      )
      s.props({ ...base, value: "apricot", inputValue: "Apricot" })
      assert.deepStrictEqual(values(s), ["apple", "apricot", "grape"])
      assert.strictEqual(partsOf(s).transitionStatus, "ending")
      s.mounted(tracked(s), sent("FinishedTransition", { open: false })).emitted(settled(false))
      assert.strictEqual(values(s).length, 5)
      s.fire(input, "input", typed("gr")).emitted(edited("gr"), opened("input-change"))
      s.props({ ...base, value: "apricot", open: true, inputValue: "gr" }).mounted(tracked(s), sent("ShowedPopup"))
      s.mounted(tracked(s), sent("PressedOutside", { pointerType: "mouse" })).emitted(dismissed("outside-press"))
      s.props({ ...base, value: "apricot", inputValue: "gr" })
      s.mounted(tracked(s), sent("FinishedTransition", { open: false })).emitted(
        edited("Apricot", "none"),
        settled(false)
      )
      s.props({ ...base, value: "apricot", inputValue: "Apricot" })
      s.fire(input, "input", typed("")).emitted(edited(""), picked(null, "input-clear"))
    }))

  it.effect("multiple toggles items, closes after a filtered pick, and manages chips", () =>
    Effect.gen(function*() {
      const props = { ...base, multiple: true, open: true, value: ["apple"], name: "fruit" }
      const s = yield* shown(props, chipsStandIn)
      s.expectMount(chipsTracked(s))
      assert.deepInclude(s.get(list).attrs, { "aria-multiselectable": "true" })
      assert.deepInclude(s.get(Locator.attr("class", "chips")).attrs, { role: "toolbar" })
      assert.strictEqual(s.all(Locator.attr("name", "fruit")).length, 1)
      s.fire(item("grape"), "click", pointer("mouse")).emitted(picked(["apple", "grape"]))
      s.props({ ...props, value: ["apple", "grape"] })
      s.fire(item("apple"), "click", pointer("mouse")).emitted(picked(["grape"]))
      s.fire(input, "input", typed("ban")).emitted(edited("ban"))
      s.props({ ...props, value: ["grape"], inputValue: "ban" })
      s.fire(item("banana"), "click", pointer("mouse")).emitted(
        picked(["grape", "banana"]),
        edited("", "input-clear"),
        dismissed("item-press")
      )
      s.props({ ...base, multiple: true, value: ["apple", "grape"] })
      assert.deepInclude(s.get(item("chip-apple")).attrs, { tabindex: "-1" })
      s.fire(input, "keydown", key("Backspace")).emitted(picked(["apple"], "none"))
      s.fire(input, "keydown", key("ArrowLeft", { selectionStart: 0, selectionEnd: 0 })).expectDefaultPrevented()
      s.resolve(DomCommand.Focus, { found: true })
      s.fire(input, "keydown", key("ArrowLeft", { selectionStart: 1, selectionEnd: 1 })).expectIgnored()
      s.fire(item("remove-apple"), "mousedown", pointer("mouse")).expectIgnored().expectDefaultPrevented()
      s.fire(item("remove-apple"), "click", pointer("mouse")).emitted(picked(["grape"], "chip-remove-press"))
      s.resolve(DomCommand.Focus, { found: true })
      s.props({ ...base, multiple: true, value: ["apple"], inputValue: "a" })
      s.fire(input, "keydown", key("Backspace")).expectIgnored()
      s.props({ ...base, multiple: true, value: ["apple"], readOnly: true })
      s.fire(input, "keydown", key("Backspace")).expectIgnored()
    }))

  it.effect("inputInPopup makes the trigger the combobox, supports typeahead, and cancels an outside release", () =>
    Effect.gen(function*() {
      const props = { ...base, inputInPopup: true, placeholder: "Pick a fruit", name: "fruit" }
      const s = yield* HtmlScene.make(Combobox, props, inPopupStandIn)
      assert.deepInclude(s.get(trigger).attrs, {
        role: "combobox",
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
        "aria-labelledby": s.get(Locator.attr("class", "label")).attrs?.id
      })
      assert.isUndefined(s.get(trigger).attrs?.tabindex)
      assert.strictEqual(Locator.textOf(s.get(Locator.attr("class", "value"))), "Pick a fruit")
      assert.deepInclude(s.get(popup).attrs, { role: "dialog" })
      s.fire(trigger, "keydown", key("g")).emitted(picked("grape", "none"))
      s.resolve(s.current.pending[0]!.command, sent("CompletedWaitBeforeResetTyping"))
      s.props({ ...props, value: "grape" })
      assert.strictEqual(Locator.textOf(s.get(Locator.attr("class", "value"))), "Grape")
      s.fire(trigger, "mousedown", pointer("mouse")).emitted(opened("trigger-press"), highlighted("grape", 4, "none"))
        .expectDefaultPrevented(false)
      s.props({ ...props, value: "grape", open: true }).mounted(tracked(s), sent("ShowedPopup"))
      assert.strictEqual(s.get(trigger).attrs?.["aria-controls"], s.get(popup).attrs?.id)
      s.mounted(tracked(s), sent("ReleasedPointer", { outside: true })).emitted(dismissed("cancel-open"))
      s.fire(input, "input", typed("ba")).emitted(edited("ba"), highlighted(null, -1, "none"))
      s.props({ ...props, value: "grape", open: true, inputValue: "ba" })
      assert.deepStrictEqual(values(s), ["banana"])
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("banana", 0))
      s.fire(input, "keydown", key("Enter")).emitted(picked("banana"), dismissed("item-press"))
      s.props({ ...props, value: "banana", inputValue: "ba" })
      s.mounted(tracked(s), sent("FinishedTransition", { open: false })).emitted(
        highlighted(null, -1, "none"),
        edited("", "input-clear"),
        settled(false)
      )
    }))

  it.effect("grid navigates rows and columns, flips horizontal arrows in RTL, and leaves the caret alone when unhighlighted", () =>
    Effect.gen(function*() {
      const grid = Array.from({ length: 7 }, (_, index) => ({
        value: "e" + index,
        label: "Emoji " + index,
        row: Math.floor(index / 3)
      }))
      const props = { ...base, items: grid, grid: true, open: true }
      const s = yield* HtmlScene.make(Combobox, props, gridStandIn)
      assert.deepInclude(s.get(input).attrs, { "aria-haspopup": "grid" })
      assert.deepInclude(s.get(list).attrs, { role: "grid" })
      assert.strictEqual(s.all(Locator.attr("class", "row")).length, 3)
      assert.deepInclude(s.all(Locator.attr("class", "row"))[0]!.attrs, { role: "row" })
      assert.deepInclude(s.get(item("e0")).attrs, { role: "gridcell" })
      s.fire(input, "keydown", key("ArrowRight")).expectIgnored()
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("e0", 0))
      s.fire(input, "keydown", key("ArrowRight")).emitted(highlighted("e1", 1))
      s.fire(input, "keydown", key("ArrowRight")).emitted(highlighted("e2", 2))
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("e5", 5))
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("e6", 6))
      s.fire(input, "keydown", key("ArrowUp")).emitted(highlighted("e3", 3))
      s.props({ ...props, dir: "rtl" })
      s.fire(input, "keydown", key("ArrowLeft")).emitted(highlighted("e4", 4))
    }))

  it.effect("inline stays expanded, navigates while closed, restores highlight on focus, and clears on Escape keyup", () =>
    Effect.gen(function*() {
      const props = { ...base, inline: true }
      const s = yield* HtmlScene.make(Combobox, props, gridStandIn)
      s.expectMount(trackedOn(list)(s))
      assert.deepInclude(s.get(input).attrs, { "aria-expanded": "true", "aria-controls": s.get(list).attrs?.id })
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("apple", 0))
      s.fire(input, "keydown", key("Enter")).emitted(picked("apple"), edited("Apple", "item-press"))
      s.fire(input, "focusout", { within: false, disabled: false }).emitted(highlighted(null, -1, "none"))
      s.fire(input, "focusin", { within: false }).emitted(highlighted("apple", 0, "none"))
      s.props({ ...props, inputValue: "Apple", value: "apple" })
      s.fire(input, "keydown", key("Escape")).expectIgnored()
      s.fire(input, "keyup", key("Escape")).emitted(edited("", "escape-key"), picked(null, "escape-key"))
    }))

  it.effect("disabled ignores input, and readOnly browses without picking", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Combobox, { ...base, disabled: true }, standIn)
      assert.deepInclude(s.get(input).attrs, { "data-disabled": "" })
      s.fire(input, "mousedown", pointer("mouse")).expectIgnored()
      s.fire(input, "keydown", key("ArrowDown")).expectIgnored()
      s.props({ ...base, readOnly: true })
      assert.deepInclude(s.get(input).attrs, { readonly: "", "aria-readonly": "true", "aria-autocomplete": "none" })
      s.fire(input, "keydown", key("ArrowDown")).emitted(opened("list-navigation"), highlighted("apple", 0))
      s.props({ ...base, readOnly: true, open: true }).mounted(tracked(s), sent("ShowedPopup"))
      s.fire(input, "keydown", key("Enter")).expectDefaultPrevented()
      s.fire(item("apple"), "click", pointer("mouse")).expectHandled()
    }))
})

describe("makeComboboxFilter", () => {
  it("matches ignoring case, accents and punctuation", () => {
    const filter = makeComboboxFilter("en")
    assert.isTrue(filter.contains("Crème brûlée", "creme"))
    assert.isTrue(filter.startsWith("Éclair", "ecl"))
    assert.isTrue(filter.endsWith("Apple", "PLE"))
    assert.isFalse(filter.contains("Apple", "x"))
    assert.isTrue(filter.contains("Apple", ""))
  })
})
