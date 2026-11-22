import type { Component, Mount, View } from "@effect/ui"
import {
  Autocomplete,
  type AutocompleteEvents,
  type AutocompleteItem,
  type AutocompleteProps,
  makeAutocompleteFilter
} from "@effect/ui-kit"
import { DomCommand, Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type Parts = Component.Headless.Parts<typeof Autocomplete>
type H = View.Helper<never, AutocompleteProps> & View.Tags<Html.Elements, never>

const fruits: ReadonlyArray<AutocompleteItem> = [
  { value: "apple", label: "Apple" },
  { value: "apricot", label: "Apricot" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry", disabled: true },
  { value: "grape", label: "Grape" }
]

const standIn = {
  elements: Html,
  view: (autocomplete: Parts, h: H) =>
    h.div(
      autocomplete.inputGroup(h.div.class("group")).children(
        autocomplete.input(h.input.class("input")),
        autocomplete.clear(h.button.class("clear"))?.children("×"),
        autocomplete.trigger(h.button.class("trigger")).children(autocomplete.icon(h.span.class("icon")).children("▾"))
      ),
      autocomplete.value(h.span.class("value")),
      autocomplete.positioner(h.div.class("positioner")).children(
        autocomplete.popup(h.div.class("popup")).children(
          autocomplete.empty(h.div.class("empty")).children("No fruit found"),
          autocomplete.list(h.div.class("list")).children(
            ...autocomplete.items.map(({ label, value }) =>
              autocomplete.item(h.div.attr("data-testid", value), value).children(label)
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
const typed = (value: string, inputType = "insertText") => ({ value, inputType, composing: false, checked: false })

type Tracked = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const tracked = (s: Rendered): Tracked =>
  (s.get(positioner) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as Tracked
const sent = (tag: string, fields: object = {}) => ({ _tag: tag, ...fields }) as never

const partsOf = (s: { readonly parts: (f: (autocomplete: Parts) => void) => unknown }): Parts => {
  let parts: Parts | undefined
  s.parts((autocomplete) => {
    parts = autocomplete
  })
  return parts!
}

const opened = (reason: string) => ({ _tag: "RequestedOpen", reason }) as AutocompleteEvents
const dismissed = (reason: string) => ({ _tag: "RequestedClose", reason }) as AutocompleteEvents
const updated = (value: string, reason = "input-change") => ({ _tag: "Updated", value, reason }) as AutocompleteEvents
const highlighted = (value: string | null, index: number, reason = "keyboard") =>
  ({ _tag: "Highlighted", value, index, reason }) as AutocompleteEvents
const settled = (open: boolean) => ({ _tag: "Settled", open }) as AutocompleteEvents
const values = (s: { readonly parts: (f: (autocomplete: Parts) => void) => unknown }) =>
  partsOf(s).items.map((item) => item.value)
const shownText = (s: Rendered) => s.get(input).attrs?.value

const base: AutocompleteProps = { open: false, value: "", items: fruits }

const shown = Effect.fnUntraced(function*(props: AutocompleteProps) {
  const s = yield* HtmlScene.make(Autocomplete, props, standIn)
  s.mounted(tracked(s), sent("ShowedPopup"))
  return s
})

describe("Autocomplete", () => {
  it.effect("the input is the form field, and nothing is selected", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Autocomplete, { ...base, value: "Ban", name: "q", required: true }, standIn)
      assert.deepInclude(s.get(input).attrs, {
        role: "combobox",
        "aria-autocomplete": "list",
        name: "q",
        required: "",
        "data-required": "",
        value: "Ban"
      })
      assert.strictEqual(s.all(Locator.attr("name", "q")).length, 1)
      assert.isUndefined(s.get(group).attrs?.["data-placeholder"])
      assert.isUndefined(s.get(trigger).attrs?.["data-placeholder"])
      assert.isUndefined(s.get(item("banana")).attrs?.["aria-selected"])
      assert.isUndefined(s.get(item("banana")).attrs?.["data-selected"])
      assert.strictEqual(Locator.textOf(s.get(Locator.attr("class", "value"))), "Ban")
      assert.deepInclude(s.get(clearButton).attrs, { "data-visible": "" })
      s.fire(clearButton, "click", pointer("mouse")).emitted(updated("", "clear-press"))
      s.resolve(DomCommand.Focus, { found: true })
      s.props({ ...base, name: "q" })
      assert.isUndefined(s.query(clearButton))
    }))

  it.effect("typing opens and filters, emptying the input closes it, and a press opens it with openOnInputClick", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Autocomplete, base, standIn)
      s.fire(input, "mousedown", pointer("mouse")).expectIgnored()
      s.fire(input, "input", typed("ap")).emitted(updated("ap"), opened("input-change"))
      s.props({ ...base, open: true, value: "ap" }).mounted(tracked(s), sent("ShowedPopup"))
      assert.deepStrictEqual(values(s), ["apple", "apricot", "grape"])
      s.fire(input, "input", typed("")).emitted(updated(""), dismissed("input-clear"))
      s.props({ ...base, openOnInputClick: true })
      s.fire(input, "mousedown", pointer("mouse")).emitted(opened("input-press"))
    }))

  it.effect("arrow keys open without a highlight, picking puts the label in the input, and submitOnItemClick submits", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Autocomplete, base, standIn)
      s.fire(input, "keydown", key("ArrowDown")).emitted(opened("list-navigation")).expectDefaultPrevented()
      s.props({ ...base, open: true }).mounted(tracked(s), sent("ShowedPopup"))
      assert.isNull(partsOf(s).highlighted)
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("apple", 0))
      s.fire(input, "keydown", key("Enter")).emitted(updated("Apple", "item-press"), dismissed("item-press"))
        .expectDefaultPrevented()
        .expectNone()
      s.props({ ...base, value: "Apple" })
      s.mounted(tracked(s), sent("FinishedTransition", { open: false })).emitted(
        highlighted(null, -1, "none"),
        settled(false)
      )
      assert.strictEqual(shownText(s), "Apple")
      s.props({ ...base, autoHighlight: true })
      s.fire(input, "keydown", key("ArrowUp")).emitted(opened("list-navigation"), highlighted("grape", 4))
      const props = { ...base, open: true, value: "ap", name: "q" }
      s.props(props).mounted(tracked(s), sent("ShowedPopup"))
      s.fire(item("apricot"), "click", pointer("mouse"))
        .emitted(updated("Apricot", "item-press"), dismissed("item-press"))
        .expectNone()
      s.props({ ...props, submitOnItemClick: true })
      s.fire(item("grape"), "click", pointer("mouse"))
        .emitted(updated("Grape", "item-press"), dismissed("item-press"))
        .expectExact(DomCommand.RequestSubmit)
      s.resolve(DomCommand.RequestSubmit, { found: true, submitted: true })
    }))

  it.effect("autoHighlight always follows open and value without previewing, and keepHighlight outlasts the pointer", () =>
    Effect.gen(function*() {
      const always = { ...base, open: true, autoHighlight: "always" as const }
      const s = yield* shown(always)
      assert.strictEqual(partsOf(s).highlighted, "apple")
      assert.strictEqual(s.get(input).attrs?.["aria-activedescendant"], s.get(item("apple")).attrs?.id)
      s.fire(input, "input", typed("gr")).emitted(updated("gr"))
      s.props({ ...always, value: "gr" })
      assert.strictEqual(partsOf(s).highlighted, "grape")
      s.fire(input, "keydown", key("ArrowDown")).expectDefaultPrevented()
      assert.strictEqual(partsOf(s).highlighted, "grape")
      const both = { ...always, open: false, mode: "both" as const }
      s.props(both)
      s.fire(input, "input", typed("ap")).emitted(updated("ap"), opened("input-change"), highlighted("apple", 0))
      s.props({ ...both, open: true, value: "ap" })
      assert.strictEqual(partsOf(s).highlighted, "apple")
      assert.strictEqual(shownText(s), "ap")
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("apricot", 1))
      assert.strictEqual(shownText(s), "Apricot")
      s.props({ ...both, value: "ap" })
      assert.strictEqual(shownText(s), "ap")
      s.props({ ...base, open: true })
      s.fire(item("banana"), "mouseenter").emitted(highlighted("banana", 2, "pointer"))
      s.fire(item("banana"), "mouseleave").emitted(highlighted(null, -1, "pointer"))
      s.props({ ...base, open: true, keepHighlight: true })
      s.fire(item("grape"), "mouseenter").emitted(highlighted("grape", 4, "pointer"))
      s.fire(item("grape"), "mouseleave")
      assert.strictEqual(partsOf(s).highlighted, "grape")
    }))

  it.effect("mode controls filtering and keyboard inline preview, and readOnly disables preview", () =>
    Effect.gen(function*() {
      const props = { ...base, open: true, value: "ap", mode: "both" as const }
      const s = yield* shown(props)
      assert.strictEqual(s.get(input).attrs?.["aria-autocomplete"], "both")
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("apple", 0))
      assert.strictEqual(shownText(s), "Apple")
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("apricot", 1))
      assert.strictEqual(shownText(s), "Apricot")
      assert.deepStrictEqual(values(s), ["apple", "apricot", "grape"])
      s.fire(item("grape"), "mouseenter").emitted(highlighted("grape", 2, "pointer"))
      assert.strictEqual(shownText(s), "Apricot")
      s.fire(input, "input", typed("Apricots")).emitted(updated("Apricots"), highlighted(null, -1, "none"))
      s.props({ ...props, value: "Apricots" })
      assert.strictEqual(shownText(s), "Apricots")
      s.props(props)
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("apple", 0))
      assert.strictEqual(shownText(s), "Apple")
      s.fire(input, "keydown", key("Escape")).emitted(dismissed("escape-key"))
      assert.strictEqual(shownText(s), "ap")
      const inline = { ...props, mode: "inline" as const }
      s.props(inline)
      assert.strictEqual(s.get(input).attrs?.["aria-autocomplete"], "inline")
      assert.strictEqual(values(s).length, 5)
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("apricot", 1))
      assert.strictEqual(shownText(s), "Apricot")
      s.props({ ...inline, readOnly: true })
      assert.strictEqual(s.get(input).attrs?.["aria-autocomplete"], "none")
      assert.strictEqual(shownText(s), "ap")
      s.props({ ...inline, mode: "none" })
      assert.strictEqual(values(s).length, 5)
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("banana", 2))
      assert.strictEqual(shownText(s), "ap")
    }))

  it.effect("with inputInPopup, the trigger shows the picked label and one hidden input holds the form value", () =>
    Effect.gen(function*() {
      const props = { ...base, open: true, value: "ba", name: "q", form: "search", required: true, inputInPopup: true }
      const s = yield* shown(props)
      s.fire(input, "keydown", key("ArrowDown")).emitted(highlighted("banana", 0))
      s.fire(input, "keydown", key("Enter")).emitted(updated("Banana", "item-press"), dismissed("item-press"))
      s.props({ ...props, open: false, value: "Banana" })
      assert.strictEqual(Locator.textOf(s.get(Locator.attr("class", "value"))), "Banana")
      const named = s.all(Locator.attr("name", "q"))
      assert.strictEqual(named.length, 1)
      assert.deepInclude(named[0].attrs, { value: "Banana", form: "search", required: "", "aria-hidden": "true" })
      assert.strictEqual(s.get(trigger).attrs?.form, "search")
      assert.isUndefined(s.get(input).attrs?.name)
      assert.isUndefined(s.get(input).attrs?.required)
    }))

  it("makeAutocompleteFilter matches as the autocomplete does", () => {
    const filter = makeAutocompleteFilter()
    assert.isTrue(filter.startsWith("Apricot", "apr"))
    assert.isFalse(filter.endsWith("Apricot", "apr"))
  })
})
