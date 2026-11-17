import { Switch, type SwitchProps } from "@effect/ui-kit"
import { Query, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"

// The documented styling hooks, which the tests select by.
const part = (name: string) => Query.attr("data-part", name)
const root = part("root")
const styled = ["label", "root", "thumb"]
const label = { slots: () => ({ label: "Notifications" }) }

// The state attributes on every styled part, as `[part, attribute]` pairs.
const flags = (story: Pick<Story.Story<SwitchProps, unknown, unknown, unknown>, "get">, names: ReadonlyArray<string>) =>
  styled.flatMap((name) => {
    const attrs = story.get(part(name)).attrs
    assert.strictEqual(attrs?.["data-scope"], "switch")
    return names.filter((flag) => attrs?.[flag] === "").map((flag) => `${name} ${flag}`)
  })

describe("Switch", () => {
  it("a click asks for the other value, and every part shows the value it was given", () => {
    const story = Story.make(Switch, { checked: false }, label, (s) => {
      s.check((story) => {
        // The label around the root names it with the slot's content.
        const outer = story.get(part("label"))
        assert.strictEqual(outer.tag, "label")
        assert.strictEqual(Query.textOf(outer), "Notifications")
        assert.strictEqual(outer.children?.[0], story.get(root))
        // A native button, so Space, Enter and Tab need no key handler.
        assert.strictEqual(story.get(root).tag, "button")
        assert.strictEqual(story.get(root).attrs?.type, "button")
        assert.strictEqual(story.get(root).attrs?.["aria-checked"], "false")
        assert.deepStrictEqual(flags(story, ["data-checked", "data-unchecked"]), [
          "label data-unchecked",
          "root data-unchecked",
          "thumb data-unchecked"
        ])
      })
        .fire(root, "click")
        // Nothing changes until the consumer passes the new value back.
        .check((story) => assert.strictEqual(story.get(root).attrs?.["aria-checked"], "false"))
        .props({ checked: true })
        .check((story) => {
          assert.strictEqual(story.get(root).attrs?.["aria-checked"], "true")
          assert.deepStrictEqual(flags(story, ["data-checked", "data-unchecked"]), [
            "label data-checked",
            "root data-checked",
            "thumb data-checked"
          ])
        })
        .fire(root, "click")
    })
    assert.deepStrictEqual(story.emitted, [
      { _tag: "Toggled", checked: true },
      { _tag: "Toggled", checked: false }
    ])
  })

  it("a disabled or read-only switch ignores clicks, and only a disabled one leaves the tab order", () => {
    const states = ["data-disabled", "data-readonly", "data-required"]
    const story = Story.make(Switch, { checked: false, disabled: true }, label, (s) => {
      s.check((story) => {
        assert.strictEqual(story.get(root).attrs?.disabled, "")
        assert.deepStrictEqual(flags(story, states), [
          "label data-disabled",
          "root data-disabled",
          "thumb data-disabled"
        ])
      })
        .fire(root, "click")
        .props({ checked: false, readOnly: true, required: true })
        .check((story) => {
          const attrs = story.get(root).attrs
          assert.isUndefined(attrs?.disabled)
          assert.strictEqual(attrs?.["aria-readonly"], "true")
          assert.strictEqual(attrs?.["aria-required"], "true")
          assert.deepStrictEqual(flags(story, states), [
            "label data-readonly",
            "label data-required",
            "root data-readonly",
            "root data-required",
            "thumb data-readonly",
            "thumb data-required"
          ])
        })
        .fire(root, "click")
    })
    assert.deepStrictEqual(story.emitted, [])
  })

  it("without the label slot, the root takes its name and description from props", () => {
    const named = {
      checked: false,
      id: "mute",
      "aria-label": "Mute",
      "aria-labelledby": "row-3",
      "aria-describedby": "mute-help"
    }
    Story.make(Switch, named, (s) =>
      s.check((story) => {
        const attrs = story.get(root).attrs
        assert.strictEqual(attrs?.id, "mute")
        assert.strictEqual(attrs?.["aria-label"], "Mute")
        assert.strictEqual(attrs?.["aria-labelledby"], "row-3")
        assert.strictEqual(attrs?.["aria-describedby"], "mute-help")
        assert.strictEqual(Query.textOf(story.get(part("label"))), "")
      }))
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
