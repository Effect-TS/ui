// @vitest-environment happy-dom
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
// oxlint-disable-next-line no-unassigned-import
import "@effect/ui/html/register"
import { Locator } from "@effect/ui/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { props } from "./Flow.fixtures.ts"
import { Flow } from "./Flow.ts"

const step = HtmlLocator.role("button", { name: "Step" })
const reset = HtmlLocator.role("button", { name: "Reset" })
const caption = Locator.attr("class", "caption")
const lit = Locator.attr("class", "line lit")

describe("Flow", () => {
  it.effect("shows each step's caption, and lights its line", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Flow, props(), { slots: () => ({ demo: undefined }) })
      s.expect(caption).toHaveText("Press Step to start.")
        .expect(reset).toBeDisabled()
        .click(step)
        .expect(caption).toHaveText("You press the trigger.")
        .expect(lit).toBeAbsent()
        .click(step)
        .expect(caption).toHaveText("The page sets confirm to true.")
        .expect(lit).toHaveText("OpenedConfirm: (_model) => model")
        .expect(Locator.text("confirm: true", { exact: true })).toExist()
        .expect(step).toBeDisabled()
        .click(HtmlLocator.role("button", { name: "Step 1: ClickedTrigger" }))
        .expect(caption).toHaveText("You press the trigger.")
        .expect(Locator.text("confirm: false", { exact: true })).toExist()
        .click(reset)
        .expect(caption).toHaveText("Press Step to start.")
    }))

  it.effect("waits for the live dialog before it has steps", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Flow, props({ steps: [], live: true, empty: "Press Discard draft." }), {
        slots: () => ({ demo: undefined })
      })
      s.expect(caption).toHaveText("Press Discard draft.")
        .expect(Locator.text("No entries yet", { exact: true })).toExist()
        .expect(step).toBeDisabled()
    }))
})
