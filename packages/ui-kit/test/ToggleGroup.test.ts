import type { Component } from "@effect/ui"
import { View } from "@effect/ui"
import {
  DirectionProvider,
  ToggleGroup,
  type ToggleGroupProps,
  Toolbar
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

type Parts = Component.Headless.Parts<typeof ToggleGroup>
type H = View.Helper<never, ToggleGroupProps> & View.Tags<Html.Elements, never>

const values = ["left", "center", "right"]

const standIn = {
  elements: Html,
  view: (toggleGroup: Parts, h: H) =>
    toggleGroup.root(h.div.class("group")).children(
      h.props.items.map(({ value }) =>
        toggleGroup.item({ element: h.button.attr("aria-label", value), value })
      )
    )
}

const props = (
  overrides: Partial<ToggleGroupProps> = {}
): ToggleGroupProps => ({
  value: [],
  items: values.map((value) => ({ value })),
  ...overrides
})

const root = Locator.attr("class", "group")
const item = (value: string) => Locator.attr("aria-label", value)
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const makeScene = (overrides: Partial<ToggleGroupProps> = {}) =>
  HtmlScene.make(ToggleGroup, props(overrides), standIn)
type Scene = Effect.Success<ReturnType<typeof makeScene>>

const focused = (scene: Scene): ReadonlyArray<string> =>
  scene.current.pending.map(({ command }) => {
    scene.resolve(command as never, { found: true } as never)
    return (command.args as { readonly ref: { readonly key: string } }).ref.key
  })
const focusOn = (value: string) => ["ToggleGroupItem[" + value + "]"]
const tabStops = (scene: Scene, items: ReadonlyArray<string> = values) =>
  items.filter((value) => scene.get(item(value)).attrs?.tabindex === "0")

describe("ToggleGroup", () => {
  it.effect("a click asks for the value with the item pressed or released, and disabled items report nothing", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene()
      scene.click(item("center")).emitted({
        _tag: "Toggled",
        value: ["center"]
      })
      scene.props(props({ value: ["center"] }))
      scene.click(item("left")).emitted({ _tag: "Toggled", value: ["left"] })
      scene.click(item("center")).emitted({ _tag: "Toggled", value: [] })

      scene.props(props({ value: ["right"], multiple: true }))
      scene.click(item("left")).emitted({
        _tag: "Toggled",
        value: ["right", "left"]
      })
      scene.props(props({ value: ["right", "left"], multiple: true }))
      scene.click(item("right")).emitted({ _tag: "Toggled", value: ["left"] })

      scene.props(
        props({
          items: [{ value: "left" }, { value: "center", disabled: true }, {
            value: "right"
          }]
        })
      )
      scene.fire(item("center"), "click")
      scene.props(props({ disabled: true }))
      scene.fire(item("left"), "click")
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it.effect("the root and items carry the state, and a disabled item leaves the tab order", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({ value: ["left"] })
      assert.deepStrictEqual(scene.get(root).attrs, {
        class: "group",
        role: "group",
        "data-orientation": "horizontal"
      })
      assert.deepStrictEqual(scene.get(item("left")).attrs, {
        "aria-label": "left",
        type: "button",
        "aria-pressed": "true",
        "data-pressed": "",
        tabindex: "0"
      })
      assert.deepStrictEqual(scene.get(item("center")).attrs, {
        "aria-label": "center",
        type: "button",
        "aria-pressed": "false",
        tabindex: "-1"
      })
      scene.props(
        props({
          value: ["left"],
          disabled: true,
          multiple: true,
          orientation: "vertical"
        })
      )
      assert.deepInclude(scene.get(root).attrs, {
        "data-orientation": "vertical",
        "data-disabled": "",
        "data-multiple": ""
      })
      assert.deepInclude(scene.get(item("left")).attrs, {
        disabled: "",
        "data-disabled": "",
        tabindex: "-1"
      })
      assert.deepStrictEqual(tabStops(scene), [])
    }))

  it.effect("the tab stop is the first enabled item, follows focus, and falls back when its item is disabled or removed", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({
        items: [{ value: "left", disabled: true }, { value: "center" }, {
          value: "right"
        }]
      })
      assert.deepStrictEqual(tabStops(scene), ["center"])
      scene.focus(item("right"))
      assert.deepStrictEqual(tabStops(scene), ["right"])
      scene.props(
        props({
          items: [{ value: "left" }, { value: "center" }, {
            value: "right",
            disabled: true
          }]
        })
      )
      assert.deepStrictEqual(tabStops(scene), ["left"])
      scene.props(props())
      assert.deepStrictEqual(tabStops(scene), ["right"])
      scene.props(props({ items: [{ value: "center" }, { value: "left" }] }))
      assert.deepStrictEqual(tabStops(scene, ["center", "left"]), ["center"])
    }))

  it.effect("the arrow keys of the orientation, Home and End move focus over the enabled items", () =>
    Effect.gen(function*() {
      const scene = yield* makeScene({
        items: [{ value: "left" }, { value: "center", disabled: true }, {
          value: "right"
        }]
      })
      const press = (
        from: string,
        key: string,
        details?: Parameters<Scene["keydown"]>[2]
      ) => focused(scene.keydown(item(from), key, details))

      assert.deepStrictEqual(
        focused(
          scene.keydown(item("left"), "ArrowRight").expectDefaultPrevented()
        ),
        focusOn("right")
      )
      assert.deepStrictEqual(tabStops(scene), ["right"])
      assert.deepStrictEqual(press("right", "ArrowRight"), focusOn("left"))
      assert.deepStrictEqual(press("left", "ArrowLeft"), focusOn("right"))
      assert.deepStrictEqual(press("right", "Home"), focusOn("left"))
      assert.deepStrictEqual(press("left", "End"), focusOn("right"))
      scene.keydown(item("left"), "ArrowDown").expectIgnored()
        .expectDefaultPrevented(false)
      scene.keydown(item("left"), "ArrowRight", { shift: true }).expectIgnored()
        .expectDefaultPrevented(false)
      scene.keydown(item("left"), "Tab").expectIgnored().expectDefaultPrevented(
        false
      )

      scene.props(props({ orientation: "vertical", loopFocus: false }))
      assert.deepStrictEqual(press("left", "ArrowDown"), focusOn("center"))
      assert.deepStrictEqual(press("right", "ArrowDown"), [])
      assert.deepStrictEqual(press("left", "ArrowUp"), [])
      scene.keydown(item("center"), "ArrowRight").expectIgnored()

      scene.props(props()).shared(DirectionProvider, { direction: "rtl" })
      assert.deepStrictEqual(press("center", "ArrowLeft"), focusOn("right"))
      assert.deepStrictEqual(press("center", "ArrowRight"), focusOn("left"))
    }))

  it.effect("inside a Toolbar, the items leave the tab stop and the arrow keys to it, and its disabled items and state disable them", () =>
    Effect.gen(function*() {
      const scene = (yield* makeScene({ value: ["left"] })).shared(Toolbar, {
        disabled: false,
        orientation: "horizontal",
        disabledItems: []
      })
      assert.deepStrictEqual(scene.get(item("left")).attrs, {
        "aria-label": "left",
        type: "button",
        "aria-pressed": "true",
        "data-pressed": ""
      })
      assert.throws(
        () => scene.keydown(item("left"), "ArrowRight"),
        /nothing handles "keydown"/
      )
      scene.click(item("center")).emitted({
        _tag: "Toggled",
        value: ["center"]
      })

      scene.shared(Toolbar, {
        disabled: false,
        orientation: "horizontal",
        disabledItems: ["center"]
      })
      assert.isUndefined(scene.get(root).attrs?.["data-disabled"])
      assert.deepInclude(scene.get(item("center")).attrs, {
        "data-disabled": ""
      })
      assert.isUndefined(scene.get(item("left")).attrs?.["data-disabled"])
      scene.fire(item("center"), "click")
      assert.deepStrictEqual(scene.current.emitted, [])
      scene.click(item("right")).emitted({ _tag: "Toggled", value: ["right"] })

      scene.shared(Toolbar, {
        disabled: true,
        orientation: "horizontal",
        disabledItems: []
      })
      assert.deepInclude(scene.get(root).attrs, { "data-disabled": "" })
      assert.deepInclude(scene.get(item("left")).attrs, {
        disabled: "",
        "data-disabled": ""
      })
      scene.fire(item("left"), "click")
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it("the parts' own attributes win over the consumer's, whose class and others stay", () => {
    const parts = (overrides: Partial<ToggleGroupProps> = {}) =>
      Story.parts(ToggleGroup, {
        model: { active: null },
        props: props(overrides)
      })
    const own = h.button
      .class("tool")
      .attrs({
        title: "Left",
        type: "submit",
        tabindex: "3",
        "aria-pressed": "mixed",
        "aria-disabled": "true",
        "data-pressed": "x",
        "data-disabled": "x"
      })
      .disabled(true)
    assert.deepStrictEqual(
      View.build(parts().item({ element: own, value: "center" }), []).attrs,
      {
        class: "tool",
        title: "Left",
        type: "button",
        tabindex: "-1",
        "aria-pressed": "false"
      }
    )
    const group = h.div
      .class("group")
      .attrs({
        role: "toolbar",
        "data-orientation": "x",
        "data-disabled": "x",
        "data-multiple": "x"
      })
    assert.deepStrictEqual(View.build(parts().root(group), []).attrs, {
      class: "group",
      role: "group",
      "data-orientation": "horizontal"
    })
    assert.throws(
      () => parts().item({ element: h.button, value: "justify" }),
      /no item with value "justify"/
    )
  })
})
