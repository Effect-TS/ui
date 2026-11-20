import { BrowserHost, BrowserRouter } from "@effect/ui/html"
// oxlint-disable-next-line no-unassigned-import
import "@effect/ui/html/register"
import { Effect, Layer } from "effect"
import { KeyValueStore } from "effect/persistence"
import { App, appProps } from "./App.ts"
import { AppRoute } from "./routes.ts"

// The Router and the session's storage are the only Layers here. `appProps`
// reads the route and the stored session before `App` mounts.
const Main = BrowserHost.mount(App, appProps, document.getElementById("root")!).pipe(
  Layer.provide([
    BrowserRouter.layer({ routes: AppRoute }),
    KeyValueStore.layerStorage(() => localStorage)
  ])
)

Layer.launch(Main).pipe(Effect.runFork)
