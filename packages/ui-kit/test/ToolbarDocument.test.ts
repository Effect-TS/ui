// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { Menu, Select, ToggleGroup, Toolbar } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { byId, click, container, popovers, tick } from "./utils/document.ts"

const Message = UiSchema.TaggedEnum({
  ClickedBold: {},
  Toggled: { value: Schema.Array(Schema.String) },
  OpenedMenu: {},
  DismissedMenu: {},
  OpenedSelect: {},
  DismissedSelect: {},
  Picked: { value: Schema.String }
})

const Config = Schema.Struct({
  disabled: Schema.Boolean,
  groupDisabled: Schema.Boolean,
  orientation: Schema.Literals(["horizontal", "vertical"])
})

const Page = Component.define({
  name: "Page",
  scoped: false,
  props: Config,
  model: Schema.Struct({
    clicks: Schema.Number,
    align: Schema.Array(Schema.String),
    menu: Schema.Boolean,
    select: Schema.Boolean,
    zoom: Schema.String
  }),
  message: Message,
  elements: Html
}).make({
  init: () => ({
    clicks: 0,
    align: [],
    menu: false,
    select: false,
    zoom: "100"
  }),
  update: {
    ClickedBold: ($) => ({ ...$.model, clicks: $.model.clicks + 1 }),
    Toggled: ($, { value }) => ({ ...$.model, align: value }),
    OpenedMenu: ($) => ({ ...$.model, menu: true }),
    DismissedMenu: ($) => ({ ...$.model, menu: false }),
    OpenedSelect: ($) => ({ ...$.model, select: true }),
    DismissedSelect: ($) => ({ ...$.model, select: false }),
    Picked: ($, { value }) => ({ ...$.model, zoom: value, select: false })
  },
  view: (h, model) =>
    h.div(
      h.button.attrs({ id: "before", type: "button" }).children("Before"),
      Toolbar(h, {
        props: {
          disabled: h.props.disabled,
          orientation: h.props.orientation,
          groups: [{ value: "align", disabled: h.props.groupDisabled }],
          items: [
            { value: "bold" },
            { value: "left", group: "align" },
            { value: "right", group: "align" },
            { value: "off", disabled: true, focusableWhenDisabled: false },
            { value: "dim", disabled: true },
            { value: "menu" },
            { value: "zoom" },
            { value: "help" },
            { value: "search" }
          ]
        },
        view: (toolbar) =>
          toolbar.root(
            h.div.attrs({ id: "toolbar", "data-clicks": String(model.clicks) })
          ).children(
            toolbar.button({
              element: h.button.attr("id", "bold").onClick(
                Message.ClickedBold()
              ),
              value: "bold"
            })
              .children("Bold"),
            toolbar.group({ element: h.div, value: "align" }).children(
              ToggleGroup(h, {
                props: {
                  value: model.align,
                  items: [{ value: "left" }, { value: "right" }]
                },
                onEmit: { Toggled: ({ value }) => Message.Toggled({ value }) },
                view: (group) =>
                  group.root(h.div.attr("id", "align")).children(
                    toolbar.button({
                      element: group.item({
                        element: h.button.attr("id", "left"),
                        value: "left"
                      }),
                      value: "left"
                    })
                      .children("Left"),
                    toolbar.button({
                      element: group.item({
                        element: h.button.attr("id", "right"),
                        value: "right"
                      }),
                      value: "right"
                    })
                      .children("Right")
                  )
              })
            ),
            toolbar.separator(h.div),
            toolbar.button({
              element: h.button.attr("id", "off"),
              value: "off"
            }).children("Off"),
            toolbar.button({
              element: h.button.attr("id", "dim"),
              value: "dim"
            }).children("Dim"),
            Menu(h, {
              props: {
                open: model.menu,
                items: [{ value: "copy", label: "Copy" }, {
                  value: "paste",
                  label: "Paste"
                }]
              },
              onEmit: {
                RequestedOpen: () => Message.OpenedMenu(),
                RequestedClose: () => Message.DismissedMenu(),
                Picked: () => undefined,
                Highlighted: () => undefined,
                RequestedQuery: () => undefined,
                Settled: () => undefined
              },
              view: (menu) =>
                h.div(
                  toolbar.button({
                    element: menu.trigger({
                      element: h.button.attr("id", "menu"),
                      disabled: toolbar.isDisabled("menu")
                    }),
                    value: "menu"
                  }).children("Edit"),
                  menu.positioner(h.div.attr("id", "menu-positioner")).children(
                    menu.popup(h.div).children(
                      menu.item({
                        element: h.div.attr("id", "copy"),
                        value: "copy"
                      }).children("Copy"),
                      menu.item({
                        element: h.div.attr("id", "paste"),
                        value: "paste"
                      }).children("Paste")
                    )
                  )
                )
            }),
            Select(h, {
              props: {
                open: model.select,
                id: "zoom",
                disabled: toolbar.isDisabled("zoom"),
                value: model.zoom,
                items: [{ value: "100", label: "100%" }, {
                  value: "200",
                  label: "200%"
                }]
              },
              onEmit: {
                RequestedOpen: () => Message.OpenedSelect(),
                RequestedClose: () => Message.DismissedSelect(),
                Picked: ({ value }) =>
                  typeof value === "string"
                    ? Message.Picked({ value })
                    : undefined,
                Settled: () => undefined
              },
              view: (select) =>
                h.div(
                  toolbar.button({
                    element: select.trigger(h.button.attr("id", "zoom")),
                    value: "zoom"
                  }).children(
                    select.value(h.span)
                  ),
                  select.positioner(h.div.attr("id", "select-positioner"))
                    .children(
                      select.popup(h.div).children(
                        select.item({
                          element: h.div.attr("id", "zoom-100"),
                          value: "100"
                        }).children("100%"),
                        select.item({
                          element: h.div.attr("id", "zoom-200"),
                          value: "200"
                        }).children("200%")
                      )
                    )
                )
            }),
            toolbar.link({
              element: h.a.attrs({ id: "help", href: "#help" }),
              value: "help"
            }).children("Help"),
            toolbar.input({
              element: h.input.attrs({ id: "search", value: "abc" }),
              value: "search"
            })
          )
      }),
      h.button.attrs({ id: "after", type: "button" }).children("After")
    )
})

