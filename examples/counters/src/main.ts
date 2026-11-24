import { BrowserHost } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { Counters } from "./Counters.ts"

const Main = BrowserHost.mount(Counters, {}, document.getElementById("root")!)

Layer.launch(Main).pipe(Effect.runFork)
