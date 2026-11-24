import { NodeRuntime } from "@effect/platform-node"
import { OpenTuiHost } from "@effect/ui-opentui"
import { SnakeGame } from "./SnakeGame.ts"

OpenTuiHost.run(SnakeGame, {}).pipe(NodeRuntime.runMain)
