import { UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { Counter } from "./Counter.ts"

const PageMessage = UiSchema.TaggedEnum({
  ClickedToggleCounter: {}
})

export const Page = Html.component({
  name: "Page",
  model: Schema.Struct({ isCounterShown: Schema.Boolean }),
  message: PageMessage
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
      // To render two Counters here, give each one a key.
      model.isCounterShown &&
        Counter(h, { props: { label: "Likes" } })
    )
})
