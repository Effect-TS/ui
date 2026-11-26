import type { Component, Mount, View } from "@effect/ui"
import {
  Autocomplete,
  type AutocompleteEvents,
  type AutocompleteItem,
  type AutocompleteProps,
  makeAutocompleteFilter
} from "@effect/ui-kit"
import { Html, HtmlCommand } from "@effect/ui/html"
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
      autocomplete.label(h.div.class("label")).children("Fruit"),
      autocomplete.inputGroup(h.div.class("group")).children(
        autocomplete.input(h.input.class("input")),
        autocomplete.clear({ element: h.button.class("clear") })?.children("×"),
        autocomplete.trigger(h.button.class("trigger")).children(
          autocomplete.icon(h.span.class("icon")).children("▾")
        )
      ),
      autocomplete.value(h.span.class("value")),
      autocomplete.positioner(h.div.class("positioner")).children(
        autocomplete.popup(h.div.class("popup")).children(
          autocomplete.empty(h.div.class("empty")).children("No fruit found"),
          autocomplete.list(h.div.class("list")).children(
            ...autocomplete.items.map(({ label, value }) =>
              autocomplete.item({
                element: h.div.attr("data-testid", value),
                value
              }).children(label)
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

const pointer = (pointerType: string, button = 0) => ({
  button,
  x: 0,
  y: 0,
  pointerType
})
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
const typed = (value: string, inputType = "insertText") => ({
  value,
  inputType,
  composing: false,
  checked: false
})

type Tracked = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const tracked = (scene: Rendered): Tracked =>
  (scene.get(positioner) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)
    ?.mount as unknown as Tracked
const sent = (tag: string, fields: object = {}) =>
  ({ _tag: tag, ...fields }) as never

const partsOf = (
  scene: { readonly parts: (f: (autocomplete: Parts) => void) => unknown }
): Parts => {
  let parts: Parts | undefined
  scene.parts((autocomplete) => {
    parts = autocomplete
  })
  return parts!
}

const opened = (reason: string) =>
  ({ _tag: "RequestedOpen", reason }) as AutocompleteEvents
const dismissed = (reason: string) =>
  ({ _tag: "RequestedClose", reason }) as AutocompleteEvents
const updated = (value: string, reason = "input-change") =>
  ({ _tag: "Updated", value, reason }) as AutocompleteEvents
const highlighted = (
  value: string | null,
  index: number,
  reason = "keyboard"
) => ({ _tag: "Highlighted", value, index, reason }) as AutocompleteEvents
const settled = (open: boolean) =>
  ({ _tag: "Settled", open }) as AutocompleteEvents
const values = (
  scene: { readonly parts: (f: (autocomplete: Parts) => void) => unknown }
) => partsOf(scene).items.map((item) => item.value)
const shownText = (scene: Rendered) => scene.get(input).attrs?.value

const base: AutocompleteProps = { open: false, value: "", items: fruits }

const shown = Effect.fnUntraced(function*(props: AutocompleteProps) {
  const scene = yield* HtmlScene.make(Autocomplete, props, standIn)
  scene.mounted(tracked(scene), sent("ShowedPopup"))
  return scene
})

describe("Autocomplete", () => {
  it.effect("the input is the form field, and nothing is selected", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Autocomplete, {
        ...base,
        value: "Ban",
        name: "q",
        required: true
      }, standIn)
      assert.deepInclude(scene.get(input).attrs, {
        role: "combobox",
        "aria-autocomplete": "list",
        name: "q",
        required: "",
        "data-required": "",
        value: "Ban"
      })
      assert.strictEqual(scene.all(Locator.attr("name", "q")).length, 1)
      assert.isUndefined(scene.get(group).attrs?.["data-placeholder"])
      assert.isUndefined(scene.get(trigger).attrs?.["data-placeholder"])
      assert.isUndefined(scene.get(item("banana")).attrs?.["aria-selected"])
      assert.isUndefined(scene.get(item("banana")).attrs?.["data-selected"])
      assert.strictEqual(
        Locator.textOf(scene.get(Locator.attr("class", "value"))),
        "Ban"
      )
      assert.deepInclude(scene.get(clearButton).attrs, { "data-visible": "" })
      scene.fire(clearButton, "click", pointer("mouse")).emitted(
        updated("", "clear-press")
      )
      scene.resolve(HtmlCommand.Focus, { found: true })
      scene.props({ ...base, name: "q" })
      assert.isUndefined(scene.query(clearButton))
    }))

  it.effect("typing opens and filters, emptying the input closes it, and a press opens it with openOnInputClick", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Autocomplete, base, standIn)
      scene.fire(input, "mousedown", pointer("mouse")).expectIgnored()
      scene.fire(input, "input", typed("ap")).emitted(
        updated("ap"),
        opened("input-change")
      )
      scene.props({ ...base, open: true, value: "ap" }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      assert.deepStrictEqual(values(scene), ["apple", "apricot", "grape"])
      scene.fire(input, "input", typed("")).emitted(
        updated(""),
        dismissed("input-clear")
      )
      scene.props({ ...base, openOnInputClick: true })
      scene.fire(input, "mousedown", pointer("mouse")).emitted(
        opened("input-press")
      )
    }))

  it.effect("arrow keys open without a highlight, picking puts the label in the input, and submitOnItemClick submits", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Autocomplete, base, standIn)
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        opened("list-navigation")
      ).expectDefaultPrevented()
      scene.props({ ...base, open: true }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      assert.isNull(partsOf(scene).highlighted)
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("apple", 0)
      )
      scene.fire(input, "keydown", key("Enter")).emitted(
        updated("Apple", "item-press"),
        dismissed("item-press")
      )
        .expectDefaultPrevented()
        .expectNone()
      scene.props({ ...base, value: "Apple" })
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: false }))
        .emitted(
          highlighted(null, -1, "none"),
          settled(false)
        )
      assert.strictEqual(shownText(scene), "Apple")
      scene.props({ ...base, autoHighlight: true })
      scene.fire(input, "keydown", key("ArrowUp")).emitted(
        opened("list-navigation"),
        highlighted("grape", 4)
      )
      const props = { ...base, open: true, value: "ap", name: "q" }
      scene.props(props).mounted(tracked(scene), sent("ShowedPopup"))
      scene.fire(item("apricot"), "click", pointer("mouse"))
        .emitted(updated("Apricot", "item-press"), dismissed("item-press"))
        .expectNone()
      scene.props({ ...props, submitOnItemClick: true })
      scene.fire(item("grape"), "click", pointer("mouse"))
        .emitted(updated("Grape", "item-press"), dismissed("item-press"))
        .expectExact(HtmlCommand.RequestSubmit)
      scene.resolve(HtmlCommand.RequestSubmit, { found: true, submitted: true })
    }))

  it.effect("autoHighlight always follows open and value without previewing, and keepHighlight outlasts the pointer", () =>
    Effect.gen(function*() {
      const always = { ...base, open: true, autoHighlight: "always" as const }
      const scene = yield* shown(always)
      assert.strictEqual(partsOf(scene).highlighted, "apple")
      assert.strictEqual(
        scene.get(input).attrs?.["aria-activedescendant"],
        scene.get(item("apple")).attrs?.id
      )
      scene.fire(input, "input", typed("gr")).emitted(updated("gr"))
      scene.props({ ...always, value: "gr" })
      assert.strictEqual(partsOf(scene).highlighted, "grape")
      scene.fire(input, "keydown", key("ArrowDown")).expectDefaultPrevented()
      assert.strictEqual(partsOf(scene).highlighted, "grape")
      const both = { ...always, open: false, mode: "both" as const }
      scene.props(both)
      scene.fire(input, "input", typed("ap")).emitted(
        updated("ap"),
        opened("input-change"),
        highlighted("apple", 0)
      )
      scene.props({ ...both, open: true, value: "ap" })
      assert.strictEqual(partsOf(scene).highlighted, "apple")
      assert.strictEqual(shownText(scene), "ap")
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("apricot", 1)
      )
      assert.strictEqual(shownText(scene), "Apricot")
      scene.props({ ...both, value: "ap" })
      assert.strictEqual(shownText(scene), "ap")
      scene.props({ ...base, open: true })
      scene.fire(item("banana"), "mouseenter").emitted(
        highlighted("banana", 2, "pointer")
      )
      scene.fire(item("banana"), "mouseleave").emitted(
        highlighted(null, -1, "pointer")
      )
      scene.props({ ...base, open: true, keepHighlight: true })
      scene.fire(item("grape"), "mouseenter").emitted(
        highlighted("grape", 4, "pointer")
      )
      scene.fire(item("grape"), "mouseleave")
      assert.strictEqual(partsOf(scene).highlighted, "grape")
    }))

  it.effect("mode controls filtering and keyboard inline preview, and readOnly disables preview", () =>
    Effect.gen(function*() {
      const props = { ...base, open: true, value: "ap", mode: "both" as const }
      const scene = yield* shown(props)
      assert.strictEqual(scene.get(input).attrs?.["aria-autocomplete"], "both")
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("apple", 0)
      )
      assert.strictEqual(shownText(scene), "Apple")
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("apricot", 1)
      )
      assert.strictEqual(shownText(scene), "Apricot")
      assert.deepStrictEqual(values(scene), ["apple", "apricot", "grape"])
      scene.fire(item("grape"), "mouseenter").emitted(
        highlighted("grape", 2, "pointer")
      )
      assert.strictEqual(shownText(scene), "Apricot")
      scene.fire(input, "input", typed("Apricots")).emitted(
        updated("Apricots"),
        highlighted(null, -1, "none")
      )
      scene.props({ ...props, value: "Apricots" })
      assert.strictEqual(shownText(scene), "Apricots")
      scene.props(props)
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("apple", 0)
      )
      assert.strictEqual(shownText(scene), "Apple")
      scene.fire(input, "keydown", key("Escape")).emitted(
        dismissed("escape-key")
      )
      assert.strictEqual(shownText(scene), "ap")
      const inline = { ...props, mode: "inline" as const }
      scene.props(inline)
      assert.strictEqual(
        scene.get(input).attrs?.["aria-autocomplete"],
        "inline"
      )
      assert.strictEqual(values(scene).length, 5)
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("apricot", 1)
      )
      assert.strictEqual(shownText(scene), "Apricot")
      scene.props({ ...inline, readOnly: true })
      assert.strictEqual(scene.get(input).attrs?.["aria-autocomplete"], "none")
      assert.strictEqual(shownText(scene), "ap")
      scene.props({ ...inline, mode: "none" })
      assert.strictEqual(values(scene).length, 5)
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("banana", 2)
      )
      assert.strictEqual(shownText(scene), "ap")
    }))

  it.effect("with inputInPopup, the trigger shows the picked label and one hidden input holds the form value", () =>
    Effect.gen(function*() {
      const props = {
        ...base,
        open: true,
        value: "ba",
        name: "q",
        form: "search",
        required: true,
        inputInPopup: true
      }
      const scene = yield* shown(props)
      const labelId = scene.get(Locator.attr("class", "label")).attrs?.id
      assert.isString(labelId)
      assert.deepInclude(scene.get(trigger).attrs, {
        "aria-labelledby": labelId
      })
      assert.deepInclude(scene.get(Locator.attr("class", "popup")).attrs, {
        role: "dialog",
        "aria-labelledby": labelId
      })
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("banana", 0)
      )
      scene.fire(input, "keydown", key("Enter")).emitted(
        updated("Banana", "item-press"),
        dismissed("item-press")
      )
      scene.props({ ...props, open: false, value: "Banana" })
      assert.strictEqual(
        Locator.textOf(scene.get(Locator.attr("class", "value"))),
        "Banana"
      )
      const named = scene.all(Locator.attr("name", "q"))
      assert.strictEqual(named.length, 1)
      assert.deepInclude(named[0].attrs, {
        value: "Banana",
        form: "search",
        required: "",
        "aria-hidden": "true"
      })
      assert.strictEqual(scene.get(trigger).attrs?.form, "search")
      assert.isUndefined(scene.get(input).attrs?.name)
      assert.isUndefined(scene.get(input).attrs?.required)
    }))

  it("makeAutocompleteFilter matches as the autocomplete does", () => {
    const filter = makeAutocompleteFilter()
    assert.isTrue(filter.startsWith("Apricot", "apr"))
    assert.isFalse(filter.endsWith("Apricot", "apr"))
  })
})
