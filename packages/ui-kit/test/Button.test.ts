import { Component, View } from "@effect/ui"
import { Button } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const CardMessage = Schema.TaggedUnion({ PressedSave: {}, ClickedCard: {} })

// A card whose click handler stands behind a button in its short form, to
// see which one a click reaches.
const Card = Component.define({
  name: "Card",
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
  update: (_model, message) =>
    CardMessage.match(message, {
      PressedSave: () => ({ clicked: "save" }),
      ClickedCard: () => ({ clicked: "card" })
    }),
  view: (model, h) =>
    h.div.onClick(CardMessage.make({ _tag: "ClickedCard" })).children(
      Button(h, {
        props: h.props.button,
        onPress: h.props.press ? CardMessage.make({ _tag: "PressedSave" }) : undefined,
        children: ["Save"]
      }),
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

  it("element carries the caller's class, attributes and handlers, the button's own win, and a click handler clashing with onPress throws", () => {
    const element = h.button
      .class("save")
      .attr("aria-label", "Save note")
      .attr("type", "submit")
      .attr("aria-disabled", "true")
      .attr("data-disabled", "")
      .disabled(true)
    const styled = Button(h, { element, children: ["Save"] })
    assert.deepStrictEqual(styled.attrs, { class: "save", "aria-label": "Save note", type: "button" })
    assert.deepStrictEqual(styled.children, [{ _tag: "Text", text: "Save" }])

    const own = h.button.onClick(CardMessage.make({ _tag: "ClickedCard" }))
    assert.deepStrictEqual(Button(h, { element: own }).handlers, { click: { _tag: "ClickedCard" } })
    assert.throws(
      () => Button(h, { element: own, onPress: CardMessage.make({ _tag: "PressedSave" }) }),
      /already handles click/
    )
    // By the options, not the state: an enabled button would cancel nothing
    // yet, but disabling it would replace the caller's handler.
    assert.throws(() => Button(h, { element: own, props: { focusableWhenDisabled: true } }), /already handles click/)
  })
})
