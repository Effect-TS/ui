// Uses OpenTUI's test renderer so check-viewer.mjs can drive input without a terminal.
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as DevToolsHeadless from "@effect/ui-devtools/DevToolsHeadless"
import { OpenTuiTest } from "@effect/ui-opentui/testing"
import { Effect, Layer } from "effect"
import { createInterface } from "node:readline"
import { Greeter } from "../fixtures/Greeter.ts"

Effect.gen(function*() {
  const log = yield* Layer.build(
    DevToolsHeadless.layer({ server: process.argv[2] })
  )
  const app = yield* OpenTuiTest.mount(Greeter, {}).pipe(Effect.provide(log))
  const input = createInterface({ input: process.stdin })
  const lines = input[Symbol.asyncIterator]()
  while (true) {
    const line = yield* Effect.promise(() => lines.next())
    if (line.done === true) return
    yield* app.typeText(line.value)
    process.stdout.write(app.captureFrame().split("\n")[0]!.trim() + "\n")
  }
}).pipe(Effect.scoped, NodeRuntime.runMain)
