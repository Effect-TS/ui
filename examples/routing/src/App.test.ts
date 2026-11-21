import { Router } from "@effect/ui"
import { HtmlLocator } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { App } from "./App.ts"
import { AppRoute } from "./routes.ts"

const AppTest = (url: string) => Layer.mergeAll(Router.memory({ routes: AppRoute, url }), TestHost.layer())

const mountApp = Effect.gen(function*() {
  const root = yield* TestHost.mount(App, Router.props(AppRoute))
  yield* TestHost.settle
  return root
})

const navigate = Effect.fn(function*(href: string) {
  const router = yield* Router.Router
  yield* router.navigate(href)
  yield* TestHost.settle
})

const currentUrl = Effect.map(Router.Router, (router) => router.location().url)

const waitForSearch = Effect.gen(function*() {
  yield* TestClock.adjust("300 millis")
  yield* TestHost.settle
})

const heading = (name: string) => HtmlLocator.role("heading", { name })
const link = (name: string) => HtmlLocator.role("link", { name })
const searchInput = HtmlLocator.label("Search people")

it.layer(AppTest("/"), { buildPerTest: true })("App", (it) => {
  it.effect("each path shows its page, sets its title and marks only its menu link as current", () =>
    Effect.gen(function*() {
      const root = yield* mountApp
      const pages = [
        ["/", "Routing", "Welcome Home", "Home"],
        ["/nested/route/is/very/nested", "Nested | Routing", "Very Nested Route!", "Nested"],
        ["/people", "People | Routing", "People", "People"],
        ["/people/1", "Person 1 | Routing", "Alice Johnson", "People"],
        ["/people/99", "Person 99 | Routing", "Person Not Found", "People"],
        ["/files", "Files | Routing", "Files", "Files"],
        ["/files/documents/resume.pdf", "resume.pdf | Files | Routing", "resume.pdf", "Files"],
        ["/files/documents/missing.txt", "missing.txt | Files | Routing", "Nothing Here", "Files"]
      ] as const
      for (const [url, title, name, current] of pages) {
        yield* navigate(url)
        assert.strictEqual(root.head().title, title)
        assert.isDefined(root.query(heading(name)), url)
        assert.deepStrictEqual(root.all(Locator.attr("aria-current", "page")).map(Locator.textOf), [current], url)
        assert.deepStrictEqual(root.all(Locator.attr("data-active")).map(Locator.textOf), [current], url)
      }
    }))

  it.effect("an unmatched path and a path param that fails to decode fall back to NotFound", () =>
    Effect.gen(function*() {
      const root = yield* mountApp
      for (const url of ["/missing/page", "/people/abc"]) {
        yield* navigate(url)
        assert.strictEqual(root.head().title, "NotFound | Routing")
        assert.isDefined(root.query(heading("404 - Page Not Found")), url)
        assert.isDefined(root.query(Locator.text(`The path "${url}" was not found.`)), url)
      }
    }))
})

it.layer(AppTest("/people?searchText=manager"), { buildPerTest: true })("App at /people?searchText=manager", (it) => {
  it.effect("query parameters drive search, submitting updates the URL, and Back restores the input and results", () =>
    Effect.gen(function*() {
      const root = yield* mountApp
      const router = yield* Router.Router
      assert.strictEqual(HtmlLocator.value(root.get(searchInput)), "manager")
      yield* waitForSearch
      assert.isDefined(root.query(Locator.text("1 result for “manager”")))
      assert.isDefined(root.query(link("Carol Davis Manager")))

      Locator.fire(root.get(searchInput), "input", { value: "designer" })
      yield* TestHost.settle
      Locator.fire(root.get(Locator.tag("form")), "submit")
      yield* TestHost.settle
      assert.strictEqual(yield* currentUrl, "/people?searchText=designer")
      yield* waitForSearch
      assert.isDefined(root.query(Locator.text("2 results for “designer”")))
      assert.isUndefined(root.query(link("Carol Davis Manager")))

      Locator.fire(root.get(searchInput), "input", { value: "unsent" })
      yield* TestHost.settle
      yield* router.back
      yield* TestHost.settle
      assert.strictEqual(yield* currentUrl, "/people?searchText=manager")
      assert.strictEqual(HtmlLocator.value(root.get(searchInput)), "manager")
      assert.isDefined(root.query(link("Carol Davis Manager")))

      Locator.fire(root.get(searchInput), "input", { value: "" })
      yield* TestHost.settle
      Locator.fire(root.get(Locator.tag("form")), "submit")
      yield* TestHost.settle
      assert.strictEqual(yield* currentUrl, "/people")
      yield* waitForSearch
      assert.isDefined(root.query(Locator.text("Click on any person to view their details:")))
    }))
})
