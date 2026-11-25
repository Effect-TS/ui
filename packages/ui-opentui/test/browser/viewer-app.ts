// A terminal app for check-viewer.mjs: a Greeter on OpenTUI's test renderer that sends its log to the
// DevTools server at argv[2]. Each line on stdin is typed into its input, and the frame's first line printed.
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { UiSchema } from "@effect/ui"
import * as DevToolsHeadless from "@effect/ui-devtools/DevToolsHeadless"
import { OpenTui } from "@effect/ui-opentui"
import { OpenTuiTest } from "@effect/ui-opentui/testing"
import { Effect, Layer, Schema } from "effect"
import { createInterface } from "node:readline"

const Message = UiSchema.TaggedEnum({ TypedName: { value: Schema.String } })

const Greeter = OpenTui.component({
  name: "Greeter",
  model: Schema.Struct({ name: Schema.String }),
  message: Message
}).make({
  init: () => ({ name: "" }),
  update: { TypedName: ($, { value }) => $.evolve({ name: value }) },
  view: (h, model) =>
    h.box.children(
      h.text("Hello " + model.name),
      h.input.style({ width: 20 }).value(model.name).focused(true).onInput((
        { value }
      ) => Message.TypedName({ value }))
    )
})

Effect.gen(function*() {
  const log = yield* Layer.build(
    DevToolsHeadless.layer({ server: process.argv[2] })
  )
  const app = yield* OpenTuiTest.mount(Greeter, {}).pipe(Effect.provide(log))
  const lines = createInterface({ input: process.stdin })
    [Symbol.asyncIterator]()
  while (true) {
    const line = yield* Effect.promise(() => lines.next())
    if (line.done === true) return
    yield* app.typeText(line.value)
    process.stdout.write(app.captureFrame().split("\n")[0]!.trim() + "\n")
  }
}).pipe(Effect.scoped, NodeRuntime.runMain)
