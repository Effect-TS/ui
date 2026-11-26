import type { Component, Mount, View } from "@effect/ui"
import {
  Combobox,
  type ComboboxEvents,
  type ComboboxItem,
  type ComboboxProps,
  DirectionProvider,
  makeComboboxFilter,
  Typeahead
} from "@effect/ui-kit"
import { Html, HtmlCommand } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

type Parts = Component.Headless.Parts<typeof Combobox>
type H = View.Helper<never, ComboboxProps> & View.Tags<Html.Elements, never>

const fruits: ReadonlyArray<ComboboxItem> = [
  { value: "apple", label: "Apple" },
  { value: "apricot", label: "Apricot" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry", disabled: true },
  { value: "grape", label: "Grape" }
]

// A child component the trigger can't see into.
const Icon = Html.component({
  name: "Icon",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => h.span.attr("aria-hidden", "true").children("▾")
})

const standIn = {
  elements: Html,
  view: (combobox: Parts, h: H) =>
    h.div(
      combobox.inputGroup(h.div.class("group")).children(
        combobox.input(h.input.class("input")),
        combobox.clear({ element: h.button.class("clear") })?.children("×"),
        combobox.trigger(h.button.class("trigger")).children(
          combobox.icon(h.span.class("icon")).children("▾")
        )
      ),
      combobox.positioner(h.div.class("positioner")).children(
        combobox.popup(h.div.class("popup")).children(
          combobox.empty(h.div.class("empty")).children("No fruit found"),
          combobox.list(h.div.class("list")).children(
            ...combobox.items.map(({ label, value }) =>
              combobox.item({
                element: h.div.attr("data-testid", value),
                value
              }).children(
                label,
                combobox.itemIndicator({
                  element: h.span.class("check"),
                  value
                })?.children("✓")
              )
            )
          )
        )
      ),
      combobox.status(h.div.class("status")).children(
        combobox.items.length + " fruits"
      )
    )
}

const chipsStandIn = {
  elements: Html,
  view: (combobox: Parts, h: H) =>
    h.div(
      combobox.chips(h.div.class("chips")).children(
        ...combobox.selectedItems.map(({ label, value }) =>
          combobox.chip({
            element: h.div.attr("data-testid", "chip-" + value),
            value
          }).children(
            label,
            combobox.chipRemove({
              element: h.button.attr("data-testid", "remove-" + value),
              value
            }).children("×")
          )
        ),
        combobox.input(h.input.class("input"))
      ),
      combobox.positioner(h.div.class("positioner")).children(
        combobox.popup(h.div.class("popup")).children(
          combobox.list(h.div.class("list")).children(
            ...combobox.items.map(({ label, value }) =>
              combobox.item({
                element: h.div.attr("data-testid", value),
                value
              }).children(label)
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
      combobox.trigger(h.button.class("trigger")).children(
        combobox.value(h.span.class("value"))
      ),
      combobox.positioner(h.div.class("positioner")).children(
        combobox.popup(h.div.class("popup")).children(
          combobox.input(h.input.class("input")),
          combobox.list(h.div.class("list")).children(
            ...combobox.items.map(({ label, value }) =>
              combobox.item({
                element: h.div.attr("data-testid", value),
                value
              }).children(label)
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
      combobox.trigger(h.button.class("trigger")).attr("aria-label", "Emoji"),
      combobox.list(h.div.class("list")).children(
        ...combobox.groups.flatMap((group) =>
          group.rows.map((cells) =>
            combobox.row(h.div.class("row")).children(
              ...cells.map(({ label, value }) =>
                combobox.item({
                  element: h.div.attr("data-testid", value),
                  value
                }).children(label)
              )
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
const typed = (value: string, inputType = "insertText", composing = false) => ({
  value,
  inputType,
  composing,
  checked: false
})

type Tracked = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const trackedOn = (locator: Locator.Locator) => (scene: Rendered): Tracked =>
  (scene.get(locator) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)
    ?.mount as unknown as Tracked
const tracked = trackedOn(positioner)
const chipsTracked = trackedOn(Locator.attr("class", "chips"))
const sent = (tag: string, fields: object = {}) =>
  ({ _tag: tag, ...fields }) as never

const partsOf = (
  scene: { readonly parts: (f: (combobox: Parts) => void) => unknown }
): Parts => {
  let parts: Parts | undefined
  scene.parts((combobox) => {
    parts = combobox
  })
  return parts!
}

const opened = (reason: string) =>
  ({ _tag: "RequestedOpen", reason }) as ComboboxEvents
const dismissed = (reason: string) =>
  ({ _tag: "RequestedClose", reason }) as ComboboxEvents
const picked = (
  value: string | ReadonlyArray<string> | null,
  reason = "item-press"
) => ({ _tag: "Picked", value, reason }) as ComboboxEvents
const edited = (inputValue: string, reason = "input-change") =>
  ({ _tag: "RequestedInputValue", inputValue, reason }) as ComboboxEvents
const highlighted = (
  value: string | null,
  index: number,
  reason = "keyboard"
) => ({ _tag: "Highlighted", value, index, reason }) as ComboboxEvents
const settled = (open: boolean) => ({ _tag: "Settled", open }) as ComboboxEvents
const values = (
  scene: { readonly parts: (f: (combobox: Parts) => void) => unknown }
) => partsOf(scene).items.map((item) => item.value)

const base: ComboboxProps = { open: false, inputValue: "", items: fruits }

const shown = Effect.fnUntraced(
  function*(props: ComboboxProps, view: typeof standIn = standIn) {
    const scene = yield* HtmlScene.make(Combobox, props, view)
    scene.mounted(tracked(scene), sent("ShowedPopup"))
    return scene
  }
)

describe("Combobox", () => {
  it.effect("draws combobox semantics, hidden form input and clear button", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        Combobox,
        { ...base, name: "fruit", value: "banana", inputValue: "Banana" },
        standIn
      )
      assert.deepInclude(scene.get(input).attrs, {
        role: "combobox",
        "aria-expanded": "false",
        "aria-haspopup": "listbox",
        "aria-autocomplete": "list",
        autocomplete: "off",
        value: "Banana"
      })
      assert.isUndefined(scene.get(input).attrs?.["aria-controls"])
      assert.deepInclude(scene.get(group).attrs, { role: "group" })
      assert.deepInclude(scene.get(trigger).attrs, {
        type: "button",
        tabindex: "-1",
        "aria-expanded": "false",
        "aria-label": "Open popup"
      })
      assert.deepInclude(scene.get(list).attrs, {
        role: "listbox",
        tabindex: "-1"
      })
      assert.deepInclude(scene.get(item("banana")).attrs, {
        role: "option",
        "aria-selected": "true",
        "data-selected": ""
      })
      assert.deepInclude(scene.get(item("cherry")).attrs, {
        "aria-disabled": "true",
        "data-disabled": ""
      })
      assert.deepInclude(scene.get(Locator.attr("name", "fruit")).attrs, {
        value: "banana",
        "aria-hidden": "true"
      })
      assert.deepInclude(scene.get(Locator.attr("class", "status")).attrs, {
        role: "status",
        "aria-live": "polite"
      })
      assert.strictEqual(Locator.textOf(scene.get(empty)), "")
      assert.deepInclude(scene.get(clearButton).attrs, {
        type: "button",
        tabindex: "-1",
        "aria-label": "Clear",
        "data-visible": ""
      })
      scene.fire(clearButton, "mousedown", pointer("mouse")).expectIgnored()
        .expectDefaultPrevented()
      scene.fire(clearButton, "click", pointer("mouse")).emitted(
        edited("", "clear-press"),
        picked(null, "clear-press")
      )
      scene.resolve(HtmlCommand.Focus, { found: true })
      scene.props({ ...base, name: "fruit" })
      assert.isUndefined(scene.query(clearButton))
    }))

  it.effect("keeps the name, form and required a consumer puts on the input, and a button's text name", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Combobox, {
        ...base,
        value: "banana"
      }, {
        elements: Html,
        view: (combobox: Parts, h: H) =>
          h.div(
            combobox.input(
              h.input.class("input").attrs({
                name: "query",
                form: "search",
                required: ""
              })
            ),
            combobox.trigger(h.button.class("trigger")).children(
              h.span.children("Show fruits")
            ),
            combobox.clear({ element: h.button.class("clear") })?.children(
              h.span.attr("aria-hidden", "true").children("Clear text")
            )
          )
      })
      assert.deepInclude(scene.get(input).attrs, {
        name: "query",
        form: "search",
        required: ""
      })
      // Its text names the trigger, so it gets no fallback name, but hidden
      // text doesn't name the clear button.
      assert.isUndefined(scene.get(trigger).attrs?.["aria-label"])
      assert.deepInclude(scene.get(clearButton).attrs, {
        "aria-label": "Clear"
      })
      // A child component may or may not name it, so the fallback is a title.
      const withIcon = yield* HtmlScene.make(Combobox, base, {
        elements: Html,
        view: (combobox: Parts, h: H) =>
          combobox.trigger(h.button.class("trigger")).children(Icon(h, {}))
      })
      assert.isUndefined(withIcon.get(trigger).attrs?.["aria-label"])
      assert.strictEqual(withIcon.get(trigger).attrs?.title, "Open popup")
    }))

  it.effect("typing opens and filters; autofill reports without opening; composition waits for compositionend", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Combobox, base, standIn)
      scene.fire(input, "input", typed("Apple", "insertReplacementText"))
        .emitted(edited("Apple"))
      scene.fire(input, "input", typed("ba", "")).emitted(edited("ba"))
      scene.fire(input, "input", typed("ap")).emitted(
        edited("ap"),
        opened("input-change")
      )
      scene.props({ ...base, open: true, inputValue: "ap" }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      assert.deepStrictEqual(values(scene), ["apple", "apricot", "grape"])
      assert.isNull(partsOf(scene).highlighted)
      assert.deepInclude(scene.get(input).attrs, {
        "aria-expanded": "true",
        "aria-controls": scene.get(list).attrs?.id
      })
      scene.fire(input, "input", typed("zz")).emitted(edited("zz"))
      scene.props({ ...base, open: true, inputValue: "zz" })
      assert.isTrue(partsOf(scene).listEmpty)
      assert.strictEqual(Locator.textOf(scene.get(empty)), "No fruit found")
      assert.deepInclude(scene.get(positioner).attrs, { "data-empty": "" })
      scene.props(base)
      scene.fire(input, "input", typed("り", "insertCompositionText", true))
        .emitted(opened("input-change"))
      scene.props({ ...base, open: true }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      scene.fire(input, "compositionend", { value: "りんご" }).emitted(
        edited("りんご")
      )
    }))

  it.effect("filters by mode, limit, filteredItems and drops empty groups", () =>
    Effect.gen(function*() {
      const open = { ...base, open: true, inputValue: "a" }
      const scene = yield* shown(open)
      assert.deepStrictEqual(values(scene), [
        "apple",
        "apricot",
        "banana",
        "grape"
      ])
      scene.props({ ...open, filter: "startsWith" })
      assert.deepStrictEqual(values(scene), ["apple", "apricot"])
      scene.props({ ...open, filter: "endsWith", inputValue: "e" })
      assert.deepStrictEqual(values(scene), ["apple", "grape"])
      scene.props({ ...open, filter: "none" })
      assert.strictEqual(values(scene).length, 5)
      scene.props({ ...open, limit: 2 })
      assert.deepStrictEqual(values(scene), ["apple", "apricot"])
      scene.props({
        ...open,
        value: "grape",
        filteredItems: [{ value: "grape", label: "Filtered Grape" }]
      })
      assert.deepStrictEqual(values(scene), ["grape"])
      assert.strictEqual(partsOf(scene).selectedItems[0]?.label, "Grape")
      const grouped = [
        { value: "apple", label: "Apple", group: "fruit" },
        { value: "kale", label: "Kale", group: "vegetable" },
        { value: "leek", label: "Leek", group: "vegetable" }
      ]
      scene.props({ ...base, items: grouped, inputValue: "ka", open: true })
      assert.deepStrictEqual(
        partsOf(scene).groups.map((g) => [g.key, g.items.map((i) => i.value)]),
        [["vegetable", ["kale"]]]
      )
    }))

  it.effect("pointer opens from input, group or trigger, hovers items, and picks on release", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Combobox, base, standIn)
      scene.fire(input, "mousedown", pointer("mouse")).emitted(
        opened("input-press")
      ).expectDefaultPrevented(false)
      scene.props({ ...base, open: true }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      scene.fire(input, "mousedown", pointer("mouse")).expectIgnored()
      scene.fire(item("banana"), "mouseenter").emitted(
        highlighted("banana", 2, "pointer")
      )
      scene.fire(item("banana"), "mouseleave").emitted(
        highlighted(null, -1, "pointer")
      )
      scene.fire(item("grape"), "mouseenter").emitted(
        highlighted("grape", 4, "pointer")
      )
      scene.fire(item("grape"), "mouseup", pointer("mouse")).emitted(
        picked("grape"),
        edited("Grape", "item-press"),
        dismissed("item-press")
      )
      scene.fire(item("cherry"), "click", pointer("mouse")).expectIgnored()
      scene.fire(trigger, "mousedown", pointer("mouse")).emitted(
        dismissed("trigger-press")
      ).expectDefaultPrevented()
      scene.resolve(HtmlCommand.Focus, { found: true })
      scene.props(base)
      scene.fire(group, "mousedown", pointer("mouse")).emitted(
        opened("input-press"),
        highlighted(null, -1, "none")
      )
        .expectDefaultPrevented()
      scene.resolve(HtmlCommand.Focus, { found: true })
      scene.fire(trigger, "mousedown", pointer("touch")).expectIgnored()
      scene.fire(trigger, "click", pointer("touch")).emitted(
        opened("trigger-press")
      )
      scene.props({ ...base, open: true, highlightItemOnHover: false })
      assert.strictEqual(partsOf(scene).openMethod, "touch")
      scene.fire(item("banana"), "mouseenter").expectIgnored()
      scene.props({ ...base, open: false, openOnInputClick: false })
      scene.fire(input, "mousedown", pointer("mouse")).expectIgnored()
    }))

  it.effect("keyboard opens on the selected or end item, loops or clamps, and skips modified keys", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Combobox, base, standIn)
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        opened("list-navigation"),
        highlighted("apple", 0)
      )
        .expectDefaultPrevented()
      scene.props({ ...base, open: true }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      assert.deepInclude(scene.get(item("apple")).attrs, {
        "data-highlighted": ""
      })
      scene.fire(input, "keydown", key("Escape")).emitted(
        dismissed("escape-key")
      )
      scene.props(base)
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: false }))
        .emitted(
          highlighted(null, -1, "none"),
          settled(false)
        )
      scene.fire(input, "keydown", key("ArrowUp")).emitted(
        opened("list-navigation"),
        highlighted("grape", 4)
      )
      scene.props({ ...base, open: true }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted(null, -1)
      )
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("apple", 0)
      )
      scene.fire(input, "keydown", key("ArrowUp")).emitted(
        highlighted(null, -1)
      )
      scene.props({ ...base, open: true, loopFocus: false })
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("apple", 0)
      )
      scene.fire(input, "keydown", key("ArrowUp")).expectDefaultPrevented()
      assert.strictEqual(partsOf(scene).highlighted, "apple")
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("apricot", 1)
      )
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("banana", 2)
      )
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("cherry", 3)
      )
      scene.fire(input, "keydown", key("Enter")).expectDefaultPrevented()
      scene.fire(input, "keydown", key("Home")).expectIgnored()
      scene.fire(input, "keydown", key("ArrowDown", { shift: true }))
        .expectIgnored()
      scene.fire(input, "keydown", key("Escape")).emitted(
        dismissed("escape-key")
      )
      scene.props({ ...base, value: "banana", inputValue: "Banana" })
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: false }))
        .emitted(
          highlighted(null, -1, "none"),
          settled(false)
        )
      scene.fire(input, "keydown", key("ArrowUp")).emitted(
        opened("list-navigation"),
        highlighted("banana", 2)
      )
      scene.props({
        ...base,
        value: "banana",
        inputValue: "Banana",
        open: true
      })
        .mounted(tracked(scene), sent("ShowedPopup"))
      assert.strictEqual(values(scene).length, 5)
    }))

  it.effect("autoHighlight, Enter, Space and Escape pick, dismiss or clear", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Combobox, {
        ...base,
        autoHighlight: true
      }, standIn)
      scene.fire(input, "input", typed("an")).emitted(
        edited("an"),
        opened("input-change")
      )
      scene.props({
        ...base,
        autoHighlight: true,
        open: true,
        inputValue: "an"
      })
        .mounted(tracked(scene), sent("ShowedPopup"))
      assert.strictEqual(
        scene.get(input).attrs?.["aria-activedescendant"],
        scene.get(item("banana")).attrs?.id
      )
      scene.fire(input, "keydown", key("Enter")).emitted(
        picked("banana"),
        edited("Banana", "item-press"),
        dismissed("item-press")
      ).expectDefaultPrevented()
      scene.props(base)
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: false }))
        .emitted(
          highlighted(null, -1, "none"),
          settled(false)
        )
      scene.props({ ...base, open: true }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      scene.fire(input, "keydown", key("Enter")).expectIgnored()
      scene.fire(input, "keyup", key("Enter")).emitted(dismissed("none"))
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("apple", 0)
      )
      scene.fire(input, "keyup", key("Enter")).expectIgnored()
      scene.fire(input, "keydown", key(" ")).emitted(
        picked("apple"),
        edited("Apple", "item-press"),
        dismissed("item-press")
      ).expectDefaultPrevented()
      scene.props({ ...base, open: true, inputValue: "a" })
      scene.fire(input, "keydown", key(" ")).expectIgnored()
      scene.props({ ...base, value: "banana", inputValue: "Banana" })
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: false }))
        .emitted(
          highlighted(null, -1, "none"),
          settled(false)
        )
      scene.fire(input, "keydown", key("Escape")).emitted(
        edited("", "escape-key"),
        picked(null, "escape-key")
      )
        .expectDefaultPrevented()
      scene.props(base)
      scene.fire(input, "keydown", key("Escape")).expectIgnored()
      scene.props({
        ...base,
        value: "banana",
        inputValue: "Banana",
        readOnly: true
      })
      scene.fire(input, "keydown", key("Escape")).expectIgnored()
    }))

  it.effect("freezes the filter during exit, restores the selected label on dismiss, and deselects when cleared", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Combobox, base, standIn)
      scene.fire(input, "input", typed("ap")).emitted(
        edited("ap"),
        opened("input-change")
      )
      scene.props({ ...base, open: true, inputValue: "ap" }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      scene.fire(item("apricot"), "click", pointer("mouse")).emitted(
        picked("apricot"),
        edited("Apricot", "item-press"),
        dismissed("item-press")
      )
      scene.props({ ...base, value: "apricot", inputValue: "Apricot" })
      assert.deepStrictEqual(values(scene), ["apple", "apricot", "grape"])
      assert.strictEqual(partsOf(scene).transitionStatus, "ending")
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: false }))
        .emitted(settled(false))
      assert.strictEqual(values(scene).length, 5)
      scene.fire(input, "input", typed("gr")).emitted(
        edited("gr"),
        opened("input-change")
      )
      scene.props({ ...base, value: "apricot", open: true, inputValue: "gr" })
        .mounted(tracked(scene), sent("ShowedPopup"))
      scene.mounted(
        tracked(scene),
        sent("PressedOutside", { pointerType: "mouse" })
      )
        .emitted(dismissed("outside-press"))
      scene.props({ ...base, value: "apricot", inputValue: "gr" })
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: false }))
        .emitted(
          edited("Apricot", "none"),
          settled(false)
        )
      scene.props({ ...base, value: "apricot", inputValue: "Apricot" })
      scene.fire(input, "input", typed("")).emitted(
        edited(""),
        picked(null, "input-clear")
      )
    }))

  it.effect("multiple toggles items, closes after a filtered pick, and manages chips", () =>
    Effect.gen(function*() {
      const props = {
        ...base,
        multiple: true,
        open: true,
        value: ["apple"],
        name: "fruit"
      }
      const scene = yield* shown(props, chipsStandIn)
      scene.expectMount(chipsTracked(scene))
      assert.deepInclude(scene.get(list).attrs, {
        "aria-multiselectable": "true"
      })
      assert.deepInclude(scene.get(Locator.attr("class", "chips")).attrs, {
        role: "toolbar"
      })
      assert.strictEqual(scene.all(Locator.attr("name", "fruit")).length, 1)
      scene.fire(item("grape"), "click", pointer("mouse")).emitted(
        picked(["apple", "grape"])
      )
      scene.props({ ...props, value: ["apple", "grape"] })
      scene.fire(item("apple"), "click", pointer("mouse")).emitted(
        picked(["grape"])
      )
      scene.fire(input, "input", typed("ban")).emitted(edited("ban"))
      scene.props({ ...props, value: ["grape"], inputValue: "ban" })
      scene.fire(item("banana"), "click", pointer("mouse")).emitted(
        picked(["grape", "banana"]),
        edited("", "input-clear"),
        dismissed("item-press")
      )
      scene.props({ ...base, multiple: true, value: ["apple", "grape"] })
      assert.deepInclude(scene.get(item("chip-apple")).attrs, {
        tabindex: "-1",
        "aria-keyshortcuts": "Backspace Delete"
      })
      assert.deepInclude(scene.get(item("remove-apple")).attrs, {
        "aria-label": "Remove"
      })
      const removal = Locator.attr("role", "status")
      scene.fire(input, "keydown", key("Backspace")).emitted(
        picked(["apple"], "none")
      )
      // Only a removal the selection takes is announced.
      assert.strictEqual(Locator.textOf(scene.get(removal)), "")
      scene.props({ ...base, multiple: true, value: ["apple"] })
      assert.strictEqual(Locator.textOf(scene.get(removal)), "Grape, removed")
      scene.props({ ...base, multiple: true, value: ["apple", "grape"] })
      scene.fire(
        input,
        "keydown",
        key("ArrowLeft", { selectionStart: 0, selectionEnd: 0 })
      ).expectDefaultPrevented()
      scene.resolve(HtmlCommand.Focus, { found: true })
      scene.fire(
        input,
        "keydown",
        key("ArrowLeft", { selectionStart: 1, selectionEnd: 1 })
      ).expectIgnored()
      scene.fire(item("remove-apple"), "mousedown", pointer("mouse"))
        .expectIgnored().expectDefaultPrevented()
      scene.fire(item("remove-apple"), "click", pointer("mouse")).emitted(
        picked(["grape"], "chip-remove-press")
      )
      scene.resolve(HtmlCommand.Focus, { found: true })
      scene.props({
        ...base,
        multiple: true,
        value: ["apple"],
        inputValue: "a"
      })
      scene.fire(input, "keydown", key("Backspace")).expectIgnored()
      scene.props({
        ...base,
        multiple: true,
        value: ["apple"],
        readOnly: true,
        disabled: true
      })
      scene.fire(input, "keydown", key("Backspace")).expectIgnored()
      // A chip has no role, so ARIA allows it no aria-disabled or aria-readonly.
      assert.isUndefined(scene.get(item("chip-apple")).attrs?.["aria-disabled"])
      assert.isUndefined(scene.get(item("chip-apple")).attrs?.["aria-readonly"])
      assert.isUndefined(
        scene.get(item("chip-apple")).attrs?.["aria-keyshortcuts"]
      )
    }))

  it.effect("inputInPopup makes the trigger the combobox, supports typeahead, and cancels an outside release", () =>
    Effect.gen(function*() {
      const props = {
        ...base,
        inputInPopup: true,
        placeholder: "Pick a fruit",
        name: "fruit"
      }
      const scene = yield* HtmlScene.make(Combobox, props, inPopupStandIn)
      assert.deepInclude(scene.get(trigger).attrs, {
        role: "combobox",
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
        "aria-labelledby": scene.get(Locator.attr("class", "label")).attrs?.id
      })
      assert.isUndefined(scene.get(trigger).attrs?.tabindex)
      assert.strictEqual(
        Locator.textOf(scene.get(Locator.attr("class", "value"))),
        "Pick a fruit"
      )
      const labelId = scene.get(Locator.attr("class", "label")).attrs?.id
      assert.deepInclude(scene.get(popup).attrs, {
        role: "dialog",
        "aria-modal": "false",
        "aria-labelledby": labelId
      })
      assert.deepInclude(scene.get(list).attrs, { "aria-labelledby": labelId })
      scene.fire(trigger, "keydown", key("g")).emitted(picked("grape", "none"))
      scene.resolve(Typeahead.WaitReset, undefined)
      scene.props({ ...props, value: "grape" })
      assert.strictEqual(
        Locator.textOf(scene.get(Locator.attr("class", "value"))),
        "Grape"
      )
      scene.fire(trigger, "mousedown", pointer("mouse")).emitted(
        opened("trigger-press"),
        highlighted("grape", 4, "none")
      )
        .expectDefaultPrevented(false)
      scene.props({ ...props, value: "grape", open: true }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      assert.strictEqual(
        scene.get(trigger).attrs?.["aria-controls"],
        scene.get(popup).attrs?.id
      )
      scene.mounted(tracked(scene), sent("ReleasedPointer", { outside: true }))
        .emitted(dismissed("cancel-open"))
      scene.fire(input, "input", typed("ba")).emitted(
        edited("ba"),
        highlighted(null, -1, "none")
      )
      scene.props({ ...props, value: "grape", open: true, inputValue: "ba" })
      assert.deepStrictEqual(values(scene), ["banana"])
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("banana", 0)
      )
      scene.fire(input, "keydown", key("Enter")).emitted(
        picked("banana"),
        dismissed("item-press")
      )
      scene.props({ ...props, value: "banana", inputValue: "ba" })
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: false }))
        .emitted(
          highlighted(null, -1, "none"),
          edited("", "input-clear"),
          settled(false)
        )
    }))

  it.effect("grid navigates rows and columns, flips horizontal arrows by dir, then the DirectionProvider, then the CSS direction, and leaves the caret alone when unhighlighted", () =>
    Effect.gen(function*() {
      const grid = Array.from({ length: 7 }, (_, index) => ({
        value: "e" + index,
        label: "Emoji " + index,
        row: Math.floor(index / 3)
      }))
      const props = { ...base, items: grid, grid: true, open: true }
      const scene = yield* HtmlScene.make(Combobox, props, gridStandIn)
      assert.deepInclude(scene.get(input).attrs, { "aria-haspopup": "grid" })
      assert.deepInclude(scene.get(trigger).attrs, {
        "aria-haspopup": "grid",
        "aria-label": "Emoji"
      })
      assert.deepInclude(scene.get(list).attrs, { role: "grid" })
      assert.strictEqual(scene.all(Locator.attr("class", "row")).length, 3)
      assert.deepInclude(scene.all(Locator.attr("class", "row"))[0]!.attrs, {
        role: "row"
      })
      assert.deepInclude(scene.get(item("e0")).attrs, { role: "gridcell" })
      scene.fire(input, "keydown", key("ArrowRight")).expectIgnored()
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("e0", 0)
      )
      scene.fire(input, "keydown", key("ArrowRight")).emitted(
        highlighted("e1", 1)
      )
      scene.fire(input, "keydown", key("ArrowRight")).emitted(
        highlighted("e2", 2)
      )
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("e5", 5)
      )
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("e6", 6)
      )
      scene.fire(input, "keydown", key("ArrowUp")).emitted(highlighted("e3", 3))
      scene.props({ ...props, inline: true }).mounted(
        trackedOn(list)(scene),
        sent("FoundDirection", { rtl: true })
      )
      scene.fire(input, "keydown", key("ArrowLeft")).emitted(
        highlighted("e4", 4)
      )
      scene.shared(DirectionProvider, { direction: "ltr" })
      scene.fire(input, "keydown", key("ArrowLeft")).emitted(
        highlighted("e3", 3)
      )
      scene.props({ ...props, inline: true, dir: "rtl" })
      scene.fire(input, "keydown", key("ArrowLeft")).emitted(
        highlighted("e4", 4)
      )
      scene.props({ ...props, readOnly: true })
      assert.deepInclude(scene.get(list).attrs, { "aria-readonly": "true" })
    }))

  it.effect("inline stays expanded, navigates while closed, restores highlight on focus, and clears on Escape keyup", () =>
    Effect.gen(function*() {
      const props = { ...base, inline: true }
      const scene = yield* HtmlScene.make(Combobox, props, gridStandIn)
      scene.expectMount(trackedOn(list)(scene))
      assert.deepInclude(scene.get(input).attrs, {
        "aria-expanded": "true",
        "aria-controls": scene.get(list).attrs?.id
      })
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        highlighted("apple", 0)
      )
      scene.fire(input, "keydown", key("Enter")).emitted(
        picked("apple"),
        edited("Apple", "item-press")
      )
      scene.fire(input, "focusout", { within: false, disabled: false }).emitted(
        highlighted(null, -1, "none")
      )
      scene.fire(input, "focusin", { within: false }).emitted(
        highlighted("apple", 0, "none")
      )
      scene.props({ ...props, inputValue: "Apple", value: "apple" })
      scene.fire(input, "keydown", key("Escape")).expectIgnored()
      scene.fire(input, "keyup", key("Escape")).emitted(
        edited("", "escape-key"),
        picked(null, "escape-key")
      )
      scene.props({
        ...props,
        inputValue: "Apple",
        value: "apple",
        disabled: true
      })
      scene.fire(input, "keyup", key("Escape"))
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it.effect("disabled ignores input, and readOnly browses without picking", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        Combobox,
        { ...base, disabled: true },
        standIn
      )
      assert.deepInclude(scene.get(input).attrs, { "data-disabled": "" })
      scene.fire(input, "mousedown", pointer("mouse")).expectIgnored()
      scene.fire(input, "keydown", key("ArrowDown")).expectIgnored()
      scene.props({ ...base, readOnly: true })
      assert.deepInclude(scene.get(input).attrs, {
        readonly: "",
        "aria-readonly": "true",
        "aria-autocomplete": "none"
      })
      scene.fire(input, "keydown", key("ArrowDown")).emitted(
        opened("list-navigation"),
        highlighted("apple", 0)
      )
      scene.props({ ...base, readOnly: true, open: true }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      scene.fire(input, "keydown", key("Enter")).expectDefaultPrevented()
      scene.fire(item("apple"), "click", pointer("mouse")).expectHandled()
      scene.props({ ...base, name: "fruit" })
      scene.fire(Locator.attr("name", "fruit"), "change", {
        value: "Cherry",
        checked: false
      })
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it.effect("clears consumer aria-disabled on native controls, keeps custom value content, and validates hidden part tags", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Combobox, {
        ...base,
        multiple: true,
        value: ["apple"],
        inputValue: "ap",
        disabled: true
      }, {
        elements: Html,
        view: (combobox, h) =>
          h.div(
            combobox.value(h.span.class("custom-value")).children("Chosen"),
            combobox.input(
              h.input.class("input").attr("aria-disabled", "true")
            ),
            combobox.trigger(
              h.button.class("trigger").attr("aria-disabled", "true")
            ),
            combobox.clear({
              element: h.button.class("clear").attr("aria-disabled", "true")
            }),
            combobox.chips(h.div.class("chips")).children(
              combobox.chip({ element: h.div.class("chip"), value: "apple" })
                .children(
                  combobox.chipRemove({
                    element: h.button.class("chip-remove").attr(
                      "aria-disabled",
                      "true"
                    ),
                    value: "apple"
                  })
                )
            )
          )
      })
      assert.strictEqual(
        Locator.textOf(scene.get(Locator.attr("class", "custom-value"))),
        "Chosen"
      )
      const controls = [
        input,
        trigger,
        clearButton,
        Locator.attr("class", "chip-remove")
      ]
      for (const loc of controls) {
        assert.strictEqual(scene.get(loc).attrs?.disabled, "")
        assert.isUndefined(scene.get(loc).attrs?.["aria-disabled"])
      }
      scene.props({
        ...base,
        multiple: true,
        value: ["apple"],
        inputValue: "ap",
        disabled: false
      })
      for (const loc of controls) {
        assert.isUndefined(scene.get(loc).attrs?.disabled)
        assert.isUndefined(scene.get(loc).attrs?.["aria-disabled"])
      }
      scene.expectMount(chipsTracked(scene))
      const hiddenTagCases: ReadonlyArray<
        (combobox: Parts, h: H) => View.Content<never>
      > = [
        (combobox, h) => h.div(combobox.clear({ element: h.div as never })),
        (combobox, h) =>
          h.div(
            combobox.itemIndicator({ element: h.div as never, value: "apple" })
          )
      ]
      for (const render of hiddenTagCases) {
        const exit = yield* Effect.exit(
          HtmlScene.make(Combobox, {
            ...base,
            open: false,
            value: null,
            inputValue: ""
          }, {
            elements: Html,
            view: render
          })
        )
        if (exit._tag !== "Failure") assert.fail("expected failure")
        assert.include(String(exit.cause), "a part for")
      }
    }))
})

