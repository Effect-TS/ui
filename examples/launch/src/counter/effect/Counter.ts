import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

const CounterMessage = UiSchema.TaggedEnum({
  ClickedDecrement: {},
  ClickedIncrement: {}
})

export const Counter = Component.define({
  name: "Counter",
  // What the parent passes in. init and update read it as $.props
  // and view as h.props. In Foldkit 0.x, viewInputs went to view
  // alone.
  props: Schema.Struct({ label: Schema.String }),
  model: Schema.Struct({ count: Schema.Number }),
  message: CounterMessage,
  elements: Html
}).make({
  init: () => ({ count: 0 }),
  update: {
    // A handler can also return the next Model as a plain value.
    ClickedDecrement: ($) => ({ count: $.model.count - 1 }),
    ClickedIncrement: ($) => ({ count: $.model.count + 1 })
  },
  view: (h, model) =>
    h.div.class("counter").children(
      h.span.class("counter-label").children(h.props.label),
      h.button
        .class("counter-button")
        .attr("aria-label", "Decrement")
        .onClick(CounterMessage.ClickedDecrement())
        .children("-"),
      h.output.class("counter-value").children(String(model.count)),
      h.button
        .class("counter-button")
        .attr("aria-label", "Increment")
        .onClick(CounterMessage.ClickedIncrement())
        .children("+")
    )
})
