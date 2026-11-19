import { Component, UiSchema, View } from "@effect/ui"
import { Toggle, type ToggleElement, Tooltip } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const EditorMessage = UiSchema.TaggedEnum({ ToggledBold: { pressed: Schema.Boolean }, ClickedRow: {} })

// A consumer that keeps the value in its Model. The row around the toggle
// counts the clicks the toggle leaves alone.
const Editor = Component.define({
  name: "Editor",
  props: Schema.Struct({ disabled: Schema.optional(Schema.Boolean) }),
  model: Schema.Struct({ bold: Schema.Boolean, rowClicks: Schema.Number }),
  message: EditorMessage,
  elements: Html
}).make({
  init: () => ({ bold: false, rowClicks: 0 }),
  update: {
    ToggledBold: (model, { pressed }) => ({ ...model, bold: pressed }),
    ClickedRow: (model) => ({ ...model, rowClicks: model.rowClicks + 1 })
  },
  view: (model, h) =>
    h.div.onClick(EditorMessage.ClickedRow()).children(
      Toggle(h, {
        props: { pressed: model.bold, disabled: h.props.disabled },
        onToggle: ({ pressed }) => EditorMessage.ToggledBold({ pressed })
      }).attr("aria-label", "Bold").children("B"),
      h.output(String(model.rowClicks))
    )
})

const ToolbarMessage = UiSchema.TaggedEnum({ ToggledBold: { pressed: Schema.Boolean }, DismissedTip: {} })

// The toggle stacked on a tooltip trigger: the tooltip's part has its own
// handler layer, so both hear the click.
const Toolbar = Component.define({
  name: "Toolbar",
  model: Schema.Struct({ bold: Schema.Boolean, open: Schema.Boolean }),
  message: ToolbarMessage,
  elements: Html
}).make({
  init: () => ({ bold: false, open: true }),
  update: {
    ToggledBold: (model, { pressed }) => ({ ...model, bold: pressed }),
    DismissedTip: (model) => ({ ...model, open: false })
  },
  view: (model, h) =>
    Tooltip(h, {
      key: "bold",
      props: { open: model.open },
      onEmit: (event) => event._tag === "Dismissed" ? ToolbarMessage.DismissedTip() : undefined,
      view: (t) =>
        h.span(
          Toggle(h, {
            element: t.trigger(h.button),
            props: { pressed: model.bold },
            onToggle: ({ pressed }) => ToolbarMessage.ToggledBold({ pressed })
          }).class("tool").attr("aria-label", "Bold").children("B"),
          t.positioner(h.div).children("Bold")
        )
    })
})

const toggle = Locator.tag("button")
const rowClicks = Locator.tag("output")
const h = View.makeHelper<typeof EditorMessage.Type, {}, Html.Elements>({}, Html)

describe("Toggle", () => {
  it.effect("a click asks for the other value, the button shows the value it was given, and a disabled one sends nothing", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Editor, {})
      assert.deepStrictEqual(s.get(toggle).attrs, { "aria-label": "Bold", type: "button", "aria-pressed": "false" })
      s.fire(toggle, "click")
      assert.deepStrictEqual(s.get(toggle).attrs, {
        "aria-label": "Bold",
        type: "button",
        "aria-pressed": "true",
        "data-pressed": ""
      })
      s.fire(toggle, "click")
      assert.strictEqual(s.get(toggle).attrs?.["aria-pressed"], "false")
      // The toggle handled both clicks, so the row heard neither.
      assert.strictEqual(Locator.textOf(s.get(rowClicks)), "0")

      s.props({ disabled: true })
      assert.deepStrictEqual(s.get(toggle).attrs, {
        "aria-label": "Bold",
        type: "button",
        "aria-pressed": "false",
        disabled: "",
        "data-disabled": ""
      })
      // A disabled toggle sets no click handler, so a click that reached it
      // would go to the row. The browser gives a disabled button none.
      s.fire(toggle, "click")
      assert.strictEqual(Locator.textOf(s.get(rowClicks)), "1")
      assert.strictEqual(s.get(toggle).attrs?.["aria-pressed"], "false")
    }))

  it.effect("stacked on a tooltip trigger, a click toggles and dismisses the tooltip", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Toolbar, {})
      const before = root.get(toggle).attrs
      assert.strictEqual(before?.class, "tool")
      assert.strictEqual(before?.["aria-pressed"], "false")
      assert.strictEqual(before?.["data-popup-open"], "")

      Locator.fire(root.get(toggle), "click")
      yield* TestHost.settle
      const after = root.get(toggle).attrs
      assert.strictEqual(after?.["aria-pressed"], "true")
      assert.isUndefined(after?.["data-popup-open"])
    }).pipe(Effect.provide(TestHost.layer())))

  it("the toggle's own attributes win before and after the call, the consumer's others stay, and a click handler clashes with onToggle", () => {
    const own = (element: ToggleElement<typeof EditorMessage.Type>) =>
      element
        .class("tool")
        .attr("type", "submit")
        .attr("aria-pressed", "mixed")
        .attr("aria-disabled", "true")
        .attr("data-pressed", "x")
        .attr("data-disabled", "x")
        .disabled(true)
    // Set on the element before the call, the state leaves each one absent.
    const before = View.build(Toggle(h, { element: own(h.button), props: { pressed: false } }), [])
    assert.deepStrictEqual(before.attrs, { class: "tool", type: "button", "aria-pressed": "false" })
    // Chained after the call, the state sets each one.
    const after = View.build(own(Toggle(h, { props: { pressed: true, disabled: true } })), [])
    assert.deepStrictEqual(after.attrs, {
      class: "tool",
      type: "button",
      "aria-pressed": "true",
      "data-pressed": "",
      "data-disabled": "",
      disabled: ""
    })

    const clicked = EditorMessage.ClickedRow()
    const onToggle = ({ pressed }: { readonly pressed: boolean }) => EditorMessage.ToggledBold({ pressed })
    assert.deepStrictEqual(
      View.build(Toggle(h, { element: h.button.onClick(clicked), props: { pressed: false } }), []).handlers,
      { click: clicked }
    )
    for (const disabled of [false, true]) {
      const props = { pressed: false, disabled }
      assert.throws(
        () => View.build(Toggle(h, { element: h.button.onClick(clicked), props, onToggle }), []),
        /Toggle: the element already handles click/
      )
      assert.throws(
        () => View.build(Toggle(h, { props, onToggle }).onClick(clicked), []),
        /Toggle: the element already handles click/
      )
    }
  })
})
