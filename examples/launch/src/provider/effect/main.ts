import { BrowserHost } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { Page } from "./Page.ts"

const root = document.getElementById("root")!
const Main = BrowserHost.mount(Page, {}, root)

Layer.launch(Main).pipe(Effect.runFork)
