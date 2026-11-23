import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

const CounterMessage = UiSchema.TaggedEnum({
  ClickedDecrement: {},
  ClickedIncrement: {}
})

export const Counter = Component.define({
  name: "Counter",
  scoped: false,
  model: Schema.Struct({ count: Schema.Number }),
  message: CounterMessage,
  elements: Html
}).make({
  init: () => ({ count: 0 }),
  update: {
    ClickedDecrement: ($) => ({ count: $.model.count - 1 }),
    ClickedIncrement: ($) => ({ count: $.model.count + 1 })
  },
  view: (h, model) =>
    h.div.class("counter").children(
      h.button.attr("aria-label", "Decrement").onClick(CounterMessage.ClickedDecrement()).children("-"),
      h.output.class("count").children(String(model.count)),
      h.button.attr("aria-label", "Increment").onClick(CounterMessage.ClickedIncrement()).children("+")
    )
})
