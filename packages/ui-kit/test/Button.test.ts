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
  view: (h, model) =>
    h.div.onClick(CardMessage.ClickedCard()).children(
      Button(h, {
        props: h.props.button,
        onPress: h.props.press ? CardMessage.PressedSave() : undefined
      }).children("Save"),
      h.output(model.clicked)
    )
})

const button = Locator.tag("button")
const clicked = (s: { get: (l: Locator.Locator) => Locator.Node }) =>
  s.get(Locator.tag("output")).children?.[0]?.text
const h = View.makeHelper<typeof CardMessage.Type, {}, Html.Elements>({}, Html)

describe("Button", () => {
  it.effect("onPress sends without cancelling a reset, no onPress lets the click through, and a focusable disabled button cancels it", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Card, {
        press: true,
        button: { type: "reset" }
      })
      s.fire(button, "click")
      assert.strictEqual(clicked(s), "save")
      assert.isFalse(s.defaultPrevented)

      s.props({ press: false, button: { type: "reset" } }).fire(button, "click")
      assert.strictEqual(clicked(s), "card")
      assert.isFalse(s.defaultPrevented)

      s.props({ press: true, button: { type: "reset", disabled: true } })
      assert.deepStrictEqual(s.get(button).attrs, {
        type: "reset",
        disabled: "",
        "data-disabled": ""
      })

      s.props({
        press: true,
        button: { type: "reset", disabled: true, focusableWhenDisabled: true }
      })
        .fire(button, "click")
        .expectIgnored()
      assert.deepStrictEqual(s.get(button).attrs, {
        type: "reset",
        "aria-disabled": "true",
        "data-disabled": ""
      })
      assert.isTrue(s.defaultPrevented)
      assert.strictEqual(clicked(s), "card")
    }))

  it("the caller chains a class, attributes and children, the button's own win, and a click handler clashing with onPress throws", () => {
    const styled = Button(h, {
      props: { disabled: true },
      element: h.button.attr("aria-disabled", "true")
    })
      .class("save")
      .attrs({
        "aria-label": "Save note",
        type: "submit",
        "data-disabled": "x"
      })
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

    const click = CardMessage.ClickedCard()
    const own = h.button.onClick(click)
    const clash = /already handles click/
    for (const disabled of [false, true]) {
      const props = { disabled }
      assert.deepStrictEqual(
        View.build(Button(h, { props, element: own }), []).handlers,
        { click }
      )
      assert.deepStrictEqual(
        View.build(Button(h, { props }).onClick(click), []).handlers,
        { click }
      )
      const reserving = [
        { props, onPress: CardMessage.PressedSave() },
        { props: { disabled, focusableWhenDisabled: true } }
      ]
      for (const options of reserving) {
        assert.throws(
          () => View.build(Button(h, { ...options, element: own }), []),
          clash
        )
        assert.throws(
          () => View.build(Button(h, options).onClick(click), []),
          clash
        )
      }
    }
  })
})
