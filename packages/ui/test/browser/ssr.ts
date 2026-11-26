import { Html } from "@effect/ui/html"
import { ssr } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { Cause, Effect, Exit, Layer, Schema } from "effect"
// The `effect/testing` barrel pulls in `node:assert`.
import * as TestClock from "effect/testing/TestClock"

const App = Html.component({
  name: "App",
  model: Schema.Struct({}),
  message: Schema.Never
}).make({
  init: () => ({}),
  update: ($) => $.model,
  view: (h) =>
    h.div(
      h.div.popover("manual", true).children("Cookies"),
      h.dialog.modal(true).children("Terms")
    )
})

Effect.runPromiseExit(
  ssr(App, {}).pipe(
    Effect.map(({ container }) => ({
      popover: container.querySelector(":popover-open") !== null,
      modal: container.querySelector(":modal") !== null
    })),
    Effect.scoped,
    Effect.provide(Layer.mergeAll(TestHost.layer(), TestClock.layer()))
  )
).then((exit) => {
  Object.assign(globalThis, {
    results: Exit.isSuccess(exit)
      ? exit.value
      : { failure: Cause.pretty(exit.cause).split("\n")[0] }
  })
  document.body.setAttribute("data-ready", "")
})
