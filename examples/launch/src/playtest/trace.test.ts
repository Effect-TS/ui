import { test } from "#domain/Excerpt"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { readFileSync } from "node:fs"
import { notes } from "./PlayTest.ts"
import { type Entry, type Frame, run, sources } from "./trace.ts"

const listing = test("resets one second after the click")(
  readFileSync(
    new URL("../autocounter/Counter.play.test.ts", import.meta.url),
    "utf8"
  )
)

const textOf = (frame: Frame, tag: string) =>
  frame.nodes.find((node) => node.tag === tag)?.text

const rowOf = (entry: Entry) => [entry.at, entry.kind, entry.name]

describe("the Play test figure's trace", () => {
  it("runs the lines of the test in the listing, in order", () => {
    const lines = listing.split("\n").map((line) => line.trim())
      .filter((line) => line.includes("yield*"))
    assert.deepStrictEqual(lines, sources)
    assert.strictEqual(notes.length, sources.length)
  })

  it.effect("passes every check of the real test", () =>
    Effect.gen(function*() {
      const frames = yield* run
      assert.strictEqual(frames.length, sources.length)
      assert.deepStrictEqual(
        frames.map((frame) => frame.passed),
        [false, false, false, false, true, false, true]
      )
    }))

  it.effect("records the count, the clock and the Command after each line", () =>
    Effect.gen(function*() {
      const frames = yield* run
      assert.deepStrictEqual(
        frames.map((frame) => [
          frame.clock,
          textOf(frame, "output"),
          frame.pending.map((command) => command.name)
        ]),
        [
          [0, "0", []],
          [0, "1", []],
          [0, "1", ["DelayReset"]],
          [999, "1", ["DelayReset"]],
          [999, "1", ["DelayReset"]],
          [1000, "0", []],
          [1000, "0", []]
        ]
      )
      assert.deepStrictEqual(
        frames[5].log.map(rowOf),
        [
          [0, "Message", "ClickedIncrement"],
          [0, "Message", "ClickedResetAfterDelay"],
          [0, "CommandStarted", "DelayReset"],
          [1000, "Message", "CompletedDelayReset"],
          [1000, "CommandEnded", "DelayReset"]
        ]
      )
    }))

  it.effect("marks the element each step's locator matched", () =>
    Effect.gen(function*() {
      const frames = yield* run
      assert.deepStrictEqual(
        frames.map((frame) =>
          frame.nodes.flatMap((node) =>
            node.target === null
              ? []
              : [`${node.target}: ${node.text}`]
          )
        ),
        [
          [],
          ["increment: Increment"],
          ["reset: Resetting"],
          [],
          ["count: 1"],
          [],
          ["count: 0"]
        ]
      )
    }))
})
