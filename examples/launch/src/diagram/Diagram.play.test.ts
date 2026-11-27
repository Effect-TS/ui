import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { Diagram } from "./Diagram.ts"

const button = (name: string | RegExp) =>
  HtmlLocator.role("button", { name })
const choice = (name: string) => HtmlLocator.role("radio", { name })
const announced = Locator.attr("aria-live", "polite")
const progress = Locator.attr("data-part", "progress")
const node = (name: string) => Locator.attr("data-node", name)
const role = Locator.attr("data-part", "role")

it.layer(TestHost.layer(), { buildPerTest: true })(
  "Diagram",
  (it) => {
    it.effect("plays through a Provider update and scrubs across steps", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Diagram, {
          scenario: "sharedState"
        })
        const playing = Locator.attr("data-active", "true")
        yield* play.click(choice("A2"))
        yield* play.expect(playing).toHaveCount(0)
        yield* play.click(button("Play"))
        yield* play.expect(playing).toHaveAccessibleName(
          "A Provider's Model holds the shared value"
        )
        yield* play.expect(progress).toHaveText("1/4")
        yield* play.expect(announced).toHaveText(
          "Step 1 of 4: A click in A2's view produces a Message."
        )
        yield* TestClock.adjust("1 second")
        yield* play.click(button("Pause"))
        yield* TestClock.adjust("5 seconds")
        yield* play.expect(progress).toHaveText("2/4")
        yield* play.click(button("Play"))
        yield* TestClock.adjust("2 seconds")
        yield* play.expect(progress).toHaveText("4/4")
        yield* TestClock.adjust("1 second")
        yield* play.expect(playing).toHaveCount(0)
        yield* play.expect(progress).toHaveText("Done")
        yield* play.expect(announced).toHaveText("Done in 4 steps.")
        yield* play.type(HtmlLocator.role("slider"), "2")
        yield* play.expect(progress).toHaveText("2/4")
        yield* play.expect(announced).toHaveText(
          "Step 2 of 4: A2's update sends a Message to the Provider."
        )
        yield* play.click(button("Back to the start"))
        yield* play.expect(announced).toHaveText("")
      }))

    it.effect("steps through a Provider update with Next and Back", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Diagram, {
          scenario: "sharedState"
        })
        yield* play.click(button("Next step"))
        yield* play.expect(announced).toHaveText(
          "Step 1 of 4: A click in A1's view produces a Message."
        )
        yield* play.click(button("Next step"))
        yield* play.expect(announced).toHaveText(
          "Step 2 of 4: A1's update sends a Message to the Provider."
        )
        yield* play.expect(Locator.inside(node("A1"), role))
          .toHaveText("update runs")
        yield* play.expect(Locator.inside(node("A"), role))
          .toHaveText("Not involved")
        yield* play.click(button("Back one step"))
        yield* play.click(button("Back one step"))
        yield* play.expect(announced).toHaveText("")
      }))
  }
)
