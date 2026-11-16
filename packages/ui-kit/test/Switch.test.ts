import type { Component } from "@effect/ui"
import { View } from "@effect/ui"
import { Switch, type SwitchProps } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Query, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"

// The least markup the parts need: a labelled root with a thumb. The form
// field comes with the root.
const standIn = {
  elements: Html,
  view: (
    s: Component.Headless.Parts<typeof Switch>,
    h: View.Helper<never, SwitchProps> & View.Tags<Html.Elements, never>
  ) => h.label(s.root(h.button, s.thumb(h.span)), "Notifications")
}

const root = Query.attr("role", "switch")
const thumb = Query.tag("span")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

describe("Switch", () => {
  it("a click asks for the other value, and the root and thumb show the value they were given", () => {
    const story = Story.make(Switch, { checked: false }, standIn, (s) => {
      s.check((story) => {
        const attrs = story.get(root).attrs
        assert.strictEqual(attrs?.type, "button")
        assert.strictEqual(attrs?.["aria-checked"], "false")
        assert.strictEqual(attrs?.["data-unchecked"], "")
        assert.isUndefined(attrs?.["data-checked"])
        assert.strictEqual(story.get(thumb).attrs?.["data-unchecked"], "")
      })
        .fire(root, "click")
        // Nothing changes until the consumer passes the new value back.
        .check((story) => assert.strictEqual(story.get(root).attrs?.["aria-checked"], "false"))
        .props({ checked: true })
        .check((story) => {
          assert.strictEqual(story.get(root).attrs?.["aria-checked"], "true")
          assert.strictEqual(story.get(root).attrs?.["data-checked"], "")
          assert.strictEqual(story.get(thumb).attrs?.["data-checked"], "")
          assert.isUndefined(story.get(thumb).attrs?.["data-unchecked"])
        })
        .fire(root, "click")
    })
    assert.deepStrictEqual(story.emitted, [
      { _tag: "Toggled", checked: true },
      { _tag: "Toggled", checked: false }
    ])
  })

  it("a disabled or read-only switch ignores clicks, and only a disabled one leaves the tab order", () => {
    const story = Story.make(Switch, { checked: false, disabled: true }, standIn, (s) => {
      s.check((story) => {
        const attrs = story.get(root).attrs
        assert.strictEqual(attrs?.disabled, "")
        assert.strictEqual(attrs?.["data-disabled"], "")
      })
        .fire(root, "click")
        .props({ checked: false, readOnly: true, required: true })
        .check((story) => {
          const attrs = story.get(root).attrs
          assert.isUndefined(attrs?.disabled)
          assert.strictEqual(attrs?.["aria-readonly"], "true")
          assert.strictEqual(attrs?.["data-readonly"], "")
          assert.strictEqual(attrs?.["aria-required"], "true")
          assert.strictEqual(attrs?.["data-required"], "")
        })
        .fire(root, "click")
    })
    assert.deepStrictEqual(story.emitted, [])
  })

  it("the root takes only a native button, which toggles on Space and Enter by itself", () => {
    const s = Story.parts(Switch, { model: {}, props: { checked: false } })
    assert.strictEqual(s.root(h.button).tag, "button")
    assert.throws(() => s.root(h.span as any), /a part for <button> was given <span>/)
  })

  it("the root draws the form field after its children: value when on, and uncheckedValue or nothing when off", () => {
    const field = (props: SwitchProps) => {
      const button = Story.parts(Switch, { model: {}, props }).root(h.button, "label")
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
