import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { Counter, CounterMessage } from "./Counter.ts"

describe("Counter", () => {
  it.effect("increments, decrements past zero, and resets without running commands", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Counter, {})
      assert.strictEqual(s.model.count, 0)

      s.send(CounterMessage.ClickedIncrement())
      assert.strictEqual(s.model.count, 1)
      s.expectNone()

      s.send(CounterMessage.ClickedDecrement())
        .send(CounterMessage.ClickedDecrement())
      assert.strictEqual(s.model.count, -1)
      s.expectNone()

      s.send(CounterMessage.ClickedReset())
      assert.strictEqual(s.model.count, 0)
      s.expectNone()
    }))
})
