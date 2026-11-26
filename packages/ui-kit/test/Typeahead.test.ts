import * as Typeahead from "@effect/ui-kit/Typeahead"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"

describe("Typeahead", () => {
  it("repeating a letter cycles its matches unless a label starts with that letter doubled", () => {
    const indexes = (items: ReadonlyArray<Typeahead.Item>, keys: string) => {
      let state = Typeahead.initial
      let index = -1
      return Array.from(keys, (key) => {
        ;({ state, index } = Typeahead.step(state, key, items, index))
        return index
      })
    }
    const fruits = [{ label: "Apple" }, { label: "Avocado" }, { label: "Eel" }]
    assert.deepStrictEqual(indexes(fruits, "aaa"), [0, 1, 0])
    assert.deepStrictEqual(
      indexes([{ label: "Aaron" }, { label: "Apple" }], "aa"),
      [0, 0]
    )
  })

  it.effect("WaitReset waits 750 ms by default", () =>
    Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(Typeahead.WaitReset.make().effect)
      yield* TestClock.adjust("749 millis")
      assert.isUndefined(fiber.pollUnsafe())
      yield* TestClock.adjust("1 millis")
      assert.isDefined(fiber.pollUnsafe())
    }))
})
