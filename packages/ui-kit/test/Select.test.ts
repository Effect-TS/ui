import { type Component, type Mount, UiSchema, type View } from "@effect/ui"
import { Select, type SelectEvents, type SelectProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlLocator, HtmlPlay, HtmlScene } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

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
      select.trigger(
        h.button.class("trigger").attrs({
          id: "mine",
          role: "button",
          "aria-expanded": "true",
          "data-popup-open": "x",
          "data-placeholder": "x",
          "data-note": "kept"
        })
      ).children(
        select.value(h.span.class("value")),
        select.icon(h.span.class("icon"))
      ),
      select.backdrop(h.div.class("backdrop")),
      select.positioner(h.div.class("positioner").attr("role", "dialog"))
        .children(
          select.popup(
            h.div.class("popup").attrs({ role: "menu", tabindex: "0" })
          ).children(
            select.scrollUpArrow({ element: h.div.class("up") }),
            select.group({ element: h.div.class("group"), group: "all" })
              .children(
                select.groupLabel({
                  element: h.div.class("group-label"),
                  group: "all"
                }).children("All"),
                ...items.map(({ label, value }) =>
                  select.item({
                    element: h.div.attrs({
                      "data-testid": value,
                      role: "menuitem",
                      "aria-selected": "true",
                      "data-selected": "x",
                      "data-highlighted": "x"
                    }),
                    value
                  }).children(
                    select.itemText(h.div).children(label),
                    select.itemIndicator({
                      element: h.span.class("check"),
                      value
                    })?.children("✓")
                  )
                )
              ),
            select.separator(h.div.class("separator")),
            select.scrollDownArrow({ element: h.div.class("down") }),
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
  ...extra
})

type TrackSelect = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const tracked = (scene: Rendered): TrackSelect =>
  (scene.get(positioner) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)
    ?.mount as unknown as TrackSelect
const sent = (tag: string, fields: object = {}) =>
  ({ _tag: tag, ...fields }) as never

const partsOf = (
  scene: { readonly parts: (f: (select: Parts) => void) => unknown }
): Parts => {
  let parts: Parts | undefined
  scene.parts((select) => {
    parts = select
  })
  return parts!
}

const opened = (reason: string) =>
  ({ _tag: "RequestedOpen", reason }) as SelectEvents
const dismissed = (reason: string) =>
  ({ _tag: "RequestedClose", reason }) as SelectEvents
const picked = (value: string | ReadonlyArray<string>, reason = "item-press") =>
  ({ _tag: "Picked", value, reason }) as SelectEvents

const open = Effect.fnUntraced(function*(props: Partial<SelectProps> = {}) {
  const scene = yield* HtmlScene.make(
    Select,
    { open: false, items, ...props },
    standIn
  )
  scene.fire(trigger, "mousedown", pointer("mouse")).emitted(
    opened("trigger-press")
  )
  scene.props({ open: true, items, ...props }).mounted(
    tracked(scene),
    sent("ShowedPopup")
  )
  return scene
})

