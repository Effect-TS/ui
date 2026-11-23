import { Component, Subscription } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema, Stream } from "effect"
import { CounterMessage, DelayReset } from "../Counter.ts"

const CounterDef = Component.define({
  name: "Counter",
  scoped: false,
  model: Schema.Struct({ count: Schema.Number, isAutoCounting: Schema.Boolean }),
  message: CounterMessage,
  elements: Html
})

type Model = typeof CounterDef.model.Type

const init = (): Model => ({ count: 0, isAutoCounting: false })

const increment = CounterDef.update((_model, _message, $) => $.evolve({ count: (count) => count + 1 }))

const resetAfterDelay = CounterDef.update(
  "ClickedResetAfterDelay",
  (_model, _message, $) => $.run(DelayReset.make({}))
)

const subscriptions = (model: Model) => [
  model.isAutoCounting &&
  Subscription.make("tick", Stream.tick("1 second").pipe(Stream.drop(1), Stream.map(() => CounterMessage.Ticked())))
]

const view = CounterDef.view((model, h) =>
  h.div.class("counter").children(
    h.output.class("count").children(String(model.count)),
    h.button.onClick(CounterMessage.ClickedIncrement()).children("Increment"),
    h.button.onClick(CounterMessage.ClickedResetAfterDelay()).children(
      h.isRunning(DelayReset) ? "Resetting" : "Reset in 1 second"
    ),
    h.button.onClick(CounterMessage.ClickedToggleAutoCount()).children(
      model.isAutoCounting ? "Stop" : "Auto-count"
    )
  )
)

export const Counter = CounterDef.make({
  init,
  update: {
    ClickedIncrement: increment,
    ClickedResetAfterDelay: resetAfterDelay,
    CompletedDelayReset: (_model, _message, $) => $.evolve({ count: 0 }),
    ClickedToggleAutoCount: (_model, _message, $) => $.evolve({ isAutoCounting: (isAutoCounting) => !isAutoCounting }),
    Ticked: increment
  },
  subscriptions,
  view
})
