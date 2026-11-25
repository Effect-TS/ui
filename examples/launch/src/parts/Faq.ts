import { UiSchema } from "@effect/ui"
import { Collapsible } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

export const Message = UiSchema.TaggedEnum({
  ToggledAnswer: { open: Schema.Boolean }
})

export const Faq = Html.component({
  name: "Faq",
  model: Schema.Struct({ isAnswerOpen: Schema.Boolean }),
  message: Message
}).make({
  init: () => ({ isAnswerOpen: false }),
  update: {
    ToggledAnswer: ($, { open }) => $.evolve({ isAnswerOpen: open })
  },
  view: (h, model) =>
    Collapsible(h, {
      props: { open: model.isAnswerOpen },
      // Maps each event Collapsible emits to one of Faq's Messages,
      // or to undefined to ignore it. Events are what Foldkit 0.x
      // called OutMessages.
      onEmit: {
        Toggled: ({ open }) => Message.ToggledAnswer({ open }),
        Settled: () => undefined
      },
      // Each part returns the builder it is given with its attributes
      // and handlers added. panel returns undefined once closed.
      view: (collapsible) =>
        collapsible.root(h.div.class("faq")).children(
          collapsible.trigger(h.button.class("faq-question"))
            .children("Can I return an order?"),
          collapsible.panel(h.div.class("faq-answer"))
            ?.children("Yes, within 30 days.")
        )
    })
})
