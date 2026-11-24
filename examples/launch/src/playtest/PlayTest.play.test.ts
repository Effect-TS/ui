import { test } from "#domain/Excerpt"
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { readFileSync } from "node:fs"
import { PlayTest } from "./PlayTest.ts"

const snippet = {
  id: "play",
  name: "Counter.play.test.ts",
  lines: test("resets one second after the click")(
    readFileSync(
      new URL("../autocounter/Counter.play.test.ts", import.meta.url),
      "utf8"
    )
  ).split("\n").map((text) => [{ text, color: "" }]),
  folds: []
}

const slider = HtmlLocator.role("slider")
const play = HtmlLocator.role("button", { name: "Play" })
const replay = HtmlLocator.role("button", { name: "Replay" })
const count = Locator.attr("data-part", "count")
const clock = Locator.attr("data-part", "clock")
const command = Locator.attr("data-part", "command")
const current = Locator.attr("data-current")

// The figure's Command runs the whole Counter test on a TestHost of its
// own, which finishes on a later task than this host's settle waits
// for. Yield to real time until it hands its frames in.
const mount = Effect.gen(function*() {
  const view = yield* HtmlPlay.make(PlayTest, { snippet })
  for (let tries = 0; tries < 20; tries++) {
    if ((view.root.model()?.frames.length ?? 0) > 0) break
    yield* TestClock.withLive(Effect.sleep("0 millis"))
    yield* TestHost.settle
  }
  return view
})

it.layer(TestHost.layer(), { buildPerTest: true })(
  "PlayTest",
  (it) => {
    it.effect("runs the real test one line at a time with the slider", () =>
      Effect.gen(function*() {
        const view = yield* mount
        yield* view.expect(current).toBeAbsent()
        yield* view.expect(clock).toHaveText("0 ms")
        yield* view.type(slider, "1")
        yield* view.expect(current).toHaveText(
          /HtmlPlay\.make\(Counter, \{\}\)/
        )
        yield* view.expect(count).toHaveText("0")
        yield* view.type(slider, "2")
        yield* view.expect(count).toHaveText("1")
        yield* view.expect(command).toHaveText("Not running")
        yield* view.type(slider, "3")
        yield* view.expect(command).toHaveText("Running")
        yield* view.type(slider, "4")
        yield* view.expect(clock).toHaveText("999 ms")
        yield* view.expect(count).toHaveText("1")
        yield* view.expect(command).toHaveText("Running")
        yield* view.type(slider, "6")
        yield* view.expect(clock).toHaveText("1,000 ms")
        yield* view.expect(command).toHaveText("Not running")
        yield* view.type(slider, "7")
        yield* view.expect(count).toHaveText("0")
        yield* view.expect(current).toHaveText(/toHaveText\("0"\)/)
        yield* view.type(slider, "0")
        yield* view.expect(current).toBeAbsent()
        yield* view.expect(clock).toHaveText("0 ms")
      }))

    it.effect("plays to the end on its own", () =>
      Effect.gen(function*() {
        const view = yield* mount
        yield* view.click(play)
        yield* view.expect(current).toHaveText(/HtmlPlay\.make/)
        yield* TestClock.adjust("1400 millis")
        yield* view.expect(current).toHaveText(/click\(increment\)/)
        yield* TestClock.adjust("7 seconds")
        yield* view.expect(current).toHaveText(/toHaveText\("0"\)/)
        yield* view.expect(clock).toHaveText("1,000 ms")
        yield* view.click(replay)
        yield* view.expect(current).toHaveText(/HtmlPlay\.make/)
      }))
  }
)
