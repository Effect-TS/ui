// @vitest-environment happy-dom
import { UiSchema } from "@effect/ui"
import * as DevToolsHeadless from "@effect/ui-devtools/DevToolsHeadless"
import * as Viewer from "@effect/ui-devtools/internal/viewer"
import { DevToolsServer } from "@effect/ui-devtools/node"
import { OpenTui } from "@effect/ui-opentui"
import { OpenTuiTest } from "@effect/ui-opentui/testing"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"

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

const until = (check: () => boolean) =>
  Effect.suspend(function loop(): Effect.Effect<void> {
    return check() ? Effect.void : Effect.andThen(
      Effect.sleep("10 millis"),
      Effect.suspend(loop)
    )
  }).pipe(Effect.timeout("3 seconds"))

describe("DevToolsViewer", () => {
  it.live("shows a terminal app's state on the server's page, then follows it live", () =>
    Effect.gen(function*() {
      const port = 47751
      yield* Layer.build(DevToolsServer.layer({ port }))
      const server = DevToolsServer.url({ port })
      const log = yield* Layer.build(DevToolsHeadless.layer({ server }))
      const app = yield* OpenTuiTest.mount(Greeter, {}).pipe(
        Effect.provide(log)
      )
      yield* app.typeText("ab")

      const page = document.createElement("div")
      document.body.appendChild(page)
      yield* Viewer.mount(page, { server, size: 1_000 })
      yield* until(() => page.textContent.includes("\"ab\""))

      yield* app.typeText("c")
      expect(app.captureFrame()).toContain("Hello abc")
      yield* until(() => page.textContent.includes("\"abc\""))
    }))
})
