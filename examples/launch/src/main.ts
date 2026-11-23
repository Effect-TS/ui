import { BrowserHost } from "@effect/ui/html"
// oxlint-disable-next-line no-unassigned-import
import "@effect/ui/html/register"
import { Effect, Layer } from "effect"
import { counter, kept, provider } from "virtual:snippets"
import { LaunchPage } from "./LaunchPage.ts"

const Main = BrowserHost.mount(LaunchPage, { counter, kept, provider }, document.getElementById("root")!)

Layer.launch(Main).pipe(Effect.runFork)
