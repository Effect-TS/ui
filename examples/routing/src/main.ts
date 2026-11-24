import { Router } from "@effect/ui"
import { BrowserHost, BrowserRouter } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { App } from "./App.ts"
import { AppRoute } from "./routes.ts"

const Main = BrowserHost.mount(
  App,
  Router.props(AppRoute),
  document.getElementById("root")!
).pipe(
  Layer.provide(BrowserRouter.layer({ routes: AppRoute }))
)

Layer.launch(Main).pipe(Effect.runFork)
