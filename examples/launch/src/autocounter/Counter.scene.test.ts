import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { Counter, CounterMessage, DelayReset } from "./Counter.ts"

const count = HtmlLocator.role("status")
const reset = HtmlLocator.role("button", {
  name: "Reset in 1 second"
})

const delayedReset = Effect.gen(function*() {
  const s = yield* HtmlScene.make(Counter, {})
  s.given({ count: 5, isAutoCounting: false })
    .click(reset)
    .expectExact(DelayReset)
    .expect(HtmlLocator.role("button", { name: "Resetting" }))
    .toExist()
    .resolve(DelayReset, CounterMessage.CompletedDelayReset())
    .expect(count).toHaveText("0")
})

describe("Counter", () => {
  it.effect("resets after the delay", () => delayedReset)
})
