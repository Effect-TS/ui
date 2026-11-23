import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { Panel } from "./Panel.ts"

const CounterPanelMessage = UiSchema.TaggedEnum({ ClickedIncrement: {} })

export const CounterPanel = Component.define({
  name: "CounterPanel",
  scoped: false,
  props: Panel.props,
  model: Schema.Struct({ count: Schema.Number }),
  message: CounterPanelMessage,
  elements: Html
}).make({
  init: () => ({ count: 0 }),
  update: {
    ClickedIncrement: (model) => ({ count: model.count + 1 })
  },
  view: (model, h) =>
    h.div.class("counter").children(
      h.output.class("count").children(String(model.count)),
      h.button.attr("aria-label", "Increment").onClick(CounterPanelMessage.ClickedIncrement()).children("+")
    )
})
