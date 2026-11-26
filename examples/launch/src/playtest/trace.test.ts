import { all, declaration, test } from "#domain/Excerpt"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { readFileSync } from "node:fs"
import { scenarios } from "./scenarios.ts"
import type { Entry, Frame } from "./trace.ts"

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8")

// What the page shows of each test, cut from the file the way
// vite.config.ts cuts it.
const listings = {
  counter: test("resets one second after the click")(
    read("../autocounter/Counter.play.test.ts")
  ),
  signIn: all(
    declaration("AppTest"),
    test(
      "a successful login saves the session and lands on the dashboard"
    )
  )(read("../../../auth/src/App.play.test.ts")),
  snake: test("steers to the apple, eats it and pauses")(
    read("../../../snake/src/SnakeGame.play.test.ts")
  )
}

const textOf = (frame: Frame, tag: string) =>
  frame.nodes.find((node) => node.tag === tag)?.text

const factOf = (frame: Frame, part: string) =>
  frame.facts.find((fact) => fact.part === part)?.value

const rowOf = (entry: Entry) => [entry.at, entry.kind, entry.name]

describe("the Play test figure's traces", () => {
  it("run the lines of the tests in the listings, in order", () => {
    for (const id of ["counter", "signIn", "snake"] as const) {
      const lines = listings[id].split("\n").map((line) =>
        line.trim()
      )
        .filter((line) => line.includes("yield*"))
      assert.deepStrictEqual(lines, scenarios[id].sources, id)
      assert.strictEqual(
        scenarios[id].notes.length,
        scenarios[id].sources.length,
        id
      )
    }
  })

  it.effect("pass every check of the real tests", () =>
    Effect.gen(function*() {
      const counter = yield* scenarios.counter.run
      assert.deepStrictEqual(
        counter.map((frame) => frame.passed),
        [false, false, false, false, true, false, true]
      )
      const signIn = yield* scenarios.signIn.run
      assert.deepStrictEqual(
        signIn.map((frame) => frame.passed),
        [false, false, false, false, false, true, true, true]
      )
      const snake = yield* scenarios.snake.run
      assert.deepStrictEqual(
        snake.map((frame) => frame.passed),
        [
          false,
          false,
          false,
          false,
          false,
          false,
          true,
          false,
          false,
          true
        ]
      )
    }))

  it.effect("record the count, the clock and the Command after each line", () =>
    Effect.gen(function*() {
      const frames = yield* scenarios.counter.run
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
        frames.map((frame) => [
          factOf(frame, "count"),
          factOf(frame, "clock"),
          factOf(frame, "command")
        ]).at(3),
        ["1", "999 ms", "Running"]
      )
      assert.deepStrictEqual(
        frames[5].log.map(rowOf),
        [
          [0, "Message", "ClickedAdd"],
          [0, "Message", "ClickedResetAfterDelay"],
          [0, "CommandStarted", "DelayReset"],
          [1000, "Message", "CompletedDelayReset"],
          [1000, "CommandEnded", "DelayReset"]
        ]
      )
    }))

  it.effect("mark the element each step's locator matched", () =>
    Effect.gen(function*() {
      const frames = yield* scenarios.counter.run
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
          ["addOne: +1"],
          ["reset: Resetting"],
          [],
          ["count: 1"],
          [],
          ["count: 0"]
        ]
      )
    }))

  it.effect("record the sign-in form, the request and where it lands", () =>
    Effect.gen(function*() {
      const frames = yield* scenarios.signIn.run
      assert.deepStrictEqual(
        frames.map((frame) => [
          factOf(frame, "clock"),
          factOf(frame, "url"),
          factOf(frame, "session"),
          textOf(frame, "h1"),
          textOf(frame, "button")
        ]),
        [
          ["0 ms", "/login", "None", "Sign In", "Sign In"],
          ["0 ms", "/login", "None", "Sign In", "Sign In"],
          ["0 ms", "/login", "None", "Sign In", "Sign In"],
          ["0 ms", "/login", "None", "Sign In", "Signing in..."],
          [
            "1,000 ms",
            "/dashboard",
            "alice",
            "Welcome back, alice!",
            undefined
          ],
          [
            "1,000 ms",
            "/dashboard",
            "alice",
            "Welcome back, alice!",
            undefined
          ],
          [
            "1,000 ms",
            "/dashboard",
            "alice",
            "Welcome back, alice!",
            undefined
          ],
          [
            "1,000 ms",
            "/dashboard",
            "alice",
            "Welcome back, alice!",
            undefined
          ]
        ]
      )
      // What was typed is in the fields, and the button is on once
      // both are filled.
      const fields = (frame: Frame) =>
        frame.nodes.filter((node) => node.tag === "input").map((
          node
        ) => node.value)
      const button = (frame: Frame) =>
        frame.nodes.find((node) => node.tag === "button")?.isDisabled
      assert.deepStrictEqual(
        frames.slice(0, 3).map((
          frame
        ) => [fields(frame), button(frame)]),
        [
          [["", ""], true],
          [["alice@example.com", ""], true],
          [["alice@example.com", "password"], false]
        ]
      )
    }))

  it.effect("record the snake's board, the game's state and the page title", () =>
    Effect.gen(function*() {
      const frames = yield* scenarios.snake.run
      assert.deepStrictEqual(
        frames.map((frame) => [
          factOf(frame, "clock"),
          factOf(frame, "state"),
          factOf(frame, "title")
        ]),
        [
          ["0 ms", "Not started", "Snake | 0 pts"],
          ["0 ms", "Playing", "Snake | 0 pts"],
          ["0 ms", "Playing", "Snake | 0 pts"],
          ["150 ms", "Playing", "Snake | 0 pts"],
          ["150 ms", "Playing", "Snake | 0 pts"],
          ["1,050 ms", "Playing", "Snake | 10 pts"],
          ["1,050 ms", "Playing", "Snake | 10 pts"],
          ["1,050 ms", "Paused", "Snake | 10 pts"],
          ["11,050 ms", "Paused", "Snake | 10 pts"],
          ["11,050 ms", "Paused", "Snake | 10 pts"]
        ]
      )
      // The board is one grid of 20 by 20 cells. The snake is three
      // cells long with one apple, and four long once it has eaten.
      const count = (frame: Frame, tone: string) =>
        frame.nodes.flatMap((node) => node.cells).filter((cell) =>
          cell === tone
        ).length
      const board = (frame: Frame) => [
        frame.nodes.filter((node) => node.columns !== null).map((
          node
        ) => [node.columns, node.cells.length]),
        count(frame, "strong"),
        count(frame, "medium"),
        count(frame, "accent")
      ]
      assert.deepStrictEqual(board(frames[0]), [[[20, 400]], 1, 2, 1])
      assert.deepStrictEqual(board(frames[5]), [[[20, 400]], 1, 3, 1])
      // Paused, it is where it was ten seconds earlier.
      const cells = (frame: Frame) =>
        frame.nodes.flatMap((node) => node.cells)
      assert.deepStrictEqual(cells(frames[9]), cells(frames[7]))
    }))
})
