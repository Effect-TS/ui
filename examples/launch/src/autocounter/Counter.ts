import { Command, Subscription, UiSchema } from "@effect/ui"
import { Button } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Effect, Schema, Stream } from "effect"

// A Schema union with a constructor for each Message, like Foldkit
// 0.x's defineMessageUnion. A Message's fields are its payload:
// ClickedAdd carries the amount to add.
export const CounterMessage = UiSchema.TaggedEnum({
  ClickedAdd: { amount: Schema.Number },
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

// Html.component defines a Component whose view builds HTML
// elements, such as h.div.
export const Counter = Html.component({
  name: "Counter",
  model: Schema.Struct({
    count: Schema.Number,
    isAutoCounting: Schema.Boolean
  }),
  message: CounterMessage
}).make({
  init: () => ({ count: 0, isAutoCounting: false }),
  // A handler per Message. $ holds the current Model and builds
  // the result: $.evolve changes the fields it names, and $.run
  // issues a Command. Foldkit 0.x returned { model, commands }.
  update: {
    // The Message's payload is the handler's second argument.
    ClickedAdd: ($, { amount }) =>
      $.evolve({ count: (count) => count + amount }),
    // $.run keeps the Model as it is and runs the Command. In
    // Foldkit 0.x, update returned { model, commands } instead.
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
      Button(h, { onPress: CounterMessage.ClickedAdd({ amount: 1 }) })
        .class("counter-button counter-add")
        .children("+1"),
      Button(h, { onPress: CounterMessage.ClickedAdd({ amount: 5 }) })
        .class("counter-button counter-add")
        .children("+5"),
      Button(h, {
        props: {
          // h.isRunning is true while a DelayReset Command is
          // running. The runtime tracks that, so the Model doesn't
          // need a flag for it.
          disabled: h.isRunning(DelayReset),
          // Keeps keyboard focus on the button while it's disabled.
          focusableWhenDisabled: true
        },
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
})
