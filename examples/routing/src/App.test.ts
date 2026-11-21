import { Router } from "@effect/ui"
import { HtmlLocator, TestGlobalEvents } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { App } from "./App.ts"
import { AppRoute } from "./routes.ts"

const AppTest = (url: string) =>
  Layer.mergeAll(Router.memory({ routes: AppRoute, url }), TestHost.layer(), TestGlobalEvents.layer)

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

const press = (key: string, modifiers: { readonly ctrl?: boolean } = {}) =>
  Effect.andThen(TestGlobalEvents.fire("document", "keydown", { key, ...modifiers }), TestHost.settle)

const recentSearches = (root: { readonly get: (locator: Locator.Locator) => TestHost.TestNode }) =>
  Locator.textOf(root.get(Locator.text("Recent searches:")).parent!)

const heading = (name: string) => HtmlLocator.role("heading", { name })
const link = (name: string) => HtmlLocator.role("link", { name })
const searchInput = HtmlLocator.label("Search people")

it.layer(AppTest("/"), { buildPerTest: true })("App at /", (it) => {
  it.effect("each path shows its page and sets its title", () =>
    Effect.gen(function*() {
      const root = yield* mountApp
      const pages = [
        ["/", "Routing", "Welcome Home"],
        ["/nested/route/is/very/nested", "Nested | Routing", "Very Nested Route!"],
        ["/people", "People | Routing", "People"],
        ["/people/1", "Person 1 | Routing", "Alice Johnson"],
        ["/people/99", "Person 99 | Routing", "Person Not Found"],
        ["/files", "Files | Routing", "Files"],
        ["/files/documents/resume.pdf", "resume.pdf | Files | Routing", "resume.pdf"],
        ["/files/documents/missing.txt", "missing.txt | Files | Routing", "Nothing Here"]
      ] as const
      for (const [url, title, name] of pages) {
        yield* navigate(url)
        assert.strictEqual(root.head().title, title)
        assert.isDefined(root.query(heading(name)), url)
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

  it.effect("file links capture the remaining path segments", () =>
    Effect.gen(function*() {
      const root = yield* mountApp
      const follow = (name: string) => navigate((root.get(link(name)) as TestHost.TestElement).attrs.href)
      yield* follow("Files")
      yield* follow("documents")
      yield* follow("taxes")
      assert.strictEqual(yield* currentUrl, "/files/documents/taxes")
      assert.strictEqual(root.head().title, "taxes | Files | Routing")
      assert.isDefined(root.query(link("2024.pdf")))
      yield* follow("documents")
      assert.strictEqual(yield* currentUrl, "/files/documents")
      assert.isDefined(root.query(link("resume.pdf")))
    }))
})

it.layer(AppTest("/missing"), { buildPerTest: true })("App keyboard shortcuts", (it) => {
  it.effect("g then a page's key goes to that page", () =>
    Effect.gen(function*() {
      yield* mountApp
      const shortcuts = [["p", "/people"], ["F", "/files"], ["n", "/nested/route/is/very/nested"], ["h", "/"]] as const
      for (const [key, url] of shortcuts) {
        yield* press("g")
        yield* press(key)
        assert.strictEqual(yield* currentUrl, url)
      }
    }))

  it.effect("a page's key alone, with Ctrl, or a second after g does nothing", () =>
    Effect.gen(function*() {
      yield* mountApp
      yield* press("p")
      yield* press("g")
      yield* press("Shift")
      yield* press("p", { ctrl: true })
      assert.strictEqual(yield* currentUrl, "/missing")
      yield* TestClock.adjust("1 second")
      yield* TestHost.settle
      yield* press("p")
      assert.strictEqual(yield* currentUrl, "/missing")
      yield* press("g")
      yield* press("x")
      yield* press("p")
      assert.strictEqual(yield* currentUrl, "/missing")
    }))
})

it.layer(AppTest("/people?searchText=manager"), { buildPerTest: true })("App at /people?searchText=manager", (it) => {
  it.effect("the query parameter drives the search, and a submitted search writes it", () =>
    Effect.gen(function*() {
      const root = yield* mountApp
      const router = yield* Router.Router
      assert.strictEqual(HtmlLocator.value(root.get(searchInput)), "manager")
      assert.isDefined(root.query(Locator.text("Searching…")))
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

      yield* router.back
      yield* TestHost.settle
      assert.strictEqual(yield* currentUrl, "/people?searchText=manager")
      assert.strictEqual(HtmlLocator.value(root.get(searchInput)), "manager")
      assert.isDefined(root.query(link("Carol Davis Manager")))
      assert.strictEqual(recentSearches(root), "Recent searches:managerdesigner")
    }))

  it.effect("recent searches outlive a visit to another page", () =>
    Effect.gen(function*() {
      const root = yield* mountApp
      yield* navigate("/people/3")
      yield* navigate("/people?searchText=dev")
      assert.strictEqual(recentSearches(root), "Recent searches:devmanager")
      yield* navigate("/people")
      assert.strictEqual(recentSearches(root), "Recent searches:devmanager")
    }))

  it.effect("keys typed in the search input are not shortcuts, and focusing it cancels a started chord", () =>
    Effect.gen(function*() {
      const root = yield* mountApp
      yield* press("g")
      Locator.fire(root.get(searchInput), "focus")
      yield* TestHost.settle
      yield* press("g")
      yield* press("h")
      assert.strictEqual(yield* currentUrl, "/people?searchText=manager")
      Locator.fire(root.get(searchInput), "blur")
      yield* TestHost.settle
      yield* press("h")
      assert.strictEqual(yield* currentUrl, "/people?searchText=manager")
      yield* press("g")
      yield* press("h")
      assert.strictEqual(yield* currentUrl, "/")
    }))

  it.effect("shortcuts work again after leaving the page with the search input focused", () =>
    Effect.gen(function*() {
      const root = yield* mountApp
      Locator.fire(root.get(searchInput), "focus")
      yield* TestHost.settle
      yield* navigate("/files")
      yield* press("g")
      yield* press("n")
      assert.strictEqual(yield* currentUrl, "/nested/route/is/very/nested")
    }))
})
