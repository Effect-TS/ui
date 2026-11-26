import * as Typeahead from "@effect/ui-kit/Typeahead"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"

const key = (
  key: string,
  over: Partial<Typeahead.KeyEvent> = {}
): Typeahead.KeyEvent => ({
  key,
  alt: false,
  ctrl: false,
  meta: false,
  composing: false,
  ...over
})

describe("Typeahead", () => {
  it("matches prefixes case-insensitively, skips disabled items, cycles repeated letters and handles spaces", () => {
    const items = [
      { label: "Apple" },
      { label: "Apricot", disabled: true },
      { label: "Avocado" },
      { label: "New York" },
      { label: "Eel" }
    ]

    // Prefix matching & skipping disabled items
    const s1 = Typeahead.step(Typeahead.initial, "a", items, -1)
    assert.strictEqual(s1.index, 0)
    assert.isTrue(Typeahead.isTyping(s1.state))

    const s2 = Typeahead.step(s1.state, "v", items, s1.index)
    assert.strictEqual(s2.index, 2)

    // Unmatched non-space clears the buffer
    const miss = Typeahead.step(s2.state, "z", items, s2.index)
    assert.strictEqual(miss.index, -1)
    assert.isFalse(Typeahead.isTyping(miss.state))

    // Repeated letter cycles across enabled items starting with that letter,
    // even when another letter is doubled ("Eel")
    const c1 = Typeahead.step(Typeahead.initial, "a", items, -1)
    const c2 = Typeahead.step(c1.state, "a", items, c1.index)
    const c3 = Typeahead.step(c2.state, "A", items, c2.index)
    assert.strictEqual(c1.index, 0)
    assert.strictEqual(c2.index, 2)
    assert.strictEqual(c3.index, 0)

    // Does not cycle when an enabled label starts with the doubled letter
    const doubled = [{ label: "Aaron" }, { label: "Apple" }]
    const d1 = Typeahead.step(Typeahead.initial, "a", doubled, -1)
    const d2 = Typeahead.step(d1.state, "a", doubled, d1.index)
    assert.strictEqual(d1.index, 0)
    assert.strictEqual(d2.index, 0)

    // Space mid-word stays buffered so multi-word labels match
    const w1 = Typeahead.step(Typeahead.initial, "n", items, -1)
    const w2 = Typeahead.step(w1.state, "e", items, w1.index)
    const w3 = Typeahead.step(w2.state, "w", items, w2.index)
    const w4 = Typeahead.step(w3.state, " ", items, w3.index)
    const w5 = Typeahead.step(w4.state, "y", items, w4.index)
    assert.strictEqual(w5.index, 3)

    // Empty list
    assert.strictEqual(Typeahead.step(Typeahead.initial, "a", [], -1).index, -1)
  })

  it("resets buffered text and keeps identity when already empty", () => {
    const items = [{ label: "Alpha" }, { label: "Beta" }]
    const after = Typeahead.step(Typeahead.initial, "a", items, -1).state
    const cleared = Typeahead.reset(after)
    assert.isFalse(Typeahead.isTyping(cleared))
    assert.strictEqual(Typeahead.reset(cleared), cleared)
  })

  it("guards printable keys, rejecting modifiers, non-characters and composition", () => {
    assert.isTrue(Typeahead.isPrintable(key("a")))
    assert.isTrue(Typeahead.isPrintable(key(" ")))
    assert.isFalse(Typeahead.isPrintable(key("Enter")))
    assert.isFalse(Typeahead.isPrintable(key("a", { alt: true })))
    assert.isFalse(Typeahead.isPrintable(key("a", { ctrl: true })))
    assert.isFalse(Typeahead.isPrintable(key("a", { meta: true })))
    assert.isFalse(Typeahead.isPrintable(key("a", { composing: true })))
  })

  it.effect("waitReset sleeps for default or custom delay and maps to the caller message", () =>
    Effect.gen(function*() {
      const def = Typeahead.waitReset(() => "reset")
      assert.strictEqual(def.name, "Typeahead.waitReset")
      assert.strictEqual(def.mode, "switch")

      const fiber = yield* Effect.forkChild(Typeahead.WaitReset.make().effect)
      yield* TestClock.adjust("749 millis")
      assert.isUndefined(fiber.pollUnsafe())
      yield* TestClock.adjust("1 millis")
      assert.strictEqual(def.resolve(yield* Fiber.join(fiber)), "reset")

      const custom = Typeahead.waitReset(() => "fast", 500)
      const fastFiber = yield* Effect.forkChild(
        Typeahead.WaitReset.make({ delay: 500 }).effect
      )
      yield* TestClock.adjust("499 millis")
      assert.isUndefined(fastFiber.pollUnsafe())
      yield* TestClock.adjust("1 millis")
      assert.strictEqual(custom.resolve(yield* Fiber.join(fastFiber)), "fast")
    }))
})
