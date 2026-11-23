import { Command, Component, Subscription, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Effect, Schema, Stream } from "effect"

export const CounterMessage = UiSchema.TaggedEnum({
  ClickedIncrement: {},
  ClickedResetAfterDelay: {},
  CompletedDelayReset: {},
  ClickedToggleAutoCount: {},
  Ticked: {}
})

export const DelayReset = Command.make(
  "DelayReset",
  { args: {} },
  () => Effect.sleep("1 second").pipe(Effect.as(CounterMessage.CompletedDelayReset()))
)

export const Counter = Component.define({
  name: "Counter",
  // Required, with no default. false discards the Model when no longer rendered.
  scoped: false,
  model: Schema.Struct({ count: Schema.Number, isAutoCounting: Schema.Boolean }),
  message: CounterMessage,
  // Selects h's element builders; defaults to the app's registered vocabulary.
  elements: Html
}).make({
  init: () => ({ count: 0, isAutoCounting: false }),
  update: {
    ClickedIncrement: ($) => $.evolve({ count: (count) => count + 1 }),
    ClickedResetAfterDelay: ($) => $.run(DelayReset.make({})),
    CompletedDelayReset: ($) => $.evolve({ count: 0 }),
    ClickedToggleAutoCount: ($) => $.evolve({ isAutoCounting: (isAutoCounting) => !isAutoCounting }),
    Ticked: ($) => $.evolve({ count: (count) => count + 1 })
  },
  subscriptions: ({ model }) => [
    model.isAutoCounting &&
    Subscription.make("tick", Stream.tick("1 second").pipe(Stream.drop(1), Stream.map(() => CounterMessage.Ticked())))
  ],
  view: (h, model) =>
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
})
