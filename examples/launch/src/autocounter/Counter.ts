import {
  Command,
  Component,
  Subscription,
  UiSchema
} from "@effect/ui"
import { Button } from "@effect/ui-kit"
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

export const button = [
  "min-w-9 cursor-pointer rounded-md border border-border-strong",
  "bg-background px-3 py-1.5 text-control font-medium",
  "transition-[border-color] hover:border-foreground"
].join(" ")

export const Counter = Component.define({
  name: "Counter",
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
    h.div.class("inline-flex flex-wrap items-center gap-2").children(
      h.output.class(
        "min-w-[3ch] text-center font-mono text-lg",
        "font-semibold tabular-nums"
      ).children(String(model.count)),
      Button(h, { onPress: CounterMessage.ClickedIncrement() })
        .class(button).children("Increment"),
      Button(h, { onPress: CounterMessage.ClickedResetAfterDelay() })
        .class(button).children(
          // True while a DelayReset Command is running. The runtime
          // tracks that, so the Model doesn't need a flag for it.
          h.isRunning(DelayReset) ? "Resetting" : "Reset in 1 second"
        ),
      Button(h, { onPress: CounterMessage.ClickedToggleAutoCount() })
        .class(button).children(
          model.isAutoCounting ? "Stop" : "Auto-count"
        )
    )
})
