import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { Diagram } from "./Diagram.ts"

const classed = (name: string): Locator.Locator => ({
  description: `.${name}`,
  all: (root) =>
    Locator.elements(root).filter((node) =>
      node.attrs?.class?.split(" ").includes(name)
    )
})

const panel = (name: string) => HtmlLocator.role("group", { name })
const steps = (name: string) =>
  Locator.inside(panel(name), classed("diagram-step"))
const current = (name: string) =>
  Locator.inside(panel(name), Locator.attr("aria-current", "step"))
const announced = (name: string) =>
  Locator.inside(panel(name), Locator.attr("aria-live", "polite"))
const active = (name: string) =>
  Locator.inside(panel(name), classed("diagram-node-active"))
const activeName = (name: string) =>
  Locator.inside(active(name), classed("diagram-name"))
const send = HtmlLocator.role("button", { name: "Send Message" })

interface Pointer<E> {
  readonly click: (target: Locator.Locator) => Effect.Effect<void, E>
  readonly fire: (
    target: Locator.Locator,
    event: string,
    payload?: unknown
  ) => Effect.Effect<void, E>
}

const pick = <E>(play: Pointer<E>, name: string) => {
  const option = HtmlLocator.role("option", { name })
  return play.fire(HtmlLocator.role("combobox"), "mousedown", {
    button: 0,
    pointerType: "mouse"
  }).pipe(
    Effect.andThen(play.fire(option, "mousedown")),
    Effect.andThen(play.click(option))
  )
}

it.layer(TestHost.layer(), { buildPerTest: true })(
  "Diagram",
  (it) => {
    it.effect("lists every step before a Message is sent", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Diagram, {
          scenario: "messages"
        })
        yield* play.expect(steps("Foldkit 0.x")).toHaveCount(8)
        yield* play.expect(steps("Effect UI")).toHaveCount(3)
        yield* play.expect(Locator.attr("aria-current", "step"))
          .toBeAbsent()
        yield* play.expect(classed("diagram-node-active"))
          .toBeAbsent()
      }))

    it.effect("lists fewer Foldkit 0.x steps for a destination nearer the root", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Diagram, {
          scenario: "messages"
        })
        yield* pick(play, "A")
        yield* play.expect(steps("Foldkit 0.x")).toHaveCount(5)
        yield* play.expect(steps("Effect UI")).toHaveCount(3)
        yield* pick(play, "Root")
        yield* play.expect(steps("Foldkit 0.x")).toHaveCount(3)
        yield* play.expect(steps("Effect UI")).toHaveCount(3)
        yield* play.expect(Locator.attr("aria-current", "step"))
          .toBeAbsent()
        yield* play.click(send)
        yield* TestClock.adjust("1800 millis")
        yield* play.expect(announced("Foldkit 0.x")).toHaveText(
          "Step 3: The view runs from the root with the new Model."
        )
        yield* TestClock.adjust("900 millis")
        yield* play.expect(Locator.attr("aria-current", "step"))
          .toBeAbsent()
      }))

    it.effect("plays a Message to A1 on both sides and clears the steps after the last one", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Diagram, {
          scenario: "messages"
        })
        yield* play.click(send)
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
        yield* play.expect(classed("diagram-node-active"))
          .toBeAbsent()
        yield* play.expect(steps("Foldkit 0.x")).toHaveCount(8)
        yield* play.expect(steps("Effect UI")).toHaveCount(3)
      }))

    it.effect("selecting a step stops playback and sending another Message restarts it", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Diagram, {
          scenario: "messages"
        })
        yield* pick(play, "A2")
        yield* play.click(send)
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

        yield* play.click(send)
        yield* TestClock.adjust("500 millis")
        yield* play.click(send)
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

    it.effect("plays a change to the shared value from the picked reader", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Diagram, {
          scenario: "sharedState"
        })
        yield* pick(play, "A2")
        yield* play.expect(steps("Foldkit 0.x")).toHaveCount(8)
        yield* play.expect(steps("Effect UI")).toHaveCount(4)
        yield* play.click(
          HtmlLocator.role("button", {
            name: "Change the shared value"
          })
        )
        yield* TestClock.adjust("900 millis")
        yield* play.expect(announced("Effect UI")).toHaveText(
          "Step 2: A2's update sends a Message to the Provider."
        )
        yield* play.expect(active("Effect UI")).toHaveCount(2)
        yield* TestClock.adjust("2700 millis")
        yield* play.expect(announced("Foldkit 0.x")).toHaveText(
          "Step 5: A's update forwards the OutMessage to Root's update."
        )
        yield* play.expect(announced("Effect UI")).toHaveText(
          "Step 4: A1 and A2 read the value, so their views run again."
        )
      }))
  }
)
