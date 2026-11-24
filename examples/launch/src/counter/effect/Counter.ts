import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

const CounterMessage = UiSchema.TaggedEnum({
  ClickedDecrement: {},
  ClickedIncrement: {}
})

const button = [
  "min-w-9 cursor-pointer rounded-md border border-border-strong",
  "bg-background px-3 py-1.5 text-control font-medium",
  "transition-[border-color] hover:border-foreground"
].join(" ")

export const Counter = Component.define({
  name: "Counter",
  props: Schema.Struct({ label: Schema.String }),
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
    h.div.class("inline-flex flex-wrap items-center gap-2").children(
      h.span.class("font-medium").children(h.props.label),
      h.button
        .class(button)
        .attr("aria-label", "Decrement")
        .onClick(CounterMessage.ClickedDecrement())
        .children("-"),
      h.output.class(
        "min-w-[3ch] text-center font-mono text-lg",
        "font-semibold tabular-nums"
      ).children(String(model.count)),
      h.button
        .class(button)
        .attr("aria-label", "Increment")
        .onClick(CounterMessage.ClickedIncrement())
        .children("+")
    )
})
