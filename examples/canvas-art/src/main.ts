import { BrowserHost } from "@effect/ui/html"
// oxlint-disable-next-line no-unassigned-import
import "@effect/ui/html/register"
import { Effect, Layer } from "effect"
import { CanvasArt } from "./CanvasArt.ts"

const Main = BrowserHost.mount(CanvasArt, {}, document.getElementById("root")!)

Layer.launch(Main).pipe(Effect.runFork)
