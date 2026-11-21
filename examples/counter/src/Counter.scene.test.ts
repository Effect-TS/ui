import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { Counter } from "./Counter.ts"

const incrementButton = HtmlLocator.role("button", { name: "+" })
const decrementButton = HtmlLocator.role("button", { name: "-" })
const resetButton = HtmlLocator.role("button", { name: "Reset" })

describe("Counter", () => {
  it.effect("increments, decrements past zero, and resets via buttons", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Counter, {})
      s.expect(Locator.text("0")).toExist()
        .click(incrementButton)
        .expect(Locator.text("1")).toExist()
        .click(decrementButton)
        .click(decrementButton)
        .expect(Locator.text("-1")).toExist()
        .click(resetButton)
        .expect(Locator.text("0")).toExist()
    }))
})
