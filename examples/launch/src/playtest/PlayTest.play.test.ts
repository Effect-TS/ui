import { test } from "#domain/Excerpt"
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { readFileSync } from "node:fs"
import { PlayTest } from "./PlayTest.ts"

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8")

const snippet = (id: string, name: string, code: string) => ({
  id,
  name,
  lines: code.split("\n").map((text) => [{ text, color: "" }]),
  folds: []
})

const tests = [
  {
    id: "counter" as const,
    snippet: snippet(
      "play",
      "Counter.play.test.ts",
      test("resets one second after the click")(
        read("../autocounter/Counter.play.test.ts")
      )
    )
  },
  {
    id: "signIn" as const,
    snippet: snippet(
      "playSignIn",
      "App.play.test.ts",
      test(
        "a successful login saves the session and lands on the dashboard"
      )(
        read("../../../auth/src/App.play.test.ts")
      )
    )
  }
]

const slider = HtmlLocator.role("slider")
const play = HtmlLocator.role("button", { name: "Play" })
const replay = HtmlLocator.role("button", { name: "Replay" })
const count = Locator.attr("data-part", "count")
const clock = Locator.attr("data-part", "clock")
const command = Locator.attr("data-part", "command")
const current = Locator.attr("data-current")
const signInTab = HtmlLocator.role("tab", { name: "Sign in" })
// Inside the Sign in panel: the panel a tab leaves is removed once
// its exit has played, which needs a browser.
const inSignIn = (part: string) =>
  Locator.inside(
    HtmlLocator.role("tabpanel", { name: "Sign in" }),
    Locator.attr("data-part", part)
  )
const url = inSignIn("url")
const session = inSignIn("session")

// The figure's Command runs a whole test on a TestHost of its own,
// which finishes on a later task than this host's settle waits for.
// Yield to real time until it hands its frames in.
const loaded = Effect.fnUntraced(function*(
  view: Effect.Success<typeof mounted>
) {
  for (let tries = 0; tries < 20; tries++) {
    if ((view.root.model()?.frames.length ?? 0) > 0) break
    yield* TestClock.withLive(Effect.sleep("0 millis"))
    yield* TestHost.settle
  }
})

const mounted = HtmlPlay.make(PlayTest, { tests })

const mount = Effect.gen(function*() {
  const view = yield* mounted
  yield* loaded(view)
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

    it.effect("runs another test from its tab", () =>
      Effect.gen(function*() {
        const view = yield* mount
        yield* view.type(slider, "3")
        yield* view.click(signInTab)
        yield* loaded(view)
        // The new test starts before its first line.
        yield* view.expect(url).toHaveText("/login")
        yield* view.expect(session).toHaveText("None")
        yield* view.type(slider, "4")
        yield* view.expect(url).toHaveText("/login")
        yield* view.type(slider, "5")
        yield* view.expect(url).toHaveText("/dashboard")
        yield* view.expect(session).toHaveText("alice")
      }))

    it.effect("plays to the end on its own", () =>
      Effect.gen(function*() {
        const view = yield* mount
        yield* view.click(play)
        yield* view.expect(current).toHaveText(/HtmlPlay\.make/)
        yield* TestClock.adjust("1400 millis")
        yield* view.expect(current).toHaveText(/click\(addOne\)/)
        yield* TestClock.adjust("7 seconds")
        yield* view.expect(current).toHaveText(/toHaveText\("0"\)/)
        yield* view.expect(clock).toHaveText("1,000 ms")
        yield* view.click(replay)
        yield* view.expect(current).toHaveText(/HtmlPlay\.make/)
      }))
  }
)
