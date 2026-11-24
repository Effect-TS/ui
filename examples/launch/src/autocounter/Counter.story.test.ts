import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { Counter, CounterMessage, DelayReset } from "./Counter.ts"

describe("Counter", () => {
  it.effect("resets after the delay", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Counter, {})
      s.given({ count: 5, isAutoCounting: false })
      s.send(CounterMessage.ClickedResetAfterDelay())
        .expectExact(DelayReset)
      s.resolve(DelayReset, CounterMessage.CompletedDelayReset())
      assert.strictEqual(s.model.count, 0)
    }))

  it.effect("counts each tick while auto-counting", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Counter, {})
      assert.deepStrictEqual(s.subscriptions, [])
      s.send(CounterMessage.ClickedToggleAutoCount())
      assert.deepStrictEqual(s.subscriptions, ["tick"])
      s.subscription("tick", CounterMessage.Ticked())
      assert.strictEqual(s.model.count, 1)
      s.send(CounterMessage.ClickedToggleAutoCount())
      assert.deepStrictEqual(s.subscriptions, [])
    }))
})
