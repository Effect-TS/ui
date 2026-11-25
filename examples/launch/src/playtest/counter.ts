import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { Counter } from "../autocounter/Counter.ts"
import { formatMs, type Frame, record, type Step } from "./trace.ts"

// The locators of src/autocounter/Counter.play.test.ts.
const count = HtmlLocator.role("status")
const addOne = HtmlLocator.role("button", { name: "+1" })
const reset = HtmlLocator.role("button", {
  name: "Reset in 1 second"
})

const mount = HtmlPlay.make(Counter, {})

type Play = Effect.Success<typeof mount>

/**
 * The `yield*` lines after `HtmlPlay.make` in "resets one second after
 * the click", each run as the test runs it.
 */
const steps: ReadonlyArray<Step<Play, never>> = [
  {
    source: "yield* play.click(addOne)",
    target: ["addOne", addOne],
    run: (play) => play.click(addOne)
  },
  {
    source: "yield* play.click(reset)",
    target: ["reset", reset],
    run: (play) => play.click(reset)
  },
  {
    source: "yield* TestClock.adjust(\"999 millis\")",
    run: () => TestClock.adjust("999 millis")
  },
  {
    source: "yield* play.expect(count).toHaveText(\"1\")",
    target: ["count", count],
    checks: true,
    run: (play) => play.expect(count).toHaveText("1")
  },
  {
    source: "yield* TestClock.adjust(\"1 millis\")",
    run: () => TestClock.adjust("1 millis")
  },
  {
    source: "yield* play.expect(count).toHaveText(\"0\")",
    target: ["count", count],
    checks: true,
    run: (play) => play.expect(count).toHaveText("0")
  }
]

/** Every line the test runs, in order. */
export const sources: ReadonlyArray<string> = [
  "const play = yield* HtmlPlay.make(Counter, {})",
  ...steps.map((step) => step.source)
]

/** What each line of the test does, one per entry of `sources`. */
export const notes: ReadonlyArray<string> = [
  "The test mounts the real Counter on the test host. It uses no browser and no DOM.",
  "The test clicks +1. Counter receives ClickedAdd with an amount of 1, and the count is 1.",
  "The test clicks Reset. The real DelayReset Command starts and sleeps on the TestClock.",
  "The test moves the clock to 999 ms. DelayReset is still asleep.",
  "The test checks that the count is still 1.",
  "The test moves the clock one more millisecond. DelayReset finishes and resets the count.",
  "The test checks that the count is 0. The Command produced that result, not the test."
]

/** Runs the test on a fresh TestHost and TestClock. */
export const run: Effect.Effect<ReadonlyArray<Frame>> = record({
  mount,
  steps,
  facts: ({ clock, nodes, pending }) =>
    Effect.succeed([
      {
        part: "count",
        label: "Count",
        value: nodes.find((node) => node.tag === "output")?.text ??
          "–"
      },
      { part: "clock", label: "TestClock", value: formatMs(clock) },
      {
        part: "command",
        label: "DelayReset",
        value: pending.some((command) =>
            command.name === "DelayReset"
          )
          ? "Running"
          : "Not running"
      }
    ])
}).pipe(
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
