// @vitest-environment happy-dom
import * as DevToolsHeadless from "@effect/ui-devtools/DevToolsHeadless"
import * as Viewer from "@effect/ui-devtools/internal/viewer"
import { DevToolsServer } from "@effect/ui-devtools/node"
import { OpenTuiTest } from "@effect/ui-opentui/testing"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Layer, Scope } from "effect"
import { Greeter } from "./fixtures/Greeter.ts"

const until = (check: () => boolean) =>
  Effect.suspend(function loop(): Effect.Effect<void> {
    return check() ? Effect.void : Effect.andThen(
      Effect.sleep("10 millis"),
      Effect.suspend(loop)
    )
  }).pipe(Effect.timeout("3 seconds"))

describe("DevToolsViewer", () => {
  it.live("shows a terminal app's state on the server's page, follows it live, and drops it with the server", () =>
    Effect.gen(function*() {
      const port = 47760
      yield* Layer.build(DevToolsServer.layer({ port, size: 2, keep: 0 }))
      const server = DevToolsServer.url({ port })
      const scope = yield* Scope.make()
      const log = yield* Layer.buildWithScope(
        DevToolsHeadless.layer({ server }),
        scope
      )
      const app = yield* OpenTuiTest.mount(Greeter, {}).pipe(
        Effect.provide(log),
        Scope.provide(scope)
      )
      yield* app.typeText("ab")

      // Opened after SessionStarted has rolled out of the server's 2 entries.
      const page = document.createElement("div")
      document.body.appendChild(page)
      yield* Viewer.mount(page, { server, size: 2 })
      yield* until(() =>
        page.textContent.includes("\"ab\"") &&
        page.querySelector(".app")?.textContent === "Greeter"
      )

      yield* app.typeText("c")
      expect(app.captureFrame()).toContain("Hello abc")
      yield* until(() => page.textContent.includes("\"abc\""))

      yield* Scope.close(scope, Exit.void)
      yield* until(() => page.textContent.includes("Nothing logged yet"))
    }))
})
