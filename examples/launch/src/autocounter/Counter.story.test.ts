import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { Counter, CounterMessage, DelayReset } from "./Counter.ts"

describe("Counter", () => {
  it.effect("resets after the delay", () =>
    Effect.gen(function*() {
      // {} is Counter's props. Each step runs when it is called and
      // returns story, so the steps chain. story.model is the Model
      // after the last one.
      const story = yield* Story.make(Counter, {})
      story.given({ count: 5, isAutoCounting: false })
        .send(CounterMessage.ClickedResetAfterDelay())
        .expectExact(DelayReset)
        .resolve(DelayReset, CounterMessage.CompletedDelayReset())
      assert.strictEqual(story.model.count, 0)
    }))

  it.effect("counts each tick while auto-counting", () =>
    Effect.gen(function*() {
      const story = yield* Story.make(Counter, {})
      assert.deepStrictEqual(story.subscriptions, [])
      story.send(CounterMessage.ClickedToggleAutoCount())
      assert.deepStrictEqual(story.subscriptions, ["tick"])
      story.subscription("tick", CounterMessage.Ticked())
      assert.strictEqual(story.model.count, 1)
      story.send(CounterMessage.ClickedToggleAutoCount())
      assert.deepStrictEqual(story.subscriptions, [])
    }))
})
