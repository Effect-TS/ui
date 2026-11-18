import type { Component } from "@effect/ui"
import { View } from "@effect/ui"
import { Switch, type SwitchProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

// The least markup the parts need: a labelled root with a thumb. The form
// field comes with the root.
const standIn = {
  elements: Html,
  view: (
    s: Component.Headless.Parts<typeof Switch>,
    h: View.Helper<never, SwitchProps> & View.Tags<Html.Elements, never>
  ) => h.label(s.root({ element: h.button, children: [s.thumb(h.span)] }), "Notifications")
}

const root = Locator.attr("role", "switch")
const thumb = Locator.tag("span")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

describe("Switch", () => {
  it.effect("a click asks for the other value, and the root and thumb show the value they were given", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Switch, { checked: false }, standIn)
      const attrs = s.get(root).attrs
      assert.strictEqual(attrs?.type, "button")
      assert.strictEqual(attrs?.["aria-checked"], "false")
      assert.strictEqual(attrs?.["data-unchecked"], "")
      assert.isUndefined(attrs?.["data-checked"])
      assert.strictEqual(s.get(thumb).attrs?.["data-unchecked"], "")
      s.fire(root, "click")
        .emitted({ _tag: "Toggled", checked: true })
      // Nothing changes until the consumer passes the new value back.
      assert.strictEqual(s.get(root).attrs?.["aria-checked"], "false")
      s.props({ checked: true })
      assert.strictEqual(s.get(root).attrs?.["aria-checked"], "true")
      assert.strictEqual(s.get(root).attrs?.["data-checked"], "")
      assert.strictEqual(s.get(thumb).attrs?.["data-checked"], "")
      assert.isUndefined(s.get(thumb).attrs?.["data-unchecked"])
      s.fire(root, "click")
        .emitted({ _tag: "Toggled", checked: false })
    }))

  it.effect("a disabled or read-only switch ignores clicks, and only a disabled one leaves the tab order", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Switch, { checked: false, disabled: true }, standIn)
      const disabled = s.get(root).attrs
      assert.strictEqual(disabled?.disabled, "")
      assert.strictEqual(disabled?.["data-disabled"], "")
      assert.strictEqual(s.get(thumb).attrs?.["data-disabled"], "")
      s.fire(root, "click")
        .props({ checked: false, readOnly: true, required: true })
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
      assert.deepStrictEqual(s.current.emitted, [])
    }))

  it("the root takes only a native button, which toggles on Space and Enter by itself", () => {
    const s = Story.parts(Switch, { model: {}, props: { checked: false } })
    assert.strictEqual(s.root({ element: h.button }).tag, "button")
    assert.throws(() => s.root({ element: h.span as any }), /a part for <button> was given <span>/)
  })

  it("the root keeps the consumer's attributes, but the switch's own win, present or absent", () => {
    const parts = (props: SwitchProps) => Story.parts(Switch, { model: {}, props })
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
    assert.deepStrictEqual(parts({ checked: false }).root({ element: element.disabled(true) }).attrs, {
      class: "switch",
      "aria-label": "Mute",
      type: "button",
      role: "switch",
      "aria-checked": "false",
      "data-unchecked": ""
    })
    // The thumb drops a state the switch doesn't have.
    const thumb = parts({ checked: false }).thumb(
      h.span.class("thumb")
        .attr("data-checked", "")
        .attr("data-disabled", "")
        .attr("data-readonly", "")
        .attr("data-required", "")
    )
    assert.deepStrictEqual(thumb.attrs, { class: "thumb", "data-unchecked": "" })
    // A disabled, checked switch keeps its own `disabled` over the
    // consumer's removal, and removes the consumer's `data-unchecked`.
    const disabled = parts({ checked: true, disabled: true }).root({
      element: element.attr("data-unchecked", "").disabled(false)
    })
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

  it("the root draws the form field after its children: value when on, and uncheckedValue or nothing when off", () => {
    const field = (props: SwitchProps) => {
      const button = Story.parts(Switch, { model: {}, props }).root({ element: h.button, children: ["label"] })
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
