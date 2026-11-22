import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { snippet } from "./components/Flow.fixtures.ts"
import { LaunchPage } from "./LaunchPage.ts"

const heading = (name: string) => HtmlLocator.role("heading", { name })

describe("LaunchPage", () => {
  it.effect("walks from the three names to what's next", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(LaunchPage, { effect: snippet, foldkit: [snippet] })
      s.expect(heading("Foldkit's frontend continues as Effect UI")).toExist()
        .expect(Locator.text("// Where state lives", { exact: true })).toExist()
        .expect(heading("Every child's state went through its parent")).toExist()
        .expect(heading("Each component holds its own state")).toExist()
        .expect(heading("By default, state lasts as long as the component is rendered")).toExist()
        .expect(heading("Moving from Foldkit 0.x")).toExist()
        .expect(Locator.text("Tests run no effects", { exact: true })).toExist()
    }))

  it.effect("counts one open and one close in each", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(LaunchPage, { effect: snippet, foldkit: [snippet] })
      const totals = HtmlLocator.role("table", { name: "One open and one close, counted" })
      s.expect(Locator.inside(totals, Locator.text("8, all through the page's update", { exact: true }))).toExist()
        .expect(Locator.inside(totals, Locator.text("8: 6 to the Dialog, 2 to the page", { exact: true }))).toExist()
        .expect(Locator.inside(totals, Locator.text("1 Mount, 4 events, 2 prop changes", { exact: true }))).toExist()
    }))
})
