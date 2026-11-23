import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { WidgetPage } from "./WidgetPage.ts"

const breakWidget = HtmlLocator.role("button", { name: "Break the widget" })

it.layer(TestHost.layer())("Effect UI failure boundary", (it) => {
  it.effect("keeps the sibling Counter working after Widget fails, and restarts Widget under a new key", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(WidgetPage, {})
      yield* play.click(breakWidget)
      yield* play.expect(HtmlLocator.role("alert")).toHaveText("The widget failed.Restart the widget")
      yield* play.expect(breakWidget).toBeAbsent()
      yield* play.click(HtmlLocator.role("button", { name: "Increment" }))
      yield* play.expect(HtmlLocator.role("status")).toHaveText("1")
      yield* play.click(HtmlLocator.role("button", { name: "Restart the widget" }))
      yield* play.expect(breakWidget).toExist()
      yield* play.expect(HtmlLocator.role("status")).toHaveText("1")
    }))
})
