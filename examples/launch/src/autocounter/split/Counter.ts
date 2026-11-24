import { Component, Subscription } from "@effect/ui"
import { Button } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema, Stream } from "effect"
import { button, CounterMessage, DelayReset } from "../Counter.ts"

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
  h.div.class("inline-flex flex-wrap items-center gap-2").children(
    h.output.class(
      "min-w-[3ch] text-center font-mono text-lg",
      "font-semibold tabular-nums"
    ).children(String(model.count)),
    Button(h, { onPress: CounterMessage.ClickedIncrement() })
      .class(button).children("Increment"),
    Button(h, { onPress: CounterMessage.ClickedResetAfterDelay() })
      .class(button).children(
        h.isRunning(DelayReset) ? "Resetting" : "Reset in 1 second"
      ),
    Button(h, { onPress: CounterMessage.ClickedToggleAutoCount() })
      .class(button).children(
        model.isAutoCounting ? "Stop" : "Auto-count"
      )
  )
)

export const Counter = CounterDef.make({
  init,
  update,
  subscriptions,
  view
})
