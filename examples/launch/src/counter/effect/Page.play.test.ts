import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { Page as KeptPage } from "../kept/Page.ts"
import { Page } from "./Page.ts"

const count = HtmlLocator.role("status")
const increment = HtmlLocator.role("button", { name: "Increment" })

it.layer(TestHost.layer())("Effect UI counter page", (it) => {
  it.effect("updates Counter's own Model and drops it when the counter is hidden", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(Page, {})
      yield* play.click(increment)
      yield* play.expect(count).toHaveText("1")
      yield* play.click(HtmlLocator.role("button", { name: "Hide counter" }))
      yield* play.expect(count).toBeAbsent()
      yield* play.click(HtmlLocator.role("button", { name: "Show counter" }))
      yield* play.expect(count).toHaveText("0")
    }))

  it.effect("keeps a scoped Counter's Model while it's hidden", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(KeptPage, {})
      yield* play.click(increment)
      yield* play.click(HtmlLocator.role("button", { name: "Hide counter" }))
      yield* play.expect(count).toBeAbsent()
      yield* play.click(HtmlLocator.role("button", { name: "Show counter" }))
      yield* play.expect(count).toHaveText("1")
    }))
})
