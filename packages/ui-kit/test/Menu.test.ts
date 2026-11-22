import { Command, Component, type Mount, Route, Router, UiSchema, type View } from "@effect/ui"
import { Menu, type MenuEvents, menuFilter, type MenuProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"

type Parts = Component.Headless.Parts<typeof Menu>
type H = View.Helper<never, MenuProps> & View.Tags<Html.Elements, never>

const items = [
  { value: "undo", label: "Undo", disabled: true },
  { value: "copy", label: "Copy" },
  { value: "cut", label: "Cut" },
  { value: "paste", label: "Paste" },
  { value: "wrap", label: "Wrap lines" },
  { value: "minimap", label: "Minimap" },
  { value: "small", label: "Small" },
  { value: "large", label: "Large" },
  { value: "docs", label: "Docs" },
  { value: "delete", label: "Delete", disabled: true }
]

const entry = (h: H, value: string) =>
  h.div.attrs({ "data-testid": value, role: "option", "aria-disabled": "false", "data-highlighted": "x" })

const standIn = {
  elements: Html,
  view: (menu: Parts, h: H) => {
    const filtering = h.props.query !== undefined
    const entries = [
      menu.group(h.div.class("group"), "edit").children(
        menu.groupLabel(h.div.class("group-label"), "edit").children("Edit"),
        menu.item(entry(h, "undo"), "undo").children("Undo"),
        menu.item(entry(h, "copy"), "copy").children("Copy"),
        menu.item(entry(h, "cut"), "cut", false).children("Cut"),
        menu.item(entry(h, "paste"), "paste").children("Paste")
      ),
      menu.separator(h.div.class("separator")),
      menu.checkboxItem(entry(h, "wrap").attr("aria-checked", "false"), "wrap", true, true).children(
        menu.checkboxItemIndicator(h.span.class("tick"), "wrap")?.children("✓"),
        "Wrap lines"
      ),
      menu.checkboxItem(entry(h, "minimap"), "minimap", false).children("Minimap"),
      menu.radioGroup(h.div.class("sizes"), "small").children(
        menu.radioItem(entry(h, "small").attr("data-checked", "x"), "small").children("Small"),
        menu.radioItem(entry(h, "large"), "large").children("Large")
      ),
      menu.linkItem(h.a.attrs({ "data-testid": "docs", href: "/docs" }), "docs").children("Docs"),
      menu.item(entry(h, "delete"), "delete").children("Delete")
    ]
    return h.div(
      menu.trigger(h.button.class("trigger").attr("id", "edit")).children("Edit"),
      menu.positioner(h.div.class("positioner")).children(
        menu.popup(h.div.class("popup")).children(
          filtering ? menu.input(h.input.class("input")) : null,
          filtering ? menu.clear(h.button.class("clear"))?.children("Clear") : null,
          filtering ? menu.list(h.div.class("list")).children(...entries) : h.div(...entries),
          filtering ? menu.empty(h.div.class("empty"))?.children("No matches") : null,
          menu.arrow(h.div.class("arrow"))
        )
      )
    )
  }
}

const trigger = Locator.attr("class", "trigger")
const positioner = Locator.attr("class", "positioner")
const popup = Locator.attr("class", "popup")
const input = Locator.attr("class", "input")
const clear = Locator.attr("class", "clear")
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
  ...extra
})