const key = (target: Element, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init
  })
  target.dispatchEvent(event)
  return event
}

const focused = () => document.activeElement?.id

const focusedText = () => document.activeElement?.textContent

const pointerClick = (target: Element) => {
  const event = new PointerEvent("click", {
    bubbles: true,
    cancelable: true,
    detail: 1,
    pointerType: "mouse"
  })
  target.dispatchEvent(event)
  return event
}

const keyboardClick = (target: Element) =>
  target.dispatchEvent(
    new PointerEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: 0,
      pointerType: ""
    })
  )

const mount = Effect.fnUntraced(
  function*(props: Partial<typeof Config.Type> = {}) {
    yield* popovers
    const app = yield* container
    yield* BrowserHost.mountEffect(
      Page,
      {
        disabled: false,
        groupDisabled: false,
        orientation: "horizontal",
        ...props
      },
      app
    )
    yield* tick
  }
)

const walk = Effect.fnUntraced(function*(pressed: string, count: number) {
  const visited: Array<string | undefined> = []
  for (let i = 0; i < count; i++) {
    key(document.activeElement!, pressed)
    yield* tick
    visited.push(focused())
  }
  return visited
})

const ids = [
  "bold",
  "left",
  "right",
  "off",
  "dim",
  "menu",
  "zoom",
  "help",
  "search"
]
const tabStops = () =>
  ids.filter((id) => byId(id).getAttribute("tabindex") === "0")

