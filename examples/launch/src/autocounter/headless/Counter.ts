import { Component, Subscription } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema, Stream } from "effect"
import { CounterMessage, DelayReset } from "../Counter.ts"

export const Counter = Component.define({
  name: "Counter",
  scoped: false,
  model: Schema.Struct({ count: Schema.Number, isAutoCounting: Schema.Boolean }),
  message: CounterMessage,
  elements: Html
}).make({
  init: () => ({ count: 0, isAutoCounting: false }),
  update: {
    ClickedIncrement: (_model, _message, $) => $.evolve({ count: (count) => count + 1 }),
    ClickedResetAfterDelay: (_model, _message, $) => $.run(DelayReset.make({})),
    CompletedDelayReset: (_model, _message, $) => $.evolve({ count: 0 }),
    ClickedToggleAutoCount: (_model, _message, $) => $.evolve({ isAutoCounting: (isAutoCounting) => !isAutoCounting }),
    Ticked: (_model, _message, $) => $.evolve({ count: (count) => count + 1 })
  },
  subscriptions: (model) => [
    model.isAutoCounting &&
    Subscription.make("tick", Stream.tick("1 second").pipe(Stream.drop(1), Stream.map(() => CounterMessage.Ticked())))
  ],
  parts: (model, p) => ({
    count: model.count,
    isAutoCounting: model.isAutoCounting,
    increment: p.part("button", (b) => b.onClick(CounterMessage.ClickedIncrement())),
    toggleAutoCount: p.part(
      "button",
      (b) => b.attr("aria-pressed", String(model.isAutoCounting)).onClick(CounterMessage.ClickedToggleAutoCount())
    )
  })
})
