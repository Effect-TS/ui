import { Component, Subscription } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema, Stream } from "effect"
import { CounterMessage, DelayReset } from "../Counter.ts"

const CounterDef = Component.define({
  name: "Counter",
  scoped: false,
  model: Schema.Struct({
    count: Schema.Number,
    isAutoCounting: Schema.Boolean
  }),
  message: CounterMessage,
  elements: Html
})

const init = CounterDef.init(() => ({
  count: 0,
  isAutoCounting: false
}))

const update = CounterDef.update(($, message) =>
  CounterMessage.match(message, {
    ClickedIncrement: () => $.evolve({ count: (count) => count + 1 }),
    ClickedResetAfterDelay: () => $.run(DelayReset.make({})),
    CompletedDelayReset: () => $.evolve({ count: 0 }),
    ClickedToggleAutoCount: () =>
      $.evolve({
        isAutoCounting: (isAutoCounting) => !isAutoCounting
      }),
    Ticked: () => $.evolve({ count: (count) => count + 1 })
  })
)

const subscriptions = CounterDef.subscriptions(({ model }) => [
  model.isAutoCounting &&
  Subscription.make(
    "tick",
    Stream.tick("1 second").pipe(
      Stream.drop(1),
      Stream.map(() => CounterMessage.Ticked())
    )
  )
])

const view = CounterDef.view((h, model) =>
  h.div.class("counter").children(
    h.output.class("count").children(String(model.count)),
    h.button
      .onClick(CounterMessage.ClickedIncrement())
      .children("Increment"),
    h.button
      .onClick(CounterMessage.ClickedResetAfterDelay())
      .children(
        h.isRunning(DelayReset) ? "Resetting" : "Reset in 1 second"
      ),
    h.button
      .onClick(CounterMessage.ClickedToggleAutoCount())
      .children(model.isAutoCounting ? "Stop" : "Auto-count")
  )
)

export const Counter = CounterDef.make({
  init,
  update,
  subscriptions,
  view
})
