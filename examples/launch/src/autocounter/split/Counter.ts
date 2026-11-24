import { Component, Subscription } from "@effect/ui"
import { Button } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema, Stream } from "effect"
import { CounterMessage, DelayReset } from "../Counter.ts"

// The definition: the name and the Schemas. Its init, update,
// subscriptions and view helpers type the functions below.
const CounterDef = Component.define({
  name: "Counter",
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

// update as one function that matches on the Message, as in
// Foldkit 0.x, instead of a record of handlers.
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
    h.output.class("counter-value").children(String(model.count)),
    Button(h, { onPress: CounterMessage.ClickedIncrement() })
      .class("counter-button counter-increment")
      .children("Increment"),
    Button(h, {
      props: { disabled: h.isRunning(DelayReset) },
      onPress: CounterMessage.ClickedResetAfterDelay()
    }).class("counter-button counter-reset").children(
      h.isRunning(DelayReset) ? "Resetting" : "Reset in 1 second"
    ),
    Button(h, { onPress: CounterMessage.ClickedToggleAutoCount() })
      .class(
        "counter-button",
        model.isAutoCounting ? "counter-stop" : "counter-start"
      ).children(model.isAutoCounting ? "Stop" : "Auto-count")
  )
)

export const Counter = CounterDef.make({
  init,
  update,
  subscriptions,
  view
})
