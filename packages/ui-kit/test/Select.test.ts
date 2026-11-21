import { Component, type Mount, type View } from "@effect/ui"
import { Select, type SelectEvents, type SelectProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type Parts = Component.Headless.Parts<typeof Select>
type H = View.Helper<never, SelectProps> & View.Tags<Html.Elements, never>

const items = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "dim", label: "Dim", disabled: true },
  { value: "system", label: "System" },
  { value: "solar", label: "Solar" }
]

const standIn = {
  elements: Html,
  view: (select: Parts, h: H) =>
    h.div(
      select.label(h.div.class("label")).children("Theme"),
      select.trigger(h.button.class("trigger")).children(
        select.value(h.span.class("value")),
        select.icon(h.span.class("icon"))
      ),
      select.backdrop(h.div.class("backdrop")),
      select.positioner(h.div.class("positioner")).children(
        select.popup(h.div.class("popup")).children(
          select.scrollUpArrow(h.div.class("up")),
          select.group(h.div.class("group"), "all").children(
            select.groupLabel(h.div.class("group-label"), "all").children("All"),
            ...items.map(({ label, value }) =>
              select.item(h.div.attr("data-testid", value), value).children(
                select.itemText(h.div).children(label),
                select.itemIndicator(h.span.class("check"), value)?.children("✓")
              )
            )
          ),
          select.separator(h.div.class("separator")),
          select.scrollDownArrow(h.div.class("down")),
          select.arrow(h.div.class("arrow"))
        )
      ),
      select.finalFocus(h.button.class("next")).children("Next")
    )
}

const label = Locator.attr("class", "label")
const trigger = Locator.attr("class", "trigger")
const value = Locator.attr("class", "value")
const positioner = Locator.attr("class", "positioner")
const popup = Locator.attr("class", "popup")
const arrow = Locator.attr("class", "arrow")
const item = (value: string) => Locator.testId(value)

const pointer = (pointerType: string, button = 0) => ({ button, x: 0, y: 0, pointerType })
const key = (key: string, extra: object = {}) => ({
  key,
  shift: false,
  ctrl: false,
  alt: false,
  meta: false,
  composing: false,
  ...extra
})

