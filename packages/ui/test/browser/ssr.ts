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

// An open dialog that isn't modal needs no window, so it hydrates without the iframe.
const Dialog = app.make({
  init: () => ({}),
  update: ($) => $.model,
  view: (h) => h.dialog.open(true).children("Notes")
})

const hydrates = (App: typeof Popover, selector: string) =>
  Effect.runPromise(
    ssr(App, {}).pipe(
      Effect.map(({ container, document }) => ({
        open: container.querySelector(selector) !== null,
        window: document.defaultView !== null
      })),
      Effect.scoped,
      Effect.provide(Layer.mergeAll(TestHost.layer(), TestClock.layer()))
    )
  ).catch(String)

// One page per case, so each is checked against the iframe gate on its own.
Promise.all([
  hydrates(Popover, ":popover-open"),
  hydrates(Modal, ":modal"),
  hydrates(Dialog, "dialog[open]")
]).then(([popover, modal, dialog]) => {
  Object.assign(globalThis, { results: { popover, modal, dialog } })
  document.body.setAttribute("data-ready", "")
})
