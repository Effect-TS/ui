import { BrowserHost } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { Counter } from "./Counter.ts"

const Main = BrowserHost.mount(Counter, {}, document.getElementById("root")!)

Layer.launch(Main).pipe(Effect.runFork)
