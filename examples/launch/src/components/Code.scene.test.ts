import { bodies } from "#domain/Fold"
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
      scene.click(view)
        .expect(expanded).toHaveAccessibleName("view body, 3 lines")
        .expect(output).toExist()
        .expect(count).toBeAbsent()
        .click(init)
        .expect(expanded).toHaveCount(2)
        .expect(count).toExist()
        .click(view)
        .expect(expanded).toHaveAccessibleName("init body, 1 line")
        .expect(output).toBeAbsent()
        .expect(count).toExist()
    }))
})