type TrackSelect = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const tracked = (s: Rendered): TrackSelect =>
  (s.get(positioner) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as TrackSelect
const sent = (tag: string, fields: object = {}) => ({ _tag: tag, ...fields }) as never
const argsOf = (s: Rendered) => (tracked(s) as unknown as { readonly args: Record<string, unknown> }).args

const partsOf = (s: { readonly parts: (f: (select: Parts) => void) => unknown }): Parts => {
  let parts: Parts | undefined
  s.parts((select) => {
    parts = select
  })
  return parts!
}

const opened = (reason: string) => ({ _tag: "Opened", reason }) as SelectEvents
const dismissed = (reason: string) => ({ _tag: "Dismissed", reason }) as SelectEvents
const picked = (value: string | ReadonlyArray<string>, reason = "item-press") =>
  ({ _tag: "Picked", value, reason }) as SelectEvents

const open = Effect.fnUntraced(function*(props: Partial<SelectProps> = {}) {
  const s = yield* HtmlScene.make(Select, { open: false, items, ...props }, standIn)
  s.fire(trigger, "mousedown", pointer("mouse")).emitted(opened("trigger-press"))
  s.props({ open: true, items, ...props }).mounted(tracked(s), sent("ShowedPopup"))
  return s
})

describe("Select", () => {
  it.effect("draws a combobox trigger named by its label, showing the placeholder or the selected label", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Select, { open: false, items, placeholder: "Pick one" }, standIn)
      const id = s.get(trigger).attrs?.id
      assert.isString(id)
      assert.deepInclude(s.get(trigger).attrs, {
        type: "button",
        role: "combobox",
        "aria-haspopup": "listbox",
        "aria-expanded": "false",
        "aria-labelledby": s.get(label).attrs?.id,
        "data-placeholder": ""
      })
      assert.isUndefined(s.get(trigger).attrs?.["aria-controls"])
      assert.strictEqual(Locator.textOf(s.get(value)), "Pick one")
      assert.isFalse(s.get(positioner).props?.popoverOpen)
      s.props({ open: false, items, value: "dark" })
      assert.strictEqual(Locator.textOf(s.get(value)), "Dark")
      assert.isUndefined(s.get(trigger).attrs?.["data-placeholder"])
      assert.strictEqual(partsOf(s).selected, "dark")
      s.props({ open: false, items, value: "", placeholder: "Pick one" })
      assert.strictEqual(Locator.textOf(s.get(value)), "Pick one")
      assert.isTrue(partsOf(s).placeholder)
    }))

  it.effect("each part's attributes win over the consumer's, set or absent, and the consumer's class stays", () =>
    Effect.gen(function*() {
      const theirs = {
        elements: Html,
        view: (select: Parts, h: H) =>
          h.div(
            select.trigger(
              h.button.class("trigger").attr("id", "mine").attr("role", "button").attr("aria-expanded", "true")
                .attr("data-popup-open", "x").attr("data-placeholder", "x").attr("data-note", "kept")
            ),
            select.positioner(h.div.class("positioner").attr("role", "dialog")).children(
              select.popup(h.div.class("popup").attr("role", "menu").attr("tabindex", "0")).children(
                ...items.map(({ value }) =>
                  select.item(
                    h.div.attr("data-testid", value).attr("role", "menuitem").attr("aria-selected", "true")
                      .attr("data-selected", "x").attr("data-highlighted", "x"),
                    value
                  )
                )
              )
            )
          )
      }
      const s = yield* HtmlScene.make(Select, { open: false, items, value: "light" }, theirs)
      assert.deepInclude(s.get(trigger).attrs, { role: "combobox", "aria-expanded": "false", "data-note": "kept" })
      assert.notStrictEqual(s.get(trigger).attrs?.id, "mine")
      assert.isUndefined(s.get(trigger).attrs?.["data-popup-open"])
      assert.isUndefined(s.get(trigger).attrs?.["data-placeholder"])
      assert.deepInclude(s.get(positioner).attrs, { role: "presentation" })
      assert.deepInclude(s.get(popup).attrs, { role: "listbox", tabindex: "-1" })
      assert.deepInclude(s.get(item("light")).attrs, { role: "option", "aria-selected": "true", "data-selected": "" })
      assert.deepInclude(s.get(item("dark")).attrs, { role: "option", "aria-selected": "false" })
      assert.isUndefined(s.get(item("dark")).attrs?.["data-selected"])
      assert.isUndefined(s.get(item("dark")).attrs?.["data-highlighted"])
    }))

  it.effect("a click on the label focuses the trigger without opening", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Select, { open: false, items }, standIn)
      s.click(label)
      assert.deepStrictEqual(s.current.pending.map(({ command }) => command.name), ["Html.focus"])
      s.resolve(s.current.pending[0]!.command, Component.noop as never)
    }))

  it.effect("a mouse press on the trigger opens it, and the popup is a listbox of options", () =>
    Effect.gen(function*() {
      const s = yield* open({ value: "system" })
      assert.isTrue(s.get(positioner).props?.popoverOpen)
      const popupId = s.get(popup).attrs?.id
      assert.deepInclude(s.get(trigger).attrs, {
        "aria-expanded": "true",
        "aria-controls": popupId,
        "data-popup-open": "",
        "data-pressed": ""
      })
      assert.deepInclude(s.get(popup).attrs, { role: "listbox", tabindex: "-1", "data-open": "", "data-side": "none" })
      assert.deepInclude(s.get(item("system")).attrs, {
        role: "option",
        "aria-selected": "true",
        tabindex: "0",
        "data-selected": "",
        "data-highlighted": ""
      })
      assert.deepInclude(s.get(item("light")).attrs, { "aria-selected": "false", tabindex: "-1" })
      assert.deepInclude(s.get(item("dim")).attrs, { "aria-disabled": "true", "data-disabled": "" })
      assert.strictEqual(s.all(Locator.attr("class", "check")).length, 1)
      assert.deepInclude(s.get(Locator.attr("class", "group")).attrs, {
        role: "group",
        "aria-labelledby": s.get(Locator.attr("class", "group-label")).attrs?.id
      })
      assert.deepInclude(s.get(Locator.attr("class", "separator")).attrs, { role: "separator" })
      assert.isUndefined(s.query(arrow))
      assert.deepInclude(argsOf(s), { open: true, aligned: true, lock: true })
      assert.strictEqual(argsOf(s).active, s.get(item("system")).attrs?.id)
      assert.strictEqual(partsOf(s).openMethod, "mouse")
    }))

  it.effect("a touch tap opens it next to the trigger, where the arrow shows", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Select, { open: false, items }, standIn)
      s.fire(trigger, "mousedown", pointer("touch")).expectIgnored()
      s.fire(trigger, "click", pointer("touch")).emitted(opened("trigger-press"))
      s.props({ open: true, items }).expectMount(tracked(s))
      assert.deepInclude(argsOf(s), { aligned: false, touch: true })
      assert.deepInclude(s.get(popup).attrs, { "data-side": "bottom" })
      s.mounted(
        tracked(s),
        sent("ChangedPlacement", {
          placement: { side: "top", align: "center", anchorHidden: false, arrowUncentered: true }
        })
      )
      assert.deepInclude(s.get(arrow).attrs, { "data-side": "top", "data-uncentered": "" })
      assert.deepInclude(s.get(trigger).attrs, { "data-popup-side": "top" })
    }))

  it.effect("falls back to placing the popup next to the trigger until it closes", () =>
    Effect.gen(function*() {
      const s = yield* open()
      assert.deepInclude(argsOf(s), { aligned: true })
      s.mounted(tracked(s), sent("FellBack"))
      assert.deepInclude(argsOf(s), { aligned: false })
      assert.isDefined(s.query(arrow))
      assert.deepInclude(s.get(popup).attrs, { "data-side": "bottom" })
      s.mounted(tracked(s), sent("ResizedWindow"))
      s.fire(popup, "keydown", key("Escape")).emitted(dismissed("escape-key")).expectDefaultPrevented()
      s.props({ open: false, items })
      s.mounted(tracked(s), sent("FinishedTransition", { open: false })).emitted({ _tag: "Settled", open: false })
      assert.isFalse(s.get(positioner).props?.popoverOpen)
      s.fire(trigger, "mousedown", pointer("mouse")).emitted(opened("trigger-press"))
      s.props({ open: true, items }).expectMount(tracked(s))
      assert.deepInclude(argsOf(s), { aligned: true })
      s.mounted(tracked(s), sent("ResizedWindow")).emitted(dismissed("window-resize"))
    }))

  it.effect("ArrowDown and ArrowUp on the closed trigger open it on the first or the last item", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Select, { open: false, items }, standIn)
      s.fire(trigger, "keydown", key("ArrowDown")).emitted(opened("list-navigation")).expectDefaultPrevented()
      s.props({ open: true, items }).expectMount(tracked(s))
      assert.strictEqual(partsOf(s).highlighted, "light")
      assert.strictEqual(partsOf(s).openMethod, "keyboard")
      s.fire(popup, "keydown", key("Escape")).emitted(dismissed("escape-key"))
      s.props({ open: false, items })
      s.fire(trigger, "keydown", key("ArrowUp")).emitted(opened("list-navigation"))
      s.props({ open: true, items }).expectMount(tracked(s))
      assert.strictEqual(partsOf(s).highlighted, "solar")
    }))

  it.effect("Enter or Space on the trigger, a click with no pointer, toggles it", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Select, { open: false, items }, standIn)
      s.fire(trigger, "keydown", key(" ")).expectIgnored()
      s.fire(trigger, "click", pointer("")).emitted(opened("trigger-press"))
      s.fire(trigger, "click", pointer("mouse")).expectIgnored()
    }))

  it.effect("arrows, Home and End move between items, disabled ones included, without wrapping", () =>
    Effect.gen(function*() {
      const s = yield* open({ value: "light" })
      const step = (k: string, expected: string) => {
        s.fire(popup, "keydown", key(k)).expectDefaultPrevented()
        assert.strictEqual(partsOf(s).highlighted, expected)
        assert.strictEqual(argsOf(s).active, s.get(item(expected)).attrs?.id)
        assert.isTrue(argsOf(s).scroll)
      }
      step("ArrowUp", "light")
      step("ArrowDown", "dark")
      step("ArrowDown", "dim")
      step("End", "solar")
      step("ArrowDown", "solar")
      step("Home", "light")
      s.fire(popup, "keydown", key("ArrowLeft")).expectIgnored()
      s.fire(popup, "keydown", key("Tab")).expectIgnored()
    }))

  it.effect("Enter picks the highlighted item on keydown, and Space on keyup", () =>
    Effect.gen(function*() {
      const s = yield* open({ value: "light" })
      s.fire(popup, "keydown", key("ArrowDown"))
      s.fire(popup, "keydown", key("Enter")).emitted(picked("dark"), dismissed("item-press"))
      s.props({ open: true, items, value: "dark" })
      s.fire(popup, "keydown", key("ArrowDown"))
      s.fire(popup, "keydown", key("Enter"))
      s.fire(popup, "keydown", key("ArrowDown"))
      s.fire(popup, "keydown", key(" ")).expectDefaultPrevented()
      s.fire(popup, "keyup", key(" ")).emitted(picked("system"), dismissed("item-press"))
      s.fire(popup, "keyup", key(" "))
    }))

  it.effect("Escape cancels its key, so a dialog around it stays open, and Shift+Tab closes it", () =>
    Effect.gen(function*() {
      const s = yield* open()
      s.fire(popup, "keydown", key("Escape")).emitted(dismissed("escape-key")).expectDefaultPrevented()
      s.fire(popup, "keydown", key("Tab", { shift: true })).emitted(dismissed("focus-out"))
      assert.deepInclude(argsOf(s), { closeMethod: "keyboard", focusLeft: false })
    }))

  it.effect("typing in the popup moves to the next matching item, skipping disabled ones", () =>
    Effect.gen(function*() {
      const s = yield* open({ value: "light" })
      const type = (k: string, expected: string | null) => {
        s.fire(popup, "keydown", key(k))
        assert.strictEqual(partsOf(s).highlighted, expected)
      }
      type("d", "dark")
      type("i", "dark")
      assert.deepStrictEqual(s.current.pending.map(({ command }) => command.name), ["WaitBeforeResetTyping"])
      s.resolve(s.current.pending[0]!.command, sent("CompletedWaitBeforeResetTyping"))
      type("d", "dark")
      type("s", "dark")
      s.resolve(s.current.pending[0]!.command, sent("CompletedWaitBeforeResetTyping"))
      type("s", "system")
      type("s", "solar")
      type("s", "system")
      s.resolve(s.current.pending[0]!.command, sent("CompletedWaitBeforeResetTyping"))
      type("S", "system")
      type("o", "solar")
      type(" ", "solar")
      assert.deepInclude(argsOf(s), { scroll: true })
      s.resolve(s.current.pending[0]!.command, sent("CompletedWaitBeforeResetTyping"))
    }))

  it.effect("typing on the closed trigger picks the next matching item without opening", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Select, { open: false, items, value: "light" }, standIn)
      s.fire(trigger, "keydown", key("s")).emitted(picked("system", "none")).expectDefaultPrevented()
      s.props({ open: false, items, value: "system" })
      s.fire(trigger, "keydown", key("s")).emitted(picked("solar", "none"))
      s.fire(trigger, "keydown", key("s", { ctrl: true })).expectIgnored()
      s.props({ open: false, items, value: "system", readOnly: true })
      s.fire(trigger, "keydown", key("l"))
      s.resolve(s.current.pending[0]!.command, sent("CompletedWaitBeforeResetTyping"))
    }))

  it.effect("a press opens on mousedown, and a release on an item picks it only after the press has been held", () =>
    Effect.gen(function*() {
      const s = yield* open({ value: "light" })
      s.fire(item("dark"), "mouseup", pointer("mouse"))
      s.mounted(tracked(s), sent("DraggedPointer"))
      s.fire(item("light"), "mouseup", pointer("mouse"))
      s.fire(item("dark"), "mouseup", pointer("mouse")).emitted(picked("dark"), dismissed("item-press"))
      s.props({ open: true, items, value: "dark" })
      s.mounted(tracked(s), sent("AllowedRelease"))
      s.fire(item("light"), "mouseup", pointer("mouse")).emitted(picked("light"), dismissed("item-press"))
    }))

  it.effect("a click on an item picks it, and a disabled item can't be picked", () =>
    Effect.gen(function*() {
      const s = yield* open({ value: "light" })
      s.fire(item("dark"), "mousedown", pointer("mouse"))
      s.fire(item("dark"), "mouseup", pointer("mouse"))
      s.fire(item("dark"), "click", pointer("mouse")).emitted(picked("dark"), dismissed("item-press"))
      s.fire(item("dim"), "click", pointer("touch"))
      s.fire(item("dark"), "click", pointer("mouse"))
    }))

  it.effect("the pointer highlights the item it's over, unless highlightItemOnHover is false", () =>
    Effect.gen(function*() {
      const s = yield* open({ value: "light" })
      s.fire(item("dark"), "mouseenter")
      assert.strictEqual(partsOf(s).highlighted, "dark")
      assert.isFalse(argsOf(s).scroll)
      s.fire(item("dark"), "mouseleave")
      assert.isNull(partsOf(s).highlighted)
      s.props({ open: true, items, value: "light", highlightItemOnHover: false })
      s.fire(item("system"), "mouseenter").expectIgnored()
      assert.isNull(partsOf(s).highlighted)
    }))

  it.effect("a multiple select toggles values and stays open", () =>
    Effect.gen(function*() {
      const s = yield* open({ multiple: true, value: ["light"], name: "themes" })
      assert.deepInclude(s.get(popup).attrs, { "aria-multiselectable": "true" })
      s.fire(item("dark"), "click", pointer("")).emitted(picked(["light", "dark"]))
      s.props({ open: true, items, multiple: true, value: ["light", "dark"], name: "themes" })
      s.fire(item("light"), "click", pointer("")).emitted(picked(["dark"]))
      assert.strictEqual(Locator.textOf(s.get(value)), "Light, Dark")
      const hidden = s.all(Locator.attr("type", "hidden"))
      assert.deepStrictEqual(hidden.map((node) => [node.attrs?.name, node.attrs?.value]), [
        ["themes", "light"],
        ["themes", "dark"]
      ])
    }))

  it.effect("the mount reports a press outside, focus leaving and a released opening press", () =>
    Effect.gen(function*() {
      const s = yield* open()
      s.mounted(tracked(s), sent("PressedOutside", { pointerType: "mouse" })).emitted(dismissed("outside-press"))
      assert.deepInclude(argsOf(s), { focusLeft: false, closeMethod: "mouse" })
      s.mounted(tracked(s), sent("FocusedOutside")).emitted(dismissed("focus-out"))
      assert.deepInclude(argsOf(s), { focusLeft: true })
      s.mounted(tracked(s), sent("ReleasedPointer", { outside: true }))
      s.props({ open: false, items })
      s.fire(trigger, "mousedown", pointer("mouse")).emitted(opened("trigger-press"))
      s.props({ open: true, items })
      assert.isTrue(argsOf(s).pressing)
      s.mounted(tracked(s), sent("ReleasedPointer", { outside: true })).emitted(dismissed("cancel-open"))
      s.mounted(tracked(s), sent("FocusedTrigger")).emitted(dismissed("none"))
    }))

  it.effect("a disabled select doesn't open", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Select, { open: false, items, disabled: true }, standIn)
      assert.deepInclude(s.get(trigger).attrs, { disabled: "", "data-disabled": "" })
      s.fire(trigger, "mousedown", pointer("mouse"))
      s.fire(trigger, "keydown", key("ArrowDown"))
    }))

  it.effect("a read-only select opens and can be browsed, but not changed", () =>
    Effect.gen(function*() {
      const s = yield* open({ readOnly: true, value: "light" })
      assert.deepInclude(s.get(trigger).attrs, { "aria-readonly": "true", "data-readonly": "" })
      s.fire(popup, "keydown", key("ArrowDown"))
      assert.strictEqual(partsOf(s).highlighted, "dark")
      s.fire(popup, "keydown", key("Enter"))
    }))

  it.effect("with a name, the trigger is wrapped with a hidden input that submits the value", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(
        Select,
        { open: false, items, value: "dark", name: "theme", required: true, form: "settings" },
        standIn
      )
      const input = s.get(Locator.tag("input"))
      assert.deepInclude(input.attrs, {
        name: "theme",
        form: "settings",
        value: "dark",
        type: "text",
        required: "",
        tabindex: "-1",
        "aria-hidden": "true"
      })
      assert.deepInclude(s.get(trigger).attrs, { "aria-required": "true", "data-required": "" })
      s.fire(Locator.tag("input"), "focus")
      assert.deepStrictEqual(s.current.pending.map(({ command }) => command.name), ["Html.focus"])
      s.resolve(s.current.pending[0]!.command, Component.noop as never)
      s.fire(Locator.tag("input"), "change", { value: "System", checked: false }).emitted(picked("system", "none"))
      s.fire(Locator.tag("input"), "change", { value: "nope", checked: false })
    }))

  it.effect("reports its transitions and settles after the exit animation", () =>
    Effect.gen(function*() {
      const s = yield* open()
      assert.strictEqual(partsOf(s).transitionStatus, "starting")
      s.mounted(tracked(s), sent("ShowedPopup"))
      s.mounted(tracked(s), sent("RenderedFirstFrame"))
      assert.isNull(partsOf(s).transitionStatus)
      s.mounted(tracked(s), sent("FinishedTransition", { open: true })).emitted({ _tag: "Settled", open: true })
      s.props({ open: false, items })
      assert.strictEqual(partsOf(s).transitionStatus, "ending")
      assert.deepInclude(s.get(positioner).attrs, { "data-ending-style": "", "data-closed": "" })
      assert.isTrue(s.get(positioner).props?.popoverOpen)
      s.mounted(tracked(s), sent("FinishedTransition", { open: false })).emitted({ _tag: "Settled", open: false })
      assert.isFalse(s.get(positioner).props?.popoverOpen)
    }))
})
