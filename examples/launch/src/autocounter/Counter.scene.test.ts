import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { Counter, CounterMessage, DelayReset } from "./Counter.ts"

const count = HtmlLocator.role("status")
const reset = HtmlLocator.role("button", {
  name: "Reset in 1 second"
})

describe("Counter", () => {
  it.effect("resets after the delay", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Counter, {})
      scene.given({ count: 5, isAutoCounting: false })
        .click(reset)
        .expectExact(DelayReset)
        // Until the test resolves DelayReset, the Command counts as
        // running, so the button reads "Resetting".
        .expect(HtmlLocator.role("button", { name: "Resetting" }))
        .toExist()
        .resolve(DelayReset, CounterMessage.CompletedDelayReset())
        .expect(count).toHaveText("0")
    }))
})
