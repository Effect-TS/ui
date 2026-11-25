// A terminal app for check-viewer.mjs: a Greeter on OpenTUI's test renderer that sends its log to the
// DevTools server at argv[2]. Each line on stdin is typed into its input, and the frame's first line printed.
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
