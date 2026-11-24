import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { Counter, CounterMessage } from "./Counter.ts"

describe("Counter", () => {
  it.effect("increments, decrements past zero, and resets", () =>
    Effect.gen(function*() {
      const story = yield* Story.make(Counter, {})
      assert.strictEqual(story.model.count, 0)

      story.send(CounterMessage.ClickedIncrement())
      assert.strictEqual(story.model.count, 1)

      story.send(CounterMessage.ClickedDecrement())
        .send(CounterMessage.ClickedDecrement())
      assert.strictEqual(story.model.count, -1)

      story.send(CounterMessage.ClickedReset())
      assert.strictEqual(story.model.count, 0)
    }))
})
