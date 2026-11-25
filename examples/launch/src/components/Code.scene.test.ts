import { bodies } from "#domain/Fold"
import { Collapsible, CollapsibleEvents } from "@effect/ui-kit"
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { CodeWindow } from "./Code.ts"

const code = `const init = Def.init(() => ({
  count: 0
}))

const view = Def.view((h, model) =>
  h.output.children(
    String(model.count)
  )
)`

const snippet = {
  id: "split/Counter.ts",
  name: "Counter.ts",
  lines: code.split("\n").map((text) => [{ text, color: "" }]),
  folds: bodies("init", "view")(code)
}

const init = HtmlLocator.role("button", { name: "init body, 1 line" })
const view = HtmlLocator.role("button", {
  name: "view body, 3 lines"
})
const collapsed = Locator.attr("aria-expanded", "false")
const expanded = Locator.attr("aria-expanded", "true")
const count = Locator.text("count: 0")
const output = Locator.text("String(model.count)")

// Each fold is a Collapsible, and a scene doesn't run a child's update,
// so a press on a fold's row is the event the Collapsible emits for it.
const press = (open: boolean) =>
  CollapsibleEvents.Toggled({ open, reason: "trigger-press" })

describe("CodeWindow", () => {
  it.effect("starts with each fold collapsed to a row that counts its lines", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(CodeWindow, { snippet })
      scene.expect(collapsed).toHaveCount(2)
        .expect(expanded).toBeAbsent()
        .expect(init).toHaveText("1 line")
        .expect(view).toHaveText("3 lines")
        .expect(Locator.text("const init = Def.init(() => ({"))
        .toExist()
        .expect(count).toBeAbsent()
        .expect(output).toBeAbsent()
    }))

  it.effect("expands the fold that is clicked and collapses it again", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(CodeWindow, { snippet })
      scene.childEmit(Collapsible, "fold-1", press(true))
        .expect(expanded).toHaveAccessibleName("view body, 3 lines")
        .expect(output).toExist()
        .expect(count).toBeAbsent()
        .childEmit(Collapsible, "fold-0", press(true))
        .expect(expanded).toHaveCount(2)
        .expect(count).toExist()
        .childEmit(Collapsible, "fold-1", press(false))
        .expect(expanded).toHaveAccessibleName("init body, 1 line")
        .expect(output).toBeAbsent()
        .expect(count).toExist()
    }))
})
