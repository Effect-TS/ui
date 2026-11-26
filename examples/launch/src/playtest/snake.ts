import type { HtmlHead } from "@effect/ui/html"
import { HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { Effect, Layer, Random } from "effect"
import { TestClock } from "effect/testing"
import { SnakeGame } from "snake/SnakeGame"
import { formatMs, type Frame, record, type Step } from "./trace.ts"

// The locators of examples/snake/src/SnakeGame.play.test.ts.
const scored = Locator.text("Score: 10")
const paused = Locator.text("Paused - SPACE to continue")

const mount = HtmlPlay.make(SnakeGame, {})

type Play = Effect.Success<typeof mount>

/**
 * The `yield*` lines after `HtmlPlay.make` in "steers to the apple,
 * eats it and pauses", each run as the test runs it.
 */
const steps: ReadonlyArray<Step<Play, never>> = [
  {
    source: "yield* play.keydown(\"document\", \" \")",
    run: (play) => play.keydown("document", " ")
  },
  {
    source: "yield* play.keydown(\"document\", \"ArrowUp\")",
    run: (play) => play.keydown("document", "ArrowUp")
  },
  {
    source: "yield* TestClock.adjust(\"150 millis\")",
    run: () => TestClock.adjust("150 millis")
  },
  {
    source: "yield* play.keydown(\"document\", \"ArrowRight\")",
    run: (play) => play.keydown("document", "ArrowRight")
  },
  {
    source: "yield* TestClock.adjust(\"900 millis\")",
    run: () => TestClock.adjust("900 millis")
  },
  {
    source: "yield* play.expect(scored).toExist()",
    target: ["scored", scored],
    checks: true,
    run: (play) => play.expect(scored).toExist()
  },
  {
    source: "yield* play.keydown(\"document\", \" \")",
    run: (play) => play.keydown("document", " ")
  },
  {
    source: "yield* TestClock.adjust(\"10 seconds\")",
    run: () => TestClock.adjust("10 seconds")
  },
  {
    source: "yield* play.expect(paused).toExist()",
    target: ["paused", paused],
    checks: true,
    run: (play) => play.expect(paused).toExist()
  }
]

/** Every line the test runs, in order. */
export const sources: ReadonlyArray<string> = [
  "const play = yield* HtmlPlay.make(SnakeGame, {})",
  ...steps.map((step) => step.source)
]

/** What each line of the test does, one per entry of `sources`. */
export const notes: ReadonlyArray<string> = [
  "The test mounts the real game on the test host. A seed fixes where the apple appears.",
  "The test presses Space on the document, where the game listens for keys. The game starts.",
  "The test presses the up arrow. The snake turns on its next move.",
  "The test moves the clock 150 ms, which is one move. The snake has turned up.",
  "The test presses the right arrow. The snake turns on its next move.",
  "The test moves the clock 900 ms, which is six moves. The snake reaches the apple and grows, and a new apple appears.",
  "The test checks that the score is 10.",
  "The test presses Space. The game pauses.",
  "The test moves the clock ten seconds. The snake doesn't move.",
  "The test checks that the game is still paused."
]

// What the game says about itself, without the keys to press.
const stateOf = (texts: ReadonlyArray<string>) =>
  texts.find((text) => text.includes("SPACE"))?.replace(
    / ?-? ?(Press )?SPACE.*/,
    ""
  ) || "Not started"

/** Runs the test on a fresh TestHost and TestClock, with its seed. */
export const run: Effect.Effect<ReadonlyArray<Frame>> = record({
  mount,
  steps,
  // The classes examples/snake gives the snake's head, its body and
  // the apple.
  tone: (cell) => {
    const classes = cell.attrs.class ?? ""
    return classes.includes("bg-green-700")
      ? "strong"
      : classes.includes("bg-green-500")
      ? "medium"
      : classes.includes("bg-red-500")
      ? "accent"
      : "empty"
  },
  facts: ({ clock, nodes }, play) =>
    Effect.succeed([
      { part: "clock", label: "TestClock", value: formatMs(clock) },
      {
        part: "state",
        label: "Game",
        value: stateOf(nodes.map((node) => node.text))
      },
      {
        part: "title",
        label: "Page title",
        value: play.root.head<HtmlHead.HtmlHead>().title ?? ""
      }
    ])
}).pipe(
  Random.withSeed("e"),
  Effect.scoped,
  Effect.provide(
    Layer.mergeAll(
      TestHost.layer({ flush: "queued" }),
      TestClock.layer()
    )
  ),
  Effect.orElseSucceed(() => []),
  Effect.catchDefect(() => Effect.succeed([]))
)
