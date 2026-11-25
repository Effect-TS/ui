// @vitest-environment happy-dom
import { Subscription } from "@effect/ui"
import { Collapsible, CollapsibleEvents } from "@effect/ui-kit"
import { HtmlCommand } from "@effect/ui/html"
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { Nav, NavMessage } from "./Nav.ts"

// A scene doesn't run a child, so the Collapsible's event stands in
// for a press on the bar.
const press = (open: boolean) =>
  CollapsibleEvents.Toggled({ open, reason: "trigger-press" })

const sections = [
  { id: "terms", label: "Terms", isNested: false },
  {
    id: "queries",
    label: "Addition: Built-in queries",
    isNested: false
  },
  { id: "cache", label: "One cache", isNested: true }
]

const section = Subscription.keyOf(
  "section",
  sections.map(({ id }) => id)
)

const closed = Locator.attr("aria-expanded", "false")
const opened = Locator.attr("aria-expanded", "true")
const current = Locator.attr("aria-current", "location")
const queries = HtmlLocator.role("link", {
  name: "Addition: Built-in queries"
})

describe("Nav", () => {
  it.effect("lists every section in order", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Nav, { sections })
      scene.expect(
        HtmlLocator.role("navigation", { name: "On this page" })
      ).toExist()
        .expect(HtmlLocator.role("link")).toHaveCount(sections.length)
        .expect(HtmlLocator.role("list")).toHaveText(
          sections.map(({ label }) => label).join("")
        )
    }))

  it.effect("opens and closes from the bar", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Nav, { sections })
      scene.expect(closed).toHaveText("On this page")
        .childEmit(Collapsible, "sections", press(true))
        .expect(opened).toExist()
        .childEmit(Collapsible, "sections", press(false))
        .expect(closed).toExist()
    }))

  it.effect("closes when a section is chosen", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Nav, { sections })
      scene.childEmit(Collapsible, "sections", press(true))
        .expect(opened).toExist()
        .click(queries)
        .expect(closed).toExist()
    }))

  it.effect("closes on Escape and returns focus to the bar", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Nav, { sections })
      scene.childEmit(Collapsible, "sections", press(true))
        .fireDocument("keydown", { key: "Enter" }).expectIgnored()
        .fireDocument("keydown", { key: "Escape" })
        .resolve(HtmlCommand.Focus, { found: true })
        .expect(closed).toExist()
    }))

  it.effect("marks the current section and names it in the bar", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Nav, { sections })
      scene.expect(current).toBeAbsent()
        .subscription(
          section,
          NavMessage.ChangedSection({ current: "queries" })
        )
        .expect(current).toHaveText("Addition: Built-in queries")
        .expect(closed).toHaveText(
          "On this page Addition: Built-in queries"
        )
        .subscription(
          section,
          NavMessage.ChangedSection({ current: null })
        )
        .expect(current).toBeAbsent()
        .expect(closed).toHaveText("On this page")
    }))
})
