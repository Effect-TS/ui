import {
  Command,
  Component,
  Subscription,
  UiSchema
} from "@effect/ui"
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
  () =>
    Effect.sleep("1 second").pipe(
      Effect.as(CounterMessage.CompletedDelayReset())
    )
)

export const Counter = Component.define({
  name: "Counter",
  // Required, with no default. When false, the Model is discarded
  // when the Component is no longer rendered. When true, the Model
  // is kept, so the Component is as the user left it when it's
  // rendered again. Use true for anything the user should find as
  // they left it after it goes out of view, such as a half-filled
  // form in an inactive tab, a wizard step or a list row hidden by
  // a filter.
  scoped: false,
  model: Schema.Struct({
    count: Schema.Number,
    isAutoCounting: Schema.Boolean
  }),
  message: CounterMessage,
  // The vocabulary: the element builders on h, such as h.div. Html
  // is the one for HTML. Optional when the app registers a default
  // by importing "@effect/ui/html/register".
  elements: Html
}).make({
  init: () => ({ count: 0, isAutoCounting: false }),
  update: {
    ClickedIncrement: ($) =>
      $.evolve({ count: (count) => count + 1 }),
    ClickedResetAfterDelay: ($) => $.run(DelayReset.make({})),
    CompletedDelayReset: ($) => $.evolve({ count: 0 }),
    ClickedToggleAutoCount: ($) =>
      $.evolve({
        isAutoCounting: (isAutoCounting) => !isAutoCounting
      }),
    Ticked: ($) => $.evolve({ count: (count) => count + 1 })
  },
  subscriptions: ({ model }) => [
    model.isAutoCounting &&
    Subscription.make(
      "tick",
      Stream.tick("1 second").pipe(
        Stream.drop(1),
        Stream.map(() => CounterMessage.Ticked())
      )
    )
  ],
  view: (h, model) =>
    h.div.class("counter").children(
      h.output.class("count").children(String(model.count)),
      h.button
        .onClick(CounterMessage.ClickedIncrement())
        .children("Increment"),
      h.button
        .onClick(CounterMessage.ClickedResetAfterDelay())
        .children(
          // True while a DelayReset Command is running. The runtime
          // tracks that, so the Model doesn't need a flag for it.
          h.isRunning(DelayReset) ? "Resetting" : "Reset in 1 second"
        ),
      h.button
        .onClick(CounterMessage.ClickedToggleAutoCount())
        .children(model.isAutoCounting ? "Stop" : "Auto-count")
    )
})
