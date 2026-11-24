import { BrowserHost } from "@effect/ui/html"
// oxlint-disable-next-line no-unassigned-import
import "@effect/ui/html/register"
import { DevTools } from "@effect/ui-devtools"
import { Effect, Layer } from "effect"
import { Uploads } from "./Uploads.ts"

const Main = BrowserHost.mount(Uploads, {}, document.getElementById("root")!)
  .pipe(
    Layer.provide(import.meta.env.DEV ? DevTools.layer() : Layer.empty)
  )

Layer.launch(Main).pipe(Effect.runFork)
