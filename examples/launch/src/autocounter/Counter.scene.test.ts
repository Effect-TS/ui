// @vitest-environment happy-dom
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { Counter, CounterMessage, DelayReset } from "./Counter.ts"

const count = HtmlLocator.role("status")
const increment = HtmlLocator.role("button", { name: "Increment" })
const reset = HtmlLocator.role("button", { name: "Reset in 1 second" })

const delayedReset = Effect.gen(function*() {
  const s = yield* HtmlScene.make(Counter, {})
  s.click(increment)
    .click(reset)
    .expectExact(DelayReset)
    .expect(HtmlLocator.role("button", { name: "Resetting" })).toExist()
    .resolve(DelayReset, CounterMessage.CompletedDelayReset())
    .expect(count).toHaveText("0")
})

describe("Counter", () => {
  it.effect("resets after the delay", () => delayedReset)
})
