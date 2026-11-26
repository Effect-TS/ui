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
  // To keep those made before hydration starts, an app can print an inline
  // script at the start of `<body>` with capture-phase listeners on
  // `document` for targets inside the container. A click whose
  // `target.closest("button")` is a button the app replays is cancelled and
  // that button recorded; other clicks, such as on links, are left alone. A
  // submit is cancelled and its form recorded with its `submitter`. Remove
  // the listeners before calling `hydrateEffect`, or a click on an instance
  // that is already live would run twice. From then on a waiting instance's
  // click handlers don't run and its forms submit natively.
  //
  // After `root.adopted`, skip anything no longer connected or enabled
  // (hydration disconnects the nodes it rebuilt). Call `click()` on each
  // recorded button, and `form.requestSubmit(submitter)` for each submit, or
  // `form.requestSubmit()` when it had no submitter. Skip a submit if its
  // recorded submitter is no longer a submit button for that form:
  // `requestSubmit` throws for it, and its name and value are part of the
  // submission. Replay waits for the slowest instance, and if the client
  // bundle fails to load, the cancelled submits leave the forms doing nothing.
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
