import { Router } from "@effect/ui"
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { App } from "./App.ts"
import { AppRoute } from "./routes.ts"

const AppTest = (url: string) =>
  Layer.mergeAll(Router.memory({ routes: AppRoute, url }), TestHost.layer())

const playApp = HtmlPlay.make(App, Router.props(AppRoute))

const navigate = (href: string) =>
  Effect.flatMap(Router.Router, (router) => router.navigate(href))

const currentUrl = Effect.map(Router.Router, (router) => router.location().url)

const waitForSearch = TestClock.adjust("300 millis")

const heading = (name: string) => HtmlLocator.role("heading", { name })
const link = (name: string) => HtmlLocator.role("link", { name })
const searchInput = HtmlLocator.label("Search people")
const searchButton = HtmlLocator.role("button", { name: "Search" })

it.layer(AppTest("/"), { buildPerTest: true })("App", (it) => {
  it.effect("each path shows its page, sets its title and marks only its menu link as current", () =>
    Effect.gen(function*() {
      const play = yield* playApp
      const pages = [
        ["/", "Routing", "Welcome Home", "Home"],
        [
          "/nested/route/is/very/nested",
          "Nested | Routing",
          "Very Nested Route!",
          "Nested"
        ],
        ["/people", "People | Routing", "People", "People"],
        ["/people/1", "Person 1 | Routing", "Alice Johnson", null],
        ["/people/99", "Person 99 | Routing", "Person Not Found", null],
        ["/files", "Files | Routing", "Files", "Files"],
        [
          "/files/documents/resume.pdf",
          "resume.pdf | Files | Routing",
          "resume.pdf",
          null
        ],
        [
          "/files/documents/missing.txt",
          "missing.txt | Files | Routing",
          "Nothing Here",
          null
        ]
      ] as const
      for (const [url, title, name, current] of pages) {
        yield* navigate(url)
        yield* play.expect(heading(name)).toExist()
        if (current === null) {
          yield* play.expect(Locator.attr("aria-current", "page")).toBeAbsent()
        } else {
          yield* play.expect(Locator.attr("aria-current", "page")).toHaveText(
            current
          )
        }
        assert.strictEqual(play.root.head().title, title, url)
      }
    }))

  it.effect("an unmatched path and a path param that fails to decode fall back to NotFound", () =>
    Effect.gen(function*() {
      const play = yield* playApp
      for (const url of ["/missing/page", "/people/abc"]) {
        yield* navigate(url)
        yield* play.expect(heading("404 - Page Not Found")).toExist()
        yield* play.expect(Locator.text(`The path "${url}" was not found.`))
          .toExist()
        assert.strictEqual(play.root.head().title, "NotFound | Routing", url)
      }
    }))
})

it.layer(AppTest("/people?searchText=manager"), { buildPerTest: true })(
  "App at /people?searchText=manager",
  (it) => {
    it.effect("query parameters drive search, submitting updates the URL, and Back restores the input and results", () =>
      Effect.gen(function*() {
        const play = yield* playApp
        const router = yield* Router.Router
        yield* play.expect(searchInput).toHaveValue("manager")
        yield* waitForSearch
        yield* play.expect(Locator.text("1 result for “manager”")).toExist()
        yield* play.expect(link("Carol Davis Manager")).toExist()

        yield* play.type(searchInput, "designer")
        yield* play.click(searchButton)
        assert.strictEqual(yield* currentUrl, "/people?searchText=designer")
        yield* waitForSearch
        yield* play.expect(Locator.text("2 results for “designer”")).toExist()
        yield* play.expect(link("Carol Davis Manager")).toBeAbsent()

        yield* play.type(searchInput, "unsent")
        yield* router.back
        yield* play.expect(searchInput).toHaveValue("manager")
        yield* play.expect(link("Carol Davis Manager")).toExist()
        assert.strictEqual(yield* currentUrl, "/people?searchText=manager")

        yield* play.type(searchInput, "")
        yield* play.click(searchButton)
        assert.strictEqual(yield* currentUrl, "/people")
        yield* waitForSearch
        yield* play.expect(
          Locator.text("Click on any person to view their details:")
        ).toExist()
      }))
  }
)
