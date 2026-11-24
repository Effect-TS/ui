import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { Architecture } from "./Architecture.ts"

const classed = (name: string): Locator.Locator => ({
  description: `.${name}`,
  all: (root) =>
    Locator.elements(root).filter((node) =>
      node.attrs?.class?.split(" ").includes(name)
    )
})

const panel = (name: string) => HtmlLocator.role("group", { name })
const steps = (name: string) =>
  Locator.inside(panel(name), classed("arch2-step"))
const current = (name: string) =>
  Locator.inside(panel(name), Locator.attr("aria-current", "step"))
const announced = (name: string) =>
  Locator.inside(panel(name), Locator.attr("aria-live", "polite"))
const active = (name: string) =>
  Locator.inside(panel(name), classed("arch2-node-active"))
const activeName = (name: string) =>
  Locator.inside(active(name), classed("arch2-name"))

it.layer(TestHost.layer(), { buildPerTest: true })(
  "Architecture",
  (it) => {
    it.effect("lists every step before a Message is sent", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Architecture, {})
        yield* play.expect(steps("Foldkit 0.x")).toHaveCount(8)
        yield* play.expect(steps("Effect UI")).toHaveCount(3)
        yield* play.expect(Locator.attr("aria-current", "step"))
          .toBeAbsent()
        yield* play.expect(classed("arch2-node-active")).toBeAbsent()
      }))

    it.effect("lists fewer Foldkit 0.x steps for a sender nearer the root", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Architecture, {})
        yield* play.click(HtmlLocator.role("button", { name: "A" }))
        yield* play.expect(steps("Foldkit 0.x")).toHaveCount(5)
        yield* play.expect(steps("Effect UI")).toHaveCount(3)
        yield* play.click(
          HtmlLocator.role("button", { name: "Root" })
        )
        yield* play.expect(steps("Foldkit 0.x")).toHaveCount(3)
        yield* play.expect(steps("Effect UI")).toHaveCount(3)
        yield* TestClock.adjust("1800 millis")
        yield* play.expect(announced("Foldkit 0.x")).toHaveText(
          "Step 3: The view runs from the root with the new Model."
        )
        yield* TestClock.adjust("900 millis")
        yield* play.expect(Locator.attr("aria-current", "step"))
          .toBeAbsent()
      }))

    it.effect("plays a Message from A1 on both sides and clears the steps after the last one", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Architecture, {})
        yield* play.click(HtmlLocator.role("button", { name: "A1" }))
        yield* play.expect(announced("Foldkit 0.x")).toHaveText(
          "Step 1: A1's view sends a Message."
        )
        yield* play.expect(announced("Effect UI")).toHaveText(
          "Step 1: A1's view sends a Message."
        )
        yield* play.expect(activeName("Foldkit 0.x")).toHaveText("A1")
        yield* play.expect(activeName("Effect UI")).toHaveText("A1")

        yield* TestClock.adjust("899 millis")
        yield* play.expect(announced("Foldkit 0.x")).toHaveText(
          "Step 1: A1's view sends a Message."
        )
        yield* TestClock.adjust("1 millis")
        yield* play.expect(announced("Foldkit 0.x")).toHaveText(
          "Step 2: A wraps it in a Message of its own."
        )
        yield* play.expect(announced("Effect UI")).toHaveText(
          "Step 2: The runtime delivers it to A1's update."
        )

        yield* TestClock.adjust("1800 millis")
        yield* play.expect(announced("Foldkit 0.x")).toHaveText(
          "Step 4: Root's update passes it to A's update."
        )
        yield* play.expect(activeName("Foldkit 0.x")).toHaveText("A")
        yield* play.expect(announced("Effect UI")).toHaveText(
          "Step 3: The runtime stores A1's new Model, and A1's view runs."
        )
        yield* play.expect(activeName("Effect UI")).toHaveText("A1")

        yield* TestClock.adjust("3600 millis")
        yield* play.expect(announced("Foldkit 0.x")).toHaveText(
          "Step 8: The view runs from the root with the new Model."
        )
        yield* play.expect(active("Foldkit 0.x")).toHaveCount(4)

        yield* TestClock.adjust("899 millis")
        yield* play.expect(current("Foldkit 0.x")).toHaveCount(1)
        yield* play.expect(current("Effect UI")).toHaveCount(1)
        yield* TestClock.adjust("1 millis")
        yield* play.expect(Locator.attr("aria-current", "step"))
          .toBeAbsent()
        yield* play.expect(classed("arch2-node-active")).toBeAbsent()
        yield* play.expect(steps("Foldkit 0.x")).toHaveCount(8)
        yield* play.expect(steps("Effect UI")).toHaveCount(3)
      }))

    it.effect("selecting a step stops playback and sending another Message restarts it", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Architecture, {})
        yield* play.click(HtmlLocator.role("button", { name: "A2" }))
        yield* TestClock.adjust("900 millis")
        yield* play.click(
          Locator.inside(
            panel("Foldkit 0.x"),
            HtmlLocator.role("button", {
              name: /Root's update passes it to A's update/
            })
          )
        )
        yield* play.expect(announced("Foldkit 0.x")).toHaveText(
          "Step 4: Root's update passes it to A's update."
        )
        yield* play.expect(activeName("Foldkit 0.x")).toHaveText("A")
        yield* play.expect(announced("Effect UI")).toHaveText(
          "Step 2: The runtime delivers it to A2's update."
        )

        yield* TestClock.adjust("5 seconds")
        yield* play.expect(announced("Foldkit 0.x")).toHaveText(
          "Step 4: Root's update passes it to A's update."
        )
        yield* play.expect(announced("Effect UI")).toHaveText(
          "Step 2: The runtime delivers it to A2's update."
        )

        yield* play.click(HtmlLocator.role("button", { name: "A1" }))
        yield* TestClock.adjust("500 millis")
        yield* play.click(HtmlLocator.role("button", { name: "A2" }))
        yield* TestClock.adjust("899 millis")
        yield* play.expect(announced("Foldkit 0.x")).toHaveText(
          "Step 1: A2's view sends a Message."
        )
        yield* TestClock.adjust("1 millis")
        yield* play.expect(announced("Foldkit 0.x")).toHaveText(
          "Step 2: A wraps it in a Message of its own."
        )
        yield* play.expect(announced("Effect UI")).toHaveText(
          "Step 2: The runtime delivers it to A2's update."
        )
      }))
  }
)
