import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { Architecture } from "./Architecture.ts"

const classed = (name: string): Locator.Locator => ({
  description: `.${name}`,
  all: (root) => Locator.elements(root).filter((node) => node.attrs?.class?.split(" ").includes(name))
})

const panel = (name: string) => HtmlLocator.role("group", { name })
const sentence = (name: string) => Locator.inside(panel(name), Locator.attr("aria-live", "polite"))
const progress = (name: string) => Locator.inside(panel(name), classed("arch2-progress"))
const active = (name: string) => Locator.inside(panel(name), classed("arch2-node-active"))
const activeName = (name: string) => Locator.inside(active(name), classed("arch2-name"))
const disabled = Locator.attr("disabled")

it.layer(TestHost.layer(), { buildPerTest: true })("Architecture", (it) => {
  it.effect("waits for a leaf", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Architecture, {})
      yield* play.expect(sentence("Foldkit 0.x")).toHaveText("Pick a leaf.")
      yield* play.expect(sentence("Effect UI")).toHaveText("Pick a leaf.")
      yield* play.expect(disabled).toBeAbsent()
    }))

  it.effect("plays a Message from A1 on both sides", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Architecture, {})
      yield* play.click(HtmlLocator.role("button", { name: "A1" }))
      yield* play.expect(sentence("Foldkit 0.x")).toHaveText("A1's view sends a Message.")
      yield* play.expect(sentence("Effect UI")).toHaveText("A1's view sends a Message.")
      yield* play.expect(progress("Foldkit 0.x")).toHaveText("Step 1 of 8. Components that handled the Message: 1")
      yield* play.expect(activeName("Foldkit 0.x")).toHaveText("A1")
      yield* play.expect(activeName("Effect UI")).toHaveText("A1")
      yield* play.expect(disabled).toHaveCount(4)

      yield* TestClock.adjust("899 millis")
      yield* play.expect(sentence("Foldkit 0.x")).toHaveText("A1's view sends a Message.")
      yield* TestClock.adjust("1 millis")
      yield* play.expect(sentence("Foldkit 0.x")).toHaveText("A wraps it in a Message of its own.")
      yield* play.expect(sentence("Effect UI")).toHaveText("The runtime delivers it to A1's update.")

      yield* TestClock.adjust("1800 millis")
      yield* play.expect(sentence("Foldkit 0.x")).toHaveText("Root's update passes it to A's update.")
      yield* play.expect(progress("Foldkit 0.x")).toHaveText("Step 4 of 8. Components that handled the Message: 3")
      yield* play.expect(activeName("Foldkit 0.x")).toHaveText("A")
      yield* play.expect(sentence("Effect UI")).toHaveText("The runtime stores A1's new Model, and A1's view runs.")
      yield* play.expect(progress("Effect UI")).toHaveText("Step 3 of 3, done. Components that handled the Message: 1")
      yield* play.expect(active("Effect UI")).toBeAbsent()
      yield* play.expect(disabled).toHaveCount(4)

      yield* TestClock.adjust("3600 millis")
      yield* play.expect(sentence("Foldkit 0.x")).toHaveText("The view runs from the root with the new Model.")
      yield* play.expect(active("Foldkit 0.x")).toHaveCount(7)
      yield* play.expect(disabled).toHaveCount(4)

      yield* TestClock.adjust("900 millis")
      yield* play.expect(sentence("Foldkit 0.x")).toHaveText("The view runs from the root with the new Model.")
      yield* play.expect(sentence("Effect UI")).toHaveText("The runtime stores A1's new Model, and A1's view runs.")
      yield* play.expect(progress("Foldkit 0.x")).toHaveText(
        "Step 8 of 8, done. Components that handled the Message: 3"
      )
      yield* play.expect(progress("Effect UI")).toHaveText("Step 3 of 3, done. Components that handled the Message: 1")
      yield* play.expect(classed("arch2-node-active")).toBeAbsent()
      yield* play.expect(disabled).toBeAbsent()

      yield* TestClock.adjust("5 seconds")
      yield* play.expect(progress("Foldkit 0.x")).toHaveText(
        "Step 8 of 8, done. Components that handled the Message: 3"
      )
    }))

  it.effect("plays again from another leaf", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Architecture, {})
      yield* play.click(HtmlLocator.role("button", { name: "A1" }))
      yield* TestClock.adjust("7200 millis")
      yield* play.click(HtmlLocator.role("button", { name: "B2" }))
      yield* TestClock.adjust("900 millis")
      yield* play.expect(sentence("Foldkit 0.x")).toHaveText("B wraps it in a Message of its own.")
      yield* play.expect(sentence("Effect UI")).toHaveText("The runtime delivers it to B2's update.")
      yield* play.expect(progress("Foldkit 0.x")).toHaveText("Step 2 of 8. Components that handled the Message: 2")
    }))
})
