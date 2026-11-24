import { Component, View } from "@effect/ui"
import { DirectionProvider, Toolbar, type ToolbarProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type Parts = Component.Headless.Parts<typeof Toolbar>
type H = View.Helper<never, ToolbarProps> & View.Tags<Html.Elements, never>

const standIn = {
  elements: Html,
  view: (toolbar: Parts, h: H) =>
    toolbar.root(h.div.class("toolbar")).children(
      toolbar.button({
        element: h.button.attr("aria-label", "bold"),
        value: "bold"
      }),
      toolbar.group({ element: h.div.class("format"), value: "format" })
        .children(
          toolbar.button({
            element: h.button.attr("aria-label", "italic"),
            value: "italic"
          }),
          toolbar.button({
            element: h.button.attr("aria-label", "underline"),
            value: "underline"
          })
        ),
      toolbar.separator(h.div.class("separator")),
      toolbar.link({
        element: h.a.attrs({ "aria-label": "help", href: "/help" }),
        value: "help"
      }),
      toolbar.input({
        element: h.input.attr("aria-label", "search"),
        value: "search"
      })
    )
}

const values = ["bold", "italic", "underline", "help", "search"]

const props = (overrides: Partial<ToolbarProps> = {}): ToolbarProps => ({
  items: [
    { value: "bold" },
    { value: "italic", group: "format" },
    { value: "underline", group: "format" },
    { value: "help" },
    { value: "search" }
  ],
  groups: [{ value: "format" }],
  ...overrides
})

const root = Locator.attr("class", "toolbar")
const group = Locator.attr("class", "format")
const separator = Locator.attr("class", "separator")
const item = (value: string) => Locator.attr("aria-label", value)
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const makeScene = (overrides: Partial<ToolbarProps> = {}) =>
  HtmlScene.make(Toolbar, props(overrides), standIn)
type Scene = Effect.Success<ReturnType<typeof makeScene>>

interface Moved {
  readonly to: string
  readonly leaving?: { readonly from: string; readonly caret: number }
}

const moved = (scene: Scene): ReadonlyArray<Moved> =>
  scene.current.pending.map(({ command }) => {
    scene.resolve(command as never, Component.noop as never)
    const { leaving, ref } = command.args as {
      readonly ref: { readonly key: string }
      readonly leaving?: {
        readonly ref: { readonly key: string }
        readonly caret: number
      }
    }
    const key = (ref: { readonly key: string }) =>
      ref.key.replace(/^ToolbarItem\[(.*)\]$/, "$1")
    return leaving === undefined
      ? { to: key(ref) }
      : {
        to: key(ref),
        leaving: { from: key(leaving.ref), caret: leaving.caret }
      }
  })
const tabStops = (scene: Scene) =>
  values.filter((value) => scene.get(item(value)).attrs?.tabindex === "0")

describe("Toolbar", () => {
  it.effect("the parts carry the orientation and the disabled state of the toolbar, the group and the item", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene()
      assert.deepStrictEqual(scene.get(root).attrs, {
        class: "toolbar",
        role: "toolbar",
        "aria-orientation": "horizontal",
        "data-orientation": "horizontal"
      })
      assert.deepStrictEqual(scene.get(group).attrs, {
        class: "format",
        role: "group",
        "data-orientation": "horizontal"
      })
      assert.deepStrictEqual(scene.get(separator).attrs, {
        class: "separator",
        role: "separator",
        "aria-orientation": "vertical",
        "data-orientation": "vertical"
      })
      assert.deepStrictEqual(scene.get(item("bold")).attrs, {
        "aria-label": "bold",
        "data-orientation": "horizontal",
        tabindex: "0",
        type: "button",
        "data-focusable": ""
      })
      assert.deepStrictEqual(scene.get(item("help")).attrs, {
        "aria-label": "help",
        href: "/help",
        "data-orientation": "horizontal",
        tabindex: "-1"
      })
      assert.deepStrictEqual(scene.get(item("search")).attrs, {
        "aria-label": "search",
        "data-orientation": "horizontal",
        tabindex: "-1",
        "data-focusable": ""
      })

      scene.props(
        props({
          groups: [{ value: "format", disabled: true }],
          orientation: "vertical"
        })
      )
      assert.deepInclude(scene.get(root).attrs, {
        "aria-orientation": "vertical",
        "data-orientation": "vertical"
      })
      assert.deepInclude(scene.get(group).attrs, {
        "data-orientation": "vertical",
        "data-disabled": ""
      })
      assert.deepInclude(scene.get(separator).attrs, {
        "aria-orientation": "horizontal",
        "data-orientation": "horizontal"
      })
      assert.deepInclude(scene.get(item("italic")).attrs, {
        "aria-disabled": "true",
        "data-disabled": ""
      })
      assert.isUndefined(scene.get(item("italic")).attrs?.disabled)
      assert.isUndefined(scene.get(item("bold")).attrs?.["data-disabled"])

      scene.props(props({ disabled: true }))
      assert.deepInclude(scene.get(root).attrs, { "data-disabled": "" })
      assert.deepInclude(scene.get(group).attrs, { "data-disabled": "" })
      assert.deepInclude(scene.get(item("bold")).attrs, {
        "aria-disabled": "true",
        "data-disabled": ""
      })
      assert.deepInclude(scene.get(item("search")).attrs, {
        "aria-disabled": "true",
        "data-disabled": "",
        readonly: ""
      })
      assert.isUndefined(scene.get(item("help")).attrs?.["data-disabled"])

      scene.props(props({
        items: [
          { value: "bold", disabled: true, focusableWhenDisabled: false },
          { value: "italic", group: "format" },
          { value: "underline", group: "format" },
          { value: "help" },
          { value: "search", disabled: true, focusableWhenDisabled: false }
        ]
      }))
      assert.deepInclude(scene.get(item("bold")).attrs, {
        disabled: "",
        "data-disabled": ""
      })
      assert.isUndefined(scene.get(item("bold")).attrs?.["data-focusable"])
      assert.isUndefined(scene.get(item("bold")).attrs?.["aria-disabled"])
      assert.deepInclude(scene.get(item("search")).attrs, {
        disabled: "",
        "data-disabled": ""
      })
      assert.isUndefined(scene.get(item("search")).attrs?.readonly)
    }))

  it.effect("the tab stop is the first item that takes focus, follows focus, and falls back when its item leaves", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({
        items: [
          { value: "bold", disabled: true, focusableWhenDisabled: false },
          { value: "italic", group: "format", disabled: true },
          { value: "underline", group: "format" },
          { value: "help" },
          { value: "search" }
        ]
      })
      assert.deepStrictEqual(tabStops(scene), ["italic"])
      scene.focus(item("search"))
      assert.deepStrictEqual(tabStops(scene), ["search"])
      scene.props(props({
        disabled: true,
        items: props().items.map((entry) =>
          entry.value === "help"
            ? entry
            : { ...entry, focusableWhenDisabled: false }
        )
      }))
      assert.deepStrictEqual(tabStops(scene), ["help"])
      scene.props(props())
      assert.deepStrictEqual(tabStops(scene), ["search"])
    }))

  it.effect("the arrow keys of the orientation, Home and End move focus over the items that take focus", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({
        items: [
          { value: "bold" },
          {
            value: "italic",
            group: "format",
            disabled: true,
            focusableWhenDisabled: false
          },
          { value: "underline", group: "format", disabled: true },
          { value: "help" },
          { value: "search" }
        ]
      })
      const press = (
        from: string,
        key: string,
        details?: Parameters<Scene["keydown"]>[2]
      ) => moved(scene.keydown(item(from), key, details))

      assert.deepStrictEqual(
        moved(
          scene.keydown(item("bold"), "ArrowRight").expectDefaultPrevented()
        ),
        [{
          to: "underline"
        }]
      )
      assert.deepStrictEqual(tabStops(scene), ["underline"])
      assert.deepStrictEqual(press("bold", "ArrowLeft"), [{ to: "search" }])
      assert.deepStrictEqual(press("underline", "End"), [{ to: "search" }])
      assert.deepStrictEqual(press("help", "Home"), [{ to: "bold" }])
      scene.keydown(item("bold"), "ArrowDown").expectIgnored()
        .expectDefaultPrevented(false)
      scene.keydown(item("bold"), "ArrowRight", { ctrl: true }).expectIgnored()
        .expectDefaultPrevented(false)
      scene.keydown(item("help"), "ArrowRight", { shift: true }).expectIgnored()
        .expectDefaultPrevented(false)
      scene.keydown(item("bold"), "Enter").expectIgnored()
        .expectDefaultPrevented(false)

      scene.props(props({ orientation: "vertical", loopFocus: false }))
      assert.deepStrictEqual(press("bold", "ArrowDown"), [{ to: "italic" }])
      assert.deepStrictEqual(press("bold", "ArrowUp"), [])
      scene.keydown(item("bold"), "ArrowRight").expectIgnored()

      scene.props(props()).shared(DirectionProvider, { direction: "rtl" })
      assert.deepStrictEqual(press("italic", "ArrowLeft"), [{
        to: "underline"
      }])
      assert.deepStrictEqual(press("italic", "ArrowRight"), [{ to: "bold" }])
    }))

  it.effect("in a text input the arrow keys leave only from the edge of the text, and the default is never cancelled", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene()
      const press = (
        key: string,
        start: number | null,
        end: number | null = start
      ) =>
        moved(
          scene.keydown(item("search"), key, {
            selectionStart: start,
            selectionEnd: end
          }).expectDefaultPrevented(false)
        )

      assert.deepStrictEqual(press("ArrowLeft", 0), [{ to: "help" }])
      assert.deepStrictEqual(tabStops(scene), ["help"])
      scene.keydown(item("search"), "ArrowLeft", {
        selectionStart: 2,
        selectionEnd: 2
      }).expectDefaultPrevented(false)
      assert.deepStrictEqual(moved(scene), [])
      assert.deepStrictEqual(press("ArrowRight", 3), [{
        to: "bold",
        leaving: { from: "search", caret: 3 }
      }])
      assert.deepStrictEqual(tabStops(scene), ["help"])
      assert.deepStrictEqual(press("ArrowRight", null), [{ to: "bold" }])
      scene.keydown(item("search"), "ArrowRight", {
        selectionStart: 0,
        selectionEnd: 3
      }).expectIgnored()
      scene.keydown(item("search"), "ArrowLeft", {
        selectionStart: 0,
        selectionEnd: 0,
        shift: true
      }).expectIgnored()
      scene.keydown(item("search"), "Home", {
        selectionStart: 3,
        selectionEnd: 3
      })
        .expectIgnored()
      scene.keydown(item("search"), "ArrowLeft", {
        selectionStart: 0,
        selectionEnd: 0,
        composing: true
      }).expectIgnored()

      scene.props(props()).shared(DirectionProvider, { direction: "rtl" })
      scene.keydown(item("search"), "ArrowRight", {
        selectionStart: 2,
        selectionEnd: 2
      })
      assert.deepStrictEqual(moved(scene), [])
      assert.deepStrictEqual(press("ArrowLeft", 2), [{
        to: "bold",
        leaving: { from: "search", caret: 2 }
      }])
    }))

  it("the parts' own attributes win over the consumer's, invalid items or groups fail, and isDisabled resolves them", () => {
    const parts = (overrides: Partial<ToolbarProps> = {}) =>
      Story.parts(Toolbar, { model: { active: null }, props: props(overrides) })
    const owned = {
      tabindex: "3",
      "aria-disabled": "true",
      "data-orientation": "x",
      "data-disabled": "x",
      "data-focusable": "x"
    }
    const button = h.button.class("tool").attrs({
      ...owned,
      title: "Bold",
      type: "submit"
    }).disabled(true)
    assert.deepStrictEqual(
      View.build(parts().button({ element: button, value: "bold" }), []).attrs,
      {
        class: "tool",
        title: "Bold",
        type: "button",
        tabindex: "0",
        "data-orientation": "horizontal",
        "data-focusable": ""
      }
    )
    const after = parts({
      items: [{ value: "bold", focusableWhenDisabled: false }]
    })
      .button({ element: h.button.class("tool"), value: "bold" })
      .attrs({ "aria-disabled": "true", "data-disabled": "" })
      .disabled(true)
    assert.deepStrictEqual(View.build(after, []).attrs, {
      class: "tool",
      type: "button",
      tabindex: "0",
      "data-orientation": "horizontal"
    })
    const input = h.input.class("field").attrs({
      ...owned,
      placeholder: "Search"
    }).disabled(true)
    assert.deepStrictEqual(
      View.build(parts().input({ element: input, value: "search" }), []).attrs,
      {
        class: "field",
        placeholder: "Search",
        tabindex: "-1",
        "data-orientation": "horizontal",
        "data-focusable": ""
      }
    )
    assert.deepStrictEqual(
      View.build(
        parts().link({
          element: h.a.class("link").attrs({
            tabindex: "4",
            "data-orientation": "x"
          }),
          value: "help"
        }),
        []
      )
        .attrs,
      { class: "link", tabindex: "-1", "data-orientation": "horizontal" }
    )
    const div = h.div.class("own").attrs({
      role: "list",
      "aria-orientation": "x",
      "data-orientation": "x",
      "data-disabled": "x"
    })
    assert.deepStrictEqual(View.build(parts().root(div), []).attrs, {
      class: "own",
      role: "toolbar",
      "aria-orientation": "horizontal",
      "data-orientation": "horizontal"
    })
    assert.deepStrictEqual(
      View.build(parts().group({ element: div, value: "format" }), []).attrs,
      {
        class: "own",
        role: "group",
        "aria-orientation": "x",
        "data-orientation": "horizontal"
      }
    )
    assert.deepStrictEqual(
      View.build(
        parts().separator(
          h.div.class("own").attrs({
            role: "none",
            "aria-orientation": "x",
            "data-orientation": "x"
          })
        ),
        []
      ).attrs,
      {
        class: "own",
        role: "separator",
        "aria-orientation": "vertical",
        "data-orientation": "vertical"
      }
    )

    assert.throws(
      () => parts().button({ element: h.button, value: "strike" }),
      /no item with value "strike"/
    )
    assert.throws(
      () => parts().group({ element: h.div, value: "align" }),
      /no group with value "align"/
    )
    assert.throws(
      () => parts({ items: [{ value: "bold" }, { value: "bold" }] }),
      /two items have the value "bold"/
    )
    assert.throws(
      () => parts({ items: [{ value: "bold", group: "align" }] }),
      /the item "bold" names the group "align", which isn't in groups/
    )
    const resolved = parts({ groups: [{ value: "format", disabled: true }] })
    assert.deepStrictEqual(values.map(resolved.isDisabled), [
      false,
      true,
      true,
      false,
      false
    ])
  })
})
