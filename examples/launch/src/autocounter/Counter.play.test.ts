import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { Counter } from "./Counter.ts"
import { Counter as SplitCounter } from "./split/Counter.ts"

const count = HtmlLocator.role("status")
const increment = HtmlLocator.role("button", { name: "Increment" })
const reset = HtmlLocator.role("button", {
  name: "Reset in 1 second"
})
const autoCount = HtmlLocator.role("button", { name: "Auto-count" })
const stop = HtmlLocator.role("button", { name: "Stop" })

it.layer(TestHost.layer(), { buildPerTest: true })(
  "Counter",
  (it) => {
    it.effect("resets one second after the click", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Counter, {})
        yield* play.click(increment)
        yield* play.click(reset)
        yield* TestClock.adjust("999 millis")
        yield* play.expect(count).toHaveText("1")
        yield* TestClock.adjust("1 millis")
        yield* play.expect(count).toHaveText("0")
      }))

    it.effect("counts once a second while auto-counting", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Counter, {})
        yield* play.click(autoCount)
        yield* TestClock.adjust("3 seconds")
        yield* play.expect(count).toHaveText("3")
        yield* play.click(stop)
        yield* TestClock.adjust("3 seconds")
        yield* play.expect(count).toHaveText("3")
      }))

    it.effect("behaves the same written in pieces", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(SplitCounter, {})
        yield* play.click(increment)
        yield* play.click(autoCount)
        yield* TestClock.adjust("2 seconds")
        yield* play.expect(count).toHaveText("3")
        yield* play.click(stop)
        yield* play.click(reset)
        yield* TestClock.adjust("1 second")
        yield* play.expect(count).toHaveText("0")
      }))
  }
)
