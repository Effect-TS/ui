import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { type Locator, TestHost } from "@effect/ui/testing"
import { Clock, Effect, Exit, Layer, Schema } from "effect"
import { TestClock } from "effect/testing"
import { Counter } from "../autocounter/Counter.ts"

// The locators of src/autocounter/Counter.play.test.ts.
const count = HtmlLocator.role("status")
const addOne = HtmlLocator.role("button", { name: "+1" })
const reset = HtmlLocator.role("button", {
  name: "Reset in 1 second"
})

const mount = () => HtmlPlay.make(Counter, {})

type Play = Effect.Success<ReturnType<typeof mount>>

interface Step {
  /** The step's line in the test, trimmed. */
  readonly source: string
  /** The locator the step acts on or checks, by its name in the test. */
  readonly target?: readonly [string, Locator.Locator] | undefined
  readonly run: (play: Play) => Effect.Effect<void, unknown>
}

/**
 * The `yield*` lines after `HtmlPlay.make` in "resets one second after
 * the click", each run as the test runs it.
 */
const steps: ReadonlyArray<Step> = [
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
    run: (play) => play.expect(count).toHaveText("1")
  },
  {
    source: "yield* TestClock.adjust(\"1 millis\")",
    run: () => TestClock.adjust("1 millis")
  },
  {
    source: "yield* play.expect(count).toHaveText(\"0\")",
    target: ["count", count],
    run: (play) => play.expect(count).toHaveText("0")
  }
]

/** Every line the test runs, in order. */
export const sources: ReadonlyArray<string> = [
  "const play = yield* HtmlPlay.make(Counter, {})",
  ...steps.map((step) => step.source)
]

export const Node = Schema.Struct({
  depth: Schema.Number,
  tag: Schema.String,
  text: Schema.String,
  /** The name of the locator the step matched it with. */
  target: Schema.NullOr(Schema.String)
})
export type Node = typeof Node.Type

export const Entry = Schema.Struct({
  at: Schema.Number,
  kind: Schema.Literals([
    "Message",
    "CommandStarted",
    "CommandEnded"
  ]),
  name: Schema.String
})
export type Entry = typeof Entry.Type

export const Frame = Schema.Struct({
  /** The TestClock's time, in milliseconds since the test began. */
  clock: Schema.Number,
  /** The tree the test host holds, depth first. */
  nodes: Schema.Array(Node),
  /** The Command runs in flight. */
  pending: Schema.Array(
    Schema.Struct({ name: Schema.String, status: Schema.String })
  ),
  /** What the runtime logged since the test began. */
  log: Schema.Array(Entry),
  /** Whether the step was an `expect` that passed. */
  passed: Schema.Boolean
})
export type Frame = typeof Frame.Type

const elementsOf = (
  node: TestHost.TestNode,
  depth: number,
  target: Target | undefined
): ReadonlyArray<Node> =>
  node._tag === "Text" ? [] : [
    {
      depth,
      tag: node.tag,
      text: node.children.every((child) => child._tag === "Text")
        ? node.children.map((child) => child.text).join("")
        : "",
      target: node === target?.node ? target.name : null
    },
    ...node.children.flatMap((child) =>
      elementsOf(child, depth + 1, target)
    )
  ]

const logOf = (
  play: Play,
  start: number
): ReadonlyArray<Entry> =>
  play.root.log().flatMap((entry): ReadonlyArray<Entry> => {
    const at = entry.at - start
    switch (entry._tag) {
      case "Update": {
        const message = entry.message
        return typeof message === "object" && message !== null &&
            "_tag" in message && typeof message._tag === "string"
          ? [{ at, kind: "Message", name: message._tag }]
          : []
      }
      case "CommandStarted":
      case "CommandEnded":
        return [{ at, kind: entry._tag, name: entry.name }]
      default:
        return []
    }
  })

interface Target {
  readonly name: string
  readonly node: TestHost.TestNode
}

// Found before the step runs: a click can change the text a locator
// matches on, as the reset button's does.
const targetOf = (
  play: Play,
  step: Step
): Target | undefined => {
  if (step.target === undefined) return undefined
  const [name, locator] = step.target
  const node = play.root.query(locator)
  return node && { name, node }
}

const frameOf = Effect.fnUntraced(
  function*(
    play: Play,
    start: number,
    step: Step | undefined,
    target: Target | undefined
  ) {
    const now = yield* Clock.currentTimeMillis
    return {
      clock: now - start,
      nodes: play.root.container.children.flatMap((child) =>
        elementsOf(child, 0, target)
      ),
      pending: play.root.pending().flatMap((pending) =>
        pending._tag === "Command"
          ? [{ name: pending.name, status: pending.status }]
          : []
      ),
      log: logOf(play, start),
      passed: step?.source.includes(".expect(") === true
    } satisfies Frame
  }
)

/**
 * Runs the test on a fresh TestHost and TestClock, and returns the
 * state after each line: one frame per entry of `sources`. A step that
 * fails ends the run, so a shorter result means a check failed.
 */
export const run: Effect.Effect<ReadonlyArray<Frame>> = Effect.gen(
  function*() {
    const start = yield* Clock.currentTimeMillis
    const play = yield* mount()
    const frames: Array<Frame> = [
      yield* frameOf(play, start, undefined, undefined)
    ]
    for (const step of steps) {
      const target = targetOf(play, step)
      const exit = yield* Effect.exit(step.run(play))
      if (Exit.isFailure(exit)) return frames
      frames.push(yield* frameOf(play, start, step, target))
    }
    return frames
  }
).pipe(
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
