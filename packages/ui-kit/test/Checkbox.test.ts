import type { Component } from "@effect/ui"
import { View } from "@effect/ui"
import { Checkbox, type CheckboxProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

// The least markup the parts need: a labelled root with an indicator. The
// form field comes with the root.
const standIn = {
  elements: Html,
  view: (
    checkbox: Component.Headless.Parts<typeof Checkbox>,
    h: View.Helper<never, CheckboxProps> & View.Tags<Html.Elements, never>
  ) =>
    h.label([
      checkbox.root(h.button).children([checkbox.indicator(h.span)]),
      "Accept the terms"
    ])
}

const root = Locator.attr("role", "checkbox")
const indicator = Locator.tag("span")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const parts = (props: CheckboxProps) =>
  Story.parts(Checkbox, { model: {}, props })

describe("Checkbox", () => {
  it.effect("a click asks for the other value, and the root and indicator show the value they were given", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Checkbox, { checked: false }, standIn)
      s.fire(root, "click")
        .emitted([{ _tag: "Toggled", checked: true }])
      // Nothing changes until the consumer passes the new value back.
      assert.strictEqual(s.get(root).attrs?.["aria-checked"], "false")
      s.props({ checked: true })
      assert.strictEqual(s.get(root).attrs?.["aria-checked"], "true")
      assert.strictEqual(s.get(root).attrs?.["data-checked"], "")
      assert.strictEqual(s.get(indicator).attrs?.["data-checked"], "")
      assert.isUndefined(s.get(indicator).attrs?.["data-unchecked"])
      s.fire(root, "click")
        .emitted([{ _tag: "Toggled", checked: false }])
    }))

  it.effect("an indeterminate checkbox is mixed, neither checked nor unchecked, and a click asks for the other value", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Checkbox, {
        checked: true,
        indeterminate: true
      }, standIn)
      assert.strictEqual(s.get(root).attrs?.["aria-checked"], "mixed")
      assert.isUndefined(s.get(root).attrs?.["data-checked"])
      const attrs = s.get(indicator).attrs
      assert.strictEqual(attrs?.["data-indeterminate"], "")
      assert.isUndefined(attrs?.["data-checked"])
      assert.isUndefined(attrs?.["data-unchecked"])
      s.fire(root, "click")
        .emitted([{ _tag: "Toggled", checked: false }])
    }))

  it.effect("a disabled or read-only checkbox ignores clicks, and only a disabled one leaves the tab order", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(
        Checkbox,
        { checked: false, disabled: true },
        standIn
      )
      assert.strictEqual(s.get(indicator).attrs?.["data-disabled"], "")
      s.fire(root, "click")
        .props({ checked: false, readOnly: true, required: true })
      const attrs = s.get(root).attrs
      assert.isUndefined(attrs?.disabled)
      assert.strictEqual(attrs?.["aria-readonly"], "true")
      assert.strictEqual(attrs?.["data-readonly"], "")
      assert.strictEqual(attrs?.["aria-required"], "true")
      assert.strictEqual(attrs?.["data-required"], "")
      const indicatorAttrs = s.get(indicator).attrs
      assert.isUndefined(indicatorAttrs?.["data-disabled"])
      assert.strictEqual(indicatorAttrs?.["data-readonly"], "")
      assert.strictEqual(indicatorAttrs?.["data-required"], "")
      s.fire(root, "click")
      assert.deepStrictEqual(s.current.emitted, [])
    }))

  it.effect("Enter is cancelled, so it doesn't toggle the button, and other keys are left alone", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Checkbox, { checked: false }, standIn)
      s.fire(root, "keydown", { key: "Enter" })
        .expectDefaultPrevented()
      assert.deepStrictEqual(s.current.emitted, [])
      s.fire(root, "keydown", { key: " " })
        .expectIgnored()
        .expectDefaultPrevented(false)
    }))

  it("the root takes only a native button, which toggles on Space by itself", () => {
    const checkbox = parts({ checked: false })
    assert.strictEqual(View.build(checkbox.root(h.button), []).tag, "button")
    assert.throws(
      () => checkbox.root(h.span as any),
      /a part for <button> was given <span>/
    )
  })

  it("the root keeps the consumer's attributes, but the checkbox's own win, present or absent", () => {
    const element = h.button
      .class(["checkbox"])
      .attrs({
        "aria-label": "Terms",
        type: "submit",
        role: "switch",
        "aria-checked": "true",
        "aria-readonly": "true",
        "aria-disabled": "true",
        "aria-required": "true",
        "data-checked": "",
        "data-indeterminate": "",
        "data-disabled": "",
        "data-readonly": "",
        "data-required": ""
      })

    // An enabled, optional, unchecked checkbox removes every state attribute
    // the consumer set, as it doesn't report those states.
    assert.deepStrictEqual(
      View.build(parts({ checked: false }).root(element.disabled(true)), [])
        .attrs,
      {
        class: "checkbox",
        "aria-label": "Terms",
        type: "button",
        role: "checkbox",
        "aria-checked": "false",
        "data-unchecked": ""
      }
    )
    // The indicator drops a state the checkbox doesn't have.
    const indicator = parts({ checked: false }).indicator(
      h.span.class(["tick"])
        .attrs({
          "data-checked": "",
          "data-indeterminate": "",
          "data-disabled": "",
          "data-readonly": "",
          "data-required": ""
        })
    )
    assert.deepStrictEqual(View.build(indicator, []).attrs, {
      class: "tick",
      "data-unchecked": ""
    })
    // A disabled, indeterminate checkbox keeps its own `disabled` over the
    // consumer's removal, and removes the consumer's `data-unchecked`.
    const disabled = parts({
      checked: false,
      indeterminate: true,
      disabled: true
    }).root(
      element.attr("data-unchecked", "").disabled(false)
    )
    assert.deepStrictEqual(View.build(disabled, []).attrs, {
      class: "checkbox",
      "aria-label": "Terms",
      type: "button",
      role: "checkbox",
      "aria-checked": "mixed",
      disabled: "",
      "data-indeterminate": "",
      "data-disabled": ""
    })
  })

  it("the root draws the form field before the children chained on it: value when ticked, and uncheckedValue or nothing when not", () => {
    const field = (props: CheckboxProps) => {
      const button = View.build(
        parts(props).root(h.button).children(["label"]),
        []
      )
      const first = button.children[0]!
      if (first._tag !== "Element") return null
      assert.strictEqual(first.tag, "input")
      assert.strictEqual(first.attrs.type, "hidden")
      assert.strictEqual(first.attrs.name, "terms")
      assert.deepStrictEqual(button.children.slice(1), [{
        _tag: "Text",
        text: "label"
      }])
      return first.attrs.value
    }
    assert.strictEqual(
      field({ checked: true, name: "terms", value: "yes" }),
      "yes"
    )
    assert.isNull(field({ checked: false, name: "terms" }))
    assert.strictEqual(
      field({ checked: false, name: "terms", uncheckedValue: "no" }),
      "no"
    )
    // An indeterminate checkbox submits its `checked` value.
    assert.strictEqual(
      field({ checked: true, indeterminate: true, name: "terms" }),
      "on"
    )
    // A disabled field submits nothing, and a checkbox without a name has none.
    assert.isNull(field({ checked: true, name: "terms", disabled: true }))
    assert.isNull(field({ checked: true }))
    // A root with no children of its own still carries the field.
    const bare = View.build(
      parts({ checked: true, name: "terms" }).root(h.button),
      []
    )
    assert.deepStrictEqual(
      bare.children.map((child) =>
        child._tag === "Element" ? child.tag : child._tag
      ),
      ["input"]
    )
  })
})
