import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { Counters } from "./Counters.ts"

const counter = (id: number) => HtmlLocator.role("group", { name: `Counter ${id}` })
const countOf = (id: number) => Locator.inside(counter(id), HtmlLocator.role("status"))
const increment = (id: number) => Locator.inside(counter(id), HtmlLocator.role("button", { name: "Increment" }))
const decrement = (id: number) => Locator.inside(counter(id), HtmlLocator.role("button", { name: "Decrement" }))
const remove = (id: number) => Locator.inside(counter(id), HtmlLocator.role("button", { name: "Remove" }))
const addCounter = HtmlLocator.role("button", { name: "+ Add Counter" })

it.layer(TestHost.layer(), { buildPerTest: true })("Counters", (it) => {
  it.effect("each counter counts on its own, and a new one starts at zero", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Counters, {})
      yield* play.click(increment(1))
      yield* play.click(decrement(3))
      yield* play.expect(countOf(1)).toHaveText("1")
      yield* play.expect(countOf(2)).toHaveText("0")
      yield* play.expect(countOf(3)).toHaveText("-1")

      yield* play.click(addCounter)
      yield* play.expect(countOf(4)).toHaveText("0")
      assert.strictEqual(play.root.head().title, "Counters (4)")
    }))

  it.effect("updating and removing the middle counter keeps the outer counters' counts", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Counters, {})
      yield* play.click(increment(1))
      yield* play.click(increment(2))
      yield* play.click(increment(2))
      yield* play.click(decrement(3))
      yield* play.click(increment(2))
      yield* play.expect(countOf(1)).toHaveText("1")
      yield* play.expect(countOf(2)).toHaveText("3")
      yield* play.expect(countOf(3)).toHaveText("-1")

      yield* play.click(remove(2))
      yield* play.expect(counter(2)).toBeAbsent()
      yield* play.expect(countOf(1)).toHaveText("1")
      yield* play.expect(countOf(3)).toHaveText("-1")

      yield* play.click(increment(3))
      yield* play.click(decrement(1))
      yield* play.expect(countOf(1)).toHaveText("0")
      yield* play.expect(countOf(3)).toHaveText("0")
      assert.strictEqual(play.root.head().title, "Counters (2)")
    }))
})
