import { DevTools } from "@effect/ui-devtools"
import { BrowserHost } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { Uploads } from "./Uploads.ts"

const Main = BrowserHost.mount(Uploads, {}, document.getElementById("root")!)
  .pipe(
    Layer.provide(import.meta.env.DEV ? DevTools.layer() : Layer.empty)
  )

Layer.launch(Main).pipe(Effect.runFork)
