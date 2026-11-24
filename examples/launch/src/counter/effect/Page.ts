import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { Counter } from "./Counter.ts"

const PageMessage = UiSchema.TaggedEnum({
  ClickedToggleCounter: {}
})

export const Page = Component.define({
  name: "Page",
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
    h.div.class("counter-page").children(
      h.button
        .onClick(PageMessage.ClickedToggleCounter())
        .children(
          model.isCounterShown ? "Hide counter" : "Show counter"
        ),
      // Calling a Component in the view renders it as a child. The
      // runtime holds its Model until the view stops rendering it.
      // Two Counters here would each take a key, as with slotId.
      model.isCounterShown &&
        Counter(h, { props: { label: "Likes" } })
    )
})
