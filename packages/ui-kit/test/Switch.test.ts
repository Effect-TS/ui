import { Switch, type SwitchProps } from "@effect/ui-kit"
import { Query, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"

const root = Query.attr("role", "switch")
const thumb = Query.tag("span")
const label = { slots: () => ({ label: "Notifications" }) }

describe("Switch", () => {
  it("a click asks for the other value, and the root and thumb show the value they were given", () => {
    const story = Story.make(Switch, { checked: false }, label, (s) => {
      s.check((story) => {
        // The label around the root names it with the slot's content.
        const outer = story.get(Query.tag("label"))
        assert.strictEqual(Query.textOf(outer), "Notifications")
        assert.strictEqual(outer.children?.[0], story.get(root))
        // A native button, so Space, Enter and Tab need no key handler.
        assert.strictEqual(story.get(root).tag, "button")
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
    const story = Story.make(Switch, { checked: false, disabled: true }, label, (s) => {
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

  it("draws the form field: value when on, and uncheckedValue or nothing when off", () => {
    const field = (props: SwitchProps) => {
      let value: string | null = null
      Story.make(Switch, props, label, (s) =>
        s.check((story) => {
          const input = story.query(Query.tag("input"))
          if (input === undefined) return
          assert.strictEqual(input.attrs?.type, "hidden")
          assert.strictEqual(input.attrs?.name, "notify")
          value = input.attrs?.value ?? null
        }))
      return value
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
