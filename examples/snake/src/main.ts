import { Effect, Layer } from "effect"

// oxlint-disable-next-line no-unassigned-import
import "@effect/ui/html/register"
import { BrowserHost } from "@effect/ui/html"

import { SnakeGame } from "./SnakeGame.ts"

const Main = BrowserHost.mount(SnakeGame, {}, document.getElementById("root")!)

Layer.launch(Main).pipe(Effect.runFork)
