import { NodeRuntime } from "@effect/platform-node"
import * as DevToolsHeadless from "@effect/ui-devtools/DevToolsHeadless"
import { OpenTuiHost } from "@effect/ui-opentui"
import { Effect } from "effect"
import { SnakeGame } from "./SnakeGame.ts"

// Run `pnpm effect-ui-devtools` beside the game and open the URL it prints to inspect it in a browser.
OpenTuiHost.run(SnakeGame, {}).pipe(
  Effect.provide(DevToolsHeadless.layer()),
  NodeRuntime.runMain
)
