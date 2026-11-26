import * as ListNavigation from "@effect/ui-kit/ListNavigation"
import { assert, describe, it } from "@effect/vitest"

const key = (
  key: string,
  over: Partial<ListNavigation.KeyEvent> = {}
): ListNavigation.KeyEvent => ({
  key,
  alt: false,
  ctrl: false,
  meta: false,
  shift: false,
  composing: false,
  ...over
})

describe("ListNavigation", () => {
  it("resolves target across orientations, RTL, loop modes, Home/End and empty lists", () => {
    // Vertical wrap + Home/End + non-navigation key
    assert.strictEqual(
      ListNavigation.target("ArrowDown", { at: 2, last: 2 }),
      0
    )
    assert.strictEqual(
      ListNavigation.target("ArrowUp", { at: 0, last: 2 }),
      2
    )
    assert.strictEqual(ListNavigation.target("Home", { at: 2, last: 2 }), 0)
    assert.strictEqual(ListNavigation.target("End", { at: 0, last: 2 }), 2)
    assert.isUndefined(ListNavigation.target("ArrowRight", { at: 0, last: 2 }))
    assert.isUndefined(ListNavigation.target("Enter", { at: 0, last: 2 }))

    // Horizontal LTR vs RTL
    assert.strictEqual(
      ListNavigation.target("ArrowRight", {
        at: 0,
        last: 2,
        orientation: "horizontal"
      }),
      1
    )
    assert.strictEqual(
      ListNavigation.target("ArrowLeft", {
        at: 0,
        last: 2,
        orientation: "horizontal",
        rtl: true
      }),
      1
    )
    assert.strictEqual(
      ListNavigation.target("ArrowRight", {
        at: 1,
        last: 2,
        orientation: "horizontal",
        rtl: true
      }),
      0
    )

    // Loop modes: none and escape, plus starting from -1
    assert.strictEqual(
      ListNavigation.target("ArrowDown", { at: 2, last: 2, loop: "none" }),
      2
    )
    assert.strictEqual(
      ListNavigation.target("ArrowDown", { at: 2, last: 2, loop: "escape" }),
      -1
    )
    assert.strictEqual(
      ListNavigation.target("ArrowDown", { at: -1, last: 2, loop: "escape" }),
      0
    )
    assert.strictEqual(
      ListNavigation.target("ArrowUp", { at: -1, last: 2, loop: "escape" }),
      2
    )

    // Empty list: Home/End/arrows all return -1, non-nav still returns undefined
    assert.strictEqual(ListNavigation.target("Home", { at: -1, last: -1 }), -1)
    assert.strictEqual(ListNavigation.target("End", { at: -1, last: -1 }), -1)
    assert.strictEqual(
      ListNavigation.target("ArrowDown", { at: -1, last: -1 }),
      -1
    )
    assert.isUndefined(ListNavigation.target("a", { at: -1, last: -1 }))
  })

  it("filters navigation keys with isKey, rejecting modifiers, composition and cross-axis arrows", () => {
    assert.isTrue(ListNavigation.isKey(key("ArrowDown")))
    assert.isTrue(ListNavigation.isKey(key("Home")))
    assert.isFalse(ListNavigation.isKey(key("ArrowRight")))
    assert.isTrue(ListNavigation.isKey(key("ArrowLeft"), "horizontal"))
    assert.isFalse(ListNavigation.isKey(key("ArrowDown"), "horizontal"))
    assert.isFalse(ListNavigation.isKey(key("ArrowDown", { shift: true })))
    assert.isFalse(ListNavigation.isKey(key("ArrowDown", { ctrl: true })))
    assert.isFalse(ListNavigation.isKey(key("ArrowDown", { alt: true })))
    assert.isFalse(ListNavigation.isKey(key("ArrowDown", { meta: true })))
    assert.isFalse(ListNavigation.isKey(key("ArrowDown", { composing: true })))
  })

  it("filters enabled items with available", () => {
    const items = [
      { value: "a" },
      { value: "b", disabled: true },
      undefined,
      { value: "c", disabled: false }
    ]
    assert.deepStrictEqual(
      items.filter(ListNavigation.available).map((item) => item.value),
      ["a", "c"]
    )
  })
})
