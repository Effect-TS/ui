/**
 * @title Hydrating in the browser
 *
 * Hydrate what the server rendered with `HtmlHydrate`. This is the browser
 * entry module of the server-rendered app, served as `/client.js`.
 */
import { Router } from "@effect/ui"
import { BrowserRouter, HtmlHydrate } from "@effect/ui/html"
import { Effect } from "effect"
import { FetchHttpClient } from "effect/http"
import { App } from "./fixtures/App.ts"
import { AppRoute } from "./fixtures/routes.ts"

// Hydrate the same component with the same props, plus the server's state.
// An app that only ever mounts in the browser uses `BrowserHost.mount`, and
// doesn't carry hydration. `Router.props` reads the route from the browser's URL. Each instance then
// adopts the server's state, its Model and its query results, and its DOM
// nodes instead of rebuilding them. The query results the server shipped aren't
// fetched again.
//
// To ship root props the client cannot reconstruct, render with
// `HtmlServer.renderToHtml(C, props, { includeProps: true })` and pass
// `HtmlHydrate.decodeProps(C, state)` as the hydration props. Missing or
// invalid props fail with a `Schema.SchemaError`, leaving the server HTML unchanged.
//
// A Layer that can never be ready on the server, such as a live connection,
// is kept off it with `Component.provide(C, layer, { server: false })`. The
// server then renders that child's fallback and the client builds it fresh.
const hydrate = Effect.gen(function*() {
  const state = JSON.parse(document.getElementById("state")!.textContent!)
  const root = yield* HtmlHydrate.hydrateEffect(
    App,
    Router.props(AppRoute),
    document.getElementById("app")!,
    state
  )
  // `hydrateEffect` is `hydrate` as an Effect that returns the root. `adopted`
  // completes once every instance is live. Until then a waiting one is inert.
  // Field edits made before an instance adopts reach its handlers; clicks and
  // submits don't.
  //
  // To keep clicks and submits made before hydration starts, place an inline
  // script at the start of `<body>` with capture-phase listeners on
  // `document` for targets inside the container. If `target.closest("button")`
  // is a button the app will replay, cancel the click and record the button.
  // Leave other clicks, such as on links, alone. Cancel submits and record each
  // form with its `submitter`. Remove the listeners before `hydrateEffect`,
  // or clicks on live instances would run twice. From then on, waiting
  // instances' click handlers don't run and their forms submit natively.
  //
  // After `root.adopted`, skip anything no longer connected or enabled
  // (hydration disconnects the nodes it rebuilt). Call `click()` on each
  // recorded button, and `form.requestSubmit(submitter)` for each submit, or
  // `form.requestSubmit()` when it had no submitter. Skip a submit if its
  // recorded submitter is no longer a submit button for that form:
  // `requestSubmit` would throw; omitting the submitter would lose its name
  // and value. Replay waits for the slowest instance. If the client bundle
  // fails to load, cancelled submits leave forms doing nothing.
  yield* root.adopted
  return yield* Effect.never
}).pipe(
  Effect.scoped,
  Effect.provide([
    BrowserRouter.layer({ routes: AppRoute }),
    FetchHttpClient.layer
  ])
)

Effect.runFork(hydrate)