describe("Select", () => {
  it.effect("draws a combobox trigger named by its label, showing the placeholder or the selected label", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Select, {
        open: false,
        items,
        placeholder: "Pick one"
      }, standIn)
      const id = scene.get(trigger).attrs?.id
      assert.isString(id)
      assert.notStrictEqual(id, "mine")
      assert.deepInclude(scene.get(trigger).attrs, {
        type: "button",
        role: "combobox",
        "aria-haspopup": "listbox",
        "aria-expanded": "false",
        "aria-labelledby": scene.get(label).attrs?.id,
        "data-placeholder": "",
        "data-note": "kept"
      })
      assert.isUndefined(scene.get(trigger).attrs?.["aria-controls"])
      assert.isUndefined(scene.get(trigger).attrs?.["data-popup-open"])
      assert.deepInclude(scene.get(positioner).attrs, { role: "presentation" })
      assert.deepInclude(scene.get(popup).attrs, {
        role: "listbox",
        tabindex: "-1",
        "aria-labelledby": scene.get(label).attrs?.id
      })
      assert.isUndefined(scene.get(item("dark")).attrs?.["data-selected"])
      assert.isUndefined(scene.get(item("dark")).attrs?.["data-highlighted"])
      assert.strictEqual(Locator.textOf(scene.get(value)), "Pick one")
      assert.isFalse(scene.get(positioner).props?.popoverOpen)
      scene.props({ open: false, items, value: "dark" })
      assert.strictEqual(Locator.textOf(scene.get(value)), "Dark")
      assert.isUndefined(scene.get(trigger).attrs?.["data-placeholder"])
      assert.deepInclude(scene.get(item("dark")).attrs, {
        role: "option",
        "aria-selected": "true",
        "data-selected": ""
      })
      assert.deepInclude(scene.get(item("light")).attrs, {
        role: "option",
        "aria-selected": "false"
      })
      assert.isUndefined(scene.get(item("light")).attrs?.["data-selected"])
      assert.strictEqual(partsOf(scene).selected, "dark")
      scene.props({ open: false, items, value: "", placeholder: "Pick one" })
      assert.strictEqual(Locator.textOf(scene.get(value)), "Pick one")
      assert.isTrue(partsOf(scene).placeholder)
    }))

  it.effect("a mouse press on the trigger opens it, and the popup is a listbox of options", () =>
    Effect.gen(function*() {
      const scene = yield* open({ value: "system", dismissLabel: "Fermer" })
      assert.isTrue(scene.get(positioner).props?.popoverOpen)
      const popupId = scene.get(popup).attrs?.id
      assert.deepInclude(scene.get(trigger).attrs, {
        "aria-expanded": "true",
        "aria-controls": popupId,
        "data-popup-open": "",
        "data-pressed": ""
      })
      assert.deepInclude(scene.get(popup).attrs, {
        role: "listbox",
        tabindex: "-1",
        "data-open": "",
        "data-side": "none"
      })
      assert.deepInclude(scene.get(item("system")).attrs, {
        role: "option",
        "aria-selected": "true",
        tabindex: "0",
        "data-selected": "",
        "data-highlighted": ""
      })
      assert.deepInclude(scene.get(item("light")).attrs, {
        "aria-selected": "false",
        tabindex: "-1"
      })
      assert.deepInclude(scene.get(item("dim")).attrs, {
        "aria-disabled": "true",
        "data-disabled": ""
      })
      assert.strictEqual(scene.all(Locator.attr("class", "check")).length, 1)
      assert.deepInclude(scene.get(Locator.attr("class", "group")).attrs, {
        role: "group",
        "aria-labelledby": scene.get(Locator.attr("class", "group-label")).attrs
          ?.id
      })
      assert.deepInclude(scene.get(Locator.attr("class", "separator")).attrs, {
        role: "separator"
      })
      assert.isUndefined(scene.query(arrow))
      assert.strictEqual(partsOf(scene).openMethod, "mouse")
      const close = Locator.attr("aria-label", "Fermer")
      assert.deepInclude(scene.get(close).attrs, { role: "button" })
      scene.fire(close, "click", pointer("")).emitted(dismissed("close-press"))
    }))

  it.effect("a touch tap opens it next to the trigger, where the arrow shows", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        Select,
        { open: false, items },
        standIn
      )
      scene.fire(trigger, "mousedown", pointer("touch")).expectIgnored()
      scene.fire(trigger, "click", pointer("touch")).emitted(
        opened("trigger-press")
      )
      scene.props({ open: true, items }).expectMount(tracked(scene))
      assert.strictEqual(partsOf(scene).openMethod, "touch")
      assert.deepInclude(scene.get(popup).attrs, { "data-side": "bottom" })
      scene.mounted(
        tracked(scene),
        sent("ChangedPlacement", {
          placement: {
            side: "top",
            align: "center",
            anchorHidden: false,
            arrowUncentered: true
          }
        })
      )
      assert.deepInclude(scene.get(arrow).attrs, {
        "data-side": "top",
        "data-uncentered": ""
      })
      assert.deepInclude(scene.get(trigger).attrs, { "data-popup-side": "top" })
    }))

  it.effect("falls back to placing the popup next to the trigger until it closes", () =>
    Effect.gen(function*() {
      const scene = yield* open()
      assert.isUndefined(scene.query(arrow))
      scene.mounted(tracked(scene), sent("FellBack"))
      assert.isDefined(scene.query(arrow))
      assert.deepInclude(scene.get(popup).attrs, { "data-side": "bottom" })
      scene.mounted(tracked(scene), sent("ResizedWindow"))
      scene.fire(popup, "keydown", key("Escape")).emitted(
        dismissed("escape-key")
      )
        .expectDefaultPrevented()
      scene.props({ open: false, items })
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: false }))
        .emitted({ _tag: "Settled", open: false })
      assert.isFalse(scene.get(positioner).props?.popoverOpen)
      scene.fire(trigger, "mousedown", pointer("mouse")).emitted(
        opened("trigger-press")
      )
      scene.props({ open: true, items }).expectMount(tracked(scene))
      assert.isUndefined(scene.query(arrow))
      scene.mounted(tracked(scene), sent("ResizedWindow")).emitted(
        dismissed("window-resize")
      )
    }))

  it.effect("keyboard on the closed trigger opens it on the first or last item, and click with no pointer toggles", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        Select,
        { open: false, items },
        standIn
      )
      scene.fire(trigger, "keydown", key(" ")).expectIgnored()
      scene.fire(trigger, "click", pointer("mouse")).expectIgnored()
      scene.fire(trigger, "click", pointer("")).emitted(opened("trigger-press"))
      scene.fire(trigger, "keydown", key("ArrowDown")).emitted(
        opened("list-navigation")
      ).expectDefaultPrevented()
      scene.props({ open: true, items }).expectMount(tracked(scene))
      assert.strictEqual(partsOf(scene).highlighted, "light")
      assert.strictEqual(partsOf(scene).openMethod, "keyboard")
      scene.fire(popup, "keydown", key("Escape")).emitted(
        dismissed("escape-key")
      )
      scene.props({ open: false, items })
      scene.fire(trigger, "keydown", key("ArrowUp")).emitted(
        opened("list-navigation")
      )
      scene.props({ open: true, items }).expectMount(tracked(scene))
      assert.strictEqual(partsOf(scene).highlighted, "solar")
    }))

  it.effect("arrows, Home and End move between items without wrapping, and Shift+Tab closes", () =>
    Effect.gen(function*() {
      const scene = yield* open({ value: "light" })
      const step = (k: string, expected: string) => {
        scene.fire(popup, "keydown", key(k)).expectDefaultPrevented()
        assert.strictEqual(partsOf(scene).highlighted, expected)
      }
      step("ArrowUp", "light")
      step("ArrowDown", "dark")
      step("ArrowDown", "dim")
      step("End", "solar")
      step("ArrowDown", "solar")
      step("Home", "light")
      scene.fire(popup, "keydown", key("ArrowLeft")).expectIgnored()
      scene.fire(popup, "keydown", key("Tab")).expectIgnored()
      scene.fire(popup, "keydown", key("Tab", { shift: true })).emitted(
        dismissed("focus-out")
      )
    }))

  it.effect("Enter picks the highlighted item on keydown, and Space on keyup", () =>
    Effect.gen(function*() {
      const scene = yield* open({ value: "light" })
      scene.fire(popup, "keydown", key("ArrowDown"))
      scene.fire(popup, "keydown", key("Enter")).emitted(
        picked("dark"),
        dismissed("item-press")
      )
      scene.props({ open: true, items, value: "dark" })
      scene.fire(popup, "keydown", key("ArrowDown"))
      scene.fire(popup, "keydown", key("Enter"))
      scene.fire(popup, "keydown", key("ArrowDown"))
      scene.fire(popup, "keydown", key(" ")).expectDefaultPrevented()
      scene.fire(popup, "keyup", key(" ")).emitted(
        picked("system"),
        dismissed("item-press")
      )
      scene.fire(popup, "keyup", key(" "))
    }))

  it.effect("typing in the popup moves to the next matching item, skipping disabled ones", () =>
    Effect.gen(function*() {
      const scene = yield* open({ value: "light" })
      const type = (k: string, expected: string | null) => {
        scene.fire(popup, "keydown", key(k))
        assert.strictEqual(partsOf(scene).highlighted, expected)
      }
      type("d", "dark")
      type("i", "dark")
      assert.deepStrictEqual(
        scene.current.pending.map(({ command }) => command.name),
        ["WaitBeforeResetTyping"]
      )
      scene.resolve(
        scene.current.pending[0]!.command,
        sent("CompletedWaitBeforeResetTyping")
      )
      type("d", "dark")
      type("s", "dark")
      scene.resolve(
        scene.current.pending[0]!.command,
        sent("CompletedWaitBeforeResetTyping")
      )
      type("s", "system")
      type("s", "solar")
      type("S", "system")
      scene.resolve(
        scene.current.pending[0]!.command,
        sent("CompletedWaitBeforeResetTyping")
      )
      type("S", "system")
      type("o", "solar")
      type(" ", "solar")
      scene.resolve(
        scene.current.pending[0]!.command,
        sent("CompletedWaitBeforeResetTyping")
      )
    }))

  it.effect("typing on the closed trigger picks the next matching item without opening", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Select, {
        open: false,
        items,
        value: "light"
      }, standIn)
      scene.fire(trigger, "keydown", key("s")).emitted(picked("system", "none"))
        .expectDefaultPrevented()
      scene.props({ open: false, items, value: "system" })
      scene.fire(trigger, "keydown", key("s")).emitted(picked("solar", "none"))
      scene.fire(trigger, "keydown", key("s", { ctrl: true })).expectIgnored()
      scene.props({ open: false, items, value: "system", readOnly: true })
      scene.fire(trigger, "keydown", key("l"))
      scene.resolve(
        scene.current.pending[0]!.command,
        sent("CompletedWaitBeforeResetTyping")
      )
    }))

  it.effect("a press opens on mousedown, and a release on an item picks it only after the press has been held", () =>
    Effect.gen(function*() {
      const scene = yield* open({ value: "light" })
      scene.fire(item("dark"), "mouseup", pointer("mouse"))
      scene.mounted(tracked(scene), sent("DraggedPointer"))
      scene.fire(item("light"), "mouseup", pointer("mouse"))
      scene.fire(item("dark"), "mouseup", pointer("mouse")).emitted(
        picked("dark"),
        dismissed("item-press")
      )
      scene.props({ open: true, items, value: "dark" })
      scene.mounted(tracked(scene), sent("AllowedRelease"))
      scene.fire(item("light"), "mouseup", pointer("mouse")).emitted(
        picked("light"),
        dismissed("item-press")
      )
    }))

  it.effect("a click on an item picks it, and a disabled item can't be picked", () =>
    Effect.gen(function*() {
      const scene = yield* open({ value: "light" })
      scene.fire(item("dark"), "mousedown", pointer("mouse"))
      scene.fire(item("dark"), "mouseup", pointer("mouse"))
      scene.fire(item("dark"), "click", pointer("mouse")).emitted(
        picked("dark"),
        dismissed("item-press")
      )
      scene.fire(item("dim"), "click", pointer("touch"))
      scene.fire(item("dark"), "click", pointer("mouse"))
    }))

  it.effect("the pointer highlights the item it's over, unless highlightItemOnHover is false", () =>
    Effect.gen(function*() {
      const scene = yield* open({ value: "light" })
      scene.fire(item("dark"), "mouseenter")
      assert.strictEqual(partsOf(scene).highlighted, "dark")
      scene.fire(item("dark"), "mouseleave")
      assert.isNull(partsOf(scene).highlighted)
      scene.props({
        open: true,
        items,
        value: "light",
        highlightItemOnHover: false
      })
      scene.fire(item("system"), "mouseenter").expectIgnored()
      assert.isNull(partsOf(scene).highlighted)
    }))

  it.effect("a multiple select toggles values and stays open", () =>
    Effect.gen(function*() {
      const scene = yield* open({
        multiple: true,
        value: ["light"],
        name: "themes"
      })
      assert.deepInclude(scene.get(popup).attrs, {
        "aria-multiselectable": "true"
      })
      scene.fire(item("dark"), "click", pointer("")).emitted(
        picked(["light", "dark"])
      )
      scene.props({
        open: true,
        items,
        multiple: true,
        value: ["light", "dark"],
        name: "themes"
      })
      scene.fire(item("light"), "click", pointer("")).emitted(picked(["dark"]))
      assert.strictEqual(Locator.textOf(scene.get(value)), "Light, Dark")
      const hidden = scene.all(Locator.attr("type", "hidden"))
      assert.deepStrictEqual(
        hidden.map((node) => [node.attrs?.name, node.attrs?.value]),
        [
          ["themes", "light"],
          ["themes", "dark"]
        ]
      )
    }))

  it.effect("releasing an opening press outside cancels the open, and focusing the trigger dismisses", () =>
    Effect.gen(function*() {
      const scene = yield* open()
      scene.mounted(tracked(scene), sent("ReleasedPointer", { outside: true }))
        .emitted(dismissed("cancel-open"))
      scene.mounted(tracked(scene), sent("FocusedTrigger")).emitted(
        dismissed("none")
      )
    }))

  it.effect("disabled prevents opening, and readOnly allows browsing without changing", () =>
    Effect.gen(function*() {
      const disabled = yield* HtmlScene.make(Select, {
        open: false,
        items,
        disabled: true
      }, standIn)
      assert.deepInclude(disabled.get(trigger).attrs, {
        disabled: "",
        "data-disabled": ""
      })
      disabled.fire(trigger, "mousedown", pointer("mouse"))
      disabled.fire(trigger, "keydown", key("ArrowDown"))

      const scene = yield* open({ readOnly: true, value: "light" })
      assert.deepInclude(scene.get(trigger).attrs, {
        "aria-readonly": "true",
        "data-readonly": ""
      })
      scene.fire(popup, "keydown", key("ArrowDown"))
      assert.strictEqual(partsOf(scene).highlighted, "dark")
      scene.fire(popup, "keydown", key("Enter"))
    }))

  it.effect("with a name, a hidden input carries form props and accepts autofill changes", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        Select,
        {
          open: false,
          items,
          value: "dark",
          name: "theme",
          required: true,
          form: "settings"
        },
        standIn
      )
      const input = scene.get(Locator.tag("input"))
      assert.deepInclude(input.attrs, {
        name: "theme",
        form: "settings",
        value: "dark",
        type: "text",
        required: "",
        tabindex: "-1",
        "aria-hidden": "true"
      })
      assert.deepInclude(scene.get(trigger).attrs, {
        "aria-required": "true",
        "data-required": ""
      })
      scene.fire(Locator.tag("input"), "change", {
        value: "System",
        checked: false
      }).emitted(picked("system", "none"))
      scene.fire(Locator.tag("input"), "change", {
        value: "Dim",
        checked: false
      })
      assert.deepStrictEqual(scene.current.emitted, [])
      scene.fire(Locator.tag("input"), "change", {
        value: "nope",
        checked: false
      })
    }))

  it.effect("reports its transitions and settles after the exit animation", () =>
    Effect.gen(function*() {
      const scene = yield* open()
      assert.strictEqual(partsOf(scene).transitionStatus, "starting")
      scene.mounted(tracked(scene), sent("ShowedPopup"))
      scene.mounted(tracked(scene), sent("RenderedFirstFrame"))
      assert.isNull(partsOf(scene).transitionStatus)
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: true }))
        .emitted({ _tag: "Settled", open: true })
      scene.props({ open: false, items })
      assert.strictEqual(partsOf(scene).transitionStatus, "ending")
      assert.deepInclude(scene.get(positioner).attrs, {
        "data-ending-style": "",
        "data-closed": ""
      })
      assert.isTrue(scene.get(positioner).props?.popoverOpen)
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: false }))
        .emitted({ _tag: "Settled", open: false })
      assert.isFalse(scene.get(positioner).props?.popoverOpen)
    }))

  it.effect("keeps custom value children and validates hidden part tags", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Select, {
        open: false,
        items,
        value: "dark",
        placeholder: "Pick one"
      }, {
        elements: Html,
        view: (select, h) =>
          h.div(
            select.trigger(h.button.class("trigger")).children(
              select.value(h.span.class("value")).children("Custom")
            )
          )
      })
      assert.strictEqual(Locator.textOf(scene.get(value)), "Custom")

      const hiddenTagCases: ReadonlyArray<
        (select: Parts, h: H) => View.Content<never>
      > = [
        (select, h) => h.div(select.arrow(h.span as never)),
        (select, h) =>
          h.div(
            select.itemIndicator({ element: h.div as never, value: "light" })
          ),
        (select, h) =>
          h.div(select.scrollUpArrow({ element: h.span as never })),
        (select, h) =>
          h.div(select.scrollDownArrow({ element: h.span as never }))
      ]
      for (const render of hiddenTagCases) {
        const exit = yield* Effect.exit(
          HtmlScene.make(Select, { open: false, items, value: "dark" }, {
            elements: Html,
            view: render
          })
        )
        if (exit._tag !== "Failure") assert.fail("expected failure")
        assert.include(String(exit.cause), "a part for")
      }
    }))

  it.effect("picks an option in HtmlPlay with two clicks and no fire", () =>
    Effect.gen(function*() {
      const Msg = UiSchema.TaggedEnum({
        Opened: {},
        Closed: {},
        Picked: { value: Schema.String }
      })
      const ThemePicker = Html.component({
        name: "ThemePicker",
        model: Schema.Struct({ open: Schema.Boolean, value: Schema.String }),
        message: Msg
      }).make({
        init: () => ({ open: false, value: "light" }),
        update: {
          Opened: ($) => $.evolve({ open: true }),
          Closed: ($) => $.evolve({ open: false }),
          Picked: ($, { value }) => $.evolve({ value })
        },
        view: (h, model) =>
          Select(h, {
            props: { open: model.open, value: model.value, items },
            onEmit: {
              RequestedOpen: () => Msg.Opened(),
              RequestedClose: () => Msg.Closed(),
              Picked: ({ value }) => Msg.Picked({ value: String(value) }),
              Settled: () => undefined
            },
            view: (select) =>
              h.div(
                select.trigger(h.button).children(select.value(h.span)),
                model.open
                  ? select.positioner(h.div).children(
                    select.popup(h.div).children(
                      ...items.map(({ label, value }) =>
                        select.item({ element: h.div, value }).children(
                          select.itemText(h.div).children(label)
                        )
                      )
                    )
                  )
                  : undefined
              )
          })
      })
      const play = yield* HtmlPlay.make(ThemePicker, {})
      yield* play.click(HtmlLocator.role("combobox"))
      yield* play.click(HtmlLocator.role("option", { name: "Dark" }))
      yield* play.expect(HtmlLocator.role("combobox")).toHaveText("Dark")
      yield* play.expect(HtmlLocator.role("option", { name: "Dark" }))
        .toBeAbsent()
    }).pipe(Effect.provide(TestHost.layer())))
})
