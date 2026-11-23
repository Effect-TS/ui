import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { Counter } from "./Counter.ts"

const PageMessage = UiSchema.TaggedEnum({
  ClickedToggleCounter: {}
})

export const Page = Component.define({
  name: "Page",
  scoped: false,
  model: Schema.Struct({ isCounterShown: Schema.Boolean }),
  message: PageMessage,
  elements: Html
}).make({
  init: () => ({ isCounterShown: true }),
  update: {
    ClickedToggleCounter: (model) => ({ isCounterShown: !model.isCounterShown })
  },
  view: (model, h) =>
    h.div.class("counter-page").children(
      h.button.onClick(PageMessage.ClickedToggleCounter()).children(
        model.isCounterShown ? "Hide counter" : "Show counter"
      ),
      model.isCounterShown && h.scoped((s) => Counter(s, { key: "counter" }))
    )
})
