import { BrowserHost, BrowserRouter } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { KeyValueStore } from "effect/persistence"
import { App, appProps } from "./App.ts"
import { SessionStore } from "./auth/services/SessionStore.ts"
import { AppRoute } from "./routes.ts"

const Main = BrowserHost.mount(App, appProps, document.getElementById("root")!)
  .pipe(
    Layer.provide([
      BrowserRouter.layer({ routes: AppRoute }),
      SessionStore.layer.pipe(
        Layer.provide(KeyValueStore.layerStorage(() => localStorage))
      )
    ])
  )

Layer.launch(Main).pipe(Effect.runFork)
