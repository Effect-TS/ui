// @vitest-environment happy-dom
import { DomCommand } from "@effect/ui/html"
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { Nav, NavMessage, sections } from "./Nav.ts"

const closed = Locator.attr("aria-expanded", "false")
const opened = Locator.attr("aria-expanded", "true")
const current = Locator.attr("aria-current", "location")
const queries = HtmlLocator.role("link", {
  name: "Addition: Built-in queries"
})

describe("Nav", () => {
  it.effect("lists every section in order", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Nav, {})
      s.expect(
        HtmlLocator.role("navigation", { name: "On this page" })
      ).toExist()
        .expect(HtmlLocator.role("link")).toHaveCount(sections.length)
        .expect(HtmlLocator.role("list")).toHaveText(
          sections.map(({ label }) => label).join("")
        )
    }))

  it.effect("opens and closes from the bar", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Nav, {})
      s.expect(closed).toHaveText("On this page")
        .click(closed)
        .expect(opened).toExist()
        .click(opened)
        .expect(closed).toExist()
    }))

  it.effect("closes when a section is chosen", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Nav, {})
      s.click(closed)
        .click(queries)
        .expect(closed).toExist()
    }))

  it.effect("closes on Escape and returns focus to the bar", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Nav, {})
      s.click(closed)
        .fireDocument("keydown", { key: "Enter" }).expectIgnored()
        .fireDocument("keydown", { key: "Escape" })
        .resolve(DomCommand.Focus, { found: true })
        .expect(closed).toExist()
    }))

  it.effect("marks the current section and names it in the bar", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Nav, {})
      s.expect(current).toBeAbsent()
        .subscription(
          "section",
          NavMessage.ChangedSection({ current: "queries" })
        )
        .expect(current).toHaveText("Addition: Built-in queries")
        .expect(closed).toHaveText(
          "On this page Addition: Built-in queries"
        )
        .subscription(
          "section",
          NavMessage.ChangedSection({ current: null })
        )
        .expect(current).toBeAbsent()
        .expect(closed).toHaveText("On this page")
    }))
})
