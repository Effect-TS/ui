import { BrowserHost } from "@effect/ui/html"
// oxlint-disable-next-line no-unassigned-import
import "@effect/ui/html/register"
import { Effect, Layer } from "effect"
import { effect, foldkit } from "virtual:snippets"
import { LaunchPage } from "./LaunchPage.ts"
import { DialogTrace } from "./trace/DialogTrace.ts"

const Main = BrowserHost.mount(LaunchPage, { effect, foldkit }, document.getElementById("root")!).pipe(
  Layer.provide(DialogTrace.layer)
)

Layer.launch(Main).pipe(Effect.runFork)
