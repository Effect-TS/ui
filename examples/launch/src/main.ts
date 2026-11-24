import { DevTools } from "@effect/ui-devtools"
import { BrowserHost } from "@effect/ui/html"
// oxlint-disable-next-line no-unassigned-import
import "@effect/ui/html/register"
import { Effect, Layer } from "effect"
import { snippets } from "virtual:snippets"
import { LaunchPage } from "./LaunchPage.ts"

const Main = BrowserHost.mount(
  LaunchPage,
  { snippets },
  document.getElementById("root")!
).pipe(Layer.provide(DevTools.layer({ position: "BottomRight" })))

Layer.launch(Main).pipe(Effect.runFork)
