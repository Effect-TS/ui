import { Component, UiSchema, View } from "@effect/ui"
import { Toggle, type ToggleElement, Tooltip } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const ToolbarMessage = UiSchema.TaggedEnum({
  ToggledBold: { pressed: Schema.Boolean },
  RequestedCloseTip: {}
})

// The toggle stacked on a tooltip trigger: the tooltip's part has its own
// handler layer, so both hear the click.
const Toolbar = Component.define({
  name: "Toolbar",
  scoped: false,
  model: Schema.Struct({ bold: Schema.Boolean, open: Schema.Boolean }),
  message: ToolbarMessage,
  elements: Html
}).make({
  init: () => ({ bold: false, open: true }),
  update: {
    ToggledBold: ($, { pressed }) => ({ ...$.model, bold: pressed }),
    RequestedCloseTip: ($) => ({ ...$.model, open: false })
  },
  view: (h, model) =>
    Tooltip(h, {
      key: "bold",
      props: { open: model.open },
      onEmit: (event) =>
        event._tag === "RequestedClose"
          ? ToolbarMessage.RequestedCloseTip()
          : undefined,
      view: (tooltip) =>
        Toggle(h, {
          element: tooltip.trigger(h.button),
          props: { pressed: model.bold },
          onToggle: ({ pressed }) => ToolbarMessage.ToggledBold({ pressed })
        }).children("Bold")
    })
})

const toggle = Locator.tag("button")
const h = View.makeHelper<typeof ToolbarMessage.Type, {}, Html.Elements>(
  {},
  Html
)

describe("Toggle", () => {
  it.effect("stacked on a tooltip trigger, a click toggles and dismisses the tooltip", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Toolbar, {})
      const before = root.get(toggle).attrs
      assert.strictEqual(before?.["data-popup-open"], "")

      Locator.fire(root.get(toggle), "click")
      yield* TestHost.settle
      const after = root.get(toggle).attrs
      assert.strictEqual(after?.["aria-pressed"], "true")
      assert.strictEqual(after?.["data-pressed"], "")
      assert.isUndefined(after?.["data-popup-open"])

      Locator.fire(root.get(toggle), "click")
      yield* TestHost.settle
      const released = root.get(toggle).attrs
      assert.strictEqual(released?.["aria-pressed"], "false")
      assert.isUndefined(released?.["data-pressed"])
    }).pipe(Effect.provide(TestHost.layer())))

  it("the toggle's own attributes win before and after the call, the consumer's others stay, and a click handler clashes with onToggle", () => {
    const own = (element: ToggleElement<typeof ToolbarMessage.Type>) =>
      element
        .class("tool")
        .attrs({
          type: "submit",
          "aria-pressed": "mixed",
          "aria-disabled": "true",
          "data-pressed": "x",
          "data-disabled": "x"
        })
        .disabled(true)
    // Set on the element before the call, the state leaves each one absent.
    const before = View.build(
      Toggle(h, { element: own(h.button), props: { pressed: false } }),
      []
    )
    assert.deepStrictEqual(before.attrs, {
      class: "tool",
      type: "button",
      "aria-pressed": "false"
    })
    const onToggle = ({ pressed }: { readonly pressed: boolean }) =>
      ToolbarMessage.ToggledBold({ pressed })
    const { click } =
      View.build(Toggle(h, { props: { pressed: false }, onToggle }), [])
        .handlers
    assert.deepStrictEqual(
      typeof click === "function" ? click({}) : click,
      ToolbarMessage.ToggledBold({ pressed: true })
    )

    // Chained after the call, the state sets each one.
    const props = { pressed: true, disabled: true }
    const after = View.build(own(Toggle(h, { props, onToggle })), [])
    assert.isUndefined(after.handlers.click)
    assert.deepStrictEqual(after.attrs, {
      class: "tool",
      type: "button",
      "aria-pressed": "true",
      "data-pressed": "",
      "data-disabled": "",
      disabled: ""
    })

    const clicked = ToolbarMessage.RequestedCloseTip()
    assert.deepStrictEqual(
      View.build(
        Toggle(h, {
          element: h.button.onClick(clicked),
          props: { pressed: false }
        }),
        []
      ).handlers,
      { click: clicked }
    )
    for (const disabled of [false, true]) {
      const props = { pressed: false, disabled }
      assert.throws(
        () =>
          View.build(
            Toggle(h, { element: h.button.onClick(clicked), props, onToggle }),
            []
          ),
        /Toggle: the element already handles click/
      )
      assert.throws(
        () => View.build(Toggle(h, { props, onToggle }).onClick(clicked), []),
        /Toggle: the element already handles click/
      )
    }
  })
})
