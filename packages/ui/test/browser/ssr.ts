import { Html } from "@effect/ui/html"
import { ssr } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { Effect, Layer, Schema } from "effect"
// The `effect/testing` barrel pulls in `node:assert`.
import * as TestClock from "effect/testing/TestClock"

const app = Html.component({
  name: "App",
  model: Schema.Struct({}),
  message: Schema.Never
})

const Popover = app.make({
  init: () => ({}),
  update: ($) => $.model,
  view: (h) => h.div.popover("manual", true).children("Cookies")
})

const Modal = app.make({
  init: () => ({}),
  update: ($) => $.model,
  view: (h) => h.dialog.modal(true).children("Terms")
})

/** Whether `App` hydrates with an element matching `selector`, or how `ssr` failed. */
const hydrates = (App: typeof Popover, selector: string) =>
  Effect.runPromise(
    ssr(App, {}).pipe(
      Effect.map(({ container }) => container.querySelector(selector) !== null),
      Effect.scoped,
      Effect.provide(Layer.mergeAll(TestHost.layer(), TestClock.layer()))
    )
  ).catch(String)

// One page each, so each has to get the window it needs on its own.
Promise.all([
  hydrates(Popover, ":popover-open"),
  hydrates(Modal, ":modal")
]).then(([popover, modal]) => {
  Object.assign(globalThis, { results: { popover, modal } })
  document.body.setAttribute("data-ready", "")
})
