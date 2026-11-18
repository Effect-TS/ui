import { Component, View } from "@effect/ui"
import { Switch, type SwitchButton, type SwitchProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const SettingsMessage = Schema.TaggedUnion({ ToggledNotify: { checked: Schema.Boolean } })

// A consumer that keeps the value in its Model and draws the least markup
// the parts need: a labelled root with a thumb. The form field comes with
// the root.
const Settings = Component.define({
  name: "Settings",
  props: Schema.Struct({
    disabled: Schema.optional(Schema.Boolean),
    readOnly: Schema.optional(Schema.Boolean),
    required: Schema.optional(Schema.Boolean)
  }),
  model: Schema.Struct({ notify: Schema.Boolean }),
  message: SettingsMessage,
  elements: Html
}).make({
  init: () => ({ notify: false }),
  update: (_model, message) =>
    SettingsMessage.match(message, {
      ToggledNotify: ({ checked }) => ({ notify: checked })
    }),
  view: (model, h) =>
    Switch(h, {
      props: { checked: model.notify, ...h.props },
      onToggle: ({ checked }) => SettingsMessage.make({ _tag: "ToggledNotify", checked }),
      view: (s) => h.label(s.root({ element: h.button, children: [s.thumb({ element: h.span })] }), "Notifications")
    })
})

const root = Locator.attr("role", "switch")
const thumb = Locator.tag("span")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

// The root a consumer gets for these props and this button.
const rootOf = (props: SwitchProps, element: SwitchButton<never> = h.button) =>
  Switch(h, { props, view: (s) => s.root({ element, children: ["label"] }) })

describe("Switch", () => {
  it.effect("a click asks for the other value, and the root and thumb show the value they were given", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Settings, {})
      const attrs = s.get(root).attrs
      assert.strictEqual(attrs?.type, "button")
      assert.strictEqual(attrs?.["aria-checked"], "false")
      assert.strictEqual(attrs?.["data-unchecked"], "")
      assert.isUndefined(attrs?.["data-checked"])
      assert.strictEqual(s.get(thumb).attrs?.["data-unchecked"], "")
      s.fire(root, "click")
      assert.strictEqual(s.get(root).attrs?.["aria-checked"], "true")
      assert.strictEqual(s.get(root).attrs?.["data-checked"], "")
      assert.strictEqual(s.get(thumb).attrs?.["data-checked"], "")
      assert.isUndefined(s.get(thumb).attrs?.["data-unchecked"])
      s.fire(root, "click")
      assert.strictEqual(s.get(root).attrs?.["aria-checked"], "false")
    }))

  it.effect("a disabled or read-only switch handles no click, and only a disabled one leaves the tab order", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Settings, { disabled: true })
      const disabled = s.get(root).attrs
      assert.strictEqual(disabled?.disabled, "")
      assert.strictEqual(disabled?.["data-disabled"], "")
      assert.strictEqual(s.get(thumb).attrs?.["data-disabled"], "")
      assert.throws(() => s.fire(root, "click"), /nothing handles "click"/)
      s.props({ readOnly: true, required: true })
      const attrs = s.get(root).attrs
      assert.isUndefined(attrs?.disabled)
      assert.strictEqual(attrs?.["aria-readonly"], "true")
      assert.strictEqual(attrs?.["data-readonly"], "")
      assert.strictEqual(attrs?.["aria-required"], "true")
      assert.strictEqual(attrs?.["data-required"], "")
      const thumbAttrs = s.get(thumb).attrs
      assert.isUndefined(thumbAttrs?.["data-disabled"])
      assert.strictEqual(thumbAttrs?.["data-readonly"], "")
      assert.strictEqual(thumbAttrs?.["data-required"], "")
      assert.throws(() => s.fire(root, "click"), /nothing handles "click"/)
    }))

  it("the root keeps the consumer's attributes, but the switch's own win, present or absent", () => {
    const element = h.button
      .class("switch")
      .attr("aria-label", "Mute")
      .attr("type", "submit")
      .attr("role", "checkbox")
      .attr("aria-checked", "mixed")
      .attr("aria-readonly", "true")
      .attr("aria-disabled", "true")
      .attr("aria-required", "true")
      .attr("data-checked", "")
      .attr("data-disabled", "")
      .attr("data-readonly", "")
      .attr("data-required", "")

    // An enabled, optional, unchecked switch removes every state attribute
    // the consumer set, as it doesn't report those states.
    assert.deepStrictEqual(rootOf({ checked: false }, element.disabled(true)).attrs, {
      class: "switch",
      "aria-label": "Mute",
      type: "button",
      role: "switch",
      "aria-checked": "false",
      "data-unchecked": ""
    })
    // A disabled, checked switch keeps its own `disabled` over the
    // consumer's removal, and removes the consumer's `data-unchecked`.
    const disabled = rootOf({ checked: true, disabled: true }, element.attr("data-unchecked", "").disabled(false))
    assert.deepStrictEqual(disabled.attrs, {
      class: "switch",
      "aria-label": "Mute",
      type: "button",
      role: "switch",
      "aria-checked": "true",
      disabled: "",
      "data-checked": "",
      "data-disabled": ""
    })
  })

  it("the thumb drops a state the switch doesn't have, finished with its children or as a builder to pass on", () => {
    const element = h.span.class("thumb")
      .attr("data-checked", "")
      .attr("data-disabled", "")
      .attr("data-readonly", "")
      .attr("data-required", "")
    const finished = Switch(h, {
      props: { checked: false },
      view: (s) => s.thumb({ element, children: ["on"] })
    })
    assert.deepStrictEqual(finished.attrs, { class: "thumb", "data-unchecked": "" })
    assert.strictEqual(finished.children.length, 1)
    // Applied to the builder alone, the thumb returns it for another call's
    // `element`.
    const builder = Switch(h, { props: { checked: false }, view: (s) => s.thumb(element) })
    assert.deepStrictEqual(builder.children("on").attrs, finished.attrs)
  })

  it("the root refuses a button that already handles the click it owns", () => {
    assert.throws(
      () => rootOf({ checked: false }, h.button.onClick(() => undefined)),
      /Switch: the root's element already handles click/
    )
  })

  it("the root draws the form field after its children: value when on, and uncheckedValue or nothing when off", () => {
    const field = (props: SwitchProps) => {
      const button = rootOf(props)
      const last = button.children[button.children.length - 1]!
      if (last._tag !== "Element") return null
      assert.strictEqual(last.tag, "input")
      assert.strictEqual(last.attrs.type, "hidden")
      assert.strictEqual(last.attrs.name, "notify")
      return last.attrs.value
    }
    assert.strictEqual(field({ checked: true, name: "notify" }), "on")
    assert.strictEqual(field({ checked: true, name: "notify", value: "yes" }), "yes")
    assert.isNull(field({ checked: false, name: "notify" }))
    assert.strictEqual(field({ checked: false, name: "notify", uncheckedValue: "no" }), "no")
    // A disabled field submits nothing, as a disabled checkbox doesn't, and
    // a switch without a name has no field.
    assert.isNull(field({ checked: true, name: "notify", disabled: true }))
    assert.isNull(field({ checked: true }))
  })
})
