import { Router } from "@effect/ui"
import { DevTools } from "@effect/ui-devtools"
import { BrowserRouter, HtmlHydrate } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { App } from "./App.ts"
import { bootstrapConfig } from "./bootstrap.ts"
import { AppRoute } from "./routes.ts"
import { Domains } from "./services/Domains.ts"

const Main = Layer.effectDiscard(Effect.gen(function*() {
  const root = yield* HtmlHydrate.hydrateEffect(
    App,
    Router.props(AppRoute),
    document.getElementById("app")!,
    JSON.parse(document.getElementById("state")!.textContent!)
  )
  yield* root.adopted
  document.dispatchEvent(new Event(bootstrapConfig.readyEvent))
})).pipe(
  Layer.provide([
    BrowserRouter.layer({ routes: AppRoute }),
    // A build is static files with no `/api/domains`, so it searches the
    // sample catalog in the browser.
    import.meta.env.PROD
      ? Domains.layerSample
      : Domains.layerHttp.pipe(Layer.provide(FetchHttpClient.layer)),
    DevTools.layer()
  ])
)

Layer.launch(Main).pipe(Effect.runFork)
