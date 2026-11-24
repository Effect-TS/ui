import { Component, UiSchema } from "@effect/ui"
import { Collapsible } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"

export const Message = UiSchema.TaggedEnum({
  ToggledAnswer: { open: Schema.Boolean }
})

export const Faq = Component.define({
  name: "Faq",
  model: Schema.Struct({ isAnswerOpen: Schema.Boolean }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ isAnswerOpen: false }),
  update: {
    ToggledAnswer: ($, { open }) => $.evolve({ isAnswerOpen: open })
  },
  view: (h, model) =>
    Collapsible(h, {
      props: { open: model.isAnswerOpen },
      onEmit: {
        Toggled: ({ open }) => Message.ToggledAnswer({ open }),
        Settled: () => undefined
      },
      view: (collapsible) =>
        collapsible.root(h.div.class("faq")).children(
          collapsible.trigger(h.button.class("faq-question"))
            .children("Can I return an order?"),
          collapsible.panel(h.div.class("faq-answer"))
            ?.children("Yes, within 30 days.")
        )
    })
})
