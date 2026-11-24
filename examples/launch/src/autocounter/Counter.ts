import {
  Command,
  Component,
  Subscription,
  UiSchema
} from "@effect/ui"
import { Button } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Effect, Schema, Stream } from "effect"

// A Schema union with a constructor for each Message, like Foldkit
// 0.x's defineMessageUnion.
export const CounterMessage = UiSchema.TaggedEnum({
  ClickedIncrement: {},
  ClickedResetAfterDelay: {},
  CompletedDelayReset: {},
  ClickedToggleAutoCount: {},
  Ticked: {}
})

// Defines a Command: its name, the Schema fields of its args (none
// here) and its body. DelayReset.make({}) creates one to run, and
// the Message its Effect returns goes to update.
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
  model: Schema.Struct({
    count: Schema.Number,
    isAutoCounting: Schema.Boolean
  }),
  message: CounterMessage,
  // The vocabulary: which elements h offers in view, such as h.div.
  // HTML isn't built into the core, so the Component names it here.
  // An app that imports "@effect/ui/html/register" can omit this.
  elements: Html
}).make({
  init: () => ({ count: 0, isAutoCounting: false }),
  // A handler per Message. $ holds the current Model and builds
  // the result: $.evolve changes the fields it names, and $.run
  // issues a Command. Foldkit 0.x returned { model, commands }.
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
  // Called on mount and after each update. A Subscription's
  // Stream runs while its key, "tick", is listed, and each value
  // it emits is sent as a Message. A false entry is skipped.
  subscriptions: ({ model }) => [
    model.isAutoCounting &&
    Subscription.make(
      "tick",
      Stream.tick("1 second").pipe(
        // Stream.tick emits once at the start. Skip that one.
        Stream.drop(1),
        Stream.map(() => CounterMessage.Ticked())
      )
    )
  ],
  view: (h, model) =>
    h.div.class("counter").children(
      h.output.class("counter-value").children(String(model.count)),
      // Button is a view function from the UI kit, not a Component.
      // It returns a <button> builder, and a press sends onPress.
      Button(h, { onPress: CounterMessage.ClickedIncrement() })
        .class("counter-button counter-increment")
        .children("Increment"),
      Button(h, {
        // True while a DelayReset Command is running. The runtime
        // tracks that, so the Model doesn't need a flag for it.
        props: { disabled: h.isRunning(DelayReset) },
        onPress: CounterMessage.ClickedResetAfterDelay()
      }).class("counter-button").children(
        h.isRunning(DelayReset) ? "Resetting" : "Reset in 1 second"
      ),
      Button(h, { onPress: CounterMessage.ClickedToggleAutoCount() })
        .class(
          "counter-button",
          model.isAutoCounting ? "counter-stop" : "counter-start"
        ).children(model.isAutoCounting ? "Stop" : "Auto-count")
    )
})
