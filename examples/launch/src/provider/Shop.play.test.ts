import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { Shop } from "./Shop.ts"

it.layer(TestHost.layer(), { buildPerTest: true })("Shop", (it) => {
  it.effect("counts an item added from inside a Product", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Shop, {})
      yield* play.expect(HtmlLocator.role("status"))
        .toHaveText("0 in cart")
      yield* play.click(
        HtmlLocator.role("button", { name: "Add to cart" })
      )
      yield* play.expect(HtmlLocator.role("status"))
        .toHaveText("1 in cart")
    }))
})
