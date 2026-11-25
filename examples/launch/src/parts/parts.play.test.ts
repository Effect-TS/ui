import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { Details } from "./Details.ts"
import { Faq } from "./Faq.ts"

it.layer(TestHost.layer(), { buildPerTest: true })("parts", (it) => {
  it.effect("shows the answer once the question is clicked", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Faq, {})
      yield* play.expect(Locator.text("Yes, within 30 days."))
        .toBeAbsent()
      yield* play.click(
        HtmlLocator.role("button", { name: "Can I return an order?" })
      )
      yield* play.expect(Locator.text("Yes, within 30 days."))
        .toExist()
    }))

  it.effect("opens the panel its trigger controls", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Details, {})
      yield* play.expect(Locator.text("Arrives in 3 days."))
        .toBeAbsent()
      yield* play.click(
        HtmlLocator.role("button", { name: "Shipping" })
      )
      yield* play.expect(Locator.text("Arrives in 3 days.")).toExist()
      yield* play.expect(Locator.attr("aria-expanded", "true"))
        .toExist()
    }))
})
