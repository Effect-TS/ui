import { Html } from "@effect/ui/html"
import { ssr } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { Cause, Effect, Exit, Layer, Schema, type Scope } from "effect"
// The `effect/testing` barrel pulls in `node:assert`.
import * as TestClock from "effect/testing/TestClock"

const Popover = Html.component({
  name: "Popover",
  model: Schema.Struct({}),
  message: Schema.Never
}).make({
  init: () => ({}),
  update: ($) => $.model,
  view: (h) => h.div.popover("manual", true).children("Cookies")
})

const Modal = Html.component({
  name: "Modal",
  model: Schema.Struct({}),
  message: Schema.Never
}).make({
  init: () => ({}),
  update: ($) => $.model,
  view: (h) => h.dialog.modal(true).children("Terms")
})

/** Reports whether the hydrated `tag` matches `selector`, or how `ssr` failed. */
const check = (
  hydrated: Effect.Effect<
    { readonly container: Element },
    unknown,
    TestHost.TestHost | Scope.Scope
  >,
  tag: string,
  selector: string
) =>
  Effect.runPromiseExit(
    hydrated.pipe(
      Effect.map((result) =>
        result.container.querySelector(tag)!.matches(selector)
      ),
      Effect.scoped,
      Effect.provide(Layer.mergeAll(TestHost.layer(), TestClock.layer()))
    )
  ).then((exit) =>
    Exit.isSuccess(exit)
      ? { matches: exit.value }
      : { failure: Cause.pretty(exit.cause).split("\n")[0] }
  )

Promise.all([
  check(ssr(Popover, {}), "div", ":popover-open"),
  check(ssr(Modal, {}), "dialog", ":modal")
]).then(([popover, modal]) => {
  Object.assign(globalThis, { results: { popover, modal } })
  document.body.setAttribute("data-ready", "")
})
