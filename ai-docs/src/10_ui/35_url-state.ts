/**
 * @title Search, filters and pagination in the URL
 *
 * Keep a search page's text, order and page number in the search, so a link
 * or a reload shows the same results. The page reads them from its route,
 * writes them with `Router.patchSearch`, and fetches with a debounced query.
 * This entry module mounts the routed app. The page is in
 * `fixtures/pages/search/SearchPage.ts`.
 */
import { Router } from "@effect/ui"
import { BrowserHost, BrowserRouter } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
// The URL is the only copy of the search. Read the files in this order:
//
// - `fixtures/routes.ts`: the `Search` route, whose search fields have
//   defaults and decode leniently
// - `fixtures/App.ts`: the root, which holds the route and keys each page by
//   its path with `AppRoute.printPath`
// - `fixtures/pages/search/SearchPage.ts`: the page, which takes its whole
//   route as props, writes the search with `Router.patchSearch` and fetches
//   with a query's `debounce` option
// - `fixtures/queries/SearchNotes.ts`: the query behind the results,
//   keyed by the whole search
import { App } from "./fixtures/App.ts"
import { AppRoute } from "./fixtures/routes.ts"

// `BrowserRouter.layer` provides `PatchSearch` with the other navigation
// Commands, so the search page's requirement is met here. A same-page
// replace, such as a keystroke's `patchSearch`, updates the route at once,
// and the address bar at most every 200 ms.
//
// A URL with a search value that doesn't decode, such as `/search?page=abc`,
// mounts with the default and the Router replaces the URL with `/search`.
const Main = BrowserHost.mount(
  App,
  Router.props(AppRoute),
  document.getElementById("app")!
).pipe(
  Layer.provide([
    BrowserRouter.layer({ routes: AppRoute }),
    FetchHttpClient.layer
  ])
)

Layer.launch(Main).pipe(Effect.runFork)