describe("Toolbar in a document", { concurrent: false }, () => {
  it.effect("the arrow keys move focus across the buttons, the toggle group, the triggers, the link and the input", () =>
    Effect.gen(function*() {
      yield* mount()
      assert.deepStrictEqual(tabStops(), ["bold"])
      byId("bold").focus()
      yield* tick
      assert.deepStrictEqual(yield* walk("ArrowRight", 8), [
        "left",
        "right",
        "dim",
        "menu",
        "zoom",
        "help",
        "search",
        "search"
      ])
      const search = byId("search") as HTMLInputElement
      assert.deepStrictEqual([search.selectionStart, search.selectionEnd], [
        0,
        3
      ])
      search.setSelectionRange(1, 1)
      assert.isFalse(key(search, "ArrowRight").defaultPrevented)
      yield* tick
      assert.strictEqual(focused(), "search")
      search.setSelectionRange(3, 3)
      assert.deepStrictEqual(yield* walk("ArrowRight", 1), ["bold"])
      assert.deepStrictEqual(tabStops(), ["bold"])
      assert.deepStrictEqual(yield* walk("ArrowLeft", 1), ["search"])
      search.setSelectionRange(1, 1)
      assert.isFalse(key(search, "ArrowLeft").defaultPrevented)
      yield* tick
      assert.strictEqual(focused(), "search")
      search.setSelectionRange(0, 0)
      assert.deepStrictEqual(yield* walk("ArrowLeft", 2), ["help", "zoom"])
      assert.deepStrictEqual(yield* walk("Home", 1), ["bold"])
      assert.deepStrictEqual(yield* walk("End", 1), ["search"])
      byId("left").focus()
      yield* tick
      assert.deepStrictEqual(tabStops(), ["left"])
    }).pipe(Effect.scoped))

  it.effect("a disabled toolbar keeps its items focusable but inert, including consumer clicks, toggles and triggers", () =>
    Effect.gen(function*() {
      yield* mount({ disabled: true })
      for (const id of ["bold", "left", "dim", "menu", "zoom"]) {
        assert.strictEqual(byId(id).getAttribute("aria-disabled"), "true", id)
        assert.isFalse(byId(id).hasAttribute("disabled"), id)
      }
      assert.isTrue(byId("off").hasAttribute("disabled"))
      assert.strictEqual(byId("align").getAttribute("data-disabled"), "")
      byId("bold").focus()
      yield* tick
      assert.deepStrictEqual(yield* walk("ArrowRight", 3), [
        "left",
        "right",
        "dim"
      ])
      assert.isTrue(pointerClick(byId("bold")).defaultPrevented)
      assert.isTrue(pointerClick(byId("dim")).defaultPrevented)
      for (const id of ["left", "menu", "zoom"]) {
        click(byId(id))
        key(byId(id), "Enter")
        key(byId(id), "ArrowDown")
      }
      yield* tick
      assert.strictEqual(byId("toolbar").getAttribute("data-clicks"), "0")
      assert.strictEqual(byId("left").getAttribute("aria-pressed"), "false")
      assert.strictEqual(byId("menu").getAttribute("aria-expanded"), "false")
      assert.strictEqual(byId("zoom").getAttribute("aria-expanded"), "false")
    }).pipe(Effect.scoped))

  it.effect("a disabled toolbar group keeps its toggles focusable and unpressed", () =>
    Effect.gen(function*() {
      yield* mount({ groupDisabled: true })
      for (const id of ["left", "right"]) {
        assert.strictEqual(byId(id).getAttribute("aria-disabled"), "true", id)
        assert.isFalse(byId(id).hasAttribute("disabled"), id)
      }
      assert.isNull(byId("bold").getAttribute("aria-disabled"))
      assert.isFalse(pointerClick(byId("bold")).defaultPrevented)
      yield* tick
      assert.strictEqual(byId("toolbar").getAttribute("data-clicks"), "1")
      byId("bold").focus()
      yield* tick
      assert.deepStrictEqual(yield* walk("ArrowRight", 2), ["left", "right"])
      for (const id of ["left", "right"]) {
        for (const press of [click, keyboardClick]) {
          press(byId(id))
          yield* tick
          assert.strictEqual(byId(id).getAttribute("aria-pressed"), "false", id)
        }
      }
    }).pipe(Effect.scoped))

  it.effect("in a vertical toolbar, Down and Up move past a Menu or Select trigger, and Enter opens it with the tab stop kept", () =>
    Effect.gen(function*() {
      yield* mount({ orientation: "vertical" })
      byId("dim").focus()
      yield* tick
      assert.deepStrictEqual(yield* walk("ArrowDown", 3), [
        "menu",
        "zoom",
        "help"
      ])
      assert.deepStrictEqual(yield* walk("ArrowUp", 2), ["zoom", "menu"])
      assert.isFalse(key(byId("menu"), "ArrowRight").defaultPrevented)
      yield* tick
      assert.strictEqual(focused(), "menu")
      assert.strictEqual(byId("menu").getAttribute("aria-expanded"), "false")
      assert.strictEqual(byId("zoom").getAttribute("aria-expanded"), "false")
      assert.deepStrictEqual(tabStops(), ["menu"])

      keyboardClick(byId("menu"))
      yield* tick
      assert.strictEqual(byId("menu").getAttribute("aria-expanded"), "true")
      assert.strictEqual(focusedText(), "Copy")
      assert.deepStrictEqual(tabStops(), ["menu"])
      key(document.activeElement!, "Escape")
      yield* tick
      assert.strictEqual(byId("menu").getAttribute("aria-expanded"), "false")
      assert.strictEqual(focused(), "menu")
      assert.deepStrictEqual(tabStops(), ["menu"])
    }).pipe(Effect.scoped))

  it.effect("Down on a Menu or Select trigger in a horizontal toolbar opens it, popup keys stay inside, and Escape or focus leaving keeps the tab stop", () =>
    Effect.gen(function*() {
      yield* mount()
      for (const [id, item] of [["menu", "Copy"], ["zoom", "100%"]] as const) {
        byId(id).focus()
        yield* tick
        key(byId(id), "ArrowDown")
        yield* tick
        assert.strictEqual(byId(id).getAttribute("aria-expanded"), "true", id)
        assert.strictEqual(focusedText(), item, id)
        assert.deepStrictEqual(tabStops(), [id])
        if (id === "menu") {
          key(document.activeElement!, "ArrowRight")
          key(document.activeElement!, "End")
          yield* tick
          assert.strictEqual(focusedText(), "Paste")
          assert.deepStrictEqual(tabStops(), ["menu"])
        }
        key(document.activeElement!, "Escape")
        yield* tick
        assert.strictEqual(byId(id).getAttribute("aria-expanded"), "false", id)
        assert.strictEqual(focused(), id)
        assert.deepStrictEqual(tabStops(), [id])

        key(byId(id), "ArrowDown")
        yield* tick
        assert.strictEqual(focusedText(), item, id)
        byId("after").focus()
        yield* tick
        assert.strictEqual(byId(id).getAttribute("aria-expanded"), "false", id)
        assert.deepStrictEqual(tabStops(), [id])
      }
    }).pipe(Effect.scoped))
})