type TrackMenu = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const tracked = (s: Rendered): TrackMenu =>
  (s.get(positioner) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as TrackMenu
const sent = (tag: string, fields: object = {}) => ({ _tag: tag, ...fields }) as never

const partsOf = (s: { readonly parts: (f: (menu: Parts) => void) => unknown }): Parts => {
  let parts: Parts | undefined
  s.parts((menu) => {
    parts = menu
  })
  return parts!
}

const opened = (reason: string) => ({ _tag: "Opened", reason, triggerId: "edit" }) as MenuEvents
const dismissed = (reason: string) => ({ _tag: "Dismissed", reason }) as MenuEvents
const picked = (value: string, checked?: boolean) =>
  (checked === undefined ? { _tag: "Picked", value } : { _tag: "Picked", value, checked }) as MenuEvents
const highlighted = (value: string | null, reason: string) => ({ _tag: "Highlighted", value, reason }) as MenuEvents

type Pending = { readonly current: { readonly pending: ReadonlyArray<{ readonly command: any }> } }

const elapse = Effect.fnUntraced(function*<S extends Pending & { readonly resolve: (command: any, result: any) => S }>(
  s: S,
  name: string,
  millis: number
) {
  const command = s.current.pending.find((run) => run.command.name === name)!.command
  const fiber = yield* Effect.forkChild(command.effect as Effect.Effect<unknown>)
  if (millis > 0) {
    yield* TestClock.adjust(`${millis - 1} millis`)
    assert.isUndefined(fiber.pollUnsafe())
  }
  yield* TestClock.adjust(`${Math.min(millis, 1)} millis`)
  return s.resolve(command, yield* Fiber.join(fiber))
})

const open = Effect.fnUntraced(function*(props: Partial<MenuProps> = {}) {
  const s = yield* HtmlScene.make(Menu, { open: false, items, ...props }, standIn)
  s.fire(trigger, "mousedown", pointer("mouse")).emitted(opened("trigger-press"))
  s.props({ open: true, items, ...props }).mounted(tracked(s), sent("ShowedPopup"))
  return s
})

const PageRoute = Route.union({ Edit: Route.make("/"), Away: Route.make("/away") })
const PageMessage = UiSchema.TaggedEnum({ ChangedRoute: { route: PageRoute }, Opened: {}, Left: {}, Navigated: {} })

const Page = Component.define({
  name: "Page",
  scoped: false,
  props: Schema.Struct({ route: PageRoute }),
  model: Schema.Struct({ route: PageRoute, open: Schema.Boolean }),
  message: PageMessage,
  elements: Html
}).make({
  init: ($) => ({ route: $.props.route, open: false }),
  update: {
    ChangedRoute: (model, { route }) => ({ ...model, route }),
    Opened: (model) => ({ ...model, open: true }),
    Left: (model, _message, $) =>
      $.set(model).run(Router.push(PageRoute, PageRoute.Away()).pipe(Command.map(() => PageMessage.Navigated()))),
    Navigated: (model) => model
  },
  subscriptions: (model) => [
    Router.subscription(PageRoute, model.route, (route) => PageMessage.ChangedRoute({ route }))
  ],
  view: (model, h) =>
    h.div(
      h.a.onClick(PageMessage.Left()).children("Away"),
      model.route._tag === "Edit"
        ? Menu(h, {
          key: "menu",
          props: { open: model.open, items },
          onEmit: (event) => event._tag === "Opened" ? PageMessage.Opened() : undefined,
          view: (menu) => menu.trigger(h.button.class("trigger")).children("Edit")
        })
        : null
    )
})

describe("Menu", () => {
  it.effect("history restore saves nothing of an open menu", () => {
    const history = Router.memoryHistory("/")
    return Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, Router.props(PageRoute))
      yield* TestHost.settle
      Locator.fire(root.get(trigger), "mousedown", pointer("mouse"))
      yield* TestHost.settle
      assert.strictEqual(root.get(trigger).attrs?.["aria-expanded"], "true")
      Locator.fire(root.get(Locator.tag("a")), "click")
      yield* TestHost.settle
      history.go(-1)
      const entry = JSON.stringify(history.current().state)
      assert.include(entry, "/Page")
      assert.notInclude(entry, "/Page/Menu[menu]")
    }).pipe(Effect.provide(Router.make({ routes: PageRoute, history })), Effect.provide(TestHost.layer()))
  })

  it.effect("draws a closed menu button, and a mouse press opens it with its parts and ARIA semantics", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Menu, { open: false, items }, standIn)
      assert.deepInclude(s.get(trigger).attrs, {
        id: "edit",
        type: "button",
        "aria-haspopup": "menu",
        "aria-expanded": "false"
      })
      assert.isUndefined(s.get(trigger).attrs?.["aria-controls"])
      assert.isUndefined(s.get(trigger).attrs?.["data-popup-open"])
      assert.deepInclude(s.get(positioner).attrs, { role: "presentation", "data-closed": "" })
      assert.isFalse(s.get(positioner).props?.popoverOpen)
      assert.deepInclude(partsOf(s), {
        open: false,
        mounted: false,
        transitionStatus: null,
        nested: false,
        side: "bottom",
        align: "center",
        highlighted: null,
        openMethod: null,
        transitioning: false,
        activationDirection: null,
        nothingMatches: false
      })

      s.fire(trigger, "mousedown", pointer("mouse")).emitted(opened("trigger-press"))
      s.props({ open: true, items }).mounted(tracked(s), sent("ShowedPopup"))
      const popupId = s.get(popup).attrs?.id
      assert.isString(popupId)
      assert.isTrue(s.get(positioner).props?.popoverOpen)
      assert.deepInclude(s.get(trigger).attrs, {
        "aria-expanded": "true",
        "aria-controls": popupId,
        "data-popup-open": "",
        "data-pressed": ""
      })
      assert.deepInclude(s.get(positioner).attrs, { "data-open": "", "data-side": "bottom", "data-align": "center" })
      assert.deepInclude(s.get(popup).attrs, {
        role: "menu",
        tabindex: "-1",
        "aria-labelledby": "edit",
        "data-open": "",
        "data-side": "bottom"
      })
      assert.isUndefined(s.get(popup).attrs?.["aria-orientation"])
      assert.deepInclude(s.get(item("copy")).attrs, { role: "menuitem", tabindex: "-1" })
      assert.isUndefined(s.get(item("copy")).attrs?.["aria-disabled"])
      assert.isUndefined(s.get(item("copy")).attrs?.["data-highlighted"])
      assert.deepInclude(s.get(item("undo")).attrs, { role: "menuitem", "aria-disabled": "true", "data-disabled": "" })
      assert.deepInclude(s.get(item("wrap")).attrs, {
        role: "menuitemcheckbox",
        "aria-checked": "true",
        "data-checked": ""
      })
      assert.isUndefined(s.get(item("wrap")).attrs?.["data-unchecked"])
      assert.deepInclude(s.get(Locator.attr("class", "tick")).attrs, { "aria-hidden": "true", "data-checked": "" })
      assert.deepInclude(s.get(item("small")).attrs, {
        role: "menuitemradio",
        "aria-checked": "true",
        "data-checked": ""
      })
      assert.deepInclude(s.get(item("large")).attrs, {
        role: "menuitemradio",
        "aria-checked": "false",
        "data-unchecked": ""
      })
      assert.isUndefined(s.get(item("large")).attrs?.["data-checked"])
      assert.deepInclude(s.get(Locator.attr("class", "sizes")).attrs, { role: "group" })
      assert.deepInclude(s.get(item("docs")), { tag: "a" })
      assert.deepInclude(s.get(item("docs")).attrs, { role: "menuitem", href: "/docs" })
      assert.deepInclude(s.get(Locator.attr("class", "group")).attrs, {
        role: "group",
        "aria-labelledby": s.get(Locator.attr("class", "group-label")).attrs?.id
      })
      assert.deepInclude(s.get(Locator.attr("class", "separator")).attrs, { role: "separator" })
      assert.deepInclude(s.get(Locator.attr("class", "arrow")).attrs, { "aria-hidden": "true", "data-side": "bottom" })
      assert.deepInclude(partsOf(s), { open: true, mounted: true, openMethod: "mouse", highlighted: null })
    }))

  it.effect("reports its transitions, placement and viewport moves, and settles after the exit animation", () =>
    Effect.gen(function*() {
      const s = yield* open()
      assert.strictEqual(partsOf(s).transitionStatus, "starting")
      assert.deepInclude(s.get(popup).attrs, { "data-open": "", "data-starting-style": "" })
      s.mounted(tracked(s), sent("RenderedFirstFrame"))
      assert.isNull(partsOf(s).transitionStatus)
      assert.isUndefined(s.get(popup).attrs?.["data-starting-style"])
      s.mounted(tracked(s), sent("FinishedTransition", { open: true })).emitted({ _tag: "Settled", open: true })
      s.mounted(
        tracked(s),
        sent("ChangedPlacement", {
          placement: { side: "top", align: "end", anchorHidden: false, arrowUncentered: false }
        })
      )
      assert.deepInclude(partsOf(s), { side: "top", align: "end" })
      assert.deepInclude(s.get(popup).attrs, { "data-side": "top", "data-align": "end" })
      s.mounted(tracked(s), sent("MovedViewport", { direction: "right down" }))
      assert.deepInclude(partsOf(s), { transitioning: true, activationDirection: "right down" })
      s.mounted(tracked(s), sent("SettledViewport"))
      assert.isFalse(partsOf(s).transitioning)
      s.props({ open: false, items })
      assert.strictEqual(partsOf(s).transitionStatus, "ending")
      assert.deepInclude(s.get(positioner).attrs, { "data-ending-style": "", "data-closed": "" })
      assert.isTrue(s.get(positioner).props?.popoverOpen)
      assert.deepInclude(partsOf(s), { open: false, mounted: true, openMethod: null })
      s.mounted(tracked(s), sent("FinishedTransition", { open: false })).emitted({ _tag: "Settled", open: false })
      assert.isFalse(s.get(positioner).props?.popoverOpen)
      assert.isFalse(partsOf(s).mounted)
    }))

  it.effect("keyboard on the closed trigger opens it on the first or last enabled item, and marks click-open and Escape instant", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Menu, { open: false, items }, standIn)
      s.fire(trigger, "keydown", key("Enter")).expectIgnored()
      s.fire(trigger, "click", pointer("mouse")).expectIgnored()
      s.fire(trigger, "click", pointer("")).emitted(highlighted("copy", "none"), opened("trigger-press"))
      s.props({ open: true, items }).mounted(tracked(s), sent("ShowedPopup"))
      assert.deepInclude(partsOf(s), { highlighted: "copy", openMethod: "keyboard" })
      assert.deepInclude(s.get(item("copy")).attrs, { tabindex: "0", "data-highlighted": "" })
      assert.deepInclude(s.get(positioner).attrs, { "data-instant": "click" })
      assert.deepInclude(s.get(popup).attrs, { "data-instant": "click" })
      s.fire(popup, "keydown", key("Escape")).expectDefaultPrevented().emitted(dismissed("escape-key"))
      s.props({ open: false, items })
      assert.deepInclude(s.get(positioner).attrs, { "data-instant": "dismiss" })
      assert.deepInclude(s.get(popup).attrs, { "data-instant": "dismiss" })
      s.mounted(tracked(s), sent("FinishedTransition", { open: false })).emitted(
        { _tag: "Settled", open: false },
        highlighted(null, "none")
      )
      s.fire(trigger, "keydown", key("ArrowDown"))
        .expectDefaultPrevented()
        .emitted(highlighted("copy", "none"), opened("list-navigation"))
      s.props({ open: true, items }).mounted(tracked(s), sent("ShowedPopup"))
      s.fire(popup, "keydown", key("Escape")).emitted(dismissed("escape-key"))
      s.props({ open: false, items })
      s.mounted(tracked(s), sent("FinishedTransition", { open: false })).emitted(
        { _tag: "Settled", open: false },
        highlighted(null, "none")
      )
      s.fire(trigger, "keydown", key("ArrowUp")).emitted(highlighted("docs", "none"), opened("list-navigation"))
      s.props({ open: true, items }).mounted(tracked(s), sent("ShowedPopup"))
      assert.strictEqual(partsOf(s).highlighted, "docs")
    }))

  it.effect("arrow keys, Home and End move the highlight, wrap unless loopFocus is false, and follow orientation", () =>
    Effect.gen(function*() {
      const s = yield* open()
      const step = (k: string, expected: string) => {
        const before = partsOf(s).highlighted
        s.fire(popup, "keydown", key(k)).expectDefaultPrevented()
        if (before !== expected) s.emitted(highlighted(expected, "keyboard"))
        assert.strictEqual(partsOf(s).highlighted, expected)
      }
      step("ArrowDown", "undo")
      step("ArrowUp", "delete")
      step("ArrowDown", "undo")
      step("End", "delete")
      step("Home", "undo")
      step("ArrowDown", "copy")
      s.props({ open: true, items, loopFocus: false })
      step("ArrowUp", "undo")
      step("ArrowUp", "undo")
      step("End", "delete")
      step("ArrowDown", "delete")
      s.props({ open: true, items, orientation: "horizontal" })
      assert.deepInclude(s.get(popup).attrs, { role: "menu", "aria-orientation": "horizontal" })
      step("ArrowRight", "undo")
      step("ArrowRight", "copy")
      s.fire(popup, "keydown", key("ArrowDown"))
      step("ArrowLeft", "undo")
    }))

  it.effect("the pointer highlights the item it's over, unless highlightItemOnHover is false", () =>
    Effect.gen(function*() {
      const s = yield* open()
      s.fire(item("paste"), "mouseenter").emitted(highlighted("paste", "pointer"))
      assert.deepInclude(s.get(item("paste")).attrs, { tabindex: "0", "data-highlighted": "" })
      s.fire(item("paste"), "mouseleave").emitted(highlighted(null, "pointer"))
      s.props({ open: true, items, highlightItemOnHover: false })
      s.fire(item("paste"), "mouseenter").expectIgnored()
      assert.isNull(partsOf(s).highlighted)
    }))

  it.effect("picking an item reports it, a checkbox's new state and a radio's, and closes unless told not to", () =>
    Effect.gen(function*() {
      const s = yield* open()
      s.fire(item("cut"), "mouseenter").emitted(highlighted("cut", "pointer"))
      s.fire(item("cut"), "click", pointer("mouse")).emitted(picked("cut"))
      s.fire(item("minimap"), "click", pointer("mouse")).emitted(
        highlighted("minimap", "none"),
        picked("minimap", true)
      )
      s.fire(item("large"), "click", pointer("mouse")).emitted(highlighted("large", "none"), picked("large", true))
      s.fire(item("docs"), "click", pointer("mouse")).emitted(highlighted("docs", "none"), picked("docs"))
      s.fire(item("undo"), "click", pointer("mouse"))
      s.fire(item("wrap"), "click", pointer("mouse")).emitted(picked("wrap", false), dismissed("item-press"))
      s.props({ open: true, items })
      s.fire(item("copy"), "keydown", key("Enter")).emitted(picked("copy"), dismissed("item-press"))
    }))

  it.effect("disabled ignores presses on the trigger and the items", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Menu, { open: false, items, disabled: true }, standIn)
      assert.deepInclude(s.get(trigger).attrs, { disabled: "", "data-disabled": "" })
      s.fire(trigger, "mousedown", pointer("mouse"))
      s.fire(trigger, "keydown", key("ArrowDown"))
      s.props({ open: true, items, disabled: true }).mounted(tracked(s), sent("ShowedPopup"))
      assert.deepInclude(s.get(item("copy")).attrs, { "aria-disabled": "true", "data-disabled": "" })
      s.fire(item("copy"), "click", pointer("mouse"))
    }))

  it.effect("typing moves to the next item starting with the typed text, skipping disabled ones, until it resets", () =>
    Effect.gen(function*() {
      const s = yield* open()
      const type = (k: string, expected: string) => {
        const before = partsOf(s).highlighted
        s.fire(popup, "keydown", key(k))
        if (before !== expected) s.emitted(highlighted(expected, "keyboard"))
        assert.strictEqual(partsOf(s).highlighted, expected)
      }
      type("c", "copy")
      type("c", "cut")
      type("c", "copy")
      yield* elapse(s, "WaitBeforeResetTyping", 500)
      type("d", "docs")
      type("d", "docs")
      yield* elapse(s, "WaitBeforeResetTyping", 500)
      type("c", "copy")
      type("u", "cut")
      yield* elapse(s, "WaitBeforeResetTyping", 500)
      type("c", "copy")
      yield* elapse(s, "WaitBeforeResetTyping", 500)
    }))

  it.effect("openOnHover opens after the delay, cancels on leave, and sticks until the stick window expires", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Menu, { open: false, items, openOnHover: true, delay: 200 }, standIn)
      s.fire(trigger, "mouseenter")
      assert.deepStrictEqual(s.current.pending.map(({ command }) => command.args), [{ delay: 200 }])
      s.fire(trigger, "mouseleave").expectNone()
      s.fire(trigger, "mouseenter")
      yield* elapse(s, "WaitBeforeHoverOpen", 200)
      s.emitted(opened("trigger-hover"))
      s.props({ open: true, items, openOnHover: true, delay: 200 }).mounted(tracked(s), sent("ShowedPopup"))
      assert.deepInclude(partsOf(s), { open: true, openMethod: "mouse", highlighted: null })
      s.fire(trigger, "mousedown", pointer("mouse"))
      assert.isTrue(partsOf(s).open)
      s.fire(trigger, "mousedown", pointer("mouse")).emitted(dismissed("trigger-press"))
      s.props({ open: false, items, openOnHover: true, delay: 200 })
        .mounted(tracked(s), sent("FinishedTransition", { open: false }))
        .emitted({ _tag: "Settled", open: false })
      s.fire(trigger, "mouseenter")
      yield* elapse(s, "WaitBeforeHoverOpen", 200)
      s.emitted(opened("trigger-hover"))
      s.props({ open: true, items, openOnHover: true, delay: 200 }).mounted(tracked(s), sent("ShowedPopup"))
      yield* elapse(s, "WaitBeforeStickExpires", 500)
      s.fire(trigger, "mousedown", pointer("mouse")).emitted(dismissed("trigger-press"))
    }))

  it.effect("with a query, an input filters the items, empty and clear show only when they apply, and menuFilter respects options", () =>
    Effect.gen(function*() {
      const s = yield* open({ query: "", autoHighlight: true })
      const listId = s.get(Locator.attr("class", "list")).attrs?.id
      assert.deepInclude(s.get(popup).attrs, { role: "presentation" })
      assert.deepInclude(s.get(Locator.attr("class", "list")).attrs, { role: "menu", "aria-labelledby": "edit" })
      assert.deepInclude(s.get(input).attrs, { role: "searchbox", type: "text", "aria-controls": listId, value: "" })
      assert.isUndefined(s.get(input).attrs?.["aria-activedescendant"])
      assert.isUndefined(s.query(clear))
      assert.isUndefined(s.query(empty))
      s.fire(input, "input", { value: "co", checked: false }).emitted(
        highlighted("copy", "none"),
        { _tag: "ChangedQuery", query: "co", reason: "input-change" }
      )
      s.props({ open: true, items, query: "co", autoHighlight: true })
      assert.strictEqual(s.get(input).attrs?.["aria-activedescendant"], s.get(item("copy")).attrs?.id)
      assert.isUndefined(s.get(item("copy")).attrs?.hidden)
      assert.deepInclude(s.get(item("cut")).attrs, { hidden: "" })
      assert.isUndefined(s.query(empty))
      assert.isFalse(partsOf(s).nothingMatches)
      s.click(clear).emitted(highlighted(null, "none"), { _tag: "ChangedQuery", query: "", reason: "clear-press" })
      s.props({ open: true, items, query: "zzz", autoHighlight: true })
      assert.isTrue(partsOf(s).nothingMatches)
      assert.deepInclude(s.get(empty).attrs, { role: "status" })
      assert.deepInclude(s.get(Locator.attr("class", "group")).attrs, { hidden: "" })

      const accents = menuFilter({ locale: "en", sensitivity: "accent" })
      assert.isTrue(menuFilter({ locale: "en" }).contains("Crème", "creme"))
      assert.isFalse(accents.contains("Crème", "creme"))
    }))
})
