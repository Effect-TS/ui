import { Component, View } from "@effect/ui"
import { Switch, type SwitchButton, type SwitchProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const SettingsMessage = Schema.TaggedUnion({ ToggledNotify: { checked: Schema.Boolean }, ClickedRow: {} })

// A consumer that keeps the value in its Model and draws the least markup
// the parts need: a labelled root with a thumb. The form field comes with
// the root. The row around it counts the clicks the switch leaves alone.
const Settings = Component.define({
  name: "Settings",
  props: Schema.Struct({
    disabled: Schema.optional(Schema.Boolean),
    readOnly: Schema.optional(Schema.Boolean),
    required: Schema.optional(Schema.Boolean)
  }),
  model: Schema.Struct({ notify: Schema.Boolean, rowClicks: Schema.Number }),
  message: SettingsMessage,
  elements: Html
}).make({
  init: () => ({ notify: false, rowClicks: 0 }),
  update: (model, message) =>
    SettingsMessage.match(message, {
      ToggledNotify: ({ checked }) => ({ ...model, notify: checked }),
      ClickedRow: () => ({ ...model, rowClicks: model.rowClicks + 1 })
    }),
  view: (model, h) =>
    h.div.onClick(SettingsMessage.make({ _tag: "ClickedRow" })).children(
      Switch(h, {
        props: { checked: model.notify, ...h.props },
        onToggle: ({ checked }) => SettingsMessage.make({ _tag: "ToggledNotify", checked }),
        view: (s) => h.label(s.root({ element: h.button, children: [s.thumb(h.span.class("thumb"))] }), "Notifications")
      }),
      h.output(String(model.rowClicks))
    )
})

const root = Locator.attr("role", "switch")
const thumb = Locator.tag("span")
const rowClicks = (s: { readonly get: (locator: Locator.Locator) => Locator.Node }) =>
  s.get(Locator.tag("output")).children?.[0]?.text
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
      assert.strictEqual(s.get(thumb).attrs?.class, "thumb")
      assert.strictEqual(s.get(thumb).attrs?.["data-unchecked"], "")
      s.fire(root, "click")
      assert.strictEqual(s.get(root).attrs?.["aria-checked"], "true")
      assert.strictEqual(s.get(root).attrs?.["data-checked"], "")
      assert.strictEqual(s.get(thumb).attrs?.["data-checked"], "")
      assert.isUndefined(s.get(thumb).attrs?.["data-unchecked"])
      s.fire(root, "click")
      assert.strictEqual(s.get(root).attrs?.["aria-checked"], "false")
      // The switch handled both clicks, so the row heard neither.
      assert.strictEqual(rowClicks(s), "0")
    }))

  it.effect("a read-only switch leaves its click to the row around it, and only a disabled one leaves the tab order", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Settings, { disabled: true })
      const disabled = s.get(root).attrs
      assert.strictEqual(disabled?.disabled, "")
      assert.strictEqual(disabled?.["data-disabled"], "")
      assert.strictEqual(s.get(thumb).attrs?.["data-disabled"], "")
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
      s.fire(root, "click")
      assert.strictEqual(rowClicks(s), "1")
      assert.strictEqual(s.get(root).attrs?.["aria-checked"], "false")
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
    const stacked = Switch(h, {
      props: { checked: true },
      view: (s) => s.thumb({ element: builder, children: ["on"] })
    })
    assert.deepStrictEqual(stacked.attrs, { class: "thumb", "data-checked": "" })
  })

  it("the root keeps a consumer's click handler without onToggle, and refuses it with one in every state", () => {
    const handler = () => undefined
    const element = h.button.onClick(handler)
    assert.strictEqual(rootOf({ checked: false }, element).handlers.click, handler)
    const toggling = (props: SwitchProps) => () =>
      Switch(h, { props, onToggle: () => undefined, view: (s) => s.root({ element }) })
    assert.throws(toggling({ checked: false }), /Switch: the root's element already handles click/)
    // A read-only switch sets no handler, but it would once it's editable.
    assert.throws(toggling({ checked: false, readOnly: true }), /Switch: the root's element already handles click/)
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
