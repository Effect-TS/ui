import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { Diagram } from "./Diagram.ts"

const button = (name: string | RegExp) =>
  HtmlLocator.role("button", { name })
const announced = Locator.attr("aria-live", "polite")
const inPanel = (title: string, locator: Locator.Locator) =>
  Locator.inside(HtmlLocator.role("group", { name: title }), locator)

it.layer(TestHost.layer(), { buildPerTest: true })(
  "Diagram",
  (it) => {
    it.effect("plays Foldkit 0.x, then Effect UI, and its slider steps through both", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Diagram, {
          scenario: "sharedState"
        })
        const progress = (title: string) =>
          inPanel(title, Locator.attr("data-part", "progress"))
        const playing = Locator.attr("data-active", "true")
        yield* play.click(button("A2"))
        yield* play.expect(playing).toHaveCount(0)
        yield* play.click(button("Play"))
        yield* play.expect(playing).toHaveAccessibleName(
          "Foldkit 0.x"
        )
        yield* play.expect(progress("Foldkit 0.x")).toHaveText("1/8")
        yield* play.expect(progress("Effect UI")).toHaveText("0/4")
        yield* TestClock.adjust("7 seconds")
        yield* play.expect(progress("Foldkit 0.x")).toHaveText("8/8")
        yield* play.expect(progress("Effect UI")).toHaveText("0/4")
        yield* TestClock.adjust("1 second")
        yield* play.expect(playing).toHaveAccessibleName("Effect UI")
        yield* play.expect(progress("Foldkit 0.x")).toHaveText("Done")
        yield* play.expect(progress("Effect UI")).toHaveText("1/4")
        yield* play.expect(announced).toHaveText(
          "Effect UI, step 1 of 4: A2's view sends a Message."
        )
        yield* TestClock.adjust("10 seconds")
        yield* play.expect(playing).toHaveCount(0)
        yield* play.expect(progress("Effect UI")).toHaveText("Done")
        yield* play.expect(announced).toHaveText(
          "Foldkit 0.x took 8 steps. Effect UI took 4 steps."
        )
        yield* play.type(HtmlLocator.role("slider"), "3")
        yield* play.expect(playing).toHaveAccessibleName(
          "Foldkit 0.x"
        )
        yield* play.expect(progress("Foldkit 0.x")).toHaveText("3/8")
        yield* play.expect(progress("Effect UI")).toHaveText("0/4")
        yield* play.type(HtmlLocator.role("slider"), "10")
        yield* play.expect(progress("Effect UI")).toHaveText("2/4")
        yield* play.type(HtmlLocator.role("slider"), "0")
        yield* play.expect(announced).toHaveText("")
      }))

    it.effect("steps a Message to a nested Component with Next and Back", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(Diagram, {
          scenario: "messages"
        })
        yield* play.click(button("Next step"))
        yield* play.expect(announced).toHaveText(
          "Foldkit 0.x, step 1 of 8: A1's view sends a Message."
        )
        yield* play.click(button("Next step"))
        yield* play.expect(announced).toHaveText(
          "Foldkit 0.x, step 2 of 8: A wraps it in a Message of its own."
        )
        yield* play.click(button("Previous step"))
        yield* play.click(button("Previous step"))
        yield* play.expect(announced).toHaveText("")
        yield* play.click(button("Root"))
        yield* play.type(HtmlLocator.role("slider"), "4")
        yield* play.expect(announced).toHaveText(
          "Effect UI, step 1 of 3: Root's view sends a Message."
        )
      }))
  }
)