describe("makeComboboxFilter", () => {
  it("matches ignoring case, accents and punctuation", () => {
    const filter = makeComboboxFilter("en")
    assert.isTrue(filter.contains("Crème brûlée", "creme"))
    assert.isTrue(filter.startsWith("Éclair", "ecl"))
    assert.isTrue(filter.endsWith("Apple", "PLE"))
    assert.isTrue(filter.contains("Co-op", "coop"))
    assert.isTrue(filter.endsWith("Co-op", "oop"))
    assert.isTrue(filter.contains("e\u0301clair", "eclair"))
    assert.isFalse(filter.contains("Apple", "x"))
    assert.isTrue(filter.contains("Apple", ""))
  })

  it("keeps a mark with its letter, in either Unicode form", () => {
    const swedish = makeComboboxFilter("sv")
    const spanish = makeComboboxFilter("es")
    for (const form of ["NFC", "NFD"] as const) {
      const city = "Göteborg".normalize(form)
      // Swedish "ö" isn't "o", and Spanish "ñ" isn't "n", even where the
      // query stops right after the letter.
      assert.isFalse(swedish.startsWith(city, "Go"))
      assert.isFalse(spanish.contains("mañana".normalize(form), "mana"))
      assert.isTrue(swedish.contains(city, "Göt".normalize("NFD")))
      assert.isTrue(
        makeComboboxFilter("en").startsWith("éclair".normalize(form), "eclair")
      )
    }
  })
})
