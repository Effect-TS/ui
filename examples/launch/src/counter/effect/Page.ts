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
    ClickedToggleCounter: ($) => ({
      isCounterShown: !$.model.isCounterShown
    })
  },
  view: (h, model) =>
    h.div.class("grid justify-items-start gap-3").children(
      h.button
        .onClick(PageMessage.ClickedToggleCounter())
        .children(
          model.isCounterShown ? "Hide counter" : "Show counter"
        ),
      model.isCounterShown &&
        Counter(h, { props: { label: "Likes" } })
    )
})
