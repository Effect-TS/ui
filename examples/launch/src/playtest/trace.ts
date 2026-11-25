import type { Locator, TestHost } from "@effect/ui/testing"
import { Clock, Effect, Exit, Schema } from "effect"

/** One line of a Play test, run as the test runs it. */
export interface Step<Play, R> {
  /** The step's line in the test, trimmed. */
  readonly source: string
  /** The locator the step acts on or checks, by a name for it. */
  readonly target?: readonly [string, Locator.Locator] | undefined
  /** Whether the line is a check, which passes or fails. */
  readonly checks?: boolean | undefined
  readonly run: (play: Play) => Effect.Effect<void, unknown, R>
}

/** How a cell of a grid is filled in. */
export const Tone = Schema.Literals([
  "empty",
  "strong",
  "medium",
  "accent"
])
export type Tone = typeof Tone.Type

export const Node = Schema.Struct({
  depth: Schema.Number,
  tag: Schema.String,
  text: Schema.String,
  /** What a field holds, or null for any other element. */
  value: Schema.NullOr(Schema.String),
  /** A field's `type` and `placeholder`, where it has them. */
  type: Schema.NullOr(Schema.String),
  placeholder: Schema.NullOr(Schema.String),
  isDisabled: Schema.Boolean,
  /**
   * For a grid of cells, such as a game's board: how many cells are in
   * a row, and how each is filled in. Null and empty for anything else.
   */
  columns: Schema.NullOr(Schema.Number),
  cells: Schema.Array(Tone),
  /** The name of the locator the step matched it with. */
  target: Schema.NullOr(Schema.String)
})
export type Node = typeof Node.Type

/** Something else the test can read, such as the clock or the URL. */
export const Fact = Schema.Struct({
  part: Schema.String,
  label: Schema.String,
  value: Schema.String
})
export type Fact = typeof Fact.Type

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

export const Pending = Schema.Struct({
  name: Schema.String,
  status: Schema.String
})
export type Pending = typeof Pending.Type

export const Frame = Schema.Struct({
  /** The TestClock's time, in milliseconds since the test began. */
  clock: Schema.Number,
  /** The tree the test host holds, depth first. */
  nodes: Schema.Array(Node),
  facts: Schema.Array(Fact),
  /** The Command runs in flight. */
  pending: Schema.Array(Pending),
  /** What the runtime logged since the test began. */
  log: Schema.Array(Entry),
  /** Whether the step was a check that passed. */
  passed: Schema.Boolean
})
export type Frame = typeof Frame.Type

type Root = TestHost.TestRoot<any, any, any>

interface Target {
  readonly name: string
  readonly node: TestHost.TestNode
}

const isDisabled = (node: TestHost.TestElement) =>
  "disabled" in node.attrs || node.attrs["aria-disabled"] === "true"

const valueOf = (node: TestHost.TestElement) => {
  if (node.tag !== "input" && node.tag !== "textarea") return null
  const value = node.props.value ?? node.attrs.value
  return typeof value === "string" ? value : ""
}

type ToneOf = (cell: TestHost.TestElement) => Tone

const isEmpty = (
  node: TestHost.TestNode
): node is TestHost.TestElement =>
  node._tag === "Element" && node.children.length === 0

// A grid is rows of the same number of empty cells. Only a test that
// says how to fill a cell in has one.
const gridOf = (
  node: TestHost.TestElement,
  toneOf: ToneOf | undefined
) => {
  const [first] = node.children
  if (
    toneOf === undefined || node.children.length < 2 ||
    first?._tag !== "Element" || first.children.length < 2
  ) return undefined
  const columns = first.children.length
  const cells = node.children.flatMap((row) =>
    row._tag === "Element" && row.children.length === columns
      ? row.children.filter(isEmpty)
      : []
  )
  return cells.length === columns * node.children.length
    ? { columns, cells: cells.map(toneOf) }
    : undefined
}

// Leaves out what a page wouldn't show: hidden elements, and empty
// ones that hold no value.
const elementsOf = (
  node: TestHost.TestNode,
  depth: number,
  target: Target | undefined,
  toneOf: ToneOf | undefined
): ReadonlyArray<Node> => {
  if (node._tag === "Text" || "hidden" in node.attrs) return []
  const value = valueOf(node)
  if (isEmpty(node) && value === null) return []
  const grid = gridOf(node, toneOf)
  return [
    {
      depth,
      tag: node.tag,
      text: node.children.every((child) => child._tag === "Text")
        ? node.children.map((child) => child.text).join("")
        : "",
      value,
      type: node.attrs.type ?? null,
      placeholder: node.attrs.placeholder ?? null,
      isDisabled: isDisabled(node),
      columns: grid?.columns ?? null,
      cells: grid?.cells ?? [],
      target: node === target?.node ? target.name : null
    },
    ...(grid === undefined
      ? node.children.flatMap((child) =>
        elementsOf(child, depth + 1, target, toneOf)
      )
      : [])
  ]
}

const logOf = (root: Root, start: number): ReadonlyArray<Entry> =>
  root.log().flatMap((entry): ReadonlyArray<Entry> => {
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

/** What a test's facts are worked out from. */
export interface Seen {
  readonly clock: number
  readonly nodes: ReadonlyArray<Node>
  readonly pending: ReadonlyArray<Pending>
}

/**
 * Runs a test's lines on the host and clock the caller provides, and
 * returns the state after each one: a frame for the mount, then one per
 * step. A step that fails ends the run, so a shorter result means a
 * check failed.
 */
export const record = <
  Play extends { readonly root: Root },
  E,
  Mounting,
  Stepping,
  Reading
>(
  options: {
    readonly mount: Effect.Effect<Play, E, Mounting>
    readonly steps: ReadonlyArray<Step<Play, Stepping>>
    readonly facts: (
      seen: Seen,
      play: Play
    ) => Effect.Effect<ReadonlyArray<Fact>, never, Reading>
    /** How a cell of the app's grid is filled in, if it has a grid. */
    readonly tone?: ((cell: TestHost.TestElement) => Tone) | undefined
  }
): Effect.Effect<
  ReadonlyArray<Frame>,
  E,
  Mounting | Stepping | Reading
> =>
  Effect.gen(function*() {
    const start = yield* Clock.currentTimeMillis
    const play = yield* options.mount
    const frameOf = Effect.fnUntraced(
      function*(
        step: Step<Play, Stepping> | undefined,
        target: Target | undefined
      ) {
        const now = yield* Clock.currentTimeMillis
        const seen: Seen = {
          clock: now - start,
          nodes: play.root.container.children.flatMap((child) =>
            elementsOf(child, 0, target, options.tone)
          ),
          pending: play.root.pending().flatMap((pending) =>
            pending._tag === "Command"
              ? [{ name: pending.name, status: pending.status }]
              : []
          )
        }
        return {
          ...seen,
          facts: yield* options.facts(seen, play),
          log: logOf(play.root, start),
          passed: step?.checks === true
        } satisfies Frame
      }
    )
    const frames: Array<Frame> = [
      yield* frameOf(undefined, undefined)
    ]
    for (const step of options.steps) {
      // Found before the step runs: a click can change the text a
      // locator matches on, as the counter's reset button's does.
      const node = step.target && play.root.query(step.target[1])
      const target = step.target && node
        ? { name: step.target[0], node }
        : undefined
      const exit = yield* Effect.exit(step.run(play))
      if (Exit.isFailure(exit)) return frames
      frames.push(yield* frameOf(step, target))
    }
    return frames
  })

export const formatMs = (ms: number) =>
  `${ms.toLocaleString("en-US")} ms`
