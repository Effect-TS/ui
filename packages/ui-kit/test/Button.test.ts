import { Component, UiSchema, View } from "@effect/ui"
import { Button } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const CardMessage = UiSchema.TaggedEnum({ PressedSave: {}, ClickedCard: {} })

// A card whose click handler stands behind a button in its short form, to
// see which one a click reaches.
const Card = Component.define({
  name: "Card",
  lifetime: "view",
  props: Schema.Struct({
    press: Schema.Boolean,
    button: Schema.Struct({
      type: Schema.Literals(["button", "submit", "reset"]),
      disabled: Schema.optional(Schema.Boolean),
      focusableWhenDisabled: Schema.optional(Schema.Boolean)
    })
  }),
  model: Schema.Struct({ clicked: Schema.String }),
  message: CardMessage,
  elements: Html
}).make({
  init: () => ({ clicked: "" }),
  update: {
    PressedSave: () => ({ clicked: "save" }),
    ClickedCard: () => ({ clicked: "card" })
  },
  view: (model, h) =>
    h.div.onClick(CardMessage.ClickedCard()).children(
      Button(h, {
        props: h.props.button,
        onPress: h.props.press ? CardMessage.PressedSave() : undefined
      }).children("Save"),
      h.output(model.clicked)
    )
})

const button = Locator.tag("button")
const clicked = (s: { get: (l: Locator.Locator) => Locator.Node }) => s.get(Locator.tag("output")).children?.[0]?.text
const h = View.makeHelper<typeof CardMessage.Type, {}, Html.Elements>({}, Html)

describe("Button", () => {
  it.effect("onPress sends without cancelling a reset, no onPress lets the click through, and a focusable disabled button cancels it", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Card, { press: true, button: { type: "reset" } })
      s.fire(button, "click")
      assert.strictEqual(clicked(s), "save")
      assert.isFalse(s.defaultPrevented)

      s.props({ press: false, button: { type: "reset" } }).fire(button, "click")
      assert.strictEqual(clicked(s), "card")
      assert.isFalse(s.defaultPrevented)

      s.props({ press: true, button: { type: "reset", disabled: true } })
      assert.deepStrictEqual(s.get(button).attrs, { type: "reset", disabled: "", "data-disabled": "" })

      s.props({ press: true, button: { type: "reset", disabled: true, focusableWhenDisabled: true } })
        .fire(button, "click")
        .expectIgnored()
      assert.deepStrictEqual(s.get(button).attrs, { type: "reset", "aria-disabled": "true", "data-disabled": "" })
      assert.isTrue(s.defaultPrevented)
      assert.strictEqual(clicked(s), "card")
    }))

  it("the caller chains a class, attributes and children, the button's own win, and a click handler clashing with onPress throws", () => {
    const styled = Button(h, { props: { disabled: true }, element: h.button.attr("aria-disabled", "true") })
      .class("save")
      .attr("aria-label", "Save note")
      .attr("type", "submit")
      .attr("data-disabled", "x")
      .disabled(false)
      .children("Save")
    const node = View.build(styled, [])
    assert.deepStrictEqual(node.attrs, {
      class: "save",
      "aria-label": "Save note",
      type: "button",
      "data-disabled": "",
      disabled: ""
    })
    assert.deepStrictEqual(node.children, [{ _tag: "Text", text: "Save" }])

    const own = (button: Html.Element<typeof CardMessage.Type, never, any, any, "button">) =>
      View.build(button.onClick(CardMessage.ClickedCard()), [])
    assert.deepStrictEqual(own(Button(h)).handlers, { click: { _tag: "ClickedCard" } })
    assert.throws(() => own(Button(h, { onPress: CardMessage.PressedSave() })), /already handles click/)
    // By the options, not the state: an enabled button would cancel nothing
    // yet, but disabling it would replace the caller's handler.
    assert.throws(() => own(Button(h, { props: { focusableWhenDisabled: true } })), /already handles click/)
  })
})
