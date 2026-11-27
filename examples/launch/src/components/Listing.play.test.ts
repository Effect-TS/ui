import type { Snippet } from "#domain/Snippet"
import { Html } from "@effect/ui/html"
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Page } from "../counter/effect/Page.ts"
import { Listing } from "./Listing.ts"

const snippet = (name: string): Snippet => ({
  id: `counter/${name}`,
  name,
  lines: Array.from({ length: 30 }, (_, index) => [
    { text: `const line${index} = ${index}`, color: "" }
  ]),
  folds: []
})

const CounterListing = Html.component({
  name: "CounterListing",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    Listing(h, {
      files: [snippet("Counter.ts"), snippet("Page.ts")],
      example: Page(h, { key: "example" }),
      whole: true
    })
})

it.layer(TestHost.layer(), { buildPerTest: true })(
  "Listing",
  (it) => {
    it.effect("renders the live counter app above whole code files", () =>
      Effect.gen(function*() {
        const play = yield* HtmlPlay.make(CounterListing, {})
        const app = HtmlLocator.role("group", {
          name: "The app, running"
        })
        const count = Locator.inside(app, HtmlLocator.role("status"))
        yield* play.expect(count).toHaveText("0")
        yield* play.click(
          Locator.inside(
            app,
            HtmlLocator.role("button", { name: "Increment" })
          )
        )
        yield* play.expect(count).toHaveText("1")
        yield* play.click(
          Locator.inside(
            app,
            HtmlLocator.role("button", { name: "Hide counter" })
          )
        )
        yield* play.expect(count).toBeAbsent()
        yield* play.expect(
          HtmlLocator.role("button", { name: "Show code" })
        ).toHaveCount(0)
      }))
  }
)
