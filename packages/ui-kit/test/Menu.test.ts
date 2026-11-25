import {
  Command,
  type Component,
  type Mount,
  Route,
  Router,
  UiSchema,
  View
} from "@effect/ui"
import {
  Menu,
  type MenuEvents,
  menuFilter,
  type MenuProps,
  MenuTrigger
} from "@effect/ui-kit"
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
  h.div.attrs({
    "data-testid": value,
    role: "option",
    "aria-disabled": "false",
    "data-highlighted": "x"
  })

const standIn = {
  elements: Html,
  view: (menu: Parts, h: H) => {
    const filtering = h.props.query !== undefined
    const entries = [
      menu.group({ element: h.div.class("group"), group: "edit" }).children(
        menu.groupLabel({ element: h.div.class("group-label"), group: "edit" })
          .children("Edit"),
        menu.item({ element: entry(h, "undo"), value: "undo" }).children(
          "Undo"
        ),
        menu.item({ element: entry(h, "copy"), value: "copy" }).children(
          "Copy"
        ),
        menu.item({
          element: entry(h, "cut"),
          value: "cut",
          closeOnClick: false
        }).children("Cut"),
        menu.item({ element: entry(h, "paste"), value: "paste" }).children(
          "Paste"
        )
      ),
      menu.separator(h.div.class("separator")),
      menu.checkboxItem({
        element: entry(h, "wrap").attr("aria-checked", "false"),
        value: "wrap",
        checked: true,
        closeOnClick: true
      }).children(
        menu.checkboxItemIndicator({
          element: h.span.class("tick"),
          value: "wrap"
        })?.children("✓"),
        "Wrap lines"
      ),
      menu.checkboxItem({
        element: entry(h, "minimap"),
        value: "minimap",
        checked: false
      }).children("Minimap"),
      menu.radioGroup({ element: h.div.class("sizes"), value: "small" })
        .children(
          menu.radioItem({
            element: entry(h, "small").attr("data-checked", "x"),
            value: "small"
          }).children("Small"),
          menu.radioItem({ element: entry(h, "large"), value: "large" })
            .children("Large")
        ),
      menu.linkItem({
        element: h.a.attrs({ "data-testid": "docs", href: "/docs" }),
        value: "docs"
      }).children("Docs"),
      menu.item({ element: entry(h, "delete"), value: "delete" }).children(
        "Delete"
      )
    ]
    return h.div(
      menu.trigger({ element: h.button.class("trigger").attr("id", "edit") })
        .children("Edit"),
      menu.positioner(h.div.class("positioner")).children(
        menu.popup(h.div.class("popup")).children(
          filtering ? menu.input(h.input.class("input")) : null,
          filtering
            ? menu.clear(h.button.class("clear"))?.children("Clear")
            : null,
          filtering
            ? menu.list(h.div.class("list")).children(...entries)
            : h.div(...entries),
          filtering
            ? menu.empty(h.div.class("empty"))?.children("No matches")
            : null,
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

type TrackMenu = Mount.Issued<unknown, never, never, unknown>
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const tracked = (scene: Rendered): TrackMenu =>
  (scene.get(positioner) as unknown as View.Element<unknown>).owned?.find((
    layer
  ) => layer.mount !== undefined)
    ?.mount as unknown as TrackMenu
const sent = (tag: string, fields: object = {}) =>
  ({ _tag: tag, ...fields }) as never

const partsOf = (
  scene: { readonly parts: (f: (menu: Parts) => void) => unknown }
): Parts => {
  let parts: Parts | undefined
  scene.parts((menu) => {
    parts = menu
  })
  return parts!
}

const opened = (reason: string) =>
  ({ _tag: "RequestedOpen", reason, triggerId: "edit" }) as MenuEvents
const dismissed = (reason: string) =>
  ({ _tag: "RequestedClose", reason }) as MenuEvents
const picked = (value: string, checked?: boolean) =>
  (checked === undefined
    ? { _tag: "Picked", value }
    : { _tag: "Picked", value, checked }) as MenuEvents
const highlighted = (value: string | null, reason: string) =>
  ({ _tag: "Highlighted", value, reason }) as MenuEvents

type Pending = {
  readonly current: {
    readonly pending: ReadonlyArray<{ readonly command: any }>
  }
}

const elapse = Effect.fnUntraced(
  function*<
    S extends Pending & { readonly resolve: (command: any, result: any) => S }
  >(
    scene: S,
    name: string,
    millis: number
  ) {
    const command =
      scene.current.pending.find((run) => run.command.name === name)!.command
    const fiber = yield* Effect.forkChild(
      command.effect as Effect.Effect<unknown>
    )
    if (millis > 0) {
      yield* TestClock.adjust(`${millis - 1} millis`)
      assert.isUndefined(fiber.pollUnsafe())
    }
    yield* TestClock.adjust(`${Math.min(millis, 1)} millis`)
    return scene.resolve(command, yield* Fiber.join(fiber))
  }
)

const open = Effect.fnUntraced(function*(props: Partial<MenuProps> = {}) {
  const scene = yield* HtmlScene.make(
    Menu,
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

const PageRoute = Route.union({
  Edit: Route.make("/"),
  Away: Route.make("/away")
})
const PageMessage = UiSchema.TaggedEnum({
  ChangedRoute: { route: PageRoute },
  RequestedOpen: {},
  Left: {},
  Navigated: {}
})

const Page = Html.component({
  name: "Page",
  props: Schema.Struct({ route: PageRoute }),
  model: Schema.Struct({ route: PageRoute, open: Schema.Boolean }),
  message: PageMessage
}).make({
  init: ($) => ({ route: $.props.route, open: false }),
  update: {
    ChangedRoute: ($, { route }) => $.evolve({ route }),
    RequestedOpen: ($) => $.evolve({ open: true }),
    Left: ($) =>
      $.run(
        Router.push(PageRoute, PageRoute.Away()).pipe(
          Command.map(() => PageMessage.Navigated())
        )
      ),
    Navigated: ($) => $.model
  },
  subscriptions: ({ model }) => [
    Router.subscription(
      PageRoute,
      model.route,
      (route) => PageMessage.ChangedRoute({ route })
    )
  ],
  view: (h, model) =>
    h.div(
      h.a.on("click", PageMessage.Left()).children("Away"),
      model.route._tag === "Edit"
        ? Menu(h, {
          key: "menu",
          props: { open: model.open, items },
          onEmit: (event) =>
            event._tag === "RequestedOpen"
              ? PageMessage.RequestedOpen()
              : undefined,
          view: (menu) =>
            menu.trigger({ element: h.button.class("trigger") }).children(
              "Edit"
            )
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
    }).pipe(
      Effect.provide(Router.make({ routes: PageRoute, history })),
      Effect.provide(TestHost.layer())
    )
  })

  it.effect("draws a closed menu button, and a mouse press opens it with its parts and ARIA semantics", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Menu, { open: false, items }, standIn)
      assert.deepInclude(scene.get(trigger).attrs, {
        id: "edit",
        type: "button",
        "aria-haspopup": "menu",
        "aria-expanded": "false"
      })
      assert.isUndefined(scene.get(trigger).attrs?.["aria-controls"])
      assert.isUndefined(scene.get(trigger).attrs?.["data-popup-open"])
      assert.deepInclude(scene.get(positioner).attrs, {
        role: "presentation",
        "data-closed": ""
      })
      assert.isFalse(scene.get(positioner).props?.popoverOpen)
      assert.deepInclude(partsOf(scene), {
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

      scene.fire(trigger, "mousedown", pointer("mouse")).emitted(
        opened("trigger-press")
      )
      scene.props({ open: true, items }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      const popupId = scene.get(popup).attrs?.id
      assert.isString(popupId)
      assert.isTrue(scene.get(positioner).props?.popoverOpen)
      assert.deepInclude(scene.get(trigger).attrs, {
        "aria-expanded": "true",
        "aria-controls": popupId,
        "data-popup-open": "",
        "data-pressed": ""
      })
      assert.deepInclude(scene.get(positioner).attrs, {
        "data-open": "",
        "data-side": "bottom",
        "data-align": "center"
      })
      assert.deepInclude(scene.get(popup).attrs, {
        role: "menu",
        tabindex: "-1",
        "aria-labelledby": "edit",
        "data-open": "",
        "data-side": "bottom"
      })
      assert.isUndefined(scene.get(popup).attrs?.["aria-orientation"])
      assert.deepInclude(scene.get(item("copy")).attrs, {
        role: "menuitem",
        tabindex: "-1"
      })
      assert.isUndefined(scene.get(item("copy")).attrs?.["aria-disabled"])
      assert.isUndefined(scene.get(item("copy")).attrs?.["data-highlighted"])
      assert.deepInclude(scene.get(item("undo")).attrs, {
        role: "menuitem",
        "aria-disabled": "true",
        "data-disabled": ""
      })
      assert.deepInclude(scene.get(item("wrap")).attrs, {
        role: "menuitemcheckbox",
        "aria-checked": "true",
        "data-checked": ""
      })
      assert.isUndefined(scene.get(item("wrap")).attrs?.["data-unchecked"])
      assert.deepInclude(scene.get(Locator.attr("class", "tick")).attrs, {
        "aria-hidden": "true",
        "data-checked": ""
      })
      assert.deepInclude(scene.get(item("small")).attrs, {
        role: "menuitemradio",
        "aria-checked": "true",
        "data-checked": ""
      })
      assert.deepInclude(scene.get(item("large")).attrs, {
        role: "menuitemradio",
        "aria-checked": "false",
        "data-unchecked": ""
      })
      assert.isUndefined(scene.get(item("large")).attrs?.["data-checked"])
      assert.deepInclude(scene.get(Locator.attr("class", "sizes")).attrs, {
        role: "group"
      })
      assert.deepInclude(scene.get(item("docs")), { tag: "a" })
      assert.deepInclude(scene.get(item("docs")).attrs, {
        role: "menuitem",
        href: "/docs"
      })
      assert.deepInclude(scene.get(Locator.attr("class", "group")).attrs, {
        role: "group",
        "aria-labelledby": scene.get(Locator.attr("class", "group-label")).attrs
          ?.id
      })
      assert.deepInclude(scene.get(Locator.attr("class", "separator")).attrs, {
        role: "separator"
      })
      assert.deepInclude(scene.get(Locator.attr("class", "arrow")).attrs, {
        "aria-hidden": "true",
        "data-side": "bottom"
      })
      assert.deepInclude(partsOf(scene), {
        open: true,
        mounted: true,
        openMethod: "mouse",
        highlighted: null
      })
    }))

  it.effect("reports its transitions, placement and viewport moves, and settles after the exit animation", () =>
    Effect.gen(function*() {
      const scene = yield* open()
      assert.strictEqual(partsOf(scene).transitionStatus, "starting")
      assert.deepInclude(scene.get(popup).attrs, {
        "data-open": "",
        "data-starting-style": ""
      })
      scene.mounted(tracked(scene), sent("RenderedFirstFrame"))
      assert.isNull(partsOf(scene).transitionStatus)
      assert.isUndefined(scene.get(popup).attrs?.["data-starting-style"])
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: true }))
        .emitted({ _tag: "Settled", open: true })
      scene.mounted(
        tracked(scene),
        sent("ChangedPlacement", {
          placement: {
            side: "top",
            align: "end",
            anchorHidden: false,
            arrowUncentered: false
          }
        })
      )
      assert.deepInclude(partsOf(scene), { side: "top", align: "end" })
      assert.deepInclude(scene.get(popup).attrs, {
        "data-side": "top",
        "data-align": "end"
      })
      scene.mounted(
        tracked(scene),
        sent("MovedViewport", { direction: "right down" })
      )
      assert.deepInclude(partsOf(scene), {
        transitioning: true,
        activationDirection: "right down"
      })
      scene.mounted(tracked(scene), sent("SettledViewport"))
      assert.isFalse(partsOf(scene).transitioning)
      scene.props({ open: false, items })
      assert.strictEqual(partsOf(scene).transitionStatus, "ending")
      assert.deepInclude(scene.get(positioner).attrs, {
        "data-ending-style": "",
        "data-closed": ""
      })
      assert.isTrue(scene.get(positioner).props?.popoverOpen)
      assert.deepInclude(partsOf(scene), {
        open: false,
        mounted: true,
        openMethod: null
      })
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: false }))
        .emitted({ _tag: "Settled", open: false })
      assert.isFalse(scene.get(positioner).props?.popoverOpen)
      assert.isFalse(partsOf(scene).mounted)
    }))

  it.effect("keyboard on the closed trigger opens it on the first or last enabled item, and marks click-open and Escape instant", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Menu, { open: false, items }, standIn)
      scene.fire(trigger, "keydown", key("Enter")).expectIgnored()
      scene.fire(trigger, "click", pointer("mouse")).expectIgnored()
      scene.fire(trigger, "click", pointer("")).emitted(
        highlighted("copy", "none"),
        opened("trigger-press")
      )
      scene.props({ open: true, items }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      assert.deepInclude(partsOf(scene), {
        highlighted: "copy",
        openMethod: "keyboard"
      })
      assert.deepInclude(scene.get(item("copy")).attrs, {
        tabindex: "0",
        "data-highlighted": ""
      })
      assert.deepInclude(scene.get(positioner).attrs, {
        "data-instant": "click"
      })
      assert.deepInclude(scene.get(popup).attrs, { "data-instant": "click" })
      scene.fire(popup, "keydown", key("Escape")).expectDefaultPrevented()
        .emitted(dismissed("escape-key"))
      scene.props({ open: false, items })
      assert.deepInclude(scene.get(positioner).attrs, {
        "data-instant": "dismiss"
      })
      assert.deepInclude(scene.get(popup).attrs, { "data-instant": "dismiss" })
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: false }))
        .emitted(
          { _tag: "Settled", open: false },
          highlighted(null, "none")
        )
      scene.fire(trigger, "keydown", key("ArrowDown"))
        .expectDefaultPrevented()
        .emitted(highlighted("copy", "none"), opened("list-navigation"))
      scene.props({ open: true, items }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      scene.fire(popup, "keydown", key("Escape")).emitted(
        dismissed("escape-key")
      )
      scene.props({ open: false, items })
      scene.mounted(tracked(scene), sent("FinishedTransition", { open: false }))
        .emitted(
          { _tag: "Settled", open: false },
          highlighted(null, "none")
        )
      scene.fire(trigger, "keydown", key("ArrowUp")).emitted(
        highlighted("docs", "none"),
        opened("list-navigation")
      )
      scene.props({ open: true, items }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      assert.strictEqual(partsOf(scene).highlighted, "docs")
    }))

  it.effect("arrow keys, Home and End move the highlight, wrap unless loopFocus is false, and follow orientation", () =>
    Effect.gen(function*() {
      const scene = yield* open()
      const step = (k: string, expected: string) => {
        const before = partsOf(scene).highlighted
        scene.fire(popup, "keydown", key(k)).expectDefaultPrevented()
        if (before !== expected) {
          scene.emitted(highlighted(expected, "keyboard"))
        }
        assert.strictEqual(partsOf(scene).highlighted, expected)
      }
      step("ArrowDown", "undo")
      step("ArrowUp", "delete")
      step("ArrowDown", "undo")
      step("End", "delete")
      step("Home", "undo")
      step("ArrowDown", "copy")
      scene.props({ open: true, items, loopFocus: false })
      step("ArrowUp", "undo")
      step("ArrowUp", "undo")
      step("End", "delete")
      step("ArrowDown", "delete")
      scene.props({ open: true, items, orientation: "horizontal" })
      assert.deepInclude(scene.get(popup).attrs, {
        role: "menu",
        "aria-orientation": "horizontal"
      })
      step("ArrowRight", "undo")
      step("ArrowRight", "copy")
      scene.fire(popup, "keydown", key("ArrowDown"))
      step("ArrowLeft", "undo")
    }))

  it.effect("the pointer highlights the item it's over, unless highlightItemOnHover is false", () =>
    Effect.gen(function*() {
      const scene = yield* open()
      scene.fire(item("paste"), "mouseenter").emitted(
        highlighted("paste", "pointer")
      )
      assert.deepInclude(scene.get(item("paste")).attrs, {
        tabindex: "0",
        "data-highlighted": ""
      })
      scene.fire(item("paste"), "mouseleave").emitted(
        highlighted(null, "pointer")
      )
      scene.props({ open: true, items, highlightItemOnHover: false })
      scene.fire(item("paste"), "mouseenter").expectIgnored()
      assert.isNull(partsOf(scene).highlighted)
    }))

  it.effect("picking an item reports it, a checkbox's new state and a radio's, and closes unless told not to", () =>
    Effect.gen(function*() {
      const scene = yield* open()
      scene.fire(item("cut"), "mouseenter").emitted(
        highlighted("cut", "pointer")
      )
      scene.fire(item("cut"), "click", pointer("mouse")).emitted(picked("cut"))
      scene.fire(item("minimap"), "click", pointer("mouse")).emitted(
        highlighted("minimap", "none"),
        picked("minimap", true)
      )
      scene.fire(item("large"), "click", pointer("mouse")).emitted(
        highlighted("large", "none"),
        picked("large", true)
      )
      scene.fire(item("docs"), "click", pointer("mouse"))
        .expectDefaultPrevented(false)
        .emitted(highlighted("docs", "none"), picked("docs"))
      scene.fire(item("undo"), "click", pointer("mouse"))
      scene.fire(item("wrap"), "click", pointer("mouse")).emitted(
        picked("wrap", false),
        dismissed("item-press")
      )
      scene.props({ open: true, items })
      scene.fire(item("copy"), "keydown", key("Enter")).emitted(
        picked("copy"),
        dismissed("item-press")
      )
    }))

  it.effect("disabled ignores presses on the trigger, the items and the filter, and a link doesn't navigate", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Menu, {
        open: false,
        items,
        disabled: true
      }, standIn)
      assert.deepInclude(scene.get(trigger).attrs, {
        disabled: "",
        "data-disabled": ""
      })
      scene.fire(trigger, "mousedown", pointer("mouse"))
      scene.fire(trigger, "keydown", key("ArrowDown"))
      scene.props({ open: true, items, disabled: true }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      assert.deepInclude(scene.get(item("copy")).attrs, {
        "aria-disabled": "true",
        "data-disabled": ""
      })
      scene.fire(item("copy"), "click", pointer("mouse"))
      scene.fire(item("docs"), "click", pointer("mouse"))
        .expectDefaultPrevented()
      scene.props({ open: true, items, disabled: true, query: "co" })
      scene.fire(input, "input", { value: "c", checked: false }).expectNone()
      scene.fire(clear, "click", pointer("mouse")).expectNone()
    }))

  it.effect("typing moves to the next item starting with the typed text, skipping disabled ones, until it resets", () =>
    Effect.gen(function*() {
      const scene = yield* open()
      const type = (k: string, expected: string) => {
        const before = partsOf(scene).highlighted
        scene.fire(popup, "keydown", key(k))
        if (before !== expected) {
          scene.emitted(highlighted(expected, "keyboard"))
        }
        assert.strictEqual(partsOf(scene).highlighted, expected)
      }
      type("c", "copy")
      type("c", "cut")
      type("c", "copy")
      yield* elapse(scene, "WaitBeforeResetTyping", 500)
      type("d", "docs")
      type("d", "docs")
      yield* elapse(scene, "WaitBeforeResetTyping", 500)
      type("c", "copy")
      type("u", "cut")
      yield* elapse(scene, "WaitBeforeResetTyping", 500)
      type("c", "copy")
      yield* elapse(scene, "WaitBeforeResetTyping", 500)
    }))

  it.effect("openOnHover opens after the delay, cancels on leave, and sticks until the stick window expires", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Menu, {
        open: false,
        items,
        openOnHover: true,
        delay: 200
      }, standIn)
      scene.fire(trigger, "mouseenter")
      assert.deepStrictEqual(
        scene.current.pending.map(({ command }) => command.args),
        [{ delay: 200 }]
      )
      scene.fire(trigger, "mouseleave").expectNone()
      scene.fire(trigger, "mouseenter")
      yield* elapse(scene, "WaitBeforeHoverOpen", 200)
      scene.emitted(opened("trigger-hover"))
      scene.props({ open: true, items, openOnHover: true, delay: 200 }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      assert.deepInclude(partsOf(scene), {
        open: true,
        openMethod: "mouse",
        highlighted: null
      })
      scene.fire(trigger, "mousedown", pointer("mouse"))
      assert.isTrue(partsOf(scene).open)
      scene.fire(trigger, "mousedown", pointer("mouse")).emitted(
        dismissed("trigger-press")
      )
      scene.props({ open: false, items, openOnHover: true, delay: 200 })
        .mounted(tracked(scene), sent("FinishedTransition", { open: false }))
        .emitted({ _tag: "Settled", open: false })
      scene.fire(trigger, "mouseenter")
      yield* elapse(scene, "WaitBeforeHoverOpen", 200)
      scene.emitted(opened("trigger-hover"))
      scene.props({ open: true, items, openOnHover: true, delay: 200 }).mounted(
        tracked(scene),
        sent("ShowedPopup")
      )
      yield* elapse(scene, "WaitBeforeStickExpires", 500)
      scene.fire(trigger, "mousedown", pointer("mouse")).emitted(
        dismissed("trigger-press")
      )
    }))

  it.effect("with a query, an input filters the items, empty and clear show only when they apply, and menuFilter respects options", () =>
    Effect.gen(function*() {
      const scene = yield* open({ query: "", autoHighlight: true })
      const listId = scene.get(Locator.attr("class", "list")).attrs?.id
      assert.deepInclude(scene.get(popup).attrs, { role: "presentation" })
      assert.deepInclude(scene.get(Locator.attr("class", "list")).attrs, {
        role: "menu",
        "aria-labelledby": "edit"
      })
      assert.deepInclude(scene.get(input).attrs, {
        role: "searchbox",
        type: "text",
        "aria-controls": listId,
        value: ""
      })
      assert.isUndefined(scene.get(input).attrs?.["aria-activedescendant"])
      assert.isUndefined(scene.query(clear))
      assert.isUndefined(scene.query(empty))
      scene.fire(input, "input", { value: "co", checked: false }).emitted(
        highlighted("copy", "none"),
        { _tag: "RequestedQuery", query: "co", reason: "input-change" }
      )
      scene.props({ open: true, items, query: "co", autoHighlight: true })
      assert.strictEqual(
        scene.get(input).attrs?.["aria-activedescendant"],
        scene.get(item("copy")).attrs?.id
      )
      assert.isUndefined(scene.get(item("copy")).attrs?.hidden)
      assert.deepInclude(scene.get(item("cut")).attrs, { hidden: "" })
      assert.isUndefined(scene.query(empty))
      assert.isFalse(partsOf(scene).nothingMatches)
      scene.click(clear).emitted(highlighted(null, "none"), {
        _tag: "RequestedQuery",
        query: "",
        reason: "clear-press"
      })
      scene.props({ open: true, items, query: "zzz", autoHighlight: true })
      assert.isTrue(partsOf(scene).nothingMatches)
      assert.deepInclude(scene.get(empty).attrs, { role: "status" })
      assert.deepInclude(scene.get(Locator.attr("class", "group")).attrs, {
        hidden: ""
      })

      const accents = menuFilter({ locale: "en", sensitivity: "accent" })
      assert.isTrue(menuFilter({ locale: "en" }).contains("Crème", "creme"))
      assert.isFalse(accents.contains("Crème", "creme"))
    }))

  it.effect("trigger reads its options from the object it's given, getters included", () =>
    Effect.gen(function*() {
      class Off {
        constructor(readonly element: View.PartTarget<"button">) {}
        get disabled() {
          return true
        }
      }
      const scene = yield* HtmlScene.make(Menu, { open: false, items }, {
        elements: Html,
        view: (menu, h) =>
          menu.trigger(new Off(h.button.class("trigger"))).children("Edit")
      })
      assert.strictEqual(scene.get(trigger).attrs?.disabled, "")
      assert.strictEqual(scene.get(trigger).attrs?.["data-disabled"], "")
    }))

  it.effect("clears consumer aria-disabled and group hidden, and validates hidden part tags", () =>
    Effect.gen(function*() {
      const helper = View.makeHelper<never, {}, Html.Elements>({}, Html)
      const triggerView = (disabled: boolean) =>
        View.build(
          MenuTrigger(helper, {
            element: helper.button.attr("aria-disabled", "true").disabled(
              !disabled
            ),
            props: { open: false, popupId: "menu-popup", disabled }
          }),
          []
        )
      assert.strictEqual(triggerView(true).attrs.disabled, "")
      assert.isUndefined(triggerView(true).attrs["aria-disabled"])
      assert.isUndefined(triggerView(false).attrs.disabled)
      assert.isUndefined(triggerView(false).attrs["aria-disabled"])

      const scene = yield* HtmlScene.make(Menu, {
        open: true,
        items,
        query: "co",
        disabled: true
      }, {
        elements: Html,
        view: (menu, h) =>
          h.div(
            menu.trigger({
              element: h.button.class("trigger").attr("aria-disabled", "true")
            }).children("Edit"),
            menu.input(h.input.class("input").attr("aria-disabled", "true")),
            menu.clear(h.button.class("clear").attr("aria-disabled", "true")),
            menu.group({
              element: h.div.class("group").attr("hidden", ""),
              group: "g"
            }).children(
              menu.item({ element: h.div.class("item"), value: "copy" })
                .children("Copy")
            )
          )
      })
      for (const loc of [trigger, input, clear]) {
        assert.strictEqual(scene.get(loc).attrs?.disabled, "")
        assert.isUndefined(scene.get(loc).attrs?.["aria-disabled"])
      }
      assert.isUndefined(
        scene.get(Locator.attr("class", "group")).attrs?.hidden
      )

      scene.props({ open: true, items, query: "co", disabled: false })
      for (const loc of [trigger, input, clear]) {
        assert.isUndefined(scene.get(loc).attrs?.disabled)
        assert.isUndefined(scene.get(loc).attrs?.["aria-disabled"])
      }
      scene.props({ open: true, items, query: "zzz", disabled: false })
      assert.strictEqual(
        scene.get(Locator.attr("class", "group")).attrs?.hidden,
        ""
      )

      const hiddenTagCases: ReadonlyArray<
        (menu: Parts, h: H) => View.Content<never>
      > = [
        (menu, h) =>
          h.div(
            menu.checkboxItemIndicator({
              element: h.div as never,
              value: "wrap"
            })
          ),
        (menu, h) =>
          h.div(
            menu.radioItemIndicator({ element: h.div as never, value: "small" })
          ),
        (menu, h) => h.div(menu.clear(h.div as never)),
        (menu, h) => h.div(menu.empty(h.span as never))
      ]
      for (const render of hiddenTagCases) {
        const exit = yield* Effect.exit(
          HtmlScene.make(
            Menu,
            { open: true, items, query: "" },
            { elements: Html, view: render }
          )
        )
        if (exit._tag !== "Failure") assert.fail("expected failure")
        assert.include(String(exit.cause), "a part for")
      }
    }))
})
