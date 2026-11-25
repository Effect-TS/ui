import { HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Effect, Random } from "effect"
import { TestClock } from "effect/testing"
import { SnakeGame } from "./SnakeGame.ts"

const scored = Locator.text("Score: 10")
const paused = Locator.text("Paused - SPACE to continue")

it.layer(TestHost.layer(), { buildPerTest: true })("SnakeGame", (it) => {
  it.effect("steers to the apple, eats it and pauses", () =>
    Effect.gen(function*() {
      // The seed below puts the first apple one row up from the snake
      // and six cells to its right. The snake moves every 150 ms.
      const play = yield* HtmlPlay.make(SnakeGame, {})
      yield* play.keydown("document", " ")
      yield* play.keydown("document", "ArrowUp")
      yield* TestClock.adjust("150 millis")
      yield* play.keydown("document", "ArrowRight")
      yield* TestClock.adjust("900 millis")
      yield* play.expect(scored).toExist()
      yield* play.keydown("document", " ")
      yield* TestClock.adjust("10 seconds")
      yield* play.expect(paused).toExist()
    }).pipe(Random.withSeed("e")))
})
